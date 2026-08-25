import { useMemo, useState } from "react";
import type { Op, PowerState } from "../lib/core";
import { age, fmtDT, powerLabel } from "../lib/core";
import { useStore } from "../lib/core";
import { Btn, Card, Icon, Modal, SectionHead, Select, StatusPill, TextInput, Textarea, TonePill, useRoute } from "../components/ui";

/* ---------------- power pill ---------------- */
function PowerPill({ p, pulse }: { p: "1" | "0"; pulse?: boolean }) {
  const on = p === "1";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[10px] font-extrabold tracking-widest ${on ? "bg-oksoft text-ok" : "bg-ink/8 text-ink2"}`}>
      <span className={`h-2 w-2 rounded-full ${on ? "bg-ok" : "bg-ink/30"} ${on && pulse ? "okdot" : ""}`} />
      {on ? "ON · 1" : "OFF · 0"}
    </span>
  );
}

/* ---------------- prompt modal ---------------- */
function PowerPrompt({ rec, onClose }: { rec: PowerState; onClose: () => void }) {
  const { state, createControl } = useStore();
  const { nav } = useRoute();
  const [comment, setComment] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const fac = state.facilities.find(f => f.id === rec.facilityId);
  const cust = state.customers.find(c => c.id === state.meters.find(m => m.number === rec.meterNumber)?.customerId);
  const target = rec.power === "1" ? "0" : "1";

  const submit = () => {
    if (comment.trim().length < 5) { setErr("A reason is required for every power command (min 5 characters)."); return; }
    setErr(""); setBusy(true);
    setTimeout(() => {
      const op = createControl({ meterNumber: rec.meterNumber, facilityId: rec.facilityId, command: target, comment: comment.trim() });
      setBusy(false);
      if (op) { onClose(); nav(`meter-control/${op.id}`); }
    }, 400);
  };

  return (
    <Modal open onClose={onClose} title={<span className="flex items-center gap-2"><Icon name="power" size={16} className="text-volt2" /> Power command · <span className="font-mono">{rec.meterNumber}</span></span>}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ink text-volt"><Icon name="gauge" size={18} /></span>
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-extrabold">{fac?.name} <span className="font-mono text-[10.5px] font-bold text-mute">· {fac?.code}</span></p>
            <p className="truncate text-[11px] font-semibold text-mute">{cust ? `Customer: ${cust.name}` : "Unassigned meter"} · updated {age(rec.updatedAt)} ago by {rec.updatedBy}</p>
          </div>
        </div>

        {/* the question */}
        <div className={`rounded-xl border-2 p-4 ${target === "0" ? "border-[#ecd9b8] bg-warnsoft/60" : "border-[#c2ddcd] bg-oksoft/60"}`}>
          <p className="text-[11px] font-extrabold tracking-[0.14em] text-mute">THIS METER IS CURRENTLY</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            <PowerPill p={rec.power} pulse />
            <Icon name="arrowR" size={16} className="text-mute" />
            <span className="font-display text-[17px] font-bold">
              Do you want to <span className={target === "0" ? "text-warn" : "text-ok"}>TURN {powerLabel(target)}</span> the meter?
            </span>
          </div>
          <p className="mt-2 text-[11px] font-semibold text-mute">
            The request will be submitted to the <span className="font-bold text-ink2">Energy Manager</span>, then <span className="font-bold text-ink2">GM</span>, then <span className="font-bold text-ink2">MD</span>, then executed by <span className="font-bold text-ink2">ZVend</span> — and the response returns to you automatically.
          </p>
        </div>

        <div>
          <label className="text-[11px] font-extrabold tracking-wide text-ink2">REASON / COMMENT — REQUIRED <span className="text-danger">*</span></label>
          <Textarea value={comment} onChange={e => setComment(e.target.value)} className="mt-1" placeholder="e.g. Customer requested temporary disconnection for rewiring…" />
        </div>
        {err && <p className="flex items-center gap-2 rounded-lg border border-[#eac5be] bg-dangersoft px-3 py-2 text-[11.5px] font-extrabold text-danger anim-fade"><Icon name="alert" size={13} />{err}</p>}

        <div className="flex gap-2">
          <Btn variant="outline" onClick={onClose}>Cancel</Btn>
          <Btn variant={target === "0" ? "primary" : "ok"} icon="power" className="flex-1" loading={busy} onClick={submit}>
            SUBMIT TURN {powerLabel(target)} REQUEST
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- page ---------------- */
export function MeterControlPage() {
  const { state, user, can, online, syncPower } = useStore();
  const { nav } = useRoute();
  const [q, setQ] = useState("");
  const [fac, setFac] = useState("ALL");
  const [power, setPower] = useState<"ALL" | "1" | "0">("ALL");
  const [syncing, setSyncing] = useState(false);
  const [prompt, setPrompt] = useState<PowerState | null>(null);
  const canInitiate = can("control.create");

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return [...state.powerStates]
      .filter(p => (!s || p.meterNumber.includes(s) || (state.facilities.find(f => f.id === p.facilityId)?.name.toLowerCase() ?? "").includes(s))
        && (fac === "ALL" || p.facilityId === fac) && (power === "ALL" || p.power === power))
      .sort((a, b) => a.meterNumber.localeCompare(b.meterNumber));
  }, [state.powerStates, state.facilities, q, fac, power]);

  const inFlight = (meter: string): Op | undefined =>
    state.operations.find(o => o.type === "control" && o.meterNumber === meter && !["COMPLETED", "CANCELLED", "REJECTED"].includes(o.status));

  const onN = state.powerStates.filter(p => p.power === "1").length;
  const offN = state.powerStates.length - onN;
  const flightN = state.operations.filter(o => o.type === "control" && !["COMPLETED", "CANCELLED", "REJECTED"].includes(o.status)).length;
  const recent = state.operations.filter(o => o.type === "control").slice(0, 6);

  const refresh = async () => {
    if (syncing) return;
    if (!online) return;
    setSyncing(true);
    await syncPower();
    setSyncing(false);
  };

  const openPrompt = (p: PowerState) => {
    if (!canInitiate) return;
    if (inFlight(p.meterNumber)) return;
    setPrompt(p);
  };

  return (
    <div className="mx-auto max-w-[1240px]">
      <SectionHead
        title="Meter Control"
        sub={`${state.powerStates.length} meters on the ZVend power registry · ${onN} energized · last sync ${age(state.powerSyncedAt)} ago`}
        right={<Btn variant="volt" icon="sync" loading={syncing} onClick={() => void refresh()}>{syncing ? "Pulling…" : "Refresh from ZVend"}</Btn>}
      />

      {/* status strip */}
      <Card className="anim-rise mb-4 grid grid-cols-2 divide-x divide-line md:grid-cols-4">
        <div className="p-3.5"><p className="flex items-center gap-2 font-display text-[20px] font-bold leading-none text-ok"><span className="h-2.5 w-2.5 rounded-full bg-ok okdot" />{onN}</p><p className="mt-1 text-[9px] font-extrabold tracking-[0.16em] text-mute">ENERGIZED · "1"</p></div>
        <div className="p-3.5"><p className="font-display text-[20px] font-bold leading-none text-ink2 tnum">{offN}</p><p className="mt-1 text-[9px] font-extrabold tracking-[0.16em] text-mute">DISCONNECTED · "0"</p></div>
        <div className="p-3.5"><p className="font-display text-[20px] font-bold leading-none text-warn tnum">{flightN}</p><p className="mt-1 text-[9px] font-extrabold tracking-[0.16em] text-mute">REQUESTS IN FLIGHT</p></div>
        <div className="p-3.5"><p className="font-mono text-[12px] font-bold leading-[20px]">{fmtDT(state.powerSyncedAt)}</p><p className="mt-1 text-[9px] font-extrabold tracking-[0.16em] text-mute">LAST SYNC · /v1/meters/power-status</p></div>
      </Card>

      {/* filters */}
      <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_220px_auto]">
        <div className="relative">
          <Icon name="search" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
          <TextInput value={q} onChange={e => setQ(e.target.value)} placeholder="Search meter or facility…" className="pl-9 font-mono" />
        </div>
        <Select value={fac} onChange={e => setFac(e.target.value)}>
          <option value="ALL">All facilities</option>
          {state.facilities.map(f => <option key={f.id} value={f.id}>{f.name} · {f.code}</option>)}
        </Select>
        <div className="flex overflow-hidden rounded-lg border border-line bg-card p-0.5">
          {([["ALL", "All"], ["1", "ON"], ["0", "OFF"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setPower(k)}
              className={`flex-1 rounded-md px-3.5 py-1.5 text-[11.5px] font-extrabold transition-all sm:flex-none ${power === k ? (k === "1" ? "bg-ok text-white" : k === "0" ? "bg-ink text-paper" : "bg-ink text-paper") : "text-mute hover:bg-ink/5"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        {/* registry list */}
        <Card className="anim-rise">
          {rows.length === 0 ? (
            <div className="p-5 text-center">
              <Icon name="power" size={22} className="mx-auto text-line2" />
              <p className="mt-2 text-[12.5px] font-bold">No meters match</p>
              <p className="text-[11.5px] text-mute">Adjust the filters or refresh the registry from ZVend.</p>
            </div>
          ) : (
            <div className="divide-y divide-line/70">
              {rows.map(p => {
                const f = state.facilities.find(x => x.id === p.facilityId);
                const cust = state.customers.find(c => c.id === state.meters.find(m => m.number === p.meterNumber)?.customerId);
                const flight = inFlight(p.meterNumber);
                const on = p.power === "1";
                return (
                  <button key={p.meterNumber} onClick={() => openPrompt(p)} disabled={!canInitiate || !!flight}
                    className={`group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${canInitiate && !flight ? "hover:bg-paper active:bg-voltsoft/50" : "cursor-default"}`}>
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${on ? "bg-oksoft text-ok" : "bg-ink/6 text-mute"}`}><Icon name="gauge" size={16} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[12.5px] font-bold">{p.meterNumber}</span>
                        {flight && <span className="flex items-center gap-1 rounded bg-warnsoft px-1.5 py-0.5 text-[8.5px] font-extrabold tracking-widest text-warn"><span className="h-1.5 w-1.5 rounded-full bg-warn livedot" />IN FLIGHT · {flight.txn.slice(-6)}</span>}
                      </span>
                      <span className="mt-0.5 block truncate text-[10.5px] font-semibold text-mute">{f?.name} · {cust?.name ?? "unassigned"} · {age(p.updatedAt)} ago</span>
                    </span>
                    <PowerPill p={p.power} pulse={on} />
                    {canInitiate && !flight && (
                      <span className="hidden shrink-0 items-center gap-1 rounded-md border border-line px-2 py-1 text-[10px] font-extrabold text-mute transition-all group-hover:border-volt group-hover:bg-voltsoft group-hover:text-volt2 sm:flex">
                        <Icon name="power" size={11} /> TURN {p.power === "1" ? "OFF" : "ON"}
                      </span>
                    )}
                    {!canInitiate && <Icon name="lock" size={13} className="shrink-0 text-line2" />}
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        {/* right rail */}
        <div className="space-y-4">
          <Card className="anim-rise p-4">
            <p className="mb-2 flex items-center gap-2 font-display text-[14px] font-bold"><Icon name="plug" size={14} className="text-volt2" /> ZVend wire contract</p>
            <div className="space-y-2.5">
              <div className="rounded-lg border border-line bg-paper p-2.5">
                <p className="flex items-center gap-2"><TonePill tone="green">GET</TonePill><span className="font-mono text-[10.5px] font-bold">/v1/meters/power-status</span></p>
                <p className="mt-1 font-mono text-[9.5px] leading-relaxed text-mute">→ {'{ meter_number, power: "1"|"0", facility }[]'}</p>
              </div>
              <div className="rounded-lg border border-line bg-paper p-2.5">
                <p className="flex items-center gap-2"><TonePill tone="amber">POST</TonePill><span className="font-mono text-[10.5px] font-bold">/v1/meters/control</span></p>
                <p className="mt-1 font-mono text-[9.5px] leading-relaxed text-mute">← {'{ meter_number, command: "1"|"0" }'} · synchronous<br />→ {'{ reference, response_code, executed, new_state }'}</p>
              </div>
            </div>
            <p className="mt-2.5 flex items-start gap-1.5 text-[10.5px] font-semibold leading-relaxed text-mute"><Icon name="info" size={12} className="mt-0.5 shrink-0" /> Power commands execute only after MD approval. Failure bounces back to the Secretary; success auto-completes and flips the registry.</p>
          </Card>

          <Card className="anim-rise">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="font-display text-[14px] font-bold">Recent power requests</h2>
              <Btn size="sm" variant="ghost" onClick={() => nav("meter-control")}>All<Icon name="arrowR" size={12} /></Btn>
            </div>
            {recent.length === 0 ? <p className="px-4 py-5 text-center text-[11.5px] text-mute">No power requests yet.</p> : (
              <div className="divide-y divide-line/70">
                {recent.map(o => (
                  <button key={o.id} onClick={() => nav(`meter-control/${o.id}`)} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-paper">
                    <Icon name="power" size={14} className={o.command === "1" ? "text-ok" : "text-warn"} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[11px] font-bold">{o.txn}</span>
                      <span className="block text-[10px] font-semibold text-mute">meter {o.meterNumber} · TURN {o.command ? powerLabel(o.command) : "?"}</span>
                    </span>
                    <StatusPill status={o.status} />
                  </button>
                ))}
              </div>
            )}
          </Card>

          {!canInitiate && user && (
            <Card className="anim-rise p-4">
              <p className="flex items-center gap-2 text-[11.5px] font-extrabold text-mute"><Icon name="lock" size={13} /> READ-ONLY — power commands are initiated by the Secretary.</p>
            </Card>
          )}
        </div>
      </div>

      {prompt && <PowerPrompt rec={prompt} onClose={() => setPrompt(null)} />}
    </div>
  );
}
