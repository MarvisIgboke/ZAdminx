import { Fragment, useMemo, useState } from "react";
import type { Role } from "../lib/types";
import { fmtDT, fmtDate, PERMS, ROLE_LABEL, activeDelegation } from "../lib/types";
import { useStore } from "../lib/store";
import { Btn, Card, EmptyState, Field, Icon, Modal, SectionHead, Select, Tabs, TextInput, Textarea, TonePill, useRoute } from "../components/ui";

const ROLE_ORDER: Role[] = ["SUPER_ADMIN", "SECRETARY", "TECHNICAL_MAN", "ENERGY_MANAGER", "GENERAL_MANAGER", "MD", "IT_MANAGER"];

export default function AdminPage({ tab }: { tab: string }) {
  const { user, can } = useStore();
  const { nav } = useRoute();
  const tabs = [
    can("admin.users") && { key: "users", label: "Users" },
    can("admin.roles") && { key: "roles", label: "Roles & Permissions" },
    can("admin.api") && { key: "api", label: "API Configuration" },
    can("admin.apilogs") && { key: "api-logs", label: "API Logs" },
    can("admin.audit") && { key: "audit", label: "Audit Logs" },
    (can("admin.settings") || user?.role === "SUPER_ADMIN") && { key: "settings", label: "System Settings" },
    (can("admin.delegation") || user?.role === "SUPER_ADMIN") && { key: "delegation", label: "MD Delegation" },
  ].filter(Boolean) as { key: string; label: string }[];

  if (tabs.length === 0) {
    return <div className="mx-auto max-w-xl"><Card className="p-6 text-center anim-rise">
      <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-warnsoft text-warn"><Icon name="lock" size={20} /></span>
      <h1 className="font-display text-[17px] font-bold">Administration is restricted</h1>
      <p className="mt-1 text-[12.5px] text-mute">Your role holds no administration permissions. Operational workflows are unaffected.</p>
      <Btn variant="outline" className="mt-4" onClick={() => nav("")}>Back to dashboard</Btn>
    </Card></div>;
  }

  const active = tabs.some(t => t.key === tab) ? tab : tabs[0].key;

  return (
    <div className="mx-auto max-w-[1240px]">
      <SectionHead title="Administration" sub="Users, RBAC matrix, ZVend configuration, logs and system rules — every change is audited." />
      <div className="mb-4"><Tabs active={active} onChange={k => nav(`admin/${k}`)} tabs={tabs} /></div>
      {active === "users" && <UsersTab />}
      {active === "roles" && <RolesTab />}
      {active === "api" && <ApiTab />}
      {active === "api-logs" && <ApiLogsTab />}
      {active === "audit" && <AuditTab />}
      {active === "settings" && <SettingsTab />}
      {active === "delegation" && <DelegationTab />}
    </div>
  );
}

