import type {
  AppState, AuditEntry, Customer, Delegation, Facility, Meter, Notif, Op, OpType,
  Role, User, WorkflowComment,
} from "./types";
import { DEFAULT_MATRIX, gen20, STAGES, uid } from "./types";

const now = Date.now();
const H = 3600_000;
const D = 24 * H;

let auditSeq = 0;
const aud = (at: number, userId: string, userName: string, role: Role | "SYSTEM", action: string, detail: string, txn?: string): AuditEntry =>
  ({ id: "a" + ++auditSeq + uid().slice(0, 4), at, userId, userName, role, action, detail, txn });

let comSeq = 0;
const com = (userId: string, userName: string, role: Role | "SYSTEM", stage: string, decision: WorkflowComment["decision"], text: string, at: number, delegated = false): WorkflowComment =>
  ({ id: "c" + ++comSeq + uid().slice(0, 4), userId, userName, role, stage, decision, text, at, delegated });

interface OpSpec {
  type: OpType; meter: string; facilityId: string;
  initiator: User; status: Op["status"]; stageIdx: number;
  created: number; updated: number;
  chain: WorkflowComment[];
  customer?: Op["customer"]; gps?: Op["gps"]; photos?: Op["photos"];
  video?: Op["video"]; scan?: Op["scan"]; zvend?: Op["zvend"];
  instruction?: string; observations?: string; scheduledFor?: number; durationSec?: number;
  retryCount?: number;
}

const mk = (s: OpSpec, seqNum: number): Op => {
  const code = { installation: "INS", activation: "ACT", inspection: "INSP", tamper: "TMP", clear: "CLR" }[s.type];
  const d = new Date(s.created);
  const ds = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return {
    id: "op" + seqNum + s.type.slice(0, 2), txn: `ZADM-${code}-${ds}-${String(seqNum).padStart(6, "0")}`,
    type: s.type, status: s.status, stageIdx: s.stageIdx, meterNumber: s.meter, facilityId: s.facilityId,
    initiatorId: s.initiator.id, initiatorName: s.initiator.name, initiatorRole: s.initiator.role,
    createdAt: s.created, updatedAt: s.updated, comments: s.chain,
    customer: s.customer, gps: s.gps, photos: s.photos ?? [], video: s.video, scan: s.scan,
    zvend: s.zvend, instruction: s.instruction, observations: s.observations,
    scheduledFor: s.scheduledFor, durationSec: s.durationSec, retryCount: s.retryCount,
  };
};

const gps = (f: Facility, at: number, acc = 12): NonNullable<Op["gps"]> =>
  ({ lat: +(f.lat + (Math.random() - 0.5) * 0.002).toFixed(6), lng: +(f.lng + (Math.random() - 0.5) * 0.002).toFixed(6), accuracy: acc, at, source: "device", accepted: true });

