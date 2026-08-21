import { createClient } from "npm:@supabase/supabase-js@2";
import { handleOptions, json } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const service = createClient(supabaseUrl, serviceRoleKey);

function bearerToken(req: Request) {
  const header = req.headers.get("Authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  const token = bearerToken(req);
  if (!token) return json({ error: "Authentication required" }, 401);

  const { data: authData, error: authError } = await service.auth.getUser(token);
  const user = authData.user;
  if (authError || !user) return json({ error: "Authentication required" }, 401);

  if (req.method === "POST") {
    try {
      const { orderId, lng, lat, heading, speedKmh } = await req.json();
      if (!orderId || lng === undefined || lat === undefined) {
        return json({ error: "orderId, lng, lat are required" }, 400);
      }

      const { data: order, error: orderErr } = await service
        .from("orders")
        .select("id, driver_id, status")
        .eq("id", orderId)
        .single();

      if (orderErr || !order) return json({ error: "Order not found" }, 404);
      if (order.driver_id !== user.id) {
        return json({ error: "Not assigned to this order" }, 403);
      }
      if (!["accepted", "in_transit"].includes(order.status)) {
        return json({ error: order.status === "cancelled" ? "Customer cancelled this order" : "This order is not active" }, 409);
      }

      const { error: pingErr } = await service.from("tracking_pings").insert({
        order_id: orderId,
        driver_id: user.id,
        location: `POINT(${lng} ${lat})`,
        heading: heading ?? null,
        speed_kmh: speedKmh ?? null,
      });

      if (pingErr) {
        console.error(pingErr);
        return json({ error: "Failed to record ping" }, 500);
      }

      if (order.status === "accepted") {
        await service.from("orders").update({ status: "in_transit" }).eq("id", orderId).eq("status", "accepted");
      }

      return json({ ok: true });
    } catch (err) {
      console.error(err);
      return json({ error: "Invalid request body" }, 400);
    }
  }

  if (req.method === "GET") {
    const orderId = new URL(req.url).searchParams.get("orderId");
    if (!orderId) return json({ error: "orderId query param required" }, 400);

    const { data: order, error: orderErr } = await service
      .from("orders")
      .select("id, driver_id, customer_id")
      .eq("id", orderId)
      .single();

    if (orderErr || !order) return json({ error: "Order not found" }, 404);
    if (order.driver_id !== user.id && order.customer_id !== user.id) {
      return json({ error: "Not authorized for this order" }, 403);
    }

    const { data, error } = await service
      .from("tracking_pings")
      .select("location, heading, speed_kmh, recorded_at")
      .eq("order_id", orderId)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return json({ error: "Failed to load tracking data" }, 500);
    if (!data) return json({ error: "No tracking data yet" }, 404);
    return json(data);
  }

  return json({ error: "Method not allowed" }, 405);
});
