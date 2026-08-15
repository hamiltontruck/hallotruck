import { supabase } from "./supabase.client";

export interface DriverRating {
  id: string;
  order_id: string;
  score: number;
  comment: string | null;
  created_at: string;
}

export interface DriverRatingSummary {
  average: number;
  count: number;
  recent: DriverRating[];
}

export async function getCustomerRating(orderId: string): Promise<DriverRating | null> {
  const { data, error } = await supabase
    .from("ratings")
    .select("id,order_id,score,comment,created_at")
    .eq("order_id", orderId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data ?? null) as DriverRating | null;
}

export async function saveCustomerRating(input: {
  orderId: string;
  score: number;
  comment: string;
}): Promise<DriverRating> {
  const score = Math.round(input.score);
  if (score < 1 || score > 5) throw new Error("Choose a rating from 1 to 5 stars.");

  const { data, error } = await supabase.rpc("customer_submit_rating", {
    p_order_id: input.orderId,
    p_score: score,
    p_comment: input.comment.trim() || null,
  });

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Rating could not be saved.");
  return data as DriverRating;
}

export async function getDriverRatingSummary(): Promise<DriverRatingSummary> {
  const { data, error } = await supabase
    .from("ratings")
    .select("id,order_id,score,comment,created_at")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as DriverRating[];
  const average = rows.length
    ? rows.reduce((sum, rating) => sum + Number(rating.score), 0) / rows.length
    : 0;

  return {
    average,
    count: rows.length,
    recent: rows.filter((rating) => rating.comment?.trim()).slice(0, 3),
  };
}
