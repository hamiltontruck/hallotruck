import { supabase } from "./supabase.client";

export interface ControlOrder {
  id: string;
  tracking_id: string;
  customer_name: string | null;
  pickup_address: string;
  dropoff_address: string;
  status: string;
  payment_status: string;
  driver_id: string | null;
  truck_id: string | null;
  accepted_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

export interface ControlPayment {
  id: string;
  order_id: string;
  provider: string;
  provider_ref: string | null;
  amount_etb: number;
  event: string;
  receipt_path: string | null;
  raw_payload: Record<string, unknown> | null;
  created_at: string;
}

export interface ControlTruck { id: string; plate_number: string; status: string; }
export interface ControlDriver { id: string; full_name: string | null; driver_status: string | null; }
export interface ControlCustomer { id: string; created_at: string; }
export interface ControlProof { id: string; order_id: string; }
export interface ControlDocument { id: string; driver_id: string; document_key: string; status: string; expiry_date: string | null; }
export interface ControlDriverFinancialSummary { driver_id: string; completed_trips: number | string; gross_released_etb: number | string; commission_charged_etb: number | string; commission_paid_etb: number | string; admin_deposit_etb: number | string; available_deposit_etb: number | string; commission_due_etb: number | string; }
export interface CeoTopCustomer { customer_name: string; order_count: number; }
export interface CeoTopRoute { pickup_address: string; dropoff_address: string; order_count: number; }
export interface CeoTopPartner { partner_id: string; gross_etb: number; hallo_commission_etb: number; freight_count: number; }

export interface ControlCenterServerSummary {
  todayRevenue:number; totalOrders:number; todayOrders:number; activeTrips:number; deliveredToday:number; delayedTrips:number; unassignedOrders:number; availableTrucks:number; totalTrucks:number; activeDrivers:number; totalDrivers:number; newCustomersToday:number; pendingPayments:number; missingEvidence:number; unreportedPaymentReports:number; unreportedInvoiceTotal:number; legacyCompleted:number; commissionReceivable:number; totalDriverDeposit:number; availableDriverDeposit:number; complianceDocumentAlerts:number; driverOnboardingAlerts:number; maintenanceAlerts:number; releasedAmount:number; escrowAmount:number; refundedAmount:number; failedPayments:number; failedOrRefundedPayments:number; canonicalPayments:number; partnerCommission:number; pendingPartnerSettlements:number; pendingPartnerSettlementAmount:number; expiringDocuments:number;
}

export interface ControlCenterData {
  orders:ControlOrder[]; payments:ControlPayment[]; trucks:ControlTruck[]; drivers:ControlDriver[]; customers:ControlCustomer[]; proofs:ControlProof[]; documents:ControlDocument[]; unreportedPaymentOrders?:ControlOrder[]; driverFinancialSummaries?:ControlDriverFinancialSummary[]; warnings?:string[]; serverSummary?:ControlCenterServerSummary; topCustomers?:CeoTopCustomer[]; topRoutes?:CeoTopRoute[]; topPartners?:CeoTopPartner[];
}

type UnknownRecord = Record<string, unknown>;
function numberOf(value: unknown) { const parsed=Number(value??0); return Number.isFinite(parsed)?parsed:0; }
function recordOf(value: unknown): UnknownRecord { return value&&typeof value==="object"&&!Array.isArray(value)?value as UnknownRecord:{}; }
function rowsOf(value: unknown): UnknownRecord[] { return Array.isArray(value)?value.map(recordOf):[]; }
function orderOf(value: unknown): ControlOrder { const row=recordOf(value); return {id:String(row.id??""),tracking_id:String(row.tracking_id??""),customer_name:row.customer_name==null?null:String(row.customer_name),pickup_address:String(row.pickup_address??""),dropoff_address:String(row.dropoff_address??""),status:String(row.status??""),payment_status:String(row.payment_status??""),driver_id:row.driver_id==null?null:String(row.driver_id),truck_id:row.truck_id==null?null:String(row.truck_id),accepted_at:row.accepted_at==null?null:String(row.accepted_at),delivered_at:row.delivered_at==null?null:String(row.delivered_at),created_at:String(row.created_at??"")}; }
function paymentOf(value: unknown): ControlPayment { const row=recordOf(value); return {id:String(row.id??""),order_id:String(row.order_id??""),provider:String(row.provider??""),provider_ref:row.provider_ref==null?null:String(row.provider_ref),amount_etb:numberOf(row.amount_etb),event:String(row.event??""),receipt_path:row.receipt_path==null?null:String(row.receipt_path),raw_payload:row.raw_payload&&typeof row.raw_payload==="object"&&!Array.isArray(row.raw_payload)?row.raw_payload as Record<string,unknown>:null,created_at:String(row.created_at??"")}; }
function truckOf(value: unknown): ControlTruck { const row=recordOf(value); return {id:String(row.id??""),plate_number:String(row.plate_number??""),status:String(row.status??"")}; }
function dedupeById<T extends {id:string}>(rows:T[]) { return [...new Map(rows.map((row)=>[row.id,row])).values()]; }
function serverSummaryOf(value: unknown): ControlCenterServerSummary { const row=recordOf(value); return {todayRevenue:numberOf(row.todayRevenue),totalOrders:numberOf(row.totalOrders),todayOrders:numberOf(row.todayOrders),activeTrips:numberOf(row.activeTrips),deliveredToday:numberOf(row.deliveredToday),delayedTrips:numberOf(row.delayedTrips),unassignedOrders:numberOf(row.unassignedOrders),availableTrucks:numberOf(row.availableTrucks),totalTrucks:numberOf(row.totalTrucks),activeDrivers:numberOf(row.activeDrivers),totalDrivers:numberOf(row.totalDrivers),newCustomersToday:numberOf(row.newCustomersToday),pendingPayments:numberOf(row.pendingPayments),missingEvidence:numberOf(row.missingEvidence),unreportedPaymentReports:numberOf(row.unreportedPaymentReports),unreportedInvoiceTotal:numberOf(row.unreportedInvoiceTotal),legacyCompleted:numberOf(row.legacyCompleted),commissionReceivable:numberOf(row.commissionReceivable),totalDriverDeposit:numberOf(row.totalDriverDeposit),availableDriverDeposit:numberOf(row.availableDriverDeposit),complianceDocumentAlerts:numberOf(row.complianceDocumentAlerts),driverOnboardingAlerts:numberOf(row.driverOnboardingAlerts),maintenanceAlerts:numberOf(row.maintenanceAlerts),releasedAmount:numberOf(row.releasedAmount),escrowAmount:numberOf(row.escrowAmount),refundedAmount:numberOf(row.refundedAmount),failedPayments:numberOf(row.failedPayments),failedOrRefundedPayments:numberOf(row.failedOrRefundedPayments),canonicalPayments:numberOf(row.canonicalPayments),partnerCommission:0,pendingPartnerSettlements:0,pendingPartnerSettlementAmount:0,expiringDocuments:0}; }

export async function getControlCenterData(): Promise<ControlCenterData> {
  // The former per-driver "Driver finance unavailable" fallback remains intentionally gone:
  // exact set-based finance totals come from leadership-guarded server reports.
  const [controlResult,unreportedResult,ceoResult]=await Promise.all([
    supabase.rpc("admin_control_center_v2_report"),
    supabase.rpc("admin_unreported_delivery_payment_page",{p_page:1,p_page_size:50,p_search:null,p_today:false}),
    supabase.rpc("admin_ceo_kpi_v1_report"),
  ]);
  if(controlResult.error) throw new Error(controlResult.error.message);
  if(unreportedResult.error) throw new Error(unreportedResult.error.message);
  if(ceoResult.error) throw new Error(ceoResult.error.message);
  const report=recordOf(controlResult.data), queues=recordOf(report.queues);
  const delayedOrUnassigned=rowsOf(queues.delayedOrUnassigned).map(orderOf), missingEvidence=rowsOf(queues.missingEvidence).map(orderOf), pendingPayments=rowsOf(queues.pendingPayments).map(paymentOf), legacyPayments=rowsOf(queues.legacyPayments).map(paymentOf), failedOrRefundedPayments=rowsOf(queues.failedOrRefundedPayments).map(paymentOf), maintenanceTrucks=rowsOf(queues.maintenanceTrucks).map(truckOf);
  const unreportedReport=recordOf(unreportedResult.data), unreportedPaymentOrders=rowsOf(unreportedReport.rows).slice(0, 6).map(orderOf), serverSummary=serverSummaryOf(report.summary);
  serverSummary.unreportedPaymentReports=numberOf(unreportedReport.total); serverSummary.unreportedInvoiceTotal=numberOf(unreportedReport.invoiceTotal);
  const ceo=recordOf(ceoResult.data);
  serverSummary.partnerCommission=numberOf(ceo.partnerCommission); serverSummary.pendingPartnerSettlements=numberOf(ceo.pendingPartnerSettlements); serverSummary.pendingPartnerSettlementAmount=numberOf(ceo.pendingPartnerSettlementAmount); serverSummary.expiringDocuments=numberOf(ceo.expiringDocuments);
  const topCustomers=rowsOf(ceo.topCustomers).map((row)=>({customer_name:String(row.customer_name??"Unknown"),order_count:numberOf(row.order_count)}));
  const topRoutes=rowsOf(ceo.topRoutes).map((row)=>({pickup_address:String(row.pickup_address??"Unknown"),dropoff_address:String(row.dropoff_address??"Unknown"),order_count:numberOf(row.order_count)}));
  const topPartners=rowsOf(ceo.topPartners).map((row)=>({partner_id:String(row.partner_id??""),gross_etb:numberOf(row.gross_etb),hallo_commission_etb:numberOf(row.hallo_commission_etb),freight_count:numberOf(row.freight_count)}));
  return {orders:dedupeById([...delayedOrUnassigned,...missingEvidence]),payments:dedupeById([...pendingPayments,...legacyPayments,...failedOrRefundedPayments]),trucks:maintenanceTrucks,drivers:[],customers:[],proofs:[],documents:[],unreportedPaymentOrders,driverFinancialSummaries:[],warnings:[],serverSummary,topCustomers,topRoutes,topPartners};
}
