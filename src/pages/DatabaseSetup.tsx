import { useEffect, useMemo, useRef, useState } from "react";
import type { DbConfig, OpType } from "../lib/types";
import { STAGES } from "../lib/types";
import { useStore } from "../lib/store";
import { Btn, Card, Field, Icon, Modal, SectionHead, Select, TextInput } from "../components/ui";

type LogKind = "cmd" | "ok" | "err" | "info" | "dim";
interface LogLine { t: string; k: LogKind }

const DEFAULTS: DbConfig = {
  host: "127.0.0.1", port: 3306, database: "zadmin", username: "zadmin_app",
  password: "", charset: "utf8mb4", collation: "utf8mb4_unicode_ci", prefix: "", ssl: false,
};

const SYSTEM_SCHEMAS = ["mysql", "information_schema", "performance_schema", "sys"];

const MIGRATIONS: { file: string; tag: string; tables: { name: string; cols: [string, string, string?][] }[] }[] = [
  {
    file: "2026_01_01_000001_create_rbac_and_catalog_tables.php", tag: "RBAC & CATALOG",
    tables: [
      { name: "users", cols: [["id", "bigint", "PK"], ["name", "varchar(120)"], ["email", "varchar(190)", "UQ"], ["password", "varchar(255)"], ["employee_code", "varchar(20)", "UQ"], ["is_active", "tinyint(1)"]] },
      { name: "roles", cols: [["id", "bigint", "PK"], ["name", "varchar(30)", "UQ"], ["label", "varchar(60)"], ["is_system", "tinyint(1)"]] },
      { name: "permissions", cols: [["id", "bigint", "PK"], ["name", "varchar(60)", "UQ"], ["group", "varchar(40)"], ["label", "varchar(120)"]] },
      { name: "role_user", cols: [["role_id", "bigint", "FK"], ["user_id", "bigint", "FK"]] },
      { name: "permission_role", cols: [["permission_id", "bigint", "FK"], ["role_id", "bigint", "FK"]] },
      { name: "delegations", cols: [["id", "bigint", "PK"], ["delegator_id", "bigint", "FK"], ["delegate_id", "bigint", "FK"], ["starts_on", "date"], ["ends_on", "date"], ["status", "varchar(15)"]] },
      { name: "facilities", cols: [["id", "bigint", "PK"], ["zvend_facility_id", "varchar(40)", "UQ"], ["code", "varchar(20)", "UQ"], ["name", "varchar(120)"], ["status", "varchar(15)"], ["last_synced_at", "timestamp"]] },
      { name: "customers", cols: [["id", "bigint", "PK"], ["facility_id", "bigint", "FK"], ["name", "varchar(120)"], ["phone", "varchar(30)"], ["zvend_customer_id", "varchar(40)"]] },
      { name: "meters", cols: [["id", "bigint", "PK"], ["meter_number", "varchar(30)", "UQ"], ["facility_id", "bigint", "FK"], ["customer_id", "bigint", "FK"], ["status", "varchar(20)"]] },
    ],
  },
  {
    file: "2026_01_01_000002_create_operation_and_workflow_tables.php", tag: "OPERATIONS & WORKFLOW",
    tables: [
      { name: "meter_installations", cols: [["id", "bigint", "PK"], ["txn", "varchar(40)", "UQ"], ["status", "varchar(30)"], ["current_stage", "varchar(30)"], ["meter_number", "varchar(30)"], ["tamper_code", "text", "ENC"], ["clear_code", "text", "ENC"]] },
      { name: "meter_activations", cols: [["id", "bigint", "PK"], ["txn", "varchar(40)", "UQ"], ["status", "varchar(30)"], ["customer_name", "varchar(120)"], ["technical_comment", "text"]] },
      { name: "meter_inspections", cols: [["id", "bigint", "PK"], ["txn", "varchar(40)", "UQ"], ["scheduled_by_id", "bigint", "FK"], ["duration_seconds", "smallint"], ["video_path", "varchar(255)"], ["observations", "text"]] },
      { name: "tamper_code_requests", cols: [["id", "bigint", "PK"], ["txn", "varchar(40)", "UQ"], ["requested_via", "varchar(10)"], ["issued_code", "text", "ENC"]] },
      { name: "clear_code_requests", cols: [["id", "bigint", "PK"], ["txn", "varchar(40)", "UQ"], ["requested_via", "varchar(10)"], ["issued_code", "text", "ENC"]] },
      { name: "workflow_steps", cols: [["id", "bigint", "PK"], ["operation_type", "varchar(30)"], ["operation_id", "bigint"], ["stage_key", "varchar(30)"], ["decision", "varchar(20)"], ["is_current", "tinyint(1)"]] },
      { name: "workflow_comments", cols: [["id", "bigint", "PK"], ["transaction_id", "varchar(40)"], ["user_id", "bigint", "FK"], ["role", "varchar(30)"], ["comment", "text"]] },
      { name: "operation_attachments", cols: [["id", "bigint", "PK"], ["kind", "varchar(15)"], ["disk", "varchar(20)"], ["path", "varchar(255)"], ["checksum", "varchar(64)"]] },
      { name: "gps_records", cols: [["id", "bigint", "PK"], ["latitude", "decimal(10,7)"], ["longitude", "decimal(11,7)"], ["accuracy_m", "decimal(8,2)"], ["accepted", "tinyint(1)"]] },
    ],
  },
  {
    file: "2026_01_01_000003_create_integration_and_system_tables.php", tag: "INTEGRATION & SYSTEM",
    tables: [
      { name: "api_settings", cols: [["id", "bigint", "PK"], ["key", "varchar(60)", "UQ"], ["value", "text", "ENC"], ["is_secret", "tinyint(1)"]] },
      { name: "api_requests", cols: [["id", "bigint", "PK"], ["endpoint", "varchar(255)"], ["idempotency_key", "varchar(128)", "UQ"], ["status", "varchar(15)"], ["duration_ms", "int"]] },
      { name: "api_responses", cols: [["id", "bigint", "PK"], ["api_request_id", "bigint", "FK"], ["response_code", "varchar(10)"], ["response_body", "json"]] },
      { name: "idempotency_keys", cols: [["id", "bigint", "PK"], ["key", "varchar(128)", "UQ"], ["purpose", "varchar(40)"], ["response_snapshot", "json"]] },
      { name: "sync_logs", cols: [["id", "bigint", "PK"], ["entity", "varchar(30)"], ["records_processed", "int"], ["records_failed", "int"], ["status", "varchar(15)"]] },
      { name: "notifications", cols: [["id", "char(36)", "PK"], ["for_role", "varchar(30)"], ["kind", "varchar(20)"], ["title", "varchar(150)"], ["read_at", "timestamp"]] },
      { name: "audit_logs", cols: [["id", "bigint", "PK"], ["action", "varchar(50)"], ["user_name", "varchar(120)"], ["detail", "text"], ["transaction_id", "varchar(40)"]] },
      { name: "system_settings", cols: [["id", "bigint", "PK"], ["key", "varchar(60)", "UQ"], ["value", "json"], ["group", "varchar(30)"]] },
      { name: "jobs", cols: [["id", "bigint", "PK"], ["queue", "varchar(255)"], ["payload", "longtext"], ["attempts", "tinyint"]] },
      { name: "failed_jobs", cols: [["id", "bigint", "PK"], ["uuid", "varchar(255)", "UQ"], ["exception", "longtext"]] },
      { name: "personal_access_tokens", cols: [["id", "bigint", "PK"], ["token", "varchar(64)", "UQ"], ["abilities", "text"], ["expires_at", "timestamp"]] },
    ],
  },
];

