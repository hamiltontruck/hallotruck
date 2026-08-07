import { createClient } from "npm:@supabase/supabase-js@2";
import { handleOptions, json } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const service = createClient(supabaseUrl, serviceRoleKey);

function bearerToken(req: Request) {
  const header = req.headers.get("Authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

function stepInstruction(step: any) {
  const maneuver = step?.maneuver ?? {};
  const type = String(maneuver.type ?? "continue").replaceAll("_", " ");
  const modifier = maneuver.modifier ? ` ${maneuver.modifier}` : "";
  const road = step?.name ? ` onto ${step.name}` : "";
  return `${type}${modifier}${road}`.replace(/^./, (c) => c.toUpperCase());
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const token = bearerToken(req);
  if (!token) return json({ error: "Authentication required" }, 401);

  const { data: authData, error: authError } = await service.auth.getUser(token);
  const user = authData.user;
  if (authError || !user) return json({ error: "Authentication required" }, 401);

  const orderId = new URL(req.url).searchParams.get("orderId");
  if (!orderId) return json({ error: "orderId query param required" }, 400);

  const { data: routePoint, error: routeError } = await service
    .from("order_route_points")
    .select("order_id, driver_id, customer_id, pickup_lng, pickup_lat, dropoff_lng, dropoff_lat")
    .eq("order_id", orderId)
    .single();

  if (routeError || !routePoint) return json({ error: "Order route not found" }, 404);
  if (routePoint.driver_id !== user.id && routePoint.customer_id !== user.id) {
    return json({ error: "Not authorized for this order" }, 403);
  }

  const coords = `${routePoint.pickup_lng},${routePoint.pickup_lat};${routePoint.dropoff_lng},${routePoint.dropoff_lat}`;
  const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true`;

  let response: Response;
  try {
    response = await fetch(osrmUrl, { headers: { "User-Agent": "HalloTruck/1.0" } });
  } catch (err) {
    console.error(err);
    return json({ error: "Routing service unavailable" }, 502);
  }

  if (!response.ok) return json({ error: "Routing service returned an error" }, 502);

  const payload = await response.json();
  const route = payload?.routes?.[0];
  if (!route?.geometry) return json({ error: "No driving route found" }, 404);

  const steps = (route.legs ?? []).flatMap((leg: any) => leg.steps ?? []).map((step: any) => {
    const maneuverLocation = step?.maneuver?.location;
    const location =
      Array.isArray(maneuverLocation) && maneuverLocation.length >= 2
        ? [Number(maneuverLocation[0]), Number(maneuverLocation[1])]
        : null;

    return {
      instruction: stepInstruction(step),
      distanceM: Number(step.distance ?? 0),
      durationSec: Number(step.duration ?? 0),
      location,
    };
  });

  return json({
    geometry: route.geometry,
    distanceKm: Number(route.distance ?? 0) / 1000,
    durationMin: Number(route.duration ?? 0) / 60,
    steps,
  });
});
