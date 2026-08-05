import { supabase } from "./supabase.client";

export type AdminRole = "admin" | "ceo";

export interface DashboardMetrics {
  totalOrders: number;
  activeOrders: number;
  deliveredOrders: number;
  availableTrucks: number;
  totalCustomers: number;
  revenueEtb: number;
}

export interface AdminOrder {
  id: string;
  tracking_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  pickup_address: string;
  dropoff_address: string;
  cargo_description: string | null;
  vehicle_type: string;
  price_etb: number | null;
  status: string;
  payment_status: string;
  created_at: string;
}

export interface Customer {
  id: string;
  full_name: string;
  phone: string;
  email: string | null;
  company_name: string | null;
  is_credit_customer: boolean;
  created_at: string;
}

export interface Truck {
  id: string;
  plate_number: string;
  vehicle_type: string;
  capacity_tons: number | null;
  status: string;
  created_at: string;
}

export interface Payment {
  id: string;
  order_id: string;
  provider: string;
  provider_ref: string | null;
  amount_etb: number;
  event: string;
  created_at: string;
}

function fail(message: string): never { throw new Error(message); }

export async function getDashboardData() {
  const [ordersResult, trucksResult, customersResult, paymentsResult] = await Promise.all([
    supabase.from("orders").select("id,tracking_id,customer_name,customer_phone,pickup_address,dropoff_address,cargo_description,vehicle_type,price_etb,status,payment_status,created_at").order("created_at", { ascending: false }).limit(100),
    supabase.from("trucks").select("id,plate_number,vehicle_type,capacity_tons,status,created_at").order("created_at", { ascending: false }),
    supabase.from("customers").select("id,full_name,phone,email,company_name,is_credit_customer,created_at").order("created_at", { ascending: false }),
    supabase.from("payments").select("id,order_id,provider,provider_ref,amount_etb,event,created_at").order("created_at", { ascending: false }).limit(100),
  ]);

  const error = ordersResult.error || trucksResult.error || customersResult.error || paymentsResult.error;
  if (error) fail(error.message);

  const orders = (ordersResult.data ?? []) as AdminOrder[];
  const trucks = (trucksResult.data ?? []) as Truck[];
  const customers = (customersResult.data ?? []) as Customer[];
  const payments = (paymentsResult.data ?? []) as Payment[];
  const releasedPayments = payments.filter((payment) => payment.event === "released");

  const metrics: DashboardMetrics = {
    totalOrders: orders.length,
    activeOrders: orders.filter((order) => ["accepted", "in_transit"].includes(order.status)).length,
    deliveredOrders: orders.filter((order) => order.status === "delivered").length,
    availableTrucks: trucks.filter((truck) => truck.status === "available").length,
    totalCustomers: customers.length,
    revenueEtb: releasedPayments.reduce((sum, payment) => sum + Number(payment.amount_etb || 0), 0),
  };

  return { metrics, orders, trucks, customers, payments };
}

export interface NewOrderInput {
  customerName: string;
  customerPhone: string;
  pickupAddress: string;
  dropoffAddress: string;
  cargoDescription: string;
  vehicleType: string;
  priceEtb: number;
}

export async function createOrder(input: NewOrderInput) {
  const trackingId = `HT-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
  const { data, error } = await supabase.from("orders").insert({
    tracking_id: trackingId,
    customer_name: input.customerName,
    customer_phone: input.customerPhone,
    pickup_address: input.pickupAddress,
    dropoff_address: input.dropoffAddress,
    cargo_description: input.cargoDescription || null,
    vehicle_type: input.vehicleType,
    price_etb: input.priceEtb,
    status: "placed",
    payment_status: "unpaid",
  }).select("*").single();
  if (error) fail(error.message);
  return data as AdminOrder;
}

export async function createCustomer(input: { fullName: string; phone: string; email?: string; companyName?: string }) {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("customers").insert({
    full_name: input.fullName,
    phone: input.phone,
    email: input.email || null,
    company_name: input.companyName || null,
    created_by: auth.user?.id,
  });
  if (error) fail(error.message);
}

export async function createTruck(input: { plateNumber: string; vehicleType: string; capacityTons?: number }) {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from("trucks").insert({
    plate_number: input.plateNumber,
    vehicle_type: input.vehicleType,
    capacity_tons: input.capacityTons || null,
    created_by: auth.user?.id,
  });
  if (error) fail(error.message);
}

export function subscribeToAdminData(onChange: () => void) {
  return supabase.channel("admin-live-data")
    .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "trucks" }, onChange)
    .subscribe();
}
