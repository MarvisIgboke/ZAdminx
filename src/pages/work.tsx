import { useMemo, useState } from "react";
import type { Op, OpType } from "../lib/core";
import { actionableBy, age, fmtDT, OPS, OP_ORDER, ROLE_LABEL, STAGES, STATUS_META } from "../lib/core";
import { useStore } from "../lib/core";
import { taskCounts } from "../components/shell";
import { Bars, Btn, Card, EmptyState, Icon, SectionHead, StatusPill, Tabs, TonePill, useRoute } from "../components/ui";

/* ================= Login ================= */
export function LoginPage() {
  const { state, login } = useStore();
  const live = state.operations.filter(o => !["COMPLETED", "CANCELLED"].includes(o.status)).length;
  return (
    <div className="flex min-h-full">
      <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-side p-10 lg:flex">
        <div className="bg-circuit absolute inset-0" />
        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-volt text-ink"><Icon name="bolt" size={22} /></span>
          <div><p className="font-display text-[22px] font-bold tracking-tight text-paper">Z ADMIN</p><p className="text-[9.5px] font-extrabold tracking-[0.24em] text-[#7d8b82]">ZAROX ENERGY SOLUTIONS</p></div>
        </div>
        <div className="relative">
          <p className="font-display text-[34px] font-bold leading-tight tracking-tight text-paper">Five operations.<br />One auditable chain.</p>
          <p className="mt-3 max-w-sm text-[13px] leading-relaxed text-[#a8b3ab]">Meter Installation, Activation, Inspection, Tamper Code and Clear Code — every decision commented, every ZVend call idempotent.</p>
          <div className="mt-6 grid grid-cols-5 gap-2">
            {OP_ORDER.map(t => (
              <div key={t} className="rounded-lg border border-side3 bg-side2 p-2.5 text-center">
                <Icon name={OPS[t].icon} size={16} className="mx-auto text-volt" />
                <p className="mt-1.5 text-[8px] font-extrabold tracking-wider text-[#a8b3ab]">{OPS[t].short.toUpperCase()}</p>
                <p className="font-display text-[15px] font-bold text-paper tnum">{state.operations.filter(o => o.type === t).length}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="relative flex items-center gap-2 text-[10px] font-extrabold tracking-[0.2em] text-[#5d6b62]"><span className="h-1.5 w-1.5 rounded-full bg-volt livedot" />{live} LIVE OPERATIONS · ZVEND LINKED</p>
      </div>
      <div className="flex flex-1 items-center justify-center bg-dots p-4 sm:p-6">
        <div className="w-full max-w-md anim-rise">
          {/* Compact brand block for phones — the full panel renders at lg+ */}
          <div className="mb-6 rounded-2xl border border-side3 bg-side p-4 lg:hidden">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-volt text-ink"><Icon name="bolt" size={18} /></span>
              <div>
                <p className="font-display text-[16px] font-bold leading-none tracking-tight text-paper">Z ADMIN</p>
                <p className="mt-1 text-[8px] font-extrabold tracking-[0.22em] text-[#7d8b82]">ZAROX ENERGY · FIELD OPERATIONS</p>
              </div>
              <span className="ml-auto flex items-center gap-1.5 text-[9px] font-extrabold tracking-widest text-[#7d8b82]"><span className="h-1.5 w-1.5 rounded-full bg-volt livedot" />{live} LIVE</span>
            </div>
            <div className="mt-3 grid grid-cols-5 gap-1.5">
              {OP_ORDER.map(t => (
                <div key={t} className="rounded-lg border border-side3 bg-side2 px-1 py-2 text-center">
                  <Icon name={OPS[t].icon} size={14} className="mx-auto text-volt" />
                  <p className="mt-1 font-display text-[13px] font-bold text-paper tnum">{state.operations.filter(o => o.type === t).length}</p>
                </div>
              ))}
            </div>
          </div>
          <h1 className="font-display text-[22px] font-bold tracking-tight sm:text-[24px]">Sign in to Z Admin</h1>
          <p className="mt-1 text-[12.5px] text-mute">Select a workspace identity — permissions follow the role matrix.</p>
          <div className="mt-5 space-y-2">
            {state.users.filter(u => u.active).map(u => (
              <button key={u.id} onClick={() => login(u.id)}
                className="group flex w-full items-center gap-3 rounded-xl border border-line bg-card p-3 text-left transition-all hover:-translate-y-0.5 hover:border-volt hover:shadow-md">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-[10.5px] font-extrabold text-volt">{u.name.split(" ").map(w => w[0]).join("").slice(0, 2)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-extrabold">{u.name}</span>
                  <span className="block text-[10.5px] font-bold tracking-wider text-mute">{ROLE_LABEL[u.role].toUpperCase()}</span>
                </span>
                <Icon name="arrowR" size={15} className="text-mute transition-all group-hover:translate-x-0.5 group-hover:text-volt2" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================= Dashboard ================= */
const PENDING_SET = ["PENDING", "WAITING_ZVEND", "ZVEND_SUCCESS", "ZVEND_FAILED", "ASSIGNED", "SCHEDULED", "RETURNED", "IN_PROGRESS"];
export function DashboardPage() {
  const { state, user, can, online, syncing, delegation } = useStore();
  const { nav } = useRoute();
  const [tab, setTab] = useState("records");
  if (!user) return null;
  const counts = taskCounts(state, user.role, delegation);
  const queue = state.operations.filter(o => actionableBy(o, delegation) === user.role);
  const isTech = user.role === "TECHNICAL_MAN";
  const byType = (t: OpType) => {
    const ops = state.operations.filter(o => o.type === t);
    return {
      pending: ops.filter(o => PENDING_SET.includes(o.status)).length,
      progress: ops.filter(o => o.status === "IN_PROGRESS").length,
      done: ops.filter(o => o.status === "COMPLETED").length,
    };
  };
  const days = useMemo(() => {
    const out: { label: string; a: number; b?: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      const next = d.getTime() + 86400000;
      out.push({ label: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }), a: state.operations.filter(o => o.createdAt >= d.getTime() && o.createdAt < next).length, b: state.operations.filter(o => o.updatedAt >= d.getTime() && o.updatedAt < next && o.status === "COMPLETED").length });
    }
    return out;
  }, [state.operations]);
  const recentRecords = state.operations.slice(0, 6);
  const recentAudit = state.audit.slice(0, 7);
  const facOf = (op: Op) => state.facilities.find(f => f.id === op.facilityId)?.name ?? "—";

  const recordsTable = (
    <>
      {/* Stacked rows on phones */}
      <div className="divide-y divide-line/70 sm:hidden">
        {recentRecords.map(op => (
          <button key={op.id} onClick={() => nav(`${OPS[op.type].path}/${op.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-paper">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink/6 text-ink2"><Icon name={OPS[op.type].icon} size={14} /></span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2"><span className="truncate font-mono text-[11px] font-bold">{op.txn}</span><StatusPill status={op.status} /></span>
              <span className="mt-0.5 block truncate text-[11px] text-mute">{OPS[op.type].short} · meter {op.meterNumber} · {STAGES[op.type][Math.min(op.stageIdx, STAGES[op.type].length - 1)].label}</span>
            </span>
          </button>
        ))}
      </div>
      {/* Table at sm+ */}
      <div className="hidden overflow-x-auto sm:block"><table className="w-full min-w-[620px] text-left">
        <thead><tr className="bg-paper text-[10px] font-extrabold tracking-widest text-mute"><th className="px-4 py-2">TRANSACTION</th><th className="px-4 py-2">OPERATION</th><th className="px-4 py-2">METER</th><th className="px-4 py-2">STAGE</th><th className="px-4 py-2">STATUS</th></tr></thead>
        <tbody>{recentRecords.map(op => (
          <tr key={op.id} onClick={() => nav(`${OPS[op.type].path}/${op.id}`)} className="cursor-pointer border-t border-line/70 transition-colors hover:bg-paper">
            <td className="px-4 py-2.5 font-mono text-[11.5px] font-bold">{op.txn}</td>
            <td className="px-4 py-2.5"><span className="flex items-center gap-1.5 text-[12px] font-bold"><Icon name={OPS[op.type].icon} size={13} className="text-volt2" />{OPS[op.type].short}</span></td>
            <td className="px-4 py-2.5 font-mono text-[11.5px] text-ink2">{op.meterNumber}</td>
            <td className="px-4 py-2.5 text-[11.5px] font-semibold text-mute">{STAGES[op.type][Math.min(op.stageIdx, STAGES[op.type].length - 1)].label}</td>
            <td className="px-4 py-2.5"><StatusPill status={op.status} /></td>
          </tr>))}</tbody>
      </table></div>
    </>
  );
  const auditList = (
    <div className="divide-y divide-line/70">{recentAudit.map(a => (
      <div key={a.id} className="px-4 py-2.5">
        <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-volt" /><p className="min-w-0 flex-1 truncate text-[12px] font-bold">{a.action.replace(/_/g, " ")}</p><span className="font-mono text-[9.5px] text-mute">{age(a.at)}</span></div>
        <p className="mt-0.5 truncate pl-3.5 text-[11px] text-mute">{a.detail}</p>
      </div>))}</div>
  );
  const chainList = (
    <div className="p-4">
      <p className="mb-3 text-[11.5px] text-mute">Universal approval order for all five operations:</p>
      <div className="space-y-1.5">{["Secretary / Initiator", "Energy Manager", "General Manager", "Managing Director", "ZVend (where applicable)", "Secretary / Technical Man"].map((s, i, arr) => (
        <div key={s} className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-[10px] font-extrabold text-volt tnum">{i + 1}</span>
          <span className="text-[12px] font-bold text-ink2">{s}</span>
          {i < arr.length - 1 && <span className="ml-auto text-[10px] text-mute">↓</span>}
        </div>))}</div>
    </div>
  );

  return (
    <div className="mx-auto max-w-[1240px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 anim-rise">
        <div>
          <p className="text-[11px] font-extrabold tracking-[0.18em] text-volt2">{new Date().toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).toUpperCase()}</p>
          <h1 className="mt-1 font-display text-[26px] font-bold leading-tight tracking-tight">Welcome back, {user.name.split(" ")[0]}.</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <TonePill tone="ink">{ROLE_LABEL[user.role].toUpperCase()}</TonePill>
            {delegation && user.role === "GENERAL_MANAGER" && <TonePill tone="amber">MD DELEGATION ACTIVE</TonePill>}
            <span className="text-[12px] font-semibold text-mute">{queue.length > 0 ? `${queue.length} task${queue.length > 1 ? "s" : ""} awaiting your action` : "queue clear — nothing awaiting your action"}</span>
          </div>
        </div>
        {isTech && (
          <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[11.5px] font-extrabold ${online ? "border-[#c2ddcd] bg-oksoft text-ok" : "border-[#eac5be] bg-dangersoft text-danger"}`}>
            <Icon name={online ? "wifi" : "wifioff"} size={14} />{syncing ? "SYNCING…" : online ? "FIELD LINK ONLINE" : "OFFLINE — QUEUE ACTIVE"}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {OP_ORDER.map((t, i) => {
          const s = byType(t);
          return (
            <Card key={t} onClick={() => nav(OPS[t].path)} className="anim-rise p-4">
              <div className="flex items-start justify-between" style={{ animationDelay: `${i * 45}ms` }}>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-volt"><Icon name={OPS[t].icon} size={17} /></span>
                {counts[t] > 0 && <span className="rounded-md bg-volt px-1.5 py-0.5 text-[10.5px] font-extrabold text-ink tnum">{counts[t]} for you</span>}
              </div>
              <p className="mt-3 font-display text-[14.5px] font-bold leading-tight">{OPS[t].label}</p>
              <div className="mt-2.5 grid grid-cols-3 gap-1 border-t border-line pt-2.5">
                <div><p className="font-display text-[17px] font-bold leading-none text-warn tnum">{s.pending}</p><p className="mt-0.5 text-[9px] font-extrabold tracking-wider text-mute">PENDING</p></div>
                <div><p className="font-display text-[17px] font-bold leading-none text-info tnum">{s.progress}</p><p className="mt-0.5 text-[9px] font-extrabold tracking-wider text-mute">IN PROG</p></div>
                <div><p className="font-display text-[17px] font-bold leading-none text-ok tnum">{s.done}</p><p className="mt-0.5 text-[9px] font-extrabold tracking-wider text-mute">DONE</p></div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {isTech && (
            <Card className="anim-rise p-4">
              <h2 className="mb-3 font-display text-[15.5px] font-bold">Field tasks</h2>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <button onClick={() => nav("meter-activation/start")} className="flex items-center gap-3 rounded-xl border-2 border-volt/60 bg-voltsoft p-4 text-left transition-all hover:-translate-y-0.5 hover:border-volt">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-volt text-ink"><Icon name="power" size={20} /></span>
                  <span><span className="block font-display text-[14.5px] font-bold">START ACTIVATION</span><span className="text-[11px] font-bold text-volt2">scan · GPS · photos · customer</span></span>
                </button>
                <button onClick={() => nav("meter-inspection")} className="flex items-center gap-3 rounded-xl border border-line bg-paper p-4 text-left transition-all hover:-translate-y-0.5 hover:border-ink/40">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink text-volt"><Icon name="clipboard" size={20} /></span>
                  <span><span className="block font-display text-[14.5px] font-bold">INSPECTIONS</span><span className="text-[11px] font-bold text-mute">{state.operations.filter(o => o.type === "inspection" && ["SCHEDULED", "REJECTED", "IN_PROGRESS"].includes(o.status)).length} awaiting field action</span></span>
                </button>
                <button onClick={() => nav("tamper-code/request")} className="flex items-center gap-3 rounded-xl border border-line bg-paper p-4 text-left transition-all hover:-translate-y-0.5 hover:border-ink/40">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink text-volt"><Icon name="shield" size={20} /></span>
                  <span><span className="block font-display text-[14.5px] font-bold">TAMPER CODE</span><span className="text-[11px] font-bold text-mute">request via barcode scan</span></span>
                </button>
                <button onClick={() => nav("clear-code/request")} className="flex items-center gap-3 rounded-xl border border-line bg-paper p-4 text-left transition-all hover:-translate-y-0.5 hover:border-ink/40">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink text-volt"><Icon name="key" size={20} /></span>
                  <span><span className="block font-display text-[14.5px] font-bold">CLEAR CODE</span><span className="text-[11px] font-bold text-mute">request via barcode scan</span></span>
                </button>
              </div>
            </Card>
          )}

          {["SECRETARY", "ENERGY_MANAGER", "GENERAL_MANAGER", "MD"].includes(user.role) && (
            <Card className="anim-rise">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <h2 className="font-display text-[15.5px] font-bold">{user.role === "SECRETARY" ? "Your action required" : "Your approval queue"}</h2>
                {can("approvals.view") && <Btn size="sm" variant="ghost" onClick={() => nav("approvals")}>Open Approvals<Icon name="arrowR" size={13} /></Btn>}
              </div>
              <div className="divide-y divide-line/70">
                {queue.slice(0, 6).map(op => (
                  <button key={op.id} onClick={() => nav(`${OPS[op.type].path}/${op.id}`)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-paper">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink/6 text-ink2"><Icon name={OPS[op.type].icon} size={15} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[12px] font-bold">{op.txn}</span>
                      <span className="block truncate text-[11px] text-mute">meter {op.meterNumber} · {facOf(op)} · {age(op.updatedAt)} ago</span>
                    </span>
                    <StatusPill status={op.status} pulse />
                  </button>
                ))}
                {queue.length === 0 && <p className="px-4 py-6 text-center text-[12.5px] text-mute">Nothing awaiting your action — the chain is clear.</p>}
              </div>
            </Card>
          )}

          {user.role === "GENERAL_MANAGER" && (
            <Card className="anim-rise p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="font-display text-[15.5px] font-bold">Inspection scheduling</h2><p className="text-[12px] text-mute">{state.operations.filter(o => o.type === "inspection" && o.status === "SCHEDULED").length} scheduled · durations configured by Super Admin</p></div>
                <Btn variant="volt" icon="calendar" onClick={() => nav("meter-inspection/schedule")}>Schedule inspection</Btn>
              </div>
            </Card>
          )}

          {(user.role === "SUPER_ADMIN" || user.role === "IT_MANAGER") && (
            <Card className="anim-rise">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <h2 className="font-display text-[15.5px] font-bold">ZVend integration health</h2>
                {can("admin.apilogs") && <Btn size="sm" variant="ghost" onClick={() => nav("admin/api-logs")}>API logs<Icon name="arrowR" size={13} /></Btn>}
              </div>
              <div className="grid gap-px bg-line sm:grid-cols-3">
                <div className="bg-card p-4"><p className="font-display text-[22px] font-bold text-ok tnum">{state.apiLogs.filter(l => l.status === "success").length}</p><p className="text-[10.5px] font-extrabold tracking-wider text-mute">SUCCESSFUL CALLS</p></div>
                <div className="bg-card p-4"><p className="font-display text-[22px] font-bold text-danger tnum">{state.apiLogs.filter(l => l.status === "failed").length}</p><p className="text-[10.5px] font-extrabold tracking-wider text-mute">FAILED CALLS</p></div>
                <div className="bg-card p-4"><p className="font-display text-[22px] font-bold text-info tnum">{Math.round(state.apiLogs.reduce((a, l) => a + l.durationMs, 0) / Math.max(1, state.apiLogs.length))} ms</p><p className="text-[10.5px] font-extrabold tracking-wider text-mute">AVG LATENCY</p></div>
              </div>
            </Card>
          )}

          {isTech ? (
            <Card className="anim-rise">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                <h2 className="font-display text-[15.5px] font-bold">Operations ledger</h2>
                <Tabs active={tab} onChange={setTab} tabs={[
                  { key: "records", label: "Latest records", count: recentRecords.length },
                  { key: "audit", label: "Audit events", count: recentAudit.length },
                  { key: "chain", label: "Workflow chain" },
                ]} />
              </div>
              <div key={tab} className="anim-fade">
                {tab === "records" && recordsTable}
                {tab === "audit" && auditList}
                {tab === "chain" && chainList}
              </div>
            </Card>
          ) : (
            <Card className="anim-rise">
              <div className="border-b border-line px-4 py-3"><h2 className="font-display text-[15.5px] font-bold">Latest records</h2></div>
              {recordsTable}
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card className="anim-rise p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-[14.5px] font-bold">Activity · 14 days</h2>
              <span className="flex items-center gap-1.5 text-[10px] font-extrabold text-mute"><span className="h-2 w-2 rounded-sm bg-ink/80" />CREATED <span className="ml-2 h-2 w-2 rounded-sm bg-volt/70" />DONE</span>
            </div>
            <Bars data={days} height={74} />
          </Card>
          {!isTech && (
            <>
              <Card className="anim-rise">
                <div className="border-b border-line px-4 py-3"><h2 className="font-display text-[14.5px] font-bold">Recent audit events</h2></div>
                {auditList}
              </Card>
              <Card className="anim-rise">
                <div className="border-b border-line px-4 py-3"><h2 className="font-display text-[14.5px] font-bold">Workflow chain</h2></div>
                {chainList}
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================= Approvals ================= */
export function ApprovalsPage() {
  const { state, user, delegation } = useStore();
  const { nav } = useRoute();
  const [tab, setTab] = useState("all");
  if (!user) return null;
  const queue = state.operations.filter(o => actionableBy(o, delegation) === user.role);
  const shown = tab === "all" ? queue : queue.filter(o => o.type === tab);
  return (
    <div className="mx-auto max-w-[1040px]">
      <SectionHead title="Approval Center" sub={`${queue.length} records await a decision from ${ROLE_LABEL[user.role]}${delegation && user.role === "GENERAL_MANAGER" ? " (incl. delegated MD stage)" : ""}. Every decision requires a comment.`} />
      <div className="mb-4"><Tabs active={tab} onChange={setTab} tabs={[{ key: "all", label: "All", count: queue.length }, ...OP_ORDER.map(t => ({ key: t, label: OPS[t].short, count: queue.filter(o => o.type === t).length }))]} /></div>
      <Card className="anim-rise">
        {shown.length === 0 ? <div className="p-5"><EmptyState icon="approve" title="Queue clear" sub="No records are awaiting your decision right now." /></div> : (
          <div className="divide-y divide-line/70">
            {shown.map(op => (
              <button key={op.id} onClick={() => nav(`${OPS[op.type].path}/${op.id}`)} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-paper">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink/6 text-ink2"><Icon name={OPS[op.type].icon} size={16} /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2"><span className="font-mono text-[12px] font-bold">{op.txn}</span><TonePill tone="gray">{OPS[op.type].short.toUpperCase()}</TonePill></span>
                  <span className="block text-[11px] text-mute">meter {op.meterNumber} · {state.facilities.find(f => f.id === op.facilityId)?.name} · by {op.initiatorName}</span>
                </span>
                <span className="text-[10.5px] font-extrabold text-mute">{STAGES[op.type][Math.min(op.stageIdx, STAGES[op.type].length - 1)].label}</span>
                <span className="font-mono text-[10.5px] text-mute">{age(op.updatedAt)} old</span>
                <StatusPill status={op.status} pulse />
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ================= Notifications ================= */
export function NotificationsPage() {
  const { state, user, markRead, markAllRead } = useStore();
  const { nav } = useRoute();
  const [tab, setTab] = useState("all");
  if (!user) return null;
  const mine = state.notifications.filter(n => n.forRole === "ALL" || n.forRole === user.role);
  const shown = tab === "unread" ? mine.filter(n => !n.read) : mine;
  const unread = mine.filter(n => !n.read).length;
  return (
    <div className="mx-auto max-w-[860px]">
      <SectionHead title="Notifications" sub={`${unread} unread · delivered in-app per role and stage`} right={<Btn variant="outline" icon="check" onClick={markAllRead} disabled={unread === 0}>Mark all read</Btn>} />
      <div className="mb-4"><Tabs active={tab} onChange={setTab} tabs={[{ key: "all", label: "All", count: mine.length }, { key: "unread", label: "Unread", count: unread }]} /></div>
      <Card className="anim-rise">
        {shown.length === 0 ? <div className="p-5"><EmptyState icon="bell" title="Nothing here" sub={tab === "unread" ? "Every notification has been read." : "Notifications arrive as workflows move."} /></div> : (
          <div className="divide-y divide-line/70">
            {shown.map(n => (
              <button key={n.id} onClick={() => { markRead(n.id); if (n.opId) { const op = state.operations.find(o => o.id === n.opId); if (op) nav(`${OPS[op.type].path}/${op.id}`); } }}
                className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-paper ${n.read ? "opacity-55" : ""}`}>
                <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${n.kind === "approval" ? "bg-warnsoft text-warn" : n.kind === "zvend" ? "bg-infosoft text-info" : n.kind === "field" ? "bg-tealsoft text-teal" : "bg-paper text-mute"}`}>
                  <Icon name={n.kind === "approval" ? "approve" : n.kind === "zvend" ? "plug" : n.kind === "field" ? "wrench" : "settings"} size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <TonePill tone={n.kind === "approval" ? "amber" : n.kind === "zvend" ? "blue" : n.kind === "field" ? "teal" : "gray"}>{n.kind.toUpperCase()}</TonePill>
                    {n.txn && <span className="font-mono text-[10.5px] font-bold text-mute">{n.txn}</span>}
                    {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-volt livedot" />}
                    <span className="ml-auto font-mono text-[10px] text-mute">{age(n.at)} ago</span>
                  </span>
                  <span className="mt-1 block text-[13px] font-semibold leading-snug">{n.text}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ================= History (Technical Man) ================= */
export function HistoryPage() {
  const { state, user } = useStore();
  const rows = state.audit.filter(a => a.userId === user?.id || ["barcode_scan", "gps_capture", "photo_capture", "video_capture", "suspicious_gps", "barcode_mismatch", "sync"].includes(a.action));
  return (
    <div className="mx-auto max-w-[960px]">
      <SectionHead title="History" sub="Append-only audit trail — scans, GPS captures, media and syncs. Immutable, never deleted." />
      <Card className="anim-rise">
        <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left">
          <thead><tr className="border-b border-line bg-paper text-[10px] font-extrabold tracking-widest text-mute"><th className="px-4 py-2.5">TIME</th><th className="px-4 py-2.5">ACTOR</th><th className="px-4 py-2.5">EVENT</th><th className="px-4 py-2.5">DETAIL</th><th className="px-4 py-2.5">TXN</th></tr></thead>
          <tbody>{rows.map(a => (
            <tr key={a.id} className="border-b border-line/60 last:border-0">
              <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11px] text-mute">{fmtDT(a.at)}</td>
              <td className="px-4 py-2.5 text-[12px] font-bold">{a.userName}</td>
              <td className="px-4 py-2.5"><TonePill tone={a.action.includes("mismatch") || a.action.includes("suspicious") ? "red" : ["barcode_scan", "gps_capture", "photo_capture", "video_capture"].includes(a.action) ? "teal" : "gray"}>{a.action.replace(/_/g, " ").toUpperCase()}</TonePill></td>
              <td className="px-4 py-2.5 text-[12px] text-ink2">{a.detail}</td>
              <td className="px-4 py-2.5 font-mono text-[10.5px] text-mute">{a.txn ?? "—"}</td>
            </tr>))}</tbody>
        </table></div>
      </Card>
    </div>
  );
}
