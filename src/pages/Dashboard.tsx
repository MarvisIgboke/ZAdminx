import { useMemo } from "react";
import type { Op, OpType } from "../lib/types";
import { actionableBy, age, fmtDT, OPS, OP_ORDER, ROLE_LABEL, STATUS_META, STAGES } from "../lib/types";
import { useStore } from "../lib/store";
import { taskCounts } from "../components/layout";
import { Bars, Btn, Card, Icon, StatusPill, TonePill, useRoute } from "../components/ui";

const PENDING_SET = ["PENDING_ENERGY_MANAGER", "PENDING_GM", "PENDING_MD", "PENDING_SECRETARY", "SCHEDULED", "WAITING_ZVEND", "ZVEND_SUCCESS", "ZVEND_FAILED", "ASSIGNED", "RETURNED"];

export default function DashboardPage() {
  const { state, user, can, online, syncing, delegation } = useStore();
  const { nav } = useRoute();
  if (!user) return null;

  const counts = taskCounts(state, user.role, !!delegation);
  const isApprover = ["ENERGY_MANAGER", "GENERAL_MANAGER", "MD"].includes(user.role);

  const queue = useMemo(() => state.operations.filter(o => actionableBy(o, !!delegation) === user.role), [state.operations, user.role, delegation]);

  const byType = (t: OpType) => {
    const ops = state.operations.filter(o => o.type === t);
    return {
      pending: ops.filter(o => PENDING_SET.includes(o.status)).length,
      progress: ops.filter(o => o.status === "IN_PROGRESS").length,
      done: ops.filter(o => o.status === "COMPLETED").length,
      scheduled: ops.filter(o => o.status === "SCHEDULED").length,
    };
  };

  const days = useMemo(() => {
    const out: { label: string; a: number; b?: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      const next = d.getTime() + 86400000;
      out.push({
        label: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
        a: state.operations.filter(o => o.createdAt >= d.getTime() && o.createdAt < next).length,
        b: state.operations.filter(o => o.updatedAt >= d.getTime() && o.updatedAt < next && o.status === "COMPLETED").length,
      });
    }
    return out;
  }, [state.operations]);

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const facilityOf = (op: Op) => state.facilities.find(f => f.id === op.facilityId)?.name ?? "—";

  return (
    <div className="mx-auto max-w-[1240px] space-y-5">
      {/* header */}
      <div className="flex flex-wrap items-end justify-between gap-3 anim-rise">
        <div>
          <p className="text-[11px] font-extrabold tracking-[0.18em] text-volt2">
            {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).toUpperCase()}
          </p>
          <h1 className="mt-1 font-display text-[26px] font-bold leading-tight tracking-tight">{greet}, {user.name.split(" ")[0]}.</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <TonePill tone="ink">{ROLE_LABEL[user.role].toUpperCase()}</TonePill>
            {delegation && user.role === "GENERAL_MANAGER" && <TonePill tone="amber">MD DELEGATION ACTIVE</TonePill>}
            <span className="text-[12px] font-semibold text-mute">
              {queue.length > 0 ? `${queue.length} task${queue.length > 1 ? "s" : ""} awaiting your action` : "queue clear — nothing awaiting your action"}
            </span>
          </div>
        </div>
        {user.role === "TECHNICAL_MAN" && (
          <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[11.5px] font-extrabold ${online ? "border-[#c2ddcd] bg-oksoft text-ok" : "border-[#eac5be] bg-dangersoft text-danger"}`}>
            <Icon name={online ? "wifi" : "wifioff"} size={14} />
            {syncing ? "SYNCING…" : online ? "FIELD LINK ONLINE" : "OFFLINE — QUEUE ACTIVE"}
          </div>
        )}
      </div>

      {/* five core operation cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {OP_ORDER.map((t, i) => {
          const s = byType(t);
          return (
            <Card key={t} onClick={() => nav(OPS[t].path)} className="anim-rise p-4" >
              <div className="flex items-start justify-between" style={{ animationDelay: `${i * 45}ms` }}>
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-volt"><Icon name={OPS[t].icon} size={17} /></span>
                {counts[t] > 0 && <span className="rounded-md bg-volt px-1.5 py-0.5 text-[10.5px] font-extrabold text-ink tnum">{counts[t]} for you</span>}
              </div>
              <p className="mt-3 font-display text-[14.5px] font-bold leading-tight">{OPS[t].label}</p>
              <div className="mt-2.5 grid grid-cols-3 gap-1 border-t border-line pt-2.5">
                <div><p className="font-display text-[17px] font-bold leading-none text-warn tnum">{t === "inspection" ? s.scheduled : s.pending}</p><p className="mt-0.5 text-[9px] font-extrabold tracking-wider text-mute">{t === "inspection" ? "SCHED" : "PENDING"}</p></div>
                <div><p className="font-display text-[17px] font-bold leading-none text-info tnum">{s.progress}</p><p className="mt-0.5 text-[9px] font-extrabold tracking-wider text-mute">IN PROG</p></div>
                <div><p className="font-display text-[17px] font-bold leading-none text-ok tnum">{s.done}</p><p className="mt-0.5 text-[9px] font-extrabold tracking-wider text-mute">DONE</p></div>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {/* role-specific queue */}
          {user.role === "TECHNICAL_MAN" && (
            <Card className="p-4 anim-rise">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-[15.5px] font-bold">Field tasks</h2>
                <span className="text-[11px] font-bold text-mute">{state.operations.filter(o => o.pendingSync).length} queued offline</span>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <button onClick={() => nav("meter-activation/start")} className="group flex items-center gap-3 rounded-xl border-2 border-volt/60 bg-voltsoft p-4 text-left transition-all hover:-translate-y-0.5 hover:border-volt">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-volt text-ink"><Icon name="power" size={20} /></span>
                  <span><span className="block font-display text-[14.5px] font-bold">START ACTIVATION</span><span className="text-[11px] font-bold text-volt2">scan · GPS · photos · customer</span></span>
                </button>
                <button onClick={() => nav("meter-inspection")} className="group flex items-center gap-3 rounded-xl border border-line bg-paper p-4 text-left transition-all hover:-translate-y-0.5 hover:border-ink/40">
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

          {(isApprover || user.role === "SECRETARY") && (
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
                      <span className="block truncate text-[11px] text-mute">meter {op.meterNumber} · {facilityOf(op)} · {age(op.updatedAt)} ago</span>
                    </span>
                    <StatusPill status={op.status} pulse />
                  </button>
                ))}
                {queue.length === 0 && <p className="px-4 py-6 text-center text-[12.5px] text-mute">Nothing awaiting your action — the chain is clear.</p>}
              </div>
            </Card>
          )}

          {(user.role === "GENERAL_MANAGER") && (
            <Card className="p-4 anim-rise">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-[15.5px] font-bold">Inspection scheduling</h2>
                  <p className="text-[12px] text-mute">{state.operations.filter(o => o.type === "inspection" && o.status === "SCHEDULED").length} scheduled · durations configured by Super Admin</p>
                </div>
                <Btn variant="volt" icon="calendar" onClick={() => nav("meter-inspection/schedule")}>Schedule inspection</Btn>
              </div>
            </Card>
          )}

          {(user.role === "SUPER_ADMIN" || user.role === "IT_MANAGER") && (
            <Card className="anim-rise">
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <h2 className="font-display text-[15.5px] font-bold">ZVend integration health</h2>
                <Btn size="sm" variant="ghost" onClick={() => nav("admin/api-logs")}>API logs<Icon name="arrowR" size={13} /></Btn>
              </div>
              <div className="grid gap-px bg-line sm:grid-cols-3">
                <div className="bg-card p-4"><p className="font-display text-[22px] font-bold text-ok tnum">{state.apiLogs.filter(l => l.status === "success").length}</p><p className="text-[10.5px] font-extrabold tracking-wider text-mute">SUCCESSFUL CALLS</p></div>
                <div className="bg-card p-4"><p className="font-display text-[22px] font-bold text-danger tnum">{state.apiLogs.filter(l => l.status === "failed").length}</p><p className="text-[10.5px] font-extrabold tracking-wider text-mute">FAILED CALLS</p></div>
                <div className="bg-card p-4"><p className="font-display text-[22px] font-bold text-info tnum">{Math.round(state.apiLogs.reduce((a, l) => a + l.durationMs, 0) / Math.max(1, state.apiLogs.length))} ms</p><p className="text-[10.5px] font-extrabold tracking-wider text-mute">AVG LATENCY</p></div>
              </div>
              <div className="divide-y divide-line/70">
                {state.apiLogs.slice(0, 4).map(l => (
                  <div key={l.id} className="flex items-center gap-3 px-4 py-2">
                    <TonePill tone={l.status === "success" ? "green" : l.status === "failed" ? "red" : "blue"}>{l.status.toUpperCase()}</TonePill>
                    <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] font-bold">{l.endpoint}</span>
                    <span className="font-mono text-[10.5px] text-mute">{l.durationMs > 0 ? `${l.durationMs} ms` : "…"}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* recent records */}
          <Card className="anim-rise">
            <div className="border-b border-line px-4 py-3"><h2 className="font-display text-[15.5px] font-bold">Latest records</h2></div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left">
                <thead><tr className="bg-paper text-[10px] font-extrabold tracking-widest text-mute">
                  <th className="px-4 py-2">TRANSACTION</th><th className="px-4 py-2">OPERATION</th><th className="px-4 py-2">METER</th><th className="px-4 py-2">STAGE</th><th className="px-4 py-2">STATUS</th>
                </tr></thead>
                <tbody>
                  {state.operations.slice(0, 6).map(op => (
                    <tr key={op.id} onClick={() => nav(`${OPS[op.type].path}/${op.id}`)} className="cursor-pointer border-t border-line/70 transition-colors hover:bg-paper">
                      <td className="px-4 py-2.5 font-mono text-[11.5px] font-bold">{op.txn}</td>
                      <td className="px-4 py-2.5"><span className="flex items-center gap-1.5 text-[12px] font-bold"><Icon name={OPS[op.type].icon} size={13} className="text-volt2" />{OPS[op.type].short}</span></td>
                      <td className="px-4 py-2.5 font-mono text-[11.5px] text-ink2">{op.meterNumber}</td>
                      <td className="px-4 py-2.5 text-[11.5px] font-semibold text-mute">{STAGES[op.type][Math.min(op.stageIdx, STAGES[op.type].length - 1)].label}</td>
                      <td className="px-4 py-2.5"><StatusPill status={op.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* right column */}
        <div className="space-y-4">
          <Card className="p-4 anim-rise">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-[14.5px] font-bold">Activity · 14 days</h2>
              <span className="flex items-center gap-1.5 text-[10px] font-extrabold text-mute"><span className="h-2 w-2 rounded-sm bg-ink/80" />CREATED <span className="ml-2 h-2 w-2 rounded-sm bg-volt/70" />DONE</span>
            </div>
            <Bars data={days} height={74} />
          </Card>

          <Card className="anim-rise">
            <div className="border-b border-line px-4 py-3"><h2 className="font-display text-[14.5px] font-bold">Recent audit events</h2></div>
            <div className="divide-y divide-line/70">
              {state.audit.slice(0, 7).map(a => (
                <div key={a.id} className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-volt" />
                    <p className="min-w-0 flex-1 truncate text-[12px] font-bold">{a.action.replace(/_/g, " ")}</p>
                    <span className="font-mono text-[9.5px] text-mute">{age(a.at)}</span>
                  </div>
                  <p className="mt-0.5 truncate pl-3.5 text-[11px] text-mute">{a.detail}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4 anim-rise">
            <h2 className="font-display text-[14.5px] font-bold">Workflow chain</h2>
            <p className="mt-1 text-[11.5px] text-mute">Universal approval order for all five operations:</p>
            <div className="mt-3 space-y-1.5">
              {["Secretary / Initiator", "Energy Manager", "General Manager", "Managing Director", "ZVend (where applicable)", "Secretary / Technical Man"].map((s, i, arr) => (
                <div key={s} className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-[10px] font-extrabold text-volt tnum">{i + 1}</span>
                  <span className="text-[12px] font-bold text-ink2">{s}</span>
                  {i < arr.length - 1 && <span className="ml-auto text-[10px] text-mute">↓</span>}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
