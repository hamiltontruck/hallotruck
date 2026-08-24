import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function bearerToken(request: Request) {
  const header = request.headers.get("Authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const token = bearerToken(request);
  if (!token) return json({ error: "Authentication required" }, 401);

  const { data: authData, error: authError } = await service.auth.getUser(token);
  const user = authData.user;
  if (authError || !user) return json({ error: "Authentication required" }, 401);

  if (request.method === "POST") {
    try {
      const payload = await request.json();
      const orderId = String(payload.orderId ?? "");
      const lng = Number(payload.lng);
      const lat = Number(payload.lat);
      const heading = payload.heading === undefined || payload.heading === null ? null : Number(payload.heading);
      const speedKmh = payload.speedKmh === undefined || payload.speedKmh === null ? null : Number(payload.speedKmh);
      const accuracyM = payload.accuracyM === undefined || payload.accuracyM === null ? null : Number(payload.accuracyM);
      const recordedAt = payload.recordedAt ? String(payload.recordedAt) : null;
      const androidDeviceId = payload.androidDeviceId ? String(payload.androidDeviceId) : null;

      if (!orderId || !Number.isFinite(lng) || !Number.isFinite(lat)) {
        return json({ error: "orderId, lng and lat are required" }, 400);
      }

      const { data, error } = await service.rpc("record_driver_tracking_ping", {
        p_driver_id: user.id,
        p_order_id: orderId,
        p_lng: lng,
        p_lat: lat,
        p_heading: Number.isFinite(heading) ? heading : null,
        p_speed_kmh: Number.isFinite(speedKmh) ? speedKmh : null,
        p_accuracy_m: Number.isFinite(accuracyM) ? accuracyM : null,
        p_source_recorded_at: recordedAt,
        p_android_device_id: androidDeviceId,
      });

      if (error) {
        const status = error.code === "42501" ? 403
          : error.code === "P0002" ? 404
          : error.code === "23514" ? 409
          : error.code === "22023" ? 400
          : 500;
        return json({ error: error.message }, status);
      }

      const row = Array.isArray(data) ? data[0] : data;
      return json({
        ok: true,
        pingId: row?.ping_id ?? null,
        inserted: row?.inserted ?? false,
        throttled: row?.inserted === false,
        recordedAt: row?.recorded_at ?? null,
      });
    } catch (error) {
      console.error(error);
      return json({ error: "Invalid request body" }, 400);
    }
  }

  if (request.method === "GET") {
    const orderId = new URL(request.url).searchParams.get("orderId");
    if (!orderId) return json({ error: "orderId query parameter is required" }, 400);

    const { data: order, error: orderError } = await service
      .from("orders")
      .select("id,driver_id,customer_id")
      .eq("id", orderId)
      .maybeSingle();

    if (orderError || !order) return json({ error: "Order not found" }, 404);
    const role = String(user.app_metadata?.role ?? "");
    const allowed = order.driver_id === user.id
      || order.customer_id === user.id
      || role === "admin"
      || role === "ceo";
    if (!allowed) return json({ error: "Not authorized for this order" }, 403);

    const { data, error } = await service
      .from("tracking_pings")
      .select("id,location,heading,speed_kmh,accuracy_m,source_recorded_at,recorded_at")
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
