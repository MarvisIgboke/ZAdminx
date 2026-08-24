import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { fmtDT, useStore } from "../lib/core";
import { Btn, copyText, Icon, TonePill, useRoute } from "../components/ui";

/* ------------------------------------------------------------------ */
/* Contract data — mirrors App\Services\ZVendApiService (Laravel).     */
/* ------------------------------------------------------------------ */
type Ep = {
  id: string; method: "GET" | "POST"; path: string; group: "Catalog" | "Meter Operations" | "Vending";
  desc: string; request: unknown; response: unknown; notes?: string; callable: boolean;
};

const ENDPOINTS: Ep[] = [
  {
    id: "facilities", method: "GET", path: "/v1/facilities", group: "Catalog", callable: true,
    desc: "List every facility ZVend knows about. Z Admin pulls this into its own catalog on Refresh From ZVend.",
    request: null,
    response: {
      response_code: "00",
      data: [
        { id: "ZV-FAC-IKY", code: "FAC-IKY", name: "Ikoyi Head Office", city: "Lagos", state: "Lagos", status: "ACTIVE", latitude: 6.4432, longitude: 3.4186 },
        { id: "ZV-FAC-LEK", code: "FAC-LEK", name: "Lekki Service Yard", city: "Lekki", state: "Lagos", status: "ACTIVE", latitude: 6.4478, longitude: 3.4721 },
      ],
      meta: { total: 6, synced_at: "2026-02-13T09:00:00Z" },
    },
    notes: "No request body. Facility code (e.g. FAC-IKY) is the stable key Z Admin sends back in operation calls.",
  },
  {
    id: "fac-customers", method: "GET", path: "/v1/facilities/{facility}/customers", group: "Catalog", callable: true,
    desc: "Customers registered at a facility. One customer may hold multiple meters — names are never globally unique.",
    request: null,
    response: {
      response_code: "00",
      data: [
        { id: "ZV-CUST-011", name: "John Joe", phone: "08031112222", email: "john.joe@mail.com", meters: 2 },
        { id: "ZV-CUST-014", name: "Adaeze Umeh", phone: "08055554444", email: "adaeze@mail.com", meters: 1 },
      ],
    },
    notes: "Replace {facility} with the facility code. Pagination via ?page=&per_page=.",
  },
  {
    id: "fac-meters", method: "GET", path: "/v1/facilities/{facility}/meters", group: "Catalog", callable: true,
    desc: "All meters bound to a facility, with lifecycle status.",
    request: null,
    response: {
      response_code: "00",
      data: [
        { meter_number: "45039812990", model: "ZRX-K1 Prepaid", phase: "single", status: "ACTIVE", installed_at: "2026-01-20" },
        { meter_number: "45039813339", model: "ZRX-K1 Prepaid", phase: "single", status: "FAULTY", installed_at: "2025-11-02" },
      ],
    },
  },
  {
    id: "vending-history", method: "GET", path: "/v1/customers/{customer}/vending-history", group: "Catalog", callable: true,
    desc: "Token vending history for a customer, most recent first.",
    request: null,
    response: {
      response_code: "00",
      data: [
        { token: "4821-9930-1147-6620-8873", amount_kwh: 25.5, amount_naira: 12500, vend_date: "2026-02-10" },
        { token: "7714-2208-5561-0934-1290", amount_kwh: 41.0, amount_naira: 20500, vend_date: "2026-01-28" },
      ],
    },
    notes: "Z Admin proxies this straight through on the Customer detail page.",
  },
  {
    id: "funding-history", method: "GET", path: "/v1/customers/{customer}/funding-history", group: "Catalog", callable: true,
    desc: "Wallet funding history for a customer.",
    request: null,
    response: {
      response_code: "00",
      data: [
        { reference: "FND-88112", amount_naira: 20000, channel: "bank_transfer", funded_at: "2026-02-08" },
        { reference: "FND-87450", amount_naira: 50000, channel: "ussd", funded_at: "2026-01-30" },
      ],
    },
  },
  {
    id: "install", method: "POST", path: "/v1/meters/install", group: "Meter Operations", callable: true,
    desc: "Register a NEW meter. Fired only after MD approval. Returns the 20-digit tamper + clear codes.",
    request: { meter_number: "45039813401", facility: "FAC-IKY" },
    response: {
      response_code: "00",
      reference: "ZV-REF-88213",
      tamper_code: "88410293571620483759",
      clear_code: "66291847350219864530",
    },
    notes: "Both codes are 20-digit numerals. Stored encrypted in Z Admin and never written to API logs.",
  },
  {
    id: "activate", method: "POST", path: "/v1/meters/activate", group: "Meter Operations", callable: true,
    desc: "Energize an installed meter with its customer record and field GPS. Fired after MD approval.",
    request: {
      facility: "FAC-IKY", meter_number: "45039813117",
      customer_name: "John Joe", customer_phone: "08031112222", customer_email: "john.joe@mail.com", customer_address: "12 Adeola Close, Ikoyi",
      latitude: 6.443211, longitude: 3.418600,
    },
    response: { response_code: "00", reference: "ZV-REF-88214", status: "energized", token_balance: 0 },
    notes: "Empty fields are dropped before send. latitude/longitude come from the accepted field GPS capture.",
  },
  {
    id: "tamper", method: "POST", path: "/v1/meters/tamper-code", group: "Meter Operations", callable: true,
    desc: "Issue a fresh 20-digit tamper code for a meter after MD approval.",
    request: { meter_number: "45039813339" },
    response: { response_code: "00", reference: "ZV-REF-88215", tamper_code: "11112222333344445555" },
  },
  {
    id: "clear", method: "POST", path: "/v1/meters/clear-code", group: "Meter Operations", callable: true,
    desc: "Issue a fresh 20-digit clear code for a meter after MD approval.",
    request: { meter_number: "45039813339" },
    response: { response_code: "00", reference: "ZV-REF-88216", clear_code: "55554444333322221111" },
  },
  {
    id: "vend", method: "POST", path: "/v1/tokens/vend", group: "Vending", callable: true,
    desc: "Vend a prepaid token against a meter. Z Admin orchestrates the request; ZVend mints the token.",
    request: { meter_number: "45039812990", amount_naira: 5000, payment_reference: "FND-88112" },
    response: { response_code: "00", reference: "ZV-REF-88217", token: "1234-5678-9012-3456-7890", amount_kwh: 10.2 },
  },
];

