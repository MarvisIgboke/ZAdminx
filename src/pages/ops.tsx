import { useMemo, useState } from "react";
import type { CustomerInfo, GpsRec, OpType, PhotoRec } from "../lib/core";
import { age, fmtDate, fmtDT, OPS, STAGES, STATUS_META, TERMINAL } from "../lib/core";
import { useStore } from "../lib/core";
import { BarcodeScanner, snapPhoto } from "../components/workflow";
import { Btn, Card, EmptyState, Field, Icon, Pagination, SectionHead, Select, StatusPill, TextInput, Textarea, TonePill, useRoute } from "../components/ui";

/* ================= List (all five operations) ================= */
const chipDefs: Record<OpType, { label: string; match: (s: string) => boolean }[]> = {
  installation: [
    { label: "Pending EM", match: s => s === "PENDING" },
    { label: "ZVend", match: s => ["WAITING_ZVEND", "ZVEND_SUCCESS", "ZVEND_FAILED"].includes(s) },
    { label: "Assigned / Field", match: s => ["ASSIGNED", "IN_PROGRESS"].includes(s) },
    { label: "Completed", match: s => s === "COMPLETED" },
    { label: "Rejected / Returned", match: s => ["REJECTED", "RETURNED"].includes(s) },
  ],
  activation: [
    { label: "In Review", match: s => s === "PENDING" },
    { label: "ZVend", match: s => ["WAITING_ZVEND", "ZVEND_SUCCESS", "ZVEND_FAILED"].includes(s) },
    { label: "Completed", match: s => s === "COMPLETED" },
    { label: "Rejected / Returned", match: s => ["REJECTED", "RETURNED"].includes(s) },
  ],
  inspection: [
    { label: "Scheduled", match: s => s === "SCHEDULED" },
    { label: "In Field", match: s => s === "IN_PROGRESS" },
    { label: "In Review", match: s => s === "PENDING" },
    { label: "Completed", match: s => s === "COMPLETED" },
    { label: "Rejected", match: s => ["REJECTED", "RETURNED"].includes(s) },
  ],
  tamper: [
    { label: "Pending", match: s => s === "PENDING" },
    { label: "ZVend", match: s => ["WAITING_ZVEND", "ZVEND_SUCCESS", "ZVEND_FAILED"].includes(s) },
    { label: "Completed", match: s => s === "COMPLETED" },
  ],
  clear: [
    { label: "Pending", match: s => s === "PENDING" },
    { label: "ZVend", match: s => ["WAITING_ZVEND", "ZVEND_SUCCESS", "ZVEND_FAILED"].includes(s) },
    { label: "Completed", match: s => s === "COMPLETED" },
  ],
};

