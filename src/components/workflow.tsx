import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Html5Qrcode } from "html5-qrcode";
import type { Op } from "../lib/core";
import { actionableBy, fmtDT, ROLE_LABEL, STAGES, TERMINAL } from "../lib/core";
import { useStore } from "../lib/core";
import { Btn, copyText, Icon, Modal, StatusPill, TextInput, Textarea, TonePill } from "./ui";

/* ================= Real camera barcode scanner ================= */
const READER_ID = "zadmin-barcode-reader";
export function BarcodeScanner({ title = "Scan barcode", hint, onClose, onDetect }: {
  title?: string; hint?: string; onClose: () => void; onDetect: (code: string, via: "camera" | "manual") => void;
}) {
  const [cam, setCam] = useState<"starting" | "live" | "error">("starting");
  const [errMsg, setErrMsg] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [bootKey, setBootKey] = useState(0);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastRef = useRef({ code: "", at: 0 });
  const onDetectRef = useRef(onDetect); onDetectRef.current = onDetect;

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      const prev = scannerRef.current;
      if (prev) { try { if (prev.isScanning) await prev.stop(); prev.clear(); } catch { /* noop */ } scannerRef.current = null; }
      if (!navigator.mediaDevices?.getUserMedia) {
        if (!cancelled) { setCam("error"); setErrMsg("This browser does not expose a camera. Use manual entry below."); }
        return;
      }
      const scanner = new Html5Qrcode(READER_ID, { verbose: false });
      scannerRef.current = scanner;
      try {
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, aspectRatio: 1.6 },
          decoded => {
            const t = Date.now();
            if (lastRef.current.code === decoded && t - lastRef.current.at < 2500) return;
            lastRef.current = { code: decoded, at: t };
            setFlash(decoded);
            setTimeout(() => onDetectRef.current(decoded, "camera"), 420);
          },
          () => { /* per-frame silence while nothing is in view */ },
        );
        if (!cancelled) setCam("live");
      } catch (e) {
        if (cancelled) return;
        const name = (e as { name?: string })?.name ?? "";
        setCam("error");
        setErrMsg(
          name === "NotAllowedError" ? "Camera permission denied. Allow camera access for this site, then retry — or use manual entry."
            : name === "NotFoundError" ? "No camera was found on this device. Use manual entry below."
            : name === "NotReadableError" ? "The camera is busy in another application. Close it and retry, or use manual entry."
            : "The camera could not be started. Use manual entry below.");
      }
    };
    setCam("starting"); boot();
    return () => {
      cancelled = true;
      const s = scannerRef.current; scannerRef.current = null;
      if (s) { try { if (s.isScanning) s.stop().then(() => s.clear()).catch(() => s.clear()); else s.clear(); } catch { /* noop */ } }
    };
  }, [bootKey]);

  return (
    <Modal open onClose={onClose} title={<span className="flex items-center gap-2"><Icon name="scan" size={16} className="text-volt2" />{title}</span>} wide>
      <div className="space-y-3">
        <div className="relative aspect-video overflow-hidden rounded-xl bg-side">
          <div id={READER_ID} className="absolute inset-0 [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />
          {cam === "live" && !flash && (
            <div className="pointer-events-none absolute inset-0">
              <span className="absolute left-5 top-5 h-8 w-8 rounded-tl-lg border-l-[3px] border-t-[3px] border-volt" />
              <span className="absolute right-5 top-5 h-8 w-8 rounded-tr-lg border-r-[3px] border-t-[3px] border-volt" />
              <span className="absolute bottom-5 left-5 h-8 w-8 rounded-bl-lg border-b-[3px] border-l-[3px] border-volt" />
              <span className="absolute bottom-5 right-5 h-8 w-8 rounded-br-lg border-b-[3px] border-r-[3px] border-volt" />
              <span className="scanline absolute left-10 right-10 h-[2px] rounded bg-volt shadow-[0_0_16px_#e89b2e]" />
              <span className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-black/45 to-transparent" />
              <span className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/45 to-transparent" />
            </div>
          )}
          {cam === "starting" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5">
              <Icon name="camera" size={26} className="spin text-volt" />
              <p className="font-mono text-[11px] font-bold tracking-[0.18em] text-[#93a29a]">REQUESTING CAMERA…</p>
            </div>
          )}
          {cam === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-dangersoft text-danger"><Icon name="alert" size={18} /></span>
              <p className="max-w-sm text-[12.5px] font-semibold leading-snug text-[#c9d3cc]">{errMsg}</p>
              {!errMsg.includes("does not expose") && <Btn size="sm" variant="outline" icon="camera" onClick={() => setBootKey(k => k + 1)}>Retry camera</Btn>}
            </div>
          )}
          {flash && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-ok/20 backdrop-blur-[2px]">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ok text-white anim-rise"><Icon name="check" size={20} /></span>
              <p className="font-mono text-[13px] font-bold text-white">CODE CAPTURED</p>
              <p className="max-w-[80%] truncate font-mono text-[11.5px] font-bold text-[#d7efe1]">{flash}</p>
            </div>
          )}
          {cam === "live" && !flash && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 px-4 py-2.5">
              <span className="h-2 w-2 rounded-full bg-ok okdot" />
              <p className="font-mono text-[10px] font-bold tracking-[0.16em] text-[#c9d3cc]">LIVE · ALIGN THE BARCODE INSIDE THE FRAME</p>
            </div>
          )}
        </div>
        {hint && <p className="text-[11.5px] font-semibold text-mute">{hint}</p>}
        {manualOpen ? (
          <div className="flex gap-2 anim-rise">
            <TextInput autoFocus value={manual} onChange={e => setManual(e.target.value.replace(/\D/g, ""))} placeholder="Key the meter number…" className="font-mono" />
            <Btn variant="ok" icon="check" disabled={!manual.trim()} onClick={() => manual.trim() && onDetect(manual.trim(), "manual")}>Confirm</Btn>
            <Btn variant="ghost" onClick={() => setManualOpen(false)}>Cancel</Btn>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10.5px] font-extrabold tracking-wider text-mute">CODE-128 · EAN · QR SUPPORTED</p>
            <div className="flex gap-2">
              <Btn variant="outline" icon="keyboard" onClick={() => setManualOpen(true)}>Enter manually</Btn>
              <Btn variant="ghost" onClick={onClose}>Close</Btn>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ================= Field photo capture ================= */
/* Always returns a VALID data URL — a malformed fallback (missing "data:"
   prefix) renders as a broken image, which is what made captures look dead. */
const photoFallback = (label: string) =>
  "data:image/svg+xml;utf8," + encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='480'>` +
    `<rect width='640' height='480' fill='#232c26'/>` +
    `<g stroke='rgba(232,155,46,0.16)'><path d='M0 0H640V480H0Z' fill='none'/></g>` +
    `<rect x='170' y='110' width='300' height='220' fill='#2c3830' stroke='#e89b2e' stroke-width='3'/>` +
    `<text x='320' y='222' fill='#e8e6da' font-family='monospace' font-size='21' text-anchor='middle'>ZAROX FIELD PHOTO</text>` +
    `<text x='320' y='254' fill='#e89b2e' font-family='monospace' font-size='15' text-anchor='middle'>${label.toUpperCase()}</text>` +
    `<text x='320' y='452' fill='#9aa79e' font-family='monospace' font-size='12' text-anchor='middle'>${new Date().toLocaleString()}</text>` +
    `</svg>`
  );

export function snapPhoto(label: string, meter: string, lat?: number, lng?: number): string {
  try {
    const c = document.createElement("canvas"); c.width = 640; c.height = 480;
    const x = c.getContext("2d");
    if (!x) return photoFallback(label);
  const g = x.createLinearGradient(0, 0, 640, 480);
  g.addColorStop(0, "#232c26"); g.addColorStop(1, "#10160f");
  x.fillStyle = g; x.fillRect(0, 0, 640, 480);
  x.strokeStyle = "rgba(232,155,46,0.16)";
  for (let i = 0; i < 640; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 480); x.stroke(); }
  for (let i = 0; i < 480; i += 32) { x.beginPath(); x.moveTo(0, i); x.lineTo(640, i); x.stroke(); }
  x.fillStyle = "#2c3830"; x.fillRect(170, 110, 300, 220);
  x.strokeStyle = "#e89b2e"; x.lineWidth = 3; x.strokeRect(170, 110, 300, 220);
  x.fillStyle = "#0d120e"; x.fillRect(195, 135, 250, 60);
  x.fillStyle = "#7ef0b0"; x.font = "bold 30px monospace"; x.fillText(meter.slice(0, 10), 210, 175);
  x.fillStyle = "#e8e6da"; x.font = "bold 15px monospace";
  for (let i = 0; i < 24; i++) x.fillRect(200 + i * 10, 230, i % 3 === 0 ? 5 : 2, 55);
  x.fillStyle = "#e89b2e"; x.font = "bold 18px sans-serif"; x.fillText("ZAROX · " + label.toUpperCase(), 24, 40);
    x.fillStyle = "#9aa79e"; x.font = "12px monospace";
    x.fillText(new Date().toLocaleString(), 24, 452);
    if (lat) x.fillText(`${lat.toFixed(5)}, ${lng?.toFixed(5)}`, 470, 452);
    return c.toDataURL("image/jpeg", 0.82);
  } catch {
    return photoFallback(label);
  }
}

/* Real camera photo capture: live viewfinder → shutter → frame grab with a
   ZAROX HUD overlay (label, meter, timestamp, GPS). Falls back to a
   simulated capture when no camera is available so the field flow never
   dead-ends. */
export function PhotoCapture({ label, meter, lat, lng, onCapture, onClose }: {
  label: string; meter?: string; lat?: number; lng?: number;
  onCapture: (dataUrl: string) => void; onClose: () => void;
}) {
  const [cam, setCam] = useState<"starting" | "live" | "error">("starting");
  const [errMsg, setErrMsg] = useState("");
  const [flashOn, setFlashOn] = useState(false);
  const [bootKey, setBootKey] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw { name: "NoMediaDevices" };
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 960 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) { v.srcObject = stream; await v.play().catch(() => { /* autoplay quirks — frames still render */ }); }
        if (!cancelled) setCam("live");
      } catch (e) {
        if (cancelled) return;
        const name = (e as { name?: string })?.name ?? "";
        setCam("error");
        setErrMsg(
          name === "NotAllowedError" ? "Camera permission denied. Allow camera access and retry — or use simulated capture below."
            : name === "NotFoundError" ? "No camera was found on this device. Use simulated capture below."
            : name === "NotReadableError" ? "The camera is busy in another application. Close it and retry, or use simulated capture."
            : "The camera could not be started. Use simulated capture below.");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, [bootKey]);

  const finish = (dataUrl: string) => {
    if (doneRef.current) return;
    doneRef.current = true;
    setFlashOn(true);
    setTimeout(() => onCapture(dataUrl), 330);
  };

  const shoot = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth || !v.videoHeight) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    const x = c.getContext("2d");
    if (!x) { finish(snapPhoto(label, meter ?? "", lat, lng)); return; }
    x.drawImage(v, 0, 0);
    // HUD overlay -------------------------------------------------------
    const bar = Math.max(44, Math.round(c.height * 0.09));
    x.fillStyle = "rgba(10,14,11,0.62)";
    x.fillRect(0, 0, c.width, bar); x.fillRect(0, c.height - bar, c.width, bar);
    x.fillStyle = "#e89b2e";
    x.font = `bold ${Math.round(bar * 0.42)}px monospace`;
    x.fillText("ZAROX · " + label.toUpperCase(), 16, bar * 0.66);
    x.fillStyle = "#e8e6da";
    x.font = `${Math.round(bar * 0.3)}px monospace`;
    const meta = [new Date().toLocaleString(), meter ? `MTR ${meter}` : "", lat ? `${lat.toFixed(5)}, ${lng?.toFixed(5)}` : ""].filter(Boolean).join("  ·  ");
    x.fillText(meta, 16, c.height - bar * 0.34);
    let out: string;
    try { out = c.toDataURL("image/jpeg", 0.85); } catch { out = snapPhoto(label, meter ?? "", lat, lng); }
    finish(out);
  };

  return (
    <Modal open onClose={onClose} title={<span className="flex items-center gap-2"><Icon name="camera" size={16} className="text-volt2" />Capture · {label}</span>} wide>
      <div className="space-y-3">
        <div className="relative aspect-video overflow-hidden rounded-xl bg-side">
          <video ref={videoRef} playsInline muted className={`absolute inset-0 h-full w-full object-cover ${cam === "live" ? "" : "opacity-0"}`} />
          {cam === "live" && !flashOn && (
            <div className="pointer-events-none absolute inset-0">
              <span className="absolute left-5 top-5 h-8 w-8 rounded-tl-lg border-l-[3px] border-t-[3px] border-volt" />
              <span className="absolute right-5 top-5 h-8 w-8 rounded-tr-lg border-r-[3px] border-t-[3px] border-volt" />
              <span className="absolute bottom-5 left-5 h-8 w-8 rounded-bl-lg border-b-[3px] border-l-[3px] border-volt" />
              <span className="absolute bottom-5 right-5 h-8 w-8 rounded-br-lg border-b-[3px] border-r-[3px] border-volt" />
              <span className="absolute left-1/2 top-1/2 h-14 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/35" />
              <span className="absolute left-1/2 top-1/2 h-1 w-5 -translate-x-1/2 -translate-y-1/2 bg-white/60" />
              <span className="absolute left-1/2 top-1/2 h-5 w-1 -translate-x-1/2 -translate-y-1/2 bg-white/60" />
            </div>
          )}
          {cam === "live" && !flashOn && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 px-4 py-2.5">
              <span className="h-2 w-2 rounded-full bg-danger recblink" />
              <p className="font-mono text-[10px] font-bold tracking-[0.16em] text-[#e8e6da]">LIVE · {label.toUpperCase()}{meter ? ` · MTR ${meter}` : ""}</p>
            </div>
          )}
          {cam === "starting" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5">
              <Icon name="camera" size={26} className="spin text-volt" />
              <p className="font-mono text-[11px] font-bold tracking-[0.18em] text-[#93a29a]">REQUESTING CAMERA…</p>
            </div>
          )}
          {cam === "error" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-dangersoft text-danger"><Icon name="alert" size={18} /></span>
              <p className="max-w-sm text-[12.5px] font-semibold leading-snug text-[#c9d3cc]">{errMsg}</p>
              <div className="flex gap-2">
                <Btn size="sm" variant="outline" icon="camera" onClick={() => setBootKey(k => k + 1)}>Retry camera</Btn>
                <Btn size="sm" variant="ok" icon="check" onClick={() => finish(snapPhoto(label, meter ?? "", lat, lng))}>Simulated capture</Btn>
              </div>
            </div>
          )}
          {flashOn && <div className="anim-fade absolute inset-0 z-10 flex items-center justify-center bg-white"><Icon name="check" size={30} className="text-ok" /></div>}
        </div>
        {cam === "live" && !flashOn && (
          <div className="flex items-center justify-center gap-6">
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
            <button
              onClick={shoot}
              title="Take photo"
              className="group flex h-16 w-16 items-center justify-center rounded-full border-4 border-ink bg-card transition-transform hover:scale-105 active:scale-90"
            >
              <span className="h-11 w-11 rounded-full bg-volt transition-all group-hover:bg-volt2 group-active:h-9 group-active:w-9" />
            </button>
            <span className="w-[72px] text-center font-mono text-[9.5px] font-bold tracking-wider text-mute">SHUTTER</span>
          </div>
        )}
        {cam === "starting" && <p className="text-center text-[11px] font-semibold text-mute">Waiting for camera access…</p>}
      </div>
    </Modal>
  );
}

/* ================= Timeline ================= */
export function WorkflowTimeline({ op }: { op: Op }) {
  const stages = STAGES[op.type];
  const idx = Math.min(op.stageIdx, stages.length - 1);
  const done = TERMINAL.includes(op.status);
  return (
    <div className="space-y-0">
      {stages.map((s, i) => {
        const c = op.comments[i];
        const state = i < idx || done ? "done" : i === idx ? (done ? "done" : "current") : "todo";
        return (
          <div key={s.key + i} className="relative flex gap-3 pb-4 last:pb-0">
            {i < stages.length - 1 && <span className={`absolute left-[13px] top-7 h-[calc(100%-22px)] w-[2px] ${i < idx ? "bg-ok/50" : "bg-line"}`} />}
            <span className={`z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${
              state === "done" ? "border-ok bg-ok text-white" : state === "current" ? "border-volt bg-voltsoft text-volt2 livedot" : "border-line2 bg-paper text-mute"}`}>
              {state === "done" ? <Icon name="check" size={12} /> : state === "current" ? <Icon name="clock" size={12} /> : <span className="text-[9.5px] font-extrabold tnum">{i + 1}</span>}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className={`text-[12.5px] font-extrabold ${state === "todo" ? "text-mute" : ""}`}>{s.label}</p>
                {s.role === "ZVEND" && <TonePill tone="blue">API</TonePill>}
                {c?.decision && <TonePill tone={c.decision === "reject" ? "red" : c.decision === "return" ? "amber" : "green"}>{c.decision.toUpperCase()}</TonePill>}
              </div>
              {c && <p className="mt-0.5 truncate text-[11.5px] text-mute" title={c.text}>“{c.text}” — {c.userName}</p>}
              {c && <p className="font-mono text-[9.5px] text-mute/70">{fmtDT(c.at)}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ================= Comments ================= */
export function CommentThread({ op }: { op: Op }) {
  return (
    <div className="divide-y divide-line/70">
      {op.comments.length === 0 && <p className="py-5 text-center text-[12px] text-mute">No comments yet — every workflow decision appends an immutable comment.</p>}
      {op.comments.map(c => (
        <div key={c.id} className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-[9px] font-extrabold text-volt">{c.userName.split(" ").map(w => w[0]).join("").slice(0, 2)}</span>
            <p className="text-[12.5px] font-extrabold">{c.userName}</p>
            <TonePill tone="gray">{ROLE_LABEL[c.role].toUpperCase()}</TonePill>
            {c.decision && <TonePill tone={c.decision === "reject" ? "red" : c.decision === "return" ? "amber" : "green"}>{c.decision.toUpperCase()}</TonePill>}
            <span className="ml-auto font-mono text-[9.5px] text-mute">{fmtDT(c.at)}</span>
          </div>
          <p className="mt-1.5 rounded-lg bg-paper px-3 py-2 text-[12.5px] leading-relaxed">{c.text}</p>
        </div>
      ))}
    </div>
  );
}

/* ================= Approval panel ================= */
export function ApprovalPanel({ op }: { op: Op }) {
  const { user, decide, delegation } = useStore();
  const [comment, setComment] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  if (!user) return null;
  const owner = actionableBy(op, delegation);
  if (owner !== user.role) return null;
  const stage = STAGES[op.type][Math.min(op.stageIdx, STAGES[op.type].length - 1)];
  const isApprover = ["ENERGY_MANAGER", "GENERAL_MANAGER", "MD", "SECRETARY"].includes(owner) && stage.key !== "INITIATOR" && stage.key !== "DELIVERY" && stage.key !== "EXECUTION";
  const run = (d: Parameters<typeof decide>[1]) => {
    setErr(""); setBusy(d);
    setTimeout(() => { const e = decide(op.id, d, comment); if (e) setErr(e); else setComment(""); setBusy(null); }, 350);
  };
  const label = stage.key === "DELIVERY" ? (op.type === "installation" ? "Make available to Technical Man" : "Confirm completion") : stage.key === "EXECUTION" ? "Confirm execution complete" : "Confirm delivery";
  return (
    <div className="rounded-xl border-2 border-volt/60 bg-voltsoft/60 p-4 anim-rise">
      <p className="flex items-center gap-2 font-display text-[13.5px] font-bold text-volt2"><Icon name="approve" size={15} /> Awaiting your action · {stage.label}{delegation && stage.role === "MD" ? " (MD delegation)" : ""}</p>
      <Textarea value={comment} onChange={e => setComment(e.target.value)} placeholder={`Your ${owner === "TECHNICAL_MAN" ? "execution note" : "comment"} — required, append-only…`} className="mt-2.5 bg-card" />
      {err && <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] font-extrabold text-danger anim-fade"><Icon name="alert" size={12} />{err}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {isApprover ? (
          <>
            <Btn variant="ok" icon="check" loading={busy === "approve"} onClick={() => run("approve")}>Approve</Btn>
            <Btn variant="danger" icon="x" loading={busy === "reject"} onClick={() => run("reject")}>Reject</Btn>
            <Btn variant="outline" icon="chevL" loading={busy === "return"} onClick={() => run("return")}>Return</Btn>
          </>
        ) : (
          <Btn variant="volt" icon="arrowR" loading={busy === "deliver" || busy === "execute" || busy === "confirm"} onClick={() => run(stage.key === "EXECUTION" ? "execute" : stage.key === "DELIVERY" ? (op.type === "installation" ? "deliver" : "confirm") : "confirm")}>{label}</Btn>
        )}
      </div>
    </div>
  );
}

/* ================= ZVend panel + secure codes ================= */
export function CodeMask({ code, opId, kind }: { code?: string; opId: string; kind: string }) {
  const { auditCode, toast } = useStore();
  const [shown, setShown] = useState(false);
  if (!code) return <span className="text-[11.5px] font-semibold text-mute">Not issued</span>;
  const masked = "•••• •••• •••• •••• ••••";
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[13px] font-bold tracking-wide">{shown ? code.replace(/(.{4})/g, "$1 ").trim() : masked}</span>
      <button className="rounded-md border border-line2 bg-card p-1.5 text-mute transition-colors hover:text-ink" title={shown ? "Hide" : "Reveal (audited)"}
        onClick={() => { setShown(v => !v); if (!shown) auditCode(opId, `${kind}_code_reveal`); }}>
        <Icon name={shown ? "eyeoff" : "eye"} size={13} />
      </button>
      <button className="rounded-md border border-line2 bg-card p-1.5 text-mute transition-colors hover:text-ink" title="Copy (audited)"
        onClick={() => { copyText(code).then(() => { toast(`${kind === "tamper" ? "Tamper" : "Clear"} code copied`, "info"); auditCode(opId, `${kind}_code_copy`); }); }}>
        <Icon name="copy" size={13} />
      </button>
    </div>
  );
}

export function ZVendPanel({ op }: { op: Op }) {
  const z = op.zvend;
  if (op.type === "inspection") return <p className="rounded-lg border border-line bg-paper px-3 py-2.5 text-[11.5px] font-bold text-mute"><Icon name="info" size={12} className="mr-1.5 inline" />Inspections never call ZVend — the chain is fully internal.</p>;
  if (!z) return (
    <div className="rounded-lg border border-dashed border-line2 bg-paper/60 px-3 py-3 text-[11.5px] font-semibold text-mute">
      ZVend call is queued automatically after MD final approval. Idempotency key: <span className="font-mono font-bold">zvend:{op.txn}:1</span>
    </div>
  );
  return (
    <div className={`rounded-xl border p-4 ${z.status === "success" ? "border-[#c2ddcd] bg-oksoft/50" : "border-[#eac5be] bg-dangersoft/50"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={z.status === "success" ? "ZVEND_SUCCESS" : "ZVEND_FAILED"} />
        <span className="font-mono text-[11px] font-bold text-mute">ref {z.ref} · code {z.responseCode} · {z.latencyMs} ms · {fmtDT(z.at)}</span>
      </div>
      <div className="mt-3 space-y-2">
        {z.tamper && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-card px-3 py-2"><span className="text-[10.5px] font-extrabold tracking-widest text-mute">TAMPER CODE</span><CodeMask code={z.tamper} opId={op.id} kind="tamper" /></div>}
        {z.clear && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-card px-3 py-2"><span className="text-[10.5px] font-extrabold tracking-widest text-mute">CLEAR CODE</span><CodeMask code={z.clear} opId={op.id} kind="clear" /></div>}
      </div>
      <p className="mt-2.5 text-[10px] font-bold text-mute">Payload and response are stored sanitized in API Logs — codes never appear in logs.</p>
    </div>
  );
}

/* ================= Field blocks ================= */
export function ScanBlock({ op, onVerified }: { op: Op; onVerified?: () => void }) {
  const { saveScan } = useStore();
  const [open, setOpen] = useState(false);
  const done = op.scan?.matched === true;
  if (done) return (
    <div className="flex items-center gap-2.5 rounded-lg border border-[#c2ddcd] bg-oksoft p-3">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ok text-white"><Icon name="check" size={15} /></span>
      <div><p className="font-display text-[13px] font-bold text-ok">METER VERIFIED</p><p className="font-mono text-[11px] text-ink2">{op.scan!.value} · {fmtDT(op.scan!.at)}</p></div>
    </div>
  );
  return (
    <div className="space-y-2.5">
      {op.scan && !op.scan.matched && (
        <div className="flex items-center gap-2.5 rounded-lg border-2 border-danger bg-dangersoft p-3 anim-rise">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-danger text-white"><Icon name="alert" size={15} /></span>
          <div><p className="font-display text-[13px] font-bold text-danger">METER NUMBER MISMATCH</p><p className="text-[11px] text-ink2">Read “{op.scan.value}” ≠ {op.meterNumber}. Operation stopped — re-scan.</p></div>
        </div>
      )}
      <Btn variant="primary" icon="camera" onClick={() => setOpen(true)}>Scan meter barcode</Btn>
      {open && (
        <BarcodeScanner
          title="Scan meter barcode"
          hint={`The read is compared against authorized meter ${op.meterNumber}. A mismatch stops the operation.`}
          onClose={() => setOpen(false)}
          onDetect={code => {
            setOpen(false);
            const v = code.replace(/\D/g, "");
            const matched = !!v && (v === op.meterNumber || v.includes(op.meterNumber) || op.meterNumber.includes(v));
            saveScan(op.id, { value: v || code, matched, at: Date.now() });
            if (matched) onVerified?.();
          }}
        />
      )}
    </div>
  );
}

export function GpsBlock({ op }: { op: Op }) {
  const { state, saveGps } = useStore();
  const [busy, setBusy] = useState(false);
  const max = state.settings.maxGpsAccuracyM;
  const fac = state.facilities.find(f => f.id === op.facilityId);
  if (op.gps?.accepted) return (
    <div className="flex items-center gap-2.5 rounded-lg border border-[#c2ddcd] bg-oksoft p-3">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ok text-white"><Icon name="pin" size={15} /></span>
      <div><p className="font-mono text-[12.5px] font-bold text-ok">{op.gps.lat}, {op.gps.lng}</p><p className="text-[10.5px] font-bold text-mute">±{op.gps.accuracy} m · within ±{max} m ceiling · {fmtDT(op.gps.at)}</p></div>
    </div>
  );
  return (
    <div className="space-y-2.5">
      {op.gps && !op.gps.accepted && <p className="flex items-center gap-2 rounded-lg border border-[#eac5be] bg-dangersoft px-3 py-2 text-[11.5px] font-extrabold text-danger anim-rise"><Icon name="alert" size={13} /> GPS ±{op.gps.accuracy} m exceeded ±{max} m — capture rejected, completion blocked.</p>}
      <Btn variant="primary" icon="pin" loading={busy} onClick={() => {
        setBusy(true);
        setTimeout(() => {
          const acc = Math.round(6 + Math.random() * 22);
          saveGps(op.id, { lat: +((fac?.lat ?? 6.45) + (Math.random() - 0.5) * 0.0016).toFixed(6), lng: +((fac?.lng ?? 3.55) + (Math.random() - 0.5) * 0.0016).toFixed(6), accuracy: acc, at: Date.now(), accepted: acc <= max });
          setBusy(false);
        }, 1400);
      }}>Capture GPS</Btn>
    </div>
  );
}

export function PhotoBlock({ op, labels }: { op: Op; labels: string[] }) {
  const { addPhoto } = useStore();
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {labels.map(l => {
        const p = op.photos.find(x => x.label === l);
        return p
          ? <img key={l} src={p.dataUrl} alt={l} className="aspect-[4/3] w-full rounded-lg border border-line object-cover" />
          : <button key={l} onClick={() => addPhoto(op.id, { id: Math.random().toString(36).slice(2), label: l, dataUrl: snapPhoto(l, op.meterNumber, op.gps?.lat, op.gps?.lng), at: Date.now(), lat: op.gps?.lat, lng: op.gps?.lng })}
            className="flex aspect-[4/3] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line2 bg-paper transition-colors hover:border-volt hover:bg-voltsoft">
            <Icon name="camera" size={16} className="text-mute" /><span className="px-1 text-center text-[9.5px] font-extrabold text-ink2">{l}</span>
          </button>;
      })}
    </div>
  );
}

/* Real-camera inspection recorder: viewfinder (live MediaStream) → RECORDING
   with mm:ss countdown that auto-stops at zero → review clip + observations.
   `autoSubmit` advances the workflow (execute decision) once saved. */
export function VideoBlock({ op, autoSubmit = false }: { op: Op; autoSubmit?: boolean }) {
  const { saveVideo, decide, toast } = useStore();
  const [phase, setPhase] = useState<"idle" | "viewfinder" | "rec" | "review">("idle");
  const [left, setLeft] = useState(op.durationSec ?? 120);
  const [obs, setObs] = useState(op.observations ?? "");
  const [url, setUrl] = useState<string | null>(null);
  const [camErr, setCamErr] = useState("");
  const [simulated, setSimulated] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const dur = op.durationSec ?? 120;
  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");

  const stopStream = () => { streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null; };
  useEffect(() => () => {
    try { if (recRef.current && recRef.current.state === "recording") recRef.current.stop(); } catch { /* noop */ }
    stopStream();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  /* Countdown — auto-stops the recorder at zero. */
  useEffect(() => {
    if (phase !== "rec") return;
    if (left <= 0) {
      try { if (recRef.current && recRef.current.state === "recording") recRef.current.stop(); } catch { /* noop */ }
      if (simulated) { stopStream(); setPhase("review"); }
      return;
    }
    const t = setTimeout(() => setLeft(l => l - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, left, simulated]);

  const openViewfinder = async () => {
    setCamErr("");
    if (!navigator.mediaDevices?.getUserMedia) { setCamErr("This browser does not expose a camera. Use the simulated capture below."); setPhase("viewfinder"); return; }
    setPhase("viewfinder");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => undefined); }
    } catch (e) {
      const name = (e as { name?: string })?.name ?? "";
      setCamErr(
        name === "NotAllowedError" ? "Camera permission denied. Allow camera access and retry — or use the simulated capture."
          : name === "NotFoundError" ? "No camera found on this device. Use the simulated capture."
          : name === "NotReadableError" ? "The camera is busy in another app. Close it and retry, or use the simulated capture."
          : "The camera could not be started. Use the simulated capture.");
    }
  };

  const beginRecording = () => {
    setSimulated(false); chunks.current = []; setLeft(dur);
    const stream = streamRef.current;
    const hasRecorder = typeof MediaRecorder !== "undefined" && !!stream && stream.getVideoTracks().length > 0;
    if (hasRecorder) {
      const rec = new MediaRecorder(stream!);
      recRef.current = rec;
      rec.ondataavailable = e => { if (e.data && e.data.size) chunks.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunks.current, { type: rec.mimeType || "video/webm" });
        const u = URL.createObjectURL(blob);
        urlRef.current = u; setUrl(u);
        stopStream();
        if (videoRef.current) videoRef.current.srcObject = null;
        setPhase("review");
      };
      rec.start(250);
    } else {
      setSimulated(true);
      toast("MediaRecorder unavailable — running a simulated capture.", "warn");
    }
    setPhase("rec");
  };

  const save = () => {
    saveVideo(op.id, { url: url ?? "sim", durationSec: dur, at: Date.now() }, obs.trim());
    if (autoSubmit) {
      const e = decide(op.id, "execute", obs.trim() || "Inspection recording submitted.");
      if (e) toast(e, "danger");
      else toast("Submitted for Secretary review.", "ok");
    } else {
      toast("Video saved.", "ok");
    }
  };

  if (op.video && op.observations && phase === "idle") return (
    <div className="rounded-lg border border-[#c2ddcd] bg-oksoft p-3">
      <p className="flex items-center gap-2 font-display text-[13px] font-bold text-ok"><Icon name="video" size={15} /> VIDEO CAPTURED · {op.video.durationSec}s</p>
      <p className="mt-1 text-[11.5px] text-ink2">Observations: {op.observations}</p>
    </div>
  );

  return (
    <div className="space-y-2.5">
      {phase === "idle" && (
        <Btn variant="primary" icon="video" onClick={openViewfinder}>
          Open camera · {Math.floor(dur / 60)}:{String(dur % 60).padStart(2, "0")} recording rule
        </Btn>
      )}

      {phase === "viewfinder" && (
        <div className="anim-rise space-y-2.5">
          <div className="relative aspect-video overflow-hidden rounded-xl bg-side">
            <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-cover" />
            {!streamRef.current && <div className="bg-circuit absolute inset-0" />}
            <span className="absolute left-5 top-5 h-8 w-8 rounded-tl-lg border-l-[3px] border-t-[3px] border-danger" />
            <span className="absolute right-5 top-5 h-8 w-8 rounded-tr-lg border-r-[3px] border-t-[3px] border-danger" />
            <span className="absolute bottom-5 left-5 h-8 w-8 rounded-bl-lg border-b-[3px] border-l-[3px] border-danger" />
            <span className="absolute bottom-5 right-5 h-8 w-8 rounded-br-lg border-b-[3px] border-r-[3px] border-danger" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/55 to-transparent px-4 py-2.5">
              <span className={`h-2 w-2 rounded-full ${camErr ? "bg-danger" : "bg-ok okdot"}`} />
              <p className="font-mono text-[10px] font-bold tracking-[0.16em] text-[#e6ebe7]">{camErr ? "CAMERA UNAVAILABLE" : `LIVE VIEWFINDER · ${op.meterNumber}`}</p>
            </div>
            {camErr && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-8 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-dangersoft text-danger"><Icon name="alert" size={18} /></span>
                <p className="max-w-sm text-[12px] font-semibold leading-snug text-[#c9d3cc]">{camErr}</p>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Btn variant="danger" icon="video" disabled={!!camErr} onClick={beginRecording}>START RECORDING · {dur}s</Btn>
            {camErr && <Btn variant="outline" icon="video" onClick={() => { setSimulated(true); setLeft(dur); setPhase("rec"); }}>Simulate recording</Btn>}
            {!camErr && <Btn variant="outline" icon="camera" onClick={openViewfinder}>Retry camera</Btn>}
            <Btn variant="ghost" onClick={() => { stopStream(); setPhase("idle"); }}>Cancel</Btn>
          </div>
        </div>
      )}

      {phase === "rec" && (
        <div className="relative aspect-video overflow-hidden rounded-xl bg-side anim-rise">
          {!simulated && streamRef.current
            ? <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-cover" />
            : <div className="bg-circuit absolute inset-0" />}
          <span className="absolute left-5 top-5 h-8 w-8 rounded-tl-lg border-l-[3px] border-t-[3px] border-danger" />
          <span className="absolute right-5 top-5 h-8 w-8 rounded-tr-lg border-r-[3px] border-t-[3px] border-danger" />
          <span className="absolute bottom-5 left-5 h-8 w-8 rounded-bl-lg border-b-[3px] border-l-[3px] border-danger" />
          <span className="absolute bottom-5 right-5 h-8 w-8 rounded-br-lg border-b-[3px] border-r-[3px] border-danger" />
          <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-4 py-2.5">
            <span className="flex items-center gap-2 font-mono text-[12px] font-extrabold tracking-[0.22em] text-white"><span className="h-2.5 w-2.5 rounded-full bg-danger recblink" />RECORDING{simulated ? " · SIMULATED" : ""}</span>
            <span className="font-mono text-[11px] font-bold text-[#e6ebe7]">{op.meterNumber}</span>
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="rounded-xl bg-ink/70 px-5 py-2 font-display text-[46px] font-bold leading-none text-paper tnum">{mm}:{ss}</p>
            <p className="mt-2 font-mono text-[10px] tracking-widest text-[#c9d3cc]">AUTO-STOPS AT ZERO</p>
          </div>
          <div className="absolute inset-x-4 bottom-3 h-1.5 overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-danger transition-[width] duration-1000 ease-linear" style={{ width: `${(left / dur) * 100}%` }} />
          </div>
        </div>
      )}

      {phase === "review" && (
        <div className="space-y-2.5 anim-rise">
          {url ? <video src={url} controls playsInline className="aspect-video w-full rounded-xl border border-line bg-side object-contain" />
            : <div className="flex aspect-video flex-col items-center justify-center gap-1 rounded-xl border border-line bg-side"><Icon name="video" size={20} className="text-[#5d6b62]" /><p className="font-mono text-[11px] text-[#93a29a]">SIMULATED CAPTURE · {dur}s</p></div>}
          <Textarea value={obs} onChange={e => setObs(e.target.value)} placeholder="Inspection observations — seal state, display readings, terminal block…" />
          <div className="flex flex-wrap gap-2">
            <Btn variant="ok" icon="check" disabled={obs.trim().length < 5} onClick={save}>{autoSubmit ? "Save & submit for review" : "Save video & observations"}</Btn>
            <Btn variant="outline" icon="video" onClick={() => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); urlRef.current = null; setUrl(null); setSimulated(false); openViewfinder(); }}>Discard & re-record</Btn>
          </div>
          <p className="text-[10.5px] font-semibold text-mute">Observations require at least 5 characters — they become the execution comment.</p>
        </div>
      )}
    </div>
  );
}

export function EvidenceRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <p className="mb-2.5 text-[10.5px] font-extrabold tracking-[0.14em] text-mute">{label.toUpperCase()}</p>
      {children}
    </div>
  );
}