const TABLE_COUNT = MIGRATIONS.reduce((a, m) => a + m.tables.length, 0) + 1; // + migrations

const lineColor: Record<LogKind, string> = {
  cmd: "text-[#e8e4d8]", ok: "text-[#7dd8a5]", err: "text-[#f2a196]", info: "text-[#c9d4cc]", dim: "text-[#66756b]",
};

export default function DatabaseSetupPage() {
  const { state, user, saveSettings, toast } = useStore();
  const saved = state.settings.db;

  const [cfg, setCfg] = useState<DbConfig>(saved ?? DEFAULTS);
  const [showPw, setShowPw] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState(false);
  const [testState, setTestState] = useState<null | "ok" | "fail">(saved?.connected ? "ok" : null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([
    { t: "# Z Admin · MySQL setup console", k: "dim" },
    { t: saved?.connected ? `# session restored — ${saved.username}@${saved.host}:${saved.port}/${saved.database} (schema ${saved.schemaInstalled ? "installed" : "not installed"})` : "# configure a connection below, then run migrations + seeders", k: "dim" },
  ]);
  const [schemaQ, setSchemaQ] = useState("");
  const [openTable, setOpenTable] = useState<string | null>(null);
  const [confirmDrop, setConfirmDrop] = useState(false);

  const consoleRef = useRef<HTMLDivElement>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    const el = consoleRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  const push = (t: string, k: LogKind = "info") => { if (alive.current) setLogs(l => [...l.slice(-160), { t, k }]); };
  const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

  const set = <K extends keyof DbConfig>(k: K, v: DbConfig[K]) => setCfg(c => ({ ...c, [k]: v }));
  const connString = `mysql://${cfg.username || "user"}@${cfg.host || "host"}:${cfg.port}/${cfg.database || "db"}`;

  // ------------------------------------------------ validation
  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!/^([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+$/.test(cfg.host.trim())) e.host = "Enter a valid hostname or IP address.";
    if (!(cfg.port >= 1 && cfg.port <= 65535)) e.port = "Port must be 1–65535.";
    if (!/^[A-Za-z0-9_]{1,64}$/.test(cfg.database.trim())) e.database = "Letters, digits and underscores only (max 64).";
    if (SYSTEM_SCHEMAS.includes(cfg.database.trim().toLowerCase())) e.database = "System schema — access will be denied.";
    if (!cfg.username.trim()) e.username = "Username is required.";
    if (cfg.password.length < 8) e.password = "Minimum 8 characters.";
    setErrs(e);
    if (Object.keys(e).length) toast("Fix the highlighted connection fields.", "danger");
    return Object.keys(e).length === 0;
  };

  // ------------------------------------------------ connection test
  const runTest = async () => {
    if (!validate() || testing || busy) return;
    setTesting(true); setTestState(null);
    setLogs([]);
    push(`$ mysql --host=${cfg.host} --port=${cfg.port} --user=${cfg.username} --database=${cfg.database}`, "cmd");
    await sleep(420); push(`→ Resolving ${cfg.host} … ok (${8 + Math.floor(Math.random() * 14)} ms)`, "dim");
    await sleep(380); push(`→ TCP handshake ${cfg.host}:${cfg.port} … ok (${12 + Math.floor(Math.random() * 22)} ms)`, "dim");
    await sleep(430); push(`→ Authenticating '${cfg.username}' … ok`, "dim");
    await sleep(300);
    if (SYSTEM_SCHEMAS.includes(cfg.database.trim().toLowerCase())) {
      await sleep(240);
      push(`✗ ERROR 1044 (42000): Access denied for user '${cfg.username}'@'${cfg.host}' to database '${cfg.database}'`, "err");
      setTestState("fail"); setTesting(false);
      toast("Connection rejected — system schemas are protected.", "danger");
      return;
    }
    push("→ SELECT 1 … ok", "dim");
    await sleep(340);
    push("✓ Connected to MySQL 8.0.41 · protocol 10 · charset utf8mb4 · engine InnoDB", "ok");
    if (!saved?.schemaInstalled) push("ℹ schema not installed yet — run migrations below", "info");
    else push(`ℹ schema installed (${TABLE_COUNT} tables) · seed ${saved?.seededAt ? "present" : "missing"}`, "info");
    setTestState("ok"); setTesting(false);
    toast(`Connection verified · ${cfg.host}:${cfg.port}`, "ok");
  };

  const saveConfig = () => {
    if (testState !== "ok") { toast("Run a successful connection test first.", "danger"); return; }
    saveSettings({ db: { ...cfg, connected: true, testedAt: Date.now(), serverVersion: "8.0.41", schemaInstalled: saved?.schemaInstalled, migratedAt: saved?.migratedAt, seededAt: saved?.seededAt } });
    push(`# configuration saved to settings (audited) — ${connString}`, "info");
  };

  // ------------------------------------------------ migrations & seeders
  const runMigrations = async () => {
    if (!saved?.connected) { toast("Save a verified connection first.", "danger"); return; }
    if (busy) return;
    setBusy(true); setProgress({ done: 0, total: TABLE_COUNT });
    push("", "dim");
    push("$ php artisan migrate --force", "cmd");
    await sleep(380);
    push("Migration table created successfully.", "dim");
    setProgress(p => p && { ...p, done: 1 });
    let done = 1;
    for (const m of MIGRATIONS) {
      await sleep(260);
      push(`Migrating: ${m.file}`, "info");
      for (const t of m.tables) {
        await sleep(52);
        push(`  ✓ Created table ${t.name} (${t.cols.length} columns)`, "ok");
        done++; setProgress({ done, total: TABLE_COUNT });
      }
      push(`Migrated:  ${m.file}`, "dim");
    }
    await sleep(240);
    push(`✓ Migrated ${MIGRATIONS.length} files · ${TABLE_COUNT} tables · 0 failed`, "ok");
    saveSettings({ db: { ...saved, schemaInstalled: true, migratedAt: Date.now() } });
    setBusy(false); setProgress(null);
    toast(`${TABLE_COUNT} tables created successfully`, "ok");
  };

  const runSeeders = async () => {
    if (!saved?.connected) { toast("Save a verified connection first.", "danger"); return; }
    if (!saved?.schemaInstalled) { toast("Run migrations before seeding.", "danger"); return; }
    if (busy) return;
    setBusy(true);
    push("", "dim");
    push("$ php artisan db:seed --force", "cmd");
    await sleep(360); push("Seeding: RolePermissionSeeder", "info");
    await sleep(420); push("  ✓ 7 roles · 51 permissions · role→permission matrix synced", "ok");
    await sleep(340); push("Seeding: DemoUserSeeder", "info");
    await sleep(400); push("  ✓ 7 users created (one per role, password 'password')", "ok");
    await sleep(340); push("Seeding: DemoDataSeeder", "info");
    await sleep(460); push("  ✓ 6 facilities · 6 customers · 8 meters", "ok");
    await sleep(380); push(`  ✓ sample workflows seeded (PENDING / SCHEDULED / COMPLETED stages)`, "ok");
    await sleep(260); push("✓ Database seeding completed successfully", "ok");
    saveSettings({ db: { ...saved, seededAt: Date.now() } });
    setBusy(false);
    toast("Demo data seeded", "ok");
  };

  const dropSchema = async () => {
    setConfirmDrop(false);
    if (busy) return;
    setBusy(true);
    push("", "dim");
    push("$ php artisan db:wipe --force", "cmd");
    await sleep(320);
    for (const m of [...MIGRATIONS].reverse()) for (const t of [...m.tables].reverse()) {
      await sleep(16);
      push(`  ✗ Dropped table ${t.name}`, "err");
    }
    await sleep(240);
    push(`✓ ${TABLE_COUNT} tables dropped — schema removed (operational data in this demo is unaffected)`, "ok");
    const s = saved!;
    const { migratedAt: _m, seededAt: _sd, ...rest } = s;
    saveSettings({ db: { ...rest, schemaInstalled: false } });
    setBusy(false);
    toast("Schema dropped", "ok");
  };

  // ------------------------------------------------ live stats
  const opsCount = (t: OpType) => state.operations.filter(o => o.type === t).length;
  const liveRows = (name: string): number => {
    switch (name) {
      case "users": return state.users.length;
      case "roles": return 7;
      case "permissions": return 51;
      case "role_user": return state.users.length;
      case "permission_role": return 232;
      case "delegations": return state.delegations.length > 0 ? 1 : 0;
      case "facilities": return state.facilities.length;
      case "customers": return state.customers.length;
      case "meters": return state.meters.length;
      case "meter_installations": return opsCount("installation");
      case "meter_activations": return opsCount("activation");
      case "meter_inspections": return opsCount("inspection");
      case "tamper_code_requests": return opsCount("tamper");
      case "clear_code_requests": return opsCount("clear");
      case "workflow_steps": return state.operations.reduce((a, o) => a + STAGES[o.type].length, 0);
      case "workflow_comments": return state.operations.reduce((a, o) => a + (o.comments?.length ?? 0), 0);
      case "operation_attachments": return state.operations.reduce((a, o) => a + ((o.photos?.length ?? 0) + (o.video ? 1 : 0)), 0);
      case "gps_records": return state.operations.reduce((a, o) => a + (o.gps ? 1 : 0), 0);
      case "audit_logs": return state.audit.length;
      case "api_requests": return state.apiLogs.length;
      case "api_responses": return state.apiLogs.filter(l => l.responseCode).length;
      case "notifications": return state.notifications.length;
      case "system_settings": return Object.keys(state.settings).length;
      case "idempotency_keys": return state.operations.filter(o => o.zvend).length;
      case "sync_logs": return 3;
      case "api_settings": return 4;
      case "personal_access_tokens": return state.users.length;
      case "migrations": return saved?.schemaInstalled ? 3 : 0;
      default: return 0;
    }
  };
  const totalRows = useMemo(() => MIGRATIONS.reduce((a, m) => a + m.tables.reduce((b, t) => b + liveRows(t.name), 0), 0) + (saved?.schemaInstalled ? 3 : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, saved?.schemaInstalled]);
  const sizeKb = Math.round(totalRows * 0.42 * 10) / 10;

  const pwScore = cfg.password.length === 0 ? 0 : cfg.password.length < 8 ? 1 : cfg.password.length < 12 ? 2 : 3;
  const pwLabel = ["", "WEAK", "FAIR", "STRONG"][pwScore];
  const pwColor = ["bg-line2", "bg-danger", "bg-volt", "bg-ok"][pwScore];

  const envText = [
    "DB_CONNECTION=mysql",
    `DB_HOST=${cfg.host}`,
    `DB_PORT=${cfg.port}`,
    `DB_DATABASE=${cfg.database}`,
    `DB_USERNAME=${cfg.username}`,
    `DB_PASSWORD=${cfg.password ? "••••••••" : ""}`,
    "",
    "SESSION_DRIVER=database",
    "CACHE_STORE=database",
    "QUEUE_CONNECTION=database",
    "FILESYSTEM_DISK=local",
  ].join("\n");

  const copyEnv = async () => {
    try { await navigator.clipboard.writeText(envText); toast(".env block copied", "ok"); }
    catch { toast("Clipboard unavailable", "danger"); }
  };

  if (!user || user.role !== "SUPER_ADMIN") {
    return (
      <Card className="mx-auto max-w-xl p-6 text-center anim-rise">
        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-dangersoft text-danger"><Icon name="lock" size={20} /></span>
        <h2 className="font-display text-[17px] font-bold">Super Admin only</h2>
        <p className="mx-auto mt-1.5 max-w-md text-[12.5px] text-mute">Database setup is emergency administration. Sign in as the Super Admin to configure the MySQL connection, schema and seed data.</p>
      </Card>
    );
  }

  const connected = !!saved?.connected;
  const installed = !!saved?.schemaInstalled;
  const seeded = !!saved?.seededAt;

  return (
    <div className="mx-auto max-w-[1240px] space-y-4">
      <SectionHead
        title="MySQL Database"
        sub="Connection, schema and seed setup — Super Admin only. Every action is written to the audit log."
        right={
          <span className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[11.5px] font-extrabold ${connected ? "border-[#c2ddcd] bg-oksoft text-ok" : "border-[#eac5be] bg-dangersoft text-danger"}`}>
            <span className={`h-2 w-2 rounded-full ${connected ? "bg-ok okdot" : "bg-danger livedot"}`} />
            {connected ? `CONNECTED · ${saved?.host}:${saved?.port}` : "NOT CONNECTED"}
          </span>
        }
      />

      {/* stat strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "CONNECTION", value: connected ? "LIVE" : "DOWN", tone: connected ? "text-ok" : "text-danger" },
          { label: "SERVER", value: connected ? saved?.serverVersion ?? "8.0.41" : "—", tone: "text-ink" },
          { label: "TABLES", value: installed ? String(TABLE_COUNT) : "0", tone: installed ? "text-ink" : "text-mute" },
          { label: "DATA SIZE", value: installed ? (sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`) : "—", tone: "text-ink" },
        ].map((s, i) => (
          <Card key={s.label} className="anim-rise p-4" >
            <p className="text-[9.5px] font-extrabold tracking-[0.16em] text-mute">{s.label}</p>
            <p className={`mt-1 font-display text-[26px] font-bold leading-none tnum ${s.tone}`} style={{ animationDelay: `${i * 40}ms` }}>{s.value}</p>
            {s.label === "TABLES" && installed && <p className="mt-1 text-[10px] font-bold text-mute tnum">{totalRows} rows across 3 migrations</p>}
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,460px)_1fr]">
        {/* connection card */}
        <Card className="anim-rise self-start">
          <div className="border-b border-line px-4 py-3">
            <h2 className="font-display text-[15.5px] font-bold">Connection parameters</h2>
            <div className="mt-2 flex items-center gap-2 rounded-md bg-side px-3 py-2">
              <Icon name="db" size={13} className="shrink-0 text-volt" />
              <code className="truncate font-mono text-[11px] font-bold text-[#d8e2da]">{connString}</code>
            </div>
          </div>
          <div className="space-y-3 p-4">
            <div className="grid grid-cols-[1fr_110px] gap-3">
              <Field label="Host" error={errs.host}><TextInput value={cfg.host} onChange={e => set("host", e.target.value)} placeholder="127.0.0.1" className="font-mono" /></Field>
              <Field label="Port" error={errs.port}><TextInput value={String(cfg.port)} onChange={e => set("port", parseInt(e.target.value.replace(/\D/g, "") || "0", 10))} className="font-mono" /></Field>
            </div>
            <Field label="Database" error={errs.database}><TextInput value={cfg.database} onChange={e => set("database", e.target.value)} placeholder="zadmin" className="font-mono" /></Field>
            <Field label="Username" error={errs.username}><TextInput value={cfg.username} onChange={e => set("username", e.target.value)} placeholder="zadmin_app" className="font-mono" /></Field>
            <Field label="Password" error={errs.password} hint={cfg.password ? undefined : "Stored encrypted via APP_KEY — never written to logs."}>
              <div className="relative">
                <TextInput type={showPw ? "text" : "password"} value={cfg.password} onChange={e => set("password", e.target.value)} placeholder="••••••••" className="pr-9 font-mono" />
                <button onClick={() => setShowPw(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-mute transition-colors hover:text-ink" aria-label="Toggle password">
                  <Icon name={showPw ? "x" : "doc"} size={14} />
                </button>
              </div>
              {cfg.password && (
                <span className="mt-1.5 flex items-center gap-2">
                  <span className="flex gap-1">{[1, 2, 3].map(i => <span key={i} className={`h-1 w-8 rounded-full ${pwScore >= i ? pwColor : "bg-line"}`} />)}</span>
                  <span className={`text-[9.5px] font-extrabold tracking-wider ${pwScore === 1 ? "text-danger" : pwScore === 2 ? "text-warn" : "text-ok"}`}>{pwLabel}</span>
                </span>
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Charset"><Select value={cfg.charset} onChange={e => set("charset", e.target.value)}><option>utf8mb4</option><option>utf8mb3</option><option>latin1</option></Select></Field>
              <Field label="Collation"><Select value={cfg.collation} onChange={e => set("collation", e.target.value)}><option>utf8mb4_unicode_ci</option><option>utf8mb4_0900_ai_ci</option><option>utf8mb4_general_ci</option></Select></Field>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-line bg-paper px-3 py-2.5">
              <span className="text-[12px] font-bold">SSL / TLS transport</span>
              <button onClick={() => set("ssl", !cfg.ssl)} className={`relative h-5.5 w-10 rounded-full transition-colors ${cfg.ssl ? "bg-ok" : "bg-line2"}`} style={{ height: 22 }}>
                <span className={`absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-all ${cfg.ssl ? "left-[21px]" : "left-[3px]"}`} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Btn variant="primary" icon="plug" loading={testing} onClick={runTest} disabled={busy}>{testState === "ok" ? "Re-test connection" : "Test connection"}</Btn>
              <Btn variant="volt" icon="check" onClick={saveConfig} disabled={testState !== "ok" || busy}>Save configuration</Btn>
              <Btn variant="ghost" onClick={() => { setCfg(DEFAULTS); setErrs({}); setTestState(null); }} disabled={busy}>Defaults</Btn>
              <Btn variant="ghost" className="text-danger" disabled={!connected || busy} onClick={() => { saveSettings({ db: undefined }); setTestState(null); push("# configuration cleared — connection removed", "err"); toast("Connection configuration removed", "ok"); }}>Disconnect</Btn>
            </div>
          </div>
        </Card>

        {/* console card */}
        <Card className="anim-rise flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="flex gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-[#e0837a]" /><span className="h-2.5 w-2.5 rounded-full bg-volt" /><span className="h-2.5 w-2.5 rounded-full bg-ok" /></span>
              <h2 className="font-display text-[15.5px] font-bold">artisan console</h2>
            </div>
            <div className="flex gap-2">
              <Btn size="sm" variant="primary" icon="list" loading={busy && !!progress} disabled={!connected || busy || installed} onClick={runMigrations}>{installed ? "Migrated" : "Run migrations"}</Btn>
              <Btn size="sm" variant="volt" icon="users" loading={busy && !progress} disabled={!installed || busy} onClick={runSeeders}>{seeded ? "Re-seed" : "Run seeders"}</Btn>
              <Btn size="sm" variant="ghost" className="text-danger" disabled={!installed || busy} onClick={() => setConfirmDrop(true)}>Drop</Btn>
            </div>
          </div>
          {progress && (
            <div className="h-1 w-full bg-line">
              <div className="anim-bar h-full bg-volt transition-all duration-150" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
          )}
          <div ref={consoleRef} className="bg-circuit relative min-h-[380px] flex-1 overflow-y-auto bg-side px-4 py-3 font-mono text-[11.5px] leading-[1.75]">
            {logs.map((l, i) => (
              <div key={i} className={`anim-fade whitespace-pre-wrap break-all ${lineColor[l.k]}`}>{l.t || "\u00A0"}</div>
            ))}
            <div className="flex items-center gap-1.5 text-[#93a29a]">
              <span className="text-volt">zadmin@mysql</span>
              <span className="recblink inline-block h-3.5 w-2 bg-volt" />
            </div>
          </div>
        </Card>
      </div>

      {/* schema browser + env/danger */}
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card className="anim-rise">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
            <h2 className="font-display text-[15.5px] font-bold">Schema {installed && <span className="ml-1 text-[11px] font-bold text-mute tnum">· {TABLE_COUNT} tables · InnoDB · {cfg.collation}</span>}</h2>
            <div className="relative w-56">
              <Icon name="search" size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-mute" />
              <TextInput value={schemaQ} onChange={e => setSchemaQ(e.target.value)} placeholder="Filter tables…" className="pl-7.5" style={{ paddingLeft: 30 }} />
            </div>
          </div>
          {!installed ? (
            <div className="p-8 text-center">
              <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-ink/6 text-mute"><Icon name="db" size={20} /></span>
              <p className="font-display text-[14.5px] font-bold">Schema not installed</p>
              <p className="mt-1 text-[12px] text-mute">Connect, then run migrations to create the {TABLE_COUNT} tables. Row counts below are live once the schema exists.</p>
            </div>
          ) : (
            <div className="max-h-[440px] overflow-y-auto">
              {MIGRATIONS.map(m => {
                const tables = m.tables.filter(t => t.name.includes(schemaQ.trim().toLowerCase()));
                if (!tables.length) return null;
                return (
                  <div key={m.file}>
                    <p className="sticky top-0 z-10 border-b border-line bg-paper px-4 py-1.5 text-[9.5px] font-extrabold tracking-[0.16em] text-volt2">{m.tag} · <span className="text-mute normal-case">{m.file}</span></p>
                    {tables.map(t => {
                      const rows = liveRows(t.name);
                      const open = openTable === t.name;
                      return (
                        <div key={t.name} className="border-b border-line/60 last:border-0">
                          <button onClick={() => setOpenTable(open ? null : t.name)} className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-paper">
                            <Icon name="db" size={13} className="text-mute" />
                            <span className="font-mono text-[12px] font-bold">{t.name}</span>
                            <span className="ml-auto flex items-center gap-3">
                              <span className="font-mono text-[10.5px] text-mute tnum">{rows} rows</span>
                              <Icon name="chevD" size={13} className={`text-mute transition-transform ${open ? "rotate-180" : ""}`} />
                            </span>
                          </button>
                          {open && (
                            <div className="anim-fade flex flex-wrap gap-1.5 bg-paper/70 px-4 py-2.5">
                              {t.cols.map(([n, ty, key]) => (
                                <span key={n} className="flex items-center gap-1.5 rounded-md border border-line bg-card px-2 py-1 font-mono text-[10.5px]">
                                  <span className="font-bold">{n}</span>
                                  <span className="text-mute">{ty}</span>
                                  {key && <span className={`rounded px-1 text-[8.5px] font-extrabold ${key === "PK" ? "bg-volt text-ink" : key === "UQ" ? "bg-infosoft text-info" : key === "ENC" ? "bg-dangersoft text-danger" : "bg-tealsoft text-teal"}`}>{key}</span>}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card className="anim-rise">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="font-display text-[14.5px] font-bold">Generated .env</h2>
              <Btn size="sm" variant="ghost" icon="copy" onClick={copyEnv}>Copy</Btn>
            </div>
            <pre className="overflow-x-auto bg-side px-4 py-3 font-mono text-[11px] leading-[1.8] text-[#c9d4cc]">{envText}</pre>
          </Card>

          <Card className="anim-rise border-[#eac5be]">
            <div className="border-b border-[#eac5be] px-4 py-3"><h2 className="font-display text-[14.5px] font-bold text-danger">Danger zone</h2></div>
            <div className="space-y-2.5 p-4">
              <p className="text-[11.5px] leading-relaxed text-mute">Dropping the schema removes all {TABLE_COUNT} tables. Operational records in Z Admin are never physically deleted by application code — this tool is infrastructure-level and fully audited.</p>
              <Btn variant="outline" className="w-full border-[#eac5be] text-danger" icon="alert" disabled={!installed || busy} onClick={() => setConfirmDrop(true)}>Drop & rebuild schema</Btn>
            </div>
          </Card>
        </div>
      </div>

      <Modal open={confirmDrop} onClose={() => setConfirmDrop(false)} title="Drop entire schema?">
        <div className="space-y-4">
          <p className="text-[13px] leading-relaxed text-ink2">This runs <code className="rounded bg-paper px-1.5 py-0.5 font-mono text-[11.5px] font-bold">php artisan db:wipe</code> against <span className="font-bold">{connString}</span> — all {TABLE_COUNT} tables will be dropped. Migrations and seeders must be re-run afterwards.</p>
          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setConfirmDrop(false)}>Cancel</Btn>
            <Btn variant="danger" icon="alert" onClick={dropSchema}>Yes, drop schema</Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
