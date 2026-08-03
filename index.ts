// POST /functions/v1/tracking   -> driver submits a GPS ping
//   Body: { orderId, lng, lat, heading?, speedKmh? }
// GET  /functions/v1/tracking?orderId=...  -> latest position for live map
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleOptions, json } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: "Authentication required" }, 401);

  if (req.method === "POST") {
    try {
      const { orderId, lng, lat, heading, speedKmh } = await req.json();
      if (!orderId || lng === undefined || lat === undefined) {
        return json({ error: "orderId, lng, lat are required" }, 400);
      }

      // Confirm this driver owns the order + mark in_transit on first ping
      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .select("id, driver_id, status")
        .eq("id", orderId)
        .single();

      if (orderErr || !order) return json({ error: "Order not found" }, 404);
      if (order.driver_id !== user.id) {
        return json({ error: "Not assigned to this order" }, 403);
      }

      const { error: pingErr } = await supabase.from("tracking_pings").insert({
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
        await supabase.from("orders").update({ status: "in_transit" }).eq(
          "id",
          orderId,
        );
      }

      return json({ ok: true });
    } catch (err) {
      console.error(err);
      return json({ error: "Invalid request body" }, 400);
    }
  }

  if (req.method === "GET") {
    const url = new URL(req.url);
    const orderId = url.searchParams.get("orderId");
    if (!orderId) return json({ error: "orderId query param required" }, 400);

    const { data, error } = await supabase
      .from("tracking_pings")
      .select("location, heading, speed_kmh, recorded_at")
      .eq("order_id", orderId)
      .order("recorded_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return json({ error: "No tracking data yet" }, 404);
    return json(data);
  }

  return json({ error: "Method not allowed" }, 405);
});
