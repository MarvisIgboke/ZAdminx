import { useMemo, useState } from "react";
import type { OpType } from "../lib/core";
import { age, fmtDate, fmtDT, OPS, OP_ORDER, STATUS_META } from "../lib/core";
import { useStore } from "../lib/core";
import { Bars, Btn, Card, EmptyState, Field, Icon, Pagination, SectionHead, Select, Stat, StatusPill, TextInput, TonePill, useRoute } from "../components/ui";

/* ================= Facilities ================= */
export function FacilitiesPage() {
  const { state, syncFacilities, can } = useStore();
  const { nav } = useRoute();
  const [q, setQ] = useState("");
  const rows = state.facilities.filter(f => !q.trim() || f.name.toLowerCase().includes(q.toLowerCase()) || f.code.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="mx-auto max-w-[1140px]">
      <SectionHead title="Facilities" sub={`${state.facilities.length} facilities synchronized from ZVend`}
        right={can("facilities.sync") ? <Btn variant="primary" icon="sync" onClick={syncFacilities}>Refresh from ZVend</Btn> : undefined} />
      <div className="mb-3 max-w-sm"><TextInput value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or code…" /></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((f, i) => {
          const meters = state.meters.filter(m => m.facilityId === f.id);
          const customers = state.customers.filter(c => c.facilityId === f.id);
          const ops = state.operations.filter(o => o.facilityId === f.id);
          return (
            <Card key={f.id} onClick={() => nav(`facilities/${f.id}`)} className="anim-rise p-4" >
              <div className="flex items-start justify-between" style={{ animationDelay: `${i * 40}ms` }}>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-volt"><Icon name="building" size={16} /></span>
                <TonePill tone={f.status === "ACTIVE" ? "green" : "gray"}>{f.status}</TonePill>
              </div>
              <p className="mt-2.5 font-display text-[15px] font-bold leading-tight">{f.name}</p>
              <p className="font-mono text-[10.5px] font-bold text-mute">{f.code} · {f.area}</p>
              <div className="mt-3 grid grid-cols-3 gap-1 border-t border-line pt-2.5">
                <div><p className="font-display text-[16px] font-bold tnum">{meters.length}</p><p className="text-[8.5px] font-extrabold tracking-wider text-mute">METERS</p></div>
                <div><p className="font-display text-[16px] font-bold tnum">{customers.length}</p><p className="text-[8.5px] font-extrabold tracking-wider text-mute">CUSTOMERS</p></div>
                <div><p className="font-display text-[16px] font-bold tnum">{ops.length}</p><p className="text-[8.5px] font-extrabold tracking-wider text-mute">OPERATIONS</p></div>
              </div>
              <p className="mt-2 text-[9.5px] font-bold text-mute">Synced {age(f.syncedAt)} ago · {f.lat.toFixed(4)}, {f.lng.toFixed(4)}</p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export function FacilityDetailPage({ id }: { id: string }) {
  const { state } = useStore();
  const { nav } = useRoute();
  const [tab, setTab] = useState("customers");
  const f = state.facilities.find(x => x.id === id);
  if (!f) return <div className="p-6"><EmptyState icon="building" title="Facility not found" /></div>;
  const customers = state.customers.filter(c => c.facilityId === id);
  const meters = state.meters.filter(m => m.facilityId === id);
  const ops = state.operations.filter(o => o.facilityId === id);
  return (
    <div className="mx-auto max-w-[1040px]">
      <button onClick={() => nav("facilities")} className="mb-3 flex items-center gap-1.5 text-[12px] font-extrabold text-mute hover:text-ink"><Icon name="chevL" size={14} /> Facilities</button>
      <div className="anim-rise mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[22px] font-bold tracking-tight">{f.name}</h1>
          <p className="font-mono text-[11.5px] text-mute">{f.code} · {f.area} · synced {age(f.syncedAt)} ago</p>
        </div>
        <TonePill tone="green">{f.status}</TonePill>
      </div>
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg border border-line bg-paper p-1 sm:w-fit">
        {[{ k: "customers", l: "Customers", c: customers.length }, { k: "meters", l: "Meters", c: meters.length }, { k: "operations", l: "Operations", c: ops.length }].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-bold ${tab === t.k ? "bg-ink text-paper" : "text-ink2 hover:bg-ink/5"}`}>{t.l}<span className={`rounded-full px-1.5 text-[10.5px] font-extrabold tnum ${tab === t.k ? "bg-volt text-ink" : "bg-ink/10"}`}>{t.c}</span></button>
        ))}
      </div>
      <Card className="anim-rise">
        {tab === "customers" && (
          <div className="divide-y divide-line/70">
            {customers.length === 0 && <p className="px-4 py-6 text-center text-[12px] text-mute">No customers at this facility.</p>}
            {customers.map(c => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink/6 text-[10px] font-extrabold text-ink2">{c.name.split(" ").map(w => w[0]).join("").slice(0, 2)}</span>
                <div className="min-w-0 flex-1"><p className="text-[13px] font-extrabold">{c.name}</p><p className="text-[11px] text-mute">{c.address}</p></div>
                <span className="font-mono text-[11px] text-ink2">{c.phone}</span>
                <span className="text-[10.5px] font-extrabold text-mute">{state.meters.filter(m => m.customerId === c.id).length} meters</span>
              </div>
            ))}
          </div>
        )}
        {tab === "meters" && (
          <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left">
            <thead><tr className="border-b border-line bg-paper text-[10px] font-extrabold tracking-widest text-mute"><th className="px-4 py-2.5">METER</th><th className="px-4 py-2.5">CUSTOMER</th><th className="px-4 py-2.5">STATUS</th><th className="px-4 py-2.5">INSTALLED</th></tr></thead>
            <tbody>{meters.map(m => (
              <tr key={m.id} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-2.5 font-mono text-[12px] font-bold">{m.number}</td>
                <td className="px-4 py-2.5 text-[12px] font-semibold">{state.customers.find(c => c.id === m.customerId)?.name ?? "—"}</td>
                <td className="px-4 py-2.5"><TonePill tone={m.status === "ACTIVE" ? "green" : m.status === "FAULTY" ? "red" : m.status === "INSTALLED" ? "teal" : "gray"}>{m.status}</TonePill></td>
                <td className="px-4 py-2.5 font-mono text-[11px] text-mute">{m.installedAt ? fmtDate(m.installedAt) : "—"}</td>
              </tr>))}</tbody>
          </table></div>
        )}
        {tab === "operations" && (
          <div className="divide-y divide-line/70">
            {ops.length === 0 && <p className="px-4 py-6 text-center text-[12px] text-mute">No operations at this facility.</p>}
            {ops.map(o => (
              <button key={o.id} onClick={() => nav(`${OPS[o.type].path}/${o.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper">
                <Icon name={OPS[o.type].icon} size={15} className="text-volt2" />
                <span className="font-mono text-[11.5px] font-bold">{o.txn}</span>
                <span className="text-[11px] text-mute">{o.meterNumber}</span>
                <span className="ml-auto"><StatusPill status={o.status} /></span>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ================= Customers ================= */
export function CustomersPage() {
  const { state } = useStore();
  const { nav } = useRoute();
  const [q, setQ] = useState(""); const [page, setPage] = useState(1);
  const rows = state.customers.filter(c => !q.trim() || c.name.toLowerCase().includes(q.toLowerCase()) || c.phone.replace(/\s/g, "").includes(q.replace(/\s/g, "")));
  const pages = Math.max(1, Math.ceil(rows.length / 8));
  return (
    <div className="mx-auto max-w-[1040px]">
      <SectionHead title="Customers" sub={`${state.customers.length} customers · names are not unique — a customer may hold several meters`} />
      <div className="mb-3 max-w-sm"><TextInput value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="Search name or phone…" /></div>
      <Card className="anim-rise">
        {rows.length === 0 ? <div className="p-5"><EmptyState icon="users" title="No customers match" /></div> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left">
            <thead><tr className="border-b border-line bg-paper text-[10px] font-extrabold tracking-widest text-mute"><th className="px-4 py-2.5">CUSTOMER</th><th className="px-4 py-2.5">PHONE</th><th className="px-4 py-2.5">FACILITY</th><th className="px-4 py-2.5">METERS</th><th className="px-4 py-2.5">STATUS</th></tr></thead>
            <tbody>{rows.slice((page - 1) * 8, page * 8).map(c => (
              <tr key={c.id} onClick={() => nav(`customers/${c.id}`)} className="cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-paper">
                <td className="px-4 py-3"><p className="text-[13px] font-extrabold">{c.name}</p><p className="text-[10.5px] text-mute">{c.email}</p></td>
                <td className="px-4 py-3 font-mono text-[11.5px] text-ink2">{c.phone}</td>
                <td className="px-4 py-3 text-[12px] font-semibold">{state.facilities.find(f => f.id === c.facilityId)?.name}</td>
                <td className="px-4 py-3"><TonePill tone="ink">{state.meters.filter(m => m.customerId === c.id).length}</TonePill></td>
                <td className="px-4 py-3"><TonePill tone="green">ACTIVE</TonePill></td>
              </tr>))}</tbody>
          </table></div>
        )}
        <div className="px-4 pb-3"><Pagination page={page} pages={pages} onPage={setPage} /></div>
      </Card>
    </div>
  );
}

export function CustomerDetailPage({ id }: { id: string }) {
  const { state } = useStore();
  const { nav } = useRoute();
  const c = state.customers.find(x => x.id === id);
  if (!c) return <div className="p-6"><EmptyState icon="users" title="Customer not found" /></div>;
  const meters = state.meters.filter(m => m.customerId === id);
  const seedVends = (base: number) => Array.from({ length: 6 }, (_, i) => ({
    at: base - i * 6 * 86400000, token: `${Math.floor(1000 + Math.random() * 8999)}-${Math.floor(1000 + Math.random() * 8999)}-${Math.floor(1000 + Math.random() * 8999)}-${Math.floor(1000 + Math.random() * 8999)}`,
    kwh: (5 + Math.random() * 40).toFixed(1), amount: `₦${(1500 + Math.random() * 8000).toFixed(0)}`, ref: `ZV-${Math.floor(10000 + Math.random() * 89999)}`,
  }));
  const vends = useMemo(() => seedVends(Date.now()), [id]);
  const funds = useMemo(() => vends.map(v => ({ ...v, channel: ["Bank transfer", "USSD", "Card", "Agent"][Math.floor(Math.random() * 4)] })), [vends]);
  return (
    <div className="mx-auto max-w-[1040px]">
      <button onClick={() => nav("customers")} className="mb-3 flex items-center gap-1.5 text-[12px] font-extrabold text-mute hover:text-ink"><Icon name="chevL" size={14} /> Customers</button>
      <div className="anim-rise mb-4">
        <h1 className="font-display text-[22px] font-bold tracking-tight">{c.name}</h1>
        <p className="text-[12px] text-mute">{c.phone} · {c.email} · {c.address}</p>
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="p-4"><Stat label="Meters" value={meters.length} /></Card>
        <Card className="p-4"><Stat label="Vending events (ZVend)" value={vends.length} tone="text-info" /></Card>
        <Card className="p-4"><Stat label="Facility" value={state.facilities.find(f => f.id === c.facilityId)?.code ?? "—"} /></Card>
      </div>
      <div className="mb-4"><Card className="p-4">
        <p className="mb-2.5 text-[10.5px] font-extrabold tracking-[0.14em] text-mute">METERS</p>
        {meters.length === 0 ? <p className="text-[12px] text-mute">No meters linked.</p> : (
          <div className="flex flex-wrap gap-2">{meters.map(m => <span key={m.id} className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 font-mono text-[12px] font-bold"><Icon name="gauge" size={13} className="text-volt2" />{m.number}<TonePill tone={m.status === "ACTIVE" ? "green" : "gray"}>{m.status}</TonePill></span>)}</div>
        )}
      </Card></div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="anim-rise">
          <div className="border-b border-line px-4 py-3"><h2 className="font-display text-[14.5px] font-bold">Vending history · ZVend</h2></div>
          <div className="divide-y divide-line/70">{vends.map((v, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5">
              <Icon name="bolt" size={14} className="text-volt2" />
              <div className="min-w-0 flex-1"><p className="font-mono text-[11px] font-bold">{v.token}</p><p className="text-[10px] text-mute">{fmtDT(v.at)} · ref {v.ref}</p></div>
              <span className="text-[12px] font-extrabold tnum">{v.kwh} kWh</span>
              <span className="font-mono text-[11px] text-mute">{v.amount}</span>
            </div>))}</div>
        </Card>
        <Card className="anim-rise">
          <div className="border-b border-line px-4 py-3"><h2 className="font-display text-[14.5px] font-bold">Funding history · ZVend</h2></div>
          <div className="divide-y divide-line/70">{funds.map((v, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5">
              <Icon name="key" size={14} className="text-teal" />
              <div className="min-w-0 flex-1"><p className="text-[12px] font-bold">{v.channel}</p><p className="text-[10px] text-mute">{fmtDT(v.at)} · ref {v.ref}</p></div>
              <span className="font-mono text-[12px] font-extrabold tnum">{v.amount}</span>
            </div>))}</div>
        </Card>
      </div>
    </div>
  );
}

/* ================= Meters ================= */
export function MetersPage() {
  const { state } = useStore();
  const [q, setQ] = useState(""); const [status, setStatus] = useState("ALL");
  const rows = state.meters.filter(m => (!q.trim() || m.number.includes(q.trim())) && (status === "ALL" || m.status === status));
  return (
    <div className="mx-auto max-w-[1040px]">
      <SectionHead title="Meters" sub={`${state.meters.length} meters in registry · numbers globally unique`} />
      <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_220px]">
        <TextInput value={q} onChange={e => setQ(e.target.value)} placeholder="Search meter number…" className="font-mono" />
        <Select value={status} onChange={e => setStatus(e.target.value)}>
          <option value="ALL">All statuses</option>
          {["IN_STOCK", "INSTALLED", "ACTIVE", "FAULTY"].map(s => <option key={s} value={s}>{s}</option>)}
        </Select>
      </div>
      <Card className="anim-rise">
        <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left">
          <thead><tr className="border-b border-line bg-paper text-[10px] font-extrabold tracking-widest text-mute"><th className="px-4 py-2.5">METER NUMBER</th><th className="px-4 py-2.5">FACILITY</th><th className="px-4 py-2.5">CUSTOMER</th><th className="px-4 py-2.5">STATUS</th><th className="px-4 py-2.5">INSTALLED</th></tr></thead>
          <tbody>{rows.map(m => (
            <tr key={m.id} className="border-b border-line/60 last:border-0">
              <td className="px-4 py-3 font-mono text-[12.5px] font-bold">{m.number}</td>
              <td className="px-4 py-3 text-[12px] font-semibold">{state.facilities.find(f => f.id === m.facilityId)?.name}</td>
              <td className="px-4 py-3 text-[12px] font-semibold">{state.customers.find(c => c.id === m.customerId)?.name ?? "—"}</td>
              <td className="px-4 py-3"><TonePill tone={m.status === "ACTIVE" ? "green" : m.status === "FAULTY" ? "red" : m.status === "INSTALLED" ? "teal" : "gray"}>{m.status}</TonePill></td>
              <td className="px-4 py-3 font-mono text-[11px] text-mute">{m.installedAt ? fmtDate(m.installedAt) : "—"}</td>
            </tr>))}</tbody>
        </table></div>
      </Card>
    </div>
  );
}

/* ================= Reports ================= */
export function ReportsPage() {
  const { state, toast } = useStore();
  const { nav } = useRoute();
  const [type, setType] = useState("ALL"); const [fac, setFac] = useState("ALL"); const [status, setStatus] = useState("ALL");
  const [from, setFrom] = useState(""); const [to, setTo] = useState("");
  const filtered = useMemo(() => state.operations.filter(o =>
    (type === "ALL" || o.type === (type as OpType)) && (fac === "ALL" || o.facilityId === fac) && (status === "ALL" || o.status === status)
    && (!from || o.createdAt >= new Date(from).getTime()) && (!to || o.createdAt <= new Date(to).getTime() + 86400000)
  ), [state.operations, type, fac, status, from, to]);
  const months = useMemo(() => {
    const out: { label: string; a: number; b?: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
      const next = new Date(d); next.setMonth(next.getMonth() + 1);
      out.push({ label: d.toLocaleDateString("en-GB", { month: "short" }), a: filtered.filter(o => o.createdAt >= d.getTime() && o.createdAt < next.getTime()).length, b: filtered.filter(o => o.status === "COMPLETED" && o.updatedAt >= d.getTime() && o.updatedAt < next.getTime()).length });
    }
    return out;
  }, [filtered]);
  const exportCsv = () => {
    const head = ["transaction", "operation", "meter", "facility", "initiator", "status", "created", "updated"];
    const rows = filtered.map(o => [o.txn, OPS[o.type].label, o.meterNumber, state.facilities.find(f => f.id === o.facilityId)?.name ?? "", o.initiatorName, o.status, new Date(o.createdAt).toISOString(), new Date(o.updatedAt).toISOString()]);
    const csv = [head, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `zadmin-report-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    toast(`Exported ${rows.length} records to CSV`);
  };
  return (
    <div className="mx-auto max-w-[1240px]">
      <SectionHead title="Reports" sub={`${filtered.length} records in scope · CSV export for Excel / PDF`} right={<Btn variant="primary" icon="download" onClick={exportCsv} disabled={filtered.length === 0}>Export CSV</Btn>} />
      <Card className="anim-rise mb-4 p-4">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Field label="Operation"><Select value={type} onChange={e => setType(e.target.value)}><option value="ALL">All operations</option>{OP_ORDER.map(t => <option key={t} value={t}>{OPS[t].label}</option>)}</Select></Field>
          <Field label="Facility"><Select value={fac} onChange={e => setFac(e.target.value)}><option value="ALL">All facilities</option>{state.facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</Select></Field>
          <Field label="Status"><Select value={status} onChange={e => setStatus(e.target.value)}><option value="ALL">All statuses</option>{Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
          <Field label="From"><TextInput type="date" value={from} onChange={e => setFrom(e.target.value)} /></Field>
          <Field label="To"><TextInput type="date" value={to} onChange={e => setTo(e.target.value)} /></Field>
        </div>
      </Card>
      <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card className="anim-rise p-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <Stat label="Records" value={filtered.length} />
            <Stat label="Completed" value={filtered.filter(o => o.status === "COMPLETED").length} tone="text-ok" />
            <Stat label="In flight" value={filtered.filter(o => !["COMPLETED", "REJECTED", "CANCELLED"].includes(o.status)).length} tone="text-warn" />
            <Stat label="Rejected" value={filtered.filter(o => o.status === "REJECTED").length} tone="text-danger" />
            <Stat label="ZVend calls" value={filtered.filter(o => o.zvend?.status === "success").length} tone="text-info" />
          </div>
        </Card>
        <Card className="anim-rise p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-display text-[13.5px] font-bold">6-month flow</p>
            <span className="flex items-center gap-1.5 text-[9.5px] font-extrabold text-mute"><span className="h-2 w-2 rounded-sm bg-ink/80" />OPENED <span className="ml-1.5 h-2 w-2 rounded-sm bg-volt/70" />DONE</span>
          </div>
          <Bars data={months} height={64} />
        </Card>
      </div>
      <Card className="anim-rise">
        {filtered.length === 0 ? <div className="p-5"><EmptyState icon="chart" title="No records in scope" sub="Loosen the filters." /></div> : (
          <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left">
            <thead><tr className="border-b border-line bg-paper text-[10px] font-extrabold tracking-widest text-mute"><th className="px-4 py-2.5">TXN</th><th className="px-4 py-2.5">OPERATION</th><th className="px-4 py-2.5">METER</th><th className="px-4 py-2.5">FACILITY</th><th className="px-4 py-2.5">INITIATOR</th><th className="px-4 py-2.5">STATUS</th><th className="px-4 py-2.5">CREATED</th></tr></thead>
            <tbody>{filtered.slice(0, 40).map(o => (
              <tr key={o.id} onClick={() => nav(`${OPS[o.type].path}/${o.id}`)} className="cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-paper">
                <td className="px-4 py-2.5 font-mono text-[11.5px] font-bold">{o.txn}</td>
                <td className="px-4 py-2.5"><span className="flex items-center gap-1.5 text-[12px] font-bold"><Icon name={OPS[o.type].icon} size={13} className="text-volt2" />{OPS[o.type].short}</span></td>
                <td className="px-4 py-2.5 font-mono text-[11.5px] text-ink2">{o.meterNumber}</td>
                <td className="px-4 py-2.5 text-[12px] font-semibold">{state.facilities.find(f => f.id === o.facilityId)?.name}</td>
                <td className="px-4 py-2.5 text-[12px] font-semibold">{o.initiatorName}</td>
                <td className="px-4 py-2.5"><StatusPill status={o.status} /></td>
                <td className="px-4 py-2.5 font-mono text-[11px] text-mute">{fmtDate(o.createdAt)}</td>
              </tr>))}</tbody>
          </table></div>
        )}
        {filtered.length > 40 && <p className="px-4 py-2.5 text-[11px] font-bold text-mute">Showing first 40 — export CSV for the full set ({filtered.length}).</p>}
      </Card>
    </div>
  );
}
