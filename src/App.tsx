import { useEffect } from "react";
import type { OpType } from "./lib/core";
import { OPS } from "./lib/core";
import { StoreProvider, useStore } from "./lib/core";
import { Shell } from "./components/shell";
import { Btn, Card, Icon, useRoute } from "./components/ui";
import { LoginPage, DashboardPage, ApprovalsPage, NotificationsPage, HistoryPage } from "./pages/work";
import { OperationListPage, NewInstallationPage, RequestCodePage, StartActivationPage, ScheduleInspectionPage, OperationDetailPage } from "./pages/ops";
import { FacilitiesPage, FacilityDetailPage, CustomersPage, CustomerDetailPage, MetersPage, ReportsPage } from "./pages/data";
import AdminPage, { ApiReferencePage, DatabaseSetupPage } from "./pages/admin";

function AccessDenied({ perm }: { perm: string }) {
  const { nav } = useRoute();
  return (
    <div className="mx-auto max-w-xl">
      <Card className="anim-rise p-6 text-center">
        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-warnsoft text-warn"><Icon name="shield" size={20} /></span>
        <h1 className="font-display text-[17px] font-bold">Access restricted</h1>
        <p className="mt-1 text-[12.5px] text-mute">Your role does not include <code className="rounded bg-paper px-1 font-mono text-[11px] font-bold">{perm}</code>. Authorization is enforced on every transition, not just in the UI.</p>
        <Btn variant="outline" icon="chevL" className="mt-4" onClick={() => nav("")}>Back to dashboard</Btn>
      </Card>
    </div>
  );
}

function Router() {
  const { user, can } = useStore();
  const { path, parts, nav } = useRoute();
  useEffect(() => { window.scrollTo(0, 0); }, [path]);
  if (!user) return <LoginPage />;
  const head = parts[0] ?? "";
  const second = parts[1] ?? "";

  const opDetail = (type: OpType) => {
    if (!can(`${type}.view`)) return <AccessDenied perm={`${type}.view`} />;
    if (!second) return <OperationListPage type={type} />;
    const sub = second === "new" ? (type === "installation" ? <NewInstallationPage /> : null)
      : second === "start" ? (type === "activation" ? <StartActivationPage /> : null)
      : second === "schedule" ? (type === "inspection" ? <ScheduleInspectionPage /> : null)
      : second === "request" ? ((type === "tamper" || type === "clear") ? <RequestCodePage type={type} /> : null)
      : null;
    if (sub) return sub;
    return <OperationDetailPage type={type} id={second} />;
  };

  let page: React.ReactNode;
  switch (head) {
    case "": page = <DashboardPage />; break;
    case OPS.installation.path: page = opDetail("installation"); break;
    case OPS.activation.path: page = opDetail("activation"); break;
    case OPS.inspection.path: page = opDetail("inspection"); break;
    case OPS.tamper.path: page = opDetail("tamper"); break;
    case OPS.clear.path: page = opDetail("clear"); break;
    case "approvals": page = can("approvals.view") ? <ApprovalsPage /> : <AccessDenied perm="approvals.view" />; break;
    case "notifications": page = can("notifications.view") ? <NotificationsPage /> : <AccessDenied perm="notifications.view" />; break;
    case "history": page = can("history.view") ? <HistoryPage /> : <AccessDenied perm="history.view" />; break;
    case "facilities": page = can("facilities.view") ? (second ? <FacilityDetailPage id={second} /> : <FacilitiesPage />) : <AccessDenied perm="facilities.view" />; break;
    case "customers": page = can("customers.view") ? (second ? <CustomerDetailPage id={second} /> : <CustomersPage />) : <AccessDenied perm="customers.view" />; break;
    case "meters": page = can("meters.view") ? <MetersPage /> : <AccessDenied perm="meters.view" />; break;
    case "reports": page = can("reports.view") ? <ReportsPage /> : <AccessDenied perm="reports.view" />; break;
    case "api-docs": page = user.role === "SUPER_ADMIN" ? <ApiReferencePage /> : <AccessDenied perm="api_reference.view" />; break;
    case "admin": page = second === "database" ? (can("admin.database") ? <DatabaseSetupPage /> : <AccessDenied perm="admin.database" />) : <AdminPage tab={second} />; break;
    default: page = (
      <div className="mx-auto max-w-xl">
        <Card className="anim-rise p-6 text-center">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-ink/6 text-mute"><Icon name="search" size={20} /></span>
          <h1 className="font-display text-[17px] font-bold">Page not found</h1>
          <p className="mt-1 font-mono text-[12px] text-mute">#/{path}</p>
          <Btn variant="outline" icon="chevL" className="mt-4" onClick={() => nav("")}>Back to dashboard</Btn>
        </Card>
      </div>
    );
  }
  return <Shell>{page}</Shell>;
}

export default function App() {
  return (
    <StoreProvider>
      <Router />
    </StoreProvider>
  );
}
