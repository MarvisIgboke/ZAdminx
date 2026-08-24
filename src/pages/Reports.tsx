import { useMemo, useState } from "react";
import type { OpType } from "../lib/types";
import { fmtDate, OPS, OP_ORDER, STATUS_META, STAGES } from "../lib/types";
import { useStore } from "../lib/store";
import { Bars, Btn, Card, EmptyState, Field, Icon, SectionHead, Select, Stat, StatusPill, TextInput, useRoute } from "../components/ui";

export default function ReportsPage() {
  const { state, toast } = useStore();
  const { nav } = useRoute();
  const [type, setType] = useState("ALL");
  const [fac, setFac] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filtered = useMemo(() => state.operations.filter(o => {
    const okT = type === "ALL" || o.type === (type as OpType);
    const okF = fac === "ALL" || o.facilityId === fac;
    const okS = status === "ALL" || o.status === status;
    const okFrom = !from || o.createdAt >= new Date(from).getTime();
    const okTo = !to || o.createdAt <= new Date(to).getTime() + 86400000;
    return okT && okF && okS && okFrom && okTo;
  }), [state.operations, type, fac, status, from, to]);

  const months = useMemo(() => {
    const out: { label: string; a: number; b?: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
      const next = new Date(d); next.setMonth(next.getMonth() + 1);
      out.push({
        label: d.toLocaleDateString("en-GB", { month: "short" }),
        a: filtered.filter(o => o.createdAt >= d.getTime() && o.createdAt < next.getTime()).length,
        b: filtered.filter(o => o.status === "COMPLETED" && o.updatedAt >= d.getTime() && o.updatedAt < next.getTime()).length,
      });
    }
    return out;
  }, [filtered]);

  const exportCsv = () => {
    const head = ["transaction", "operation", "meter", "facility", "initiator", "initiator_role", "status", "stage", "created", "updated"];
    const rows = filtered.map(o => [
      o.txn, OPS[o.type].label, o.meterNumber,
      state.facilities.find(f => f.id === o.facilityId)?.name ?? "",
      o.initiatorName, o.initiatorRole, STATUS_META[o.status].label,
      STAGES[o.type][Math.min(o.stageIdx, STAGES[o.type].length - 1)].label,
      new Date(o.createdAt).toISOString(), new Date(o.updatedAt).toISOString(),
    ]);
    const csv = [head, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `zadmin-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`Exported ${rows.length} records to CSV`, "ok");
  };

  return (
    <div className="mx-auto max-w-[1240px]">
      <SectionHead title="Reports" sub={`${filtered.length} records in scope · export for Excel / PDF via CSV`}
        right={<Btn variant="primary" icon="download" onClick={exportCsv} disabled={filtered.length === 0}>Export CSV</Btn>} />

      {/* filters */}
      <Card className="mb-4 p-4 anim-rise">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Field label="Operation">
            <Select value={type} onChange={e => setType(e.target.value)}>
              <option value="ALL">All operations</option>
              {OP_ORDER.map(t => <option key={t} value={t}>{OPS[t].label}</option>)}
            </Select>
          </Field>
          <Field label="Facility">
            <Select value={fac} onChange={e => setFac(e.target.value)}>
              <option value="ALL">All facilities</option>
              {state.facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={status} onChange={e => setStatus(e.target.value)}>
              <option value="ALL">All statuses</option>
              {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </Field>
          <Field label="From"><TextInput type="date" value={from} onChange={e => setFrom(e.target.value)} /></Field>
          <Field label="To"><TextInput type="date" value={to} onChange={e => setTo(e.target.value)} /></Field>
        </div>
      </Card>

      {/* stats + chart */}
      <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card className="p-4 anim-rise">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <Stat label="Records" value={filtered.length} />
            <Stat label="Completed" value={filtered.filter(o => o.status === "COMPLETED").length} tone="text-ok" />
            <Stat label="In flight" value={filtered.filter(o => !["COMPLETED", "REJECTED", "CANCELLED"].includes(o.status)).length} tone="text-warn" />
            <Stat label="Rejected" value={filtered.filter(o => o.status === "REJECTED").length} tone="text-danger" />
            <Stat label="ZVend calls" value={filtered.filter(o => o.zvend?.status === "success").length} tone="text-info" />
          </div>
        </Card>
        <Card className="p-4 anim-rise">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-display text-[13.5px] font-bold">6-month flow</p>
            <span className="flex items-center gap-1.5 text-[9.5px] font-extrabold text-mute"><span className="h-2 w-2 rounded-sm bg-ink/80" />OPENED <span className="ml-1.5 h-2 w-2 rounded-sm bg-volt/70" />DONE</span>
          </div>
          <Bars data={months} height={64} />
        </Card>
      </div>

      {/* table */}
      <Card className="anim-rise">
        {filtered.length === 0 ? (
          <div className="p-5"><EmptyState icon="chart" title="No records in scope" sub="Loosen the filters to include more records." /></div>
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left">
            <thead><tr className="border-b border-line bg-paper text-[10px] font-extrabold tracking-widest text-mute">
              <th className="px-4 py-2.5">TXN</th><th className="px-4 py-2.5">OPERATION</th><th className="px-4 py-2.5">METER</th><th className="px-4 py-2.5">FACILITY</th><th className="px-4 py-2.5">INITIATOR</th><th className="px-4 py-2.5">STATUS</th><th className="px-4 py-2.5">CREATED</th>
            </tr></thead>
            <tbody>
              {filtered.slice(0, 40).map(o => (
                <tr key={o.id} onClick={() => nav(`${OPS[o.type].path}/${o.id}`)} className="cursor-pointer border-b border-line/60 transition-colors last:border-0 hover:bg-paper">
                  <td className="px-4 py-2.5 font-mono text-[11.5px] font-bold">{o.txn}</td>
                  <td className="px-4 py-2.5"><span className="flex items-center gap-1.5 text-[12px] font-bold"><Icon name={OPS[o.type].icon} size={13} className="text-volt2" />{OPS[o.type].short}</span></td>
                  <td className="px-4 py-2.5 font-mono text-[11.5px] text-ink2">{o.meterNumber}</td>
                  <td className="px-4 py-2.5 text-[12px] font-semibold">{state.facilities.find(f => f.id === o.facilityId)?.name}</td>
                  <td className="px-4 py-2.5 text-[12px] font-semibold">{o.initiatorName}</td>
                  <td className="px-4 py-2.5"><StatusPill status={o.status} /></td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-mute">{fmtDate(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        {filtered.length > 40 && <p className="px-4 py-2.5 text-[11px] font-bold text-mute">Showing first 40 — export CSV for the full set ({filtered.length}).</p>}
      </Card>
    </div>
  );
}