const HEADERS = [
  ["Authorization", "Bearer {ZVEND_API_TOKEN}"],
  ["Content-Type", "application/json"],
  ["Accept", "application/json"],
  ["Idempotency-Key", "zvend:{transaction}:{attempt}"],
];

/* ------------------------------------------------------------------ */
/* JSON syntax highlighting                                             */
/* ------------------------------------------------------------------ */
function JsonView({ value }: { value: unknown }) {
  const json = JSON.stringify(value, null, 2);
  const nodes: ReactNode[] = [];
  const re = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|(\btrue\b|\bfalse\b|\bnull\b)/g;
  let last = 0; let k = 0; let m: RegExpExecArray | null;
  while ((m = re.exec(json)) !== null) {
    if (m.index > last) nodes.push(<span key={k++} className="text-[#77837a]">{json.slice(last, m.index)}</span>);
    if (m[1] !== undefined) {
      if (m[2] !== undefined) nodes.push(<span key={k++}><span className="text-volt">{m[1]}</span><span className="text-[#77837a]">{m[2]}</span></span>);
      else nodes.push(<span key={k++} className="text-[#82cba1]">{m[1]}</span>);
    } else if (m[3] !== undefined) nodes.push(<span key={k++} className="text-[#84b6e8]">{m[3]}</span>);
    else nodes.push(<span key={k++} className="text-[#d9a066]">{m[4]}</span>);
    last = re.lastIndex;
  }
  if (last < json.length) nodes.push(<span key={k++} className="text-[#77837a]">{json.slice(last)}</span>);
  return <pre className="overflow-x-auto whitespace-pre font-mono text-[11.5px] leading-relaxed">{nodes}</pre>;
}

