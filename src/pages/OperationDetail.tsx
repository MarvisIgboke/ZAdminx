import { useState } from "react";
import type { OpType } from "../lib/types";
import { age, fmtDT, fmtDate, mmss, OPS, ROLE_LABEL } from "../lib/types";
import { useStore } from "../lib/store";
import { Btn, Card, Icon, KV, StatusPill, Tabs, TonePill, useRoute } from "../components/ui";
import { AuditTrail, CommentThread, StageActionPanel, WorkflowTimeline, ZVendPanel, getVideoBlob } from "../components/workflow";

export default function OperationDetailPage({ type, id }: { type: OpType; id: string }) {
  const { state } = useStore();
  const { nav } = useRoute();
  const [tab, setTab] = useState("workflow");
  const op = state.operations.find(o => o.id === id && o.type === type);
  const meta = OPS[type];

  if (!op) {
    return (
      <div className="mx-auto max-w-xl">
        <Card className="p-6 text-center anim-rise">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-dangersoft text-danger"><Icon name="alert" size={20} /></span>
          <h1 className="font-display text-[17px] font-bold">Record not found</h1>
          <p className="mt-1 text-[12.5px] text-mute">The transaction may have been reset. Operational records are never deleted.</p>
          <Btn variant="outline" icon="chevL" className="mt-4" onClick={() => nav(meta.path)}>Back to {meta.label}</Btn>
        </Card>
      </div>
    );
  }

  const fac = state.facilities.find(f => f.id === op.facilityId);
  const customer = op.customer ? state.customers.find(c => c.name === op.customer!.name) : undefined;
  const showZvend = type !== "inspection";
  const videoUrl = getVideoBlob(op.id);

  return (
    <div className="mx-auto max-w-[1240px]">
      <button onClick={() => nav(meta.path)} className="mb-3 flex items-center gap-1.5 text-[12px] font-extrabold text-mute transition-colors hover:text-ink">
        <Icon name="chevL" size={14} /> {meta.label}
      </button>

      {/* header */}
      <div className="mb-4 flex flex-wrap items-center gap-3 anim-rise">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink text-volt"><Icon name={meta.icon} size={20} /></span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-[17px] font-bold tracking-tight">{op.txn}</h1>
            <StatusPill status={op.status} pulse={!["COMPLETED", "REJECTED", "CANCELLED"].includes(op.status)} />
            {op.pendingSync && <TonePill tone="orange">OFFLINE QUEUE</TonePill>}
            {!!op.retryCount && <TonePill tone="orange">RETRY #{op.retryCount}</TonePill>}
          </div>
          <p className="text-[12px] font-semibold text-mute">
            {meta.label} · meter <span className="font-mono font-bold text-ink2">{op.meterNumber}</span> · {fac?.name ?? "—"} · opened {age(op.createdAt)} ago
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* main column */}
        <div className="min-w-0 space-y-4">
          <div className="anim-rise"><StageActionPanel op={op} navigate={nav} /></div>

          {/* evidence */}
          {(op.scan || op.gps || op.photos.length > 0 || op.video || op.customer) && (
            <Card className="p-4 anim-rise">
              <h2 className="mb-3 font-display text-[15px] font-bold">Field evidence</h2>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {op.scan && (
                  <div className={`rounded-lg border p-3 ${op.scan.matched ? "border-[#c2ddcd] bg-oksoft/60" : "border-[#eac5be] bg-dangersoft/60"}`}>
                    <p className="flex items-center gap-1.5 text-[10.5px] font-extrabold tracking-widest text-mute"><Icon name="scan" size={12} /> BARCODE</p>
                    <p className={`mt-1 font-mono text-[12.5px] font-bold ${op.scan.matched ? "text-ok" : "text-danger"}`}>{op.scan.matched ? "METER VERIFIED" : "MISMATCH"}</p>
                    <p className="font-mono text-[11px] text-ink2">{op.scan.value} · {fmtDT(op.scan.at)}</p>
                  </div>
                )}
                {op.gps && (
                  <div className={`rounded-lg border p-3 ${op.gps.accepted ? "border-[#c2ddcd] bg-oksoft/60" : "border-[#eac5be] bg-dangersoft/60"}`}>
                    <p className="flex items-center gap-1.5 text-[10.5px] font-extrabold tracking-widest text-mute"><Icon name="pin" size={12} /> GPS · ±{op.gps.accuracy} m · {op.gps.source}</p>
                    <p className={`mt-1 font-mono text-[12.5px] font-bold ${op.gps.accepted ? "text-ok" : "text-danger"}`}>{op.gps.accepted ? "WITHIN LIMIT" : "REJECTED — SUSPICIOUS"}</p>
                    <p className="font-mono text-[11px] text-ink2">{op.gps.lat}, {op.gps.lng} · {fmtDT(op.gps.at)}</p>
                  </div>
                )}
                {op.video && (
                  <div className="rounded-lg border border-[#c2ddcd] bg-oksoft/60 p-3">
                    <p className="flex items-center gap-1.5 text-[10.5px] font-extrabold tracking-widest text-mute"><Icon name="video" size={12} /> INSPECTION VIDEO</p>
                    <p className="mt-1 font-mono text-[12.5px] font-bold text-ok">{mmss(op.video.durationSec)} RECORDED</p>
                    <p className="font-mono text-[11px] text-ink2">{(op.video.sizeKB / 1024).toFixed(1)} MB · {fmtDT(op.video.at)}</p>
                    <VideoPreview url={videoUrl} simulated={op.video.simulated} />
                  </div>
                )}
                {op.customer && (
                  <div className="rounded-lg border border-line bg-paper p-3">
                    <p className="flex items-center gap-1.5 text-[10.5px] font-extrabold tracking-widest text-mute"><Icon name="user" size={12} /> CUSTOMER</p>
                    <p className="mt-1 text-[13px] font-bold">{op.customer.name}</p>
                    <p className="text-[11px] text-ink2">{op.customer.phone}{op.customer.email ? ` · ${op.customer.email}` : ""}</p>
                    <p className="text-[11px] text-mute">{op.customer.address}</p>
                  </div>
                )}
              </div>
              {op.photos.length > 0 && (
                <div className="mt-3">
                  <p className="mb-2 text-[10.5px] font-extrabold tracking-widest text-mute">PHOTOGRAPHIC EVIDENCE · {op.photos.length}</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {op.photos.map(p => (
                      <figure key={p.id}>
                        <img src={p.dataUrl} alt={p.label} className="aspect-[4/3] w-full rounded-lg border border-line object-cover" />
                        <figcaption className="mt-1 truncate text-[10px] font-extrabold text-mute">{p.label} · {fmtDT(p.at)}</figcaption>
                      </figure>
                    ))}
                  </div>
                </div>
              )}
              {(op.instruction || op.observations) && (
                <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
                  {op.instruction && <div className="rounded-lg border border-line bg-paper p-3"><p className="text-[10.5px] font-extrabold tracking-widest text-mute">GM INSTRUCTION</p><p className="mt-1 text-[12px] leading-relaxed text-ink2">{op.instruction}</p></div>}
                  {op.observations && <div className="rounded-lg border border-line bg-paper p-3"><p className="text-[10.5px] font-extrabold tracking-widest text-mute">TECHNICAL OBSERVATIONS</p><p className="mt-1 text-[12px] leading-relaxed text-ink2">{op.observations}</p></div>}
                </div>
              )}
            </Card>
          )}

          {showZvend && (
            <div className="anim-rise"><ZVendPanel op={op} /></div>
          )}
          {type === "inspection" && (
            <Card className="p-4 anim-rise">
              <div className="flex items-center gap-2">
                <Icon name="info" size={15} className="text-info" />
                <p className="font-display text-[13.5px] font-bold">No ZVend call for inspections</p>
              </div>
              <p className="mt-1 text-[12px] text-mute">Inspection evidence is reviewed internally by Secretary → EM → GM → MD. The chain terminates at MD approval.</p>
            </Card>
          )}

          {/* tabs: comments / audit */}
          <Card className="p-4 anim-rise">
            <Tabs
              tabs={[
                { key: "workflow", label: "Workflow & Timeline" },
                { key: "comments", label: "Comments", count: op.comments.length },
                { key: "audit", label: "Audit Trail" },
              ]}
              active={tab} onChange={setTab}
            />
            <div className="mt-4">
              {tab === "workflow" && <WorkflowTimeline op={op} />}
              {tab === "comments" && <CommentThread op={op} />}
              {tab === "audit" && <AuditTrail op={op} />}
            </div>
          </Card>
        </div>

        {/* right rail */}
        <div className="space-y-4">
          <Card className="p-4 anim-rise">
            <h2 className="mb-1 font-display text-[14.5px] font-bold">Record</h2>
            <KV k="Transaction" v={op.txn} mono />
            <KV k="Operation" v={meta.label} />
            <KV k="Meter" v={op.meterNumber} mono />
            <KV k="Facility" v={fac ? `${fac.name} · ${fac.code}` : "—"} />
            <KV k="Initiator" v={`${op.initiatorName} (${ROLE_LABEL[op.initiatorRole]})`} />
            <KV k="Created" v={fmtDT(op.createdAt)} />
            <KV k="Last update" v={fmtDT(op.updatedAt)} />
            {op.scheduledFor && <KV k="Scheduled for" v={fmtDate(op.scheduledFor)} />}
            {op.durationSec && <KV k="Video duration" v={mmss(op.durationSec)} mono />}
            {customer && <KV k="Customer meters" v={`${customer.meters.length} registered`} />}
            {op.zvend?.reference && <KV k="ZVend ref" v={op.zvend.reference} mono />}
          </Card>

          <Card className="p-4 anim-rise">
            <h2 className="mb-3 font-display text-[14.5px] font-bold">Workflow position</h2>
            <WorkflowTimeline op={op} />
          </Card>
        </div>
      </div>
    </div>
  );
}

