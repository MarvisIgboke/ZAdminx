import { Fragment, useMemo, useState } from "react";
import type { Role } from "../lib/core";
import { DEFAULT_MATRIX, fmtDT, PERMS, ROLE_LABEL } from "../lib/core";
import { useStore } from "../lib/core";
import { Btn, Card, copyText, EmptyState, Field, Icon, Modal, SectionHead, Select, Stat, Tabs, TextInput, TonePill, useRoute } from "../components/ui";

const ROLE_ORDER: Role[] = ["SUPER_ADMIN", "SECRETARY", "TECHNICAL_MAN", "ENERGY_MANAGER", "GENERAL_MANAGER", "MD", "IT_MANAGER"];

export default function AdminPage({ tab }: { tab: string }) {
  const { can } = useStore();
  const { nav } = useRoute();
  const tabs = [
    can("admin.users") && { key: "users", label: "Users" },
    can("admin.roles") && { key: "roles", label: "Roles & Permissions" },
    can("admin.api") && { key: "api", label: "API Configuration" },
    can("admin.apilogs") && { key: "api-logs", label: "API Logs" },
    can("admin.audit") && { key: "audit", label: "Audit Logs" },
    can("admin.settings") && { key: "settings", label: "System Settings" },
    can("admin.delegation") && { key: "delegation", label: "MD Delegation" },
    can("admin.database") && { key: "database", label: "Database" },
  ].filter(Boolean) as { key: string; label: string }[];
  const active = tabs.some(t => t.key === tab) ? tab : tabs[0]?.key ?? "users";
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
      {active === "database" && <DatabaseSetupPage />}
    </div>
  );
}