// ---------------- Users ----------------
function UsersTab() {
  const { state, addUser, setUserActive } = useStore();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [role, setRole] = useState<Role>("TECHNICAL_MAN");
  const [err, setErr] = useState("");
  return (
    <div>
      <div className="mb-3 flex justify-end"><Btn variant="volt" icon="plus" onClick={() => setOpen(true)}>Add user</Btn></div>
      <Card className="anim-rise"><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left">
        <thead><tr className="border-b border-line bg-paper text-[10px] font-extrabold tracking-widest text-mute">
          <th className="px-4 py-2.5">USER</th><th className="px-4 py-2.5">ROLE</th><th className="px-4 py-2.5">STATUS</th><th className="px-4 py-2.5">LAST LOGIN</th><th className="px-4 py-2.5">ACTION</th>
        </tr></thead>
        <tbody>
          {state.users.map(u => (
            <tr key={u.id} className="border-b border-line/60 last:border-0">
              <td className="px-4 py-3"><p className="text-[13px] font-bold">{u.name}</p><p className="text-[11px] text-mute">{u.email}</p></td>
              <td className="px-4 py-3"><TonePill tone={u.role === "SUPER_ADMIN" ? "ink" : u.role === "MD" ? "amber" : "gray"}>{ROLE_LABEL[u.role].toUpperCase()}</TonePill></td>
              <td className="px-4 py-3"><TonePill tone={u.active ? "green" : "red"}>{u.active ? "ACTIVE" : "DEACTIVATED"}</TonePill></td>
              <td className="px-4 py-3 font-mono text-[11px] text-mute">{u.lastLogin ? fmtDT(u.lastLogin) : "never"}</td>
              <td className="px-4 py-3"><Btn size="sm" variant={u.active ? "outline" : "ok"} onClick={() => setUserActive(u.id, !u.active)}>{u.active ? "Deactivate" : "Activate"}</Btn></td>
            </tr>
          ))}
        </tbody>
      </table></div></Card>
      <Modal open={open} onClose={() => setOpen(false)} title="Create user account">
        <div className="space-y-3">
          <Field label="Full name"><TextInput value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Halima Sani" /></Field>
          <Field label="Email"><TextInput value={email} onChange={e => setEmail(e.target.value)} placeholder="name@zarox.energy" /></Field>
          <Field label="Role">
            <Select value={role} onChange={e => setRole(e.target.value as Role)}>
              {ROLE_ORDER.filter(r => r !== "SUPER_ADMIN").map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </Select>
          </Field>
          {err && <p className="text-[11.5px] font-bold text-danger">{err}</p>}
          <div className="flex justify-end gap-2"><Btn variant="ghost" onClick={() => setOpen(false)}>Cancel</Btn>
            <Btn variant="primary" onClick={() => {
              if (name.trim().length < 3) { setErr("Enter a full name."); return; }
              if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setErr("Enter a valid email."); return; }
              addUser({ name: name.trim(), email: email.trim(), role }); setOpen(false); setName(""); setEmail(""); setErr("");
            }}>Create account</Btn></div>
        </div>
      </Modal>
    </div>
  );
}

