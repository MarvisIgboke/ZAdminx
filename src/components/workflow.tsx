import { useEffect, useMemo, useRef, useState } from "react";
import type { Op } from "../lib/types";
import { actionableBy, fmtDT, fmtTime, mmss, OPS, ROLE_LABEL, STAGES } from "../lib/types";
import { useStore } from "../lib/store";
import { Btn, CodeBox, Field, Icon, Modal, Select, StatusPill, Textarea, TextInput, TonePill } from "./ui";

// ============================================================
// Photo synthesis (canvas-based field capture)
// ============================================================
export function snapPhoto(label: string, meter: string, gpsLat?: number, gpsLng?: number): string {
  const c = document.createElement("canvas");
  c.width = 480; c.height = 360;
  const x = c.getContext("2d");
  if (!x) return "";
  const g = x.createLinearGradient(0, 0, 0, 360);
  g.addColorStop(0, "#182420"); g.addColorStop(1, "#0c120f");
  x.fillStyle = g; x.fillRect(0, 0, 480, 360);
  x.strokeStyle = "rgba(232,155,46,0.10)"; x.lineWidth = 1;
  for (let i = 0; i <= 480; i += 40) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 360); x.stroke(); }
  for (let i = 0; i <= 360; i += 40) { x.beginPath(); x.moveTo(0, i); x.lineTo(480, i); x.stroke(); }
  x.fillStyle = "#1e2b23"; x.fillRect(140, 66, 200, 168);
  x.strokeStyle = "#e89b2e"; x.lineWidth = 2; x.strokeRect(140, 66, 200, 168);
  x.fillStyle = "#0c120f"; x.fillRect(168, 96, 144, 46);
  x.fillStyle = "#e89b2e"; x.font = "700 19px JetBrains Mono, monospace";
  x.fillText(meter.slice(-8), 184, 126);
  x.fillStyle = "#93a29a"; x.font = "600 10px JetBrains Mono, monospace";
  x.fillText("ZRK-K1 · PREPAID", 168, 166);
  for (let i = 0; i < 420; i++) {
    x.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
    x.fillRect(Math.random() * 480, Math.random() * 360, 1.4, 1.4);
  }
  x.fillStyle = "#e89b2e"; x.font = "800 13px Manrope, sans-serif";
  x.fillText(label.toUpperCase(), 16, 26);
  x.fillStyle = "#93a29a"; x.font = "600 10.5px JetBrains Mono, monospace";
  x.fillText(new Date().toLocaleString("en-GB"), 16, 342);
  x.fillText(gpsLat ? `${gpsLat.toFixed(4)}, ${gpsLng?.toFixed(4)}` : "GPS PENDING", 210, 342);
  x.fillText("Z ADMIN FIELD", 380, 342);
  return c.toDataURL("image/jpeg", 0.72);
}

