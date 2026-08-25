import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { AppState, OpType, Role } from "../lib/core";
import { actionableBy, age, OPS, OP_ORDER } from "../lib/core";
import { useStore } from "../lib/core";
import { Icon, useRoute } from "./ui";

export function taskCounts(state: AppState, role: Role, hasDelegation: boolean): Record<OpType, number> {
  const out = { installation: 0, activation: 0, inspection: 0, tamper: 0, clear: 0 } as Record<OpType, number>;
  state.operations.forEach(o => { if (actionableBy(o, hasDelegation) === role) out[o.type]++; });
  return out;
}

const NAV: { section: string; items: { label: string; to: string; icon: string; perm?: string; op?: OpType; roles?: Role[] }[] }[] = [
  { section: "", items: [{ label: "Dashboard", to: "", icon: "grid" }] },
  {
    section: "CORE OPERATIONS",
    items: [
      ...OP_ORDER.map(t => ({ label: OPS[t].label, to: OPS[t].path, icon: OPS[t].icon, perm: `${t}.view`, op: t })),
      { label: "Meter Map", to: "meter-map", icon: "pin", perm: "map.view" },
    ],
  },
  {
    section: "WORKFLOW",
    items: [
      { label: "Approvals", to: "approvals", icon: "approve", perm: "approvals.view" },
      { label: "Notifications", to: "notifications", icon: "bell", perm: "notifications.view" },
      { label: "History", to: "history", icon: "history", roles: ["TECHNICAL_MAN"] as Role[] },
    ],
  },
  {
    section: "DATA",
    items: [
      { label: "Facilities", to: "facilities", icon: "building", perm: "facilities.view" },
      { label: "Customers", to: "customers", icon: "users", perm: "customers.view" },
      { label: "Meters", to: "meters", icon: "gauge", perm: "meters.view" },
      { label: "Reports", to: "reports", icon: "chart", perm: "reports.view" },
      { label: "ZVend Integration", to: "zvend", icon: "plug", roles: ["IT_MANAGER", "SUPER_ADMIN"] as Role[] },
      { label: "API Reference", to: "api-docs", icon: "doc", roles: ["SUPER_ADMIN"] as Role[] },
    ],
  },
  {
    section: "ADMINISTRATION",
    items: [
      { label: "Users", to: "admin/users", icon: "user", perm: "admin.users" },
      { label: "Roles & Permissions", to: "admin/roles", icon: "shield", perm: "admin.roles" },
      { label: "API Configuration", to: "admin/api", icon: "plug", perm: "admin.api" },
      { label: "API Logs", to: "admin/api-logs", icon: "list", perm: "admin.apilogs" },
      { label: "Audit Logs", to: "admin/audit", icon: "history", perm: "admin.audit" },
      { label: "System Settings", to: "admin/settings", icon: "settings", perm: "admin.settings" },
      { label: "Database", to: "admin/database", icon: "db", perm: "admin.database" },
    ],
  },
];

