import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { OpType, Role } from "../lib/types";
import { actionableBy, OPS, OP_ORDER, ROLE_LABEL, age } from "../lib/types";
import { useStore } from "../lib/store";
import { Avatar, Icon, Spinner, ToastHost, useRoute } from "./ui";

interface NavItem { label: string; to: string; icon: string; badge?: number; }

export function taskCounts(state: ReturnType<typeof useStore>["state"], role: Role, delegation: boolean): Record<OpType, number> {
  const c: Record<OpType, number> = { installation: 0, activation: 0, inspection: 0, tamper: 0, clear: 0 };
  for (const op of state.operations) {
    const actor = actionableBy(op, delegation);
    if (actor === role) c[op.type]++;
    else if ((role === "SUPER_ADMIN" || role === "IT_MANAGER") && !["COMPLETED", "REJECTED", "CANCELLED"].includes(op.status)) c[op.type]++;
  }
  return c;
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { state, user, can, logout, delegation, syncing, online } = useStore();
  const { path, nav } = useRoute();
  if (!user) return null;
  const counts = taskCounts(state, user.role, !!delegation);
  const pendingQueue = state.operations.filter(o => o.pendingSync).length;

  const go = (to: string) => { nav(to); onNavigate?.(); };
  const active = (to: string) => path === to || path.startsWith(to + "/");

  const Item = ({ it }: { it: NavItem }) => (
    <button onClick={() => go(it.to)}
      className={`group relative flex w-full items-center gap-2.5 rounded-lg px-3 py-[7px] text-left text-[13px] font-bold transition-all duration-150 ${active(it.to) ? "bg-side3 text-paper" : "text-[#93a29a] hover:bg-side2 hover:text-paper"}`}>
      {active(it.to) && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-volt" />}
      <span className={active(it.to) ? "text-volt" : "text-[#71816f] group-hover:text-volt/80"}><Icon name={it.icon} size={16} /></span>
      <span className="flex-1 truncate">{it.label}</span>
      {it.badge !== undefined && it.badge > 0 && (
        <span className="rounded-md bg-volt px-1.5 py-px text-[10.5px] font-extrabold text-ink tnum">{it.badge}</span>
      )}
    </button>
  );

  const Section = ({ label, children }: { label: string; children: ReactNode }) => (
    <div className="mb-1">
      <div className="px-3 pb-1.5 pt-4 text-[10px] font-extrabold tracking-[0.16em] text-[#5d6b62]">{label}</div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      {/* brand */}
      <button onClick={() => go("")} className="flex items-center gap-2.5 px-4 py-4 text-left">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-volt text-ink shadow-[0_0_0_3px_rgba(232,155,46,0.15)]">
          <Icon name="logo" size={20} />
        </span>
        <span>
          <span className="block font-display text-[16px] font-bold leading-none tracking-tight text-paper">Z ADMIN</span>
          <span className="mt-1 block text-[9.5px] font-bold tracking-[0.14em] text-[#71816f]">ZAROX ENERGY · v2.0</span>
        </span>
      </button>

      <div className="mx-4 border-t border-side3" />

      <div className="flex-1 overflow-y-auto px-2.5 pb-3">
        <Section label="">
          <Item it={{ label: "Dashboard", to: "", icon: "dashboard" }} />
        </Section>

        <Section label="CORE OPERATIONS">
          {OP_ORDER.map(t => (
            <Item key={t} it={{ label: OPS[t].label, to: OPS[t].path, icon: OPS[t].icon, badge: counts[t] }} />
          ))}
        </Section>

        <Section label="WORKFLOW">
          {can("approvals.view") && <Item it={{ label: "Approvals", to: "approvals", icon: "approve" }} />}
          {can("notifications.view") && <Item it={{ label: "Notifications", to: "notifications", icon: "bell", badge: state.notifications.filter(n => !n.read && (n.forRole === "ALL" || n.forRole === user.role || n.forUser === user.id)).length }} />}
          {can("history.view") && user.role === "TECHNICAL_MAN" && <Item it={{ label: "History", to: "history", icon: "history" }} />}
        </Section>

        <Section label="DATA">
          {can("facilities.view") && <Item it={{ label: "Facilities", to: "facilities", icon: "building" }} />}
          {can("customers.view") && <Item it={{ label: "Customers", to: "customers", icon: "users" }} />}
          {can("meters.view") && <Item it={{ label: "Meters", to: "meters", icon: "gauge" }} />}
          {can("reports.view") && <Item it={{ label: "Reports", to: "reports", icon: "chart" }} />}
        </Section>

        {(can("admin.users") || can("admin.roles") || can("admin.api") || can("admin.apilogs") || can("admin.audit") || can("admin.settings")) && (
          <Section label="ADMINISTRATION">
            {can("admin.users") && <Item it={{ label: "Users", to: "admin/users", icon: "user" }} />}
            {can("admin.roles") && <Item it={{ label: "Roles & Permissions", to: "admin/roles", icon: "shield" }} />}
            {can("admin.api") && <Item it={{ label: "API Configuration", to: "admin/api", icon: "plug" }} />}
            {can("admin.apilogs") && <Item it={{ label: "API Logs", to: "admin/api-logs", icon: "list" }} />}
            {can("admin.audit") && <Item it={{ label: "Audit Logs", to: "admin/audit", icon: "history" }} />}
            {(can("admin.settings") || user.role === "SUPER_ADMIN") && <Item it={{ label: "System Settings", to: "admin/settings", icon: "settings" }} />}
          </Section>
        )}
      </div>

      {/* integration + profile */}
      <div className="border-t border-side3 px-4 py-3">
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-side2 px-3 py-2">
          <span className={`h-2 w-2 rounded-full ${online ? (syncing ? "bg-volt livedot" : "bg-[#3fae72] okdot") : "bg-danger"}`} />
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-extrabold text-[#93a29a]">
              {syncing ? "SYNCING FIELD DATA…" : online ? "ZVEND BRIDGE · CONNECTED" : "OFFLINE · QUEUE ACTIVE"}
            </p>
            <p className="truncate text-[9.5px] text-[#5d6b62]">
              {pendingQueue > 0 ? `${pendingQueue} record${pendingQueue > 1 ? "s" : ""} awaiting sync` : state.lastFacilitySync ? `last sync ${age(state.lastFacilitySync)} ago` : "no sync yet"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <Avatar name={user.name} size={34} tone="bg-volt text-ink" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-bold text-paper">{user.name}</p>
            <p className="truncate text-[10.5px] font-bold tracking-wide text-[#71816f]">{ROLE_LABEL[user.role].toUpperCase()}</p>
          </div>
          <button onClick={() => logout()} title="Logout"
            className="rounded-lg p-2 text-[#93a29a] transition-colors hover:bg-side3 hover:text-volt">
            <Icon name="logout" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function GlobalSearch() {
  const { state } = useStore();
  const { nav } = useRoute();
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return null;
    const ops = state.operations.filter(o => o.txn.toLowerCase().includes(s) || o.meterNumber.includes(s)).slice(0, 5);
    const meters = state.meters.filter(m => m.number.includes(s)).slice(0, 3);
    const customers = state.customers.filter(c => c.name.toLowerCase().includes(s)).slice(0, 3);
    const facilities = state.facilities.filter(f => f.name.toLowerCase().includes(s) || f.code.toLowerCase().includes(s)).slice(0, 3);
    return { ops, meters, customers, facilities };
  }, [q, state]);

  const hit = (to: string) => { nav(to); setQ(""); };

  return (
    <div className="relative hidden md:block w-[300px] lg:w-[380px]">
      <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        onFocus={() => { setFocus(true); if (blurTimer.current) clearTimeout(blurTimer.current); }}
        onBlur={() => { blurTimer.current = setTimeout(() => setFocus(false), 150); }}
        placeholder="Search txn, meter, customer, facility…"
        className="h-9 w-full rounded-lg border border-line2 bg-card pl-9 pr-3 text-[12.5px] placeholder:text-mute/70 focus:border-volt focus:outline-none focus:ring-2 focus:ring-volt/25"
      />
      {focus && results && (
        <div className="absolute left-0 right-0 top-11 z-40 overflow-hidden rounded-xl border border-line bg-card shadow-xl anim-rise">
          {results.ops.length + results.meters.length + results.customers.length + results.facilities.length === 0 && (
            <p className="px-4 py-3 text-[12px] text-mute">No matches for “{q}”.</p>
          )}
          {results.ops.length > 0 && <p className="bg-paper px-3 py-1.5 text-[10px] font-extrabold tracking-widest text-mute">OPERATIONS</p>}
          {results.ops.map(o => (
            <button key={o.id} onMouseDown={() => hit(`${OPS[o.type].path}/${o.id}`)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-paper">
              <Icon name={OPS[o.type].icon} size={14} className="text-volt2" />
              <span className="font-mono text-[11.5px] font-bold">{o.txn}</span>
              <span className="ml-auto text-[11px] text-mute">meter {o.meterNumber.slice(-5)}</span>
            </button>
          ))}
          {results.meters.length > 0 && <p className="bg-paper px-3 py-1.5 text-[10px] font-extrabold tracking-widest text-mute">METERS</p>}
          {results.meters.map(m => (
            <button key={m.number} onMouseDown={() => hit("meters")} className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-paper">
              <Icon name="gauge" size={14} className="text-info" />
              <span className="font-mono text-[11.5px] font-bold">{m.number}</span>
              <span className="ml-auto text-[11px] text-mute">{m.status}</span>
            </button>
          ))}
          {results.customers.length > 0 && <p className="bg-paper px-3 py-1.5 text-[10px] font-extrabold tracking-widest text-mute">CUSTOMERS</p>}
          {results.customers.map(c => (
            <button key={c.id} onMouseDown={() => hit(`customers/${c.id}`)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-paper">
              <Icon name="user" size={14} className="text-teal" />
              <span className="text-[12px] font-bold">{c.name}</span>
              <span className="ml-auto text-[11px] text-mute">{c.meters.length} meter{c.meters.length === 1 ? "" : "s"}</span>
            </button>
          ))}
          {results.facilities.length > 0 && <p className="bg-paper px-3 py-1.5 text-[10px] font-extrabold tracking-widest text-mute">FACILITIES</p>}
          {results.facilities.map(f => (
            <button key={f.id} onMouseDown={() => hit(`facilities/${f.id}`)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-paper">
              <Icon name="building" size={14} className="text-ink2" />
              <span className="text-[12px] font-bold">{f.name}</span>
              <span className="ml-auto font-mono text-[10.5px] text-mute">{f.code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Bell() {
  const { state, user, markRead } = useStore();
  const { nav } = useRoute();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  const mine = state.notifications.filter(n => n.forRole === "ALL" || n.forRole === user.role || n.forUser === user.id);
  const unread = mine.filter(n => !n.read).length;
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} className="relative rounded-lg border border-line2 bg-card p-2 text-ink2 transition-colors hover:border-volt hover:text-ink">
        <Icon name="bell" size={16} />
        {unread > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-danger px-1 text-[9.5px] font-extrabold text-white tnum">{unread}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-40 w-[320px] overflow-hidden rounded-xl border border-line bg-card shadow-xl anim-rise">
            <div className="flex items-center justify-between border-b border-line bg-paper px-3.5 py-2.5">
              <p className="font-display text-[12.5px] font-bold">Notifications</p>
              <button onClick={() => { nav("notifications"); setOpen(false); }} className="text-[11px] font-bold text-volt2 hover:underline">View all</button>
            </div>
            <div className="max-h-[320px] overflow-y-auto">
              {mine.slice(0, 7).map(n => (
                <button key={n.id} onClick={() => { markRead(n.id); if (n.opId) { nav(`${OPS[(state.operations.find(o => o.id === n.opId)?.type ?? "installation")]?.path ?? ""}/${n.opId}`); } setOpen(false); }}
                  className={`flex w-full items-start gap-2.5 border-b border-line/60 px-3.5 py-2.5 text-left transition-colors hover:bg-paper ${n.read ? "opacity-60" : ""}`}>
                  <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-line2" : n.kind === "zvend" ? "bg-info" : n.kind === "field" ? "bg-teal" : "bg-volt"}`} />
                  <span className="flex-1">
                    <span className="block text-[12px] font-semibold leading-snug">{n.text}</span>
                    <span className="mt-0.5 block text-[10.5px] text-mute">{age(n.at)} ago{n.txn ? ` · ${n.txn}` : ""}</span>
                  </span>
                </button>
              ))}
              {mine.length === 0 && <p className="px-4 py-5 text-center text-[12px] text-mute">No notifications.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { online, syncing, state } = useStore();
  const [drawer, setDrawer] = useState(false);
  const pendingQueue = state.operations.filter(o => o.pendingSync).length;
  return (
    <div className="flex h-full min-h-screen">
      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col bg-side bg-circuit lg:flex">
        <SidebarContent />
      </aside>
      {/* mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/60 anim-fade" onClick={() => setDrawer(false)} />
          <aside className="absolute left-0 top-0 h-full w-[268px] bg-side bg-circuit shadow-2xl anim-rise">
            <SidebarContent onNavigate={() => setDrawer(false)} />
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
          <div className="flex h-[54px] items-center gap-3 px-4 lg:px-6">
            <button onClick={() => setDrawer(true)} className="rounded-lg border border-line2 bg-card p-2 text-ink2 lg:hidden"><Icon name="list" size={16} /></button>
            <GlobalSearch />
            <div className="ml-auto flex items-center gap-2">
              {syncing ? (
                <span className="hidden sm:flex items-center gap-1.5 rounded-lg border border-[#f0d9ae] bg-voltsoft px-2.5 py-1.5 text-[11px] font-extrabold text-volt2">
                  <Spinner size={12} /> SYNCING
                </span>
              ) : !online ? (
                <span className="flex items-center gap-1.5 rounded-lg border border-[#eac5be] bg-dangersoft px-2.5 py-1.5 text-[11px] font-extrabold text-danger">
                  <Icon name="wifioff" size={13} /> OFFLINE{pendingQueue > 0 ? ` · ${pendingQueue} QUEUED` : ""}
                </span>
              ) : (
                <span className="hidden sm:flex items-center gap-1.5 rounded-lg border border-[#c2ddcd] bg-oksoft px-2.5 py-1.5 text-[11px] font-extrabold text-ok">
                  <Icon name="wifi" size={13} /> ONLINE
                </span>
              )}
              <Bell />
            </div>
          </div>
        </header>
        <main className="bg-dots min-w-0 flex-1 px-4 py-5 lg:px-6">{children}</main>
      </div>
      <ToastHost />
    </div>
  );
}