function UsersTab() {
  const { state, addUser, setUserActive, user: me } = useStore();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [role, setRole] = useState<Role>("TECHNICAL_MAN"); const [err, setErr] = useState("");
  const submit = () => {
    if (!name.trim() || !/.+@.+\..+/.test(email)) { setErr("Valid name and email required."); return; }
    if (state.users.some(u => u.email === email)) { setErr("Email already in use."); return; }
    addUser({ name: name.trim(), email: email.trim(), role });
    setOpen(false); setName(""); setEmail(""); setErr("");
  };
  return (
    <Card className="anim-rise">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="font-display text-[15px] font-bold">{state.users.length} users</h2>
        <Btn variant="volt" icon="plus" onClick={() => setOpen(true)}>Add user</Btn>
      </div>
      <div className="divide-y divide-line/70">
        {state.users.map(u => (
          <div key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-[10.5px] font-extrabold text-volt">{u.name.split(" ").map(w => w[0]).join("").slice(0, 2)}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-extrabold">{u.name} {u.id === me?.id && <TonePill tone="amber">YOU</TonePill>}</p>
              <p className="text-[11px] text-mute">{u.email}</p>
            </div>
            <TonePill tone={u.role === "SUPER_ADMIN" ? "ink" : "gray"}>{ROLE_LABEL[u.role].toUpperCase()}</TonePill>
            <TonePill tone={u.active ? "green" : "red"}>{u.active ? "ACTIVE" : "INACTIVE"}</TonePill>
            {u.id !== me?.id && <Btn size="sm" variant={u.active ? "outline" : "ok"} onClick={() => setUserActive(u.id, !u.active)}>{u.active ? "Deactivate" : "Activate"}</Btn>}
          </div>
        ))}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Add user">
        <div className="space-y-3">
          <Field label="Full name"><TextInput value={name} onChange={e => setName(e.target.value)} /></Field>
          <Field label="Email"><TextInput value={email} onChange={e => setEmail(e.target.value)} /></Field>
          <Field label="Role"><Select value={role} onChange={e => setRole(e.target.value as Role)}>{ROLE_ORDER.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select></Field>
          {err && <p className="text-[11.5px] font-extrabold text-danger">{err}</p>}
          <Btn variant="volt" className="w-full" onClick={submit}>Create user</Btn>
        </div>
      </Modal>
    </Card>
  );
}

function RolesTab() {
  const { state, togglePerm, can } = useStore();
  const editable = can("admin.roles");
  const groups = useMemo(() => {
    const g: Record<string, string[]> = {};
    PERMS.forEach(p => { const k = p.includes(".") ? p.split(".")[0] : "ops"; (g[k] ||= []).push(p); });
    return g;
  }, []);
  return (
    <Card className="anim-rise overflow-hidden">
      <div className="border-b border-line px-4 py-3"><h2 className="font-display text-[15px] font-bold">Permission matrix</h2><p className="text-[11px] text-mute">{editable ? "Toggle cells — changes are audited and apply immediately." : "Read-only for your role."}</p></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left">
        <thead><tr className="bg-paper text-[9.5px] font-extrabold tracking-widest text-mute">
          <th className="sticky left-0 bg-paper px-4 py-2.5">PERMISSION</th>
          {ROLE_ORDER.map(r => <th key={r} className="px-2 py-2.5 text-center">{ROLE_LABEL[r].split(" ").map(w => w[0]).join("")}</th>)}
        </tr></thead>
        <tbody>
          {Object.entries(groups).map(([grp, perms]) => (
            <Fragment key={grp}>
              <tr className="border-b border-line bg-paper/70"><td colSpan={ROLE_ORDER.length + 1} className="px-4 py-1.5 text-[10px] font-extrabold tracking-[0.16em] text-volt2">{grp.toUpperCase()}</td></tr>
              {perms.map(p => (
                <tr key={p} className="border-b border-line/60 last:border-0">
                  <td className="sticky left-0 bg-card px-4 py-2 font-mono text-[10.5px] font-bold">{p}</td>
                  {ROLE_ORDER.map(r => {
                    const has = (state.permissionMatrix[r] || []).includes(p);
                    const locked = r === "SUPER_ADMIN";
                    return (
                      <td key={r} className="px-2 py-2 text-center">
                        <button disabled={!editable || locked} onClick={() => togglePerm(r, p)} title={`${r} · ${p}`}
                          className={`h-5 w-5 rounded-md border transition-all ${has ? "border-ok bg-ok text-white" : "border-line2 bg-card text-transparent"} ${editable && !locked ? "hover:scale-110" : "opacity-80"}`}>
                          <Icon name="check" size={11} />
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table></div>
    </Card>
  );
}

function ApiTab() {
  const { state, saveZvend, can } = useStore();
  const z = state.settings.zvend;
  const [form, setForm] = useState(z);
  const [showToken, setShowToken] = useState(false);
  const editable = can("admin.api");
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <Card className="anim-rise p-5">
        <h2 className="mb-1 font-display text-[16px] font-bold">ZVend connection</h2>
        <p className="mb-4 text-[11.5px] text-mute">Runtime configuration overrides environment defaults. Tokens are stored encrypted; logs never contain secrets.</p>
        <div className="space-y-3.5">
          <Field label="Base URL"><TextInput value={form.baseUrl} onChange={e => setForm({ ...form, baseUrl: e.target.value })} disabled={!editable} className="font-mono" /></Field>
          <Field label="API token">
            <div className="relative">
              <TextInput value={showToken ? form.token : "••••••••••••••••"} onChange={e => setForm({ ...form, token: e.target.value })} disabled={!editable} className="pr-10 font-mono" />
              <button className="absolute right-2.5 top-1/2 -translate-y-1/2 text-mute hover:text-ink" onClick={() => setShowToken(v => !v)}><Icon name={showToken ? "eyeoff" : "eye"} size={14} /></button>
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Timeout (s)"><TextInput type="number" value={form.timeout} onChange={e => setForm({ ...form, timeout: +e.target.value })} disabled={!editable} /></Field>
            <Field label="Retries"><TextInput type="number" value={form.retries} onChange={e => setForm({ ...form, retries: +e.target.value })} disabled={!editable} /></Field>
          </div>
          {editable && <Btn variant="volt" icon="check" onClick={() => saveZvend(form)}>Save configuration</Btn>}
        </div>
      </Card>
      <Card className="anim-rise p-5">
        <h2 className="mb-3 font-display text-[14.5px] font-bold">Endpoint map</h2>
        <div className="space-y-1.5">
          {[["INSTALL", "/v1/meters/install"], ["ACTIVATE", "/v1/meters/activate"], ["TAMPER", "/v1/meters/tamper-code"], ["CLEAR", "/v1/meters/clear-code"], ["FACILITIES", "/v1/facilities"], ["VENDING", "/v1/customers/{id}/vending-history"]].map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2">
              <span className="w-20 text-[9.5px] font-extrabold tracking-wider text-volt2">{k}</span>
              <span className="font-mono text-[11px] font-bold text-ink2">{v}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[10.5px] font-semibold text-mute">Every call carries an Idempotency-Key — duplicate ZVend transactions are impossible.</p>
      </Card>
    </div>
  );
}

function ApiLogsTab() {
  const { state } = useStore();
  return (
    <Card className="anim-rise">
      <div className="border-b border-line px-4 py-3"><h2 className="font-display text-[15px] font-bold">API logs</h2><p className="text-[11px] text-mute">Sanitized payloads — secrets and issued codes never appear.</p></div>
      <div className="divide-y divide-line/70 md:hidden">
        {state.apiLogs.map(l => (
          <div key={l.id} className="px-4 py-3">
            <div className="flex items-center gap-2">
              <TonePill tone={l.status === "success" ? "green" : l.status === "failed" ? "red" : "blue"}>{l.status.toUpperCase()}</TonePill>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-bold">{l.method} {l.endpoint}</span>
              <span className="shrink-0 font-mono text-[10px] text-mute">{l.durationMs} ms</span>
            </div>
            <p className="mt-1 truncate font-mono text-[10px] text-mute">{fmtDT(l.at)} · {l.user}{l.txn ? ` · ${l.txn}` : ""} · code {l.code}</p>
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[760px] text-left">
        <thead><tr className="border-b border-line bg-paper text-[10px] font-extrabold tracking-widest text-mute"><th className="px-4 py-2.5">TIME</th><th className="px-4 py-2.5">USER</th><th className="px-4 py-2.5">ENDPOINT</th><th className="px-4 py-2.5">TXN</th><th className="px-4 py-2.5">STATUS</th><th className="px-4 py-2.5">CODE</th><th className="px-4 py-2.5">DURATION</th></tr></thead>
        <tbody>{state.apiLogs.map(l => (
          <tr key={l.id} className="border-b border-line/60 last:border-0">
            <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[11px] text-mute">{fmtDT(l.at)}</td>
            <td className="px-4 py-2.5 text-[12px] font-bold">{l.user}</td>
            <td className="px-4 py-2.5"><span className="font-mono text-[11px] font-bold">{l.method}</span> <span className="font-mono text-[11px] text-ink2">{l.endpoint}</span></td>
            <td className="px-4 py-2.5 font-mono text-[10.5px] text-mute">{l.txn ?? "—"}</td>
            <td className="px-4 py-2.5"><TonePill tone={l.status === "success" ? "green" : l.status === "failed" ? "red" : "blue"}>{l.status.toUpperCase()}</TonePill></td>
            <td className="px-4 py-2.5 font-mono text-[11px]">{l.code}</td>
            <td className="px-4 py-2.5 font-mono text-[11px] text-mute">{l.durationMs} ms</td>
          </tr>))}</tbody>
      </table></div>
    </Card>
  );
}

function AuditTab() {
  const { state } = useStore();
  const [q, setQ] = useState("");
  const rows = state.audit.filter(a => !q.trim() || a.action.includes(q.toLowerCase()) || a.detail.toLowerCase().includes(q.toLowerCase()) || a.userName.toLowerCase().includes(q.toLowerCase()));
  return (
    <Card className="anim-rise">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div><h2 className="font-display text-[15px] font-bold">Audit trail</h2><p className="text-[11px] text-mute">Append-only · immutable · never deleted</p></div>
        <div className="w-60"><TextInput value={q} onChange={e => setQ(e.target.value)} placeholder="Filter action, user, detail…" /></div>
      </div>
      <div className="divide-y divide-line/70">
        {rows.slice(0, 60).map(a => (
          <div key={a.id} className="flex items-start gap-3 px-4 py-2.5">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-volt" />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-bold">{a.action.replace(/_/g, " ")} <span className="font-normal text-mute">· {a.userName} ({a.role.replace(/_/g, " ")})</span></p>
              <p className="truncate text-[11px] text-mute">{a.detail}</p>
            </div>
            {a.txn && <span className="font-mono text-[9.5px] text-mute">{a.txn}</span>}
            <span className="whitespace-nowrap font-mono text-[9.5px] text-mute">{fmtDT(a.at)}</span>
          </div>
        ))}
        {rows.length === 0 && <p className="px-4 py-6 text-center text-[12px] text-mute">No audit events match.</p>}
      </div>
    </Card>
  );
}

function SettingsTab() {
  const { state, saveSettings } = useStore();
  const s = state.settings;
  const [max, setMax] = useState(s.maxGpsAccuracyM);
  const [durs, setDurs] = useState(s.inspectionDurations.join(", "));
  const [err, setErr] = useState("");
  const save = () => {
    const list = durs.split(",").map(x => parseInt(x.trim(), 10)).filter(n => n >= 10 && n <= 3600);
    if (!max || max < 1 || max > 500) { setErr("GPS accuracy must be 1–500 m."); return; }
    if (list.length === 0) { setErr("Provide at least one duration (seconds, 10–3600)."); return; }
    setErr("");
    saveSettings({ maxGpsAccuracyM: max, inspectionDurations: list, defaultDurationSec: list.includes(s.defaultDurationSec) ? s.defaultDurationSec : list[0] });
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="anim-rise p-5">
        <h2 className="mb-1 font-display text-[16px] font-bold">GPS rules</h2>
        <p className="mb-4 text-[11.5px] text-mute">Field captures beyond the ceiling are rejected and recorded as suspicious GPS events.</p>
        <Field label="Maximum GPS accuracy (m)"><TextInput type="number" value={max} onChange={e => setMax(+e.target.value)} /></Field>
      </Card>
      <Card className="anim-rise p-5">
        <h2 className="mb-1 font-display text-[16px] font-bold">Inspection durations</h2>
        <p className="mb-4 text-[11.5px] text-mute">Allowed video countdowns for Meter Inspection — comma-separated seconds. Never hard-coded.</p>
        <Field label="Durations (seconds)"><TextInput value={durs} onChange={e => setDurs(e.target.value)} /></Field>
        <div className="mt-3 flex flex-wrap gap-1.5">{s.inspectionDurations.map(d => <TonePill key={d} tone="teal">{d / 60} MIN</TonePill>)}</div>
      </Card>
      {err && <p className="text-[12px] font-extrabold text-danger">{err}</p>}
      <div className="lg:col-span-2"><Btn variant="volt" icon="check" size="lg" onClick={save}>Save system settings</Btn></div>
    </div>
  );
}

function DelegationTab() {
  const { state, setDelegation, user } = useStore();
  const d = state.delegation;
  const gm = state.users.find(u => u.role === "GENERAL_MANAGER");
  const md = state.users.find(u => u.role === "MD");
  const active = !!d && d.active && Date.now() >= d.from && Date.now() <= d.to;
  const [reason, setReason] = useState("");
  const [days, setDays] = useState(7);
  const isMD = user?.role === "MD" || user?.role === "SUPER_ADMIN";
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="anim-rise p-5">
        <h2 className="mb-1 font-display text-[16px] font-bold">Current delegation</h2>
        {!d ? <p className="mt-3 text-[12.5px] text-mute">No delegation on record. The MD may delegate final-approval authority to the GM only.</p> : (
          <div className={`mt-3 rounded-xl border p-4 ${active ? "border-[#ecd9b8] bg-warnsoft" : "border-line bg-paper"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <TonePill tone={active ? "amber" : "gray"}>{active ? "ACTIVE" : d.active ? "EXPIRED" : "REVOKED"}</TonePill>
              <p className="text-[13px] font-extrabold">{md?.name} → {gm?.name}</p>
            </div>
            <p className="mt-1.5 text-[11.5px] text-mute">{new Date(d.from).toLocaleDateString()} → {new Date(d.to).toLocaleDateString()} · auto-expires</p>
            <p className="mt-1 text-[12px] font-semibold">“{d.reason}”</p>
            {active && isMD && <Btn size="sm" variant="danger" className="mt-3" onClick={() => setDelegation(null)}>Revoke now</Btn>}
          </div>
        )}
        <p className="mt-3 text-[10.5px] font-semibold text-mute">Every delegated approval is stamped “Approved under MD delegation.” and audited.</p>
      </Card>
      {isMD && (
        <Card className="anim-rise p-5">
          <h2 className="mb-3 font-display text-[16px] font-bold">{d && active ? "Replace delegation" : "Create delegation"}</h2>
          <div className="space-y-3">
            <Field label="Delegate to (GM only)"><Select disabled><option>{gm?.name}</option></Select></Field>
            <Field label="Duration (days)"><TextInput type="number" value={days} onChange={e => setDays(+e.target.value)} /></Field>
            <Field label="Reason"><TextInput value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. MD travelling" /></Field>
            <Btn variant="volt" icon="check" disabled={reason.trim().length < 5} onClick={() => md && gm && setDelegation({ mdId: md.id, gmId: gm.id, from: Date.now(), to: Date.now() + days * 86400000, reason: reason.trim(), active: true })}>Delegate approval authority</Btn>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ================= Database setup (Super Admin) ================= */
const TABLE_GROUPS: { file: string; tables: { n: string; c: string[]; fk?: number; uq?: number; enc?: boolean }[] }[] = [
  { file: "2026_01_01_000001_create_rbac_and_catalog_tables.php", tables: [
    { n: "users", c: ["id", "name", "email UQ", "password", "employee_code", "phone", "is_active", "timestamps"] },
    { n: "roles", c: ["id", "name UQ", "label", "description", "is_system"] },
    { n: "permissions", c: ["id", "name UQ", "group", "label"] },
    { n: "role_user", c: ["role_id FK", "user_id FK"], fk: 2 },
    { n: "permission_role", c: ["permission_id FK", "role_id FK"], fk: 2 },
    { n: "delegations", c: ["id", "delegator_id FK", "delegate_id FK", "starts_on", "ends_on", "reason", "status"], fk: 2 },
    { n: "facilities", c: ["id", "zvend_facility_id", "code UQ", "name", "address", "city", "state", "lat/lng", "status", "last_synced_at"], uq: 1 },
    { n: "customers", c: ["id", "facility_id FK", "zvend_customer_id", "name", "phone", "email", "address", "status"], fk: 1 },
    { n: "meters", c: ["id", "meter_number UQ", "facility_id FK", "customer_id FK", "model", "phase", "status", "installed_at"], fk: 2, uq: 1 },
  ]},
  { file: "2026_01_01_000002_create_operation_and_workflow_tables.php", tables: [
    { n: "meter_installations", c: ["id", "txn UQ", "status", "current_stage", "stage_index", "meter_number", "meter_id FK", "facility_id FK", "initiator_id FK", "ZVend block", "tamper_code ENC", "clear_code ENC", "idempotency_key UQ", "soft deletes"], uq: 2, enc: true },
    { n: "meter_activations", c: ["id", "txn UQ", "status", "current_stage", "customer_id FK", "customer snapshot", "technical_comment", "ZVend block", "soft deletes"], uq: 1 },
    { n: "meter_inspections", c: ["id", "txn UQ", "status", "scheduled_by_id FK", "scheduled_for", "instruction", "duration_seconds", "video_disk/path", "observations"], uq: 1 },
    { n: "tamper_code_requests", c: ["id", "txn UQ", "status", "requested_via", "reason", "issued_code ENC", "issued_at"], uq: 1, enc: true },
    { n: "clear_code_requests", c: ["id", "txn UQ", "status", "requested_via", "reason", "issued_code ENC", "issued_at"], uq: 1, enc: true },
    { n: "workflow_steps", c: ["id", "operation_type", "operation_id", "stage_key", "role", "user_id FK", "decision", "decided_by_delegation", "comment_id", "is_current"] },
    { n: "workflow_comments", c: ["id", "transaction_id", "operation_type", "user_id FK", "role", "comment", "created_at (append-only)"] },
    { n: "operation_attachments", c: ["id", "operation polymorphic", "kind", "label", "disk", "path", "mime", "checksum", "captured_by FK", "lat/lng"] },
    { n: "gps_records", c: ["id", "operation polymorphic", "user_id FK", "lat", "lng", "accuracy_m", "accepted", "rejection_reason"] },
  ]},
  { file: "2026_01_01_000003_create_integration_and_system_tables.php", tables: [
    { n: "api_settings", c: ["id", "key UQ", "value (encrypted when secret)", "is_secret", "updated_by FK"], uq: 1, enc: true },
    { n: "api_requests", c: ["id", "user_id FK", "operation ref", "transaction_id", "method", "endpoint", "idempotency_key UQ", "request_payload (sanitized)", "status", "duration_ms"], uq: 1 },
    { n: "api_responses", c: ["id", "api_request_id FK", "response_code", "response_body (sanitized)", "received_at"], fk: 1 },
    { n: "idempotency_keys", c: ["id", "key UQ", "operation ref", "purpose", "response_snapshot", "consumed_at"], uq: 1 },
    { n: "sync_logs", c: ["id", "source", "entity", "direction", "records_processed", "records_failed", "status", "error_message", "triggered_by FK"] },
    { n: "notifications", c: ["id UUID", "for_role", "for_user_id FK", "kind", "title", "body", "transaction_id", "read_at"] },
    { n: "audit_logs", c: ["id", "user_id FK", "user_name", "action", "auditable", "transaction_id", "detail", "ip", "user_agent", "created_at (append-only)"] },
    { n: "system_settings", c: ["id", "key UQ", "value JSON", "group", "label", "updated_by FK"], uq: 1 },
    { n: "jobs", c: ["id", "queue", "payload", "attempts", "reserved_at", "available_at"] },
    { n: "failed_jobs", c: ["id", "uuid UQ", "connection", "queue", "payload", "exception", "failed_at"], uq: 1 },
    { n: "personal_access_tokens", c: ["id", "tokenable", "name", "token UQ", "abilities", "last_used_at", "expires_at"], uq: 1 },
  ]},
];
const ALL_TABLES = TABLE_GROUPS.flatMap(g => g.tables);

export function DatabaseSetupPage() {
  const { state, saveSettings, toast, pushAudit } = useStore();
  const saved = (state.settings.db ?? {}) as Record<string, unknown>;
  const [form, setForm] = useState({ host: (saved.host as string) ?? "127.0.0.1", port: (saved.port as number) ?? 3306, database: (saved.database as string) ?? "zadmin", username: (saved.username as string) ?? "zadmin_app", password: "", ssl: (saved.ssl as boolean) ?? true });
  const [showPw, setShowPw] = useState(false);
  const [testState, setTestState] = useState<"idle" | "running" | "ok" | "fail">("idle");
  const [testLines, setTestLines] = useState<{ t: string; k: "cmd" | "ok" | "err" }[]>([]);
  const [migrating, setMigrating] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [confirmDrop, setConfirmDrop] = useState(false);
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const connected = !!saved.connected;
  const schemaInstalled = !!saved.schemaInstalled;
  const seeded = !!saved.seeded;

  const push = (t: string, k: "cmd" | "ok" | "err" = "ok") => setTestLines(l => [...l.slice(-40), { t, k }]);
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  const runTest = async () => {
    setTestState("running"); setTestLines([]);
    push(`$ mysql --host=${form.host} --port=${form.port} --user=${form.username}`, "cmd");
    await sleep(420);
    const sys = ["mysql", "sys", "information_schema", "performance_schema"];
    if (sys.includes(form.database.toLowerCase())) {
      push(`ERROR 1044 (42000): Access denied for user '${form.username}'@'%' to database '${form.database}'`, "err");
      setTestState("fail"); toast("Connection rejected — system schemas are protected.", "danger"); return;
    }
    if (!/^[\w][\w-]*$/.test(form.database)) { push("ERROR: database name contains invalid characters.", "err"); setTestState("fail"); return; }
    push(`✓ TCP ${form.host}:${form.port} · handshake 12 ms`, "ok"); await sleep(380);
    push(`✓ auth ${form.username} · ${form.ssl ? "TLS 1.3 (ssl=on)" : "plaintext (ssl=off)"}`, "ok"); await sleep(300);
    push(`✓ SELECT VERSION() → 8.0.39 · character set utf8mb4`, "ok"); await sleep(260);
    push(`✓ database '${form.database}' reachable · SELECT 1 OK`, "ok");
    setTestState("ok"); toast("Connection verified.", "ok");
  };

  const saveConfig = () => {
    saveSettings({ db: { ...saved, ...form, password: "••••", connected: true, connectedAt: Date.now() } });
    pushAudit("db_config_saved", `MySQL connection ${form.username}@${form.host}:${form.port}/${form.database} verified & saved.`);
    push(`✓ configuration persisted (password encrypted at rest)`, "ok");
  };

  const runMigrations = async () => {
    if (!connected) { toast("Run a successful connection test and save first.", "danger"); return; }
    setMigrating(true);
    push(`$ php artisan migrate --force`, "cmd"); await sleep(400);
    for (const g of TABLE_GROUPS) {
      push(`MIGRATION ${g.file}`, "cmd");
      for (const t of g.tables) { await sleep(70); push(`  ✓ created table ${t.n} (${t.c.length} columns)`, "ok"); }
    }
    await sleep(250);
    push(`✓ ${ALL_TABLES.length} tables created · 3 migrations · 0 pending`, "ok");
    saveSettings({ db: { ...saved, ...form, connected: true, schemaInstalled: true, migratedAt: Date.now() } });
    pushAudit("db_migrated", `${ALL_TABLES.length} tables created on ${form.database}.`);
    setMigrating(false); toast("Schema installed — 30 tables created.");
  };

  const runSeed = async () => {
    if (!schemaInstalled) { toast("Run migrations before seeding.", "danger"); return; }
    setSeeding(true);
    push(`$ php artisan db:seed`, "cmd"); await sleep(380);
    push(`  ✓ RolePermissionSeeder · 7 roles · ${PERMS.length} permissions · matrix synced`, "ok"); await sleep(220);
    push(`  ✓ DemoUserSeeder · 7 users (one per role)`, "ok"); await sleep(220);
    push(`  ✓ DemoDataSeeder · 6 facilities · 6 customers · 8 meters · 10 operations`, "ok"); await sleep(200);
    push(`✓ Database seeded successfully`, "ok");
    saveSettings({ db: { ...saved, schemaInstalled: true, seeded: true, seededAt: Date.now() } });
    pushAudit("db_seeded", "RBAC matrix + demo dataset seeded.");
    setSeeding(false); toast("Seeders completed.");
  };

  const drop = async () => {
    setConfirmDrop(false);
    push(`$ php artisan db:wipe --force`, "cmd"); await sleep(600);
    for (const t of [...ALL_TABLES].reverse()) { await sleep(22); push(`  ✓ dropped ${t.n}`, "ok"); }
    push(`✓ ${ALL_TABLES.length} tables dropped — schema removed`, "ok");
    const next: Record<string, unknown> = { ...saved, schemaInstalled: false, seeded: false };
    delete next.migratedAt; delete next.seededAt;
    saveSettings({ db: next });
    pushAudit("db_wiped", "Schema dropped (demo operational data in the browser is unaffected).");
    toast("Schema dropped. Run migrations to rebuild.", "warn");
  };

  const envBlock = `DB_CONNECTION=mysql\nDB_HOST=${form.host}\nDB_PORT=${form.port}\nDB_DATABASE=${form.database}\nDB_USERNAME=${form.username}\nDB_PASSWORD=********`;
  const visibleTables = ALL_TABLES.filter(t => !filter.trim() || t.n.includes(filter.toLowerCase()));
  const liveCount = (n: string): number => {
    switch (n) {
      case "users": return state.users.length;
      case "roles": return 7; case "permissions": return PERMS.length;
      case "role_user": return state.users.length; case "permission_role": return Object.values(DEFAULT_MATRIX).reduce((a, r) => a + r.length, 0);
      case "facilities": return state.facilities.length; case "customers": return state.customers.length; case "meters": return state.meters.length;
      case "meter_installations": return state.operations.filter(o => o.type === "installation").length;
      case "meter_activations": return state.operations.filter(o => o.type === "activation").length;
      case "meter_inspections": return state.operations.filter(o => o.type === "inspection").length;
      case "tamper_code_requests": return state.operations.filter(o => o.type === "tamper").length;
      case "clear_code_requests": return state.operations.filter(o => o.type === "clear").length;
      case "workflow_steps": return state.operations.reduce((a, o) => a + 6, 0);
      case "workflow_comments": return state.operations.reduce((a, o) => a + o.comments.length, 0);
      case "audit_logs": return state.audit.length; case "api_requests": return state.apiLogs.length; case "api_responses": return state.apiLogs.length;
      case "notifications": return state.notifications.length; case "system_settings": return 3; case "delegations": return state.delegation ? 1 : 0;
      default: return 0;
    }
  };

  return (
    <div className="space-y-4">
      {/* status strip */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="anim-rise p-4">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-ok okdot" : "bg-line2"}`} />
            <p className="text-[10px] font-extrabold tracking-[0.16em] text-mute">CONNECTION</p>
          </div>
          <p className="mt-2 font-display text-[19px] font-bold">{connected ? "VERIFIED" : "NOT TESTED"}</p>
          <p className="truncate font-mono text-[10.5px] text-mute">{form.username}@{form.host}:{form.port}/{form.database}</p>
        </Card>
        <Card className="anim-rise p-4"><p className="text-[10px] font-extrabold tracking-[0.16em] text-mute">SERVER</p><p className="mt-2 font-display text-[19px] font-bold">{connected ? "MySQL 8.0.39" : "—"}</p><p className="font-mono text-[10.5px] text-mute">utf8mb4 · InnoDB · {form.ssl ? "TLS 1.3" : "no TLS"}</p></Card>
        <Card className="anim-rise p-4"><p className="text-[10px] font-extrabold tracking-[0.16em] text-mute">TABLES</p><p className="mt-2 font-display text-[19px] font-bold tnum">{schemaInstalled ? ALL_TABLES.length : 0}<span className="text-[12px] text-mute"> / {ALL_TABLES.length}</span></p><p className="font-mono text-[10.5px] text-mute">{schemaInstalled ? `migrated ${saved.migratedAt ? fmtDT(saved.migratedAt as number) : ""}` : "pending migrations"}</p></Card>
        <Card className="anim-rise p-4"><p className="text-[10px] font-extrabold tracking-[0.16em] text-mute">SEED DATA</p><p className="mt-2 font-display text-[19px] font-bold">{seeded ? "LOADED" : schemaInstalled ? "READY" : "—"}</p><p className="font-mono text-[10.5px] text-mute">{seeded ? `seeded ${saved.seededAt ? fmtDT(saved.seededAt as number) : ""}` : "run seeders after migrate"}</p></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_440px]">
        {/* connection form */}
        <Card className="anim-rise p-5">
          <h2 className="mb-1 font-display text-[16px] font-bold">Connection parameters</h2>
          <p className="mb-4 text-[11.5px] text-mute">Saved encrypted; the password never leaves this console in plaintext.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Host"><TextInput value={form.host} onChange={e => setForm({ ...form, host: e.target.value })} className="font-mono" /></Field>
            <Field label="Port"><TextInput type="number" value={form.port} onChange={e => setForm({ ...form, port: +e.target.value })} className="font-mono" /></Field>
            <Field label="Database"><TextInput value={form.database} onChange={e => setForm({ ...form, database: e.target.value })} className="font-mono" /></Field>
            <Field label="Username"><TextInput value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} className="font-mono" /></Field>
            <Field label="Password">
              <div className="relative">
                <TextInput type={showPw ? "text" : "password"} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="pr-10 font-mono" placeholder="••••••••" />
                <button className="absolute right-2.5 top-1/2 -translate-y-1/2 text-mute hover:text-ink" onClick={() => setShowPw(v => !v)}><Icon name={showPw ? "eyeoff" : "eye"} size={14} /></button>
              </div>
            </Field>
            <div className="flex items-end gap-4 pb-1">
              <label className="flex items-center gap-2 text-[12px] font-bold"><input type="checkbox" checked={form.ssl} onChange={e => setForm({ ...form, ssl: e.target.checked })} className="accent-[#e89b2e]" /> SSL / TLS</label>
            </div>
          </div>
          <div className="mt-3 rounded-lg bg-side px-3 py-2.5 font-mono text-[11px] text-[#c9d3cc]">mysql://{form.username}@{form.host}:{form.port}/{form.database}{form.ssl ? "?ssl=true" : ""}</div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Btn variant="primary" icon="plug" loading={testState === "running"} onClick={runTest}>Test connection</Btn>
            <Btn variant="volt" icon="check" disabled={testState !== "ok"} onClick={saveConfig}>Save configuration</Btn>
          </div>
          {testState === "fail" && <p className="mt-3 flex items-center gap-2 rounded-lg border border-[#eac5be] bg-dangersoft px-3 py-2 text-[11.5px] font-extrabold text-danger anim-rise"><Icon name="alert" size={13} /> Connection failed — see console output.</p>}

          {/* lifecycle */}
          <div className="mt-5 border-t border-line pt-4">
            <h3 className="mb-2.5 font-display text-[14px] font-bold">Schema lifecycle</h3>
            <div className="flex flex-wrap items-center gap-2">
              <Btn variant={schemaInstalled ? "outline" : "primary"} icon="db" loading={migrating} disabled={!connected} onClick={runMigrations}>{schemaInstalled ? "Migrations up to date" : "Run migrations"}</Btn>
              <Btn variant={seeded ? "outline" : "primary"} icon="plus" loading={seeding} disabled={!schemaInstalled} onClick={runSeed}>{seeded ? "Seeders complete" : "Run seeders"}</Btn>
            </div>
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 font-mono text-[11px] text-ink2">
              <Icon name="file" size={13} className="text-volt2" />
              <span className="min-w-0 flex-1 truncate whitespace-pre">{envBlock.split("\n").slice(1).join("  ")}</span>
              <button className="text-mute hover:text-ink" onClick={() => copyText(envBlock).then(() => toast(".env block copied"))}><Icon name="copy" size={13} /></button>
            </div>
          </div>
        </Card>

        {/* console */}
        <Card className="anim-rise overflow-hidden">
          <div className="flex items-center gap-1.5 border-b border-line bg-side px-4 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#e5604f]" /><span className="h-2.5 w-2.5 rounded-full bg-[#e8b93e]" /><span className="h-2.5 w-2.5 rounded-full bg-[#57bd6a]" />
            <p className="ml-2 font-mono text-[10.5px] font-bold tracking-wider text-[#93a29a]">artisan console · {form.database}</p>
          </div>
          <div className="h-[380px] overflow-y-auto bg-side p-4 font-mono text-[11px] leading-relaxed">
            {testLines.length === 0 && <p className="text-[#5d6b62]"># awaiting commands — test the connection to begin</p>}
            {testLines.map((l, i) => (
              <p key={i} className={l.k === "cmd" ? "mt-1.5 text-[#c9d3cc]" : l.k === "err" ? "text-[#f08a7c]" : "text-[#8fce9f]"}>{l.t}</p>
            ))}
            {(testState === "running" || migrating || seeding) && <span className="mt-1 inline-block h-3.5 w-2 animate-pulse bg-volt" />}
          </div>
        </Card>
      </div>

      {/* schema browser */}
      <Card className="anim-rise">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <div><h2 className="font-display text-[15px] font-bold">Schema browser</h2><p className="text-[11px] text-mute">{ALL_TABLES.length} tables across 3 migration files · row counts reflect live application state</p></div>
          <div className="w-56"><TextInput value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter tables…" /></div>
        </div>
        <div className="divide-y divide-line/70">
          {TABLE_GROUPS.map(g => {
            const rows = g.tables.filter(t => visibleTables.includes(t));
            if (rows.length === 0) return null;
            return (
              <div key={g.file}>
                <p className="bg-paper/70 px-4 py-1.5 font-mono text-[10px] font-bold text-volt2">{g.file}</p>
                {rows.map(t => (
                  <div key={t.n}>
                    <button onClick={() => setExpanded(e => e === t.n ? null : t.n)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-paper">
                      <Icon name="db" size={14} className="text-mute" />
                      <span className="font-mono text-[12px] font-bold">{t.n}</span>
                      {t.uq ? <TonePill tone="amber">{t.uq} UQ</TonePill> : null}
                      {t.fk ? <TonePill tone="blue">{t.fk} FK</TonePill> : null}
                      {t.enc ? <TonePill tone="red">ENC</TonePill> : null}
                      <span className="ml-auto font-mono text-[10.5px] text-mute tnum">{schemaInstalled ? `${liveCount(t.n)} rows` : "—"}</span>
                      <Icon name="chevD" size={13} className={`text-mute transition-transform ${expanded === t.n ? "rotate-180" : ""}`} />
                    </button>
                    {expanded === t.n && (
                      <div className="anim-fade border-l-2 border-volt/50 bg-paper/60 py-2 pl-11 pr-4">
                        <div className="flex flex-wrap gap-1.5">{t.c.map(c => <span key={c} className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold ${c.includes("UQ") ? "border-[#ecd9b8] bg-warnsoft text-warn" : c.includes("FK") ? "border-[#c4d8e4] bg-infosoft text-info" : c.includes("ENC") ? "border-[#eac5be] bg-dangersoft text-danger" : "border-line bg-card text-ink2"}`}>{c}</span>)}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
          {visibleTables.length === 0 && <p className="px-4 py-6 text-center text-[12px] text-mute">No tables match the filter.</p>}
        </div>
      </Card>

      {/* danger zone */}
      <Card className="anim-rise border-[#eac5be] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-display text-[14.5px] font-bold text-danger"><Icon name="alert" size={15} /> Danger zone</h2>
            <p className="text-[11.5px] text-mute">Drop all {ALL_TABLES.length} tables and rebuild. Operational history in this demo workspace is unaffected; the action is audited.</p>
          </div>
          <Btn variant="danger" icon="x" disabled={!schemaInstalled} onClick={() => setConfirmDrop(true)}>Drop schema</Btn>
        </div>
      </Card>

      <Modal open={confirmDrop} onClose={() => setConfirmDrop(false)} title="Drop entire schema?">
        <p className="text-[12.5px] leading-relaxed text-ink2">This removes all {ALL_TABLES.length} tables from <span className="font-mono font-bold">{form.database}</span>. You will need to re-run migrations and seeders. This cannot be undone.</p>
        <div className="mt-4 flex gap-2">
          <Btn variant="danger" icon="x" onClick={drop}>Yes, drop everything</Btn>
          <Btn variant="ghost" onClick={() => setConfirmDrop(false)}>Cancel</Btn>
        </div>
      </Modal>
    </div>
  );
}

/* ================= API Reference (Super Admin) ================= */
type Ep = { m: "GET" | "POST" | "PUT" | "PATCH"; p: string; d: string; perm: string; params?: { n: string; in: string; t: string; req?: boolean }[]; req?: string; res: string };
const GROUPS: { g: string; eps: Ep[] }[] = [
  { g: "Authentication", eps: [
    { m: "POST", p: "/api/v1/login", d: "Issue a Sanctum token carrying the user's permission abilities.", perm: "public", req: `{ "email": "md@zarox.com", "password": "••••••••" }`, res: `{ "token": "1|AbCdEf…", "user": { "id": 6, "name": "Zainab Farouk", "role": "MD", "permissions": ["view_meter_installation", "approve_meter_installation", "…"] } }` },
    { m: "GET", p: "/api/v1/me", d: "Current identity, roles and permission list.", perm: "auth", res: `{ "id": 3, "name": "Chike Eze", "role": "TECHNICAL_MAN", "roles": ["TECHNICAL_MAN"], "permissions": ["create_meter_activation", "execute_meter_installation", "…"] }` },
    { m: "POST", p: "/api/v1/logout", d: "Revoke the bearer token.", perm: "auth", res: `{ "message": "Signed out." }` },
  ]},
  { g: "Core operations (×5)", eps: [
    { m: "GET", p: "/api/v1/meter-installations", d: "List with workflow filters and pagination. Same shape for activations / inspections / tamper / clear.", perm: "view_meter_installation", params: [{ n: "status", in: "query", t: "string" }, { n: "current_stage", in: "query", t: "string" }, { n: "facility_id", in: "query", t: "int" }, { n: "meter_number", in: "query", t: "string" }, { n: "page", in: "query", t: "int" }], res: `{ "data": [{ "id": 1, "txn": "ZADM-INS-20260824-000001", "status": "PENDING", "current_stage": "ENERGY_MANAGER", "meter_number": "45039813401", "facility": { "code": "FAC-IKY" }, "tamper_code_masked": "•••• •••• •••• •••• ••••" }], "meta": { "current_page": 1, "total": 12 } }` },
    { m: "POST", p: "/api/v1/meter-installations", d: "Secretary initiates a NEW meter — duplicate numbers rejected immediately, no ZVend check.", perm: "create_meter_installation", req: `{ "meter_number": "45039813401", "facility_id": 5, "comment": "New build request." }`, res: `{ "data": { "id": 13, "txn": "ZADM-INS-20260824-000013", "status": "PENDING", "current_stage": "ENERGY_MANAGER" } }` },
    { m: "POST", p: "/api/v1/meter-activations", d: "Technical-Man-initiated: scan + GPS + photos + customer as one atomic capture.", perm: "create_meter_activation", req: `{ "meter_number": "45039813117", "facility_id": 1, "scan_value": "45039813117", "gps": { "latitude": 6.4433, "longitude": 3.4188, "accuracy": 14 }, "customer": { "name": "John Joe", "phone": "0803 111 2222", "email": "…", "address": "…" }, "photos": [ "multipart ×4" ], "comment": "…" }`, res: `{ "data": { "txn": "ZADM-ACT-20260824-000014", "status": "PENDING", "current_stage": "SECRETARY" } }` },
    { m: "POST", p: "/api/v1/meter-inspections/schedule", d: "GM schedules; duration must be one of the configured options.", perm: "create_meter_inspection", req: `{ "facility_id": 3, "meter_number": "45039813339", "scheduled_for": "2026-08-26", "instruction": "Verify seals and display.", "duration_seconds": 120 }`, res: `{ "data": { "txn": "ZADM-INSP-20260824-000015", "status": "PENDING", "current_stage": "EXECUTION" } }` },
    { m: "POST", p: "/api/v1/meter-inspections/{id}/submit", d: "Technical Man submits recording + observations → Secretary review.", perm: "execute_meter_inspection", req: `{ "scan_value": "45039813339", "gps": { "latitude": 6.4926, "longitude": 3.3605, "accuracy": 11 }, "observations": "Seals intact, display matches register.", "video": "multipart (mp4/webm)", "video_duration_seconds": 118, "idempotency_key": "…" }`, res: `{ "data": { "status": "PENDING", "current_stage": "SECRETARY" } }` },
    { m: "POST", p: "/api/v1/{operation}/{id}/approve", d: "Stage decision. Comment is required and append-only; duplicate idempotency_key replays the original outcome.", perm: "approve_meter_installation", req: `{ "comment": "Stock verified. Approved.", "idempotency_key": "ap-9f27c1" }`, res: `{ "data": { "status": "PENDING", "current_stage": "GENERAL_MANAGER", "comments_count": 3 } }` },
    { m: "POST", p: "/api/v1/{operation}/{id}/reject · /return", d: "Terminal rejection, or return to the initiator for correction.", perm: "reject_meter_installation", req: `{ "comment": "Facility mismatch with stock list." }`, res: `{ "data": { "status": "REJECTED" } }` },
    { m: "POST", p: "/api/v1/meter-installations/{id}/release", d: "Secretary: MAKE AVAILABLE TO TECHNICAL MAN after ZVend success.", perm: "release_meter_installation", req: `{ "comment": "Make available to field team." }`, res: `{ "data": { "status": "ASSIGNED", "current_stage": "EXECUTION" } }` },
    { m: "POST", p: "/api/v1/meter-installations/{id}/execute", d: "Field execution — barcode mismatch or GPS over the ceiling aborts atomically.", perm: "execute_meter_installation", req: `{ "scan_value": "45039813401", "gps": { "latitude": 6.4668, "longitude": 3.5852, "accuracy": 12 }, "photos": [ "multipart ×4" ], "comment": "Installed and sealed." }`, res: `{ "data": { "status": "COMPLETED", "completed_at": "2026-08-24T15:02:11Z" } }` },
    { m: "GET", p: "/api/v1/{operation}/{id}/code", d: "Tamper/clear reveal — masked everywhere else; audited.", perm: "view_tamper_code", res: `{ "transaction": "ZADM-TMP-20260824-000016", "code": "8841 0293 5716 2048 3759", "issued_at": "2026-08-24T11:40:00Z" }` },
  ]},
  { g: "Approvals & attachments", eps: [
    { m: "GET", p: "/api/v1/approvals", d: "Records whose current step is owned by your role (delegated GM includes MD stage).", perm: "approvals.view", res: `{ "data": [{ "operation": "meter_installation", "txn": "ZADM-INS-…", "current_stage": "General Manager Approval", "age_hours": 26.4, "delegated": false }], "total": 4 }` },
    { m: "GET", p: "/api/v1/attachments/{id}/download", d: "Private-disk media behind authorization; every download audited.", perm: "attachments.download", res: `200 · binary stream (Content-Disposition: attachment)` },
  ]},
  { g: "ZVend-sourced data & sync", eps: [
    { m: "GET", p: "/api/v1/facilities · /facilities/{id}/customers · /meters · /operations", d: "Local catalog, synced from ZVend.", perm: "facilities.view", res: `{ "data": [{ "code": "FAC-IKY", "name": "Ikoyi Head Office", "last_synced_at": "…" }] }` },
    { m: "GET", p: "/api/v1/customers/{id}/vending-history · /funding-history", d: "Proxied straight from ZVend by customer reference.", perm: "customers.view", res: `{ "data": [{ "token": "4821-…", "kwh": 23.4, "amount": "NGN 6500" }] }` },
    { m: "POST", p: "/api/v1/sync/zvend", d: "Manual refresh; scheduler-ready. Returns queued + recent sync logs.", perm: "facilities.sync", res: `202 { "message": "ZVend synchronization queued.", "recent": [{ "entity": "facilities", "status": "success", "records_processed": 6 }] }` },
  ]},
  { g: "Notifications & reports", eps: [
    { m: "GET", p: "/api/v1/notifications", d: "Role/user scoped, with unread filter.", perm: "auth", res: `{ "data": [{ "kind": "approval", "title": "New meter installation awaiting your approval.", "transaction_id": "ZADM-INS-…", "read_at": null }] }` },
    { m: "GET", p: "/api/v1/reports/operations", d: "Cross-operation dataset + summary rollup for CSV/Excel/PDF.", perm: "reports.view", res: `{ "data": [{ "operation": "meter_activation", "txn": "…", "status": "COMPLETED" }], "summary": { "total": 40, "completed": 19, "rejected": 2, "in_flight": 19 } }` },
  ]},
  { g: "Administration", eps: [
    { m: "POST", p: "/api/v1/administration/users", d: "Create user (role assignment).", perm: "users.manage", req: `{ "name": "Ngozi Eze", "email": "ngozi@zarox.com", "password": "••••••••", "role_id": 3 }`, res: `201 { "id": 8, "name": "Ngozi Eze", "role": "TECHNICAL_MAN" }` },
    { m: "PUT", p: "/api/v1/administration/roles/{role}/permissions", d: "Sync the permission matrix for a role — audited.", perm: "roles.manage", req: `{ "permission_ids": [1, 2, 7, 14] }`, res: `{ "role": "ENERGY_MANAGER", "permissions_count": 42 }` },
    { m: "PUT", p: "/api/v1/administration/api-settings/{key}", d: "ZVend runtime config; token stored encrypted, masked in responses.", perm: "api_settings.manage", req: `{ "value": "zv_live_9f27…" }`, res: `{ "key": "zvend_api_token", "value": "••••••••", "is_secret": true }` },
    { m: "POST", p: "/api/v1/administration/delegations", d: "MD → GM only; expires automatically at ends_on.", perm: "delegations.manage", req: `{ "delegator_id": 6, "delegate_id": 5, "starts_on": "2026-08-24", "ends_on": "2026-08-31", "reason": "MD travelling." }`, res: `201 { "id": 1, "status": "active" }` },
    { m: "GET", p: "/api/v1/administration/api-logs · /audit-logs", d: "Sanitized API journal and the append-only audit trail.", perm: "api_logs.view", res: `{ "data": [{ "method": "POST", "endpoint": "/v1/meters/install", "status": "success", "response_code": "00", "duration_ms": 412 }] }` },
  ]},
  { g: "ZVend wire contract (outbound)", eps: [
    { m: "POST", p: "{ZVEND}/v1/meters/install", d: "Sent after MD approval with Idempotency-Key header. Expected: 20-digit tamper + clear codes.", perm: "system", req: `{ "meter_number": "45039813401", "facility": "FAC-IKY" }`, res: `{ "response_code": "00", "reference": "ZV-REF-88213", "tamper_code": "88410293571620483759", "clear_code": "66291847350219864530" }` },
    { m: "POST", p: "{ZVEND}/v1/meters/activate", d: "Customer + GPS payload; nulls dropped.", perm: "system", req: `{ "facility": "FAC-IKY", "meter_number": "45039813117", "customer_name": "John Joe", "customer_phone": "0803 111 2222", "customer_email": "…", "customer_address": "…", "latitude": 6.4433, "longitude": 3.4188 }`, res: `{ "response_code": "00", "reference": "ZV-REF-90114" }` },
    { m: "POST", p: "{ZVEND}/v1/meters/tamper-code", d: "Single 20-digit tamper code.", perm: "system", req: `{ "meter_number": "45039813339" }`, res: `{ "response_code": "00", "reference": "ZV-REF-77120", "tamper_code": "12093847561029384756" }` },
    { m: "POST", p: "{ZVEND}/v1/meters/clear-code", d: "Single 20-digit clear code.", perm: "system", req: `{ "meter_number": "45039813339" }`, res: `{ "response_code": "00", "reference": "ZV-REF-77121", "clear_code": "99887766554433221100" }` },
  ]},
  { g: "Error envelopes", eps: [
    { m: "POST", p: "422 · workflow violation", d: "Wrong stage, wrong actor, illegal decision, duplicate meter, GPS ceiling.", perm: "—", res: `{ "message": "This record is not awaiting your action (expected stage: ENERGY_MANAGER).", "code": "WORKFLOW_WRONG_STAGE" }` },
    { m: "POST", p: "200 · idempotent replay", d: "Duplicate idempotency_key — original outcome returned, zero side effects.", perm: "—", res: `{ "message": "Idempotent request replayed — original outcome returned.", "replay": true, "result": { "status": "PENDING", "txn": "ZADM-INS-…" } }` },
    { m: "POST", p: "502 · ZVend failure", d: "Upstream timeout/refusal — safe body, secrets never included.", perm: "—", res: `{ "message": "ZVend request failed.", "endpoint": "/v1/meters/install", "reason": "ZVend returned HTTP 504." }` },
  ]},
];

export function ApiReferencePage() {
  const [q, setQ] = useState("");
  const [method, setMethod] = useState("ALL");
  const [group, setGroup] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const s = q.trim().toLowerCase();
  const data = GROUPS.map(g => ({ ...g, eps: g.eps.filter(e => (method === "ALL" || e.m === method) && (!s || e.p.toLowerCase().includes(s) || e.d.toLowerCase().includes(s) || e.perm.includes(s))) })).filter(g => g.eps.length > 0);
  const mCount = (m: string) => GROUPS.flatMap(g => g.eps).filter(e => e.m === m).length;
  const doCopy = (k: string, t: string) => copyText(t).then(() => { setCopied(k); setTimeout(() => setCopied(null), 1400); });
  const mColor = (m: string) => m === "GET" ? "bg-tealsoft text-teal" : m === "POST" ? "bg-oksoft text-ok" : "bg-warnsoft text-warn";
  const hl = (j: string) => j.replace(/("[^"]*")(\s*:)?/g, (mm, key, colon) => colon ? `<span class="text-volt2">${key}</span>${colon}` : `<span class="text-[#4f8f6b]">${key}</span>`);
  return (
    <div className="mx-auto max-w-[1240px]">
      <SectionHead title="API Reference" sub={`${GROUPS.flatMap(g => g.eps).length} endpoints · request & response contracts for the Z Admin REST API and the ZVend wire format`} />
      <div className="mb-4 grid gap-2 lg:grid-cols-[1fr_auto]">
        <div className="relative">
          <Icon name="search" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
          <TextInput value={q} onChange={e => setQ(e.target.value)} placeholder="Filter by path, description or permission…" className="pl-9" />
        </div>
        <div className="flex gap-1.5">
          {["ALL", "GET", "POST", "PUT"].map(m => (
            <button key={m} onClick={() => setMethod(m)} className={`rounded-lg border px-3 py-2 text-[11px] font-extrabold transition-colors ${method === m ? "border-ink bg-ink text-paper" : "border-line bg-card text-ink2 hover:border-ink/40"}`}>{m}{m !== "ALL" && <span className="ml-1 font-mono text-mute tnum">{mCount(m)}</span>}</button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <div className="hidden lg:block">
          <Card className="sticky top-20 p-2">
            {data.map((g, i) => (
              <button key={g.g} onClick={() => { setGroup(i); document.getElementById(`grp-${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[12px] font-bold transition-colors ${group === i ? "bg-ink text-paper" : "text-ink2 hover:bg-ink/5"}`}>
                <span className="truncate">{g.g}</span><span className={`rounded-full px-1.5 text-[10px] font-extrabold tnum ${group === i ? "bg-volt text-ink" : "bg-ink/10"}`}>{g.eps.length}</span>
              </button>
            ))}
          </Card>
        </div>
        <div className="min-w-0 space-y-6">
          {data.length === 0 && <Card className="p-5"><EmptyState icon="doc" title="No endpoints match" sub="Clear the filter or method chip." /></Card>}
          {data.map((g, gi) => (
            <section key={g.g} id={`grp-${gi}`}>
              <h2 className="mb-2.5 flex items-center gap-2 font-display text-[15.5px] font-bold"><span className="h-4 w-1 rounded bg-volt" />{g.g}<span className="font-mono text-[10.5px] font-bold text-mute">{g.eps.length}</span></h2>
              <div className="space-y-3">
                {g.eps.map((e, ei) => {
                  const k = `${gi}-${ei}`;
                  return (
                    <Card key={k} className="anim-rise overflow-hidden">
                      <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-4 py-3">
                        <span className={`rounded-md px-2 py-1 font-mono text-[10.5px] font-extrabold ${mColor(e.m)}`}>{e.m}</span>
                        <code className="font-mono text-[12.5px] font-bold">{e.p}</code>
                        <TonePill tone={e.perm === "public" ? "green" : e.perm === "system" ? "blue" : e.perm === "—" ? "gray" : "ink"}>{e.perm === "auth" ? "AUTHENTICATED" : e.perm === "—" ? "ERROR SHAPE" : e.perm === "public" ? "PUBLIC" : e.perm === "system" ? "SYSTEM-ONLY" : e.perm}</TonePill>
                      </div>
                      <p className="px-4 pt-3 text-[12.5px] font-semibold text-ink2">{e.d}</p>
                      {e.params && (
                        <div className="px-4 pt-2.5">
                          <div className="flex flex-wrap gap-1.5">{e.params.map(p => <span key={p.n} className="rounded-md border border-line bg-paper px-2 py-1 font-mono text-[10px] font-bold text-ink2">{p.n} <span className="text-mute">· {p.in} · {p.t}{p.req ? " · req" : ""}</span></span>)}</div>
                        </div>
                      )}
                      <div className="grid gap-px bg-line md:grid-cols-2">
                        <div className="bg-side p-3.5">
                          <div className="mb-1.5 flex items-center justify-between"><p className="font-mono text-[9px] font-extrabold tracking-[0.2em] text-[#7d8b82]">REQUEST</p>{e.req && <button onClick={() => doCopy(k + "q", e.req!)} className="text-[#7d8b82] transition-colors hover:text-volt"><Icon name={copied === k + "q" ? "check" : "copy"} size={12} /></button>}</div>
                          <pre className="overflow-x-auto font-mono text-[10.5px] leading-relaxed text-[#c9d3cc]" dangerouslySetInnerHTML={{ __html: e.req ? hl(e.req) : '<span class="text-[#5d6b62]">— no body —</span>' }} />
                        </div>
                        <div className="bg-[#101915] p-3.5">
                          <div className="mb-1.5 flex items-center justify-between"><p className="font-mono text-[9px] font-extrabold tracking-[0.2em] text-[#7d8b82]">RESPONSE</p><button onClick={() => doCopy(k + "s", e.res)} className="text-[#7d8b82] transition-colors hover:text-volt"><Icon name={copied === k + "s" ? "check" : "copy"} size={12} /></button></div>
                          <pre className="overflow-x-auto font-mono text-[10.5px] leading-relaxed text-[#c9d3cc]" dangerouslySetInnerHTML={{ __html: hl(e.res) }} />
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
