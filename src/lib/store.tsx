import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type {
  AppState, AuditEntry, CustomerInfo, Delegation, GpsRec, Notif, Op, OpStatus, OpType,
  PhotoRec, Role, ScanRec, User, WorkflowComment,
} from "./types";
import { activeDelegation, OPS, STAGES, TERMINAL, uid, gen20, actionableBy } from "./types";
import { buildSeed } from "./seed";

const LS_KEY = "zadmin:v3";

function load(): AppState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const s = JSON.parse(raw) as AppState;
      if (s.v === 3) return s;
    }
  } catch { /* fall through to seed */ }
  return buildSeed();
}

export interface Toast { id: string; text: string; tone: "ok" | "warn" | "danger" | "info"; }

interface StoreCtx {
  state: AppState;
  user: User | null;
  online: boolean;
  syncing: boolean;
  toasts: Toast[];
  can: (perm: string) => boolean;
  delegation: Delegation | null;
  toast: (text: string, tone?: Toast["tone"]) => void;
  dismissToast: (id: string) => void;
  login: (userId: string) => void;
  logout: () => void;
  // operations
  createInstallation: (d: { meterNumber: string; facilityId: string; comment: string }) => Op | null;
  resubmit: (opId: string) => void;
  decide: (opId: string, decision: "APPROVE" | "REJECT" | "RETURN", comment: string) => boolean;
  releaseToTech: (opId: string) => void;
  confirmCompletion: (opId: string) => void;
  startField: (opId: string) => void;
  saveScan: (opId: string, scan: ScanRec) => void;
  saveGps: (opId: string, gps: GpsRec) => void;
  addPhoto: (opId: string, photo: PhotoRec) => void;
  saveCustomer: (opId: string, c: CustomerInfo) => void;
  saveObservations: (opId: string, text: string) => void;
  saveVideo: (opId: string, v: NonNullable<Op["video"]>) => void;
  submitInstallation: (opId: string) => boolean;
  startInspection: (opId: string) => void;
  submitInspection: (opId: string) => boolean;
  createActivation: (d: { meterNumber: string; facilityId: string; customer: CustomerInfo; gps: GpsRec; photos: PhotoRec[]; scan: ScanRec; comment: string }) => Op | null;
  requestCode: (type: "tamper" | "clear", d: { meterNumber: string; facilityId: string; via: "manual" | "scan"; comment: string }) => Op | null;
  scheduleInspection: (d: { meterNumber: string; facilityId: string; date: number; instruction: string; durationSec: number }) => Op | null;
  retryZVend: (opId: string) => void;
  retryInspection: (opId: string) => void;
  audit: (action: string, detail: string, txn?: string) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  syncFacilities: () => Promise<void>;
  saveSettings: (patch: Partial<AppState["settings"]>) => void;
  saveZvendConfig: (patch: Partial<AppState["settings"]["zvend"]>) => void;
  togglePerm: (role: Role, perm: string) => void;
  addUser: (d: { name: string; email: string; role: Role }) => void;
  setUserActive: (id: string, active: boolean) => void;
  createDelegation: (d: { start: number; end: number; reason: string }) => void;
  revokeDelegation: (id: string) => void;
  resetDemo: () => void;
}

