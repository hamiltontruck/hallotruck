import { supabase } from "./supabase.client";

export type CustomerLevel = "standard" | "silver" | "gold" | "vip";

export type AdminCustomerRegistryRow = {
  id: string;
  customerCode: string;
  authUserId: string | null;
  fullName: string;
  phone: string;
  email: string | null;
  companyName: string | null;
  level: CustomerLevel;
  isCreditCustomer: boolean;
  creditLimitEtb: number;
  orderCount: number;
  deliveredCount: number;
  lifetimeOrderEtb: number;
  largestOrderEtb: number;
  lastOrderAt: string | null;
  createdAt: string;
};

export type AdminDriverRegistryRow = {
  id: string;
  driverCode: string | null;
  fullName: string | null;
  phone: string | null;
  email: string | null;
  status: string | null;
  rating: number;
  truckId: string | null;
  plateNumber: string | null;
  vehicleType: string | null;
  model: string | null;
  truckStatus: string | null;
  requiredDocumentsSubmitted: number;
  requiredDocumentsVerified: number;
  orderCount: number;
  lastOrderAt: string | null;
  createdAt: string;
};

export type AdminCustomerRegistryReport = {
  totalCustomers: number;
  vipCustomers: number;
  newCustomers30d: number;
  customers: AdminCustomerRegistryRow[];
};

export type AdminDriverRegistryReport = {
  totalDrivers: number;
  approvedDrivers: number;
  pendingDrivers: number;
  drivers: AdminDriverRegistryRow[];
};

function n(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function customerLevel(value: unknown): CustomerLevel {
  const level = String(value ?? "standard").toLowerCase();
  return level === "silver" || level === "gold" || level === "vip" ? level : "standard";
}

function normalizeCustomer(raw: unknown): AdminCustomerRegistryRow {
  const row = (raw ?? {}) as Record<string, unknown>;
  return {
    id: String(row.id ?? ""),
    customerCode: String(row.customerCode ?? ""),
    authUserId: row.authUserId ? String(row.authUserId) : null,
    fullName: String(row.fullName ?? "Customer"),
    phone: String(row.phone ?? ""),
    email: row.email ? String(row.email) : null,
    companyName: row.companyName ? String(row.companyName) : null,
    level: customerLevel(row.level),
    isCreditCustomer: Boolean(row.isCreditCustomer),
    creditLimitEtb: n(row.creditLimitEtb),
    orderCount: n(row.orderCount),
    deliveredCount: n(row.deliveredCount),
    lifetimeOrderEtb: n(row.lifetimeOrderEtb),
    largestOrderEtb: n(row.largestOrderEtb),
    lastOrderAt: row.lastOrderAt ? String(row.lastOrderAt) : null,
    createdAt: String(row.createdAt ?? ""),
  };
}

function normalizeDriver(raw: unknown): AdminDriverRegistryRow {
  const row = (raw ?? {}) as Record<string, unknown>;
  return {
    id: String(row.id ?? ""),
    driverCode: row.driverCode ? String(row.driverCode) : null,
    fullName: row.fullName ? String(row.fullName) : null,
    phone: row.phone ? String(row.phone) : null,
    email: row.email ? String(row.email) : null,
    status: row.status ? String(row.status) : null,
    rating: n(row.rating),
    truckId: row.truckId ? String(row.truckId) : null,
    plateNumber: row.plateNumber ? String(row.plateNumber) : null,
    vehicleType: row.vehicleType ? String(row.vehicleType) : null,
    model: row.model ? String(row.model) : null,
    truckStatus: row.truckStatus ? String(row.truckStatus) : null,
    requiredDocumentsSubmitted: n(row.requiredDocumentsSubmitted),
    requiredDocumentsVerified: n(row.requiredDocumentsVerified),
    orderCount: n(row.orderCount),
    lastOrderAt: row.lastOrderAt ? String(row.lastOrderAt) : null,
    createdAt: String(row.createdAt ?? ""),
  };
}

export async function getAdminCustomerRegistry(): Promise<AdminCustomerRegistryReport> {
  const { data, error } = await supabase.rpc("admin_customer_registry_report");
  if (error) throw new Error(error.message);
  const value = (data ?? {}) as Record<string, unknown>;
  return {
    totalCustomers: n(value.totalCustomers),
    vipCustomers: n(value.vipCustomers),
    newCustomers30d: n(value.newCustomers30d),
    customers: Array.isArray(value.customers) ? value.customers.map(normalizeCustomer) : [],
  };
}

export async function getAdminDriverRegistry(): Promise<AdminDriverRegistryReport> {
  const { data, error } = await supabase.rpc("admin_driver_registry_report");
  if (error) throw new Error(error.message);
  const value = (data ?? {}) as Record<string, unknown>;
  return {
    totalDrivers: n(value.totalDrivers),
    approvedDrivers: n(value.approvedDrivers),
    pendingDrivers: n(value.pendingDrivers),
    drivers: Array.isArray(value.drivers) ? value.drivers.map(normalizeDriver) : [],
  };
}

export async function setAdminCustomerLevel(customerId: string, level: CustomerLevel, reason: string) {
  const { error } = await supabase.rpc("admin_set_customer_level", {
    p_customer_id: customerId,
    p_level: level,
    p_reason: reason.trim(),
  });
  if (error) throw new Error(error.message);
}
