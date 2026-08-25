import { useMemo, useState } from "react";
import type { Op, WalletRec } from "../lib/core";
import { age, fmtDT, fmtNaira } from "../lib/core";
import { useStore } from "../lib/core";
import { Btn, Card, Icon, Modal, SectionHead, Select, StatusPill, TextInput, Textarea, TonePill, useRoute } from "../components/ui";

/* ---------------- FUND / DEDUCT modal ---------------- */
function WalletTxModal({ rec, action, onClose }: { rec: WalletRec; action: "FUND" | "DEDUCT"; onClose: () => void }) {
  const { state, createWallet } = useStore();
  const { nav } = useRoute();
  const [amount, setAmount] = useState("");
  const [comment, setComment] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const fac = state.facilities.find(f => f.id === rec.facilityId);
  const cust = state.customers.find(c => c.id === state.meters.find(m => m.number === rec.meterNumber)?.customerId);
  const amt = Number(amount);
  const valid = Number.isFinite(amt) && amt > 0 && Number.isInteger(amt);
  const projected = action === "FUND" ? rec.balance + (valid ? amt : 0) : Math.max(0, rec.balance - (valid ? amt : 0));
  const insufficient = action === "DEDUCT" && valid && amt > rec.balance;
  const quick = action === "FUND" ? [1000, 5000, 10000, 25000] : [Math.floor(rec.balance * 0.25), Math.floor(rec.balance * 0.5), rec.balance].filter((v, i, a) => v > 0 && a.indexOf(v) === i);

  const submit = () => {
    if (!valid) { setErr("Enter a whole-naira amount greater than zero."); return; }
    if (amt > 500000) { setErr("Amount exceeds the ₦500,000 single-transaction ceiling."); return; }
    if (insufficient) { setErr(`Insufficient balance — wallet holds ${fmtNaira(rec.balance)}.`); return; }
    if (comment.trim().length < 5) { setErr("A reason is required for every wallet transaction (min 5 characters)."); return; }
    setErr(""); setBusy(true);
    setTimeout(() => {
      const op = createWallet({ meterNumber: rec.meterNumber, facilityId: rec.facilityId, action, amount: amt, comment: comment.trim() });
      setBusy(false);
      if (op) { onClose(); nav(`wallet-mgt/${op.id}`); }
    }, 400);
  };

  return (
    <Modal open onClose={onClose} title={
      <span className="flex items-center gap-2">
        <Icon name="wallet" size={16} className={action === "FUND" ? "text-ok" : "text-warn"} />
        {action === "FUND" ? "Add to meter wallet" : "Deduct from meter wallet"} · <span className="font-mono">{rec.meterNumber}</span>
      </span>
    }>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink text-volt"><Icon name="gauge" size={18} /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-extrabold">{fac?.name} <span className="font-mono text-[10.5px] font-bold text-mute">· {fac?.code}</span></p>
            <p className="truncate text-[11px] font-semibold text-mute">{cust ? `Customer: ${cust.name}` : "Unassigned meter"} · updated {age(rec.updatedAt)} ago</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] font-extrabold tracking-[0.16em] text-mute">CURRENT BALANCE</p>
            <p className="font-mono text-[15px] font-bold tnum">{fmtNaira(rec.balance)}</p>
          </div>
        </div>

        <div>
          <label className="text-[11px] font-extrabold tracking-wide text-ink2">AMOUNT (₦) — REQUIRED <span className="text-danger">*</span></label>
          <div className="relative mt-1">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[14px] font-bold text-mute">₦</span>
            <TextInput value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric"
              placeholder="e.g. 5000" className="pl-8 font-mono text-[15px] font-bold" />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {quick.map(v => (
              <button key={v} onClick={() => { setAmount(String(v)); setErr(""); }}
                className={`rounded-md border px-2.5 py-1 font-mono text-[10.5px] font-bold transition-all hover:-translate-y-px ${amount === String(v) ? "border-volt bg-voltsoft text-volt2" : "border-line bg-card text-ink2 hover:border-volt/60"}`}>
                {v === rec.balance ? "MAX" : fmtNaira(v)}
              </button>
            ))}
          </div>
        </div>

        {/* projection */}
        <div className={`rounded-xl border-2 p-3.5 ${action === "FUND" ? "border-[#c2ddcd] bg-oksoft/60" : insufficient ? "border-[#eac5be] bg-dangersoft/70" : "border-[#ecd9b8] bg-warnsoft/60"}`}>
          <div className="flex flex-wrap items-center gap-2.5 font-mono text-[13px] font-bold tnum">
            <span>{fmtNaira(rec.balance)}</span>
            <span className={action === "FUND" ? "text-ok" : "text-warn"}>{action === "FUND" ? "+" : "−"} {valid ? fmtNaira(amt) : "₦0"}</span>
            <Icon name="arrowR" size={14} className="text-mute" />
            <span className={`rounded-md px-2 py-0.5 ${insufficient ? "bg-danger text-white" : "bg-ink text-volt"}`}>{fmtNaira(insufficient ? rec.balance - amt : projected)}</span>
          </div>
          <p className="mt-1.5 text-[10.5px] font-semibold text-mute">
            {insufficient ? "DEDUCTION EXCEEDS BALANCE — ZVend will refuse; the request cannot be submitted."
              : `Executed via POST /v1/walletMgt/${rec.meterNumber}/${action}/{amount} after GM → MD approval.`}
          </p>
        </div>

        <div>
          <label className="text-[11px] font-extrabold tracking-wide text-ink2">REASON / COMMENT — REQUIRED <span className="text-danger">*</span></label>
          <Textarea value={comment} onChange={e => setComment(e.target.value)} className="mt-1"
            placeholder={action === "FUND" ? "e.g. Customer prepaid token batch #T-8821…" : "e.g. Billing reversal per invoice correction #INV-2210…"} />
        </div>
        {err && <p className="flex items-center gap-2 rounded-lg border border-[#eac5be] bg-dangersoft px-3 py-2 text-[11.5px] font-extrabold text-danger anim-fade"><Icon name="alert" size={13} />{err}</p>}

        <div className="flex gap-2">
          <Btn variant="outline" onClick={onClose}>Cancel</Btn>
          <Btn variant={action === "FUND" ? "ok" : "primary"} icon={action === "FUND" ? "plus" : "minus"} className="flex-1" loading={busy} onClick={submit}>
            SUBMIT {action} REQUEST TO GM
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- page ---------------- */
export function WalletMgtPage() {
  const { state, user, online, syncWallet } = useStore();
  const { nav } = useRoute();
  const [q, setQ] = useState("");
  const [fac, setFac] = useState("ALL");
  const [syncing, setSyncing] = useState(false);
  const [tx, setTx] = useState<{ rec: WalletRec; action: "FUND" | "DEDUCT" } | null>(null);
  const isSecretary = user?.role === "SECRETARY" || user?.role === "SUPER_ADMIN";
  const isSA = user?.role === "SUPER_ADMIN";

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return [...state.wallets]
      .filter(w => (!s || w.meterNumber.includes(s) || (state.facilities.find(f => f.id === w.facilityId)?.name.toLowerCase() ?? "").includes(s))
        && (fac === "ALL" || w.facilityId === fac))
      .sort((a, b) => b.balance - a.balance);
  }, [state.wallets, state.facilities, q, fac]);

  const maxBal = Math.max(1, ...state.wallets.map(w => w.balance));
  const totalBal = state.wallets.reduce((a, w) => a + w.balance, 0);
  const funded = state.wallets.filter(w => w.balance > 0).length;
  const inFlight = (meter: string): Op | undefined =>
    state.operations.find(o => o.type === "wallet" && o.meterNumber === meter && !["COMPLETED", "CANCELLED", "REJECTED"].includes(o.status));
  const flightN = state.operations.filter(o => o.type === "wallet" && !["COMPLETED", "CANCELLED", "REJECTED"].includes(o.status)).length;
  const recent = state.operations.filter(o => o.type === "wallet").slice(0, 6);

  const refresh = async () => {
    if (syncing || !online) return;
    setSyncing(true);
    await syncWallet();
    setSyncing(false);
  };

  return (
    <div className="mx-auto max-w-[1240px]">
      <SectionHead
        title="Wallet Mgt"
        sub={`${state.wallets.length} meter wallets on the ZVend registry · ${fmtNaira(totalBal)} held · last sync ${age(state.walletSyncedAt)} ago`}
        right={<Btn variant="volt" icon="sync" loading={syncing} onClick={() => void refresh()}>{syncing ? "Pulling…" : "Refresh from ZVend"}</Btn>}
      />

      {/* stats strip */}
      <Card className="anim-rise mb-4 grid grid-cols-2 divide-x divide-line md:grid-cols-4">
        <div className="p-3.5"><p className="font-display text-[20px] font-bold leading-none text-ok tnum">{fmtNaira(totalBal)}</p><p className="mt-1 text-[9px] font-extrabold tracking-[0.16em] text-mute">TOTAL BALANCE HELD</p></div>
        <div className="p-3.5"><p className="font-display text-[20px] font-bold leading-none tnum">{funded}<span className="text-[12px] text-mute">/{state.wallets.length}</span></p><p className="mt-1 text-[9px] font-extrabold tracking-[0.16em] text-mute">FUNDED WALLETS</p></div>
        <div className="p-3.5"><p className="font-display text-[20px] font-bold leading-none text-warn tnum">{flightN}</p><p className="mt-1 text-[9px] font-extrabold tracking-[0.16em] text-mute">TRANSACTIONS IN FLIGHT</p></div>
        <div className="p-3.5"><p className="font-mono text-[12px] font-bold leading-[20px]">{fmtDT(state.walletSyncedAt)}</p><p className="mt-1 truncate text-[9px] font-extrabold tracking-[0.16em] text-mute">LAST SYNC{isSA ? " · /v1/wallet/" : ""}</p></div>
      </Card>

      {/* filters */}
      <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_240px]">
        <div className="relative">
          <Icon name="search" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
          <TextInput value={q} onChange={e => setQ(e.target.value)} placeholder="Search meter or facility…" className="pl-9 font-mono" />
        </div>
        <Select value={fac} onChange={e => setFac(e.target.value)}>
          <option value="ALL">All facilities</option>
          {state.facilities.map(f => <option key={f.id} value={f.id}>{f.name} · {f.code}</option>)}
        </Select>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_330px]">
        {/* registry table */}
        <Card className="anim-rise">
          {rows.length === 0 ? (
            <div className="p-6 text-center">
              <Icon name="wallet" size={24} className="mx-auto text-line2" />
              <p className="mt-2 text-[13px] font-bold">No wallets match</p>
              <p className="text-[11.5px] text-mute">Adjust the filters or refresh the registry from ZVend.</p>
            </div>
          ) : (
            <>
              <div className="hidden border-b border-line bg-paper px-4 py-2.5 text-[10px] font-extrabold tracking-widest text-mute md:grid md:grid-cols-[1.2fr_1fr_1.3fr_auto]">
                <span>METER</span><span>FACILITY</span><span>WALLET BALANCE</span><span className="text-right">{isSecretary ? "ACTIONS" : "STATUS"}</span>
              </div>
              <div className="divide-y divide-line/70">
                {rows.map(w => {
                  const f = state.facilities.find(x => x.id === w.facilityId);
                  const cust = state.customers.find(c => c.id === state.meters.find(m => m.number === w.meterNumber)?.customerId);
                  const flight = inFlight(w.meterNumber);
                  const pct = Math.round((w.balance / maxBal) * 100);
                  return (
                    <div key={w.meterNumber} className="group grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3 transition-colors hover:bg-paper md:grid-cols-[1.2fr_1fr_1.3fr_auto]">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 font-mono text-[12.5px] font-bold">
                          {w.meterNumber}
                          {flight && <span className="flex items-center gap-1 rounded bg-warnsoft px-1.5 py-0.5 text-[8.5px] font-extrabold tracking-widest text-warn"><span className="h-1.5 w-1.5 rounded-full bg-warn livedot" />{flight.action} IN FLIGHT</span>}
                        </p>
                        <p className="mt-0.5 truncate text-[10.5px] font-semibold text-mute md:hidden">{f?.name} · {cust?.name ?? "unassigned"}</p>
                      </div>
                      <p className="hidden truncate text-[12px] font-semibold md:block">{f?.name}<span className="block text-[10px] font-semibold text-mute">{cust?.name ?? "unassigned"}</span></p>
                      <div className="hidden md:block">
                        <p className="font-mono text-[13px] font-bold tnum">{fmtNaira(w.balance)}</p>
                        <div className="mt-1 h-1.5 w-full max-w-[150px] overflow-hidden rounded-full bg-ink/8">
                          <div className={`anim-bar h-full rounded-full ${w.balance > 0 ? "bg-ok" : "bg-ink/20"}`} style={{ width: `${Math.max(2, pct)}%` }} />
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="font-mono text-[12.5px] font-bold tnum md:hidden">{fmtNaira(w.balance)}</span>
                        {isSecretary ? (
                          flight ? <TonePill tone="amber">IN FLIGHT</TonePill> : (
                            <>
                              <button onClick={() => setTx({ rec: w, action: "FUND" })} title="Add to meter wallet"
                                className="flex items-center gap-1 rounded-md border border-[#c2ddcd] bg-oksoft px-2.5 py-1.5 text-[10px] font-extrabold text-ok transition-all hover:-translate-y-px hover:shadow-sm active:translate-y-0">
                                <Icon name="plus" size={11} /> FUND
                              </button>
                              <button onClick={() => setTx({ rec: w, action: "DEDUCT" })} title="Deduct from meter wallet" disabled={w.balance <= 0}
                                className="flex items-center gap-1 rounded-md border border-[#ecd9b8] bg-warnsoft px-2.5 py-1.5 text-[10px] font-extrabold text-warn transition-all hover:-translate-y-px hover:shadow-sm active:translate-y-0 disabled:pointer-events-none disabled:opacity-35">
                                <Icon name="minus" size={11} /> DEDUCT
                              </button>
                            </>
                          )
                        ) : flight ? <StatusPill status={flight.status} /> : <Icon name="lock" size={13} className="text-line2" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Card>

        {/* right rail */}
        <div className="space-y-4">
          {isSA && (
            <Card className="anim-rise p-4">
              <p className="mb-2 flex items-center gap-2 font-display text-[14px] font-bold"><Icon name="plug" size={14} className="text-volt2" /> ZVend wire contract <TonePill tone="ink">SUPER ADMIN</TonePill></p>
              <div className="space-y-2.5">
                <div className="rounded-lg border border-line bg-paper p-2.5">
                  <p className="flex items-center gap-2"><TonePill tone="green">GET</TonePill><span className="font-mono text-[10.5px] font-bold">/v1/wallet/</span></p>
                  <p className="mt-1 font-mono text-[9.5px] leading-relaxed text-mute">→ {'{ meter, facility, walletBalance }[]'}</p>
                </div>
                <div className="rounded-lg border border-line bg-paper p-2.5">
                  <p className="flex items-center gap-2"><TonePill tone="amber">POST</TonePill><span className="font-mono text-[10.5px] font-bold">/v1/walletMgt/{"{meter}"}/{"{action}"}/{"{amount}"}</span></p>
                  <p className="mt-1 font-mono text-[9.5px] leading-relaxed text-mute">action ∈ {"{ FUND, Deduct → FUND | DEDUCT }"} · synchronous<br />→ {'{ reference, response_code, executed, new_balance }'}</p>
                </div>
              </div>
              <p className="mt-2.5 flex items-start gap-1.5 text-[10.5px] font-semibold leading-relaxed text-mute"><Icon name="info" size={12} className="mt-0.5 shrink-0" /> Contract detail — hidden from all other roles. Transactions execute only after GM → MD approval; failure bounces to the Secretary.</p>
            </Card>
          )}

          <Card className="anim-rise">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="font-display text-[14px] font-bold">Recent wallet requests</h2>
              <Btn size="sm" variant="ghost" onClick={() => nav("wallet-mgt")}>All<Icon name="arrowR" size={12} /></Btn>
            </div>
            {recent.length === 0 ? <p className="px-4 py-5 text-center text-[11.5px] text-mute">No wallet transactions yet.</p> : (
              <div className="divide-y divide-line/70">
                {recent.map(o => (
                  <button key={o.id} onClick={() => nav(`wallet-mgt/${o.id}`)} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-paper">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${o.action === "FUND" ? "bg-oksoft text-ok" : "bg-warnsoft text-warn"}`}><Icon name={o.action === "FUND" ? "plus" : "minus"} size={13} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[11px] font-bold">{o.txn}</span>
                      <span className="block text-[10px] font-semibold text-mute">meter {o.meterNumber} · {o.action} {fmtNaira(o.amount ?? 0)}</span>
                    </span>
                    <StatusPill status={o.status} />
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card className="anim-rise p-4">
            <p className="mb-2 font-display text-[13.5px] font-bold">Approval chain</p>
            <div className="space-y-1.5">
              {["Secretary initiates", "General Manager approves", "MD final approval", "ZVend executes", "Response returns to Secretary"].map((s, i, arr) => (
                <div key={s} className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-[10px] font-extrabold text-volt tnum">{i + 1}</span>
                  <span className="text-[12px] font-bold text-ink2">{s}</span>
                  {i < arr.length - 1 && <span className="ml-auto text-[10px] text-mute">↓</span>}
                </div>
              ))}
            </div>
            <p className="mt-2.5 text-[10.5px] font-semibold leading-relaxed text-mute">Every stage requires a comment. On ZVend error the transaction bounces back to the Secretary; on success it auto-completes and the balance updates.</p>
          </Card>

          {!isSecretary && user && (
            <Card className="anim-rise p-4">
              <p className="flex items-center gap-2 text-[11.5px] font-extrabold text-mute"><Icon name="lock" size={13} /> READ-ONLY — wallet transactions are initiated by the Secretary. You can track progress on every request.</p>
            </Card>
          )}
        </div>
      </div>

      {tx && <WalletTxModal rec={tx.rec} action={tx.action} onClose={() => setTx(null)} />}
    </div>
  );
}