export function buildSeed(): AppState {
  // ---------------- users ----------------
  const users: User[] = [
    { id: "u-super", name: "Samuel Adisa", role: "SUPER_ADMIN", email: "s.adisa@zarox.energy", active: true, createdAt: now - 320 * D },
    { id: "u-sec", name: "Amara Nwosu", role: "SECRETARY", email: "a.nwosu@zarox.energy", active: true, createdAt: now - 300 * D, lastLogin: now - 2 * H },
    { id: "u-tech", name: "Kelechi Obi", role: "TECHNICAL_MAN", email: "k.obi@zarox.energy", active: true, createdAt: now - 280 * D, lastLogin: now - 35 * 60000 },
    { id: "u-em", name: "Yusuf Danladi", role: "ENERGY_MANAGER", email: "y.danladi@zarox.energy", active: true, createdAt: now - 260 * D, lastLogin: now - 5 * H },
    { id: "u-gm", name: "Grace Okonkwo", role: "GENERAL_MANAGER", email: "g.okonkwo@zarox.energy", active: true, createdAt: now - 260 * D, lastLogin: now - D },
    { id: "u-md", name: "Chukwuma Eze", role: "MD", email: "c.eze@zarox.energy", active: true, createdAt: now - 320 * D, lastLogin: now - 3 * H },
    { id: "u-it", name: "Bisi Adeleke", role: "IT_MANAGER", email: "b.adeleke@zarox.energy", active: true, createdAt: now - 200 * D, lastLogin: now - 26 * H },
  ];
  const [SU, SEC, TECH, EM, GM, MD] = users;

  // ---------------- facilities ----------------
  const facilities: Facility[] = [
    { id: "f1", code: "ZRK-IK01", name: "Ikota Substation", region: "Lekki Corridor", address: "Km 24 Lekki–Epe Expressway, Lagos", lat: 6.4432, lng: 3.5544, feeder: "FDR-IK01-11kV", status: "ACTIVE", metersCount: 214, customersCount: 188, lastSyncedAt: now - 6 * H },
    { id: "f2", code: "ZRK-LK04", name: "Lekki Feeder 4", region: "Lekki Phase 1", address: "Admiralty Way, Lekki Phase 1, Lagos", lat: 6.4478, lng: 3.4722, feeder: "FDR-LK04-11kV", status: "ACTIVE", metersCount: 167, customersCount: 149, lastSyncedAt: now - 6 * H },
    { id: "f3", code: "ZRK-AJ02", name: "Ajah Town Hall", region: "Ajah", address: "42 Lagos–Badagry Rd, Ajah", lat: 6.4661, lng: 3.5852, feeder: "FDR-AJ02-33kV", status: "ACTIVE", metersCount: 96, customersCount: 91, lastSyncedAt: now - 6 * H },
    { id: "f4", code: "ZRK-SG03", name: "Sangotedo Market", region: "Sangotedo", address: "Sangotedo Shopping Mile, Lekki–Epe Rd", lat: 6.4548, lng: 3.6228, feeder: "FDR-SG03-11kV", status: "ACTIVE", metersCount: 58, customersCount: 57, lastSyncedAt: now - 6 * H },
    { id: "f5", code: "ZRK-VG01", name: "VGC Estate Gate", region: "Victoria Garden City", address: "VGC Main Gate, Km 26 Lekki–Epe Rd", lat: 6.4396, lng: 3.5931, feeder: "FDR-VG01-11kV", status: "ACTIVE", metersCount: 121, customersCount: 117, lastSyncedAt: now - 6 * H },
    { id: "f6", code: "ZRK-AA05", name: "Abraham Adesanya Hub", region: "Gbagada", address: "18 Abraham Adesanya Crescent, Gbagada", lat: 6.5481, lng: 3.3697, feeder: "FDR-AA05-33kV", status: "ACTIVE", metersCount: 74, customersCount: 70, lastSyncedAt: now - 30 * H },
  ];

  // ---------------- customers ----------------
  const mkCust = (id: string, name: string, phone: string, email: string, address: string, facilityId: string, meters: string[], sinceDays: number): Customer =>
    ({ id, name, phone, email, address, facilityId, meters, since: now - sinceDays * D });
  const customers: Customer[] = [
    mkCust("c1", "John Joe", "0803 442 1170", "john.joe@gmail.com", "14 Freedom Way, Lekki", "f2", ["45039812746", "45039902211"], 420),
    mkCust("c2", "Adewale Okafor", "0805 118 9034", "a.okafor@yahoo.com", "Plot 7 Ikota Villa Estate", "f1", ["45039812801"], 380),
    mkCust("c3", "Chinelo Eze", "0812 664 2290", "chinelo.e@outlook.com", "23 Admiralty Rd, Lekki", "f2", ["45039812822"], 310),
    mkCust("c4", "Ibrahim Musa", "0806 301 7745", "i.musa@gmail.com", "5 Ajah Rd, by Town Hall", "f3", ["45039812875"], 290),
    mkCust("c5", "Folake Adeyemi", "0809 552 8811", "folake.ade@gmail.com", "9 Sangotedo Rd", "f4", ["45039812903"], 260),
    mkCust("c6", "Emeka Obi", "0803 990 4412", "emeka.obi@gmail.com", "VGC Close 4, House 11", "f5", ["45039812944"], 210),
    mkCust("c7", "Aisha Bello", "0812 004 6621", "aisha.bello@gmail.com", "30 Gbagada Rd", "f6", ["45039812990"], 150),
    mkCust("c8", "Tunde Balogun", "0805 771 2398", "t.balogun@yahoo.com", "Ikota Shopping Complex, Block B", "f1", ["45039813015"], 120),
    mkCust("c9", "Ngozi Umeh", "0806 448 9012", "ngozi.umeh@gmail.com", "17 Freedom Way, Lekki", "f2", [], 60),
    mkCust("c10", "Segun Ajayi", "0809 112 7789", "segun.ajayi@gmail.com", "8 Lekki Gardens Gate", "f2", [], 20),
  ];

  // ---------------- meters ----------------
  const mkM = (number: string, facilityId: string, status: Meter["status"], customerName?: string, extra?: Partial<Meter>): Meter =>
    ({ number, facilityId, model: "ZRK-K1 Prepaid", phase: Math.random() > 0.8 ? "3Φ" : "1Φ", status, customerName, ...extra });
  const meters: Meter[] = [
    mkM("45039812746", "f2", "ACTIVE", "John Joe", { installedAt: now - 90 * D, activatedAt: now - 88 * D }),
    mkM("45039902211", "f2", "ACTIVE", "John Joe", { installedAt: now - 30 * D, activatedAt: now - 28 * D }),
    mkM("45039812801", "f1", "ACTIVE", "Adewale Okafor", { installedAt: now - 120 * D, activatedAt: now - 118 * D }),
    mkM("45039812822", "f2", "ACTIVE", "Chinelo Eze", { installedAt: now - 80 * D, activatedAt: now - 78 * D }),
    mkM("45039812875", "f3", "ACTIVE", "Ibrahim Musa", { installedAt: now - 60 * D, activatedAt: now - 59 * D }),
    mkM("45039812903", "f4", "ACTIVE", "Folake Adeyemi", { installedAt: now - 45 * D, activatedAt: now - 44 * D }),
    mkM("45039812944", "f5", "ACTIVE", "Emeka Obi", { installedAt: now - 40 * D, activatedAt: now - 38 * D }),
    mkM("45039812990", "f6", "FAULTY", "Aisha Bello", { installedAt: now - 100 * D, activatedAt: now - 98 * D }),
    mkM("45039813015", "f1", "INSTALLED", "Tunde Balogun", { installedAt: now - 6 * D }),
    mkM("45039813102", "f1", "INSTALLED", undefined, { installedAt: now - 3 * D }),
    mkM("45039813155", "f3", "INSTALLED", undefined, { installedAt: now - 2 * D }),
    mkM("45039813210", "f4", "IN_STOCK"),
    mkM("45039813227", "f5", "IN_STOCK"),
    mkM("45039813240", "f6", "IN_STOCK"),
    mkM("45039813286", "f2", "IN_STOCK"),
    mkM("45039813312", "f1", "IN_STOCK"),
  ];

  // ---------------- operations ----------------
  const ops: Op[] = [];
  let seqN = 0;
  const push = (s: OpSpec) => { seqN++; ops.push(mk(s, seqN)); };

  const f1 = facilities[0], f2 = facilities[1], f3 = facilities[2], f4 = facilities[3], f5 = facilities[4], f6 = facilities[5];

  // -- INSTALLATIONS --
  push({ type: "installation", meter: "45039813210", facilityId: "f4", initiator: SEC, status: "PENDING_ENERGY_MANAGER", stageIdx: 0, created: now - 2 * D - 3 * H, updated: now - 2 * D - 3 * H, chain: [
    com(SEC.id, SEC.name, SEC.role, "Initiation", "SUBMIT", "New build at Sangotedo Market. Meter from central store, customer onboarding pending.", now - 2 * D - 3 * H),
  ]});
  push({ type: "installation", meter: "45039813227", facilityId: "f5", initiator: SEC, status: "PENDING_ENERGY_MANAGER", stageIdx: 0, created: now - D - 6 * H, updated: now - D - 6 * H, chain: [
    com(SEC.id, SEC.name, SEC.role, "Initiation", "SUBMIT", "Replacement for faulty unit at VGC Estate Gate. Priority request from facility lead.", now - D - 6 * H),
  ]});
  push({ type: "installation", meter: "45039813240", facilityId: "f6", initiator: SEC, status: "PENDING_GM", stageIdx: 1, created: now - 3 * D, updated: now - D - 2 * H, chain: [
    com(SEC.id, SEC.name, SEC.role, "Initiation", "SUBMIT", "New connection at Abraham Adesanya Hub, meter drawn from Gbagada store.", now - 3 * D),
    com(EM.id, EM.name, EM.role, "Energy Manager Review", "APPROVE", "Verified meter stock movement note SM-2214. Approved for GM review.", now - D - 2 * H),
  ]});
  push({ type: "installation", meter: "45039813286", facilityId: "f2", initiator: SEC, status: "PENDING_MD", stageIdx: 2, created: now - 4 * D, updated: now - 20 * H, chain: [
    com(SEC.id, SEC.name, SEC.role, "Initiation", "SUBMIT", "Bulk new-build phase 2 at Lekki Feeder 4.", now - 4 * D),
    com(EM.id, EM.name, EM.role, "Energy Manager Review", "APPROVE", "Stock verified. Within quarterly installation budget.", now - 3 * D),
    com(GM.id, GM.name, GM.role, "General Manager Review", "APPROVE", "Consistent with feeder load plan. Forwarded for final approval.", now - 20 * H),
  ]});
  push({ type: "installation", meter: "45039813312", facilityId: "f1", initiator: SEC, status: "ZVEND_SUCCESS", stageIdx: 4, created: now - 5 * D, updated: now - 8 * H, chain: [
    com(SEC.id, SEC.name, SEC.role, "Initiation", "SUBMIT", "Ikota Substation new connection — meter from central store.", now - 5 * D),
    com(EM.id, EM.name, EM.role, "Energy Manager Review", "APPROVE", "Approved after stock reconciliation.", now - 4 * D),
    com(GM.id, GM.name, GM.role, "General Manager Review", "APPROVE", "Approved.", now - 3 * D),
    com(MD.id, MD.name, MD.role, "MD Final Approval", "APPROVE", "Final approval granted. Proceed to ZVend registration.", now - 26 * H),
    com("sys", "ZVend Gateway", "SYSTEM", "ZVend Registration", "SYSTEM", "ZVend responded 200 OK · ref ZVD-88123 · tamper + clear codes issued.", now - 8 * H),
  ], zvend: { idemKey: "seed-ins-5:3", status: "success", requestedAt: now - 26 * H, respondedAt: now - 8 * H, responseCode: "200", reference: "ZVD-88123", tamperCode: gen20(), clearCode: gen20(), attempt: 1 } });
  push({ type: "installation", meter: "45039813102", facilityId: "f1", initiator: SEC, status: "ASSIGNED", stageIdx: 5, created: now - 6 * D, updated: now - 5 * H, chain: [
    com(SEC.id, SEC.name, SEC.role, "Initiation", "SUBMIT", "Ikota Substation estate extension.", now - 6 * D),
    com(EM.id, EM.name, EM.role, "Energy Manager Review", "APPROVE", "Approved.", now - 5 * D),
    com(GM.id, GM.name, GM.role, "General Manager Review", "APPROVE", "Approved.", now - 4 * D),
    com(MD.id, MD.name, MD.role, "MD Final Approval", "APPROVE", "Approved.", now - 3 * D),
    com("sys", "ZVend Gateway", "SYSTEM", "ZVend Registration", "SYSTEM", "ZVend responded 200 OK · ref ZVD-87977.", now - 2 * D),
    com(SEC.id, SEC.name, SEC.role, "Secretary Release", "RELEASE", "Codes verified against ZVend response. Made available to Technical Man.", now - 5 * H),
  ], zvend: { idemKey: "seed-ins-6:3", status: "success", requestedAt: now - 3 * D, respondedAt: now - 2 * D, responseCode: "200", reference: "ZVD-87977", tamperCode: gen20(), clearCode: gen20(), attempt: 1 } });
  push({ type: "installation", meter: "45039813155", facilityId: "f3", initiator: SEC, status: "IN_PROGRESS", stageIdx: 5, created: now - 7 * D, updated: now - 90 * 60000, chain: [
    com(SEC.id, SEC.name, SEC.role, "Initiation", "SUBMIT", "Ajah Town Hall new connection.", now - 7 * D),
    com(EM.id, EM.name, EM.role, "Energy Manager Review", "APPROVE", "Approved.", now - 6 * D),
    com(GM.id, GM.name, GM.role, "General Manager Review", "APPROVE", "Approved.", now - 5 * D),
    com(MD.id, MD.name, MD.role, "MD Final Approval", "APPROVE", "Approved.", now - 4 * D),
    com("sys", "ZVend Gateway", "SYSTEM", "ZVend Registration", "SYSTEM", "ZVend responded 200 OK · ref ZVD-87702.", now - 3 * D),
    com(SEC.id, SEC.name, SEC.role, "Secretary Release", "RELEASE", "Made available to Technical Man.", now - 2 * D),
    com(TECH.id, TECH.name, TECH.role, "Technical Execution", "START", "Started field installation. Meter barcode verified on site.", now - 90 * 60000),
  ], zvend: { idemKey: "seed-ins-7:3", status: "success", requestedAt: now - 4 * D, respondedAt: now - 3 * D, responseCode: "200", reference: "ZVD-87702", tamperCode: gen20(), clearCode: gen20(), attempt: 1 }, scan: { value: "45039813155", matched: true, at: now - 88 * 60000 }, gps: gps(f3, now - 87 * 60000, 9) });
  push({ type: "installation", meter: "45039813015", facilityId: "f1", initiator: SEC, status: "COMPLETED", stageIdx: 5, created: now - 9 * D, updated: now - 6 * D, chain: [
    com(SEC.id, SEC.name, SEC.role, "Initiation", "SUBMIT", "Replacement meter for Tunde Balogun service point.", now - 9 * D),
    com(EM.id, EM.name, EM.role, "Energy Manager Review", "APPROVE", "Approved.", now - 8 * D),
    com(GM.id, GM.name, GM.role, "General Manager Review", "APPROVE", "Approved.", now - 7 * D - 4 * H),
    com(MD.id, MD.name, MD.role, "MD Final Approval", "APPROVE", "Approved.", now - 7 * D),
    com("sys", "ZVend Gateway", "SYSTEM", "ZVend Registration", "SYSTEM", "ZVend responded 200 OK · ref ZVD-87344.", now - 6 * D - 20 * H),
    com(SEC.id, SEC.name, SEC.role, "Secretary Release", "RELEASE", "Made available to Technical Man.", now - 6 * D - 16 * H),
    com(TECH.id, TECH.name, TECH.role, "Technical Execution", "COMPLETE", "Installation completed. 4 photos captured, GPS accuracy 11 m. Customer details recorded for activation.", now - 6 * D),
  ], zvend: { idemKey: "seed-ins-8:3", status: "success", requestedAt: now - 7 * D, respondedAt: now - 6 * D - 20 * H, responseCode: "200", reference: "ZVD-87344", tamperCode: gen20(), clearCode: gen20(), attempt: 1 }, customer: { name: "Tunde Balogun", phone: "0805 771 2398", email: "t.balogun@yahoo.com", address: "Ikota Shopping Complex, Block B" }, gps: gps(f1, now - 6 * D - H, 11), scan: { value: "45039813015", matched: true, at: now - 6 * D - 2 * H } });
  push({ type: "installation", meter: "45039812990", facilityId: "f6", initiator: SEC, status: "REJECTED", stageIdx: 1, created: now - 12 * D, updated: now - 10 * D, chain: [
    com(SEC.id, SEC.name, SEC.role, "Initiation", "SUBMIT", "Pre-install registration for Gbagada hub meter.", now - 12 * D),
    com(EM.id, EM.name, EM.role, "Energy Manager Review", "REJECT", "Meter serial already flagged faulty at factory QA. Do not install — return to store.", now - 10 * D),
  ]});
  push({ type: "installation", meter: "45039812944", facilityId: "f5", initiator: SEC, status: "COMPLETED", stageIdx: 5, created: now - 40 * D, updated: now - 37 * D, chain: [
    com(SEC.id, SEC.name, SEC.role, "Initiation", "SUBMIT", "VGC Estate new connection.", now - 40 * D),
    com(EM.id, EM.name, EM.role, "Energy Manager Review", "APPROVE", "Approved.", now - 39 * D),
    com(GM.id, GM.name, GM.role, "General Manager Review", "APPROVE", "Approved.", now - 38 * D),
    com(MD.id, MD.name, MD.role, "MD Final Approval", "APPROVE", "Approved.", now - 38 * D + 6 * H),
    com("sys", "ZVend Gateway", "SYSTEM", "ZVend Registration", "SYSTEM", "ZVend responded 200 OK · ref ZVD-84410.", now - 37 * D - 8 * H),
    com(SEC.id, SEC.name, SEC.role, "Secretary Release", "RELEASE", "Made available to Technical Man.", now - 37 * D - 5 * H),
    com(TECH.id, TECH.name, TECH.role, "Technical Execution", "COMPLETE", "Installed and photographed. Customer Emeka Obi onboarded.", now - 37 * D),
  ], zvend: { idemKey: "seed-ins-10:3", status: "success", requestedAt: now - 38 * D, respondedAt: now - 37 * D - 8 * H, responseCode: "200", reference: "ZVD-84410", tamperCode: gen20(), clearCode: gen20(), attempt: 1 }, customer: { name: "Emeka Obi", phone: "0803 990 4412", email: "emeka.obi@gmail.com", address: "VGC Close 4, House 11" } });

  // -- ACTIVATIONS --
  const custJoe = { name: "John Joe", phone: "0803 442 1170", email: "john.joe@gmail.com", address: "14 Freedom Way, Lekki" };
  push({ type: "activation", meter: "45039813015", facilityId: "f1", initiator: TECH, status: "PENDING_SECRETARY", stageIdx: 1, created: now - 22 * H, updated: now - 22 * H, chain: [
    com(TECH.id, TECH.name, TECH.role, "Field Activation Capture", "SUBMIT", "Physical activation completed at Ikota Substation. Seal intact, display functional, customer verified ID.", now - 22 * H),
  ], customer: { ...customers[7] && { name: "Tunde Balogun", phone: "0805 771 2398", email: "t.balogun@yahoo.com", address: "Ikota Shopping Complex, Block B" } }, gps: gps(f1, now - 23 * H, 10), scan: { value: "45039813015", matched: true, at: now - 23 * H } });
  push({ type: "activation", meter: "45039813102", facilityId: "f1", initiator: TECH, status: "PENDING_ENERGY_MANAGER", stageIdx: 2, created: now - 2 * D, updated: now - 14 * H, chain: [
    com(TECH.id, TECH.name, TECH.role, "Field Activation Capture", "SUBMIT", "Activation capture complete — estate extension service point.", now - 2 * D),
    com(SEC.id, SEC.name, SEC.role, "Secretary Review", "APPROVE", "Customer documentation complete. Approved.", now - 14 * H),
  ], customer: { name: "Ngozi Umeh", phone: "0806 448 9012", email: "ngozi.umeh@gmail.com", address: "17 Freedom Way, Lekki" }, gps: gps(f1, now - 2 * D - H, 8) });
  push({ type: "activation", meter: "45039902211", facilityId: "f2", initiator: TECH, status: "PENDING_MD", stageIdx: 4, created: now - 4 * D, updated: now - 12 * H, chain: [
    com(TECH.id, TECH.name, TECH.role, "Field Activation Capture", "SUBMIT", "Second meter for John Joe — activation capture complete.", now - 4 * D),
    com(SEC.id, SEC.name, SEC.role, "Secretary Review", "APPROVE", "Documents verified.", now - 3 * D),
    com(EM.id, EM.name, EM.role, "Energy Manager Review", "APPROVE", "Load within allowance. Approved.", now - 2 * D),
    com(GM.id, GM.name, GM.role, "General Manager Review", "APPROVE", "Approved for final sign-off.", now - 12 * H),
  ], customer: custJoe, gps: gps(f2, now - 4 * D - H, 14) });
  push({ type: "activation", meter: "45039812903", facilityId: "f4", initiator: TECH, status: "COMPLETED", stageIdx: 6, created: now - 44 * D, updated: now - 41 * D, chain: [
    com(TECH.id, TECH.name, TECH.role, "Field Activation Capture", "SUBMIT", "Activation capture complete.", now - 44 * D),
    com(SEC.id, SEC.name, SEC.role, "Secretary Review", "APPROVE", "Approved.", now - 43 * D),
    com(EM.id, EM.name, EM.role, "Energy Manager Review", "APPROVE", "Approved.", now - 43 * D + 5 * H),
    com(GM.id, GM.name, GM.role, "General Manager Review", "APPROVE", "Approved.", now - 42 * D),
    com(MD.id, MD.name, MD.role, "MD Final Approval", "APPROVE", "Approved.", now - 42 * D + 4 * H),
    com("sys", "ZVend Gateway", "SYSTEM", "ZVend Activation", "SYSTEM", "ZVend responded 200 OK · ref ZVD-83120 · meter energized.", now - 41 * D - 6 * H),
    com(SEC.id, SEC.name, SEC.role, "Secretary Completion", "CONFIRM", "ZVend confirmation received. Workflow completed.", now - 41 * D),
  ], customer: { name: "Folake Adeyemi", phone: "0809 552 8811", email: "folake.ade@gmail.com", address: "9 Sangotedo Rd" }, zvend: { idemKey: "seed-act-4:5", status: "success", requestedAt: now - 42 * D + 4 * H, respondedAt: now - 41 * D - 6 * H, responseCode: "200", reference: "ZVD-83120", attempt: 1 } });
  push({ type: "activation", meter: "45039812875", facilityId: "f3", initiator: TECH, status: "REJECTED", stageIdx: 2, created: now - 15 * D, updated: now - 13 * D, chain: [
    com(TECH.id, TECH.name, TECH.role, "Field Activation Capture", "SUBMIT", "Activation capture complete.", now - 15 * D),
    com(SEC.id, SEC.name, SEC.role, "Secretary Review", "APPROVE", "Approved.", now - 14 * D),
    com(EM.id, EM.name, EM.role, "Energy Manager Review", "REJECT", "GPS accuracy at capture was 61 m — beyond allowed threshold. Re-capture required.", now - 13 * D),
  ]});
  push({ type: "activation", meter: "45039812801", facilityId: "f1", initiator: TECH, status: "COMPLETED", stageIdx: 6, created: now - 118 * D, updated: now - 115 * D, chain: [
    com(TECH.id, TECH.name, TECH.role, "Field Activation Capture", "SUBMIT", "Activation complete.", now - 118 * D),
    com(SEC.id, SEC.name, SEC.role, "Secretary Review", "APPROVE", "Approved.", now - 117 * D),
    com(EM.id, EM.name, EM.role, "Energy Manager Review", "APPROVE", "Approved.", now - 117 * D + 3 * H),
    com(GM.id, GM.name, GM.role, "General Manager Review", "APPROVE", "Approved.", now - 116 * D),
    com(MD.id, MD.name, MD.role, "MD Final Approval", "APPROVE", "Approved.", now - 116 * D + 2 * H),
    com("sys", "ZVend Gateway", "SYSTEM", "ZVend Activation", "SYSTEM", "ZVend responded 200 OK · ref ZVD-71123.", now - 115 * D - 4 * H),
    com(SEC.id, SEC.name, SEC.role, "Secretary Completion", "CONFIRM", "Completed.", now - 115 * D),
  ], zvend: { idemKey: "seed-act-6:5", status: "success", requestedAt: now - 116 * D, respondedAt: now - 115 * D - 4 * H, responseCode: "200", reference: "ZVD-71123", attempt: 1 } });

  // -- INSPECTIONS --
  push({ type: "inspection", meter: "45039812990", facilityId: "f6", initiator: GM, status: "SCHEDULED", stageIdx: 1, created: now - 3 * D, updated: now - 3 * D, chain: [
    com(GM.id, GM.name, GM.role, "GM Scheduling", "SCHEDULE", "Fault report on meter — suspected display failure. Inspect seal integrity and terminal block. Duration 2 minutes.", now - 3 * D),
  ], instruction: "Verify seal integrity, photograph terminal block, test display contrast. Report any bypass wiring.", scheduledFor: now + 2 * D, durationSec: 120 });
  push({ type: "inspection", meter: "45039812822", facilityId: "f2", initiator: GM, status: "SCHEDULED", stageIdx: 1, created: now - D - 4 * H, updated: now - D - 4 * H, chain: [
    com(GM.id, GM.name, GM.role, "GM Scheduling", "SCHEDULE", "Routine quarterly inspection for Lekki Phase 1 cluster.", now - D - 4 * H),
  ], instruction: "Routine check: seals, mounting, meter display, environment clearance.", scheduledFor: now + 4 * D, durationSec: 60 });
  push({ type: "inspection", meter: "45039812875", facilityId: "f3", initiator: GM, status: "PENDING_SECRETARY", stageIdx: 2, created: now - 2 * D, updated: now - 9 * H, chain: [
    com(GM.id, GM.name, GM.role, "GM Scheduling", "SCHEDULE", "Spot check after customer billing complaint.", now - 2 * D),
    com(TECH.id, TECH.name, TECH.role, "Field Inspection", "SUBMIT", "Video evidence captured. Seal intact, no bypass observed. Display functional.", now - 9 * H),
  ], instruction: "Billing complaint — verify meter index matches ZVend vending record.", durationSec: 120, video: { durationSec: 120, at: now - 10 * H, simulated: true, sizeKB: 18240 }, gps: gps(f3, now - 10 * H, 7), observations: "Index matches vending ledger. Customer shown the reconciliation. No fault found." });
  push({ type: "inspection", meter: "45039812746", facilityId: "f2", initiator: GM, status: "PENDING_MD", stageIdx: 5, created: now - 4 * D, updated: now - 16 * H, chain: [
    com(GM.id, GM.name, GM.role, "GM Scheduling", "SCHEDULE", "High-value customer meter — periodic integrity inspection.", now - 4 * D),
    com(TECH.id, TECH.name, TECH.role, "Field Inspection", "SUBMIT", "Full inspection video captured. No anomalies.", now - 2 * D),
    com(SEC.id, SEC.name, SEC.role, "Secretary Review", "APPROVE", "Evidence file complete. Approved.", now - D - 10 * H),
    com(EM.id, EM.name, EM.role, "Energy Manager Review", "APPROVE", "Approved.", now - D - 3 * H),
    com(GM.id, GM.name, GM.role, "GM Review", "APPROVE", "Consistent with network integrity program.", now - 16 * H),
  ], durationSec: 180, video: { durationSec: 180, at: now - 2 * D - H, simulated: true, sizeKB: 27410 }, gps: gps(f2, now - 2 * D - H, 9), observations: "All checks passed." });
  push({ type: "inspection", meter: "45039812944", facilityId: "f5", initiator: GM, status: "REJECTED", stageIdx: 5, created: now - 6 * D, updated: now - 3 * D, chain: [
    com(GM.id, GM.name, GM.role, "GM Scheduling", "SCHEDULE", "Post-installation verification.", now - 6 * D),
    com(TECH.id, TECH.name, TECH.role, "Field Inspection", "SUBMIT", "Video captured.", now - 5 * D),
    com(SEC.id, SEC.name, SEC.role, "Secretary Review", "APPROVE", "Approved.", now - 4 * D),
    com(EM.id, EM.name, EM.role, "Energy Manager Review", "APPROVE", "Approved.", now - 4 * D + 6 * H),
    com(GM.id, GM.name, GM.role, "GM Review", "APPROVE", "Approved.", now - 3 * D - 8 * H),
    com(MD.id, MD.name, MD.role, "MD Final Approval", "REJECT", "Video does not show the meter serial clearly. Re-inspect with closer framing.", now - 3 * D),
  ], durationSec: 120, retryCount: 0, video: { durationSec: 120, at: now - 5 * D, simulated: true, sizeKB: 16830 }, observations: "Initial pass." });
  push({ type: "inspection", meter: "45039812801", facilityId: "f1", initiator: GM, status: "COMPLETED", stageIdx: 5, created: now - 30 * D, updated: now - 26 * D, chain: [
    com(GM.id, GM.name, GM.role, "GM Scheduling", "SCHEDULE", "Routine inspection.", now - 30 * D),
    com(TECH.id, TECH.name, TECH.role, "Field Inspection", "SUBMIT", "Completed.", now - 28 * D),
    com(SEC.id, SEC.name, SEC.role, "Secretary Review", "APPROVE", "Approved.", now - 27 * D),
    com(EM.id, EM.name, EM.role, "Energy Manager Review", "APPROVE", "Approved.", now - 27 * D + 4 * H),
    com(GM.id, GM.name, GM.role, "GM Review", "APPROVE", "Approved.", now - 26 * D - 6 * H),
    com(MD.id, MD.name, MD.role, "MD Final Approval", "APPROVE", "Inspection accepted.", now - 26 * D),
  ], durationSec: 60, video: { durationSec: 60, at: now - 28 * D, simulated: true, sizeKB: 9210 } });

  // -- TAMPER / CLEAR --
  push({ type: "tamper", meter: "45039812990", facilityId: "f6", initiator: TECH, status: "PENDING_ENERGY_MANAGER", stageIdx: 0, created: now - 18 * H, updated: now - 18 * H, chain: [
    com(TECH.id, TECH.name, TECH.role, "Initiation", "SUBMIT", "Faulty meter shows tamper flag on display. Requesting tamper code via barcode scan.", now - 18 * H),
  ], scan: { value: "45039812990", matched: true, at: now - 18 * H } });
  push({ type: "tamper", meter: "45039812822", facilityId: "f2", initiator: SEC, status: "PENDING_GM", stageIdx: 1, created: now - 2 * D, updated: now - 12 * H, chain: [
    com(SEC.id, SEC.name, SEC.role, "Initiation", "SUBMIT", "Customer reports meter lockout after power surge. Manual entry per call log #4411.", now - 2 * D),
    com(EM.id, EM.name, EM.role, "Energy Manager Review", "APPROVE", "Lockout consistent with surge event log. Approved.", now - 12 * H),
  ]});
  push({ type: "tamper", meter: "45039812903", facilityId: "f4", initiator: SEC, status: "PENDING_MD", stageIdx: 2, created: now - 3 * D, updated: now - 20 * H, chain: [
    com(SEC.id, SEC.name, SEC.role, "Initiation", "SUBMIT", "Tamper flag raised after maintenance visit.", now - 3 * D),
    com(EM.id, EM.name, EM.role, "Energy Manager Review", "APPROVE", "Approved.", now - 2 * D),
    com(GM.id, GM.name, GM.role, "General Manager Review", "APPROVE", "Approved.", now - 20 * H),
  ]});
  push({ type: "tamper", meter: "45039812746", facilityId: "f2", initiator: SEC, status: "ZVEND_SUCCESS", stageIdx: 4, created: now - 4 * D, updated: now - 10 * H, chain: [
    com(SEC.id, SEC.name, SEC.role, "Initiation", "SUBMIT", "High-value customer meter lockout.", now - 4 * D),
    com(EM.id, EM.name, EM.role, "Energy Manager Review", "APPROVE", "Approved.", now - 3 * D),
    com(GM.id, GM.name, GM.role, "General Manager Review", "APPROVE", "Approved.", now - 2 * D),
    com(MD.id, MD.name, MD.role, "MD Final Approval", "APPROVE", "Approved.", now - 26 * H),
    com("sys", "ZVend Gateway", "SYSTEM", "ZVend Code Generation", "SYSTEM", "ZVend responded 200 OK · 20-digit tamper code issued.", now - 10 * H),
  ], zvend: { idemKey: "seed-tmp-4:3", status: "success", requestedAt: now - 26 * H, respondedAt: now - 10 * H, responseCode: "200", reference: "ZVD-88240", tamperCode: gen20(), attempt: 1 } });
  push({ type: "tamper", meter: "45039812801", facilityId: "f1", initiator: SEC, status: "COMPLETED", stageIdx: 4, created: now - 20 * D, updated: now - 18 * D, chain: [
    com(SEC.id, SEC.name, SEC.role, "Initiation", "SUBMIT", "Tamper code request.", now - 20 * D),
    com(EM.id, EM.name, EM.role, "Energy Manager Review", "APPROVE", "Approved.", now - 19 * D),
    com(GM.id, GM.name, GM.role, "General Manager Review", "APPROVE", "Approved.", now - 19 * D + 5 * H),
    com(MD.id, MD.name, MD.role, "MD Final Approval", "APPROVE", "Approved.", now - 18 * D - 10 * H),
    com("sys", "ZVend Gateway", "SYSTEM", "ZVend Code Generation", "SYSTEM", "ZVend responded 200 OK.", now - 18 * D - 6 * H),
    com(SEC.id, SEC.name, SEC.role, "Code Delivery Confirmation", "CONFIRM", "Code delivered to field officer over secure channel.", now - 18 * D),
  ], zvend: { idemKey: "seed-tmp-5:3", status: "success", requestedAt: now - 18 * D - 10 * H, respondedAt: now - 18 * D - 6 * H, responseCode: "200", tamperCode: gen20(), attempt: 1 } });
  push({ type: "clear", meter: "45039812944", facilityId: "f5", initiator: TECH, status: "PENDING_ENERGY_MANAGER", stageIdx: 0, created: now - 8 * H, updated: now - 8 * H, chain: [
    com(TECH.id, TECH.name, TECH.role, "Initiation", "SUBMIT", "Meter in credit-lockout state on site. Clear code requested via scan.", now - 8 * H),
  ], scan: { value: "45039812944", matched: true, at: now - 8 * H } });
  push({ type: "clear", meter: "45039812875", facilityId: "f3", initiator: SEC, status: "PENDING_MD", stageIdx: 2, created: now - 2 * D - 5 * H, updated: now - 15 * H, chain: [
    com(SEC.id, SEC.name, SEC.role, "Initiation", "SUBMIT", "Customer meter requires clear code after token reversal.", now - 2 * D - 5 * H),
    com(EM.id, EM.name, EM.role, "Energy Manager Review", "APPROVE", "Reversal confirmed in ZVend ledger. Approved.", now - D - 8 * H),
    com(GM.id, GM.name, GM.role, "General Manager Review", "APPROVE", "Approved.", now - 15 * H),
  ]});
  push({ type: "clear", meter: "45039812822", facilityId: "f2", initiator: SEC, status: "COMPLETED", stageIdx: 4, created: now - 16 * D, updated: now - 14 * D, chain: [
    com(SEC.id, SEC.name, SEC.role, "Initiation", "SUBMIT", "Clear code request.", now - 16 * D),
    com(EM.id, EM.name, EM.role, "Energy Manager Review", "APPROVE", "Approved.", now - 15 * D),
    com(GM.id, GM.name, GM.role, "General Manager Review", "APPROVE", "Approved.", now - 15 * D + 4 * H),
    com(MD.id, MD.name, MD.role, "MD Final Approval", "APPROVE", "Approved.", now - 14 * D - 8 * H),
    com("sys", "ZVend Gateway", "SYSTEM", "ZVend Code Generation", "SYSTEM", "ZVend responded 200 OK.", now - 14 * D - 5 * H),
    com(SEC.id, SEC.name, SEC.role, "Code Delivery Confirmation", "CONFIRM", "Delivered and meter restored.", now - 14 * D),
  ], zvend: { idemKey: "seed-clr-3:3", status: "success", requestedAt: now - 14 * D - 8 * H, respondedAt: now - 14 * D - 5 * H, responseCode: "200", clearCode: gen20(), attempt: 1 } });

  // ---------------- notifications ----------------
  const n = (at: number, forRole: Role | "ALL", text: string, kind: Notif["kind"], opId?: string, txn?: string, forUser?: string): Notif =>
    ({ id: uid(), at, forRole, text, kind, read: false, opId, txn, forUser });
  const notifications: Notif[] = [
    n(now - 18 * H, "ENERGY_MANAGER", "New tamper code request awaiting your approval.", "approval", ops[19].id, ops[19].txn),
    n(now - 22 * H, "SECRETARY", "Meter activation requires your review.", "approval", ops[10].id, ops[10].txn),
    n(now - 2 * D - 3 * H, "ENERGY_MANAGER", "New meter installation awaiting your approval.", "approval", ops[0].id, ops[0].txn),
    n(now - 8 * H, "SECRETARY", "ZVend tamper code issued — pending delivery confirmation.", "zvend", ops[23].id, ops[23].txn),
    n(now - 5 * H, "TECHNICAL_MAN", "Installation task assigned to you at Ikota Substation.", "field", ops[5].id, ops[5].txn),
    n(now - 3 * D, "TECHNICAL_MAN", "Inspection rejected by MD. Technical action required — re-inspect meter 45039812944.", "field", ops[15].id, ops[15].txn),
    n(now - 12 * H, "MD", "Meter activation awaiting your final approval.", "approval", ops[12].id, ops[12].txn),
    n(now - 3 * D, "TECHNICAL_MAN", "Inspection scheduled at Abraham Adesanya Hub — meter 45039812990.", "field", ops[16].id, ops[16].txn),
    n(now - 16 * H, "MD", "Meter inspection awaiting your final approval.", "approval", ops[14].id, ops[14].txn),
    n(now - 26 * H, "SECRETARY", "MD approved meter installation ZADM — ZVend registration in progress.", "zvend"),
  ];

  // ---------------- audit ----------------
  const audit: AuditEntry[] = [
    aud(now - 18 * H, TECH.id, TECH.name, TECH.role, "barcode_scan", "Scanned 45039812990 — matched authorized meter", ops[19].txn),
    aud(now - 22 * H, TECH.id, TECH.name, TECH.role, "gps_capture", "GPS captured ±10 m at Ikota Substation", ops[10].txn),
    aud(now - 22 * H, TECH.id, TECH.name, TECH.role, "photo_capture", "4 activation photos captured", ops[10].txn),
    aud(now - 22 * H, TECH.id, TECH.name, TECH.role, "submit", "Activation submitted for Secretary review", ops[10].txn),
    aud(now - 14 * H, SEC.id, SEC.name, SEC.role, "approve", "Approved activation at Secretary stage", ops[11].txn),
    aud(now - 12 * H, EM.id, EM.name, EM.role, "approve", "Approved tamper request at EM stage", ops[20].txn),
    aud(now - 10 * H, "sys", "ZVend Gateway", "SYSTEM", "api_response", "200 OK — tamper code issued (ref ZVD-88240)", ops[23].txn),
    aud(now - 8 * H, SEC.id, SEC.name, SEC.role, "code_reveal", "Revealed tamper code for delivery check", ops[23].txn),
    aud(now - 8 * H, TECH.id, TECH.name, TECH.role, "submit", "Clear code request initiated via barcode scan", ops[25].txn),
    aud(now - 3 * D, GM.id, GM.name, GM.role, "schedule", "Scheduled inspection at Abraham Adesanya Hub (2 min)", ops[16].txn),
    aud(now - 20 * H, GM.id, GM.name, GM.role, "approve", "Approved activation at GM stage", ops[12].txn),
    aud(now - 26 * H, MD.id, MD.name, MD.role, "approve", "Final approval — installation forwarded to ZVend", ops[4].txn),
    aud(now - 26 * H, "sys", "ZVend Gateway", "SYSTEM", "api_request", "POST /api/v1/meters/install (idempotent key bound)", ops[4].txn),
    aud(now - 7 * H, SU.id, SU.name, SU.role, "settings_change", "Max GPS accuracy set to 50 m"),
    aud(now - 6 * H, "u-it", "Bisi Adeleke", "IT_MANAGER", "sync", "Facility refresh from ZVend — 6 facilities processed"),
    aud(now - 3 * D, MD.id, MD.name, MD.role, "reject", "Rejected inspection — video evidence insufficient", ops[15].txn),
  ];

  // ---------------- api logs ----------------
  const apiLogs = [
    { id: uid(), at: now - 8 * H, userName: "ZVend Gateway", operation: "generateTamperCode", method: "POST", endpoint: "/api/v1/meters/tamper-code", txn: ops[23].txn, status: "success" as const, responseCode: "200", durationMs: 1340 },
    { id: uid(), at: now - 6 * H, userName: "Bisi Adeleke", operation: "getFacilities", method: "GET", endpoint: "/api/v1/facilities", status: "success" as const, responseCode: "200", durationMs: 610 },
    { id: uid(), at: now - 26 * H, userName: "ZVend Gateway", operation: "installMeter", method: "POST", endpoint: "/api/v1/meters/install", txn: ops[4].txn, status: "success" as const, responseCode: "200", durationMs: 1820 },
    { id: uid(), at: now - 2 * D, userName: "ZVend Gateway", operation: "installMeter", method: "POST", endpoint: "/api/v1/meters/install", txn: ops[5].txn, status: "success" as const, responseCode: "200", durationMs: 1490 },
    { id: uid(), at: now - 3 * D, userName: "ZVend Gateway", operation: "installMeter", method: "POST", endpoint: "/api/v1/meters/install", txn: ops[6].txn, status: "success" as const, responseCode: "200", durationMs: 2011 },
    { id: uid(), at: now - 41 * D, userName: "ZVend Gateway", operation: "activateMeter", method: "POST", endpoint: "/api/v1/meters/activate", txn: ops[13].txn, status: "success" as const, responseCode: "200", durationMs: 1675 },
    { id: uid(), at: now - 14 * D, userName: "ZVend Gateway", operation: "generateClearCode", method: "POST", endpoint: "/api/v1/meters/clear-code", txn: ops[27].txn, status: "success" as const, responseCode: "200", durationMs: 1122 },
    { id: uid(), at: now - 30 * H, userName: "Bisi Adeleke", operation: "getMetersByFacility", method: "GET", endpoint: "/api/v1/facilities/f2/meters", status: "failed" as const, responseCode: "504", durationMs: 30000 },
  ];

  const syncLogs = [
    { id: uid(), at: now - 6 * H, operation: "Facility refresh (manual)", status: "success" as const, processed: 6, failed: 0, by: "Bisi Adeleke" },
    { id: uid(), at: now - 30 * H, operation: "Facility refresh (manual)", status: "success" as const, processed: 6, failed: 1, error: "ZRK-AA05 timed out — retried successfully offline", by: "Bisi Adeleke" },
  ];

  const delegations: Delegation[] = [
    { id: uid(), mdId: MD.id, mdName: MD.name, gmId: GM.id, gmName: GM.name, start: now - 2 * D, end: now + 5 * D, reason: "MD on regional roadshow — GM authorized for final approvals.", status: "ACTIVE" },
  ];

  return {
    v: 3,
    currentUserId: null,
    users,
    permissionMatrix: JSON.parse(JSON.stringify(DEFAULT_MATRIX)),
    operations: ops,
    facilities, customers, meters,
    notifications, audit, apiLogs, syncLogs, delegations,
    settings: {
      inspectionDurations: [60, 120, 180, 300],
      defaultDurationSec: 120,
      maxGpsAccuracyM: 50,
      allowedDistanceM: 250,
      zvend: {
        baseUrl: "https://zvend.zarox.energy",
        token: "zvd_live_9f3k••••••••",
        timeoutSec: 30, retryCount: 3,
        endpoints: {
          facilities: "/api/v1/facilities", customers: "/api/v1/facilities/{id}/customers",
          meters: "/api/v1/facilities/{id}/meters", install: "/api/v1/meters/install",
          activate: "/api/v1/meters/activate", tamper: "/api/v1/meters/tamper-code",
          clear: "/api/v1/meters/clear-code", vend: "/api/v1/customers/{id}/vending-history",
          funding: "/api/v1/customers/{id}/funding-history",
        },
      },
    },
    seq: { installation: seqN + 40, activation: seqN + 40, inspection: seqN + 40, tamper: seqN + 40, clear: seqN + 40 },
    idemKeys: ops.filter(o => o.zvend).map(o => o.zvend!.idemKey),
    lastFacilitySync: now - 6 * H,
  };
}

export { STAGES };
