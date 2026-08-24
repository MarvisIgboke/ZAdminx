import { OPS, OP_ORDER, ROLE_LABEL, actionableBy } from "../lib/types";
import { useStore } from "../lib/store";
import { Avatar, Icon, ToastHost } from "../components/ui";

const roleNote: Record<string, string> = {
  SUPER_ADMIN: "System configuration · RBAC · GPS rules · durations",
  SECRETARY: "Initiates installations, tamper & clear codes · reviews & releases",
  TECHNICAL_MAN: "Field PWA · scan, GPS, photos, video · initiates activations",
  ENERGY_MANAGER: "First approval stage across all five operations",
  GENERAL_MANAGER: "GM approvals · schedules inspections · MD delegate",
  MD: "Final approval authority · ZVend trigger · delegation",
  IT_MANAGER: "ZVend configuration · API logs · users · audit review",
};

export default function LoginPage() {
  const { state, login, delegation } = useStore();
  const open = (t: string) => state.operations.filter(o => o.type === t && !["COMPLETED", "REJECTED", "CANCELLED"].includes(o.status)).length;

  return (
    <div className="flex min-h-screen">
      {/* brand / live board */}
      <div className="relative hidden w-[42%] flex-col justify-between overflow-hidden bg-side bg-circuit p-10 lg:flex">
        <div className="pointer-events-none absolute -right-28 -top-28 h-96 w-96 rounded-full bg-volt/8 blur-3xl" />
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-volt text-ink shadow-[0_0_0_5px_rgba(232,155,46,0.14)]"><Icon name="logo" size={26} /></span>
            <div>
              <p className="font-display text-[26px] font-bold leading-none tracking-tight text-paper">Z ADMIN</p>
              <p className="mt-1.5 text-[10.5px] font-bold tracking-[0.2em] text-[#71816f]">ZAROX ENERGY SOLUTIONS · ZVEND OPERATIONS</p>
            </div>
          </div>
          <h1 className="mt-12 max-w-md font-display text-[34px] font-bold leading-[1.12] tracking-tight text-paper">
            Five core operations. One auditable chain of custody.
          </h1>
          <p className="mt-4 max-w-md text-[13.5px] leading-relaxed text-[#93a29a]">
            Installation, activation, inspection, tamper and clear codes — every stage signed,
            commented and pushed to ZVend only after MD approval.
          </p>

          <div className="mt-10 max-w-md rounded-xl border border-side3 bg-side2/80 p-4">
            <p className="mb-3 flex items-center gap-2 text-[10.5px] font-extrabold tracking-[0.18em] text-[#71816f]">
              <span className="h-1.5 w-1.5 rounded-full bg-volt livedot" /> LIVE OPERATIONS BOARD
            </p>
            <div className="space-y-2">
              {OP_ORDER.map(t => (
                <div key={t} className="flex items-center gap-2.5">
                  <span className="text-volt"><Icon name={OPS[t].icon} size={15} /></span>
                  <span className="flex-1 text-[12.5px] font-bold text-paper">{OPS[t].label}</span>
                  <span className="rounded-md bg-side3 px-2 py-0.5 font-mono text-[11px] font-bold text-volt tnum">{open(t)} open</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="text-[10.5px] font-semibold text-[#5d6b62]">
          ZVend bridge connected · idempotent API calls · append-only audit · PWA field mode — v2.0
        </p>
      </div>

      {/* profile select */}
      <div className="flex flex-1 items-center justify-center bg-dots px-4 py-10">
        <div className="w-full max-w-xl anim-rise">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-volt text-ink"><Icon name="logo" size={22} /></span>
            <div>
              <p className="font-display text-[20px] font-bold leading-none">Z ADMIN</p>
              <p className="text-[9.5px] font-bold tracking-[0.18em] text-mute">ZAROX ENERGY SOLUTIONS</p>
            </div>
          </div>
          <p className="text-[11px] font-extrabold tracking-[0.18em] text-volt2">OPERATOR SIGN-IN</p>
          <h2 className="mt-1 font-display text-[26px] font-bold tracking-tight">Select your profile</h2>
          <p className="mt-1 text-[13px] text-mute">
            Session credentials are minted per role. Every action you take is gated by the permission matrix and written to the audit log.
            {delegation && <span className="mt-1 block font-bold text-warn">An MD delegation is currently active — GM may act on final approvals.</span>}
          </p>

          <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
            {state.users.filter(u => u.active).map(u => (
              <button key={u.id} onClick={() => login(u.id)}
                className="group flex items-start gap-3 rounded-xl border border-line bg-card p-3.5 text-left transition-all hover:-translate-y-0.5 hover:border-volt hover:shadow-[0_10px_28px_rgba(26,35,30,0.12)]">
                <Avatar name={u.name} size={40} tone="bg-ink text-volt" />
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-extrabold">{u.name}</span>
                    <Icon name="arrowR" size={13} className="shrink-0 text-mute opacity-0 transition-opacity group-hover:opacity-100 group-hover:text-volt2" />
                  </span>
                  <span className="mt-0.5 block text-[10.5px] font-extrabold tracking-wider text-volt2">{ROLE_LABEL[u.role].toUpperCase()}</span>
                  <span className="mt-1 block text-[11px] leading-snug text-mute">{roleNote[u.role]}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="mt-6 flex items-center gap-2.5 rounded-lg border border-line bg-card px-3.5 py-2.5">
            <Icon name="shield" size={15} className="text-ok" />
            <p className="text-[11.5px] font-semibold text-ink2">
              RBAC enforced server-side on every transition — a role can never act outside its stage, even by direct request.
            </p>
          </div>
        </div>
      </div>
      <ToastHost />
    </div>
  );
}