const Ctx = createContext<StoreCtx | null>(null);

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(load);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [online, setOnline] = useState<boolean>(typeof navigator === "undefined" ? true : navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const onlineRef = useRef(online);
  onlineRef.current = online;

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch { /* storage full — keep running in memory */ }
  }, [state]);

  const mutate = useCallback((fn: (s: AppState) => AppState) => setState(fn), []);

  const toast = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = uid();
    setToasts(t => [...t.slice(-3), { id, text, tone }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4200);
  }, []);

  // -------- helpers --------
  const user = state.users.find(u => u.id === state.currentUserId) || null;
  const delegation = activeDelegation(state.delegations) || null;

  const can = useCallback((perm: string) => {
    if (!user) return false;
    return (state.permissionMatrix[user.role] || []).includes(perm);
  }, [user, state.permissionMatrix]);

  const mkAudit = (s: AppState, action: string, detail: string, txn?: string): AuditEntry[] => {
    const u = s.users.find(x => x.id === s.currentUserId);
    return [{
      id: uid(), at: Date.now(), userId: u?.id ?? "sys", userName: u?.name ?? "ZVend Gateway",
      role: u?.role ?? "SYSTEM", action, detail, txn,
    }];
  };

  const mkNotif = (forRole: Role | "ALL", text: string, kind: Notif["kind"], op?: Op): Notif =>
    ({ id: uid(), at: Date.now(), forRole, text, kind, read: false, opId: op?.id, txn: op?.txn });

  const mkComment = (s: AppState, stage: string, decision: WorkflowComment["decision"], text: string, delegated = false): WorkflowComment => {
    const u = s.users.find(x => x.id === s.currentUserId)!;
    return { id: uid(), userId: u.id, userName: u.name, role: u.role, stage, decision, text, at: Date.now(), delegated };
  };

  const withOp = (s: AppState, opId: string, fn: (op: Op, s: AppState) => Op): AppState => ({
    ...s,
    operations: s.operations.map(o => (o.id === opId ? { ...fn(o, s), updatedAt: Date.now() } : o)),
  });

  const nextTxn = (s: AppState, type: OpType) => {
    const n = s.seq[type] + 1;
    const d = new Date();
    const ds = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    return { txn: `ZADM-${OPS[type].code}-${ds}-${String(n).padStart(6, "0")}`, seq: n };
  };

  // -------- ZVend integration layer (idempotent) --------
  const zvendCall = useCallback((opId: string) => {
    let key = "";
    mutate(s => {
      const op = s.operations.find(o => o.id === opId);
      if (!op) return s;
      key = `${op.txn}:zv:${op.zvend?.attempt ?? 1}:${op.stageIdx}`;
      if (s.idemKeys.includes(key)) {
        return { ...s, audit: [...mkAudit(s, "idempotency_block", `Duplicate ZVend call blocked for ${op.txn}`, op.txn), ...s.audit] };
      }
      const end = op.type === "installation" ? "/api/v1/meters/install"
        : op.type === "activation" ? "/api/v1/meters/activate"
        : op.type === "tamper" ? "/api/v1/meters/tamper-code" : "/api/v1/meters/clear-code";
      return {
        ...s,
        idemKeys: [...s.idemKeys, key],
        apiLogs: [{ id: uid(), at: Date.now(), userName: "ZVend Gateway", operation: end, method: "POST", endpoint: end, txn: op.txn, status: "pending" as const, responseCode: "…", durationMs: 0 }, ...s.apiLogs],
        audit: [...mkAudit(s, "api_request", `POST ${end} — idempotency key ${key.slice(-10)} bound`, op.txn), ...s.audit],
        operations: s.operations.map(o => o.id === opId ? { ...o, zvend: { ...(o.zvend ?? { idemKey: key, status: "pending" as const, requestedAt: Date.now(), attempt: 1 }), idemKey: key, status: "pending" as const, requestedAt: Date.now() } } : o),
      };
    });

    const started = Date.now();
    delay(1500 + Math.random() * 1200).then(() => {
      const ok = Math.random() > 0.1;
      mutate(s => {
        const op = s.operations.find(o => o.id === opId);
        if (!op) return s;
        const dur = Date.now() - started;
        const end = op.type === "installation" ? "/api/v1/meters/install"
          : op.type === "activation" ? "/api/v1/meters/activate"
          : op.type === "tamper" ? "/api/v1/meters/tamper-code" : "/api/v1/meters/clear-code";
        const logs = s.apiLogs.map(l => (l.txn === op.txn && l.status === "pending"
          ? { ...l, status: (ok ? "success" : "failed") as "success" | "failed", responseCode: ok ? "200" : "504", durationMs: dur }
          : l));
        if (!ok) {
          return {
            ...s, apiLogs: logs,
            audit: [...mkAudit(s, "api_response", `ZVend 504 gateway timeout after ${dur} ms — operation parked as ZVEND_FAILED`, op.txn), ...s.audit],
            notifications: [mkNotif("MD", `ZVend call failed for ${op.txn}. Retry available from the record.`, "zvend", op), mkNotif("IT_MANAGER", `ZVend integration timeout on ${end}.`, "system"), ...s.notifications],
            operations: s.operations.map(o => o.id === opId ? { ...o, status: "ZVEND_FAILED" as OpStatus, zvend: { ...o.zvend!, status: "failed", respondedAt: Date.now(), responseCode: "504", error: "Gateway timeout — upstream did not acknowledge within configured window." } } : o),
          };
        }
        const stages = STAGES[op.type];
        const zvIdx = stages.findIndex(st => st.key === "ZVEND");
        const after = stages[zvIdx + 1];
        const ref = `ZVD-${Math.floor(80000 + Math.random() * 19000)}`;
        const tamper = op.type === "installation" || op.type === "tamper" ? gen20() : undefined;
        const clear = op.type === "installation" || op.type === "clear" ? gen20() : undefined;
        const sysComment: WorkflowComment = {
          id: uid(), userId: "sys", userName: "ZVend Gateway", role: "SYSTEM", stage: stages[zvIdx].label,
          decision: "SYSTEM", at: Date.now(),
          text: op.type === "installation" ? `ZVend responded 200 OK · ref ${ref} · 20-digit tamper + clear codes issued.`
            : op.type === "activation" ? `ZVend responded 200 OK · ref ${ref} · meter energized on ZVend.`
            : `ZVend responded 200 OK · ref ${ref} · 20-digit ${op.type} code issued.`,
        };
        return {
          ...s, apiLogs: logs,
          audit: [...mkAudit(s, "api_response", `ZVend 200 OK · ref ${ref} (${dur} ms)`, op.txn), ...s.audit],
          notifications: [mkNotif("SECRETARY", `ZVend completed for ${op.txn} — awaiting your ${op.type === "installation" ? "release" : "confirmation"}.`, "zvend", op), ...s.notifications],
          operations: s.operations.map(o => o.id === opId ? {
            ...o,
            status: after ? after.wait : ("COMPLETED" as OpStatus),
            stageIdx: after ? zvIdx + 1 : o.stageIdx,
            comments: [...o.comments, sysComment],
            zvend: { ...o.zvend!, status: "success", respondedAt: Date.now(), responseCode: "200", reference: ref, tamperCode: tamper, clearCode: clear },
          } : o),
        };
      });
      toast(ok ? "ZVend responded 200 OK" : "ZVend call failed — record parked for retry", ok ? "ok" : "danger");
    });
  }, [mutate, toast]);

  // -------- offline sync --------
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  useEffect(() => {
    if (!online) return;
    const queued = state.operations.filter(o => o.pendingSync).length;
    if (queued === 0) return;
    setSyncing(true);
    const t = setTimeout(() => {
      mutate(s => ({
        ...s,
        operations: s.operations.map(o => (o.pendingSync ? { ...o, pendingSync: false } : o)),
        syncLogs: [{ id: uid(), at: Date.now(), operation: `Offline queue flush (${queued} records)`, status: "success", processed: queued, failed: 0, by: s.users.find(u => u.id === s.currentUserId)?.name ?? "Field device" }, ...s.syncLogs],
        audit: [...mkAudit(s, "sync", `Offline queue synchronized — ${queued} field records pushed`, undefined), ...s.audit],
      }));
      setSyncing(false);
      toast(`Synced ${queued} offline field record${queued > 1 ? "s" : ""} to server`, "ok");
    }, 1400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  const offlineFlag = () => (!onlineRef.current ? { pendingSync: true } : {});

  // -------- auth --------
  const login = (userId: string) => mutate(s => ({
    ...s, currentUserId: userId,
    users: s.users.map(u => (u.id === userId ? { ...u, lastLogin: Date.now() } : u)),
    audit: [...mkAudit({ ...s, currentUserId: userId }, "login", "Signed in to Z Admin"), ...s.audit],
  }));
  const logout = () => mutate(s => ({
    ...s, audit: [...mkAudit(s, "logout", "Signed out"), ...s.audit], currentUserId: null,
  }));

  // -------- generic guards --------
  const guard = (opId: string, needStatus: OpStatus[], perm?: string): Op | null => {
    const op = state.operations.find(o => o.id === opId);
    if (!op) { toast("Record not found", "danger"); return null; }
    if (!needStatus.includes(op.status)) { toast(`Action not allowed — record is ${op.status.replace(/_/g, " ")}`, "warn"); return null; }
    if (perm && !can(perm)) { toast("Your role does not hold this permission", "danger"); return null; }
    return op;
  };

  // -------- creation --------
  const createInstallation: StoreCtx["createInstallation"] = d => {
    if (!user || !can("installation.create")) { toast("Only the Secretary can initiate installations", "danger"); return null; }
    if (!/^\d+$/.test(d.meterNumber.trim())) { toast("Meter number must contain numerals only", "danger"); return null; }
    const num = d.meterNumber.trim();
    if (state.meters.some(m => m.number === num)) { toast("This meter number already exists.", "danger"); return null; }
    if (state.operations.some(o => o.type === "installation" && o.meterNumber === num && !TERMINAL.includes(o.status))) {
      toast("An installation request already exists for this meter.", "danger"); return null;
    }
    let created: Op | null = null;
    mutate(s => {
      const { txn, seq } = nextTxn(s, "installation");
      const op: Op = {
        id: uid(), txn, type: "installation", status: "PENDING_ENERGY_MANAGER", stageIdx: 0,
        meterNumber: num, facilityId: d.facilityId, initiatorId: user.id, initiatorName: user.name, initiatorRole: user.role,
        createdAt: Date.now(), updatedAt: Date.now(), photos: [],
        comments: [mkComment(s, "Initiation", "SUBMIT", d.comment.trim() || "New meter installation request.")],
        ...offlineFlag(),
      };
      created = op;
      return {
        ...s, seq: { ...s.seq, installation: seq },
        meters: [...s.meters, { number: num, facilityId: d.facilityId, model: "ZRK-K1 Prepaid", phase: "1Φ", status: "IN_STOCK" }],
        operations: [op, ...s.operations],
        notifications: [mkNotif("ENERGY_MANAGER", `New meter installation awaiting your approval.`, "approval", op), ...s.notifications],
        audit: [...mkAudit(s, "create", `Installation request created for meter ${num}`, txn), ...s.audit],
      };
    });
    toast(`Installation ${created ? (created as Op).txn : ""} submitted to Energy Manager`, "ok");
    return created;
  };

  const requestCode: StoreCtx["requestCode"] = (type, d) => {
    const allowed = user && ((user.role === "SECRETARY" && can(`${type}.create`)) || (user.role === "TECHNICAL_MAN" && can(`${type}.create`)));
    if (!allowed) { toast("Your role cannot initiate this request", "danger"); return null; }
    if (!/^\d+$/.test(d.meterNumber.trim())) { toast("Meter number must contain numerals only", "danger"); return null; }
    const num = d.meterNumber.trim();
    if (state.operations.some(o => o.type === type && o.meterNumber === num && !TERMINAL.includes(o.status))) {
      toast(`A pending ${type} code request already exists for this meter.`, "warn"); return null;
    }
    let created: Op | null = null;
    mutate(s => {
      const { txn, seq } = nextTxn(s, type);
      const op: Op = {
        id: uid(), txn, type, status: "PENDING_ENERGY_MANAGER", stageIdx: 0,
        meterNumber: num, facilityId: d.facilityId, initiatorId: user!.id, initiatorName: user!.name, initiatorRole: user!.role,
        createdAt: Date.now(), updatedAt: Date.now(), photos: [],
        comments: [mkComment(s, "Initiation", "SUBMIT", d.comment.trim() || `${type === "tamper" ? "Tamper" : "Clear"} code requested via ${d.via === "scan" ? "barcode scan" : "manual entry"}.`)],
        scan: d.via === "scan" ? { value: num, matched: true, at: Date.now() } : undefined,
        ...offlineFlag(),
      };
      created = op;
      return {
        ...s, seq: { ...s.seq, [type]: seq },
        operations: [op, ...s.operations],
        notifications: [mkNotif("ENERGY_MANAGER", `New ${type} code request awaiting your approval.`, "approval", op), ...s.notifications],
        audit: [...mkAudit(s, "create", `${type === "tamper" ? "Tamper" : "Clear"} code request created for meter ${num} (${d.via})`, txn),
        ...(d.via === "scan" ? mkAudit(s, "barcode_scan", `Scanned ${num} — matched authorized meter`, txn) : []), ...s.audit],
      };
    });
    toast(`Request ${created ? (created as Op).txn : ""} submitted to Energy Manager`, "ok");
    return created;
  };

  const scheduleInspection: StoreCtx["scheduleInspection"] = d => {
    if (!user || user.role !== "GENERAL_MANAGER" || !can("inspection.create")) { toast("Only the General Manager schedules inspections", "danger"); return null; }
    let created: Op | null = null;
    mutate(s => {
      const { txn, seq } = nextTxn(s, "inspection");
      const op: Op = {
        id: uid(), txn, type: "inspection", status: "SCHEDULED", stageIdx: 1,
        meterNumber: d.meterNumber, facilityId: d.facilityId, initiatorId: user.id, initiatorName: user.name, initiatorRole: user.role,
        createdAt: Date.now(), updatedAt: Date.now(), photos: [],
        instruction: d.instruction, scheduledFor: d.date, durationSec: d.durationSec,
        comments: [mkComment(s, "GM Scheduling", "SCHEDULE", d.instruction + ` Duration ${Math.round(d.durationSec / 60)} minute${d.durationSec >= 120 ? "s" : ""}.`)],
      };
      created = op;
      return {
        ...s, seq: { ...s.seq, inspection: seq },
        operations: [op, ...s.operations],
        notifications: [mkNotif("TECHNICAL_MAN", `Inspection scheduled — meter ${d.meterNumber} · ${Math.round(d.durationSec / 60)} min video.`, "field", op), ...s.notifications],
        audit: [...mkAudit(s, "schedule", `Inspection scheduled for meter ${d.meterNumber} (${d.durationSec}s video)`, txn), ...s.audit],
      };
    });
    toast(`Inspection ${created ? (created as Op).txn : ""} scheduled for Technical Man`, "ok");
    return created;
  };

  const createActivation: StoreCtx["createActivation"] = d => {
    if (!user || user.role !== "TECHNICAL_MAN" || !can("activation.create")) { toast("Only the Technical Man initiates activations", "danger"); return null; }
    if (state.meters.find(m => m.number === d.meterNumber)?.status !== "INSTALLED") { toast("Meter must be INSTALLED before activation", "warn"); return null; }
    let created: Op | null = null;
    mutate(s => {
      const { txn, seq } = nextTxn(s, "activation");
      const op: Op = {
        id: uid(), txn, type: "activation", status: "PENDING_SECRETARY", stageIdx: 1,
        meterNumber: d.meterNumber, facilityId: d.facilityId, initiatorId: user.id, initiatorName: user.name, initiatorRole: user.role,
        createdAt: Date.now(), updatedAt: Date.now(), photos: d.photos, gps: d.gps, scan: d.scan, customer: d.customer,
        comments: [mkComment(s, "Field Activation Capture", "SUBMIT", d.comment.trim() || "Physical activation completed. Evidence captured on site.")],
        ...offlineFlag(),
      };
      created = op;
      return {
        ...s, seq: { ...s.seq, activation: seq },
        operations: [op, ...s.operations],
        notifications: [mkNotif("SECRETARY", "Meter activation requires your review.", "approval", op), ...s.notifications],
        audit: [
          ...mkAudit(s, "barcode_scan", `Scanned ${d.meterNumber} — ${d.scan.matched ? "matched" : "MISMATCH"} authorized meter`, txn),
          ...mkAudit(s, "gps_capture", `GPS captured ±${d.gps.accuracy} m (${d.gps.source})`, txn),
          ...mkAudit(s, "photo_capture", `${d.photos.length} activation photos captured`, txn),
          ...mkAudit(s, "submit", "Activation submitted for Secretary review", txn),
          ...s.audit,
        ],
      };
    });
    toast(`Activation ${created ? (created as Op).txn : ""} submitted for review`, "ok");
    return created;
  };

  // -------- workflow decisions --------
  const decide: StoreCtx["decide"] = (opId, decision, comment) => {
    const op = state.operations.find(o => o.id === opId);
    if (!op || !user) return false;
    if (!can(`${op.type}.approve`)) { toast("Your role does not hold approval permission for this operation", "danger"); return false; }
    if (!["PENDING_ENERGY_MANAGER", "PENDING_GM", "PENDING_MD", "PENDING_SECRETARY"].includes(op.status)) {
      toast("Record is not awaiting a decision", "warn"); return false;
    }
    const actor = actionableBy(op, !!delegation);
    if (actor !== user.role) { toast(`This stage belongs to ${String(actor).replace(/_/g, " ")}`, "danger"); return false; }
    if (!comment.trim()) { toast("A comment is required at every workflow stage", "danger"); return false; }
    const delegated = op.status === "PENDING_MD" && user.role === "GENERAL_MANAGER";
    mutate(s => {
      const cur = s.operations.find(o => o.id === opId)!;
      const stages = STAGES[cur.type];
      const stage = stages[cur.stageIdx];
      const c = mkComment(s, stage.label, decision, comment.trim() + (delegated ? " — Approved under MD delegation." : ""), delegated);
      let status: OpStatus = cur.status;
      let stageIdx = cur.stageIdx;
      let extra: Partial<Op> = {};
      const notifs: Notif[] = [];
      if (decision === "APPROVE") {
        const next = stages[cur.stageIdx + 1];
        if (!next) {
          status = "COMPLETED";
          notifs.push(mkNotif("ALL", `${OPS[cur.type].label} ${cur.txn} approved and completed by MD.`, "approval", cur));
        } else {
          stageIdx = cur.stageIdx + 1;
          status = next.role === "ZVEND" ? "WAITING_ZVEND" : next.wait;
          if (next.role === "ZVEND") notifs.push(mkNotif("IT_MANAGER", `${OPS[cur.type].label} ${cur.txn} approved by MD — ZVend call in progress.`, "zvend", cur));
          else notifs.push(mkNotif(next.role as Role, `${OPS[cur.type].label} awaiting your ${next.key === "DELIVER" || next.key === "CONFIRM" ? "confirmation" : "approval"} · ${cur.txn}`, "approval", cur));
        }
      } else if (decision === "REJECT") {
        status = "REJECTED";
        extra = { returnedFrom: stage.key };
        notifs.push(mkNotif(cur.type === "inspection" ? "TECHNICAL_MAN" : cur.initiatorRole,
          cur.type === "inspection" ? `Inspection rejected — technical action required · ${cur.txn}` : `${OPS[cur.type].label} ${cur.txn} was rejected at ${stage.label}.`, "approval", cur));
      } else {
        // RETURN — send back one stage
        if (cur.stageIdx === 0) { status = "RETURNED"; extra = { returnedFrom: stage.key }; }
        else {
          stageIdx = cur.stageIdx - 1;
          status = stages[stageIdx].wait;
          if (cur.type === "activation" && stageIdx === 0) status = "IN_PROGRESS";
        }
        notifs.push(mkNotif(cur.initiatorRole, `${OPS[cur.type].label} ${cur.txn} returned for revision at ${stage.label}.`, "approval", cur));
      }
      return {
        ...s,
        operations: s.operations.map(o => o.id === opId ? { ...o, status, stageIdx, comments: [...o.comments, c], ...extra } : o),
        notifications: [...notifs, ...s.notifications],
        audit: [...mkAudit(s, decision.toLowerCase(), `${decision} at ${stage.label}${delegated ? " (under MD delegation)" : ""} — "${comment.trim().slice(0, 80)}"`, cur.txn), ...s.audit],
      };
    });
    toast(`${decision === "APPROVE" ? "Approved" : decision === "REJECT" ? "Rejected" : "Returned"} · ${op.txn}`, decision === "REJECT" ? "warn" : "ok");
    const updated = state.operations.find(o => o.id === opId);
    if (decision === "APPROVE") {
      // trigger ZVend after state applied — find the would-be next stage
      const stages = STAGES[op.type];
      if (stages[op.stageIdx + 1]?.role === "ZVEND") setTimeout(() => zvendCall(opId), 350);
    }
    void updated;
    return true;
  };

  const resubmit: StoreCtx["resubmit"] = opId => {
    const op = guard(opId, ["RETURNED", "IN_PROGRESS"], undefined);
    if (!op || !user) return;
    mutate(s => {
      const cur = s.operations.find(o => o.id === opId)!;
      const stages = STAGES[cur.type];
      let stageIdx = cur.stageIdx, status: OpStatus;
      if (cur.type === "activation" && cur.stageIdx === 0) { stageIdx = 1; status = "PENDING_SECRETARY"; }
      else if (cur.type === "inspection") { stageIdx = 1; status = "IN_PROGRESS"; }
      else { stageIdx = 0; status = stages[0].wait; }
      const c = mkComment(s, stageOfLabel(cur, stageIdx), "RESUBMIT", "Resubmitted after return — record re-enters the approval chain.");
      return {
        ...s,
        operations: s.operations.map(o => o.id === opId ? { ...o, stageIdx, status, comments: [...o.comments, c] } : o),
        notifications: [mkNotif(stageIdx === 0 ? "ENERGY_MANAGER" : (STAGES[cur.type][stageIdx].role as Role), `${OPS[cur.type].label} ${cur.txn} resubmitted for review.`, "approval", cur), ...s.notifications],
        audit: [...mkAudit(s, "resubmit", `Record resubmitted at ${stageOfLabel(cur, stageIdx)}`, cur.txn), ...s.audit],
      };
    });
    toast("Record resubmitted into the workflow", "ok");
  };

  const stageOfLabel = (op: Op, idx: number) => STAGES[op.type][Math.min(idx, STAGES[op.type].length - 1)].label;

  const releaseToTech: StoreCtx["releaseToTech"] = opId => {
    const op = guard(opId, ["ZVEND_SUCCESS"], "installation.approve");
    if (!op || op.type !== "installation" || !user || user.role !== "SECRETARY") { toast("Only the Secretary releases installations to the field", "danger"); return; }
    mutate(s => {
      const cur = s.operations.find(o => o.id === opId)!;
      const fieldIdx = STAGES.installation.findIndex(st => st.key === "FIELD");
      return {
        ...s,
        operations: s.operations.map(o => o.id === opId ? { ...o, status: "ASSIGNED" as OpStatus, stageIdx: fieldIdx, comments: [...o.comments, mkComment(s, "Secretary Release", "RELEASE", "Codes verified against ZVend response. Made available to Technical Man.")] } : o),
        notifications: [mkNotif("TECHNICAL_MAN", `Installation task assigned to you · meter ${cur.meterNumber} at ${s.facilities.find(f => f.id === cur.facilityId)?.name}.`, "field", cur), ...s.notifications],
        audit: [...mkAudit(s, "release", "Installation released to Technical Man with ZVend codes", cur.txn), ...s.audit],
      };
    });
    toast("Installation made available to Technical Man", "ok");
  };

  const confirmCompletion: StoreCtx["confirmCompletion"] = opId => {
    const op = state.operations.find(o => o.id === opId);
    if (!op || op.status !== "ZVEND_SUCCESS" || !user) return;
    const allowed = user.role === "SECRETARY" || op.initiatorId === user.id;
    if (!allowed) { toast("Only the Secretary or the initiator can confirm delivery", "danger"); return; }
    mutate(s => {
      const cur = s.operations.find(o => o.id === opId)!;
      const label = cur.type === "activation" ? "Secretary Completion" : "Code Delivery Confirmation";
      const notifs: Notif[] = [mkNotif(cur.initiatorRole, `${OPS[cur.type].label} ${cur.txn} completed — ${cur.type === "activation" ? "meter energized on ZVend" : "code delivery confirmed"}.`, "system", cur)];
      return {
        ...s,
        operations: s.operations.map(o => o.id === opId ? { ...o, status: "COMPLETED" as OpStatus, comments: [...o.comments, mkComment(s, label, "CONFIRM", cur.type === "activation" ? "ZVend confirmation received. Workflow completed." : "Code delivered to field officer over secure channel.")] } : o),
        meters: cur.type === "activation" ? s.meters.map(m => m.number === cur.meterNumber ? { ...m, status: "ACTIVE" as const, activatedAt: Date.now(), customerName: cur.customer?.name } : m) : s.meters,
        notifications: [...notifs, ...s.notifications],
        audit: [...mkAudit(s, "complete", `${label} — workflow closed`, cur.txn), ...s.audit],
      };
    });
    toast(`${op.txn} completed`, "ok");
  };

  // -------- field execution --------
  const startField: StoreCtx["startField"] = opId => {
    const op = guard(opId, ["ASSIGNED"], "installation.execute");
    if (!op || !user || user.role !== "TECHNICAL_MAN") { toast("Only the Technical Man executes field installations", "danger"); return; }
    mutate(s => ({
      ...s,
      operations: s.operations.map(o => o.id === opId ? { ...o, status: "IN_PROGRESS" as OpStatus, comments: [...o.comments, mkComment(s, "Technical Execution", "START", "Started field installation.")] } : o),
      audit: [...mkAudit(s, "start", "Field installation started", op.txn), ...s.audit],
    }));
    toast("Installation started — begin with barcode verification", "info");
  };

  const saveScan: StoreCtx["saveScan"] = (opId, scan) => mutate(s => ({
    ...s,
    operations: s.operations.map(o => o.id === opId ? { ...o, scan } : o),
    audit: [...mkAudit(s, "barcode_scan", `Scanned ${scan.value} — ${scan.matched ? "METER VERIFIED" : "METER NUMBER MISMATCH"}`, s.operations.find(o => o.id === opId)?.txn), ...s.audit],
  }));

  const saveGps: StoreCtx["saveGps"] = (opId, gps) => mutate(s => {
    const max = s.settings.maxGpsAccuracyM;
    const accepted = gps.accuracy <= max;
    const txn = s.operations.find(o => o.id === opId)?.txn;
    return {
      ...s,
      operations: s.operations.map(o => o.id === opId ? { ...o, gps: { ...gps, accepted }, gpsFailed: !accepted } : o),
      audit: [
        ...mkAudit(s, "gps_capture", `GPS captured ±${gps.accuracy} m (${gps.source})`, txn),
        ...(!accepted ? mkAudit(s, "suspicious_gps", `GPS accuracy ${gps.accuracy} m exceeds allowed ${max} m — operation blocked`, txn) : []),
        ...s.audit,
      ],
    };
  });

  const addPhoto: StoreCtx["addPhoto"] = (opId, photo) => mutate(s => ({
    ...s,
    operations: s.operations.map(o => o.id === opId ? { ...o, photos: [...o.photos, photo] } : o),
    audit: [...mkAudit(s, "photo_capture", `Photo captured: ${photo.label}`, s.operations.find(o => o.id === opId)?.txn), ...s.audit],
  }));

  const saveCustomer: StoreCtx["saveCustomer"] = (opId, c) => mutate(s => ({
    ...s, operations: s.operations.map(o => o.id === opId ? { ...o, customer: c } : o),
  }));

  const saveObservations: StoreCtx["saveObservations"] = (opId, text) => mutate(s => ({
    ...s, operations: s.operations.map(o => o.id === opId ? { ...o, observations: text } : o),
  }));

  const saveVideo: StoreCtx["saveVideo"] = (opId, v) => mutate(s => ({
    ...s,
    operations: s.operations.map(o => o.id === opId ? { ...o, video: v } : o),
    audit: [...mkAudit(s, "video_capture", `Inspection video captured — ${v.durationSec}s (${v.simulated ? "device-simulated" : "device"})`, s.operations.find(o => o.id === opId)?.txn), ...s.audit],
  }));

  const submitInstallation: StoreCtx["submitInstallation"] = opId => {
    const op = guard(opId, ["IN_PROGRESS"], "installation.execute");
    if (!op || !user || user.role !== "TECHNICAL_MAN") { toast("Only the Technical Man completes installations", "danger"); return false; }
    if (!op.scan?.matched) { toast("Barcode verification is required", "danger"); return false; }
    if (!op.gps?.accepted) { toast("GPS within allowed accuracy is required", "danger"); return false; }
    if (op.photos.length < 4) { toast(`Capture all 4 required photos (${op.photos.length}/4)`, "danger"); return false; }
    if (!op.customer?.name || !op.customer?.phone) { toast("Customer name and phone are required", "danger"); return false; }
    mutate(s => ({
      ...s,
      operations: s.operations.map(o => o.id === opId ? { ...o, status: "COMPLETED" as OpStatus, comments: [...o.comments, mkComment(s, "Technical Execution", "COMPLETE", `Installation completed. 4 photos captured, GPS accuracy ${o.gps?.accuracy} m. Customer details recorded for activation.`)], ...offlineFlag() } : o),
      meters: s.meters.map(m => m.number === op.meterNumber ? { ...m, status: "INSTALLED" as const, installedAt: Date.now(), customerName: op.customer?.name } : m),
      notifications: [mkNotif("SECRETARY", `Installation ${op.txn} completed in the field.`, "field", op), ...s.notifications],
      audit: [...mkAudit(s, "complete", "Field installation completed with full evidence pack", op.txn), ...s.audit],
    }));
    toast(`${op.txn} completed — meter marked INSTALLED`, "ok");
    return true;
  };

  const startInspection: StoreCtx["startInspection"] = opId => {
    const op = guard(opId, ["SCHEDULED", "REJECTED"], "inspection.execute");
    if (!op || !user || user.role !== "TECHNICAL_MAN") { toast("Only the Technical Man performs inspections", "danger"); return; }
    mutate(s => ({
      ...s,
      operations: s.operations.map(o => o.id === opId ? {
        ...o, status: "IN_PROGRESS" as OpStatus,
        stageIdx: o.type === "inspection" ? 1 : o.stageIdx,
        retryCount: o.status === "REJECTED" ? (o.retryCount ?? 0) + 1 : o.retryCount,
        gpsFailed: false, scan: undefined, gps: undefined, video: undefined, observations: undefined,
        comments: [...o.comments, mkComment(s, "Field Inspection", o.status === "REJECTED" ? "RETRY" : "START", o.status === "REJECTED" ? "Re-inspection started after rejection." : "Started field inspection.")],
      } : o),
      audit: [...mkAudit(s, "start", op.status === "REJECTED" ? "Inspection retry started" : "Inspection started", op.txn), ...s.audit],
    }));
    toast("Inspection started — verify the meter barcode", "info");
  };

  const submitInspection: StoreCtx["submitInspection"] = opId => {
    const op = guard(opId, ["IN_PROGRESS"], "inspection.execute");
    if (!op || !user || user.role !== "TECHNICAL_MAN") return false;
    if (!op.scan?.matched) { toast("Barcode verification is required", "danger"); return false; }
    if (!op.gps?.accepted) { toast("GPS within allowed accuracy is required", "danger"); return false; }
    if (!op.video) { toast("Inspection video is required", "danger"); return false; }
    if (!op.observations?.trim()) { toast("Inspection observations are required", "danger"); return false; }
    mutate(s => ({
      ...s,
      operations: s.operations.map(o => o.id === opId ? { ...o, status: "PENDING_SECRETARY" as OpStatus, stageIdx: 2, comments: [...o.comments, mkComment(s, "Field Inspection", "SUBMIT", op.observations!.trim())], ...offlineFlag() } : o),
      notifications: [mkNotif("SECRETARY", `Inspection evidence submitted for review · ${op.txn}`, "field", op), ...s.notifications],
      audit: [...mkAudit(s, "submit", "Inspection evidence submitted (video + GPS + observations)", op.txn), ...s.audit],
    }));
    toast(`${op.txn} submitted for Secretary review`, "ok");
    return true;
  };

  const retryZVend: StoreCtx["retryZVend"] = opId => {
    const op = guard(opId, ["ZVEND_FAILED"]);
    if (!op || !user || !["MD", "IT_MANAGER", "SUPER_ADMIN"].includes(user.role)) { toast("Retry is limited to MD / IT Manager / Super Admin", "danger"); return; }
    mutate(s => ({
      ...s,
      operations: s.operations.map(o => o.id === opId ? { ...o, status: "WAITING_ZVEND" as OpStatus, zvend: { ...o.zvend!, status: "pending", attempt: o.zvend!.attempt + 1, error: undefined } } : o),
      audit: [...mkAudit(s, "retry", `ZVend call retried (attempt ${(op.zvend?.attempt ?? 1) + 1})`, op.txn), ...s.audit],
    }));
    toast("Retrying ZVend call…", "info");
    setTimeout(() => zvendCall(opId), 300);
  };

  const retryInspection: StoreCtx["retryInspection"] = opId => {
    const op = guard(opId, ["REJECTED"], "inspection.execute");
    if (!op || op.type !== "inspection") return;
    startInspection(opId);
  };

  const audit: StoreCtx["audit"] = (action, detail, txn) => mutate(s => ({ ...s, audit: [...mkAudit(s, action, detail, txn), ...s.audit] }));

  const markRead: StoreCtx["markRead"] = id => mutate(s => ({ ...s, notifications: s.notifications.map(n => n.id === id ? { ...n, read: true } : n) }));
  const markAllRead: StoreCtx["markAllRead"] = () => mutate(s => ({
    ...s,
    notifications: s.notifications.map(n => (n.forRole === "ALL" || (user && (n.forRole === user.role || n.forUser === user.id)) ? { ...n, read: true } : n)),
  }));

  const syncFacilities: StoreCtx["syncFacilities"] = async () => {
    setSyncing(true);
    await delay(1600);
    mutate(s => ({
      ...s,
      lastFacilitySync: Date.now(),
      facilities: s.facilities.map(f => ({ ...f, lastSyncedAt: Date.now(), metersCount: f.metersCount + (Math.random() > 0.7 ? 1 : 0) })),
      syncLogs: [{ id: uid(), at: Date.now(), operation: "Facility refresh (manual)", status: "success" as const, processed: s.facilities.length, failed: 0, by: user?.name ?? "System" }, ...s.syncLogs],
      audit: [...mkAudit(s, "sync", `Facility refresh from ZVend — ${s.facilities.length} facilities processed`), ...s.audit],
    }));
    setSyncing(false);
    toast("Facilities refreshed from ZVend", "ok");
  };

  const saveSettings: StoreCtx["saveSettings"] = patch => {
    mutate(s => ({ ...s, settings: { ...s.settings, ...patch }, audit: [...mkAudit(s, "settings_change", `System settings updated (${Object.keys(patch).join(", ")})`), ...s.audit] }));
    toast("System settings saved", "ok");
  };
  const saveZvendConfig: StoreCtx["saveZvendConfig"] = patch => {
    mutate(s => ({ ...s, settings: { ...s.settings, zvend: { ...s.settings.zvend, ...patch } }, audit: [...mkAudit(s, "api_config", `ZVend API configuration updated (${Object.keys(patch).join(", ")})`), ...s.audit] }));
    toast("ZVend configuration saved", "ok");
  };
  const togglePerm: StoreCtx["togglePerm"] = (role, perm) => mutate(s => {
    const has = (s.permissionMatrix[role] || []).includes(perm);
    return {
      ...s,
      permissionMatrix: { ...s.permissionMatrix, [role]: has ? s.permissionMatrix[role].filter(p => p !== perm) : [...(s.permissionMatrix[role] || []), perm] },
      audit: [...mkAudit(s, "permission_change", `${has ? "Revoked" : "Granted"} ${perm} for ${role}`), ...s.audit],
    };
  });
  const addUser: StoreCtx["addUser"] = d => {
    mutate(s => ({
      ...s,
      users: [...s.users, { id: uid(), name: d.name, email: d.email, role: d.role, active: true, createdAt: Date.now() }],
      audit: [...mkAudit(s, "user_change", `User account created — ${d.name} (${d.role})`), ...s.audit],
    }));
    toast(`User ${d.name} created`, "ok");
  };
  const setUserActive: StoreCtx["setUserActive"] = (id, active) => {
    if (id === state.currentUserId) { toast("You cannot deactivate your own account", "warn"); return; }
    mutate(s => ({
      ...s,
      users: s.users.map(u => u.id === id ? { ...u, active } : u),
      audit: [...mkAudit(s, "user_change", `User ${s.users.find(u => u.id === id)?.name} ${active ? "activated" : "deactivated"}`), ...s.audit],
    }));
    toast(`User ${active ? "activated" : "deactivated"}`, "ok");
  };
  const createDelegation: StoreCtx["createDelegation"] = d => {
    if (!user || user.role !== "MD") { toast("Only the MD can delegate approval authority", "danger"); return; }
    const gm = state.users.find(u => u.role === "GENERAL_MANAGER" && u.active);
    if (!gm) { toast("No active General Manager found", "danger"); return; }
    mutate(s => ({
      ...s,
      delegations: [{ id: uid(), mdId: user.id, mdName: user.name, gmId: gm.id, gmName: gm.name, start: d.start, end: d.end, reason: d.reason, status: "ACTIVE" }, ...s.delegations],
      notifications: [mkNotif("GENERAL_MANAGER", `MD delegated final approval authority to you until ${new Date(d.end).toLocaleDateString("en-GB")}.`, "system"), ...s.notifications],
      audit: [...mkAudit(s, "delegation", `MD approval authority delegated to ${gm.name} (${d.reason})`), ...s.audit],
    }));
    toast("Delegation created — GM can now act on MD approvals", "ok");
  };
  const revokeDelegation: StoreCtx["revokeDelegation"] = id => mutate(s => ({
    ...s,
    delegations: s.delegations.map(d => d.id === id ? { ...d, status: "REVOKED" as const } : d),
    audit: [...mkAudit(s, "delegation", "MD delegation revoked"), ...s.audit],
  }));

  const resetDemo = () => {
    const fresh = buildSeed();
    setState({ ...fresh, currentUserId: state.currentUserId });
    toast("Demo data reset to seeded state", "info");
  };

  const value = useMemo<StoreCtx>(() => ({
    state, user, online, syncing, toasts, can, delegation,
    toast, dismissToast: id => setToasts(t => t.filter(x => x.id !== id)),
    login, logout,
    createInstallation, resubmit, decide, releaseToTech, confirmCompletion, startField,
    saveScan, saveGps, addPhoto, saveCustomer, saveObservations, saveVideo,
    submitInstallation, startInspection, submitInspection, createActivation, requestCode,
    scheduleInspection, retryZVend, retryInspection, audit, markRead, markAllRead,
    syncFacilities, saveSettings, saveZvendConfig, togglePerm, addUser, setUserActive,
    createDelegation, revokeDelegation, resetDemo,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [state, user, online, syncing, toasts, can, delegation]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): StoreCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore outside provider");
  return v;
}