function VideoPreview({ url, simulated }: { url?: string; simulated: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Btn size="sm" variant="outline" icon="video" className="mt-2" onClick={() => setOpen(true)}>Preview evidence</Btn>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/70 anim-fade" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-2xl overflow-hidden rounded-xl border border-line bg-side shadow-2xl anim-rise">
            <div className="flex items-center justify-between px-4 py-2.5">
              <p className="font-mono text-[11px] font-bold text-[#93a29a]">INSPECTION EVIDENCE {simulated ? "· METADATA CAPTURE" : "· DEVICE CAPTURE"}</p>
              <button onClick={() => setOpen(false)} className="text-[#93a29a] hover:text-paper"><Icon name="x" /></button>
            </div>
            <div className="relative aspect-video bg-black">
              {url ? (
                <video src={url} controls autoPlay className="h-full w-full object-cover" />
              ) : (
                <div className="bg-circuit flex h-full flex-col items-center justify-center gap-2">
                  <span className="flex items-center gap-1.5 rounded-md bg-danger px-2 py-1 text-[11px] font-extrabold text-white"><span className="recblink h-2 w-2 rounded-full bg-white" /> REC</span>
                  <p className="font-mono text-[11px] text-[#93a29a]">Secure storage · meter-inspections/&#123;transaction&#125;/video/</p>
                  <p className="max-w-xs text-center text-[11px] text-[#5d6b62]">Full footage is served through the authorized media endpoint; this console previews capture metadata.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
