import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
let cachedToken: { value: string; expiresAt: number } | null = null;

type ServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

type ClaimedPush = {
  outbox_id: string;
  notification_id: string;
  user_id: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
};

type MobileDevice = {
  id: string;
  fcm_token: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function base64Url(input: Uint8Array | string) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToArrayBuffer(pem: string) {
  const base64 = pem
    .replace(/\\n/g, "\n")
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

async function signedJwt(account: ServiceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({
    iss: account.client_email,
    scope: FCM_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}

async function accessToken(account: ServiceAccount) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: await signedJwt(account),
    }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    throw new Error(`Firebase OAuth failed: ${payload.error_description ?? payload.error ?? response.status}`);
  }
  cachedToken = {
    value: payload.access_token,
    expiresAt: Date.now() + Number(payload.expires_in ?? 3600) * 1000,
  };
  return cachedToken.value;
}

function messageData(data: Record<string, unknown> | null, notificationId: string, eventType: string) {
  const result: Record<string, string> = {
    notification_id: notificationId,
    event_type: eventType,
  };
  for (const [key, value] of Object.entries(data ?? {})) {
    if (value !== null && value !== undefined) result[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return result;
}

function invalidToken(status: number, payload: any) {
  if (status === 404) return true;
  return (payload?.error?.details ?? []).some((detail: any) =>
    detail?.errorCode === "UNREGISTERED" || detail?.errorCode === "INVALID_ARGUMENT"
  );
}

async function complete(outboxId: string, status: "sent" | "partial" | "failed" | "skipped", error?: string) {
  const { error: rpcError } = await service.rpc("complete_push_notification", {
    p_outbox_id: outboxId,
    p_status: status,
    p_error: error ?? null,
  });
  if (rpcError) console.error("complete_push_notification", rpcError);
}

async function sendToDevice(
  push: ClaimedPush,
  eventType: string,
  device: MobileDevice,
  account: ServiceAccount,
  token: string,
) {
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: {
          token: device.fcm_token,
          notification: { title: push.title, body: push.body },
          data: messageData(push.data, push.notification_id, eventType),
          android: {
            priority: "high",
            notification: {
              channel_id: "hallotruck_updates",
              sound: "default",
              click_action: "OPEN_HALLOTRUCK",
            },
          },
        },
      }),
    },
  );
  let payload: any = {};
  try { payload = await response.json(); } catch { payload = {}; }
  const isInvalid = !response.ok && invalidToken(response.status, payload);
  const status = response.ok ? "sent" : isInvalid ? "invalid_token" : "failed";
  const errorMessage = response.ok ? null : String(payload?.error?.message ?? `FCM HTTP ${response.status}`).slice(0, 1000);

  await service.from("push_notification_deliveries").upsert({
    outbox_id: push.outbox_id,
    device_id: device.id,
    status,
    fcm_message_name: response.ok ? payload.name ?? null : null,
    error_message: errorMessage,
    attempted_at: new Date().toISOString(),
  }, { onConflict: "outbox_id,device_id" });

  if (isInvalid) {
    await service.from("mobile_devices").update({
      fcm_token: null,
      is_active: false,
      updated_at: new Date().toISOString(),
    }).eq("id", device.id);
  }
  return { ok: response.ok, error: errorMessage };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const secret = request.headers.get("x-hallo-dispatch-secret") ?? "";
  const { data: allowed, error: validationError } = await service.rpc(
    "validate_push_dispatch_secret",
    { p_secret: secret },
  );
  if (validationError || allowed !== true) return json({ error: "Unauthorized" }, 401);

  const rawAccount = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!rawAccount) return json({ ok: false, configured: false, error: "FIREBASE_SERVICE_ACCOUNT_JSON is not configured" }, 503);

  let account: ServiceAccount;
  try {
    account = JSON.parse(rawAccount);
    if (!account.project_id || !account.client_email || !account.private_key) throw new Error("Missing service-account fields");
  } catch (error) {
    return json({ ok: false, configured: false, error: `Invalid Firebase service account: ${error}` }, 503);
  }

  let token: string;
  try { token = await accessToken(account); }
  catch (error) { return json({ ok: false, error: String(error) }, 502); }

  const { data: claimed, error: claimError } = await service.rpc("claim_push_notifications", { p_limit: 50 });
  if (claimError) return json({ ok: false, error: claimError.message }, 500);
  const pushes = (claimed ?? []) as ClaimedPush[];
  if (!pushes.length) return json({ ok: true, claimed: 0, sent: 0 });

  const { data: notificationRows } = await service
    .from("notifications")
    .select("id,event_type")
    .in("id", pushes.map((push) => push.notification_id));
  const eventTypes = new Map((notificationRows ?? []).map((row: any) => [row.id, row.event_type]));

  let sent = 0;
  let partial = 0;
  let failed = 0;
  let skipped = 0;

  for (const push of pushes) {
    try {
      const { data: devices, error: devicesError } = await service
        .from("mobile_devices")
        .select("id,fcm_token")
        .eq("user_id", push.user_id)
        .eq("is_active", true)
        .eq("notifications_enabled", true)
        .not("fcm_token", "is", null);
      if (devicesError) throw devicesError;
      const activeDevices = (devices ?? []) as MobileDevice[];
      if (!activeDevices.length) {
        await complete(push.outbox_id, "skipped", "No active Android device with an FCM token");
        skipped += 1;
        continue;
      }

      const results = [];
      for (const device of activeDevices) {
        results.push(await sendToDevice(
          push,
          eventTypes.get(push.notification_id) ?? "update",
          device,
          account,
          token,
        ));
      }
      const successful = results.filter((result) => result.ok).length;
      if (successful === activeDevices.length) {
        await complete(push.outbox_id, "sent");
        sent += 1;
      } else if (successful > 0) {
        await complete(push.outbox_id, "partial", results.filter((result) => !result.ok).map((result) => result.error).join("; "));
        partial += 1;
      } else {
        await complete(push.outbox_id, "failed", results.map((result) => result.error).filter(Boolean).join("; ") || "All FCM deliveries failed");
        failed += 1;
      }
    } catch (error) {
      await complete(push.outbox_id, "failed", String(error));
      failed += 1;
    }
  }

  return json({ ok: true, claimed: pushes.length, sent, partial, failed, skipped });
});
