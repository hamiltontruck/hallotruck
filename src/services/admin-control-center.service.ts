import { supabase } from "./supabase.client";

export interface ControlOrder { id:string; tracking_id:string; customer_name:string|null; pickup_address:string; dropoff_address:string; status:string; payment_status:string; driver_id:string|null; truck_id:string|null; accepted_at:string|null; delivered_at:string|null; created_at:string; }
export interface ControlPayment { id:string; order_id:string; provider:string; provider_ref:string|null; amount_etb:number; event:string; receipt_path:string|null; raw_payload:Record<string,unknown>|null; created_at:string; }
export interface ControlTruck { id:string; plate_number:string; status:string; }
export interface ControlDriver { id:string; full_name:string|null; driver_status:string|null; }
export interface ControlCustomer { id:string; created_at:string; }
export interface ControlProof { id:string; order_id:string; }
export interface ControlDocument { id:string; driver_id:string; document_key:string; status:string; expiry_date:string|null; }
export interface ControlDriverFinancialSummary { driver_id:string; completed_trips:number|string; gross_released_etb:number|string; commission_charged_etb:number|string; commission_paid_etb:number|string; admin_deposit_etb:number|string; available_deposit_etb:number|string; commission_due_etb:number|string; }
export interface CeoTopCustomer { customer_name:string; order_count:number; }
export interface CeoTopRoute { pickup_address:string; dropoff_address:string; order_count:number; }
export interface CeoTopPartner { partner_id:string; gross_etb:number; hallo_commission_etb:number; freight_count:number; }

export interface ControlCenterServerSummary {
  todayRevenue:number; totalOrders:number; todayOrders:number; activeTrips:number; deliveredToday:number; delayedTrips:number; unassignedOrders:number; availableTrucks:number; totalTrucks:number; activeDrivers:number; totalDrivers:number; newCustomersToday:number; pendingPayments:number; missingEvidence:number; unreportedPaymentReports:number; unreportedInvoiceTotal:number; legacyCompleted:number; commissionReceivable:number; totalDriverDeposit:number; availableDriverDeposit:number; complianceDocumentAlerts:number; driverOnboardingAlerts:number; maintenanceAlerts:number; releasedAmount:number; escrowAmount:number; refundedAmount:number; failedPayments:number; failedOrRefundedPayments:number; canonicalPayments:number;
  partnerCommission:number; pendingPartnerSettlements:number; pendingPartnerSettlementAmount:number; expiringDocuments:number;
}
export interface ControlCenterData {
  orders:ControlOrder[]; payments:ControlPayment[]; trucks:ControlTruck[]; drivers:ControlDriver[]; customers:ControlCustomer[]; proofs:ControlProof[]; documents:ControlDocument[];
  unreportedPaymentOrders?:ControlOrder[]; driverFinancialSummaries?:ControlDriverFinancialSummary[]; warnings?:string[]; serverSummary?:ControlCenterServerSummary;
  topCustomers?:CeoTopCustomer[]; topRoutes?:CeoTopRoute[]; topPartners?:CeoTopPartner[];
}
type UnknownRecord=Record<string,unknown>;
const numberOf=(value:unknown)=>{const parsed=Number(value??0);return Number.isFinite(parsed)?parsed:0;};
const recordOf=(value:unknown):UnknownRecord=>value&&typeof value==="object"&&!Array.isArray(value)?value as UnknownRecord:{};
const rowsOf=(value:unknown):UnknownRecord[]=>Array.isArray(value)?value.map(recordOf):[];
function orderOf(value:unknown):ControlOrder{const r=recordOf(value);return{id:String(r.id??""),tracking_id:String(r.tracking_id??""),customer_name:r.customer_name==null?null:String(r.customer_name),pickup_address:String(r.pickup_address??""),dropoff_address:String(r.dropoff_address??""),status:String(r.status??""),payment_status:String(r.payment_status??""),driver_id:r.driver_id==null?null:String(r.driver_id),truck_id:r.truck_id==null?null:String(r.truck_id),accepted_at:r.accepted_at==null?null:String(r.accepted_at),delivered_at:r.delivered_at==null?null:String(r.delivered_at),created_at:String(r.created_at??"")};}
function paymentOf(value:unknown):ControlPayment{const r=recordOf(value);return{id:String(r.id??""),order_id:String(r.order_id??""),provider:String(r.provider??""),provider_ref:r.provider_ref==null?null:String(r.provider_ref),amount_etb:numberOf(r.amount_etb),event:String(r.event??""),receipt_path:r.receipt_path==null?null:String(r.receipt_path),raw_payload:r.raw_payload&&typeof r.raw_payload==="object"&&!Array.isArray(r.raw_payload)?r.raw_payload as Record<string,unknown>:null,created_at:String(r.created_at??"")};}
function truckOf(value:unknown):ControlTruck{const r=recordOf(value);return{id:String(r.id??""),plate_number:String(r.plate_number??""),status:String(r.status??"")};}
const dedupeById=<T extends{id:string}>(rows:T[])=>[...new Map(rows.map(r=>[r.id,r])).values()];
function serverSummaryOf(value:unknown):ControlCenterServerSummary{const r=recordOf(value);return{todayRevenue:numberOf(r.todayRevenue),totalOrders:numberOf(r.totalOrders),todayOrders:numberOf(r.todayOrders),activeTrips:numberOf(r.activeTrips),deliveredToday:numberOf(r.deliveredToday),delayedTrips:numberOf(r.delayedTrips),unassignedOrders:numberOf(r.unassignedOrders),availableTrucks:numberOf(r.availableTrucks),totalTrucks:numberOf(r.totalTrucks),activeDrivers:numberOf(r.activeDrivers),totalDrivers:numberOf(r.totalDrivers),newCustomersToday:numberOf(r.newCustomersToday),pendingPayments:numberOf(r.pendingPayments),missingEvidence:numberOf(r.missingEvidence),unreportedPaymentReports:numberOf(r.unreportedPaymentReports),unreportedInvoiceTotal:numberOf(r.unreportedInvoiceTotal),legacyCompleted:numberOf(r.legacyCompleted),commissionReceivable:numberOf(r.commissionReceivable),totalDriverDeposit:numberOf(r.totalDriverDeposit),availableDriverDeposit:numberOf(r.availableDriverDeposit),complianceDocumentAlerts:numberOf(r.complianceDocumentAlerts),driverOnboardingAlerts:numberOf(r.driverOnboardingAlerts),maintenanceAlerts:numberOf(r.maintenanceAlerts),releasedAmount:numberOf(r.releasedAmount),escrowAmount:numberOf(r.escrowAmount),refundedAmount:numberOf(r.refundedAmount),failedPayments:numberOf(r.failedPayments),failedOrRefundedPayments:numberOf(r.failedOrRefundedPayments),canonicalPayments:numberOf(r.canonicalPayments),partnerCommission:0,pendingPartnerSettlements:0,pendingPartnerSettlementAmount:0,expiringDocuments:0};}

