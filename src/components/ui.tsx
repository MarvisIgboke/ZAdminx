import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { OpStatus } from "../lib/core";
import { STATUS_META } from "../lib/core";

/* ================= Hash router ================= */
export function useRoute() {
  const [hash, setHash] = useState(() => window.location.hash.replace(/^#\/?/, ""));
  useEffect(() => {
    const fn = () => setHash(window.location.hash.replace(/^#\/?/, ""));
    window.addEventListener("hashchange", fn);
    return () => window.removeEventListener("hashchange", fn);
  }, []);
  const parts = hash.split("/").filter(Boolean);
  return { path: hash, parts, nav: (to: string) => { window.location.hash = "/" + to; } };
}

/* ================= Icons ================= */
const paths: Record<string, ReactNode> = {
  bolt: <path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2z" />,
  grid: <><rect x="3" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" /><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" /></>,
  wrench: <path d="M14.7 6.3a4.5 4.5 0 0 0-6 5.6L3 17.6V21h3.4l5.7-5.7a4.5 4.5 0 0 0 5.6-6L14.5 12l-2.5-2.5 2.7-3.2z" />,
  power: <><path d="M12 2v9" /><path d="M18.4 6.6a9 9 0 1 1-12.8 0" /></>,
  clipboard: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 2.5h6V6H9z" /><path d="M9 11h6M9 15h4" /></>,
  shield: <path d="M12 2 4 5.5v5.7c0 5 3.4 8.6 8 10.3 4.6-1.7 8-5.3 8-10.3V5.5L12 2z" />,
  key: <><circle cx="8" cy="15" r="4.5" /><path d="m11.5 11.5 8-8M17 6l2.5 2.5M14 9l2 2" /></>,
  approve: <><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.7 2.7L16.5 9" /></>,
  bell: <><path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" /><path d="M10 20a2.2 2.2 0 0 0 4 0" /></>,
  building: <><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2M10 21v-3h4v3" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c.5-3.5 3-5.5 6-5.5s5.5 2 6 5.5" /><circle cx="17" cy="9" r="2.4" /><path d="M16.5 14.6c2.4.3 4 2 4.5 4.6" /></>,
  gauge: <><path d="M4 14a8 8 0 1 1 16 0" /><path d="M12 14 15.5 9" /><path d="M2.5 18h19" /></>,
  chart: <><path d="M3 3v18h18" /><path d="M7 15l4-5 3 3 5-7" /></>,
  user: <><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20.5c.8-4 3.9-6 7.5-6s6.7 2 7.5 6" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.8 13.5 5h2.6l.8 2.4 2.3 1.3-.5 2.6 1.6 2-1.6 2 .5 2.6-2.3 1.3-.8 2.4h-2.6L12 21.2 10.5 19H7.9l-.8-2.4-2.3-1.3.5-2.6-1.6-2 1.6-2-.5-2.6 2.3-1.3L7.9 5h2.6L12 2.8z" /></>,
  plug: <><path d="M9 2v6M15 2v6" /><path d="M6 8h12v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6V8z" /><path d="M12 17v5" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="18" r="1" fill="currentColor" /></>,
  history: <><path d="M3 12a9 9 0 1 0 2.6-6.3L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3.5 2" /></>,
  pin: <><path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z" /><circle cx="12" cy="10" r="2.6" /></>,
  nav: <path d="M12 2l7 19-7-4.2L5 21l7-19z" />,
  camera: <><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="14" r="3.6" /></>,
  video: <><rect x="2.5" y="6" width="13" height="12" rx="2" /><path d="m15.5 10.5 6-3.5v10l-6-3.5" /></>,
  scan: <><path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" /><path d="M7 12h10" /></>,
  wifi: <><path d="M2.5 9a15 15 0 0 1 19 0" /><path d="M5.5 12.5a10 10 0 0 1 13 0" /><path d="M8.5 16a5 5 0 0 1 7 0" /><circle cx="12" cy="19.4" r="1.1" fill="currentColor" /></>,
  wifioff: <><path d="m3 3 18 18" /><path d="M5.5 12.5a10 10 0 0 1 5.2-2.7M16.4 10.8a10 10 0 0 1 2.1 1.7" /><path d="M8.5 16a5 5 0 0 1 7 0" /><circle cx="12" cy="19.4" r="1.1" fill="currentColor" /></>,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  check: <path d="m4.5 12.5 5 5L19.5 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: <><circle cx="10.5" cy="10.5" r="7" /><path d="m16 16 5 5" /></>,
  chevR: <path d="m9 6 6 6-6 6" />,
  chevL: <path d="m15 6-6 6 6 6" />,
  chevD: <path d="m6 9 6 6 6-6" />,
  arrowR: <path d="M4 12h16m-6-6 6 6-6 6" />,
  alert: <><path d="M12 3 2.5 20h19L12 3z" /><path d="M12 10v4" /><circle cx="12" cy="17" r="0.6" fill="currentColor" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><circle cx="12" cy="8" r="0.7" fill="currentColor" /></>,
  copy: <><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>,
  download: <><path d="M12 3v12m-5-5 5 5 5-5" /><path d="M4 21h16" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
  doc: <><path d="M6 2h9l5 5v15H6V2z" /><path d="M14 2v6h6" /><path d="M9 13h6M9 17h6" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="10.5" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeoff: <><path d="m3 3 18 18" /><path d="M10.6 6a9.8 9.8 0 0 1 1.4-.1c6 0 9.5 6.1 9.5 6.1a17 17 0 0 1-2.7 3.4M6.6 6.9A16 16 0 0 0 2.5 12S6 18.1 12 18.1a9.6 9.6 0 0 0 4.3-1" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  db: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5" /><path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3" /></>,
  keyboard: <><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M9 14h6" /></>,
  sync: <><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" /><path d="M3 21v-5h5" /><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" /><path d="M21 3v5h-5" /></>,
  file: <><path d="M6 2h9l5 5v15H6V2z" /><path d="M14 2v6h6" /></>,
};
export function Icon({ name, size = 16, className }: { name: string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${className ?? ""}`}>
      {paths[name] ?? <circle cx="12" cy="12" r="8" />}
    </svg>
  );
}

/* ================= Primitives ================= */
export function Btn({ children, onClick, variant = "outline", size = "md", icon, disabled, loading, className = "", type = "button" }: {
  children?: ReactNode; onClick?: () => void; variant?: "primary" | "volt" | "outline" | "ghost" | "danger" | "ok";
  size?: "sm" | "md" | "lg"; icon?: string; disabled?: boolean; loading?: boolean; className?: string; type?: "button" | "submit";
}) {
  const v = {
    primary: "bg-ink text-paper hover:bg-side3 border border-ink",
    volt: "bg-volt text-ink hover:bg-[#f0ac49] border border-volt font-extrabold",
    outline: "bg-card text-ink border border-line2 hover:border-ink/50 hover:bg-paper",
    ghost: "bg-transparent text-ink2 hover:bg-ink/5 border border-transparent",
    danger: "bg-danger text-white hover:bg-[#9c2f24] border border-danger",
    ok: "bg-ok text-white hover:bg-[#17653f] border border-ok",
  }[variant];
  const s = { sm: "h-8 px-3 text-[12px] gap-1.5", md: "h-9.5 px-4 text-[13px] gap-2", lg: "h-12 px-5 text-[14px] gap-2" }[size];
  return (
    <button type={type} onClick={onClick} disabled={disabled || loading}
      className={`inline-flex items-center justify-center rounded-lg font-bold transition-all active:scale-[0.98] disabled:opacity-45 disabled:pointer-events-none ${v} ${s} ${className}`}>
      {loading ? <Icon name="sync" size={size === "lg" ? 16 : 14} className="spin" /> : icon ? <Icon name={icon} size={size === "lg" ? 16 : 14} /> : null}
      {children}
    </button>
  );
}

export function Card({ children, className = "", onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return <div onClick={onClick} className={`rounded-xl border border-line bg-card shadow-[0_1px_2px_rgba(26,35,30,0.05)] ${onClick ? "cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-[0_6px_18px_rgba(26,35,30,0.09)]" : ""} ${className}`}>{children}</div>;
}

export function SectionHead({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3 anim-rise">
      <div>
        <h1 className="font-display text-[22px] font-bold tracking-tight">{title}</h1>
        {sub && <p className="mt-0.5 text-[12.5px] text-mute">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

const tones: Record<string, string> = {
  gray: "bg-ink/6 text-ink2", amber: "bg-warnsoft text-warn", green: "bg-oksoft text-ok",
  red: "bg-dangersoft text-danger", blue: "bg-infosoft text-info", teal: "bg-tealsoft text-teal", ink: "bg-ink text-paper",
};
export function TonePill({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide ${tones[tone] ?? tones.gray}`}>{children}</span>;
}
export function StatusPill({ status, pulse }: { status: OpStatus; pulse?: boolean }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10.5px] font-extrabold tracking-wide ${tones[m.tone]}`}>
      {pulse && <span className={`h-1.5 w-1.5 rounded-full ${m.tone === "amber" ? "bg-warn livedot" : m.tone === "blue" || m.tone === "teal" ? "bg-info livedot" : "bg-current"}`} />}
      {m.label.toUpperCase()}
    </span>
  );
}

export function Field({ label, children, error, hint }: { label: string; children: ReactNode; error?: string; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10.5px] font-extrabold tracking-[0.12em] text-mute">{label.toUpperCase()}</span>
      {children}
      {error ? <span className="mt-1 flex items-center gap-1 text-[11px] font-bold text-danger anim-fade"><Icon name="alert" size={11} />{error}</span>
        : hint ? <span className="mt-1 block text-[10.5px] text-mute">{hint}</span> : null}
    </label>
  );
}
const inputCls = "w-full rounded-lg border border-line2 bg-card px-3 py-2 text-[13px] font-semibold outline-none transition-colors placeholder:font-medium placeholder:text-mute/60 focus:border-volt focus:ring-2 focus:ring-volt/25";
export function TextInput(p: React.InputHTMLAttributes<HTMLInputElement>) { return <input {...p} className={`${inputCls} ${p.className ?? ""}`} />; }
export function Textarea(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea rows={3} {...p} className={`${inputCls} resize-y ${p.className ?? ""}`} />; }
export function Select(p: React.SelectHTMLAttributes<HTMLSelectElement>) { return <select {...p} className={`${inputCls} ${p.className ?? ""}`} />; }

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-6 anim-fade" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className={`max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-line bg-card shadow-2xl sm:rounded-2xl anim-rise ${wide ? "sm:max-w-2xl" : "sm:max-w-md"}`}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-card px-5 py-3.5">
          <h2 className="font-display text-[15.5px] font-bold">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1.5 text-mute transition-colors hover:bg-ink/5 hover:text-ink"><Icon name="x" size={15} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Tabs({ tabs, active, onChange }: { tabs: { key: string; label: string; count?: number }[]; active: string; onChange: (k: string) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-lg border border-line bg-paper p-1">
      {tabs.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)}
          className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-bold transition-all ${active === t.key ? "bg-ink text-paper shadow-sm" : "text-ink2 hover:bg-ink/5"}`}>
          {t.label}
          {t.count !== undefined && t.count > 0 && <span className={`rounded-full px-1.5 text-[10.5px] font-extrabold tnum ${active === t.key ? "bg-volt text-ink" : "bg-ink/10 text-ink2"}`}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-end gap-2">
      <Btn size="sm" variant="ghost" icon="chevL" disabled={page <= 1} onClick={() => onPage(page - 1)} />
      <span className="text-[11.5px] font-extrabold text-mute tnum">{page} / {pages}</span>
      <Btn size="sm" variant="ghost" icon="chevR" disabled={page >= pages} onClick={() => onPage(page + 1)} />
    </div>
  );
}

export function EmptyState({ icon, title, sub, action }: { icon: string; title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center py-10 text-center">
      <span className="mb-3 flex h-13 w-13 items-center justify-center rounded-2xl bg-ink/5 p-3 text-mute"><Icon name={icon} size={26} /></span>
      <p className="font-display text-[15px] font-bold">{title}</p>
      {sub && <p className="mt-1 max-w-sm text-[12px] text-mute">{sub}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, tone = "" }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div>
      <p className={`font-display text-[24px] font-bold leading-none tnum ${tone}`}>{value}</p>
      <p className="mt-1 text-[9.5px] font-extrabold tracking-[0.14em] text-mute">{label.toUpperCase()}</p>
    </div>
  );
}

export function Bars({ data, height = 70 }: { data: { label: string; a: number; b?: number }[]; height?: number }) {
  const max = Math.max(1, ...data.map(d => Math.max(d.a, d.b ?? 0)));
  return (
    <div>
      <div className="flex items-end gap-1.5" style={{ height }}>
        {data.map((d, i) => (
          <div key={i} className="group relative flex flex-1 flex-col items-center justify-end gap-0.5">
            <div className="flex w-full items-end justify-center gap-[2px]" style={{ height }}>
              <div className="w-[38%] rounded-t bg-ink/75 transition-all group-hover:bg-ink anim-rise" style={{ height: `${(d.a / max) * 100}%`, minHeight: d.a ? 3 : 1, animationDelay: `${i * 30}ms` }} title={`${d.label}: ${d.a} opened`} />
              <div className="w-[38%] rounded-t bg-volt/80 transition-all group-hover:bg-volt anim-rise" style={{ height: `${((d.b ?? 0) / max) * 100}%`, minHeight: d.b ? 3 : 1, animationDelay: `${i * 30 + 40}ms` }} title={`${d.label}: ${d.b ?? 0} done`} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {data.map((d, i) => <span key={i} className="flex-1 text-center text-[8px] font-bold text-mute">{i % 2 === 0 ? d.label : ""}</span>)}
      </div>
    </div>
  );
}

export function copyText(t: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(t);
  const ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select();
  document.execCommand("copy"); ta.remove(); return Promise.resolve();
}
