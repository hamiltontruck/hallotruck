import type { AdminOrder, Customer, Driver, Payment, Truck } from "./admin.service";
import type { AdminIntelligenceData } from "../domain/admin-intelligence";
import { supabase } from "./supabase.client";

function fail(message: string): never {
  throw new Error(message);
}

type PageResult<T> = { data: T[]; error: { message: string } | null };

async function allPages<T>(loadPage: (from: number, to: number) => Promise<PageResult<T>>) {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const result = await loadPage(from, from + pageSize - 1);
    if (result.error) fail(result.error.message);
    rows.push(...result.data);
    if (result.data.length < pageSize) return rows;
  }
}

export async function getAdminIntelligenceData(): Promise<AdminIntelligenceData> {
  const [orders, customers, drivers, trucks, payments] = await Promise.all([
    allPages<AdminOrder>(async (from, to) => { const result = await supabase.from("orders").select("id,tracking_id,customer_name,customer_phone,pickup_address,dropoff_address,cargo_description,vehicle_type,price_etb,status,payment_status,driver_id,truck_id,accepted_at,delivered_at,cancellation_reason,cancellation_source,cancelled_at,created_at").order("created_at", { ascending: false }).range(from, to); return { data: (result.data ?? []) as AdminOrder[], error: result.error }; }),
    allPages<Customer>(async (from, to) => { const result = await supabase.from("customers").select("id,full_name,phone,email,company_name,is_credit_customer,created_at").order("created_at", { ascending: false }).range(from, to); return { data: (result.data ?? []) as Customer[], error: result.error }; }),
    allPages<Driver>(async (from, to) => { const result = await supabase.from("profiles").select("id,full_name,phone,driver_status").eq("role", "driver").order("full_name").range(from, to); return { data: (result.data ?? []) as Driver[], error: result.error }; }),
    allPages<Truck>(async (from, to) => { const result = await supabase.from("trucks").select("id,plate_number,vehicle_type,capacity_tons,status,created_at").order("created_at", { ascending: false }).range(from, to); return { data: (result.data ?? []) as Truck[], error: result.error }; }),
    allPages<Payment>(async (from, to) => { const result = await supabase.from("payments").select("id,order_id,provider,provider_ref,amount_etb,event,receipt_path,created_at").order("created_at", { ascending: false }).range(from, to); return { data: (result.data ?? []) as Payment[], error: result.error }; }),
  ]);

  return {
    orders,
    customers,
    drivers,
    trucks,
    payments,
  };
}