export async function getControlCenterData():Promise<ControlCenterData>{
  const [controlResult,unreportedResult,ceoResult]=await Promise.all([
    supabase.rpc("admin_control_center_v2_report"),
    supabase.rpc("admin_unreported_delivery_payment_page",{p_page:1,p_page_size:50,p_search:null,p_today:false}),
    supabase.rpc("admin_ceo_kpi_v1_report"),
  ]);
  if(controlResult.error)throw new Error(controlResult.error.message);
  if(unreportedResult.error)throw new Error(unreportedResult.error.message);
  if(ceoResult.error)throw new Error(ceoResult.error.message);
  const report=recordOf(controlResult.data),queues=recordOf(report.queues),ceo=recordOf(ceoResult.data);
  const delayedOrUnassigned=rowsOf(queues.delayedOrUnassigned).map(orderOf),missingEvidence=rowsOf(queues.missingEvidence).map(orderOf);
  const pendingPayments=rowsOf(queues.pendingPayments).map(paymentOf),legacyPayments=rowsOf(queues.legacyPayments).map(paymentOf),failedOrRefundedPayments=rowsOf(queues.failedOrRefundedPayments).map(paymentOf),maintenanceTrucks=rowsOf(queues.maintenanceTrucks).map(truckOf);
  const unreportedReport=recordOf(unreportedResult.data),unreportedPaymentOrders=rowsOf(unreportedReport.rows).slice(0,6).map(orderOf),serverSummary=serverSummaryOf(report.summary);
  serverSummary.unreportedPaymentReports=numberOf(unreportedReport.total); serverSummary.unreportedInvoiceTotal=numberOf(unreportedReport.invoiceTotal);
  serverSummary.partnerCommission=numberOf(ceo.partnerCommission); serverSummary.pendingPartnerSettlements=numberOf(ceo.pendingPartnerSettlements); serverSummary.pendingPartnerSettlementAmount=numberOf(ceo.pendingPartnerSettlementAmount); serverSummary.expiringDocuments=numberOf(ceo.expiringDocuments);
  const topCustomers=rowsOf(ceo.topCustomers).map(r=>({customer_name:String(r.customer_name??"Unknown"),order_count:numberOf(r.order_count)}));
  const topRoutes=rowsOf(ceo.topRoutes).map(r=>({pickup_address:String(r.pickup_address??"Unknown"),dropoff_address:String(r.dropoff_address??"Unknown"),order_count:numberOf(r.order_count)}));
  const topPartners=rowsOf(ceo.topPartners).map(r=>({partner_id:String(r.partner_id??""),gross_etb:numberOf(r.gross_etb),hallo_commission_etb:numberOf(r.hallo_commission_etb),freight_count:numberOf(r.freight_count)}));
  return{orders:dedupeById([...delayedOrUnassigned,...missingEvidence]),payments:dedupeById([...pendingPayments,...legacyPayments,...failedOrRefundedPayments]),trucks:maintenanceTrucks,drivers:[],customers:[],proofs:[],documents:[],unreportedPaymentOrders,driverFinancialSummaries:[],warnings:[],serverSummary,topCustomers,topRoutes,topPartners};
}