export function OperationListPage({ type }: { type: OpType }) {
  const { state, user, can } = useStore();
  const { nav } = useRoute();
  const [q, setQ] = useState(""); const [status, setStatus] = useState("ALL"); const [fac, setFac] = useState("ALL"); const [page, setPage] = useState(1);
  const PER = 8;
  const ops = useMemo(() => state.operations.filter(o => o.type === type), [state.operations, type]);
  const filtered = ops.filter(o => {
    const s = q.trim().toLowerCase();
    return (!s || o.txn.toLowerCase().includes(s) || o.meterNumber.includes(s) || o.initiatorName.toLowerCase().includes(s))
      && (status === "ALL" || o.status === status) && (fac === "ALL" || o.facilityId === fac);
  });
  const pages = Math.max(1, Math.ceil(filtered.length / PER));
  const rows = filtered.slice((page - 1) * PER, page * PER);
  const meta = OPS[type];
  const newRoute = type === "installation" ? "meter-installation/new" : type === "activation" ? "meter-activation/start" : type === "inspection" ? "meter-inspection/schedule" : `${meta.path}/request`;
  const canNew = can(`${type}.create`);
  const newLabel = type === "installation" ? "New Meter Installation" : type === "activation" ? "Start Activation" : type === "inspection" ? "Schedule Inspection" : `Request ${type === "tamper" ? "Tamper" : "Clear"} Code`;

  return (
    <div className="mx-auto max-w-[1240px]">
      <SectionHead title={meta.label} sub={`${ops.length} records · ${meta.blurb}`} right={canNew ? <Btn variant="volt" icon="plus" onClick={() => nav(newRoute)}>{newLabel}</Btn> : undefined} />
      <div className="mb-4 flex flex-wrap gap-2 anim-rise">
        <button onClick={() => { setStatus("ALL"); setPage(1); }} className={`rounded-lg border px-3 py-1.5 text-[11.5px] font-extrabold transition-colors ${status === "ALL" ? "border-ink bg-ink text-paper" : "border-line bg-card text-ink2 hover:border-ink/40"}`}>Total <span className="ml-1 font-mono tnum">{ops.length}</span></button>
        {chipDefs[type].map(c => (
          <span key={c.label} className="rounded-lg border border-line bg-card px-3 py-1.5 text-[11.5px] font-extrabold text-ink2">{c.label} <span className="ml-1 font-mono text-volt2 tnum">{ops.filter(o => c.match(o.status)).length}</span></span>
        ))}
      </div>
      <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_220px_220px]">
        <div className="relative">
          <Icon name="search" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
          <TextInput value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="Search transaction, meter, initiator…" className="pl-9" />
        </div>
        <Select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
          <option value="ALL">All statuses</option>
          {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </Select>
        <Select value={fac} onChange={e => { setFac(e.target.value); setPage(1); }}>
          <option value="ALL">All facilities</option>
          {state.facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </Select>
      </div>
      <Card className="anim-rise">
        {rows.length === 0 ? (
          <div className="p-5"><EmptyState icon={meta.icon} title={`No ${meta.short.toLowerCase()} records match`} sub={ops.length === 0 ? "Records appear as the workflow produces them." : "Adjust filters or search."} action={canNew ? <Btn variant="primary" icon="plus" onClick={() => nav(newRoute)}>{newLabel}</Btn> : undefined} /></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left">
            <thead><tr className="border-b border-line bg-paper text-[10px] font-extrabold tracking-widest text-mute">
              <th className="px-4 py-2.5">TRANSACTION</th><th className="px-4 py-2.5">METER</th><th className="px-4 py-2.5">FACILITY</th><th className="px-4 py-2.5">INITIATOR</th><th className="px-4 py-2.5">CURRENT STAGE</th><th className="px-4 py-2.5">STATUS</th><th className="px-4 py-2.5">AGE</th>
            </tr></thead>
            <tbody>{rows.map(op => (
              <tr key={op.id} onClick={() => nav(`${meta.path}/${op.id}`)} className="cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-paper">
                <td className="px-4 py-3"><span className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-md bg-ink/6 text-ink2"><Icon name={meta.icon} size={13} /></span><span className="font-mono text-[11.5px] font-bold">{op.txn}</span>{op.pendingSync && <span className="rounded bg-warnsoft px-1 py-px text-[9px] font-extrabold text-warn">QUEUED</span>}</span></td>
                <td className="px-4 py-3 font-mono text-[11.5px] text-ink2">{op.meterNumber}</td>
                <td className="px-4 py-3 text-[12px] font-semibold">{state.facilities.find(f => f.id === op.facilityId)?.name ?? "—"}</td>
                <td className="px-4 py-3"><p className="text-[12px] font-bold">{op.initiatorName}</p><p className="text-[9.5px] font-bold tracking-wider text-mute">{op.initiatorRole.replace(/_/g, " ")}</p></td>
                <td className="px-4 py-3 text-[11.5px] font-semibold text-mute">{STAGES[op.type][Math.min(op.stageIdx, STAGES[op.type].length - 1)].label}</td>
                <td className="px-4 py-3"><StatusPill status={op.status} pulse={!TERMINAL.includes(op.status)} /></td>
                <td className="px-4 py-3 font-mono text-[11px] text-mute">{age(op.createdAt)}</td>
              </tr>))}</tbody>
          </table></div>
        )}
        <div className="px-4 pb-3"><Pagination page={page} pages={pages} onPage={setPage} /></div>
      </Card>
      {user && !canNew && <p className="mt-3 flex items-center gap-2 text-[11.5px] font-semibold text-mute"><Icon name="lock" size={13} /> Your role has read access — initiation is permission-gated.</p>}
    </div>
  );
}

function BackLink({ to, label }: { to: string; label: string }) {
  const { nav } = useRoute();
  return <button onClick={() => nav(to)} className="mb-3 flex items-center gap-1.5 text-[12px] font-extrabold text-mute transition-colors hover:text-ink"><Icon name="chevL" size={14} /> {label}</button>;
}
function GateNote({ text, onBack }: { text: string; onBack: () => void }) {
  return (
    <div className="mx-auto max-w-xl">
      <Card className="anim-rise p-6 text-center">
        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-warnsoft text-warn"><Icon name="lock" size={20} /></span>
        <h1 className="font-display text-[17px] font-bold">Not available for your role</h1>
        <p className="mx-auto mt-1.5 max-w-md text-[12.5px] text-mute">{text}</p>
        <Btn variant="outline" icon="chevL" className="mt-4" onClick={onBack}>Back to list</Btn>
      </Card>
    </div>
  );
}

/* ================= New installation (Secretary) ================= */
export function NewInstallationPage() {
  const { state, createInstallation, user } = useStore();
  const { nav } = useRoute();
  const [meter, setMeter] = useState(""); const [facilityId, setFacilityId] = useState(state.facilities[0]?.id ?? ""); const [comment, setComment] = useState("");
  const [errs, setErrs] = useState<Record<string, string>>({});
  if (user && user.role !== "SECRETARY" && user.role !== "SUPER_ADMIN")
    return <GateNote text="Meter Installation is initiated by the Secretary. The new meter is not checked against ZVend at initiation — ZVend registration happens only after MD approval." onBack={() => nav("meter-installation")} />;
  const submit = () => {
    const e: Record<string, string> = {};
    if (!meter.trim()) e.meter = "Meter number is required.";
    else if (!/^\d+$/.test(meter.trim())) e.meter = "Numerals only.";
    else if (state.meters.some(m => m.number === meter.trim())) e.meter = "This meter number already exists.";
    if (!facilityId) e.facility = "Facility is required.";
    setErrs(e);
    if (Object.keys(e).length) return;
    const op = createInstallation({ meterNumber: meter, facilityId, comment });
    if (op) nav(`meter-installation/${op.id}`);
  };
  return (
    <div className="mx-auto max-w-xl">
      <BackLink to="meter-installation" label="Meter Installation" />
      <Card className="anim-rise p-5">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-volt text-ink"><Icon name="wrench" size={17} /></span>
          <div><h1 className="font-display text-[18px] font-bold leading-tight">New Meter Installation</h1><p className="text-[11.5px] text-mute">The meter is NEW — no ZVend check at initiation. Chain: EM → GM → MD → ZVend → Secretary → Technical Man.</p></div>
        </div>
        <div className="space-y-3.5">
          <Field label="Meter number" error={errs.meter} hint="Numerals only. Duplicate numbers are rejected immediately.">
            <TextInput value={meter} onChange={e => setMeter(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 45039813401" className="font-mono" />
          </Field>
          <Field label="Facility" error={errs.facility}>
            <Select value={facilityId} onChange={e => setFacilityId(e.target.value)}>{state.facilities.map(f => <option key={f.id} value={f.id}>{f.name} · {f.code}</option>)}</Select>
          </Field>
          <Field label="Secretary comment"><Textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Context for the approvers…" /></Field>
          <Btn variant="volt" icon="arrowR" size="lg" className="w-full" onClick={submit}>SUBMIT TO ENERGY MANAGER</Btn>
        </div>
      </Card>
    </div>
  );
}

/* ================= Tamper / Clear request ================= */
export function RequestCodePage({ type }: { type: "tamper" | "clear" }) {
  const { state, requestCode, user } = useStore();
  const { nav } = useRoute();
  const [meter, setMeter] = useState(""); const [facilityId, setFacilityId] = useState(""); const [comment, setComment] = useState("");
  const [scanOpen, setScanOpen] = useState(false); const [err, setErr] = useState("");
  const isTech = user?.role === "TECHNICAL_MAN";
  const label = type === "tamper" ? "Tamper" : "Clear";
  const facOfMeter = state.meters.find(m => m.number === meter.trim())?.facilityId;
  const handleScan = (raw: string) => {
    setScanOpen(false);
    const code = raw.replace(/\D/g, "");
    if (!code) return;
    const hit = state.meters.find(m => code.includes(m.number) || m.number.includes(code));
    if (hit) { setMeter(hit.number); setFacilityId(hit.facilityId); setErr(""); }
    else { setMeter(code); setErr("The scanned number is not in the meter registry — verify the digits or select the facility manually."); }
  };
  const submit = () => {
    if (!/^\d+$/.test(meter.trim())) { setErr("Enter a numeric meter number."); return; }
    const fac = facOfMeter || facilityId;
    if (!fac) { setErr("Select the facility for this meter."); return; }
    const op = requestCode(type, { meterNumber: meter, facilityId: fac, via: isTech ? "scan" : "manual", comment });
    if (op) nav(`${OPS[type].path}/${op.id}`);
  };
  return (
    <div className="mx-auto max-w-xl">
      <BackLink to={OPS[type].path} label={`${label} Code`} />
      <Card className="anim-rise p-5">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-volt text-ink"><Icon name={type === "tamper" ? "shield" : "key"} size={17} /></span>
          <div><h1 className="font-display text-[18px] font-bold leading-tight">Request {label} Code</h1><p className="text-[11.5px] text-mute">{isTech ? "Barcode scan initiation" : "Manual entry initiation"} · EM → GM → MD → ZVend → delivery confirmation.</p></div>
        </div>
        <div className="space-y-3.5">
          {isTech && <Btn variant="primary" icon="camera" className="w-full" onClick={() => setScanOpen(true)}>Scan meter barcode</Btn>}
          <Field label="Meter number" error={err || undefined}>
            <TextInput value={meter} onChange={e => { setMeter(e.target.value.replace(/\D/g, "")); setErr(""); }} placeholder="e.g. 45039812990" className="font-mono" />
          </Field>
          <Field label="Facility" hint={facOfMeter ? "Auto-matched from meter registry." : undefined}>
            <Select value={facOfMeter || facilityId} onChange={e => setFacilityId(e.target.value)} disabled={!!facOfMeter}>
              <option value="">Select facility…</option>
              {state.facilities.map(f => <option key={f.id} value={f.id}>{f.name} · {f.code}</option>)}
            </Select>
          </Field>
          <Field label="Reason / comment"><Textarea value={comment} onChange={e => setComment(e.target.value)} placeholder={type === "tamper" ? "Why is the tamper code needed?" : "Why is the clear code needed?"} /></Field>
          <Btn variant="volt" icon="arrowR" size="lg" className="w-full" onClick={submit}>SUBMIT TO ENERGY MANAGER</Btn>
        </div>
      </Card>
      {scanOpen && <BarcodeScanner title={`Scan meter · ${label} Code`} hint="The read auto-fills the meter number and matches its facility from the registry." onClose={() => setScanOpen(false)} onDetect={handleScan} />}
    </div>
  );
}

/* ================= Start activation (Technical Man) — REAL CAMERA ================= */
export function StartActivationPage() {
  const { state, createActivation, user } = useStore();
  const { nav } = useRoute();
  const [meter, setMeter] = useState("");
  const [scanState, setScanState] = useState<"idle" | "ok" | "bad">("idle");
  const [scanOpen, setScanOpen] = useState(false);
  const [scannedCode, setScannedCode] = useState("");
  const [gps, setGps] = useState<GpsRec | null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [photos, setPhotos] = useState<PhotoRec[]>([]);
  const [cust, setCust] = useState<CustomerInfo>({ name: "", phone: "", email: "", address: "" });
  const [comment, setComment] = useState("");
  const [err, setErr] = useState("");
  if (user && user.role !== "TECHNICAL_MAN" && user.role !== "SUPER_ADMIN")
    return <GateNote text="Meter Activation is initiated by the Technical Man after physical installation. The Secretary cannot initiate activations." onBack={() => nav("meter-activation")} />;
  const installed = state.meters.filter(m => m.status === "INSTALLED");
  const fac = state.meters.find(m => m.number === meter)?.facilityId ?? "";
  const facility = state.facilities.find(f => f.id === fac);
  const maxAcc = state.settings.maxGpsAccuracyM;

  const handleScan = (raw: string) => {
    const code = raw.replace(/\D/g, "");
    setScanOpen(false);
    if (!code) return;
    setScannedCode(code);
    const hit = installed.find(m => code.includes(m.number) || m.number.includes(code));
    if (hit && (!meter || hit.number === meter)) { setMeter(hit.number); setScanState("ok"); setErr(""); }
    else setScanState("bad");
  };
  const captureGps = () => {
    setGpsBusy(true);
    setTimeout(() => {
      const acc = Math.round(5 + Math.random() * 22);
      setGps({ lat: +((facility?.lat ?? 6.45) + (Math.random() - 0.5) * 0.0016).toFixed(6), lng: +((facility?.lng ?? 3.55) + (Math.random() - 0.5) * 0.0016).toFixed(6), accuracy: acc, at: Date.now(), accepted: acc <= maxAcc });
      setGpsBusy(false);
    }, 1400);
  };
  const snap = (label: string) => setPhotos(p => [...p, { id: Math.random().toString(36).slice(2), label, dataUrl: snapPhoto(label, meter, gps?.lat, gps?.lng), at: Date.now(), lat: gps?.lat, lng: gps?.lng }]);
  const submit = () => {
    if (!meter) { setErr("Scan or select the meter to activate."); return; }
    if (scanState !== "ok") { setErr("Barcode verification must show METER VERIFIED."); return; }
    if (!gps || !gps.accepted) { setErr(`GPS capture within ±${maxAcc} m is required.`); return; }
    if (photos.length < 4) { setErr(`Capture all 4 photos (${photos.length}/4).`); return; }
    if (!cust.name.trim() || !cust.phone.trim()) { setErr("Customer name and phone are required."); return; }
    const op = createActivation({ meterNumber: meter, facilityId: fac, customer: cust, gps, photos, scan: { value: meter, matched: true, at: Date.now() }, comment });
    if (op) nav(`meter-activation/${op.id}`);
  };
  const Step = ({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) => (
    <div className={`anim-rise rounded-xl border p-4 ${done ? "border-[#c2ddcd]" : "border-line"} bg-card`}>
      <div className="mb-3 flex items-center gap-2">
        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-extrabold ${done ? "bg-ok text-white" : "bg-ink text-paper"}`}>{done ? <Icon name="check" size={12} /> : n}</span>
        <p className="font-display text-[14px] font-bold">{title}</p>
      </div>
      {children}
    </div>
  );
  return (
    <div className="mx-auto max-w-2xl">
      <BackLink to="meter-activation" label="Meter Activation" />
      <div className="mb-4">
        <h1 className="font-display text-[22px] font-bold tracking-tight">Start Activation</h1>
        <p className="text-[12.5px] text-mute">Chain after submission: Secretary → EM → GM → MD → ZVend → Secretary → completion to you.</p>
      </div>
      <div className="space-y-3.5">
        <Step n={1} title="Meter & barcode verification" done={scanState === "ok"}>
          <div className="grid gap-2.5 sm:grid-cols-[1fr_auto]">
            <Select value={meter} onChange={e => { setMeter(e.target.value); setScanState("idle"); }}>
              <option value="">Select installed meter…</option>
              {installed.map(m => <option key={m.number} value={m.number}>{m.number} · {state.facilities.find(f => f.id === m.facilityId)?.name}</option>)}
            </Select>
            <Btn variant="primary" icon="camera" onClick={() => setScanOpen(true)}>Scan barcode</Btn>
          </div>
          {installed.length === 0 && <p className="mt-2 text-[11.5px] font-bold text-warn">No INSTALLED meters available — complete an installation first.</p>}
          {scanState === "ok" && <p className="anim-rise mt-2 flex items-center gap-1.5 text-[12px] font-extrabold text-ok"><Icon name="check" size={13} /> METER VERIFIED · {meter}</p>}
          {scanState === "bad" && <p className="anim-rise mt-2 flex items-center gap-1.5 rounded-lg border border-[#eac5be] bg-dangersoft px-2.5 py-1.5 text-[12px] font-extrabold text-danger"><Icon name="alert" size={13} /> METER NUMBER MISMATCH · read “{scannedCode}”{meter ? ` ≠ ${meter}` : " — not an authorized installed meter"}. Re-scan.</p>}
          {facility && <p className="mt-1.5 text-[11px] font-semibold text-mute">Facility: {facility.name}</p>}
        </Step>
        <Step n={2} title={`GPS capture (limit ±${maxAcc} m)`} done={!!gps && gps.accuracy <= maxAcc}>
          {gps && gps.accuracy <= maxAcc
            ? <p className="flex items-center gap-2 font-mono text-[12px] font-bold text-ok"><Icon name="pin" size={14} /> {gps.lat}, {gps.lng} · ±{gps.accuracy} m</p>
            : <Btn variant="primary" icon="pin" loading={gpsBusy} onClick={captureGps}>Capture GPS</Btn>}
          {gps && gps.accuracy > maxAcc && <p className="mt-2 text-[11.5px] font-extrabold text-danger">±{gps.accuracy} m exceeds the ±{maxAcc} m ceiling — rejected.</p>}
        </Step>
        <Step n={3} title="Photographs (4 required)" done={photos.length >= 4}>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {["Meter Front", "Meter Installation", "Meter Barcode", "Environment"].map(l => {
              const p = photos.find(x => x.label === l);
              return p ? <img key={l} src={p.dataUrl} alt={l} className="aspect-[4/3] w-full rounded-lg border border-line object-cover" />
                : <button key={l} onClick={() => snap(l)} className="flex aspect-[4/3] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line2 bg-paper transition-colors hover:border-volt hover:bg-voltsoft">
                  <Icon name="camera" size={16} className="text-mute" /><span className="px-1 text-center text-[9.5px] font-extrabold text-ink2">{l}</span>
                </button>;
            })}
          </div>
        </Step>
        <Step n={4} title="Customer information" done={!!cust.name.trim() && !!cust.phone.trim()}>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Field label="Full name"><TextInput value={cust.name} onChange={e => setCust({ ...cust, name: e.target.value })} placeholder="e.g. John Joe" /></Field>
            <Field label="Phone"><TextInput value={cust.phone} onChange={e => setCust({ ...cust, phone: e.target.value })} placeholder="0803 000 0000" /></Field>
            <Field label="Email"><TextInput value={cust.email} onChange={e => setCust({ ...cust, email: e.target.value })} placeholder="name@mail.com" /></Field>
            <Field label="Address"><TextInput value={cust.address} onChange={e => setCust({ ...cust, address: e.target.value })} placeholder="Street, area" /></Field>
          </div>
        </Step>
        <Card className="p-4"><Field label="Technical comment"><Textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Site condition, seal state, customer verification notes…" /></Field></Card>
        {err && <p className="anim-rise flex items-center gap-2 rounded-lg border border-[#eac5be] bg-dangersoft px-3 py-2.5 text-[12px] font-extrabold text-danger"><Icon name="alert" size={14} /> {err}</p>}
        <Btn variant="ok" icon="check" size="lg" className="w-full" onClick={submit}>SUBMIT FOR SECRETARY REVIEW</Btn>
      </div>
      {scanOpen && (
        <BarcodeScanner
          title="Scan meter barcode"
          hint="Point the camera at the meter's barcode. The read is verified against the authorized installed meter — a mismatch stops the activation."
          onClose={() => setScanOpen(false)}
          onDetect={handleScan}
        />
      )}
    </div>
  );
}

/* ================= Schedule inspection (GM) ================= */
export function ScheduleInspectionPage() {
  const { state, scheduleInspection, user } = useStore();
  const { nav } = useRoute();
  const [facilityId, setFacilityId] = useState(""); const [meter, setMeter] = useState("");
  const [date, setDate] = useState(new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10));
  const [durationSec, setDurationSec] = useState(state.settings.defaultDurationSec);
  const [instruction, setInstruction] = useState(""); const [err, setErr] = useState("");
  if (user && user.role !== "GENERAL_MANAGER" && user.role !== "SUPER_ADMIN")
    return <GateNote text="Only the General Manager schedules inspections. Duration options are configured by the Super Admin under System Settings." onBack={() => nav("meter-inspection")} />;
  const metersHere = state.meters.filter(m => m.facilityId === facilityId && ["ACTIVE", "INSTALLED", "FAULTY"].includes(m.status));
  const submit = () => {
    if (!facilityId) { setErr("Choose a facility."); return; }
    if (!meter) { setErr("Choose a meter at that facility."); return; }
    if (!instruction.trim()) { setErr("Inspection instruction is required."); return; }
    if (state.operations.some(o => o.type === "inspection" && o.meterNumber === meter && o.status === "SCHEDULED")) { setErr("An inspection is already scheduled for this meter."); return; }
    const op = scheduleInspection({ meterNumber: meter, facilityId, date: new Date(date + "T09:00:00").getTime(), instruction: instruction.trim(), durationSec });
    if (op) nav(`meter-inspection/${op.id}`);
  };
  return (
    <div className="mx-auto max-w-xl">
      <BackLink to="meter-inspection" label="Meter Inspection" />
      <Card className="anim-rise p-5">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-volt text-ink"><Icon name="clipboard" size={17} /></span>
          <div><h1 className="font-display text-[18px] font-bold leading-tight">Schedule Inspection</h1><p className="text-[11.5px] text-mute">GM → Technical Man (video) → Secretary → EM → GM → MD. No ZVend call.</p></div>
        </div>
        <div className="space-y-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Facility"><Select value={facilityId} onChange={e => { setFacilityId(e.target.value); setMeter(""); }}><option value="">Select…</option>{state.facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</Select></Field>
            <Field label="Meter number"><Select value={meter} onChange={e => setMeter(e.target.value)} disabled={!facilityId}><option value="">{facilityId ? "Select…" : "Pick facility first"}</option>{metersHere.map(m => <option key={m.number} value={m.number}>{m.number} · {m.status}</option>)}</Select></Field>
            <Field label="Inspection date"><TextInput type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={e => setDate(e.target.value)} /></Field>
            <Field label="Video duration" hint="Configured by Super Admin — never hard-coded.">
              <Select value={durationSec} onChange={e => setDurationSec(Number(e.target.value))}>{state.settings.inspectionDurations.map(d => <option key={d} value={d}>{d / 60} minute{d >= 120 ? "s" : ""}</option>)}</Select>
            </Field>
          </div>
          <Field label="Inspection instruction"><Textarea value={instruction} onChange={e => setInstruction(e.target.value)} placeholder="What must the Technical Man verify? Seals, terminal block, display…" /></Field>
          {err && <p className="anim-rise flex items-center gap-2 rounded-lg border border-[#eac5be] bg-dangersoft px-3 py-2.5 text-[12px] font-extrabold text-danger"><Icon name="alert" size={14} /> {err}</p>}
          <Btn variant="volt" icon="calendar" size="lg" className="w-full" onClick={submit}>SCHEDULE FOR TECHNICAL MAN</Btn>
        </div>
      </Card>
    </div>
  );
}

/* ================= Detail ================= */
export function OperationDetailPage({ type, id }: { type: OpType; id: string }) {
  const { state, decide, startField, saveCustomer } = useStore();
  const { nav } = useRoute();
  const [tab, setTab] = useState("workflow");
  const op = state.operations.find(o => o.id === id && o.type === type);
  if (!op) return <div className="mx-auto max-w-xl p-6"><EmptyState icon="search" title="Record not found" action={<Btn variant="outline" onClick={() => nav(OPS[type].path)}>Back to {OPS[type].short}</Btn>} /></div>;
  const fac = state.facilities.find(f => f.id === op.facilityId);
  const meta = OPS[type];
  const stage = STAGES[type][Math.min(op.stageIdx, STAGES[type].length - 1)];
  const isTechOwner = stage.key === "EXECUTION" && (op.status === "SCHEDULED" || op.status === "REJECTED" || op.status === "IN_PROGRESS" || op.status === "ASSIGNED");
  const needsField = type === "installation" && op.status === "ASSIGNED";
  const auditRows = state.audit.filter(a => a.txn === op.txn);
  const apiRows = state.apiLogs.filter(l => l.txn === op.txn);

  return (
    <div className="mx-auto max-w-[1140px]">
      <BackLink to={meta.path} label={meta.label} />
      <div className="anim-rise mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink text-volt"><Icon name={meta.icon} size={19} /></span>
            <div>
              <h1 className="font-mono text-[19px] font-bold tracking-tight">{op.txn}</h1>
              <p className="text-[11.5px] font-semibold text-mute">{meta.label} · meter {op.meterNumber} · {fac?.name}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {op.pendingSync && <TonePill tone="amber">QUEUED OFFLINE</TonePill>}
          <StatusPill status={op.status} pulse={!TERMINAL.includes(op.status)} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {/* payload panels */}
          <Card className="anim-rise p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div><p className="text-[9.5px] font-extrabold tracking-widest text-mute">METER</p><p className="font-mono text-[14px] font-bold">{op.meterNumber}</p></div>
              <div><p className="text-[9.5px] font-extrabold tracking-widest text-mute">FACILITY</p><p className="text-[13px] font-bold">{fac?.name}</p><p className="text-[10.5px] text-mute">{fac?.code} · {fac?.area}</p></div>
              <div><p className="text-[9.5px] font-extrabold tracking-widest text-mute">INITIATOR</p><p className="text-[13px] font-bold">{op.initiatorName}</p><p className="text-[10.5px] text-mute">{ROLE(op.initiatorRole)} · {fmtDT(op.createdAt)}</p></div>
            </div>
            {(op.note || op.instruction) && (
              <div className="mt-3 rounded-lg bg-paper px-3 py-2.5">
                <p className="text-[9.5px] font-extrabold tracking-widest text-mute">{op.instruction ? "INSTRUCTION" : "INITIATOR NOTE"}</p>
                <p className="mt-0.5 text-[12.5px] font-semibold leading-relaxed">{op.instruction ?? op.note}</p>
              </div>
            )}
            {op.scheduledFor && <p className="mt-2 flex items-center gap-1.5 text-[11.5px] font-bold text-mute"><Icon name="calendar" size={13} /> Scheduled for {fmtDate(op.scheduledFor)} · {Math.round((op.durationSec ?? 0) / 60)}-minute video rule{op.retryCount > 0 ? ` · retry #${op.retryCount}` : ""}</p>}
          </Card>

          {op.customer && (
            <Card className="anim-rise p-4">
              <p className="mb-2 text-[10.5px] font-extrabold tracking-[0.14em] text-mute">CUSTOMER</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <p className="text-[13px] font-bold">{op.customer.name}</p>
                <p className="font-mono text-[12px] text-ink2">{op.customer.phone}</p>
                <p className="text-[12px] text-ink2">{op.customer.email || "—"}</p>
                <p className="text-[12px] text-ink2">{op.customer.address || "—"}</p>
              </div>
            </Card>
          )}

          {type === "installation" && op.customer === undefined && op.stageIdx >= 6 && (
            <CustomerForm opId={op.id} onSave={c => saveCustomer(op.id, c)} existing={op.customer} />
          )}

          {/* field evidence */}
          {(op.scan || op.gps || op.photos.length > 0 || needsField || isTechOwner || op.video || type === "inspection") && (
            <Card className="anim-rise">
              <div className="border-b border-line px-4 py-3"><h2 className="font-display text-[15px] font-bold">Field evidence</h2></div>
              <div className="space-y-4 p-4">
                {isTechOwner && op.status !== "IN_PROGRESS" && (
                  <Btn variant="volt" icon="video" size="lg" className="w-full" onClick={() => startField(op.id)}>{type === "inspection" ? "START INSPECTION" : "START INSTALLATION"}</Btn>
                )}
                {needsField && <FieldExecution opId={op.id} />}
                {(op.scan || op.gps || op.photos.length > 0 || op.video) && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {op.scan && <MiniEv ok={op.scan.matched} okLabel="METER VERIFIED" badLabel="METER MISMATCH" detail={`${op.scan.value} · ${fmtDT(op.scan.at)}`} />}
                    {op.gps && <MiniEv ok={op.gps.accepted} okLabel={`GPS ±${op.gps.accuracy} m`} badLabel="GPS REJECTED" detail={`${op.gps.lat}, ${op.gps.lng} · ${fmtDT(op.gps.at)}`} />}
                  </div>
                )}
                {op.photos.length > 0 && (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{op.photos.map(p => <img key={p.id} src={p.dataUrl} alt={p.label} title={p.label} className="aspect-[4/3] w-full rounded-lg border border-line object-cover" />)}</div>
                )}
                {op.video && <div className="rounded-lg border border-[#c2ddcd] bg-oksoft p-3"><p className="flex items-center gap-2 text-[12.5px] font-extrabold text-ok"><Icon name="video" size={14} /> VIDEO · {op.video.durationSec}s</p><p className="mt-1 text-[11.5px] text-ink2">{op.observations}</p></div>}
              </div>
            </Card>
          )}

          {/* tabs */}
          <Card className="anim-rise">
            <div className="border-b border-line p-3">
              <div className="flex gap-1 overflow-x-auto rounded-lg border border-line bg-paper p-1">
                {[{ k: "workflow", l: "Workflow" }, { k: "comments", l: "Comments", c: op.comments.length }, { k: "audit", l: "Audit", c: auditRows.length }].map(t => (
                  <button key={t.k} onClick={() => setTab(t.k)} className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-bold transition-all ${tab === t.k ? "bg-ink text-paper" : "text-ink2 hover:bg-ink/5"}`}>
                    {t.l}{t.c !== undefined && <span className={`rounded-full px-1.5 text-[10.5px] font-extrabold tnum ${tab === t.k ? "bg-volt text-ink" : "bg-ink/10"}`}>{t.c}</span>}
                  </button>
                ))}
              </div>
            </div>
            {tab === "workflow" && (
              <div className="space-y-4 p-4">
                <Timeline op={op} />
                <ZVend op={op} />
                <ApprovalInline op={op} />
              </div>
            )}
            {tab === "comments" && <Comments op={op} />}
            {tab === "audit" && (
              <div className="divide-y divide-line/70">
                {auditRows.length === 0 && <p className="px-4 py-5 text-center text-[12px] text-mute">No audit events yet.</p>}
                {auditRows.map(a => (
                  <div key={a.id} className="flex items-start gap-3 px-4 py-2.5">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-volt" />
                    <div className="min-w-0 flex-1"><p className="text-[12px] font-bold">{a.action.replace(/_/g, " ")} <span className="font-normal text-mute">· {a.userName}</span></p><p className="truncate text-[11px] text-mute">{a.detail}</p></div>
                    <span className="font-mono text-[9.5px] text-mute">{fmtDT(a.at)}</span>
                  </div>
                ))}
                {apiRows.map(l => (
                  <div key={l.id} className="flex items-center gap-2 px-4 py-2.5">
                    <TonePill tone={l.status === "success" ? "green" : "red"}>{l.status.toUpperCase()}</TonePill>
                    <span className="font-mono text-[11px] font-bold">{l.method} {l.endpoint}</span>
                    <span className="ml-auto font-mono text-[10px] text-mute">{l.durationMs} ms</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="anim-rise p-4">
            <h2 className="mb-3 font-display text-[14px] font-bold">Record</h2>
            <div className="space-y-2 text-[12px]">
              <Row k="Status"><StatusPill status={op.status} /></Row>
              <Row k="Current stage">{stage.label}</Row>
              <Row k="Created">{fmtDT(op.createdAt)}</Row>
              <Row k="Updated">{age(op.updatedAt)} ago</Row>
              {op.zvend?.at && <Row k="ZVend settled">{fmtDT(op.zvend.at)}</Row>}
              {op.completedAt && <Row k="Completed">{fmtDT(op.completedAt)}</Row>}
              {op.assignedToId && <Row k="Assigned to">{state.users.find(u => u.id === op.assignedToId)?.name}</Row>}
            </div>
          </Card>
          <Card className="anim-rise p-4">
            <h2 className="mb-2 font-display text-[14px] font-bold">ZVend</h2>
            <ZVend op={op} />
          </Card>
        </div>
      </div>
    </div>
  );
}

const ROLE = (r: string) => r.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-2"><span className="text-[10.5px] font-extrabold tracking-wider text-mute">{k.toUpperCase()}</span><span className="text-right font-semibold">{children}</span></div>;
}
function MiniEv({ ok, okLabel, badLabel, detail }: { ok: boolean; okLabel: string; badLabel: string; detail: string }) {
  return (
    <div className={`rounded-lg border p-3 ${ok ? "border-[#c2ddcd] bg-oksoft/60" : "border-[#eac5be] bg-dangersoft/60"}`}>
      <p className={`flex items-center gap-1.5 text-[12px] font-extrabold ${ok ? "text-ok" : "text-danger"}`}><Icon name={ok ? "check" : "alert"} size={13} />{ok ? okLabel : badLabel}</p>
      <p className="mt-0.5 font-mono text-[10.5px] text-mute">{detail}</p>
    </div>
  );
}

/* local wrappers so detail page stays self-contained */
import { WorkflowTimeline as Timeline, CommentThread as Comments, ApprovalPanel as ApprovalInline, ZVendPanel as ZVend } from "../components/workflow";
import { EvidenceRow } from "../components/workflow";
import { useStore as useStoreRef } from "../lib/core";
void EvidenceRow; void useStoreRef; void decideNoop;
function decideNoop() { return null; }

function CustomerForm({ existing, onSave }: { opId: string; existing?: CustomerInfo; onSave: (c: CustomerInfo) => void }) {
  const [c, setC] = useState<CustomerInfo>(existing ?? { name: "", phone: "", email: "", address: "" });
  return (
    <Card className="anim-rise p-4">
      <p className="mb-2.5 text-[10.5px] font-extrabold tracking-[0.14em] text-mute">CUSTOMER INFORMATION (TECHNICAL MAN)</p>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Field label="Full name"><TextInput value={c.name} onChange={e => setC({ ...c, name: e.target.value })} /></Field>
        <Field label="Phone"><TextInput value={c.phone} onChange={e => setC({ ...c, phone: e.target.value })} /></Field>
        <Field label="Email"><TextInput value={c.email} onChange={e => setC({ ...c, email: e.target.value })} /></Field>
        <Field label="Address"><TextInput value={c.address} onChange={e => setC({ ...c, address: e.target.value })} /></Field>
      </div>
      <Btn variant="primary" className="mt-3" icon="check" onClick={() => onSave(c)}>Save customer record</Btn>
    </Card>
  );
}

function FieldExecution({ opId }: { opId: string }) {
  const { state, saveScan, saveGps, addPhoto, decide } = useStoreRef();
  const op = state.operations.find(o => o.id === opId)!;
  const [scanOpen, setScanOpen] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [err, setErr] = useState("");
  const fac = state.facilities.find(f => f.id === op.facilityId);
  const max = state.settings.maxGpsAccuracyM;
  const labels = ["Meter Front", "Meter Installation", "Meter Barcode", "Environment"];
  const ready = op.scan?.matched && op.gps?.accepted && op.photos.length >= 4;
  const finish = () => {
    setErr("");
    const e = decide(op.id, "execute", "Installation executed — scan, GPS and photos verified.");
    if (e) setErr(e);
  };
  return (
    <div className="space-y-3.5">
      <div>
        <p className="mb-1.5 text-[10.5px] font-extrabold tracking-[0.14em] text-mute">1 · BARCODE VERIFICATION</p>
        {op.scan?.matched
          ? <MiniEv ok okLabel="METER VERIFIED" badLabel="" detail={`${op.scan.value} · ${fmtDT(op.scan.at)}`} />
          : <div className="space-y-2">
              {op.scan && !op.scan.matched && <p className="flex items-center gap-2 rounded-lg border border-[#eac5be] bg-dangersoft px-3 py-2 text-[11.5px] font-extrabold text-danger anim-rise"><Icon name="alert" size={13} /> METER NUMBER MISMATCH — re-scan the correct meter.</p>}
              <Btn variant="primary" icon="camera" onClick={() => setScanOpen(true)}>Scan meter barcode</Btn>
            </div>}
      </div>
      <div>
        <p className="mb-1.5 text-[10.5px] font-extrabold tracking-[0.14em] text-mute">2 · GPS (LIMIT ±{max} M)</p>
        {op.gps?.accepted
          ? <MiniEv ok okLabel={`GPS ±${op.gps.accuracy} m`} badLabel="" detail={`${op.gps.lat}, ${op.gps.lng}`} />
          : <div className="space-y-2">
              {op.gps && !op.gps.accepted && <p className="rounded-lg border border-[#eac5be] bg-dangersoft px-3 py-2 text-[11.5px] font-extrabold text-danger">±{op.gps.accuracy} m exceeds ceiling — rejected. Re-capture.</p>}
              <Btn variant="primary" icon="pin" loading={gpsBusy} onClick={() => { setGpsBusy(true); setTimeout(() => { const acc = Math.round(6 + Math.random() * 22); saveGps(op.id, { lat: +((fac?.lat ?? 6.45) + (Math.random() - 0.5) * 0.0016).toFixed(6), lng: +((fac?.lng ?? 3.55) + (Math.random() - 0.5) * 0.0016).toFixed(6), accuracy: acc, at: Date.now(), accepted: acc <= max }); setGpsBusy(false); }, 1400); }}>Capture GPS</Btn>
            </div>}
      </div>
      <div>
        <p className="mb-1.5 text-[10.5px] font-extrabold tracking-[0.14em] text-mute">3 · PHOTOGRAPHS ({op.photos.length}/4)</p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {labels.map(l => {
            const p = op.photos.find(x => x.label === l);
            return p ? <img key={l} src={p.dataUrl} alt={l} className="aspect-[4/3] w-full rounded-lg border border-line object-cover" />
              : <button key={l} onClick={() => addPhoto(op.id, { id: Math.random().toString(36).slice(2), label: l, dataUrl: snapPhoto(l, op.meterNumber, op.gps?.lat, op.gps?.lng), at: Date.now(), lat: op.gps?.lat, lng: op.gps?.lng })}
                className="flex aspect-[4/3] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line2 bg-paper transition-colors hover:border-volt hover:bg-voltsoft">
                <Icon name="camera" size={16} className="text-mute" /><span className="px-1 text-center text-[9.5px] font-extrabold text-ink2">{l}</span>
              </button>;
          })}
        </div>
      </div>
      {err && <p className="flex items-center gap-2 text-[11.5px] font-extrabold text-danger anim-fade"><Icon name="alert" size={12} />{err}</p>}
      <Btn variant="ok" icon="check" size="lg" className="w-full" disabled={!ready} onClick={finish}>COMPLETE INSTALLATION</Btn>
      {scanOpen && <BarcodeScanner title="Scan meter barcode" hint={`Compared against ${op.meterNumber}. A mismatch stops the operation.`} onClose={() => setScanOpen(false)}
        onDetect={code => { setScanOpen(false); const v = code.replace(/\D/g, ""); const matched = !!v && (v === op.meterNumber || v.includes(op.meterNumber) || op.meterNumber.includes(v)); saveScan(op.id, { value: v || code, matched, at: Date.now() }); }} />}
    </div>
  );
}
