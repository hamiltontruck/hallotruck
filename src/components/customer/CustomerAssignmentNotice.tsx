import { useEffect, useState } from "react";
import { getCustomerPortalData, type CustomerDriverAssignment, type CustomerOrder } from "../../services/customer.service";
import { getCustomerCopy } from "../../i18n/customerCopy";
import { useLanguage } from "../../i18n/LanguageProvider";
import { CustomerDriverAssignmentCard } from "./CustomerDriverAssignmentCard";
import { supabase } from "../../services/supabase.client";

export function CustomerAssignmentNotice() {
  const { language } = useLanguage();
  const c = getCustomerCopy(language);
  const [assignment, setAssignment] = useState<CustomerDriverAssignment | null>(null);
  const [order, setOrder] = useState<CustomerOrder | null>(null);

  async function load() {
    const data = await getCustomerPortalData();
    const activeOrder = data.orders.find((item) => ["accepted", "in_transit"].includes(item.status) && data.assignments.some((card) => card.order_id === item.id));
    setOrder(activeOrder ?? null);
    setAssignment(activeOrder ? data.assignments.find((card) => card.order_id === activeOrder.id) ?? null : null);
  }

  useEffect(() => {
    void load();
    const channel = supabase.channel("customer-assignment-notice").on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => void load()).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);

  if (!assignment || !order) return null;

  return <section className="bg-bone px-5 pt-5"><div className="mx-auto max-w-6xl"><CustomerDriverAssignmentCard assignment={assignment} order={order} labels={{ assigned: c.assigned, verifiedDriver: c.verifiedDriver, verificationPending: c.verificationPending, license: c.license, nationalId: c.nationalId, truckPlate: c.truckPlate, truck: c.truck, verified: c.verified, pending: c.pending, viewTruckPhoto: c.viewTruckPhoto, privacy: c.privacy }} /></div></section>;
}