// ============================================================
// Timeline
// ============================================================
export function WorkflowTimeline({ op }: { op: Op }) {
  const stages = STAGES[op.type];
  const done = op.status === "COMPLETED";
  const rejected = op.status === "REJECTED";
  const failed = op.status === "ZVEND_FAILED";
  return (
    <ol className="relative space-y-0">
      {stages.map((s, i) => {
        const isDone = done || i < op.stageIdx || (rejected && i < op.stageIdx);
        const isCurrent = !done && i === op.stageIdx && !rejected;
        const isRejectPoint = rejected && i === op.stageIdx;
        const isFailPoint = failed && s.key === "ZVEND";
        const stageComments = op.comments.filter(c => c.stage === s.label);
        return (
          <li key={s.key} className="relative flex gap-3 pb-5 last:pb-0">
            {i < stages.length - 1 && (
              <span className={`absolute left-[13px] top-7 h-[calc(100%-20px)] w-px ${isDone ? "bg-ok/50" : "bg-line2"}`} />
            )}
            <span className={`z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-extrabold
              ${isDone ? "border-ok bg-ok text-white" : isRejectPoint || isFailPoint ? "border-danger bg-danger text-white"
                : isCurrent ? "border-volt bg-voltsoft text-volt2 livedot" : "border-line2 bg-card text-mute"}`}>
              {isDone ? <Icon name="check" size={13} /> : isRejectPoint || isFailPoint ? <Icon name="x" size={13} /> : s.role === "ZVEND" ? <Icon name="plug" size={13} /> : i + 1}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className={`text-[13px] font-bold ${isCurrent ? "text-ink" : isDone ? "text-ink2" : "text-mute"}`}>{s.label}</p>
                <span className="text-[10px] font-extrabold tracking-wider text-mute/70">
                  {s.role === "ZVEND" ? "ZVEND API" : ROLE_LABEL[s.role as keyof typeof ROLE_LABEL]?.toUpperCase()}
                </span>
                {isCurrent && <TonePill tone={failed && s.key === "ZVEND" ? "red" : "amber"}>{failed && s.key === "ZVEND" ? "FAILED" : "AWAITING"}</TonePill>}
                {op.status === "RETURNED" && isCurrent && <TonePill tone="orange">RETURNED HERE</TonePill>}
              </div>
              {stageComments.length > 0 && (
                <div className="mt-1.5 space-y-1">
                  {stageComments.slice(-2).map(c => (
                    <p key={c.id} className="rounded-md bg-paper px-2.5 py-1.5 text-[11.5px] leading-snug text-ink2">
                      <span className="font-bold text-ink">{c.userName}</span>
                      <span className="mx-1 text-[9.5px] font-extrabold text-volt2">{c.decision}</span>
                      {c.text.length > 120 ? c.text.slice(0, 120) + "…" : c.text}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ============================================================
// Comments (append-only)
// ============================================================
export function CommentThread({ op }: { op: Op }) {
  const list = [...op.comments].reverse();
  return (
    <div className="space-y-2.5">
      {list.map(c => (
        <div key={c.id} className="rounded-lg border border-line bg-card p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] font-extrabold">{c.userName}</span>
            <span className="rounded bg-ink/6 px-1.5 py-px text-[9.5px] font-extrabold tracking-wider text-ink2">{c.role === "SYSTEM" ? "SYSTEM" : ROLE_LABEL[c.role as keyof typeof ROLE_LABEL]?.toUpperCase()}</span>
            <TonePill tone={c.decision === "REJECT" ? "red" : c.decision === "RETURN" ? "orange" : c.decision === "APPROVE" ? "green" : c.decision === "SYSTEM" ? "blue" : "gray"}>{c.decision}</TonePill>
            {c.delegated && <TonePill tone="amber">MD DELEGATION</TonePill>}
            <span className="ml-auto text-[10.5px] text-mute" title={fmtDT(c.at)}>{fmtTime(c.at)} · {new Date(c.at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</span>
          </div>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink2">{c.text}</p>
          <p className="mt-1 text-[10px] font-bold tracking-wide text-mute/70">STAGE: {c.stage.toUpperCase()}</p>
        </div>
      ))}
      {list.length === 0 && <p className="py-4 text-center text-[12px] text-mute">No comments yet.</p>}
    </div>
  );
}

// ============================================================
// Decision panel (approve / reject / return)
// ============================================================
export function DecisionPanel({ op }: { op: Op }) {
  const { user, can, decide, delegation } = useStore();
  const [comment, setComment] = useState("");
  const [confirming, setConfirming] = useState<null | "REJECT" | "RETURN">(null);
  if (!user) return null;
  const actor = actionableBy(op, !!delegation);
  if (actor !== user.role || !can(`${op.type}.approve`)) return null;
  const delegated = op.status === "PENDING_MD" && user.role === "GENERAL_MANAGER";
  const stage = STAGES[op.type][op.stageIdx];

  return (
    <div className="rounded-xl border-2 border-volt/50 bg-voltsoft/50 p-4">
      <div className="mb-2.5 flex items-center gap-2">
        <Icon name="approve" size={16} className="text-volt2" />
        <p className="font-display text-[14px] font-bold">{stage.label} — your decision</p>
      </div>
      {delegated && (
        <p className="mb-2.5 rounded-md border border-[#eed9b4] bg-voltsoft px-2.5 py-1.5 text-[11.5px] font-bold text-volt2">
          You are acting at the MD stage under an active MD delegation. The decision will be marked “Approved under MD delegation.”
        </p>
      )}
      <Field label={`${ROLE_LABEL[user.role]} comment (required)`}>
        <Textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Record your review note — comments are append-only and never overwritten." />
      </Field>
      <div className="mt-3 flex flex-wrap gap-2">
        <Btn variant="ok" icon="check" disabled={!comment.trim()} onClick={() => decide(op.id, "APPROVE", comment) && setComment("")}>Approve</Btn>
        <Btn variant="outline" icon="chevL" disabled={!comment.trim()} onClick={() => setConfirming("RETURN")}>Return</Btn>
        <Btn variant="danger" icon="x" disabled={!comment.trim()} onClick={() => setConfirming("REJECT")}>Reject</Btn>
      </div>
      <Modal open={!!confirming} onClose={() => setConfirming(null)} title={`Confirm ${confirming?.toLowerCase()}`}>
        <p className="text-[13px] text-ink2">
          You are about to <b>{confirming?.toLowerCase()}</b> <span className="font-mono font-bold">{op.txn}</span>.
          {confirming === "REJECT" ? " The record will be closed as REJECTED and the initiator notified." : " The record returns to the previous stage for revision. Previous comments are preserved."}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Btn variant="ghost" onClick={() => setConfirming(null)}>Cancel</Btn>
          <Btn variant={confirming === "REJECT" ? "danger" : "primary"} onClick={() => { if (confirming) decide(op.id, confirming, comment); setConfirming(null); setComment(""); }}>
            Confirm {confirming?.toLowerCase()}
          </Btn>
        </div>
      </Modal>
    </div>
  );
}

// ============================================================
// Barcode scan block
// ============================================================
export function ScanBlock({ op }: { op: Op }) {
  const { state, saveScan } = useStore();
  const [mode, setMode] = useState<"idle" | "scanning">(op.scan?.matched ? "idle" : "idle");
  const [manual, setManual] = useState("");
  const [lastMismatch, setLastMismatch] = useState(op.scan && !op.scan.matched);
  const done = op.scan?.matched === true;

  const attempt = (value: string) => {
    const v = value.trim();
    if (!/^\d+$/.test(v)) { saveScan(op.id, { value: v || "—", matched: false, at: Date.now() }); setLastMismatch(true); return; }
    const matched = v === op.meterNumber;
    saveScan(op.id, { value: v, matched, at: Date.now() });
    setMode("idle");
    setLastMismatch(!matched);
  };

  if (done) {
    return (
      <div className="rounded-lg border border-[#c2ddcd] bg-oksoft p-3.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ok text-white"><Icon name="check" size={15} /></span>
          <div>
            <p className="font-display text-[13.5px] font-bold text-ok">METER VERIFIED</p>
            <p className="font-mono text-[11.5px] text-ink2">scanned {op.scan!.value} · {fmtTime(op.scan!.at)}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl border-2 border-ink bg-side aspect-[16/9]">
        <div className="bg-circuit absolute inset-0" />
        {/* frame corners */}
        <div className="absolute left-6 right-6 top-6 bottom-6">
          <span className="absolute left-0 top-0 h-6 w-6 rounded-tl-lg border-l-[3px] border-t-[3px] border-volt" />
          <span className="absolute right-0 top-0 h-6 w-6 rounded-tr-lg border-r-[3px] border-t-[3px] border-volt" />
          <span className="absolute bottom-0 left-0 h-6 w-6 rounded-bl-lg border-b-[3px] border-l-[3px] border-volt" />
          <span className="absolute bottom-0 right-0 h-6 w-6 rounded-br-lg border-b-[3px] border-r-[3px] border-volt" />
          {mode === "scanning" && <span className="scanline absolute left-2 right-2 h-[2px] rounded bg-volt shadow-[0_0_14px_#e89b2e]" />}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <Icon name="scan" size={34} className={mode === "scanning" ? "text-volt" : "text-[#5d6b62]"} />
            <p className="font-mono text-[11px] font-bold tracking-widest text-[#93a29a]">
              {mode === "scanning" ? "SCANNING…" : "BARCODE SCANNER READY"}
            </p>
          </div>
        </div>
        <p className="absolute bottom-2 left-3 font-mono text-[9.5px] text-[#5d6b62]">MediaDevices bridge · simulated viewport</p>
      </div>
      {lastMismatch && (
        <div className="rounded-lg border-2 border-danger bg-dangersoft p-3.5 anim-rise">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-danger text-white"><Icon name="alert" size={15} /></span>
            <div>
              <p className="font-display text-[13.5px] font-bold text-danger">METER NUMBER MISMATCH</p>
              <p className="text-[11.5px] text-ink2">Scanned value does not match the authorized meter. Operation is stopped — re-scan the correct meter.</p>
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Btn variant="primary" icon="scan" loading={mode === "scanning"} onClick={() => { setMode("scanning"); setTimeout(() => attempt(op.meterNumber), 1300); }}>
          Scan meter barcode
        </Btn>
        <Btn variant="outline" icon="alert" onClick={() => {
          const wrong = state.meters.find(m => m.number !== op.meterNumber)?.number ?? "99999999999";
          setMode("scanning"); setTimeout(() => attempt(wrong), 1300);
        }}>Simulate wrong meter</Btn>
      </div>
      <div className="flex gap-2">
        <TextInput value={manual} onChange={e => setManual(e.target.value.replace(/\D/g, ""))} placeholder="…or key meter number manually" className="font-mono" />
        <Btn variant="outline" disabled={!manual} onClick={() => attempt(manual)}>Capture</Btn>
      </div>
    </div>
  );
}

// ============================================================
// GPS block
// ============================================================
export function GpsBlock({ op }: { op: Op }) {
  const { state, saveGps } = useStore();
  const [busy, setBusy] = useState(false);
  const fac = state.facilities.find(f => f.id === op.facilityId);
  const max = state.settings.maxGpsAccuracyM;
  const gps = op.gps;

  const capture = () => {
    setBusy(true);
    const finish = (lat: number, lng: number, accuracy: number, source: "device" | "simulated") => {
      saveGps(op.id, { lat: +lat.toFixed(6), lng: +lng.toFixed(6), accuracy: Math.round(accuracy), at: Date.now(), source, accepted: accuracy <= max });
      setBusy(false);
    };
    let settled = false;
    try {
      navigator.geolocation.getCurrentPosition(
        p => { if (!settled) { settled = true; finish(p.coords.latitude, p.coords.longitude, p.coords.accuracy, "device"); } },
        () => { if (!settled) { settled = true; finish((fac?.lat ?? 6.45) + (Math.random() - 0.5) * 0.0016, (fac?.lng ?? 3.55) + (Math.random() - 0.5) * 0.0016, 5 + Math.random() * 22, "simulated"); } },
        { timeout: 3500, maximumAge: 10000 },
      );
    } catch { /* geo unavailable */ }
    setTimeout(() => { if (!settled) { settled = true; finish((fac?.lat ?? 6.45) + (Math.random() - 0.5) * 0.0016, (fac?.lng ?? 3.55) + (Math.random() - 0.5) * 0.0016, 5 + Math.random() * 22, "simulated"); } }, 4200);
  };

  if (gps && gps.accepted) {
    return (
      <div className="rounded-lg border border-[#c2ddcd] bg-oksoft p-3.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ok text-white"><Icon name="pin" size={15} /></span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[13.5px] font-bold text-ok">GPS CAPTURED — WITHIN LIMIT</p>
            <p className="font-mono text-[11.5px] text-ink2">{gps.lat}, {gps.lng} · ±{gps.accuracy} m · {gps.source} · {fmtTime(gps.at)}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {gps && !gps.accepted && (
        <div className="rounded-lg border-2 border-danger bg-dangersoft p-3.5 anim-rise">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-danger text-white"><Icon name="alert" size={15} /></span>
            <div>
              <p className="font-display text-[13.5px] font-bold text-danger">GPS ACCURACY EXCEEDED — OPERATION BLOCKED</p>
              <p className="text-[11.5px] text-ink2">±{gps.accuracy} m is beyond the allowed ±{max} m. The event was recorded as suspicious GPS. Move to open sky and retry — completion is disabled.</p>
            </div>
          </div>
        </div>
      )}
      <div className="flex items-center gap-3 rounded-xl border border-line bg-side p-4">
        <span className={`flex h-10 w-10 items-center justify-center rounded-full ${busy ? "bg-volt/20 text-volt" : "bg-side3 text-[#93a29a]"}`}>
          <Icon name="pin" size={18} className={busy ? "recblink" : ""} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold text-paper">{busy ? "Acquiring satellites…" : gps ? "GPS rejected — retry required" : "Capture installation GPS"}</p>
          <p className="text-[11px] text-[#71816f]">Geolocation API · threshold ±{max} m · near {fac?.name ?? "facility"}</p>
        </div>
      </div>
      <Btn variant="primary" icon="pin" size="lg" loading={busy} onClick={capture} className="w-full sm:w-auto">
        {gps ? "Retry GPS capture" : "Capture GPS"}
      </Btn>
    </div>
  );
}

// ============================================================
// Photos block
// ============================================================
export function PhotosBlock({ op, labels }: { op: Op; labels: string[] }) {
  const { addPhoto } = useStore();
  const [shooting, setShooting] = useState<string | null>(null);
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {labels.map(label => {
        const photo = op.photos.find(p => p.label === label);
        return (
          <div key={label} className="overflow-hidden rounded-lg border border-line bg-card">
            {photo ? (
              <>
                <img src={photo.dataUrl} alt={label} className="aspect-[4/3] w-full object-cover" />
                <div className="flex items-center gap-1.5 px-2 py-1.5">
                  <Icon name="check" size={12} className="text-ok" />
                  <p className="min-w-0 flex-1 truncate text-[10.5px] font-extrabold">{label}</p>
                  <span className="font-mono text-[9px] text-mute">{fmtTime(photo.at)}</span>
                </div>
              </>
            ) : (
              <button onClick={() => { setShooting(label); setTimeout(() => { addPhoto(op.id, { id: Math.random().toString(36).slice(2), label, dataUrl: snapPhoto(label, op.meterNumber, op.gps?.lat, op.gps?.lng), at: Date.now(), lat: op.gps?.lat, lng: op.gps?.lng }); setShooting(null); }, 850); }}
                className="group flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 bg-paper transition-colors hover:bg-voltsoft">
                {shooting === label
                  ? <><span className="recblink flex h-8 w-8 items-center justify-center rounded-full bg-danger text-white"><Icon name="camera" size={15} /></span><p className="text-[10.5px] font-extrabold text-danger">CAPTURING…</p></>
                  : <><span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink/8 text-mute group-hover:bg-volt group-hover:text-ink"><Icon name="camera" size={15} /></span><p className="px-1 text-[10.5px] font-extrabold text-ink2">{label}</p></>}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// Video recorder (inspection)
// ============================================================
const videoBlobs: Record<string, string> = {};
export const getVideoBlob = (opId: string) => videoBlobs[opId];

export function VideoBlock({ op, durationSec }: { op: Op; durationSec: number }) {
  const { saveVideo } = useStore();
  const [phase, setPhase] = useState<"idle" | "rec" | "done">(op.video ? "done" : "idle");
  const [left, setLeft] = useState(durationSec);
  const [fast, setFast] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (recRef.current && recRef.current.state !== "inactive") try { recRef.current.stop(); } catch { /* noop */ }
  }, []);

  const start = async () => {
    setPhase("rec"); setLeft(durationSec);
    let simulated = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => undefined); }
      const chunks: Blob[] = [];
      const rec = new MediaRecorder(stream);
      recRef.current = rec;
      rec.ondataavailable = e => chunks.push(e.data);
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        if (blob.size > 0) { videoBlobs[op.id] = URL.createObjectURL(blob); simulated = false; saveVideo(op.id, { durationSec, at: Date.now(), simulated: false, sizeKB: Math.max(1, Math.round(blob.size / 1024)) }); }
      };
      rec.start();
    } catch { /* camera unavailable — simulated recording persists metadata */ }
    const tick = () => {
      setLeft(l => {
        const step = fast ? 6 : 1;
        const nl = l - step;
        if (nl <= 0) {
          if (timerRef.current) clearInterval(timerRef.current);
          if (recRef.current && recRef.current.state !== "inactive") try { recRef.current.stop(); } catch { /* noop */ }
          streamRef.current?.getTracks().forEach(t => t.stop());
          setPhase("done");
          saveVideo(op.id, { durationSec, at: Date.now(), simulated, sizeKB: Math.round(durationSec * 152) });
          return 0;
        }
        return nl;
      });
    };
    timerRef.current = setInterval(tick, 1000);
  };

  if (phase === "done" && op.video) {
    return (
      <div className="rounded-lg border border-[#c2ddcd] bg-oksoft p-3.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ok text-white"><Icon name="video" size={15} /></span>
          <div>
            <p className="font-display text-[13.5px] font-bold text-ok">INSPECTION VIDEO SAVED</p>
            <p className="font-mono text-[11.5px] text-ink2">{mmss(op.video.durationSec)} · {(op.video.sizeKB / 1024).toFixed(1)} MB · {op.video.simulated ? "metadata-only capture" : "device capture"} · {fmtTime(op.video.at)}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl border-2 border-ink bg-side aspect-video">
        <video ref={videoRef} muted playsInline className={`absolute inset-0 h-full w-full object-cover ${phase === "rec" ? "" : "opacity-0"}`} />
        {phase !== "rec" && <div className="bg-circuit absolute inset-0 flex flex-col items-center justify-center gap-2">
          <Icon name="video" size={32} className="text-[#5d6b62]" />
          <p className="font-mono text-[11px] font-bold tracking-widest text-[#93a29a]">RECORDER ARMED · {mmss(durationSec)}</p>
        </div>}
        {phase === "rec" && <>
          <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-md bg-danger px-2 py-1 text-[11px] font-extrabold text-white">
            <span className="recblink h-2 w-2 rounded-full bg-white" /> RECORDING
          </span>
          <span className="absolute right-3 top-3 rounded-md bg-ink/80 px-2.5 py-1 font-mono text-[17px] font-bold text-volt tnum">{mmss(left)}</span>
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-ink/60">
            <div className="h-full bg-volt transition-all duration-1000 ease-linear" style={{ width: `${((durationSec - left) / durationSec) * 100}%` }} />
          </div>
        </>}
      </div>
      {phase === "idle" && (
        <div className="flex flex-wrap items-center gap-3">
          <Btn variant="danger" icon="video" size="lg" onClick={start}>Start recording</Btn>
          <label className="flex cursor-pointer items-center gap-2 text-[12px] font-bold text-ink2">
            <input type="checkbox" checked={fast} onChange={e => setFast(e.target.checked)} className="h-4 w-4 accent-[#e89b2e]" />
            Demo fast-forward (×6)
          </label>
          <p className="text-[11px] text-mute">Recording auto-stops at 00:00 and cannot be submitted short.</p>
        </div>
      )}
    </div>
  );
}

// ============================================================
// ZVend panel
// ============================================================
export function ZVendPanel({ op }: { op: Op }) {
  const { retryZVend, user, audit } = useStore();
  const z = op.zvend;
  const kind = op.type === "installation" ? "tamper + clear codes" : op.type === "activation" ? "activation reference" : `${op.type} code`;
  return (
    <div className={`rounded-xl border p-4 ${z?.status === "failed" ? "border-danger/50 bg-dangersoft/50" : z?.status === "success" ? "border-[#c3d7e3] bg-infosoft/40" : "border-line bg-card"}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Icon name="plug" size={16} className={z?.status === "success" ? "text-info" : z?.status === "failed" ? "text-danger" : "text-volt2"} />
        <p className="font-display text-[14px] font-bold">ZVend Integration</p>
        <StatusPill status={op.status} pulse={op.status === "WAITING_ZVEND"} />
      </div>

      {op.status === "WAITING_ZVEND" && (
        <div className="rounded-lg border border-line bg-paper p-3.5">
          <svg className="mb-2" width="100%" height="10"><line x1="0" y1="5" x2="100%" y2="5" stroke="#e89b2e" strokeWidth="2" strokeDasharray="6 6" className="dashflow" /></svg>
          <p className="text-[12.5px] font-bold text-ink2">Calling ZVend ({op.type === "installation" ? "installMeter" : op.type === "activation" ? "activateMeter" : op.type === "tamper" ? "generateTamperCode" : "generateClearCode"})…</p>
          <p className="mt-0.5 font-mono text-[10.5px] text-mute">idempotency key bound · duplicates blocked · timeout {op.zvend ? "" : ""}configured</p>
        </div>
      )}

      {z?.status === "failed" && (
        <div className="space-y-3">
          <p className="rounded-lg border border-[#eac5be] bg-dangersoft px-3 py-2 text-[12px] font-bold text-danger">{z.error}</p>
          <p className="text-[11.5px] text-ink2">Response <span className="font-mono font-bold">{z.responseCode}</span> · requested {fmtDT(z.requestedAt)} · attempt {z.attempt}. The transaction is safe — no duplicate ZVend call can be issued for the same key.</p>
          {user && ["MD", "IT_MANAGER", "SUPER_ADMIN"].includes(user.role) && (
            <Btn variant="danger" icon="sync" onClick={() => retryZVend(op.id)}>Retry ZVend call</Btn>
          )}
        </div>
      )}

      {z?.status === "success" && (
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 gap-2 text-[11.5px]">
            <p className="rounded-md bg-paper px-2.5 py-1.5 font-bold">Response <span className="font-mono text-ok">{z.responseCode} OK</span></p>
            <p className="rounded-md bg-paper px-2.5 py-1.5 font-bold">Ref <span className="font-mono text-info">{z.reference}</span></p>
            <p className="rounded-md bg-paper px-2.5 py-1.5 font-bold">Requested <span className="text-ink2">{fmtDT(z.requestedAt)}</span></p>
            <p className="rounded-md bg-paper px-2.5 py-1.5 font-bold">Responded <span className="text-ink2">{fmtDT(z.respondedAt)}</span></p>
          </div>
          {(op.type === "installation" || op.type === "tamper") && (
            <div>
              <p className="mb-1 text-[10.5px] font-extrabold tracking-widest text-mute">TAMPER CODE · 20 DIGIT · {kind.includes("tamper") ? "SENSITIVE" : "SENSITIVE"}</p>
              <CodeBox code={z.tamperCode} onReveal={() => audit("code_reveal", `Tamper code revealed for ${op.txn}`, op.txn)} onCopy={() => audit("code_copy", `Tamper code copied for ${op.txn}`, op.txn)} />
            </div>
          )}
          {(op.type === "installation" || op.type === "clear") && (
            <div>
              <p className="mb-1 text-[10.5px] font-extrabold tracking-widest text-mute">CLEAR CODE · 20 DIGIT · SENSITIVE</p>
              <CodeBox code={z.clearCode} onReveal={() => audit("code_reveal", `Clear code revealed for ${op.txn}`, op.txn)} onCopy={() => audit("code_copy", `Clear code copied for ${op.txn}`, op.txn)} />
            </div>
          )}
          <p className="text-[10.5px] text-mute">Full API payload stored server-side with secrets redacted. Expected issue: {kind}.</p>
        </div>
      )}

      {!z && <p className="text-[12px] text-mute">ZVend call is triggered automatically after MD final approval — never before.</p>}
    </div>
  );
}

// ============================================================
// Audit trail
// ============================================================
export function AuditTrail({ op }: { op: Op }) {
  const { state } = useStore();
  const rows = useMemo(() => state.audit.filter(a => a.txn === op.txn), [state.audit, op.txn]);
  const actionTone = (a: string) =>
    a.includes("reject") || a.includes("mismatch") || a.includes("suspicious") ? "red"
      : a.includes("approve") || a.includes("complete") ? "green"
      : a.includes("api") || a.includes("zvend") ? "blue"
      : a.includes("reveal") || a.includes("copy") || a.includes("delegation") ? "orange" : "gray";
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-card">
      <table className="w-full min-w-[560px] text-left">
        <thead>
          <tr className="border-b border-line bg-paper text-[10px] font-extrabold tracking-widest text-mute">
            <th className="px-3.5 py-2.5">TIME</th><th className="px-3.5 py-2.5">ACTOR</th><th className="px-3.5 py-2.5">ACTION</th><th className="px-3.5 py-2.5">DETAIL</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(a => (
            <tr key={a.id} className="border-b border-line/60 last:border-0 hover:bg-paper/60">
              <td className="whitespace-nowrap px-3.5 py-2.5 font-mono text-[11px] text-mute">{fmtDT(a.at)}</td>
              <td className="px-3.5 py-2.5"><p className="text-[12px] font-bold">{a.userName}</p><p className="text-[9.5px] font-bold tracking-wider text-mute">{a.role === "SYSTEM" ? "SYSTEM" : ROLE_LABEL[a.role as keyof typeof ROLE_LABEL]}</p></td>
              <td className="px-3.5 py-2.5"><TonePill tone={actionTone(a.action) as "red"}>{a.action.replace(/_/g, " ").toUpperCase()}</TonePill></td>
              <td className="px-3.5 py-2.5 text-[12px] text-ink2">{a.detail}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-[12px] text-mute">No audited events for this transaction yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// Stage action panel — the role-specific "do work" surface
// ============================================================
export function StageActionPanel({ op, navigate }: { op: Op; navigate: (to: string) => void }) {
  const { user, can, releaseToTech, confirmCompletion, startField, submitInstallation, startInspection, submitInspection, saveCustomer, saveObservations, resubmit, delegation } = useStore();
  if (!user) return null;
  const actor = actionableBy(op, !!delegation);

  // ---- installation field execution ----
  if (op.type === "installation" && user.role === "TECHNICAL_MAN" && can("installation.execute")) {
    if (op.status === "ASSIGNED") {
      return (
        <ActionCard title="Assigned installation" tone="teal" icon="wrench">
          <p className="mb-3 text-[12.5px] text-ink2">Verify the meter barcode, capture GPS within ± limit, take the 4 required photos and record customer details.</p>
          <Btn variant="volt" icon="bolt" size="lg" className="w-full" onClick={() => startField(op.id)}>START INSTALLATION</Btn>
        </ActionCard>
      );
    }
    if (op.status === "IN_PROGRESS") {
      const scanOk = op.scan?.matched === true;
      const gpsOk = op.gps?.accepted === true;
      const photosOk = op.photos.length >= 4;
      const cust = op.customer ?? { name: "", phone: "", email: "", address: "" };
      const custOk = cust.name.trim().length > 1 && cust.phone.trim().length >= 7;
      const StepHead = ({ n, label, done }: { n: number; label: string; done: boolean }) => (
        <div className="mb-2.5 flex items-center gap-2">
          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-extrabold ${done ? "bg-ok text-white" : "bg-ink text-paper"}`}>{done ? <Icon name="check" size={12} /> : n}</span>
          <p className="font-display text-[13.5px] font-bold">{label}</p>
        </div>
      );
      return (
        <div className="space-y-4">
          <ActionCard title="1 · Barcode verification" tone={scanOk ? "green" : "amber"} icon="scan">
            <ScanBlock op={op} />
          </ActionCard>
          <ActionCard title="2 · GPS capture" tone={gpsOk ? "green" : "amber"} icon="pin" locked={!scanOk}>
            {scanOk ? <GpsBlock op={op} /> : <LockedNote text="Verify the meter barcode first." />}
          </ActionCard>
          <ActionCard title="3 · Evidence photos (4 required)" tone={photosOk ? "green" : "amber"} icon="camera" locked={!gpsOk}>
            {gpsOk
              ? <><PhotosBlock op={op} labels={["Meter Front", "Meter Installation", "Meter Barcode", "Installation Environment"]} /><p className="mt-2 text-[11px] font-bold text-mute">{op.photos.length}/4 captured</p></>
              : <LockedNote text="Capture acceptable GPS first." />}
          </ActionCard>
          <ActionCard title="4 · Customer information" tone={custOk ? "green" : "amber"} icon="user" locked={!photosOk}>
            {photosOk ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Customer full name"><TextInput value={cust.name} onChange={e => saveCustomer(op.id, { ...cust, name: e.target.value })} placeholder="e.g. John Joe" /></Field>
                <Field label="Phone"><TextInput value={cust.phone} onChange={e => saveCustomer(op.id, { ...cust, phone: e.target.value })} placeholder="0803 000 0000" /></Field>
                <Field label="Email"><TextInput value={cust.email} onChange={e => saveCustomer(op.id, { ...cust, email: e.target.value })} placeholder="name@mail.com" /></Field>
                <Field label="Address"><TextInput value={cust.address} onChange={e => saveCustomer(op.id, { ...cust, address: e.target.value })} placeholder="Street, area" /></Field>
                <Field label="Meter number (read-only)"><TextInput value={op.meterNumber} readOnly className="bg-paper font-mono text-mute" /></Field>
                <Field label="Facility (read-only)"><TextInput value={op.facilityId} readOnly className="bg-paper text-mute" /></Field>
                <p className="text-[11px] text-mute sm:col-span-2">Customer data is submitted as part of the activation workflow.</p>
              </div>
            ) : <LockedNote text="Complete the evidence photos first." />}
          </ActionCard>
          <Btn variant="ok" icon="check" size="lg" className="w-full" disabled={!(scanOk && gpsOk && photosOk && custOk)} onClick={() => submitInstallation(op.id)}>
            SUBMIT COMPLETED INSTALLATION
          </Btn>
          {!(scanOk && gpsOk && photosOk && custOk) && <p className="text-center text-[11px] font-bold text-mute">All four steps must be green before submission.</p>}
        </div>
      );
    }
  }

  // ---- inspection field execution ----
  if (op.type === "inspection" && user.role === "TECHNICAL_MAN" && can("inspection.execute")) {
    if (op.status === "SCHEDULED" || op.status === "REJECTED") {
      return (
        <ActionCard title={op.status === "REJECTED" ? "Inspection rejected — retry available" : "Scheduled inspection"} tone={op.status === "REJECTED" ? "red" : "teal"} icon="clipboard">
          <p className="mb-2 text-[12.5px] text-ink2">{op.instruction}</p>
          <p className="mb-3 font-mono text-[11px] text-mute">video duration {mmss(op.durationSec ?? 120)} · scheduled {op.scheduledFor ? fmtDT(op.scheduledFor) : "—"}</p>
          <Btn variant="volt" icon="video" size="lg" className="w-full" onClick={() => startInspection(op.id)}>
            {op.status === "REJECTED" ? "RE-START INSPECTION" : "START INSPECTION"}
          </Btn>
        </ActionCard>
      );
    }
    if (op.status === "IN_PROGRESS") {
      const scanOk = op.scan?.matched === true;
      const gpsOk = op.gps?.accepted === true;
      const videoOk = !!op.video;
      const obsOk = (op.observations ?? "").trim().length > 5;
      return (
        <div className="space-y-4">
          <ActionCard title="1 · Barcode verification" tone={scanOk ? "green" : "amber"} icon="scan"><ScanBlock op={op} /></ActionCard>
          <ActionCard title="2 · GPS capture" tone={gpsOk ? "green" : "amber"} icon="pin" locked={!scanOk}>
            {scanOk ? <GpsBlock op={op} /> : <LockedNote text="Verify the meter barcode first." />}
          </ActionCard>
          <ActionCard title="3 · Inspection video" tone={videoOk ? "green" : "amber"} icon="video" locked={!gpsOk}>
            {gpsOk ? <VideoBlock op={op} durationSec={op.durationSec ?? 120} /> : <LockedNote text="Capture acceptable GPS first." />}
          </ActionCard>
          <ActionCard title="4 · Observations" tone={obsOk ? "green" : "amber"} icon="doc" locked={!videoOk}>
            {videoOk ? <Textarea value={op.observations ?? ""} onChange={e => saveObservations(op.id, e.target.value)} placeholder="Describe seal condition, display state, wiring, environment…" /> : <LockedNote text="Finish the inspection video first." />}
          </ActionCard>
          <Btn variant="ok" icon="check" size="lg" className="w-full" disabled={!(scanOk && gpsOk && videoOk && obsOk)} onClick={() => submitInspection(op.id)}>
            SUBMIT INSPECTION EVIDENCE
          </Btn>
        </div>
      );
    }
  }

  // ---- ZVEND_SUCCESS handlers ----
  if (op.status === "ZVEND_SUCCESS") {
    if (op.type === "installation" && user.role === "SECRETARY" && can("installation.approve")) {
      return (
        <ActionCard title="ZVend registration complete" tone="teal" icon="bolt">
          <p className="mb-3 text-[12.5px] text-ink2">Tamper and clear codes are issued. Verify them above, then release the task to the field.</p>
          <Btn variant="volt" icon="arrowR" size="lg" className="w-full" onClick={() => releaseToTech(op.id)}>MAKE AVAILABLE TO TECHNICAL MAN</Btn>
        </ActionCard>
      );
    }
    if (op.type === "activation" && user.role === "SECRETARY" && can("activation.approve")) {
      return (
        <ActionCard title="ZVend activation confirmed" tone="teal" icon="power">
          <p className="mb-3 text-[12.5px] text-ink2">ZVend has energized the meter. Confirm to close the workflow — the Technical Man receives completion status.</p>
          <Btn variant="ok" icon="check" size="lg" className="w-full" onClick={() => confirmCompletion(op.id)}>CONFIRM & COMPLETE WORKFLOW</Btn>
        </ActionCard>
      );
    }
    if ((op.type === "tamper" || op.type === "clear") && (user.role === "SECRETARY" || op.initiatorId === user.id)) {
      return (
        <ActionCard title="Code issued by ZVend" tone="teal" icon="key">
          <p className="mb-3 text-[12.5px] text-ink2">Reveal the 20-digit code above, deliver it over a secure channel, then confirm delivery to close the record.</p>
          <Btn variant="ok" icon="check" size="lg" className="w-full" onClick={() => confirmCompletion(op.id)}>CONFIRM CODE DELIVERED</Btn>
        </ActionCard>
      );
    }
  }

  // ---- RETURNED / resubmit ----
  if (op.status === "RETURNED" || (op.type === "activation" && op.status === "IN_PROGRESS" && op.stageIdx === 0)) {
    const owner = STAGES[op.type][op.stageIdx].role;
    if (op.status !== "RETURNED" && owner === user.role && user.id !== op.initiatorId) {
      return (
        <ActionCard title="Returned for revision" tone="orange" icon="chevL">
          <p className="mb-3 text-[12.5px] text-ink2">This record was returned. Review the comments and resubmit it into the chain — history is preserved.</p>
          <Btn variant="primary" icon="sync" onClick={() => resubmit(op.id)}>RESUBMIT INTO WORKFLOW</Btn>
        </ActionCard>
      );
    }
    if (user.id === op.initiatorId && (op.status === "RETURNED" || (op.type === "activation" && op.status === "IN_PROGRESS" && op.stageIdx === 0))) {
      return (
        <ActionCard title="Returned to you for revision" tone="orange" icon="chevL">
          <p className="mb-3 text-[12.5px] text-ink2">Address the reviewer comments, then resubmit.</p>
          <Btn variant="primary" icon="sync" onClick={() => resubmit(op.id)}>RESUBMIT INTO WORKFLOW</Btn>
        </ActionCard>
      );
    }
  }

  // ---- approval decision ----
  if (actor === user.role && ["PENDING_ENERGY_MANAGER", "PENDING_GM", "PENDING_MD", "PENDING_SECRETARY"].includes(op.status)) {
    return <DecisionPanel op={op} />;
  }

  // ---- read-only status note ----
  const note = op.status === "WAITING_ZVEND" ? "ZVend call in progress — this stage is automatic."
    : op.status === "SCHEDULED" ? "Waiting for the Technical Man to start the field inspection."
    : op.status === "ASSIGNED" ? "Assigned — waiting for the Technical Man to start."
    : op.status === "COMPLETED" ? "Workflow complete. Full history preserved below."
    : actor === "ZVEND" ? "Awaiting ZVend."
    : actor ? `Awaiting ${ROLE_LABEL[actor as keyof typeof ROLE_LABEL] ?? actor}. No action required from your role.`
    : "No action required from your role on this record.";
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-line2 bg-paper/70 p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink/6 text-mute"><Icon name={op.status === "COMPLETED" ? "check" : "clock"} size={16} /></span>
      <p className="text-[12.5px] font-semibold text-ink2">{note}</p>
    </div>
  );
}

function ActionCard({ title, tone, icon, locked, children }: { title: string; tone: "green" | "amber" | "teal" | "red" | "orange"; icon: string; locked?: boolean; children: React.ReactNode }) {
  const border = { green: "border-[#c2ddcd]", amber: "border-[#eed9b4]", teal: "border-[#bfdbde]", red: "border-[#eac5be]", orange: "border-[#f0d9ae]" }[tone];
  return (
    <div className={`rounded-xl border ${border} bg-card p-4 ${locked ? "opacity-60" : ""} anim-rise`}>
      <div className="mb-3 flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${tone === "green" ? "bg-oksoft text-ok" : tone === "red" ? "bg-dangersoft text-danger" : tone === "teal" ? "bg-tealsoft text-teal" : tone === "orange" ? "bg-voltsoft text-volt2" : "bg-warnsoft text-warn"}`}><Icon name={icon} size={14} /></span>
        <p className="font-display text-[14px] font-bold">{title}</p>
      </div>
      {children}
    </div>
  );
}

function LockedNote({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-paper px-3 py-2.5 text-[12px] font-bold text-mute">
      <Icon name="lock" size={14} /> {text}
    </div>
  );
}

// ============================================================
// Record summary side panel
// ============================================================
export function RecordMeta({ op, facilityName, children }: { op: Op; facilityName: string; children?: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 flex items-center gap-2">
          <Icon name={OPS[op.type].icon} size={15} className="text-volt2" />
          <p className="text-[11px] font-extrabold tracking-widest text-mute">METER</p>
        </div>
        <p className="font-mono text-[19px] font-bold tracking-wide">{op.meterNumber}</p>
        <p className="text-[12px] font-semibold text-ink2">{facilityName}</p>
      </div>
      {children}
    </div>
  );
}