function SidebarContent({ onNav, collapsed = false }: { onNav?: () => void; collapsed?: boolean }) {
  const { state, user, can, logout, delegation } = useStore();
  const { nav, path } = useRoute();
  if (!user) return null;
  const counts = taskCounts(state, user.role, delegation);
  const unread = state.notifications.filter(n => !n.read && (n.forRole === "ALL" || n.forRole === user.role)).length;
  return (
    <div className="flex h-full flex-col">
      <button onClick={() => { nav(""); onNav?.(); }} title="Dashboard"
        className={collapsed ? "flex items-center justify-center pb-5 pt-6" : "flex items-center gap-2.5 px-5 pb-5 pt-6 text-left"}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-volt text-ink"><Icon name="bolt" size={19} /></span>
        {!collapsed && (
          <span>
            <span className="block font-display text-[17px] font-bold leading-none tracking-tight text-paper">Z ADMIN</span>
            <span className="mt-1 block text-[8.5px] font-extrabold tracking-[0.22em] text-[#7d8b82]">ZAROX ENERGY · v2.0</span>
          </span>
        )}
      </button>
      <nav className={`flex-1 overflow-y-auto pb-4 ${collapsed ? "px-2" : "px-3"}`}>
        {NAV.map(sec => {
          const items = sec.items.filter(it => {
            if (it.roles) return it.roles.includes(user.role);
            if (it.perm) return can(it.perm);
            return true;
          });
          if (items.length === 0) return null;
          return (
            <div key={sec.section || "root"} className="mb-4">
              {sec.section && (collapsed
                ? <div className="mx-2.5 mb-2 border-t border-side3" />
                : <p className="mb-1.5 px-2.5 text-[9px] font-extrabold tracking-[0.22em] text-[#5d6b62]">{sec.section}</p>)}
              {items.map(it => {
                const active = path === it.to || (it.to !== "" && path.startsWith(it.to + "/")) || (it.to !== "" && path === it.to);
                const badge = it.op ? counts[it.op] : it.to === "notifications" ? unread : 0;
                return (
                  <button key={it.to} onClick={() => { nav(it.to); onNav?.(); }} title={collapsed ? `${it.label}${badge > 0 ? ` · ${badge} pending` : ""}` : undefined}
                    className={`group relative mb-0.5 flex w-full items-center rounded-lg text-left text-[12.5px] font-bold transition-all ${collapsed ? "justify-center px-0 py-2" : "gap-2.5 px-2.5 py-2"} ${
                      active ? "bg-side3 text-paper shadow-[inset_2px_0_0_#e89b2e]" : "text-[#a8b3ab] hover:bg-side2 hover:text-paper"}`}>
                    <Icon name={it.icon} size={15} className={`shrink-0 ${active ? "text-volt" : "text-[#7d8b82] group-hover:text-[#a8b3ab]"}`} />
                    {!collapsed && <span className="flex-1">{it.label}</span>}
                    {badge > 0 && (collapsed
                      ? <span className="absolute right-1 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-volt px-1 text-[8.5px] font-extrabold text-ink tnum">{badge}</span>
                      : <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-extrabold tnum ${active ? "bg-volt text-ink" : "bg-side3 text-volt"}`}>{badge}</span>)}
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>
      <div className={`border-t border-side3 ${collapsed ? "p-2" : "p-3"}`}>
        <div className={`flex items-center rounded-lg bg-side2 ${collapsed ? "flex-col gap-1.5 p-2" : "gap-2.5 p-2.5"}`}>
          <span title={`${user.name} · ${user.role.replace(/_/g, " ")}`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-volt/15 text-[10.5px] font-extrabold text-volt">{user.name.split(" ").map(w => w[0]).join("").slice(0, 2)}</span>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-bold text-paper">{user.name}</p>
              <p className="truncate text-[9.5px] font-bold tracking-wider text-[#7d8b82]">{user.role.replace(/_/g, " ")}</p>
            </div>
          )}
          <button onClick={logout} title="Sign out" className="rounded-md p-1.5 text-[#7d8b82] transition-colors hover:bg-side3 hover:text-paper"><Icon name="logout" size={15} /></button>
        </div>
      </div>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { state, user, online, syncing, markRead, toasts, dismissToast, delegation } = useStore();
  const { nav } = useRoute();
  const [drawer, setDrawer] = useState(false);
  const [bell, setBell] = useState(false);
  const [q, setQ] = useState("");
  const [mSearch, setMSearch] = useState(false);
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem("zadmin.nav.collapsed") === "1"; } catch { return false; } });
  const toggleNav = () => setCollapsed(v => { const next = !v; try { localStorage.setItem("zadmin.nav.collapsed", next ? "1" : "0"); } catch { /* storage unavailable */ } return next; });

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return null;
    return {
      ops: state.operations.filter(o => o.txn.toLowerCase().includes(s) || o.meterNumber.includes(s)).slice(0, 4),
      facs: state.facilities.filter(f => f.name.toLowerCase().includes(s) || f.code.toLowerCase().includes(s)).slice(0, 3),
      custs: state.customers.filter(c => c.name.toLowerCase().includes(s) || c.phone.replace(/\s/g, "").includes(s.replace(/\s/g, ""))).slice(0, 3),
      meters: state.meters.filter(m => m.number.includes(s)).slice(0, 3),
    };
  }, [q, state]);

  if (!user) return null;
  const unread = state.notifications.filter(n => !n.read && (n.forRole === "ALL" || n.forRole === user.role));

  const go = (fn: () => void) => { fn(); setQ(""); setMSearch(false); };
  const resultsPanel = results && (
    <div className="absolute left-0 right-0 top-11 z-40 overflow-hidden rounded-xl border border-line bg-card shadow-xl anim-rise">
      {results.ops.length + results.facs.length + results.custs.length + results.meters.length === 0 && <p className="px-4 py-3 text-[12px] text-mute">No matches.</p>}
      {results.ops.map(o => (
        <button key={o.id} onClick={() => go(() => nav(`${OPS[o.type].path}/${o.id}`))} className="flex w-full items-center gap-2.5 border-b border-line/60 px-4 py-2.5 text-left hover:bg-paper">
          <Icon name={OPS[o.type].icon} size={14} className="text-volt2" />
          <span className="font-mono text-[11.5px] font-bold">{o.txn}</span>
          <span className="ml-auto text-[10px] font-bold text-mute">{OPS[o.type].short} · {o.meterNumber}</span>
        </button>
      ))}
      {results.facs.map(f => (
        <button key={f.id} onClick={() => go(() => nav(`facilities/${f.id}`))} className="flex w-full items-center gap-2.5 border-b border-line/60 px-4 py-2.5 text-left hover:bg-paper">
          <Icon name="building" size={14} className="text-volt2" /><span className="text-[12px] font-bold">{f.name}</span><span className="ml-auto font-mono text-[10px] text-mute">{f.code}</span>
        </button>
      ))}
      {results.custs.map(c => (
        <button key={c.id} onClick={() => go(() => nav(`customers/${c.id}`))} className="flex w-full items-center gap-2.5 border-b border-line/60 px-4 py-2.5 text-left hover:bg-paper">
          <Icon name="users" size={14} className="text-volt2" /><span className="text-[12px] font-bold">{c.name}</span><span className="ml-auto font-mono text-[10px] text-mute">{c.phone}</span>
        </button>
      ))}
      {results.meters.map(m => (
        <button key={m.id} onClick={() => go(() => nav("meters"))} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-paper">
          <Icon name="gauge" size={14} className="text-volt2" /><span className="font-mono text-[11.5px] font-bold">{m.number}</span><span className="ml-auto text-[10px] font-extrabold text-mute">{m.status}</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex h-full">
      <aside className={`relative sticky top-0 hidden h-screen shrink-0 bg-side transition-[width] duration-300 ease-out lg:block ${collapsed ? "w-[72px]" : "w-[248px]"}`}>
        <SidebarContent collapsed={collapsed} />
        <button onClick={toggleNav} title={collapsed ? "Expand navigation" : "Collapse navigation"}
          className="absolute -right-3 top-[74px] z-20 flex h-6 w-6 items-center justify-center rounded-full border border-line bg-card text-ink2 shadow-md transition-all hover:scale-110 hover:border-volt hover:text-volt2">
          <Icon name={collapsed ? "chevR" : "chevL"} size={12} />
        </button>
      </aside>
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-ink/55 anim-fade" />
          <div className="absolute inset-y-0 left-0 w-[268px] bg-side shadow-2xl anim-rise" onClick={e => e.stopPropagation()}><SidebarContent onNav={() => setDrawer(false)} /></div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-4 lg:px-6">
            <button className="rounded-lg border border-line bg-card p-2 lg:hidden" onClick={() => setDrawer(true)}><Icon name="menu" size={16} /></button>
            <div className="relative hidden max-w-md flex-1 sm:block">
              <Icon name="search" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search facility, customer, meter, transaction…"
                className="w-full rounded-lg border border-line bg-card py-2 pl-9 pr-3 text-[12.5px] font-semibold outline-none transition-colors focus:border-volt focus:ring-2 focus:ring-volt/25" />
              {resultsPanel}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button className={`rounded-lg border p-2 transition-colors sm:hidden ${mSearch ? "border-volt bg-voltsoft text-volt2" : "border-line bg-card hover:border-ink/40"}`}
                onClick={() => setMSearch(v => !v)} title="Search"><Icon name="search" size={15} /></button>
              {delegation && user.role === "GENERAL_MANAGER" && <span className="hidden rounded-md bg-warnsoft px-2 py-1 text-[9.5px] font-extrabold tracking-wider text-warn md:block">MD DELEGATION ACTIVE</span>}
              <span className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[9.5px] font-extrabold tracking-wider ${online ? "bg-oksoft text-ok" : "bg-dangersoft text-danger"}`}>
                <Icon name={online ? "wifi" : "wifioff"} size={12} /><span className="hidden min-[400px]:inline">{syncing ? "SYNCING" : online ? "ONLINE" : "OFFLINE"}</span>
              </span>
              <div className="relative">
                <button onClick={() => setBell(v => !v)} className="relative rounded-lg border border-line bg-card p-2 transition-colors hover:border-ink/40">
                  <Icon name="bell" size={15} />
                  {unread.length > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-volt px-1 text-[9px] font-extrabold text-ink tnum">{unread.length}</span>}
                </button>
                {bell && (
                  <div className="absolute right-0 top-11 w-[min(320px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-card shadow-xl anim-rise">
                    <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                      <p className="font-display text-[13px] font-bold">Notifications</p>
                      <button onClick={() => setBell(false)} className="text-mute hover:text-ink"><Icon name="x" size={13} /></button>
                    </div>
                    <div className="max-h-72 overflow-y-auto">
                      {unread.length === 0 && <p className="px-4 py-5 text-center text-[11.5px] text-mute">All caught up.</p>}
                      {unread.slice(0, 6).map(n => (
                        <button key={n.id} onClick={() => { markRead(n.id); setBell(false); if (n.opId) { const op = state.operations.find(o => o.id === n.opId); if (op) nav(`${OPS[op.type].path}/${op.id}`); } }}
                          className="block w-full border-b border-line/60 px-4 py-2.5 text-left hover:bg-paper">
                          <p className="text-[11.5px] font-bold leading-snug">{n.text}</p>
                          <p className="mt-0.5 font-mono text-[9px] text-mute">{age(n.at)} ago</p>
                        </button>
                      ))}
                    </div>
                    {unread.length > 0 && <button onClick={() => { nav("notifications"); setBell(false); }} className="block w-full px-4 py-2 text-center text-[11px] font-extrabold text-volt2 hover:bg-paper">Open notification center</button>}
                  </div>
                )}
              </div>
            </div>
          </div>
          {mSearch && (
            <div className="border-t border-line px-4 pb-3 pt-2.5 sm:hidden anim-fade">
              <div className="relative">
                <Icon name="search" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
                <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search facility, customer, meter, transaction…"
                  className="w-full rounded-lg border border-line bg-card py-2 pl-9 pr-3 text-[13px] font-semibold outline-none transition-colors focus:border-volt focus:ring-2 focus:ring-volt/25" />
                {resultsPanel}
              </div>
            </div>
          )}
        </header>

        <main className="bg-dots min-w-0 flex-1 px-4 py-5 lg:px-6">{children}</main>

        <footer className="border-t border-line px-4 py-3 text-center text-[10px] font-bold tracking-wider text-mute">
          Z ADMIN 2.0 · ZAROX ENERGY SOLUTIONS · ZVEND-CONNECTED FIELD OPERATIONS
        </footer>
      </div>

      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(320px,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map(t => (
          <button key={t.id} onClick={() => dismissToast(t.id)}
            className={`anim-toast pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-left shadow-lg ${
              t.tone === "ok" ? "border-[#c2ddcd] bg-oksoft text-ok" : t.tone === "danger" ? "border-[#eac5be] bg-dangersoft text-danger" : t.tone === "warn" ? "border-[#ecd9b8] bg-warnsoft text-warn" : "border-[#c4d8e4] bg-infosoft text-info"}`}>
            <Icon name={t.tone === "ok" ? "check" : t.tone === "danger" ? "alert" : t.tone === "warn" ? "clock" : "info"} size={15} className="mt-px" />
            <span className="text-[12px] font-extrabold leading-snug">{t.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
