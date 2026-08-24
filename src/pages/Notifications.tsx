import { useMemo, useState } from "react";
import type { Op } from "../lib/types";
import { age, fmtDT, OPS, ROLE_LABEL } from "../lib/types";
import { useStore } from "../lib/store";
import { Btn, Card, EmptyState, Icon, SectionHead, Tabs, TonePill, useRoute } from "../components/ui";

const kindMeta = {
  approval: { icon: "approve", tone: "amber" as const, label: "APPROVAL" },
  zvend: { icon: "plug", tone: "blue" as const, label: "ZVEND" },
  field: { icon: "wrench", tone: "teal" as const, label: "FIELD" },
  system: { icon: "settings", tone: "gray" as const, label: "SYSTEM" },
};

export default function NotificationsPage() {
  const { state, user, markRead, markAllRead } = useStore();
  const { nav } = useRoute();
  const [tab, setTab] = useState("all");

  const mine = useMemo(() => {
    if (!user) return [];
    return state.notifications.filter(n => n.forRole === "ALL" || n.forRole === user.role || n.forUser === user.id);
  }, [state.notifications, user]);

  const shown = tab === "unread" ? mine.filter(n => !n.read) : mine;
  const unread = mine.filter(n => !n.read).length;
  if (!user) return null;

  const open = (n: (typeof mine)[number]) => {
    markRead(n.id);
    if (n.opId) {
      const op = state.operations.find(o => o.id === n.opId) as Op | undefined;
      if (op) nav(`${OPS[op.type].path}/${op.id}`);
    }
  };

  return (
    <div className="mx-auto max-w-[860px]">
      <SectionHead
        title="Notifications"
        sub={`${unread} unread · delivered in-app per role and stage`}
        right={<Btn variant="outline" icon="check" onClick={markAllRead} disabled={unread === 0}>Mark all read</Btn>}
      />
      <div className="mb-4">
        <Tabs active={tab} onChange={setTab} tabs={[{ key: "all", label: "All", count: mine.length }, { key: "unread", label: "Unread", count: unread }]} />
      </div>
      <Card className="anim-rise">
        {shown.length === 0 ? (
          <div className="p-5"><EmptyState icon="bell" title="Nothing here" sub={tab === "unread" ? "Every notification has been read." : "Notifications will arrive as workflows move."} /></div>
        ) : (
          <div className="divide-y divide-line/70">
            {shown.map(n => {
              const k = kindMeta[n.kind];
              return (
                <button key={n.id} onClick={() => open(n)} className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-paper ${n.read ? "opacity-55" : ""}`}>
                  <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${n.read ? "bg-ink/5 text-mute" : k.tone === "amber" ? "bg-warnsoft text-warn" : k.tone === "blue" ? "bg-infosoft text-info" : k.tone === "teal" ? "bg-tealsoft text-teal" : "bg-paper text-mute"}`}>
                    <Icon name={k.icon} size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <TonePill tone={k.tone}>{k.label}</TonePill>
                      {n.txn && <span className="font-mono text-[10.5px] font-bold text-mute">{n.txn}</span>}
                      {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-volt livedot" />}
                      <span className="ml-auto font-mono text-[10px] text-mute" title={fmtDT(n.at)}>{age(n.at)} ago</span>
                    </span>
                    <span className="mt-1 block text-[13px] font-semibold leading-snug">{n.text}</span>
                    {n.forRole !== "ALL" && <span className="mt-0.5 block text-[10px] font-bold tracking-wider text-mute">FOR: {ROLE_LABEL[n.forRole].toUpperCase()}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

// ============================================================
// History (Technical Man) — audited field events
// ============================================================
export function HistoryPage() {
  const { state, user } = useStore();
  const rows = useMemo(() => state.audit.filter(a =>
    a.userId === user?.id || ["barcode_scan", "gps_capture", "photo_capture", "video_capture", "suspicious_gps", "sync"].includes(a.action)
  ), [state.audit, user]);
  return (
    <div className="mx-auto max-w-[960px]">
      <SectionHead title="History" sub="Append-only audit trail — field captures, scans, GPS events and syncs. Records are immutable and never deleted." />
      <Card className="anim-rise">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead><tr className="border-b border-line bg-paper text-[10px] font-extrabold tracking-widest text-mute">
              <th className="px-4 py-2.5">TIME</th><th className="px-4 py-2.5">ACTOR</th><th className="px-4 py-2.5">EVENT</th><th className="px-4 py-2.5">DETAIL</th><th className="px-4 py-2.5">TXN</th>
            </tr></thead>
            <tbody>
              {rows.map(a => (
                <tr key={a.id} className="border-b border-line/60 last:border-0">
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11px] text-mute">{fmtDT(a.at)}</td>
                  <td className="px-4 py-2.5 text-[12px] font-bold">{a.userName}</td>
                  <td className="px-4 py-2.5"><TonePill tone={a.action.includes("mismatch") || a.action.includes("suspicious") ? "red" : a.action.includes("scan") || a.action.includes("gps") || a.action.includes("photo") || a.action.includes("video") ? "teal" : "gray"}>{a.action.replace(/_/g, " ").toUpperCase()}</TonePill></td>
                  <td className="px-4 py-2.5 text-[12px] text-ink2">{a.detail}</td>
                  <td className="px-4 py-2.5 font-mono text-[10.5px] text-mute">{a.txn ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
