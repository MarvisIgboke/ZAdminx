import { useMemo, useState } from "react";
import type { CustomerInfo, GpsRec, OpType, PhotoRec } from "../lib/types";
import { age, fmtDT, fmtDate, OPS, STAGES, STATUS_META, TERMINAL } from "../lib/types";
import { useStore } from "../lib/store";
import { Btn, Card, EmptyState, Field, Icon, Pagination, SectionHead, Select, StatusPill, TextInput, Textarea, useRoute } from "../components/ui";
import { snapPhoto } from "../components/workflow";

// ============================================================
// Shared list page for all five operations
// ============================================================
const chipsFor: Record<OpType, { label: string; match: (s: string) => boolean }[]> = {
  installation: [
    { label: "Pending EM", match: s => s === "PENDING_ENERGY_MANAGER" },
    { label: "Pending GM", match: s => s === "PENDING_GM" },
    { label: "Pending MD", match: s => s === "PENDING_MD" },
    { label: "Waiting ZVend", match: s => s === "WAITING_ZVEND" || s === "ZVEND_FAILED" },
    { label: "Assigned / Field", match: s => s === "ASSIGNED" || s === "IN_PROGRESS" || s === "ZVEND_SUCCESS" },
    { label: "Completed", match: s => s === "COMPLETED" },
    { label: "Rejected", match: s => s === "REJECTED" || s === "RETURNED" },
  ],
  activation: [
    { label: "Pending Secretary", match: s => s === "PENDING_SECRETARY" },
    { label: "Pending EM", match: s => s === "PENDING_ENERGY_MANAGER" },
    { label: "Pending GM", match: s => s === "PENDING_GM" },
    { label: "Pending MD", match: s => s === "PENDING_MD" },
    { label: "ZVend", match: s => s === "WAITING_ZVEND" || s === "ZVEND_SUCCESS" || s === "ZVEND_FAILED" },
    { label: "Completed", match: s => s === "COMPLETED" },
    { label: "Rejected", match: s => s === "REJECTED" || s === "RETURNED" },
  ],
  inspection: [
    { label: "Scheduled", match: s => s === "SCHEDULED" },
    { label: "In Field", match: s => s === "IN_PROGRESS" },
    { label: "In Review", match: s => ["PENDING_SECRETARY", "PENDING_ENERGY_MANAGER", "PENDING_GM", "PENDING_MD"].includes(s) },
    { label: "Completed", match: s => s === "COMPLETED" },
    { label: "Rejected", match: s => s === "REJECTED" || s === "RETURNED" },
  ],
  tamper: [
    { label: "Pending EM", match: s => s === "PENDING_ENERGY_MANAGER" },
    { label: "Pending GM", match: s => s === "PENDING_GM" },
    { label: "Pending MD", match: s => s === "PENDING_MD" },
    { label: "ZVend", match: s => s === "WAITING_ZVEND" || s === "ZVEND_SUCCESS" || s === "ZVEND_FAILED" },
    { label: "Completed", match: s => s === "COMPLETED" },
  ],
  clear: [
    { label: "Pending EM", match: s => s === "PENDING_ENERGY_MANAGER" },
    { label: "Pending GM", match: s => s === "PENDING_GM" },
    { label: "Pending MD", match: s => s === "PENDING_MD" },
    { label: "ZVend", match: s => s === "WAITING_ZVEND" || s === "ZVEND_SUCCESS" || s === "ZVEND_FAILED" },
    { label: "Completed", match: s => s === "COMPLETED" },
  ],
};