// ---------------- Roles matrix ----------------
function RolesTab() {
  const { state, togglePerm, user } = useStore();
  const editable = user?.role === "SUPER_ADMIN";
  const groups = useMemo(() => {
    const g: Record<string, string[]> = {};
    for (const p of PERMS) { const k = p.split(".")[0]; (g[k] = g[k] || []).push(p); }
    return g;
  }, []);
  return (
    <div>
      {!editable && <p className="mb-3 flex items-center gap-2 text-[12px] font-bold text-mute"><Icon name="lock" size={13} /> Read-only — only the Super Admin can modify the permission matrix. Changes are audited.</p>}
      <Card className="anim-rise overflow-x-auto">
        <table className="w-full min-w-[860px] text-left">
          <thead><tr className="border-b border-line bg-paper">
            <th className="sticky left-0 bg-paper px-4 py-2.5 text-[10px] font-extrabold tracking-widest text-mute">PERMISSION</th>
            {ROLE_ORDER.map(r => <th key={r} className="px-2 py-2.5 text-center text-[9px] font-extrabold tracking-wider text-mute">{ROLE_LABEL[r].split(" ").map(w => w[0]).join("")}<span className="block text-[8px] text-mute/70">{r.replace(/_/g, " ")}</span></th>)}
          </tr></thead>
          <tbody>
            {Object.entries(groups).map(([grp, perms]) => (
              <Fragment key={grp}>
                <tr className="border-b border-line bg-paper/70"><td colSpan={ROLE_ORDER.length + 1} className="px-4 py-1.5 text-[10px] font-extrabold tracking-[0.16em] text-volt2">{grp.toUpperCase()}</td></tr>
                {perms.map(p => (
                  <tr key={p} className="border-b border-line/60 last:border-0 hover:bg-paper/50">
                    <td className="sticky left-0 bg-card px-4 py-2 font-mono text-[11px] font-bold">{p}</td>
                    {ROLE_ORDER.map(r => {
                      const has = (state.permissionMatrix[r] || []).includes(p);
                      return (
                        <td key={r} className="px-2 py-2 text-center">
                          <button disabled={!editable} onClick={() => togglePerm(r, p)}
                            className={`mx-auto flex h-6 w-6 items-center justify-center rounded-md border transition-all ${has ? "border-ok bg-ok text-white" : "border-line2 bg-card text-transparent"} ${editable ? "hover:scale-110 cursor-pointer" : "cursor-default"}`}>
                            <Icon name="check" size={12} />
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ---------------- API config ----------------
function ApiTab() {
  const { state, saveZvendConfig, user } = useStore();
  const z = state.settings.zvend;
  const [baseUrl, setBaseUrl] = useState(z.baseUrl);
  const [token, setToken] = useState("");
  const [timeout, setTimeout_] = useState(String(z.timeoutSec));
  const [retry, setRetry] = useState(String(z.retryCount));
  const [showToken, setShowToken] = useState(false);
  const [err, setErr] = useState("");
  const editable = user && ["SUPER_ADMIN", "IT_MANAGER"].includes(user.role);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <Card className="p-5 anim-rise">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-volt"><Icon name="plug" size={16} /></span>
          <div><h2 className="font-display text-[16px] font-bold">ZVend API client</h2><p className="text-[11.5px] text-mute">Single service layer — all ZVend traffic flows through ZVendApiService with idempotency keys.</p></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Base URL"><TextInput value={baseUrl} onChange={e => setBaseUrl(e.target.value)} readOnly={!editable} className="font-mono" /></Field>
          <Field label="API token (stored encrypted)" hint="Never written to logs.">
            <div className="relative">
              <TextInput type={showToken ? "text" : "password"} value={showToken ? (token || "zvd_live_9f3kd82mzqx1") : "••••••••••••••••"} onChange={e => setToken(e.target.value)} readOnly={!editable} className="pr-9 font-mono" />
              <button onClick={() => setShowToken(s => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-mute hover:text-ink"><Icon name={showToken ? "eyeoff" : "eye"} size={15} /></button>
            </div>
          </Field>
          <Field label="Timeout (seconds)"><TextInput type="number" min={5} max={120} value={timeout} onChange={e => setTimeout_(e.target.value)} readOnly={!editable} /></Field>
          <Field label="Retry count"><TextInput type="number" min={0} max={5} value={retry} onChange={e => setRetry(e.target.value)} readOnly={!editable} /></Field>
        </div>
        {err && <p className="mt-2 text-[11.5px] font-bold text-danger">{err}</p>}
        {editable && <Btn variant="primary" icon="check" className="mt-4" onClick={() => {
          if (!/^https?:\/\/.+\..+/.test(baseUrl)) { setErr("Base URL must be a valid https URL."); return; }
          const t = Number(timeout), r = Number(retry);
          if (!(t >= 5 && t <= 120)) { setErr("Timeout must be 5–120 seconds."); return; }
          if (!(r >= 0 && r <= 5)) { setErr("Retry count must be 0–5."); return; }
          saveZvendConfig({ baseUrl, timeoutSec: t, retryCount: r, ...(token ? { token: token.slice(0, 10) + "••••••••" } : {}) });
          setErr("");
        }}>Save configuration</Btn>}
      </Card>
      <Card className="p-4 anim-rise">
        <h3 className="mb-2 font-display text-[14px] font-bold">Registered endpoints</h3>
        <div className="space-y-1.5">
          {Object.entries(z.endpoints).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 rounded-md bg-paper px-2.5 py-1.5">
              <span className="w-20 text-[10px] font-extrabold tracking-wider text-volt2">{k.toUpperCase()}</span>
              <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink2">{v}</code>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[10.5px] text-mute">Methods available: getFacilities, getCustomersByFacility, getMetersByFacility, installMeter, activateMeter, generateTamperCode, generateClearCode, vendToken, getVendingHistory, getFundingHistory.</p>
      </Card>
    </div>
  );
}

// ---------------- API logs ----------------
function ApiLogsTab() {
  const { state } = useStore();
  const [status, setStatus] = useState("ALL");
  const rows = state.apiLogs.filter(l => status === "ALL" || l.status === status);
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Select value={status} onChange={e => setStatus(e.target.value)} className="max-w-[200px]">
          <option value="ALL">All statuses</option><option value="success">Success</option><option value="failed">Failed</option><option value="pending">Pending</option>
        </Select>
        <p className="text-[11.5px] font-bold text-mute">Secrets are never logged — tokens appear masked only.</p>
      </div>
      <Card className="anim-rise"><div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left">
        <thead><tr className="border-b border-line bg-paper text-[10px] font-extrabold tracking-widest text-mute">
          <th className="px-4 py-2.5">TIMESTAMP</th><th className="px-4 py-2.5">USER</th><th className="px-4 py-2.5">OPERATION</th><th className="px-4 py-2.5">METHOD</th><th className="px-4 py-2.5">ENDPOINT</th><th className="px-4 py-2.5">TXN</th><th className="px-4 py-2.5">CODE</th><th className="px-4 py-2.5">DURATION</th><th className="px-4 py-2.5">STATUS</th>
        </tr></thead>
        <tbody>
          {rows.map(l => (
            <tr key={l.id} className="border-b border-line/60 last:border-0">
              <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[10.5px] text-mute">{fmtDT(l.at)}</td>
              <td className="px-4 py-2.5 text-[12px] font-bold">{l.userName}</td>
              <td className="px-4 py-2.5 font-mono text-[11px] text-ink2">{l.operation.split("/").pop()}</td>
              <td className="px-4 py-2.5"><TonePill tone={l.method === "GET" ? "blue" : "amber"}>{l.method}</TonePill></td>
              <td className="px-4 py-2.5 font-mono text-[11px] text-ink2">{l.endpoint}</td>
              <td className="px-4 py-2.5 font-mono text-[10px] text-mute">{l.txn ?? "—"}</td>
              <td className="px-4 py-2.5 font-mono text-[11.5px] font-bold">{l.responseCode}</td>
              <td className="px-4 py-2.5 font-mono text-[11px] text-mute">{l.durationMs > 0 ? `${l.durationMs} ms` : "…"}</td>
              <td className="px-4 py-2.5"><TonePill tone={l.status === "success" ? "green" : l.status === "failed" ? "red" : "blue"}>{l.status.toUpperCase()}</TonePill></td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={9} className="px-4 py-6 text-center text-[12px] text-mute">No API calls logged.</td></tr>}
        </tbody>
      </table></div></Card>
    </div>
  );
}

// ---------------- Audit ----------------
function AuditTab() {
  const { state } = useStore();
  const [q, setQ] = useState("");
  const rows = state.audit.filter(a => !q.trim() || a.detail.toLowerCase().includes(q.toLowerCase()) || a.action.includes(q.toLowerCase()) || a.userName.toLowerCase().includes(q.toLowerCase()) || (a.txn ?? "").toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Icon name="search" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
          <TextInput value={q} onChange={e => setQ(e.target.value)} placeholder="Search action, actor, detail, txn…" className="pl-8.5" />
        </div>
        <p className="flex items-center gap-1.5 text-[11.5px] font-bold text-mute"><Icon name="lock" size={13} /> Append-only — audit records can never be edited or deleted.</p>
      </div>
      <Card className="anim-rise"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left">
        <thead><tr className="border-b border-line bg-paper text-[10px] font-extrabold tracking-widest text-mute">
          <th className="px-4 py-2.5">TIME</th><th className="px-4 py-2.5">ACTOR</th><th className="px-4 py-2.5">ACTION</th><th className="px-4 py-2.5">DETAIL</th><th className="px-4 py-2.5">TXN</th>
        </tr></thead>
        <tbody>
          {rows.slice(0, 60).map(a => (
            <tr key={a.id} className="border-b border-line/60 last:border-0">
              <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[10.5px] text-mute">{fmtDT(a.at)}</td>
              <td className="px-4 py-2.5"><p className="text-[12px] font-bold">{a.userName}</p><p className="text-[9px] font-bold tracking-wider text-mute">{a.role === "SYSTEM" ? "SYSTEM" : ROLE_LABEL[a.role].toUpperCase()}</p></td>
              <td className="px-4 py-2.5"><TonePill tone={a.action.includes("reject") || a.action.includes("suspicious") ? "red" : a.action.includes("approve") || a.action.includes("complete") ? "green" : a.action.includes("api") || a.action.includes("sync") ? "blue" : a.action.includes("reveal") || a.action.includes("copy") || a.action.includes("delegation") || a.action.includes("permission") ? "orange" : "gray"}>{a.action.replace(/_/g, " ").toUpperCase()}</TonePill></td>
              <td className="px-4 py-2.5 text-[12px] text-ink2">{a.detail}</td>
              <td className="px-4 py-2.5 font-mono text-[10px] text-mute">{a.txn ?? "—"}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-[12px] text-mute">No audit events match.</td></tr>}
        </tbody>
      </table></div>
      {rows.length > 60 && <p className="px-4 py-2.5 text-[11px] font-bold text-mute">Showing latest 60 of {rows.length} events.</p>}
      </Card>
    </div>
  );
}

// ---------------- Settings ----------------
function SettingsTab() {
  const { state, saveSettings, user, resetDemo } = useStore();
  const s = state.settings;
  const isSuper = user?.role === "SUPER_ADMIN";
  const [maxGps, setMaxGps] = useState(String(s.maxGpsAccuracyM));
  const [dist, setDist] = useState(String(s.allowedDistanceM));
  const [newDur, setNewDur] = useState("");
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-5 anim-rise">
        <h2 className="font-display text-[16px] font-bold">Inspection video durations</h2>
        <p className="mt-0.5 text-[11.5px] text-mute">Available countdown lengths for GM-scheduled inspections. Stored per inspection — never hard-coded.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {s.inspectionDurations.map(d => (
            <span key={d} className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] font-extrabold ${d === s.defaultDurationSec ? "border-volt bg-voltsoft text-volt2" : "border-line bg-card"}`}>
              {d / 60} min
              {isSuper && s.inspectionDurations.length > 1 && (
                <button onClick={() => saveSettings({ inspectionDurations: s.inspectionDurations.filter(x => x !== d), defaultDurationSec: s.defaultDurationSec === d ? s.inspectionDurations.filter(x => x !== d)[0] : s.defaultDurationSec })}
                  className="text-mute hover:text-danger"><Icon name="x" size={13} /></button>
              )}
            </span>
          ))}
        </div>
        {isSuper && (
          <div className="mt-3 flex gap-2">
            <TextInput value={newDur} onChange={e => setNewDur(e.target.value.replace(/\D/g, ""))} placeholder="minutes, e.g. 4" className="max-w-[140px]" />
            <Btn variant="outline" icon="plus" onClick={() => {
              const m = Number(newDur);
              if (m < 1 || m > 30 || s.inspectionDurations.includes(m * 60)) return;
              saveSettings({ inspectionDurations: [...s.inspectionDurations, m * 60].sort((a, b) => a - b) }); setNewDur("");
            }}>Add duration</Btn>
          </div>
        )}
        <div className="mt-4">
          <Field label="Default duration">
            <Select value={s.defaultDurationSec} onChange={e => isSuper && saveSettings({ defaultDurationSec: Number(e.target.value) })} disabled={!isSuper}>
              {s.inspectionDurations.map(d => <option key={d} value={d}>{d / 60} minute{d >= 120 ? "s" : ""}</option>)}
            </Select>
          </Field>
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="p-5 anim-rise">
          <h2 className="font-display text-[16px] font-bold">GPS rules</h2>
          <p className="mt-0.5 text-[11.5px] text-mute">Field captures beyond the accuracy limit are blocked and recorded as suspicious GPS events.</p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Max accuracy (m)" hint={isSuper ? "Super Admin controlled" : "Read-only for your role"}>
              <TextInput type="number" value={maxGps} onChange={e => setMaxGps(e.target.value)} readOnly={!isSuper} />
            </Field>
            <Field label="Allowed distance (m)">
              <TextInput type="number" value={dist} onChange={e => setDist(e.target.value)} readOnly={!isSuper} />
            </Field>
          </div>
          {isSuper && <Btn variant="primary" icon="check" className="mt-3" onClick={() => {
            const g = Number(maxGps), d = Number(dist);
            if (g < 3 || g > 500 || d < 10 || d > 5000) return;
            saveSettings({ maxGpsAccuracyM: g, allowedDistanceM: d });
          }}>Save GPS rules</Btn>}
        </Card>

        {isSuper && (
          <Card className="p-5 anim-rise">
            <h2 className="font-display text-[16px] font-bold text-danger">Emergency administration</h2>
            <p className="mt-0.5 text-[11.5px] text-mute">Reset the workspace to seeded demo data. Operational history in this browser is replaced; the action itself is audited in the fresh ledger.</p>
            <Btn variant="danger" icon="sync" className="mt-3" onClick={resetDemo}>Reset demo data</Btn>
          </Card>
        )}
      </div>
    </div>
  );
}

// ---------------- Delegation ----------------
function DelegationTab() {
  const { state, user, createDelegation, revokeDelegation } = useStore();
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [end, setEnd] = useState(new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const isMD = user?.role === "MD";
  const current = activeDelegation(state.delegations);
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
      <Card className="anim-rise">
        <div className="border-b border-line px-4 py-3"><h2 className="font-display text-[15.5px] font-bold">Delegation ledger</h2></div>
        {state.delegations.length === 0 ? <div className="p-5"><EmptyState icon="users" title="No delegations" sub="The MD may delegate final approval authority to the GM only." /></div> : (
          <div className="divide-y divide-line/70">
            {state.delegations.map(d => {
              const expired = d.end < Date.now();
              const effStatus = d.status === "ACTIVE" && expired ? "EXPIRED" : d.status;
              return (
                <div key={d.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13px] font-bold">{d.mdName} → {d.gmName}</p>
                    <TonePill tone={effStatus === "ACTIVE" ? "green" : effStatus === "EXPIRED" ? "gray" : "red"}>{effStatus}</TonePill>
                    {effStatus === "ACTIVE" && isMD && <Btn size="sm" variant="outline" onClick={() => revokeDelegation(d.id)}>Revoke</Btn>}
                    <span className="ml-auto font-mono text-[10.5px] text-mute">{fmtDate(d.start)} → {fmtDate(d.end)}</span>
                  </div>
                  <p className="mt-1 text-[12px] text-ink2">{d.reason}</p>
                  <p className="mt-0.5 text-[10.5px] font-bold text-mute">Every decision under this window is marked “Approved under MD delegation” and audited.</p>
                </div>
              );
            })}
          </div>
        )}
      </Card>
      <Card className="p-5 anim-rise">
        <h2 className="font-display text-[16px] font-bold">{isMD ? "Delegate approval authority" : "Create delegation"}</h2>
        <p className="mt-0.5 text-[11.5px] text-mute">Authority may be delegated ONLY to the General Manager, with a fixed window and reason. It expires automatically.</p>
        {!isMD ? (
          <p className="mt-4 flex items-center gap-2 rounded-lg bg-paper px-3 py-2.5 text-[12px] font-bold text-mute"><Icon name="lock" size={14} /> Only the MD can create delegations.</p>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start date"><TextInput type="date" value={start} onChange={e => setStart(e.target.value)} /></Field>
              <Field label="End date"><TextInput type="date" value={end} onChange={e => setEnd(e.target.value)} /></Field>
            </div>
            <Field label="Reason"><Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. MD on regional roadshow…" /></Field>
            {err && <p className="text-[11.5px] font-bold text-danger">{err}</p>}
            {current && <p className="text-[11px] font-bold text-warn">An active delegation already exists — creating another will run concurrently.</p>}
            <Btn variant="volt" icon="check" className="w-full" onClick={() => {
              const s = new Date(start).getTime(), e2 = new Date(end).getTime() + 86399000;
              if (e2 <= s) { setErr("End date must be after start date."); return; }
              if (reason.trim().length < 5) { setErr("A reason is required."); return; }
              createDelegation({ start: s, end: e2, reason: reason.trim() }); setReason(""); setErr("");
            }}>Create delegation</Btn>
          </div>
        )}
      </Card>
    </div>
  );
}
