import { useCallback, useEffect, useState } from "react";
import type { ReactNode, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ButtonHTMLAttributes } from "react";
import type { OpStatus, Tone } from "../lib/types";
import { STATUS_META } from "../lib/types";
import { useStore } from "../lib/store";

// ============================================================
// Hash router
// ============================================================
export function useRoute() {
  const [path, setPath] = useState(() => window.location.hash.replace(/^#\/?/, ""));
  useEffect(() => {
    const fn = () => setPath(window.location.hash.replace(/^#\/?/, ""));
    window.addEventListener("hashchange", fn);
    return () => window.removeEventListener("hashchange", fn);
  }, []);
  const nav = useCallback((to: string) => { window.location.hash = "/" + to.replace(/^\/+/, ""); }, []);
  return { path, parts: path.split("/").filter(Boolean), nav };
}

// ============================================================
// Icons — inline SVG, stroke-based
// ============================================================
const P: Record<string, ReactNode> = {
  logo: <><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" fill="currentColor" stroke="none" /></>,
  dashboard: <><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="5" rx="1.5" /><rect x="13" y="10" width="8" height="11" rx="1.5" /><rect x="3" y="13" width="8" height="8" rx="1.5" /></>,
  wrench: <path d="M14.7 6.3a4.5 4.5 0 0 0-6 5.6L3 17.6V21h3.4l5.7-5.7a4.5 4.5 0 0 0 5.6-6L14.5 12l-2.5-2.5 2.7-3.2z" />,
  power: <><path d="M12 2v9" /><path d="M18.4 6.6a9 9 0 1 1-12.8 0" /></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V2.5h6V4" /><path d="m8.5 13 2.5 2.5 4.5-5" /></>,
  shield: <><path d="M12 2 4.5 5v6c0 5 3.2 8.8 7.5 10.5 4.3-1.7 7.5-5.5 7.5-10.5V5L12 2z" /><path d="M12 8v4" /><circle cx="12" cy="15" r="0.6" fill="currentColor" /></>,
  key: <><circle cx="8" cy="15" r="4.5" /><path d="m11.5 11.5 8-8" /><path d="M17 6l2.5 2.5" /><path d="M14 9l2 2" /></>,
  approve: <><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path d="m8 12.5 2.8 2.8L16.5 9" /></>,
  building: <><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2M10 21v-3h4v3" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c.5-3.5 3-5.5 6-5.5s5.5 2 6 5.5" /><circle cx="17" cy="9" r="2.4" /><path d="M16.5 14.6c2.4.3 4 2 4.5 4.6" /></>,
  gauge: <><path d="M4 14a8 8 0 1 1 16 0" /><path d="M12 14l3.5-4" /><path d="M4 18h16" /></>,
  chart: <><path d="M3 3v18h18" /><path d="M7 15v3M12 10v8M17 6v12" /></>,
  bell: <><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" /><path d="M10 19a2.2 2.2 0 0 0 4 0" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.09a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.09a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" /></>,
  plug: <><path d="M9 2v6M15 2v6" /><path d="M6 8h12v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8z" /><path d="M12 17v5" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="18" r="1" fill="currentColor" /></>,
  history: <><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3.5 2" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  check: <path d="m4.5 12.5 5 5 10-11" />,
  chevD: <path d="m6 9 6 6 6-6" />,
  chevR: <path d="m9 6 6 6-6 6" />,
  chevL: <path d="m15 6-6 6 6 6" />,
  alert: <><path d="M12 3 2.5 20h19L12 3z" /><path d="M12 10v4" /><circle cx="12" cy="17" r="0.6" fill="currentColor" /></>,
  camera: <><path d="M4 7h3l2-2.5h6L17 7h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="3.5" /></>,
  video: <><rect x="2.5" y="6" width="13" height="12" rx="2" /><path d="m15.5 10.5 6-3.5v10l-6-3.5" /></>,
  pin: <><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  wifi: <><path d="M2.5 9a15 15 0 0 1 19 0" /><path d="M5.5 12.5a10.5 10.5 0 0 1 13 0" /><path d="M8.5 16a6 6 0 0 1 7 0" /><circle cx="12" cy="19" r="1" fill="currentColor" /></>,
  wifioff: <><path d="m3 3 18 18" /><path d="M5.5 12.5a10.5 10.5 0 0 1 4.6-2.3M14.6 10.4a10.5 10.5 0 0 1 3.9 2.1" /><path d="M8.5 16a6 6 0 0 1 7 0" /><circle cx="12" cy="19" r="1" fill="currentColor" /></>,
  sync: <><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" /><path d="M3 21v-5h5" /><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" /><path d="M21 3v5h-5" /></>,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>,
  eyeoff: <><path d="m3 3 18 18" /><path d="M10.6 5.1A9.8 9.8 0 0 1 12 5c6.5 0 10 7 10 7a17.4 17.4 0 0 1-2.9 3.8M6.6 6.6A16.7 16.7 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></>,
  download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M4 21h16" /></>,
  filter: <path d="M3 5h18l-7 8v6l-4 2v-8L3 5z" />,
  arrowR: <><path d="M4 12h15" /><path d="m13 6 6 6-6 6" /></>,
  bolt: <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />,
  scan: <><path d="M3 7V4a1 1 0 0 1 1-1h3M17 3h3a1 1 0 0 1 1 1v3M21 17v3a1 1 0 0 1-1 1h-3M7 21H4a1 1 0 0 1-1-1v-3" /><path d="M3 12h18" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4.5 21c.8-4 4-6 7.5-6s6.7 2 7.5 6" /></>,
  phone: <path d="M5 3h4l1.5 5-2.5 1.5a12 12 0 0 0 6.5 6.5L16 13.5l5 1.5v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><circle cx="12" cy="8" r="0.6" fill="currentColor" /></>,
  doc: <><path d="M6 2h9l5 5v15H6V2z" /><path d="M14 2v6h6" /><path d="M9 13h6M9 17h6" /></>,
  db: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" /><path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
};

export function Icon({ name, size = 18, className = "" }: { name: string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {P[name] ?? P.info}
    </svg>
  );
}

// ============================================================
// Primitives
// ============================================================
const toneCls: Record<Tone, string> = {
  amber: "bg-warnsoft text-warn border-[#eed9b4]",
  orange: "bg-voltsoft text-volt2 border-[#f0d9ae]",
  green: "bg-oksoft text-ok border-[#c2ddcd]",
  red: "bg-dangersoft text-danger border-[#eac5be]",
  blue: "bg-infosoft text-info border-[#c3d7e3]",
  teal: "bg-tealsoft text-teal border-[#bfdbde]",
  gray: "bg-paper text-mute border-line",
  ink: "bg-ink text-paper border-ink",
};

export function StatusPill({ status, pulse }: { status: OpStatus; pulse?: boolean }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-bold tracking-wide whitespace-nowrap ${toneCls[m.tone]}`}>
      <span className={`h-1.5 w-1.5 rounded-full bg-current ${pulse ? "livedot" : ""}`} />
      {m.label.toUpperCase()}
    </span>
  );
}

export function TonePill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-bold tracking-wide ${toneCls[tone]}`}>{children}</span>;
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "volt" | "ghost" | "danger" | "outline" | "ok";
  size?: "sm" | "md" | "lg";
  icon?: string;
  loading?: boolean;
};
export function Btn({ variant = "primary", size = "md", icon, loading, className = "", children, disabled, ...rest }: BtnProps) {
  const v = {
    primary: "bg-ink text-paper hover:bg-side3 border border-ink",
    volt: "bg-volt text-ink hover:bg-[#f2ac49] border border-[#c9831d] font-extrabold",
    ok: "bg-ok text-white hover:bg-[#166b43] border border-[#166b43]",
    danger: "bg-danger text-white hover:bg-[#9c2f25] border border-[#9c2f25]",
    ghost: "bg-transparent text-ink2 hover:bg-ink/5 border border-transparent",
    outline: "bg-card text-ink hover:bg-paper border border-line2",
  }[variant];
  const s = { sm: "h-8 px-2.5 text-[12px] gap-1.5", md: "h-9.5 px-3.5 text-[13px] gap-2", lg: "h-12 px-5 text-[15px] gap-2.5" }[size];
  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg font-bold transition-all duration-150 active:scale-[0.98] disabled:opacity-45 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-volt ${v} ${s} ${className}`}
      disabled={disabled || loading} {...rest}
    >
      {loading ? <span className="spin inline-block h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent" /> : icon ? <Icon name={icon} size={size === "sm" ? 14 : 16} /> : null}
      {children}
    </button>
  );
}

export function Card({ className = "", children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={`rounded-xl border border-line bg-card shadow-[0_1px_2px_rgba(26,35,30,0.05)] ${onClick ? "cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(26,35,30,0.1)]" : ""} ${className}`}>
      {children}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-ink/55 anim-fade" onClick={onClose} />
      <div className={`relative w-full ${wide ? "max-w-3xl" : "max-w-lg"} anim-rise max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-xl border border-line bg-card shadow-2xl`}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-card px-5 py-3.5">
          <h3 className="font-display text-[15px] font-bold">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1.5 text-mute hover:bg-paper hover:text-ink transition-colors"><Icon name="x" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, error, children, hint }: { label: string; error?: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-extrabold tracking-wider text-mute uppercase">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-[11px] text-mute">{hint}</span>}
      {error && <span className="mt-1 block text-[11px] font-bold text-danger">{error}</span>}
    </label>
  );
}

const inputCls = "w-full rounded-lg border border-line2 bg-card px-3 py-2 text-[13.5px] text-ink placeholder:text-mute/70 focus:border-volt focus:outline-none focus:ring-2 focus:ring-volt/25 transition-shadow";
export function TextInput(p: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={`${inputCls} ${p.className ?? ""}`} />;
}
export function Select(p: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={`${inputCls} appearance-none ${p.className ?? ""}`} />;
}
export function Textarea(p: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={`${inputCls} min-h-[84px] resize-y ${p.className ?? ""}`} />;
}

export function Tabs({ tabs, active, onChange }: { tabs: { key: string; label: string; count?: number }[]; active: string; onChange: (k: string) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-lg border border-line bg-paper p-1">
      {tabs.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)}
          className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-bold transition-all ${active === t.key ? "bg-ink text-paper shadow-sm" : "text-ink2 hover:bg-ink/5"}`}>
          {t.label}
          {t.count !== undefined && t.count > 0 && (
            <span className={`rounded-full px-1.5 text-[10.5px] font-extrabold ${active === t.key ? "bg-volt text-ink" : "bg-ink/10 text-ink2"}`}>{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon = "doc", title, sub, action }: { icon?: string; title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line2 bg-paper/60 px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-ink/5 text-mute"><Icon name={icon} size={22} /></span>
      <p className="font-display text-[15px] font-bold text-ink">{title}</p>
      {sub && <p className="max-w-sm text-[12.5px] text-mute">{sub}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Avatar({ name, size = 32, tone = "bg-ink text-paper" }: { name: string; size?: number; tone?: string }) {
  const init = name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold ${tone}`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {init}
    </span>
  );
}

export function KV({ k, v, mono }: { k: string; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line/70 py-2 last:border-0">
      <span className="text-[11px] font-extrabold uppercase tracking-wider text-mute pt-0.5">{k}</span>
      <span className={`text-right text-[13px] font-semibold text-ink ${mono ? "font-mono" : ""}`}>{v}</span>
    </div>
  );
}

export function Stat({ label, value, tone = "text-ink", sub }: { label: string; value: ReactNode; tone?: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className={`font-display text-[26px] leading-none font-bold tnum ${tone}`}>{value}</div>
      <div className="mt-1 text-[11px] font-extrabold uppercase tracking-wider text-mute">{label}</div>
      {sub && <div className="text-[11px] text-mute">{sub}</div>}
    </div>
  );
}

export function Bars({ data, height = 56 }: { data: { label: string; a: number; b?: number }[]; height?: number }) {
  const max = Math.max(1, ...data.map(d => d.a + (d.b ?? 0)));
  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="group relative flex flex-1 flex-col justify-end gap-0.5" style={{ height }}>
          <div className="anim-bar rounded-sm bg-ink/80 transition-colors group-hover:bg-volt" style={{ height: `${(d.a / max) * 100}%`, minHeight: d.a ? 3 : 0 }} />
          {d.b !== undefined && <div className="anim-bar rounded-sm bg-volt/70" style={{ height: `${(d.b / max) * 100}%`, minHeight: d.b ? 3 : 0 }} />}
          <span className="pointer-events-none absolute -top-6 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-ink px-1.5 py-0.5 text-[10px] font-bold text-paper opacity-0 transition-opacity group-hover:opacity-100">
            {d.label}: {d.a + (d.b ?? 0)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between pt-3">
      <span className="text-[11.5px] font-semibold text-mute">Page {page} of {pages}</span>
      <div className="flex gap-1">
        <Btn size="sm" variant="outline" icon="chevL" disabled={page <= 1} onClick={() => onPage(page - 1)}>Prev</Btn>
        <Btn size="sm" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next<Icon name="chevR" size={14} /></Btn>
      </div>
    </div>
  );
}

export function CodeBox({ code, onReveal, onCopy }: { code?: string; onReveal?: () => void; onCopy?: () => void }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!code) return <span className="font-mono text-[13px] text-mute">— not issued —</span>;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className={`rounded-lg border px-3 py-2 font-mono text-[13.5px] font-semibold tracking-[0.08em] ${shown ? "border-volt bg-voltsoft text-ink" : "border-line bg-paper text-mute"}`}>
        {shown ? code.replace(/(\d{4})(?=\d)/g, "$1 ") : "•••• •••• •••• •••• ••••"}
      </code>
      <Btn size="sm" variant="outline" icon={shown ? "eyeoff" : "eye"} onClick={() => {
        setShown(s => { if (!s && onReveal) onReveal(); return !s; });
      }}>{shown ? "Hide" : "Reveal"}</Btn>
      <Btn size="sm" variant="outline" icon="copy" onClick={async () => {
        try { await navigator.clipboard.writeText(code); } catch { /* clipboard unavailable */ }
        setCopied(true); setTimeout(() => setCopied(false), 1600);
        if (onCopy) onCopy();
      }}>{copied ? "Copied" : "Copy"}</Btn>
    </div>
  );
}

export function ToastHost() {
  const { toasts, dismissToast } = useStore();
  const toneMap = { ok: "border-ok/40 text-ok", warn: "border-warn/40 text-warn", danger: "border-danger/40 text-danger", info: "border-info/40 text-info" };
  const iconMap = { ok: "check", warn: "alert", danger: "alert", info: "info" };
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[80] flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4">
      {toasts.map(t => (
        <div key={t.id} className={`anim-toast pointer-events-auto flex items-center gap-2.5 rounded-lg border bg-ink px-3.5 py-2.5 shadow-xl`}>
          <span className={toneMap[t.tone]}><Icon name={iconMap[t.tone]} size={16} /></span>
          <p className="flex-1 text-[12.5px] font-semibold text-paper">{t.text}</p>
          <button onClick={() => dismissToast(t.id)} className="text-paper/50 hover:text-paper"><Icon name="x" size={14} /></button>
        </div>
      ))}
    </div>
  );
}

export function SectionHead({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-[22px] font-bold leading-tight tracking-tight">{title}</h1>
        {sub && <p className="mt-0.5 text-[12.5px] text-mute">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <span className="spin inline-block rounded-full border-2 border-ink/25 border-t-volt" style={{ width: size, height: size }} />;
}