export function OperationListPage({ type }: { type: OpType }) {
  const { state, user, can } = useStore();
  const { nav } = useRoute();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const [fac, setFac] = useState("ALL");
  const [page, setPage] = useState(1);
  const PER = 8;

  const ops = useMemo(() => state.operations.filter(o => o.type === type), [state.operations, type]);
  const filtered = useMemo(() => ops.filter(o => {
    const s = q.trim().toLowerCase();
    const okQ = !s || o.txn.toLowerCase().includes(s) || o.meterNumber.includes(s) || o.initiatorName.toLowerCase().includes(s);
    const okS = status === "ALL" || o.status === status;
    const okF = fac === "ALL" || o.facilityId === fac;
    return okQ && okS && okF;
  }), [ops, q, status, fac]);
  const pages = Math.max(1, Math.ceil(filtered.length / PER));
  const rows = filtered.slice((page - 1) * PER, page * PER);

  const meta = OPS[type];
  const newRoute = type === "installation" ? "meter-installation/new"
    : type === "activation" ? "meter-activation/start"
    : type === "inspection" ? "meter-inspection/schedule"
    : `${meta.path}/request`;
  const canNew =
    (type === "installation" && can("installation.create")) ||
    (type === "activation" && can("activation.create")) ||
    (type === "inspection" && can("inspection.create")) ||
    ((type === "tamper" || type === "clear") && can(`${type}.create`));
  const newLabel = type === "installation" ? "New Meter Installation"
    : type === "activation" ? "Start Activation"
    : type === "inspection" ? "Schedule Inspection"
    : `Request ${type === "tamper" ? "Tamper" : "Clear"} Code`;

  return (
    <div className="mx-auto max-w-[1240px]">
      <SectionHead
        title={meta.label}
        sub={`${ops.length} records · ${meta.blurb}`}
        right={canNew ? <Btn variant="volt" icon="plus" onClick={() => nav(newRoute)}>{newLabel}</Btn> : undefined}
      />

      {/* stat chips */}
      <div className="mb-4 flex flex-wrap gap-2 anim-rise">
        <button onClick={() => { setStatus("ALL"); setPage(1); }}
          className={`rounded-lg border px-3 py-1.5 text-[11.5px] font-extrabold transition-colors ${status === "ALL" ? "border-ink bg-ink text-paper" : "border-line bg-card text-ink2 hover:border-ink/40"}`}>
          Total <span className="ml-1 font-mono tnum">{ops.length}</span>
        </button>
        {chipsFor[type].map(c => {
          const n = ops.filter(o => c.match(o.status)).length;
          return (
            <span key={c.label} className="rounded-lg border border-line bg-card px-3 py-1.5 text-[11.5px] font-extrabold text-ink2">
              {c.label} <span className="ml-1 font-mono text-volt2 tnum">{n}</span>
            </span>
          );
        })}
      </div>

      {/* filters */}
      <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_220px_220px]">
        <div className="relative">
          <Icon name="search" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
          <TextInput value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="Search transaction, meter, initiator…" className="pl-8.5" />
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

      {/* table */}
      <Card className="anim-rise">
        {rows.length === 0 ? (
          <div className="p-5"><EmptyState icon={meta.icon} title={`No ${meta.short.toLowerCase()} records match`} sub={ops.length === 0 ? "Records will appear here as soon as the workflow produces them." : "Adjust the filters or search query."} action={canNew ? <Btn variant="primary" icon="plus" onClick={() => nav(newRoute)}>{newLabel}</Btn> : undefined} /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead>
                <tr className="border-b border-line bg-paper text-[10px] font-extrabold tracking-widest text-mute">
                  <th className="px-4 py-2.5">TRANSACTION</th>
                  <th className="px-4 py-2.5">METER</th>
                  <th className="px-4 py-2.5">FACILITY</th>
                  <th className="px-4 py-2.5">INITIATOR</th>
                  <th className="px-4 py-2.5">CURRENT STAGE</th>
                  <th className="px-4 py-2.5">STATUS</th>
                  <th className="px-4 py-2.5">AGE</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(op => (
                  <tr key={op.id} onClick={() => nav(`${meta.path}/${op.id}`)} className="cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-paper">
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-ink/6 text-ink2"><Icon name={meta.icon} size={13} /></span>
                        <span className="font-mono text-[11.5px] font-bold">{op.txn}</span>
                        {op.pendingSync && <span className="rounded bg-warnsoft px-1 py-px text-[9px] font-extrabold text-warn">QUEUED</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11.5px] text-ink2">{op.meterNumber}</td>
                    <td className="px-4 py-3 text-[12px] font-semibold">{state.facilities.find(f => f.id === op.facilityId)?.name ?? "—"}</td>
                    <td className="px-4 py-3"><p className="text-[12px] font-bold">{op.initiatorName}</p><p className="text-[9.5px] font-bold tracking-wider text-mute">{op.initiatorRole.replace(/_/g, " ")}</p></td>
                    <td className="px-4 py-3 text-[11.5px] font-semibold text-mute">{STAGES[op.type][Math.min(op.stageIdx, STAGES[op.type].length - 1)].label}</td>
                    <td className="px-4 py-3"><StatusPill status={op.status} pulse={!TERMINAL.includes(op.status)} /></td>
                    <td className="px-4 py-3 font-mono text-[11px] text-mute">{age(op.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-4 pb-3"><Pagination page={page} pages={pages} onPage={setPage} /></div>
      </Card>
      {user && !canNew && (
        <p className="mt-3 flex items-center gap-2 text-[11.5px] font-semibold text-mute"><Icon name="lock" size={13} /> Your role has read access to this operation — initiation is permission-gated.</p>
      )}
    </div>
  );
}

// ============================================================
// New installation (Secretary)
// ============================================================
export function NewInstallationPage() {
  const { state, createInstallation, user } = useStore();
  const { nav } = useRoute();
  const [meter, setMeter] = useState("");
  const [facilityId, setFacilityId] = useState(state.facilities[0]?.id ?? "");
  const [comment, setComment] = useState("");
  const [errs, setErrs] = useState<Record<string, string>>({});

  if (user && !user.role.match(/SECRETARY|SUPER_ADMIN/) ) {
    return <GateNote text="Meter Installation is initiated by the Secretary. The new meter is not checked against ZVend at this stage — ZVend registration happens only after MD approval." onBack={() => nav("meter-installation")} />;
  }

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
      <Card className="p-5 anim-rise">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-volt text-ink"><Icon name="wrench" size={17} /></span>
          <div>
            <h1 className="font-display text-[18px] font-bold leading-tight">New Meter Installation</h1>
            <p className="text-[11.5px] text-mute">The meter is NEW — no ZVend check at initiation. Chain: EM → GM → MD → ZVend → Secretary → Technical Man.</p>
          </div>
        </div>
        <div className="space-y-3.5">
          <Field label="Meter number" error={errs.meter} hint="Numerals only. Duplicate numbers are rejected immediately.">
            <TextInput value={meter} onChange={e => setMeter(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 45039813401" className="font-mono" />
          </Field>
          <Field label="Facility" error={errs.facility}>
            <Select value={facilityId} onChange={e => setFacilityId(e.target.value)}>
              {state.facilities.map(f => <option key={f.id} value={f.id}>{f.name} · {f.code}</option>)}
            </Select>
          </Field>
          <Field label="Secretary comment">
            <Textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Context for the approvers — stock reference, customer request, priority…" />
          </Field>
          <Btn variant="volt" icon="arrowR" size="lg" className="w-full" onClick={submit}>SUBMIT TO ENERGY MANAGER</Btn>
        </div>
      </Card>
    </div>
  );
}

// ============================================================
// Tamper / Clear code request
// ============================================================
export function RequestCodePage({ type }: { type: "tamper" | "clear" }) {
  const { state, requestCode, user } = useStore();
  const { nav } = useRoute();
  const [meter, setMeter] = useState("");
  const [facilityId, setFacilityId] = useState("");
  const [comment, setComment] = useState("");
  const [scanning, setScanning] = useState(false);
  const [err, setErr] = useState("");
  const isTech = user?.role === "TECHNICAL_MAN";
  const label = type === "tamper" ? "Tamper" : "Clear";

  const facOfMeter = state.meters.find(m => m.number === meter.trim())?.facilityId;

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
      <Card className="p-5 anim-rise">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-volt text-ink"><Icon name={type === "tamper" ? "shield" : "key"} size={17} /></span>
          <div>
            <h1 className="font-display text-[18px] font-bold leading-tight">Request {label} Code</h1>
            <p className="text-[11.5px] text-mute">{isTech ? "Barcode scan initiation" : "Manual entry initiation"} · EM → GM → MD → ZVend → delivery confirmation.</p>
          </div>
        </div>

        {isTech && (
          <div className="relative mb-4 overflow-hidden rounded-xl border-2 border-ink bg-side aspect-[16/7]">
            <div className="bg-circuit absolute inset-0" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
              <Icon name="scan" size={28} className={scanning ? "text-volt" : "text-[#5d6b62]"} />
              <p className="font-mono text-[10.5px] font-bold tracking-widest text-[#93a29a]">{scanning ? "SCANNING…" : "BARCODE SCANNER READY"}</p>
            </div>
            {scanning && <span className="scanline absolute left-8 right-8 h-[2px] rounded bg-volt shadow-[0_0_14px_#e89b2e]" />}
          </div>
        )}

        <div className="space-y-3.5">
          {isTech && (
            <Btn variant="primary" icon="scan" className="w-full" loading={scanning} onClick={() => {
              setScanning(true);
              setTimeout(() => {
                const candidates = state.meters.filter(m => ["ACTIVE", "INSTALLED", "FAULTY"].includes(m.status));
                const pick = candidates[Math.floor(Math.random() * candidates.length)];
                if (pick) { setMeter(pick.number); setFacilityId(pick.facilityId); }
                setScanning(false);
              }, 1200);
            }}>Scan meter barcode</Btn>
          )}
          <Field label="Meter number" error={err || undefined}>
            <TextInput value={meter} onChange={e => { setMeter(e.target.value.replace(/\D/g, "")); setErr(""); }} placeholder="e.g. 45039812990" className="font-mono" />
          </Field>
          <Field label="Facility" hint={facOfMeter ? "Auto-matched from meter registry." : undefined}>
            <Select value={facOfMeter || facilityId} onChange={e => setFacilityId(e.target.value)} disabled={!!facOfMeter}>
              <option value="">Select facility…</option>
              {state.facilities.map(f => <option key={f.id} value={f.id}>{f.name} · {f.code}</option>)}
            </Select>
          </Field>
          <Field label="Reason / comment">
            <Textarea value={comment} onChange={e => setComment(e.target.value)} placeholder={type === "tamper" ? "Why is the tamper code needed? e.g. meter lockout after surge…" : "Why is the clear code needed? e.g. credit lockout after token reversal…"} />
          </Field>
          <Btn variant="volt" icon="arrowR" size="lg" className="w-full" onClick={submit}>SUBMIT TO ENERGY MANAGER</Btn>
        </div>
      </Card>
    </div>
  );
}

// ============================================================
// Start activation (Technical Man)
// ============================================================
export function StartActivationPage() {
  const { state, createActivation, user } = useStore();
  const { nav } = useRoute();
  const [meter, setMeter] = useState("");
  const [scanState, setScanState] = useState<"idle" | "scanning" | "ok" | "bad">("idle");
  const [gps, setGps] = useState<GpsRec | null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [photos, setPhotos] = useState<PhotoRec[]>([]);
  const [cust, setCust] = useState<CustomerInfo>({ name: "", phone: "", email: "", address: "" });
  const [comment, setComment] = useState("");
  const [err, setErr] = useState("");

  if (user && user.role !== "TECHNICAL_MAN" && user.role !== "SUPER_ADMIN") {
    return <GateNote text="Meter Activation is initiated by the Technical Man after physical installation. The Secretary cannot initiate activations." onBack={() => nav("meter-activation")} />;
  }

  const installed = state.meters.filter(m => m.status === "INSTALLED");
  const fac = state.meters.find(m => m.number === meter)?.facilityId ?? "";
  const maxAcc = state.settings.maxGpsAccuracyM;
  const facility = state.facilities.find(f => f.id === fac);

  const doScan = (value: string) => {
    setScanState("scanning");
    setTimeout(() => setScanState(value === meter && value ? "ok" : "bad"), 1100);
  };

  const captureGps = () => {
    setGpsBusy(true);
    const f = facility;
    setTimeout(() => {
      setGps({ lat: +((f?.lat ?? 6.45) + (Math.random() - 0.5) * 0.0016).toFixed(6), lng: +((f?.lng ?? 3.55) + (Math.random() - 0.5) * 0.0016).toFixed(6), accuracy: Math.round(5 + Math.random() * 22), at: Date.now(), source: "simulated", accepted: true });
      setGpsBusy(false);
    }, 1500);
  };

  const snap = (label: string) => setPhotos(p => [...p, { id: Math.random().toString(36).slice(2), label, dataUrl: snapPhoto(label, meter, gps?.lat, gps?.lng), at: Date.now(), lat: gps?.lat, lng: gps?.lng }]);

  const submit = () => {
    if (!meter) { setErr("Select the meter to activate."); return; }
    if (scanState !== "ok") { setErr("Barcode verification must show METER VERIFIED."); return; }
    if (!gps || !gps.accepted || gps.accuracy > maxAcc) { setErr(`GPS capture within ±${maxAcc} m is required.`); return; }
    if (photos.length < 4) { setErr(`Capture all 4 photos (${photos.length}/4).`); return; }
    if (!cust.name.trim() || !cust.phone.trim()) { setErr("Customer name and phone are required."); return; }
    const op = createActivation({ meterNumber: meter, facilityId: fac, customer: cust, gps, photos, scan: { value: meter, matched: true, at: Date.now() }, comment });
    if (op) nav(`meter-activation/${op.id}`);
  };

  const Step = ({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) => (
    <div className={`rounded-xl border p-4 ${done ? "border-[#c2ddcd]" : "border-line"} bg-card anim-rise`}>
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
            <Btn variant="primary" icon="scan" disabled={!meter} loading={scanState === "scanning"} onClick={() => doScan(meter)}>Scan barcode</Btn>
          </div>
          {installed.length === 0 && <p className="mt-2 text-[11.5px] font-bold text-warn">No INSTALLED meters available — complete an installation first.</p>}
          {scanState === "ok" && <p className="mt-2 flex items-center gap-1.5 text-[12px] font-extrabold text-ok"><Icon name="check" size={13} /> METER VERIFIED · {meter}</p>}
          {scanState === "bad" && <p className="mt-2 flex items-center gap-1.5 text-[12px] font-extrabold text-danger"><Icon name="alert" size={13} /> METER NUMBER MISMATCH — re-scan.</p>}
          {facility && <p className="mt-1.5 text-[11px] font-semibold text-mute">Facility: {facility.name}</p>}
        </Step>

        <Step n={2} title={`GPS capture (limit ±${maxAcc} m)`} done={!!gps && gps.accuracy <= maxAcc}>
          {gps && gps.accuracy <= maxAcc ? (
            <p className="flex items-center gap-2 font-mono text-[12px] font-bold text-ok"><Icon name="pin" size={14} /> {gps.lat}, {gps.lng} · ±{gps.accuracy} m</p>
          ) : (
            <Btn variant="primary" icon="pin" loading={gpsBusy} onClick={captureGps}>Capture GPS</Btn>
          )}
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

        <Card className="p-4">
          <Field label="Technical comment"><Textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Site condition, seal state, customer verification notes…" /></Field>
        </Card>

        {err && <p className="flex items-center gap-2 rounded-lg border border-[#eac5be] bg-dangersoft px-3 py-2.5 text-[12px] font-extrabold text-danger anim-rise"><Icon name="alert" size={14} /> {err}</p>}
        <Btn variant="ok" icon="check" size="lg" className="w-full" onClick={submit}>SUBMIT FOR SECRETARY REVIEW</Btn>
      </div>
    </div>
  );
}

// ============================================================
// Schedule inspection (GM)
// ============================================================
export function ScheduleInspectionPage() {
  const { state, scheduleInspection, user } = useStore();
  const { nav } = useRoute();
  const [facilityId, setFacilityId] = useState("");
  const [meter, setMeter] = useState("");
  const [date, setDate] = useState(new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10));
  const [durationSec, setDurationSec] = useState(state.settings.defaultDurationSec);
  const [instruction, setInstruction] = useState("");
  const [err, setErr] = useState("");

  if (user && user.role !== "GENERAL_MANAGER" && user.role !== "SUPER_ADMIN") {
    return <GateNote text="Only the General Manager schedules inspections. Duration options are configured by the Super Admin under System Settings." onBack={() => nav("meter-inspection")} />;
  }

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
      <Card className="p-5 anim-rise">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-volt text-ink"><Icon name="clipboard" size={17} /></span>
          <div>
            <h1 className="font-display text-[18px] font-bold leading-tight">Schedule Inspection</h1>
            <p className="text-[11.5px] text-mute">GM → Technical Man (video) → Secretary → EM → GM → MD. No ZVend call.</p>
          </div>
        </div>
        <div className="space-y-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Facility">
              <Select value={facilityId} onChange={e => { setFacilityId(e.target.value); setMeter(""); }}>
                <option value="">Select…</option>
                {state.facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </Select>
            </Field>
            <Field label="Meter number">
              <Select value={meter} onChange={e => setMeter(e.target.value)} disabled={!facilityId}>
                <option value="">{facilityId ? "Select…" : "Pick facility first"}</option>
                {metersHere.map(m => <option key={m.number} value={m.number}>{m.number} · {m.status}</option>)}
              </Select>
            </Field>
            <Field label="Inspection date"><TextInput type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={e => setDate(e.target.value)} /></Field>
            <Field label="Video duration" hint="Configured by Super Admin — never hard-coded.">
              <Select value={durationSec} onChange={e => setDurationSec(Number(e.target.value))}>
                {state.settings.inspectionDurations.map(d => <option key={d} value={d}>{d / 60} minute{d >= 120 ? "s" : ""}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Inspection instruction">
            <Textarea value={instruction} onChange={e => setInstruction(e.target.value)} placeholder="What must the Technical Man verify? Seals, terminal block, display, environment…" />
          </Field>
          {err && <p className="flex items-center gap-2 rounded-lg border border-[#eac5be] bg-dangersoft px-3 py-2.5 text-[12px] font-extrabold text-danger anim-rise"><Icon name="alert" size={14} /> {err}</p>}
          <Btn variant="volt" icon="calendar" size="lg" className="w-full" onClick={submit}>SCHEDULE FOR TECHNICAL MAN</Btn>
        </div>
      </Card>
    </div>
  );
}

function BackLink({ to, label }: { to: string; label: string }) {
  const { nav } = useRoute();
  return (
    <button onClick={() => nav(to)} className="mb-3 flex items-center gap-1.5 text-[12px] font-extrabold text-mute transition-colors hover:text-ink">
      <Icon name="chevL" size={14} /> {label}
    </button>
  );
}

function GateNote({ text, onBack }: { text: string; onBack: () => void }) {
  return (
    <div className="mx-auto max-w-xl">
      <Card className="p-6 text-center anim-rise">
        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-warnsoft text-warn"><Icon name="lock" size={20} /></span>
        <h1 className="font-display text-[17px] font-bold">Not available for your role</h1>
        <p className="mx-auto mt-1.5 max-w-md text-[12.5px] text-mute">{text}</p>
        <Btn variant="outline" icon="chevL" className="mt-4" onClick={onBack}>Back to list</Btn>
      </Card>
    </div>
  );
}

export { fmtDT, fmtDate };
