import type { CustomerProfile } from "./customer.service";
import { supabase } from "./supabase.client";

export async function getCustomerProfile(): Promise<CustomerProfile | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Customer session expired.");

  const { data, error } = await supabase.rpc("customer_get_profile");
  if (error) throw new Error(error.message);
  return ((data?.[0] ?? null) as CustomerProfile | null);
}

export async function updateCustomerProfile(input: {
  fullName: string;
  phone: string;
  email: string;
  homeAddress: string;
  customerType: "individual" | "business";
  companyName: string;
}) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Customer session expired.");

  const fullName = input.fullName.trim();
  const phone = input.phone.trim();
  const email = input.email.trim();
  const homeAddress = input.homeAddress.trim();
  const companyName = input.companyName.trim();

  if (fullName.length < 2) throw new Error("Enter your full name.");
  if (!/^(09\d{8}|\+2519\d{8})$/.test(phone)) throw new Error("Phone must be 09xxxxxxxx or +2519xxxxxxxx.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  if (input.customerType === "business" && !companyName) throw new Error("Company name is required for a business account.");

  const { error } = await supabase.rpc("customer_update_profile", {
    p_full_name: fullName,
    p_phone: phone,
    p_email: email || null,
    p_home_address: homeAddress || null,
    p_customer_type: input.customerType,
    p_company_name: input.customerType === "business" ? companyName : null,
  });

  if (error) throw new Error(error.message);
}
