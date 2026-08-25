import { useMemo, useRef, useState } from "react";
import type { GpsRec, LocateRec, Meter } from "../lib/core";
import { age, fmtDT } from "../lib/core";
import { useStore } from "../lib/core";
import { BarcodeScanner } from "../components/workflow";
import { Btn, Card, Icon, Modal, SectionHead, Select, TextInput, TonePill } from "../components/ui";

/* ------------------------------------------------------------------ */
/* Projection — linear fit of the service area onto a 1000×620 canvas  */
/* ------------------------------------------------------------------ */
const B = { minLng: 3.33, maxLng: 3.63, minLat: 6.395, maxLat: 6.545 };
const VW = 1000, VH = 620;
const px = (lng: number) => ((lng - B.minLng) / (B.maxLng - B.minLng)) * VW;
const py = (lat: number) => ((B.maxLat - lat) / (B.maxLat - B.minLat)) * VH;

const DISTRICTS: { label: string; x: number; y: number }[] = [
  { label: "SURULERE", x: px(3.385), y: py(6.512) },
  { label: "YABA", x: px(3.40), y: py(6.497) },
  { label: "VICTORIA ISLAND", x: px(3.405), y: py(6.4235) },
  { label: "IKOYI", x: px(3.435), y: py(6.4555) },
  { label: "LEKKI PHASE 1", x: px(3.485), y: py(6.4375) },
  { label: "AJAH", x: px(3.575), y: py(6.4565) },
];

const ROADS: string[] = [
  `M ${px(3.34)} ${py(6.528)} L ${px(3.42)} ${py(6.52)} L ${px(3.47)} ${py(6.505)} L ${px(3.52)} ${py(6.525)}`,      // mainland west–east
  `M ${px(3.41)} ${py(6.545)} L ${px(3.40)} ${py(6.485)}`,                                                              // mainland north–south
  `M ${px(3.39)} ${py(6.433)} C ${px(3.45)} ${py(6.446)} ${px(3.5)} ${py(6.44)} ${px(3.56)} ${py(6.455)} L ${px(3.615)} ${py(6.47)}`, // island spine
  `M ${px(3.445)} ${py(6.465)} L ${px(3.452)} ${py(6.438)}`,                                                            // ikoyi cross
  `M ${px(3.54)} ${py(6.442)} L ${px(3.56)} ${py(6.492)}`,                                                              // lekki–ajah link
];
const BRIDGES: string[] = [
  `M ${px(3.385)} ${py(6.489)} C ${px(3.39)} ${py(6.47)} ${px(3.40)} ${py(6.45)} ${px(3.415)} ${py(6.434)}`,   // Third Mainland
  `M ${px(3.452)} ${py(6.452)} L ${px(3.46)} ${py(6.443)}`,                                                    // Falomo
  `M ${px(3.470)} ${py(6.462)} C ${px(3.478)} ${py(6.455)} ${px(3.482)} ${py(6.45)} ${px(3.486)} ${py(6.446)}`, // Lekki–Ikoyi
];
const LAGOON = `M 0 ${py(6.478)} C ${px(3.4)} ${py(6.486)} ${px(3.44)} ${py(6.47)} ${px(3.5)} ${py(6.476)} C ${px(3.56)} ${py(6.482)} ${px(3.6)} ${py(6.47)} 1000 ${py(6.478)} L 1000 ${py(6.452)} C ${px(3.58)} ${py(6.447)} ${px(3.52)} ${py(6.456)} ${px(3.46)} ${py(6.45)} C ${px(3.42)} ${py(6.446)} ${px(3.38)} ${py(6.462)} 0 ${py(6.458)} Z`;

type RouteState = { o: { lat: number; lng: number; accuracy: number }; target: string; at: number };

/* Great-circle distance between two fixes. */
const havKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const fmtDist = (km: number) => (km < 1 ? `${Math.max(1, Math.round(km * 1000))} m` : `${km.toFixed(2)} km`);