function CopyBtn({ value, label }: { value: unknown; label: string }) {
  const [done, setDone] = useState(false);
  const { toast } = useStore();
  return (
    <button
      onClick={() => { copyText(JSON.stringify(value, null, 2)); setDone(true); toast(`${label} copied to clipboard`); setTimeout(() => setDone(false), 1400); }}
      className="flex items-center gap-1.5 rounded-md border border-line2 bg-card px-2 py-1 text-[10.5px] font-extrabold text-ink2 transition-all hover:-translate-y-px hover:border-volt hover:text-volt2"
    >
      <Icon name={done ? "check" : "copy"} size={12} className={done ? "text-ok" : ""} /> {done ? "COPIED" : "COPY"}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */
export default function ZVendIntegrationPage() {
  const { state, testZvend, toast } = useStore();
  const { nav } = useRoute();
  const [active, setActive] = useState<string>("install");
  const [showToken, setShowToken] = useState(false);
  const [payload, setPayload] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; code: string; durationMs: number; body: Record<string, unknown>; endpoint: string } | null>(null);
  const [forceFail, setForceFail] = useState(false);

  const ep = ENDPOINTS.find(e => e.id === active)!;
  const zv = state.settings.zvend;
  const groups = useMemo(() => ["Meter Operations", "Catalog", "Vending"] as const, []);
  const recentZvend = state.apiLogs.filter(l => l.endpoint.startsWith("/v1/")).slice(0, 6);
  const healthy = recentZvend.filter(l => l.status === "success").length;

  const select = (id: string) => {
    setActive(id);
    const e = ENDPOINTS.find(x => x.id === id)!;
    setPayload(e.request ? JSON.stringify(e.request, null, 2) : "");
    setResult(null);
  };

  const send = async () => {
    let body: unknown = null;
    if (ep.method === "POST") {
      try { body = payload.trim() ? JSON.parse(payload) : null; }
      catch { toast("Request payload is not valid JSON", "danger"); return; }
    }
    setSending(true); setResult(null);
    const res = await testZvend(ep.path, ep.method, body, forceFail);
    setResult({ ...res, endpoint: ep.path });
    setSending(false);
    toast(res.ok ? `${ep.method} ${ep.path} → ${res.code} in ${res.durationMs} ms` : `ZVend returned ${res.code}`, res.ok ? "ok" : "danger");
  };

  return (
    <div className="mx-auto max-w-[1240px]">
      {/* ---- Connection panel: opens with the integration itself ---- */}
      <div className="anim-rise relative mb-5 overflow-hidden rounded-2xl border border-side3 bg-side text-paper">
        <div className="bg-circuit pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative flex flex-wrap items-center gap-x-8 gap-y-4 px-5 py-4 sm:px-7">
          <div className="flex items-center gap-3">
            <span className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-volt text-ink">
              <Icon name="plug" size={20} />
              <span className="okdot absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-side bg-ok" />
            </span>
            <div>
              <h1 className="font-display text-[19px] font-bold leading-tight tracking-tight">ZVend Integration</h1>
              <p className="text-[11px] font-semibold text-[#93a29a]">External vending platform · dedicated service layer</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-7 gap-y-2 text-[11.5px]">
            <div>
              <p className="text-[9px] font-extrabold tracking-widest text-[#6d7b72]">BASE URL</p>
              <p className="font-mono font-bold text-[#d8e2da]">{zv.baseUrl}</p>
            </div>
            <div>
              <p className="text-[9px] font-extrabold tracking-widest text-[#6d7b72]">API TOKEN</p>
              <button onClick={() => setShowToken(v => !v)} className="flex items-center gap-1.5 font-mono font-bold text-[#d8e2da] transition-colors hover:text-volt">
                <Icon name={showToken ? "eye" : "lock"} size={12} /> {showToken ? "zv_live_9f3kQ2xT81mV" : "zv_live_••••••••"}
              </button>
            </div>
            <div>
              <p className="text-[9px] font-extrabold tracking-widest text-[#6d7b72]">TIMEOUT</p>
              <p className="font-mono font-bold text-[#d8e2da]">{zv.timeout}s</p>
            </div>
            <div>
              <p className="text-[9px] font-extrabold tracking-widest text-[#6d7b72]">RETRIES</p>
              <p className="font-mono font-bold text-[#d8e2da]">{zv.retries}</p>
            </div>
            <div>
              <p className="text-[9px] font-extrabold tracking-widest text-[#6d7b72]">HEALTH</p>
              <p className="flex items-center gap-1.5 font-mono font-bold text-ok"><span className="okdot h-2 w-2 rounded-full bg-ok" /> {healthy}/{Math.max(1, recentZvend.length)} OK</p>
            </div>
          </div>
        </div>
        <div className="relative border-t border-side3 bg-side2/60 px-5 py-2 sm:px-7">
          <p className="text-[10.5px] font-semibold text-[#8b988f]">
            All traffic flows through <span className="font-mono text-[#c9d3cc]">ZVendApiService</span> — never scattered across controllers. Codes are stored encrypted and never logged. Operation calls fire only after MD approval.
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        {/* ---- Endpoint rail ---- */}
        <div className="anim-rise space-y-4">
          {groups.map(g => (
            <div key={g} className="overflow-hidden rounded-xl border border-line bg-card">
              <p className="border-b border-line bg-paper px-3.5 py-2 text-[10px] font-extrabold tracking-[0.16em] text-volt2">{g.toUpperCase()}</p>
              <div className="divide-y divide-line/70">
                {ENDPOINTS.filter(e => e.group === g).map(e => (
                  <button key={e.id} onClick={() => select(e.id)}
                    className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors ${active === e.id ? "bg-voltsoft" : "hover:bg-paper"}`}>
                    <span className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-extrabold ${e.method === "GET" ? "bg-infosoft text-info" : "bg-oksoft text-ok"}`}>{e.method}</span>
                    <span className={`min-w-0 flex-1 truncate font-mono text-[11px] ${active === e.id ? "font-bold text-volt2" : "font-semibold text-ink2"}`}>{e.path}</span>
                    {active === e.id && <Icon name="arrowR" size={13} className="shrink-0 text-volt2" />}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* ---- Detail + tester ---- */}
        <div className="anim-rise space-y-4">
          <div className="rounded-xl border border-line bg-card">
            <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-4 py-3.5">
              <span className={`rounded-md px-2 py-1 font-mono text-[11px] font-extrabold ${ep.method === "GET" ? "bg-infosoft text-info" : "bg-oksoft text-ok"}`}>{ep.method}</span>
              <code className="font-mono text-[15px] font-bold tracking-tight">{zv.baseUrl}{ep.path}</code>
              <TonePill tone="gray">{ep.group.toUpperCase()}</TonePill>
            </div>
            <div className="space-y-4 px-4 py-4">
              <p className="max-w-2xl text-[13px] leading-relaxed text-ink2">{ep.desc}</p>

              {/* headers */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-[10px] font-extrabold tracking-[0.16em] text-mute">COMMON HEADERS</p>
                </div>
                <div className="overflow-hidden rounded-lg border border-line">
                  {HEADERS.map(([k, v]) => (
                    <div key={k} className="flex items-center gap-3 border-b border-line/60 bg-paper/60 px-3 py-1.5 last:border-0">
                      <span className="w-36 shrink-0 font-mono text-[11px] font-bold text-volt2">{k}</span>
                      <span className="truncate font-mono text-[11px] text-ink2">{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 xl:grid-cols-2">
                {/* request */}
                <div className="overflow-hidden rounded-lg border border-line">
                  <div className="flex items-center justify-between border-b border-line bg-side px-3 py-2">
                    <p className="flex items-center gap-1.5 font-mono text-[10px] font-extrabold tracking-widest text-[#93a29a]"><Icon name="doc" size={12} /> REQUEST {ep.method === "GET" ? "· NO BODY" : "BODY"}</p>
                    {ep.request ? <CopyBtn value={ep.request} label="Request" /> : null}
                  </div>
                  <div className="bg-[#10160f] p-3 text-paper">
                    {ep.request ? <JsonView value={ep.request} /> : <p className="py-2 font-mono text-[11px] text-[#77837a]">— GET request, parameters live in the path.</p>}
                  </div>
                </div>
                {/* response */}
                <div className="overflow-hidden rounded-lg border border-line">
                  <div className="flex items-center justify-between border-b border-line bg-side px-3 py-2">
                    <p className="flex items-center gap-1.5 font-mono text-[10px] font-extrabold tracking-widest text-[#93a29a]"><Icon name="doc" size={12} /> RESPONSE · 200</p>
                    <CopyBtn value={ep.response} label="Response" />
                  </div>
                  <div className="bg-[#10160f] p-3 text-paper">
                    <JsonView value={ep.response} />
                  </div>
                </div>
              </div>

              {ep.notes && (
                <p className="flex items-start gap-2 rounded-lg border border-[#ead9b8] bg-voltsoft px-3 py-2.5 text-[12px] font-semibold leading-snug text-volt2">
                  <Icon name="alert" size={14} className="mt-0.5 shrink-0" /> {ep.notes}
                </p>
              )}
            </div>
          </div>

          {/* ---- Live tester ---- */}
          <div className="overflow-hidden rounded-xl border border-line bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper px-4 py-3">
              <p className="flex items-center gap-2 font-display text-[14.5px] font-bold"><Icon name="plug" size={15} className="text-volt2" /> Live request tester</p>
              <label className="flex cursor-pointer items-center gap-2 text-[11px] font-bold text-mute">
                <button onClick={() => setForceFail(v => !v)} className={`relative h-4.5 w-8 rounded-full transition-colors ${forceFail ? "bg-danger" : "bg-line2"}`} style={{ height: 18, width: 32 }}>
                  <span className={`absolute top-[2px] h-3.5 w-3.5 rounded-full bg-white transition-all ${forceFail ? "left-[16px]" : "left-[2px]"}`} style={{ width: 14, height: 14 }} />
                </button>
                Simulate failure
              </label>
            </div>
            <div className="space-y-3 px-4 py-4">
              {ep.method === "POST" ? (
                <div>
                  <p className="mb-1.5 text-[10px] font-extrabold tracking-[0.16em] text-mute">EDITABLE REQUEST BODY</p>
                  <textarea value={payload} onChange={e => setPayload(e.target.value)} rows={Math.min(10, Math.max(4, payload.split("\n").length))}
                    className="w-full resize-y rounded-lg border border-line bg-[#10160f] p-3 font-mono text-[11.5px] leading-relaxed text-[#d8e2da] outline-none transition-colors focus:border-volt"
                    spellCheck={false} />
                </div>
              ) : (
                <p className="text-[12px] font-semibold text-mute">GET endpoint — the path above is called as-is.</p>
              )}
              <div className="flex flex-wrap items-center gap-2.5">
                <Btn variant="volt" icon="arrowR" loading={sending} onClick={send}>{sending ? "CALLING ZVEND…" : `Send ${ep.method} request`}</Btn>
                <Btn variant="ghost" icon="history" onClick={() => nav("admin/api-logs")}>View API logs</Btn>
                {result && (
                  <span className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-[11px] font-extrabold ${result.ok ? "bg-oksoft text-ok" : "bg-dangersoft text-danger"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${result.ok ? "bg-ok okdot" : "bg-danger"}`} /> {result.code} · {result.durationMs} ms
                  </span>
                )}
              </div>
              {result && (
                <div className="anim-rise overflow-hidden rounded-lg border border-line">
                  <div className="flex items-center justify-between border-b border-line bg-side px-3 py-2">
                    <p className="font-mono text-[10px] font-extrabold tracking-widest text-[#93a29a]">LIVE RESPONSE · {result.endpoint}</p>
                    <CopyBtn value={result.body} label="Live response" />
                  </div>
                  <div className="bg-[#10160f] p-3 text-paper"><JsonView value={result.body} /></div>
                </div>
              )}
            </div>
          </div>

          {/* ---- Recent ZVend calls ---- */}
          <div className="overflow-hidden rounded-xl border border-line bg-card">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="flex items-center gap-2 font-display text-[14.5px] font-bold"><Icon name="history" size={15} className="text-volt2" /> Recent ZVend calls</p>
              <span className="text-[10.5px] font-bold text-mute">written to the append-only API log</span>
            </div>
            {recentZvend.length === 0 ? (
              <p className="px-4 py-5 text-center text-[12px] text-mute">No ZVend calls yet — send one above.</p>
            ) : (
              <div className="divide-y divide-line/70">
                {recentZvend.map(l => (
                  <div key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-extrabold ${l.method === "GET" ? "bg-infosoft text-info" : "bg-oksoft text-ok"}`}>{l.method}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] font-bold">{l.endpoint}</span>
                    {l.txn && <span className="hidden font-mono text-[10px] text-mute sm:inline">{l.txn}</span>}
                    <span className={`rounded px-1.5 py-0.5 font-mono text-[9.5px] font-extrabold ${l.status === "success" ? "bg-oksoft text-ok" : "bg-dangersoft text-danger"}`}>{l.code}</span>
                    <span className="w-14 text-right font-mono text-[10.5px] text-mute">{l.durationMs} ms</span>
                    <span className="hidden w-24 text-right font-mono text-[9.5px] text-mute md:inline">{fmtDT(l.at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
