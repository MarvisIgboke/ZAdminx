import { useMemo, useState } from "react";
import type { OpType } from "../lib/types";
import { actionableBy, age, OPS, OP_ORDER, ROLE_LABEL, STAGES } from "../lib/types";
import { useStore } from "../lib/store";
import { Card, EmptyState, Icon, SectionHead, StatusPill, Tabs, TonePill, useRoute } from "../components/ui";

export default function ApprovalsPage() {
  const { state, user, delegation } = useStore();
  const { nav } = useRoute();
  const [tab, setTab] = useState("all");

  const actionable = useMemo(() => state.operations.filter(o => actionableBy(o, !!delegation) === user?.role), [state.operations, user, delegation]);
  const shown = tab === "all" ? actionable : actionable.filter(o => o.type === (tab as OpType));

  const myDecisions = useMemo(() => {
    if (!user) return [];
    const out: { id: string; txn: string; type: OpType; decision: string; stage: string; text: string; at: number }[] = [];
    for (const op of state.operations) {
      for (const c of op.comments) {
        if (c.userId === user.id && ["APPROVE", "REJECT", "RETURN"].includes(c.decision)) {
          out.push({ id: c.id, txn: op.txn, type: op.type, decision: c.decision, stage: c.stage, text: c.text, at: c.at });
        }
      }
    }
    return out.sort((a, b) => b.at - a.at);
  }, [state.operations, user]);

  if (!user) return null;

  return (
    <div className="mx-auto max-w-[1240px]">
      <SectionHead title="Approval Center" sub={`Records currently awaiting ${ROLE_LABEL[user.role]} action · approvers only ever see records they are authorized to decide.`} />

      <div className="mb-4">
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { key: "all", label: "All", count: actionable.length },
            ...OP_ORDER.map(t => ({ key: t, label: OPS[t].short, count: actionable.filter(o => o.type === t).length })),
          ]}
        />
      </div>

      <Card className="anim-rise">
        {shown.length === 0 ? (
          <div className="p-5"><EmptyState icon="approve" title="No records awaiting your decision" sub="When a workflow reaches your stage, it appears here and in the sidebar badges." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead>
                <tr className="border-b border-line bg-paper text-[10px] font-extrabold tracking-widest text-mute">
                  <th className="px-4 py-2.5">OPERATION</th><th className="px-4 py-2.5">TRANSACTION</th><th className="px-4 py-2.5">METER</th>
                  <th className="px-4 py-2.5">FACILITY</th><th className="px-4 py-2.5">INITIATOR</th><th className="px-4 py-2.5">CURRENT STAGE</th>
                  <th className="px-4 py-2.5">AGE</th><th className="px-4 py-2.5">STATUS</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(op => (
                  <tr key={op.id} onClick={() => nav(`${OPS[op.type].path}/${op.id}`)} className="cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-paper">
                    <td className="px-4 py-3"><span className="flex items-center gap-2 text-[12px] font-bold"><span className="flex h-7 w-7 items-center justify-center rounded-md bg-ink/6 text-ink2"><Icon name={OPS[op.type].icon} size={13} /></span>{OPS[op.type].short}</span></td>
                    <td className="px-4 py-3 font-mono text-[11.5px] font-bold">{op.txn}</td>
                    <td className="px-4 py-3 font-mono text-[11.5px] text-ink2">{op.meterNumber}</td>
                    <td className="px-4 py-3 text-[12px] font-semibold">{state.facilities.find(f => f.id === op.facilityId)?.name}</td>
                    <td className="px-4 py-3 text-[12px] font-semibold">{op.initiatorName}</td>
                    <td className="px-4 py-3 text-[11.5px] font-semibold text-mute">
                      {STAGES[op.type][Math.min(op.stageIdx, STAGES[op.type].length - 1)].label}
                      {op.status === "PENDING_MD" && delegation && user.role === "GENERAL_MANAGER" && <TonePill tone="amber">DELEGATED</TonePill>}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-mute">{age(op.updatedAt)}</td>
                    <td className="px-4 py-3"><StatusPill status={op.status} pulse /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="mt-5">
        <h2 className="mb-2.5 font-display text-[16px] font-bold">Your recorded decisions</h2>
        <Card className="anim-rise">
          {myDecisions.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12.5px] text-mute">No decisions recorded yet under this profile.</p>
          ) : (
            <div className="divide-y divide-line/70">
              {myDecisions.slice(0, 8).map(d => (
                <div key={d.id} className="flex items-start gap-3 px-4 py-2.5">
                  <TonePill tone={d.decision === "APPROVE" ? "green" : d.decision === "REJECT" ? "red" : "orange"}>{d.decision}</TonePill>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-bold"><span className="font-mono">{d.txn}</span> · {d.stage}</p>
                    <p className="truncate text-[11.5px] text-mute">{d.text}</p>
                  </div>
                  <span className="font-mono text-[10.5px] text-mute">{age(d.at)} ago</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