function ServiceMap({ locates, facilities, selected, onSelect, sweep, route }: {
  locates: LocateRec[]; facilities: { id: string; code: string; name: string; lat: number; lng: number }[];
  selected: string | null; onSelect: (meter: string) => void; sweep: boolean; route: RouteState | null;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [view, setView] = useState({ k: 1, tx: 0, ty: 0 });
  const [drag, setDrag] = useState<{ x: number; y: number; tx: number; ty: number; scale: number; moved: boolean } | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const center = (meter: string, k = 1.7) => {
    const l = locates.find(x => x.meterNumber === meter);
    if (!l) return;
    const x = px(l.lng), y = py(l.lat);
    setView({ k, tx: VW / 2 - x * k, ty: VH / 2 - y * k });
  };
  const zoomBy = (f: number) => setView(v => {
    const k = Math.min(3.2, Math.max(0.55, v.k * f));
    const cx = (VW / 2 - v.tx) / v.k, cy = (VH / 2 - v.ty) / v.k;
    return { k, tx: VW / 2 - cx * k, ty: VH / 2 - cy * k };
  });
  const reset = () => setView({ k: 1, tx: 0, ty: 0 });

  const pick = (meter: string) => { onSelect(meter); center(meter); };

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-[#22302a] bg-[#101815]">
      <svg ref={svgRef} viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid slice" className="h-full w-full cursor-grab touch-none select-none active:cursor-grabbing"
        onPointerDown={e => {
          const rect = svgRef.current!.getBoundingClientRect();
          setDrag({ x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, scale: VW / rect.width, moved: false });
          (e.target as Element).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={e => { if (drag) { const dx = (e.clientX - drag.x) * drag.scale, dy = (e.clientY - drag.y) * drag.scale; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; setView(v => ({ ...v, tx: drag.tx + dx, ty: drag.ty + dy })); } }}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
      >
        <defs>
          <pattern id="mgrid" width="34" height="34" patternUnits="userSpaceOnUse">
            <path d="M 34 0 L 0 0 0 34" fill="none" stroke="#1b2721" strokeWidth="1" />
          </pattern>
          <radialGradient id="pinGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#e89b2e" stopOpacity=".28" /><stop offset="100%" stopColor="#e89b2e" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="posGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#2f6b8f" stopOpacity=".4" /><stop offset="100%" stopColor="#2f6b8f" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width={VW} height={VH} fill="#101815" />
        <rect width={VW} height={VH} fill="url(#mgrid)" />

        <g style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.k})`, transformOrigin: "0 0", transition: drag ? "none" : "transform .65s cubic-bezier(.22,1,.36,1)" }}>
          {/* landmass shading */}
          <path d={`M 0 0 H ${VW} V ${py(6.478)} C ${px(3.6)} ${py(6.47)} ${px(3.56)} ${py(6.482)} ${px(3.5)} ${py(6.476)} C ${px(3.44)} ${py(6.47)} ${px(3.4)} ${py(6.486)} 0 ${py(6.478)} Z`} fill="#141f19" />
          <path d={`M 0 ${py(6.458)} C ${px(3.38)} ${py(6.462)} ${px(3.42)} ${py(6.446)} ${px(3.46)} ${py(6.45)} C ${px(3.52)} ${py(6.456)} ${px(3.58)} ${py(6.447)} 1000 ${py(6.452)} V ${VH} H 0 Z`} fill="#131d18" />
          {/* lagoon + ocean */}
          <path d={LAGOON} fill="#0d2b31" opacity=".9" />
          <path d={`M 0 ${py(6.408)} C ${px(3.45)} ${py(6.401)} ${px(3.55)} ${py(6.412)} 1000 ${py(6.404)} V ${VH} H 0 Z`} fill="#0c2830" opacity=".85" />
          <path d={`M 0 ${py(6.408)} C ${px(3.45)} ${py(6.401)} ${px(3.55)} ${py(6.412)} 1000 ${py(6.404)}`} fill="none" stroke="#1d4750" strokeWidth="1.4" />
          {/* roads & bridges */}
          {ROADS.map((d, i) => <path key={`r${i}`} d={d} fill="none" stroke="#26352d" strokeWidth="3" strokeLinecap="round" />)}
          {BRIDGES.map((d, i) => <path key={`b${i}`} d={d} fill="none" stroke="#e89b2e" strokeOpacity=".3" strokeWidth="2.4" strokeDasharray="1 7" strokeLinecap="round" />)}
          {/* districts */}
          {DISTRICTS.map(d => (
            <text key={d.label} x={d.x} y={d.y} textAnchor="middle" fill="#3d4f45" fontSize="15" fontWeight="800" letterSpacing="4" fontFamily="Space Grotesk, sans-serif">{d.label}</text>
          ))}
          {/* facilities */}
          {facilities.map(f => (
            <g key={f.id} transform={`translate(${px(f.lng)} ${py(f.lat)})`}>
              <rect x="-5.5" y="-5.5" width="11" height="11" transform="rotate(45)" fill="#1e2b23" stroke="#5d6b62" strokeWidth="1.4" />
              <text y="24" textAnchor="middle" fill="#7d8b82" fontSize="12" fontWeight="700" fontFamily="JetBrains Mono, monospace">{f.code}</text>
            </g>
          ))}
          {/* live route: current position → selected meter */}
          {route && (() => {
            const tl = locates.find(l => l.meterNumber === route.target);
            if (!tl) return null;
            const o = { x: px(route.o.lng), y: py(route.o.lat) };
            const t = { x: px(tl.lng), y: py(tl.lat) };
            const dx = t.x - o.x, dy = t.y - o.y;
            const km = havKm(route.o, tl);
            const dLabel = fmtDist(km);
            const originDot = (
              <g transform={`translate(${o.x} ${o.y})`}>
                <circle r="26" fill="url(#posGlow)" />
                <circle r="16" fill="#2f6b8f" opacity=".35" className="pinger slow" />
                <circle r="6.5" fill="#5aa9cf" stroke="#eaf4fa" strokeWidth="2.4" />
                <text y="32" textAnchor="middle" fontSize="10.5" fontWeight="800" fill="#8fc3dd" fontFamily="JetBrains Mono, monospace" letterSpacing="1.5">YOU · ±{route.o.accuracy} m</text>
              </g>
            );
            if (Math.hypot(dx, dy) < 16) return (
              <g key={`r-${route.at}`}>
                {originDot}
                <g transform={`translate(${o.x} ${o.y - 34})`}>
                  <rect x="-56" y="-13" width="112" height="22" rx="5" fill="#e89b2e" />
                  <text textAnchor="middle" y="2.5" fontSize="10.5" fontWeight="800" fill="#1a231e" fontFamily="JetBrains Mono, monospace">AT METER · {dLabel}</text>
                </g>
              </g>
            );
            const sx = Math.sign(dx) || 1, sy = Math.sign(dy) || 1;
            const r = Math.max(16, Math.min(Math.abs(dx), Math.abs(dy), 60) * 0.85);
            const cx = t.x - sx * r, cy = o.y + sy * Math.min(Math.abs(dy), r);
            const d = `M ${o.x} ${o.y} L ${cx} ${o.y} Q ${t.x} ${o.y} ${t.x} ${cy} L ${t.x} ${t.y}`;
            return (
              <g key={`r-${route.target}-${route.at}`}>
                <path d={d} fill="none" stroke="#e89b2e" strokeOpacity=".14" strokeWidth="13" strokeLinecap="round" className="route-glow" />
                <path d={d} fill="none" stroke="#0a0f0c" strokeWidth="5.5" strokeLinecap="round" opacity=".8" />
                <path d={d} pathLength={1} fill="none" stroke="#e89b2e" strokeWidth="3" strokeLinecap="round" className="route-draw" />
                <path d={d} fill="none" stroke="#ffd489" strokeWidth="2" strokeDasharray="12 12" strokeLinecap="round" className="route-flow" />
                <g transform={`translate(${t.x} ${o.y})`} className="anim-fade">
                  <rect x="-42" y="-30" width="84" height="21" rx="5" fill="#101815" stroke="#e89b2e" strokeOpacity=".55" />
                  <text textAnchor="middle" y="-15.5" fontSize="10.5" fontWeight="800" fill="#ffd489" fontFamily="JetBrains Mono, monospace">{dLabel}</text>
                </g>
                {originDot}
              </g>
            );
          })()}

          {/* meter pins */}
          {locates.map(l => {
            const sel = selected === l.meterNumber;
            const hov = hover === l.meterNumber;
            const x = px(l.lng), y = py(l.lat);
            return (
              <g key={l.id} transform={`translate(${x} ${y})`} className="pin-drop cursor-pointer"
                onClick={e => { e.stopPropagation(); if (!drag?.moved) pick(l.meterNumber); }}
                onPointerEnter={() => setHover(l.meterNumber)} onPointerLeave={() => setHover(h => (h === l.meterNumber ? null : h))}>
                {sel && <circle r="34" fill="url(#pinGlow)" />}
                {sel && <circle r="22" fill="#e89b2e" opacity=".4" className="pinger" />}
                {sel && <circle r="22" fill="#e89b2e" opacity=".28" className="pinger slow" />}
                <ellipse cy="1.5" rx="6" ry="2.2" fill="#000" opacity=".4" />
                <path d="M0 0 C -2.2 -6 -12 -10.5 -12 -20 A 12 12 0 1 1 12 -20 C 12 -10.5 2.2 -6 0 0 Z"
                  fill={sel ? "#e89b2e" : hov ? "#8fa096" : "#42504a"} stroke="#0e1512" strokeWidth="1.6" className="transition-colors" />
                <circle cy="-20" r="4.6" fill={sel ? "#0e1512" : "#e89b2e"} />
                {(hov || sel) && (
                  <g transform="translate(0 -46)">
                    <rect x={-62} y={-14} width={124} height={22} rx={5} fill={sel ? "#e89b2e" : "#1e2b23"} stroke={sel ? "#b36f0f" : "#42504a"} />
                    <text textAnchor="middle" y={1.5} fontSize="11.5" fontWeight="700" fontFamily="JetBrains Mono, monospace" fill={sel ? "#1a231e" : "#c8d3ca"}>{l.meterNumber}</text>
                  </g>
                )}
              </g>
            );
          })}
        </g>

        {/* radar sweep while pulling from ZVend */}
        {sweep && (
          <g className="radar" opacity=".9">
            <path d={`M ${VW / 2} ${VH / 2} L ${VW / 2} ${VH / 2 - 300} A 300 300 0 0 1 ${VW / 2 + 130} ${VH / 2 - 270} Z`} fill="#e89b2e" opacity=".10" />
            <path d={`M ${VW / 2} ${VH / 2} L ${VW / 2} ${VH / 2 - 300}`} stroke="#e89b2e" strokeOpacity=".5" strokeWidth="2" />
          </g>
        )}
      </svg>

      {/* map chrome */}
      <div className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
        <span className="pointer-events-auto flex items-center gap-2 rounded-lg border border-[#22302a] bg-[#101815]/90 px-2.5 py-1.5 font-mono text-[9.5px] font-bold tracking-widest text-[#93a29a] backdrop-blur">
          {sweep ? <><Icon name="sync" size={11} className="spin text-volt" /> PULLING LOCATE TABLE…</> : <><span className="h-1.5 w-1.5 rounded-full bg-ok okdot" /> ZVEND LOCATE · LIVE</>}
        </span>
        <div className="pointer-events-auto flex flex-col overflow-hidden rounded-lg border border-[#22302a] bg-[#101815]/90 backdrop-blur">
          <button onClick={() => zoomBy(1.35)} title="Zoom in" className="p-2 text-[#93a29a] transition-colors hover:bg-side3 hover:text-paper"><Icon name="plus" size={13} /></button>
          <button onClick={() => zoomBy(0.72)} title="Zoom out" className="border-y border-[#22302a] p-2 text-[#93a29a] transition-colors hover:bg-side3 hover:text-paper"><span className="block h-[2px] w-[13px] bg-current rounded" /></button>
          <button onClick={reset} title="Reset view" className="p-2 text-[#93a29a] transition-colors hover:bg-side3 hover:text-paper"><Icon name="grid" size={12} /></button>
        </div>
      </div>
      <div className="pointer-events-none absolute left-3 top-12 flex flex-col items-start gap-1.5">
        <span className="flex items-center gap-1.5 rounded-md border border-[#22302a] bg-[#101815]/90 px-2 py-1 text-[9px] font-extrabold tracking-widest text-[#93a29a] backdrop-blur"><span className="h-2.5 w-2.5 rounded-full bg-[#42504a] ring-1 ring-[#0e1512]" /> METER PIN</span>
        <span className="flex items-center gap-1.5 rounded-md border border-[#22302a] bg-[#101815]/90 px-2 py-1 text-[9px] font-extrabold tracking-widest text-[#93a29a] backdrop-blur"><span className="h-2.5 w-2.5 rounded-full bg-volt ring-1 ring-[#0e1512]" /> SELECTED</span>
        <span className="flex items-center gap-1.5 rounded-md border border-[#22302a] bg-[#101815]/90 px-2 py-1 text-[9px] font-extrabold tracking-widest text-[#93a29a] backdrop-blur"><span className="h-2 w-2 rotate-45 bg-[#1e2b23] ring-1 ring-[#5d6b62]" /> FACILITY</span>
      </div>
      {locates.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="rounded-lg border border-[#22302a] bg-[#101815]/90 px-4 py-2.5 text-[12px] font-bold text-[#93a29a]">No located meters — pull the locate table from ZVend.</p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Update-locate wizard: scan → GPS → POST /v1/locate                  */
/* ------------------------------------------------------------------ */
function UpdateLocateModal({ meter, onClose }: { meter: Meter; onClose: () => void }) {
  const { state, user, online, updateLocate, toast } = useStore();
  const [phase, setPhase] = useState<"scan" | "gps" | "confirm" | "posting" | "done">("scan");
  const [scanOpen, setScanOpen] = useState(true);
  const [mismatch, setMismatch] = useState("");
  const [gps, setGps] = useState<GpsRec | null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [result, setResult] = useState<{ latencyMs: number; reference: string } | null>(null);
  const fac = state.facilities.find(f => f.id === meter.facilityId);
  const maxAcc = state.settings.maxGpsAccuracyM;

  const onDetect = (raw: string) => {
    const code = raw.replace(/\D/g, "");
    const matched = !!code && (code.includes(meter.number) || meter.number.includes(code));
    setScanOpen(false);
    if (matched) { setMismatch(""); setPhase("gps"); toast(`Barcode verified · ${meter.number}`, "ok"); }
    else setMismatch(code || raw);
  };
  const capture = () => {
    setGpsBusy(true);
    setTimeout(() => {
      const acc = Math.round(5 + Math.random() * 26);
      const ok = acc <= maxAcc;
      setGps({ lat: +((fac?.lat ?? 6.45) + (Math.random() - 0.5) * 0.0012).toFixed(6), lng: +((fac?.lng ?? 3.55) + (Math.random() - 0.5) * 0.0012).toFixed(6), accuracy: acc, at: Date.now(), accepted: ok });
      setGpsBusy(false);
    }, 1400);
  };
  const post = async () => {
    if (!online) { toast("You're offline — locate updates need the ZVend link.", "danger"); return; }
    setPhase("posting");
    const r = await updateLocate(meter.number, gps!);
    setResult(r);
    setPhase("done");
  };

  const StepDot = ({ n, done }: { n: number; done: boolean }) => (
    <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[9.5px] font-extrabold ${done ? "bg-ok text-white" : "bg-ink/10 text-mute"}`}>{done ? <Icon name="check" size={10} /> : n}</span>
  );

  return (
    <Modal open onClose={onClose} title={
      <span className="flex items-center gap-2"><Icon name="pin" size={16} className="text-volt2" /> Locate meter · <span className="font-mono">{meter.number}</span></span>
    }>
      <div className="mb-4 flex items-center gap-2">
        <StepDot n={1} done={phase !== "scan"} />
        <span className={`h-px flex-1 ${phase !== "scan" ? "bg-ok" : "bg-line"}`} />
        <StepDot n={2} done={["confirm", "posting", "done"].includes(phase)} />
        <span className={`h-px flex-1 ${["confirm", "posting", "done"].includes(phase) ? "bg-ok" : "bg-line"}`} />
        <StepDot n={3} done={phase === "done"} />
      </div>

      {phase === "scan" && (
        <div className="space-y-3">
          <p className="text-[12.5px] text-mute">Scan the meter's barcode with the camera. The read must match <span className="font-mono font-bold text-ink">{meter.number}</span> before GPS capture unlocks.</p>
          {mismatch && (
            <p className="anim-rise flex items-center gap-2 rounded-lg border border-[#eac5be] bg-dangersoft px-3 py-2.5 text-[11.5px] font-extrabold text-danger">
              <Icon name="alert" size={14} /> METER NUMBER MISMATCH · read “{mismatch}” ≠ {meter.number}.
            </p>
          )}
          {scanOpen ? (
            <BarcodeScanner title="Scan meter to locate" hint={`Expected: ${meter.number}`} onClose={() => setScanOpen(false)} onDetect={onDetect} />
          ) : (
            <Btn variant="primary" icon="camera" className="w-full" onClick={() => setScanOpen(true)}>{mismatch ? "Rescan barcode" : "Open camera"}</Btn>
          )}
        </div>
      )}

      {phase === "gps" && (
        <div className="space-y-3">
          <p className="text-[12.5px] text-mute">Capture the meter's position. Accuracy must be within ±{maxAcc} m or the locate is rejected.</p>
          {gps && gps.accepted ? (
            <div className="rounded-lg border border-[#c2ddcd] bg-oksoft/70 p-3 anim-rise">
              <p className="flex items-center gap-2 text-[12px] font-extrabold text-ok"><Icon name="check" size={13} /> GPS LOCKED · ±{gps.accuracy} m</p>
              <p className="mt-1 font-mono text-[11.5px] text-ink2">{gps.lat}, {gps.lng}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {gps && !gps.accepted && <p className="rounded-lg border border-[#eac5be] bg-dangersoft px-3 py-2 text-[11.5px] font-extrabold text-danger">±{gps.accuracy} m exceeds the ±{maxAcc} m ceiling — recapture.</p>}
              <Btn variant="primary" icon="pin" loading={gpsBusy} className="w-full" onClick={capture}>{gpsBusy ? "Acquiring satellites…" : "Capture GPS"}</Btn>
            </div>
          )}
          <div className="flex gap-2">
            <Btn variant="outline" icon="chevL" onClick={() => { setPhase("scan"); setMismatch(""); setScanOpen(true); }}>Back</Btn>
            <Btn variant="volt" icon="arrowR" className="flex-1" disabled={!gps?.accepted} onClick={() => setPhase("confirm")}>CONTINUE</Btn>
          </div>
        </div>
      )}

      {phase === "confirm" && (
        <div className="space-y-3">
          <p className="text-[12.5px] text-mute">This posts to the ZVend <span className="font-mono font-bold text-ink">locate</span> table:</p>
          <div className="rounded-lg border border-line bg-paper p-3">
            <p className="mb-1.5 flex items-center gap-2"><TonePill tone="amber">POST</TonePill><span className="font-mono text-[11px] font-bold">/v1/locate</span></p>
            <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed text-ink2">{JSON.stringify({
              meter_number: meter.number,
              facility: fac?.code ?? null,
              latitude: gps!.lat,
              longitude: gps!.lng,
              accuracy_m: gps!.accuracy,
              captured_by: user?.name ?? null,
            }, null, 2)}</pre>
          </div>
          <div className="flex gap-2">
            <Btn variant="outline" icon="chevL" onClick={() => setPhase("gps")}>Back</Btn>
            <Btn variant="ok" icon="plug" className="flex-1" onClick={() => void post()}>POST TO ZVEND</Btn>
          </div>
        </div>
      )}

      {phase === "posting" && (
        <div className="flex flex-col items-center gap-3 py-6">
          <Icon name="sync" size={26} className="spin text-volt2" />
          <p className="font-mono text-[11.5px] font-bold text-mute">POST /v1/locate · {meter.number} …</p>
        </div>
      )}

      {phase === "done" && result && (
        <div className="flex flex-col items-center gap-2.5 py-4 text-center anim-rise">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-oksoft text-ok"><Icon name="check" size={22} /></span>
          <p className="font-display text-[16px] font-bold">Locate table updated</p>
          <p className="font-mono text-[11px] text-mute">{result.reference} · {result.latencyMs} ms · {gps!.lat}, {gps!.lng}</p>
          <Btn variant="primary" className="mt-1" onClick={onClose}>Done</Btn>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Meter Map page                                                       */
/* ------------------------------------------------------------------ */
export function MeterMapPage() {
  const { state, user, can, online, syncLocates, pushAudit, toast } = useStore();
  const [q, setQ] = useState("");
  const [fac, setFac] = useState("ALL");
  const [selected, setSelected] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [updateFor, setUpdateFor] = useState<Meter | null>(null);
  const [route, setRoute] = useState<RouteState | null>(null);
  const [routing, setRouting] = useState(false);

  const located = useMemo(() => state.locates.filter(l => {
    const s = q.trim().toLowerCase();
    const meter = state.meters.find(m => m.number === l.meterNumber);
    const facName = state.facilities.find(f => f.id === l.facilityId)?.name.toLowerCase() ?? "";
    return (!s || l.meterNumber.includes(s) || facName.includes(s)) && (fac === "ALL" || l.facilityId === fac) && !!meter;
  }).sort((a, b) => b.updatedAt - a.updatedAt), [state.locates, state.meters, state.facilities, q, fac]);

  const notLocated = useMemo(() => state.meters.filter(m =>
    ["ACTIVE", "INSTALLED", "FAULTY"].includes(m.status) && !state.locates.some(l => l.meterNumber === m.number)
    && (fac === "ALL" || m.facilityId === fac)
  ), [state.meters, state.locates, fac]);

  const sel = state.locates.find(l => l.meterNumber === selected) ?? null;
  const selFac = sel ? state.facilities.find(f => f.id === sel.facilityId) : null;
  const canUpdate = can("map.update");

  const refresh = async () => {
    if (syncing) return;
    setSyncing(true);
    await syncLocates();
    setSyncing(false);
    toast(`Locate table synced · ${state.locates.length} records pulled from ZVend.`, "ok");
  };

  /* Selecting another located meter retargets the active route. */
  const choose = (n: string) => {
    setSelected(n);
    setRoute(r => (r && r.target !== n && state.locates.some(l => l.meterNumber === n)) ? { ...r, target: n, at: Date.now() } : r);
  };

  /* START — capture the current fix, then draw the route to the meter. */
  const startRoute = () => {
    if (routing) return;
    const destNo = sel && state.locates.some(l => l.meterNumber === sel.meterNumber) ? sel.meterNumber : route?.target;
    const dl = destNo ? state.locates.find(l => l.meterNumber === destNo) : null;
    if (!dl) { toast("Select a located meter pin first — the route needs a destination with GPS.", "warn"); return; }
    if (!online) { toast("Offline — the GPS fix needs the field link.", "danger"); return; }
    setRouting(true);
    setTimeout(() => {
      const acc = Math.round(6 + Math.random() * 24);
      const ang = Math.random() * Math.PI * 2;
      const span = 0.008 + Math.random() * 0.012;
      const lat = +Math.min(Math.max(dl.lat + Math.sin(ang) * span, B.minLat + 0.012), B.maxLat - 0.012).toFixed(6);
      const lng = +Math.min(Math.max(dl.lng + Math.cos(ang) * span * 0.9, B.minLng + 0.012), B.maxLng - 0.012).toFixed(6);
      const o = { lat, lng, accuracy: acc };
      setRoute({ o, target: dl.meterNumber, at: Date.now() });
      setSelected(dl.meterNumber);
      setRouting(false);
      const km = havKm(o, dl);
      toast(`GPS locked ±${acc} m — route drawn · ${fmtDist(km)} to ${dl.meterNumber}.`, "ok");
      pushAudit("route_started", `Field route to meter ${dl.meterNumber} — ${km.toFixed(2)} km from a ±${acc} m fix.`);
    }, 1300);
  };

  const detail = sel && (
    <div className="anim-rise flex h-full flex-col gap-2.5 rounded-xl border border-[#22302a] bg-[#101815]/95 p-3.5 text-paper backdrop-blur">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-[15px] font-bold text-volt">{sel.meterNumber}</p>
          <p className="text-[10.5px] font-bold text-[#93a29a]">{selFac?.name} · {selFac?.code}</p>
        </div>
        <TonePill tone={sel.source === "field" ? "teal" : "blue"}>{sel.source === "field" ? "FIELD CAPTURE" : "ZVEND SYNC"}</TonePill>
      </div>
      <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-[#22302a] bg-[#141f19] p-2.5 font-mono text-[10.5px]">
        <span className="text-[#5d6b62]">LAT</span><span className="text-right text-[#c8d3ca] tnum">{sel.lat.toFixed(6)}</span>
        <span className="text-[#5d6b62]">LNG</span><span className="text-right text-[#c8d3ca] tnum">{sel.lng.toFixed(6)}</span>
        <span className="text-[#5d6b62]">ACCURACY</span><span className="text-right text-[#c8d3ca] tnum">±{sel.accuracy} m</span>
      </div>
      <p className="text-[10px] font-semibold text-[#7d8b82]">Updated by <span className="text-[#c8d3ca]">{sel.updatedBy}</span> · {age(sel.updatedAt)} ago · {fmtDT(sel.updatedAt)}</p>
      {canUpdate ? (
        <Btn variant="volt" icon="camera" size="sm" className="w-full" onClick={() => setUpdateFor(state.meters.find(m => m.number === sel.meterNumber) ?? null)}>
          ADD / UPDATE GPS
        </Btn>
      ) : (
        <p className="flex items-center gap-1.5 text-[9.5px] font-bold tracking-wider text-[#5d6b62]"><Icon name="lock" size={11} /> GPS UPDATES — TECHNICAL MAN ONLY</p>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-[1340px]">
      <SectionHead
        title="Meter Map"
        sub={`${state.locates.length} located meters · pulled from the ZVend locate table · last sync ${age(state.locateSyncedAt)} ago`}
        right={<Btn variant="volt" icon="sync" loading={syncing} onClick={() => void refresh()}>{syncing ? "Pulling…" : "Refresh from ZVend"}</Btn>}
      />

      {/* status strip */}
      <Card className="anim-rise mb-4 grid grid-cols-2 divide-x divide-line md:grid-cols-4">
        <div className="p-3.5"><p className="font-display text-[20px] font-bold leading-none tnum">{located.length}</p><p className="mt-1 text-[9px] font-extrabold tracking-[0.16em] text-mute">LOCATED</p></div>
        <div className="p-3.5"><p className="font-display text-[20px] font-bold leading-none text-warn tnum">{notLocated.length}</p><p className="mt-1 text-[9px] font-extrabold tracking-[0.16em] text-mute">NOT LOCATED</p></div>
        <div className="p-3.5"><p className="flex items-center gap-1.5 font-display text-[13px] font-bold leading-[20px]"><span className={`h-2 w-2 rounded-full ${syncing ? "bg-volt livedot" : "bg-ok okdot"}`} />{syncing ? "SYNCING" : fmtDT(state.locateSyncedAt)}</p><p className="mt-1 text-[9px] font-extrabold tracking-[0.16em] text-mute">LAST SYNC</p></div>
        <div className="p-3.5"><p className="font-mono text-[12px] font-bold leading-[20px]">locate · {state.locates.filter(l => l.source === "field").length} field</p><p className="mt-1 text-[9px] font-extrabold tracking-[0.16em] text-mute">ZVEND TABLE</p></div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[380px_1fr]">
        {/* registry list */}
        <Card className="anim-rise flex max-h-[calc(100vh-190px)] min-h-[420px] flex-col lg:max-h-[760px]">
          <div className="space-y-2 border-b border-line p-3">
            <div className="relative">
              <Icon name="search" size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
              <TextInput value={q} onChange={e => setQ(e.target.value)} placeholder="Search meter or facility…" className="pl-8.5 text-[12px]" />
            </div>
            <Select value={fac} onChange={e => setFac(e.target.value)}>
              <option value="ALL">All facilities</option>
              {state.facilities.map(f => <option key={f.id} value={f.id}>{f.name} · {f.code}</option>)}
            </Select>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <p className="px-3.5 pb-1 pt-3 text-[9px] font-extrabold tracking-[0.18em] text-mute">LOCATED · {located.length}</p>
            {located.length === 0 && <p className="px-3.5 pb-3 text-[11.5px] text-mute">No located meters match.</p>}
            {located.map(l => {
              const f = state.facilities.find(x => x.id === l.facilityId);
              const active = selected === l.meterNumber;
              return (
                <button key={l.id} onClick={() => choose(l.meterNumber)}
                  className={`flex w-full items-center gap-2.5 border-l-2 px-3 py-2.5 text-left transition-colors ${active ? "border-volt bg-voltsoft/70" : "border-transparent hover:bg-paper"}`}>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${active ? "bg-volt livedot" : "bg-ink/25"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[11.5px] font-bold">{l.meterNumber}</span>
                      <TonePill tone={l.source === "field" ? "teal" : "gray"}>{l.source === "field" ? "FIELD" : "ZVEND"}</TonePill>
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] font-semibold text-mute">{f?.name} · <span className="font-mono tnum">{l.lat.toFixed(4)}, {l.lng.toFixed(4)}</span> · {age(l.updatedAt)} ago</span>
                  </span>
                  {canUpdate && <span onClick={e => { e.stopPropagation(); setUpdateFor(state.meters.find(m => m.number === l.meterNumber) ?? null); }} className="shrink-0 rounded-md border border-line p-1.5 text-mute transition-colors hover:border-volt hover:text-volt2" title="Add / update GPS"><Icon name="pin" size={12} /></span>}
                </button>
              );
            })}
            <p className="px-3.5 pb-1 pt-4 text-[9px] font-extrabold tracking-[0.18em] text-warn">NOT LOCATED · {notLocated.length}</p>
            {notLocated.length === 0 && <p className="px-3.5 pb-3 text-[11.5px] text-mute">Every deployed meter is located.</p>}
            {notLocated.map(m => {
              const f = state.facilities.find(x => x.id === m.facilityId);
              return (
                <div key={m.id} className="flex w-full items-center gap-2.5 border-l-2 border-transparent px-3 py-2.5">
                  <span className="h-2 w-2 shrink-0 rounded-full border border-warn bg-warnsoft" />
                  <span className="min-w-0 flex-1">
                    <span className="font-mono text-[11.5px] font-bold">{m.number}</span>
                    <span className="mt-0.5 block truncate text-[10px] font-semibold text-mute">{f?.name} · {m.status} · no GPS on record</span>
                  </span>
                  {canUpdate && <Btn size="sm" variant="outline" icon="plus" onClick={() => setUpdateFor(m)}>Add GPS</Btn>}
                </div>
              );
            })}
            {located.length + notLocated.length === 0 && (
              <div className="px-4 py-8 text-center"><Icon name="pin" size={22} className="mx-auto text-line2" /><p className="mt-2 text-[11.5px] text-mute">Nothing to show for this filter.</p></div>
            )}
          </div>
        </Card>

        {/* map */}
        <div className="anim-rise flex min-h-[520px] flex-col gap-3 lg:min-h-0">
          <div className="relative min-h-[420px] flex-1">
            <ServiceMap locates={located} facilities={state.facilities} selected={selected} onSelect={choose} sweep={syncing} route={route} />

            {/* START — capture current location & route to the meter */}
            <div className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex flex-col items-center gap-2">
              {route ? (() => {
                const tl = state.locates.find(l => l.meterNumber === route.target);
                if (!tl) return null;
                const km = havKm(route.o, tl);
                const drive = Math.max(1, Math.round((km / 30) * 60));
                const walk = Math.max(1, Math.round((km / 5) * 60));
                return (
                  <div className="pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-1.5 rounded-xl border border-[#22302a] bg-[#101815]/94 px-2.5 py-2 shadow-2xl backdrop-blur anim-rise">
                    <span className="flex items-center gap-1.5 rounded-lg bg-[#1e2b23] px-2.5 py-1.5 font-mono text-[10.5px] font-bold text-[#c8d3ca]"><Icon name="pin" size={11} className="text-volt" />{fmtDist(km)}</span>
                    <span className="flex items-center gap-1.5 rounded-lg bg-[#1e2b23] px-2.5 py-1.5 font-mono text-[10.5px] font-bold text-[#c8d3ca]"><Icon name="clock" size={11} className="text-[#8fc3dd]" />DRIVE ~{drive} MIN</span>
                    <span className="flex items-center gap-1.5 rounded-lg bg-[#1e2b23] px-2.5 py-1.5 font-mono text-[10.5px] font-bold text-[#c8d3ca]"><Icon name="history" size={11} className="text-[#9fd8b4]" />WALK ~{walk} MIN</span>
                    <span className="flex items-center gap-1.5 rounded-lg bg-[#1e2b23] px-2.5 py-1.5 font-mono text-[10.5px] font-bold text-[#c8d3ca]"><Icon name="wifi" size={11} className="text-[#8fc3dd]" />±{route.o.accuracy} m</span>
                    <span className="mx-0.5 hidden h-5 w-px bg-[#22302a] sm:block" />
                    <button onClick={startRoute} disabled={routing} className="flex items-center gap-1.5 rounded-lg bg-volt px-3.5 py-1.5 font-display text-[11px] font-bold tracking-[0.12em] text-ink transition-all hover:-translate-y-px hover:shadow-[0_6px_16px_rgba(232,155,46,.4)] disabled:opacity-80">
                      {routing ? <Icon name="sync" size={12} className="spin" /> : <Icon name="nav" size={12} />}START
                    </button>
                    <button onClick={() => setRoute(null)} className="flex items-center gap-1 rounded-lg border border-[#22302a] px-2.5 py-1.5 font-display text-[11px] font-bold tracking-[0.12em] text-[#93a29a] transition-colors hover:border-danger hover:text-danger"><Icon name="x" size={11} />CLEAR</button>
                  </div>
                );
              })() : (
                <>
                  {sel && (
                    <span className="rounded-md border border-[#22302a] bg-[#101815]/90 px-2.5 py-1 font-mono text-[10px] font-bold tracking-wider text-[#93a29a] backdrop-blur">
                      ROUTE TO <span className="text-volt">{sel.meterNumber}</span>
                    </span>
                  )}
                  <button onClick={startRoute} disabled={routing}
                    className="pointer-events-auto flex h-12 items-center gap-2.5 rounded-full bg-volt px-9 font-display text-[15px] font-bold tracking-[0.12em] text-ink shadow-[0_10px_28px_rgba(232,155,46,.35)] transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(232,155,46,.5)] active:translate-y-0 disabled:cursor-wait disabled:opacity-90">
                    {routing ? (<><Icon name="sync" size={16} className="spin" />ACQUIRING GPS…</>) : (<><Icon name="nav" size={16} />START</>)}
                  </button>
                </>
              )}
            </div>

            <div className="absolute right-3 top-12 hidden w-[264px] md:block">{detail}</div>
          </div>
          <div className="md:hidden">{detail}</div>
        </div>
      </div>

      {updateFor && <UpdateLocateModal meter={updateFor} onClose={() => { setUpdateFor(null); setSelected(updateFor.number); }} />}
      {user && !canUpdate && (
        <p className="mt-3 flex items-center gap-2 text-[11.5px] font-semibold text-mute"><Icon name="info" size={13} /> Your role can browse the map — only the Technical Man can capture and post GPS updates.</p>
      )}
    </div>
  );
}
