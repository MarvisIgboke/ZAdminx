import { useMemo, useState } from "react";
import { age, fmtDate, fmtDT, OPS, STATUS_META } from "../lib/types";
import { useStore } from "../lib/store";
import { Btn, Card, EmptyState, Icon, KV, Pagination, SectionHead, Select, StatusPill, Tabs, TextInput, TonePill, useRoute } from "../components/ui";

// ============================================================
// Facilities
// ============================================================
export function FacilitiesPage() {
  const { state, can, syncFacilities, syncing } = useStore();
  const { nav } = useRoute();
  return (
    <div className="mx-auto max-w-[1240px]">
      <SectionHead
        title="Facilities"
        sub={`Synchronized from ZVend · last refresh ${state.lastFacilitySync ? age(state.lastFacilitySync) + " ago" : "never"}`}
        right={can("facilities.sync") ? <Btn variant="volt" icon="sync" loading={syncing} onClick={syncFacilities}>Refresh from ZVend</Btn> : undefined}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {state.facilities.map((f, i) => {
          const openOps = state.operations.filter(o => o.facilityId === f.id && !["COMPLETED", "REJECTED", "CANCELLED"].includes(o.status)).length;
          return (
            <Card key={f.id} onClick={() => nav(`facilities/${f.id}`)} className="anim-rise p-4" >
              <div className="flex items-start justify-between" style={{ animationDelay: `${i * 40}ms` }}>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-volt"><Icon name="building" size={16} /></span>
                <TonePill tone={f.status === "ACTIVE" ? "green" : "gray"}>{f.status}</TonePill>
              </div>
              <p className="mt-2.5 font-display text-[15px] font-bold">{f.name}</p>
              <p className="font-mono text-[10.5px] font-bold text-volt2">{f.code} · {f.feeder}</p>
              <p className="mt-1 truncate text-[11.5px] text-mute">{f.address}</p>
              <div className="mt-3 grid grid-cols-3 gap-1 border-t border-line pt-2.5 text-center">
                <div><p className="font-display text-[16px] font-bold tnum">{f.metersCount}</p><p className="text-[8.5px] font-extrabold tracking-wider text-mute">METERS</p></div>
                <div><p className="font-display text-[16px] font-bold tnum">{f.customersCount}</p><p className="text-[8.5px] font-extrabold tracking-wider text-mute">CUSTOMERS</p></div>
                <div><p className="font-display text-[16px] font-bold text-warn tnum">{openOps}</p><p className="text-[8.5px] font-extrabold tracking-wider text-mute">OPEN OPS</p></div>
              </div>
              <p className="mt-2 text-[10px] font-bold text-mute">synced {f.lastSyncedAt ? age(f.lastSyncedAt) + " ago" : "—"}</p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export function FacilityDetailPage({ id }: { id: string }) {
  const { state, syncFacilities, syncing, can } = useStore();
  const { nav } = useRoute();
  const [tab, setTab] = useState("overview");
  const f = state.facilities.find(x => x.id === id);
  if (!f) return <div className="mx-auto max-w-xl p-6"><EmptyState icon="building" title="Facility not found" action={<Btn variant="outline" onClick={() => nav("facilities")}>Back</Btn>} /></div>;

  const customers = state.customers.filter(c => c.facilityId === f.id);
  const meters = state.meters.filter(m => m.facilityId === f.id);
  const ops = state.operations.filter(o => o.facilityId === f.id);

  return (
    <div className="mx-auto max-w-[1100px]">
      <button onClick={() => nav("facilities")} className="mb-3 flex items-center gap-1.5 text-[12px] font-extrabold text-mute hover:text-ink"><Icon name="chevL" size={14} /> Facilities</button>
      <div className="mb-4 flex flex-wrap items-center gap-3 anim-rise">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink text-volt"><Icon name="building" size={20} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-[20px] font-bold">{f.name}</h1>
            <TonePill tone={f.status === "ACTIVE" ? "green" : "gray"}>{f.status}</TonePill>
          </div>
          <p className="text-[12px] font-semibold text-mute">{f.code} · {f.feeder} · {f.region} · synced {f.lastSyncedAt ? age(f.lastSyncedAt) + " ago" : "never"}</p>
        </div>
        {can("facilities.sync") && <Btn variant="volt" icon="sync" loading={syncing} onClick={syncFacilities}>Refresh from ZVend</Btn>}
      </div>

      <div className="mb-4">
        <Tabs active={tab} onChange={setTab} tabs={[
          { key: "overview", label: "Overview" },
          { key: "customers", label: "Customers", count: customers.length },
          { key: "meters", label: "Meters", count: meters.length },
          { key: "operations", label: "Operations", count: ops.length },
          { key: "history", label: "Sync History" },
        ]} />
      </div>

      {tab === "overview" && (
        <div className="grid gap-4 lg:grid-cols-[360px_1fr] anim-rise">
          <Card className="p-4">
            <KV k="Code" v={f.code} mono />
            <KV k="Region" v={f.region} />
            <KV k="Feeder" v={f.feeder} mono />
            <KV k="Address" v={f.address} />
            <KV k="Coordinates" v={`${f.lat.toFixed(4)}, ${f.lng.toFixed(4)}`} mono />
            <KV k="Last synced" v={fmtDT(f.lastSyncedAt)} />
          </Card>
          <div className="grid content-start gap-3 sm:grid-cols-3">
            {[{ l: "Meters registered", v: f.metersCount, t: "text-ink" }, { l: "Customers", v: f.customersCount, t: "text-ink" }, { l: "Open operations", v: ops.filter(o => !["COMPLETED", "REJECTED", "CANCELLED"].includes(o.status)).length, t: "text-warn" },
            { l: "Completed ops", v: ops.filter(o => o.status === "COMPLETED").length, t: "text-ok" }, { l: "Active meters", v: meters.filter(m => m.status === "ACTIVE").length, t: "text-ok" }, { l: "Faulty meters", v: meters.filter(m => m.status === "FAULTY").length, t: "text-danger" }].map(s => (
              <Card key={s.l} className="p-4"><p className={`font-display text-[24px] font-bold tnum ${s.t}`}>{s.v}</p><p className="mt-1 text-[10.5px] font-extrabold tracking-wider text-mute">{s.l.toUpperCase()}</p></Card>
            ))}
          </div>
        </div>
      )}

      {tab === "customers" && (
        <Card className="anim-rise">
          {customers.length === 0 ? <div className="p-5"><EmptyState icon="users" title="No customers mapped" sub="Customers sync from ZVend per facility." /></div> : (
            <div className="divide-y divide-line/70">
              {customers.map(c => (
                <button key={c.id} onClick={() => nav(`customers/${c.id}`)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-paper">
                  <Icon name="user" size={15} className="text-teal" />
                  <span className="flex-1"><span className="block text-[13px] font-bold">{c.name}</span><span className="block text-[11px] text-mute">{c.phone}</span></span>
                  <span className="text-[11px] font-bold text-mute">{c.meters.length} meter{c.meters.length === 1 ? "" : "s"}</span>
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "meters" && (
        <Card className="anim-rise">
          <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left">
            <thead><tr className="border-b border-line bg-paper text-[10px] font-extrabold tracking-widest text-mute"><th className="px-4 py-2.5">METER</th><th className="px-4 py-2.5">MODEL</th><th className="px-4 py-2.5">STATUS</th><th className="px-4 py-2.5">CUSTOMER</th></tr></thead>
            <tbody>{meters.map(m => (
              <tr key={m.number} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-2.5 font-mono text-[12px] font-bold">{m.number}</td>
                <td className="px-4 py-2.5 text-[12px] text-ink2">{m.model} · {m.phase}</td>
                <td className="px-4 py-2.5"><TonePill tone={m.status === "ACTIVE" ? "green" : m.status === "INSTALLED" ? "teal" : m.status === "FAULTY" ? "red" : "gray"}>{m.status}</TonePill></td>
                <td className="px-4 py-2.5 text-[12px] font-semibold">{m.customerName ?? "—"}</td>
              </tr>))}</tbody>
          </table></div>
        </Card>
      )}

      {tab === "operations" && (
        <Card className="anim-rise">
          <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left">
            <thead><tr className="border-b border-line bg-paper text-[10px] font-extrabold tracking-widest text-mute"><th className="px-4 py-2.5">TXN</th><th className="px-4 py-2.5">OPERATION</th><th className="px-4 py-2.5">METER</th><th className="px-4 py-2.5">STATUS</th><th className="px-4 py-2.5">UPDATED</th></tr></thead>
            <tbody>{ops.map(o => (
              <tr key={o.id} onClick={() => nav(`${OPS[o.type].path}/${o.id}`)} className="cursor-pointer border-b border-line/60 last:border-0 hover:bg-paper">
                <td className="px-4 py-2.5 font-mono text-[11.5px] font-bold">{o.txn}</td>
                <td className="px-4 py-2.5 text-[12px] font-bold">{OPS[o.type].short}</td>
                <td className="px-4 py-2.5 font-mono text-[11.5px] text-ink2">{o.meterNumber}</td>
                <td className="px-4 py-2.5"><StatusPill status={o.status} /></td>
                <td className="px-4 py-2.5 font-mono text-[11px] text-mute">{age(o.updatedAt)} ago</td>
              </tr>))}
            {ops.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-[12px] text-mute">No operations at this facility.</td></tr>}
            </tbody>
          </table></div>
        </Card>
      )}

      {tab === "history" && (
        <Card className="anim-rise">
          <div className="divide-y divide-line/70">
            {state.syncLogs.map(l => (
              <div key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                <TonePill tone={l.status === "success" ? "green" : "red"}>{l.status.toUpperCase()}</TonePill>
                <span className="flex-1 text-[12.5px] font-bold">{l.operation}</span>
                <span className="text-[11px] text-mute">{l.processed} ok · {l.failed} failed · {l.by}</span>
                <span className="font-mono text-[10.5px] text-mute">{fmtDT(l.at)}</span>
              </div>
            ))}
            {state.syncLogs.length === 0 && <p className="px-4 py-6 text-center text-[12px] text-mute">No synchronization runs yet.</p>}
          </div>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// Customers
// ============================================================
export function CustomersPage() {
  const { state } = useStore();
  const { nav } = useRoute();
  const [q, setQ] = useState("");
  const list = state.customers.filter(c => !q.trim() || c.name.toLowerCase().includes(q.toLowerCase()) || c.phone.replace(/\s/g, "").includes(q.replace(/\s/g, "")));
  return (
    <div className="mx-auto max-w-[1060px]">
      <SectionHead title="Customers" sub={`${state.customers.length} customers · a customer may hold multiple meters`} />
      <div className="relative mb-3 max-w-sm">
        <Icon name="search" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
        <TextInput value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or phone…" className="pl-8.5" />
      </div>
      <Card className="anim-rise">
        <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left">
          <thead><tr className="border-b border-line bg-paper text-[10px] font-extrabold tracking-widest text-mute">
            <th className="px-4 py-2.5">CUSTOMER</th><th className="px-4 py-2.5">CONTACT</th><th className="px-4 py-2.5">FACILITY</th><th className="px-4 py-2.5">METERS</th><th className="px-4 py-2.5">SINCE</th>
          </tr></thead>
          <tbody>
            {list.map(c => (
              <tr key={c.id} onClick={() => nav(`customers/${c.id}`)} className="cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-paper">
                <td className="px-4 py-3"><span className="flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-[11px] font-extrabold text-volt">{c.name.split(" ").map(w => w[0]).slice(0, 2).join("")}</span><span className="text-[13px] font-bold">{c.name}</span></span></td>
                <td className="px-4 py-3"><p className="text-[12px] font-semibold">{c.phone}</p><p className="text-[11px] text-mute">{c.email}</p></td>
                <td className="px-4 py-3 text-[12px] font-semibold">{state.facilities.find(f => f.id === c.facilityId)?.name}</td>
                <td className="px-4 py-3"><span className="rounded-md bg-ink/6 px-2 py-0.5 font-mono text-[11px] font-bold tnum">{c.meters.length}</span></td>
                <td className="px-4 py-3 font-mono text-[11px] text-mute">{fmtDate(c.since)}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-[12px] text-mute">No customers match.</td></tr>}
          </tbody>
        </table></div>
      </Card>
    </div>
  );
}

function seeded(seedStr: string) {
  let h = 2166136261;
  for (const ch of seedStr) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h ^= h >>> 13; return ((h >>> 0) % 1000) / 1000; };
}

export function CustomerDetailPage({ id }: { id: string }) {
  const { state } = useStore();
  const { nav } = useRoute();
  const [tab, setTab] = useState("meters");
  const c = state.customers.find(x => x.id === id);
  const vending = useMemo(() => {
    if (!c) return [];
    const rnd = seeded(c.id + "vend");
    return Array.from({ length: 9 }, (_, i) => {
      const kwh = Math.round(18 + rnd() * 74);
      return { id: i, date: Date.now() - i * 9 * 86400000 - Math.round(rnd() * 3 * 86400000), kwh, amount: Math.round(kwh * 11.6), token: Array.from({ length: 20 }, () => Math.floor(rnd() * 10)).join(""), ref: `ZVD-${70000 + Math.floor(rnd() * 25000)}` };
    });
  }, [c]);
  const funding = useMemo(() => {
    if (!c) return [];
    const rnd = seeded(c.id + "fund");
    return Array.from({ length: 7 }, (_, i) => ({ id: i, date: Date.now() - i * 13 * 86400000, amount: Math.round(2000 + rnd() * 18000), channel: ["Bank transfer", "USSD", "Agent", "Card"][Math.floor(rnd() * 4)], ref: `PAY-${50000 + Math.floor(rnd() * 40000)}` }));
  }, [c]);

  if (!c) return <div className="mx-auto max-w-xl p-6"><EmptyState icon="users" title="Customer not found" action={<Btn variant="outline" onClick={() => nav("customers")}>Back</Btn>} /></div>;
  const meters = state.meters.filter(m => c.meters.includes(m.number));

  return (
    <div className="mx-auto max-w-[1060px]">
      <button onClick={() => nav("customers")} className="mb-3 flex items-center gap-1.5 text-[12px] font-extrabold text-mute hover:text-ink"><Icon name="chevL" size={14} /> Customers</button>
      <div className="mb-4 flex flex-wrap items-center gap-3 anim-rise">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink font-display text-[16px] font-bold text-volt">{c.name.split(" ").map(w => w[0]).slice(0, 2).join("")}</span>
        <div>
          <h1 className="font-display text-[20px] font-bold">{c.name}</h1>
          <p className="text-[12px] font-semibold text-mute">{c.phone} · {c.email} · {c.address}</p>
        </div>
        <TonePill tone="teal">{state.facilities.find(f => f.id === c.facilityId)?.name}</TonePill>
      </div>
      <div className="mb-4">
        <Tabs active={tab} onChange={setTab} tabs={[{ key: "meters", label: "Meters", count: meters.length }, { key: "vending", label: "Vending History", count: vending.length }, { key: "funding", label: "Funding History", count: funding.length }]} />
      </div>

      {tab === "meters" && (
        <Card className="anim-rise">
          {meters.length === 0 ? <div className="p-5"><EmptyState icon="gauge" title="No meters registered" sub="Meters link here after installation and activation complete." /></div> : (
            <div className="divide-y divide-line/70">
              {meters.map(m => (
                <div key={m.number} className="flex items-center gap-3 px-4 py-3">
                  <Icon name="gauge" size={16} className="text-volt2" />
                  <span className="flex-1"><span className="block font-mono text-[13px] font-bold">{m.number}</span><span className="block text-[11px] text-mute">{m.model} · {m.phase}{m.activatedAt ? ` · activated ${fmtDate(m.activatedAt)}` : ""}</span></span>
                  <TonePill tone={m.status === "ACTIVE" ? "green" : m.status === "INSTALLED" ? "teal" : m.status === "FAULTY" ? "red" : "gray"}>{m.status}</TonePill>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === "vending" && (
        <Card className="anim-rise"><div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left">
          <thead><tr className="border-b border-line bg-paper text-[10px] font-extrabold tracking-widest text-mute"><th className="px-4 py-2.5">DATE</th><th className="px-4 py-2.5">ENERGY</th><th className="px-4 py-2.5">AMOUNT</th><th className="px-4 py-2.5">TOKEN</th><th className="px-4 py-2.5">ZVEND REF</th></tr></thead>
          <tbody>{vending.map(v => (
            <tr key={v.id} className="border-b border-line/60 last:border-0">
              <td className="px-4 py-2.5 font-mono text-[11px] text-mute">{fmtDate(v.date)}</td>
              <td className="px-4 py-2.5 font-mono text-[12px] font-bold tnum">{v.kwh} kWh</td>
              <td className="px-4 py-2.5 font-mono text-[12px] font-bold text-ok tnum">₦{v.amount.toLocaleString()}</td>
              <td className="px-4 py-2.5 font-mono text-[10.5px] text-ink2">{v.token.slice(0, 4)} {v.token.slice(4, 8)} …</td>
              <td className="px-4 py-2.5 font-mono text-[10.5px] text-info">{v.ref}</td>
            </tr>))}</tbody>
        </table></div></Card>
      )}

      {tab === "funding" && (
        <Card className="anim-rise"><div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left">
          <thead><tr className="border-b border-line bg-paper text-[10px] font-extrabold tracking-widest text-mute"><th className="px-4 py-2.5">DATE</th><th className="px-4 py-2.5">AMOUNT</th><th className="px-4 py-2.5">CHANNEL</th><th className="px-4 py-2.5">REFERENCE</th></tr></thead>
          <tbody>{funding.map(v => (
            <tr key={v.id} className="border-b border-line/60 last:border-0">
              <td className="px-4 py-2.5 font-mono text-[11px] text-mute">{fmtDate(v.date)}</td>
              <td className="px-4 py-2.5 font-mono text-[12px] font-bold text-ok tnum">₦{v.amount.toLocaleString()}</td>
              <td className="px-4 py-2.5 text-[12px] font-semibold">{v.channel}</td>
              <td className="px-4 py-2.5 font-mono text-[10.5px] text-info">{v.ref}</td>
            </tr>))}</tbody>
        </table></div></Card>
      )}
    </div>
  );
}

// ============================================================
// Meters
// ============================================================
export function MetersPage() {
  const { state } = useStore();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const list = state.meters.filter(m => (!q.trim() || m.number.includes(q.replace(/\D/g, "")) || (m.customerName ?? "").toLowerCase().includes(q.toLowerCase())) && (status === "ALL" || m.status === status));
  return (
    <div className="mx-auto max-w-[1100px]">
      <SectionHead title="Meters" sub={`${state.meters.length} meters in registry · numbers are globally unique`} />
      <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_220px]">
        <div className="relative">
          <Icon name="search" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
          <TextInput value={q} onChange={e => setQ(e.target.value)} placeholder="Search meter number or customer…" className="pl-8.5" />
        </div>
        <Select value={status} onChange={e => setStatus(e.target.value)}>
          <option value="ALL">All statuses</option>
          {["IN_STOCK", "INSTALLED", "ACTIVE", "FAULTY"].map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </Select>
      </div>
      <Card className="anim-rise">
        <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left">
          <thead><tr className="border-b border-line bg-paper text-[10px] font-extrabold tracking-widest text-mute">
            <th className="px-4 py-2.5">METER NUMBER</th><th className="px-4 py-2.5">FACILITY</th><th className="px-4 py-2.5">MODEL</th><th className="px-4 py-2.5">STATUS</th><th className="px-4 py-2.5">CUSTOMER</th><th className="px-4 py-2.5">INSTALLED</th>
          </tr></thead>
          <tbody>
            {list.map(m => (
              <tr key={m.number} className="border-b border-line/60 last:border-0 hover:bg-paper/60">
                <td className="px-4 py-3 font-mono text-[12.5px] font-bold">{m.number}</td>
                <td className="px-4 py-3 text-[12px] font-semibold">{state.facilities.find(f => f.id === m.facilityId)?.name}</td>
                <td className="px-4 py-3 text-[12px] text-ink2">{m.model} · {m.phase}</td>
                <td className="px-4 py-3"><TonePill tone={m.status === "ACTIVE" ? "green" : m.status === "INSTALLED" ? "teal" : m.status === "FAULTY" ? "red" : "gray"}>{m.status}</TonePill></td>
                <td className="px-4 py-3 text-[12px] font-semibold">{m.customerName ?? "—"}</td>
                <td className="px-4 py-3 font-mono text-[11px] text-mute">{m.installedAt ? fmtDate(m.installedAt) : "—"}</td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-[12px] text-mute">No meters match.</td></tr>}
          </tbody>
        </table></div>
      </Card>
    </div>
  );
}
