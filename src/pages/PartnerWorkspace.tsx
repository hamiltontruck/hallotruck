import { PartnerPortal } from "./PartnerPortal";
import { usePartnerScope } from "../components/partner/usePartnerOperations";
import { PartnerOperationsNav } from "../components/partner/PartnerOperationsNav";

export function PartnerWorkspace() {
  const scope = usePartnerScope();
  return <div className="partner-mobile-touch-safe overflow-x-hidden"><PartnerOperationsNav partnerId={scope.partnerId} canManageDrivers={scope.canManageDrivers} />{scope.loading ? <p className="p-6">Loading organization…</p> : scope.error ? <p role="alert" className="p-6">{scope.error}</p> : scope.partnerId ? <PartnerPortal key={scope.partnerId} /> : <p className="p-6">No active Partner organization.</p>}</div>;
}
