import { createClient } from "npm:@supabase/supabase-js@2";
import {
  HALLO_AI_ASSISTANT_DEFAULT_MAX_OUTPUT_TOKENS,
  HALLO_AI_ASSISTANT_DEFAULT_MODEL,
  HALLO_AI_ASSISTANT_MAX_MESSAGE_CHARS,
  HALLO_AI_ASSISTANT_SYSTEM_INSTRUCTION,
  canUseHalloAiAssistant,
  extractOpenAiResponseText,
  isAllowedHalloAiOrigin,
  validateHalloAiMessageBody,
  type HalloAiProfile,
} from "../_shared/hallo-ai-assistant.ts";

const openAiResponsesUrl = "https://api.openai.com/v1/responses";

function bearerToken(request: Request) {
  const header = request.headers.get("Authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function corsHeaders(request: Request) {
  const origin = request.headers.get("Origin");
  const configuredOrigins = Deno.env.get("HALLO_AI_ALLOWED_ORIGINS");
  const allowed = isAllowedHalloAiOrigin(origin, configuredOrigins);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
  if (origin && allowed) headers["Access-Control-Allow-Origin"] = origin;
  return { allowed, headers };
}

function json(request: Request, body: unknown, status = 200) {
  const { headers } = corsHeaders(request);
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

async function resolveAuthorizedProfile(request: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false as const, status: 503, error: "AI assistant is not configured." };
  }

  const token = bearerToken(request);
  if (!token) {
    return { ok: false as const, status: 401, error: "Authentication required." };
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  const user = authData.user;
  if (authError || !user) {
    return { ok: false as const, status: 401, error: "Authentication required." };
  }

  const { data: profile, error: profileError } = await userClient
    .from("profiles")
    .select("role,driver_status")
    .eq("id", user.id)
    .maybeSingle<HalloAiProfile>();

  if (profileError || !canUseHalloAiAssistant(profile)) {
    return { ok: false as const, status: 403, error: "Admin or CEO access required." };
  }

  return { ok: true as const, userId: user.id };
}

async function askOpenAi(message: string, requestId: string) {
  const openAiApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openAiApiKey) {
    console.error("HALLO AI Assistant OpenAI secret is not configured", { requestId });
    return { ok: false as const, status: 503, error: "AI assistant is not configured." };
  }

  const model = (Deno.env.get("HALLO_AI_MODEL") ?? HALLO_AI_ASSISTANT_DEFAULT_MODEL).trim()
    || HALLO_AI_ASSISTANT_DEFAULT_MODEL;
  const maxOutputTokens = boundedInteger(
    Deno.env.get("HALLO_AI_MAX_OUTPUT_TOKENS") ?? undefined,
    HALLO_AI_ASSISTANT_DEFAULT_MAX_OUTPUT_TOKENS,
    100,
    1_200,
  );
  const timeoutMs = boundedInteger(Deno.env.get("HALLO_AI_TIMEOUT_MS") ?? undefined, 15_000, 3_000, 25_000);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(openAiResponsesUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${openAiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        instructions: HALLO_AI_ASSISTANT_SYSTEM_INSTRUCTION,
        input: [
          {
            role: "user",
            content: [{ type: "input_text", text: message }],
          },
        ],
        max_output_tokens: maxOutputTokens,
      }),
    });

    if (!response.ok) {
      console.warn("HALLO AI Assistant upstream failure", { requestId, status: response.status });
      return { ok: false as const, status: 502, error: "AI assistant is temporarily unavailable." };
    }

    const payload = await response.json();
    const answer = extractOpenAiResponseText(payload).trim();
    if (!answer) {
      console.warn("HALLO AI Assistant upstream returned no answer", { requestId });
      return { ok: false as const, status: 502, error: "AI assistant returned an empty answer." };
    }

    return { ok: true as const, answer };
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "AbortError";
    console.warn("HALLO AI Assistant request failed", { requestId, aborted });
    return {
      ok: false as const,
      status: aborted ? 504 : 502,
      error: aborted ? "AI assistant timed out. Please retry." : "AI assistant is temporarily unavailable.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (request) => {
  const requestId = crypto.randomUUID();
  const cors = corsHeaders(request);

  if (request.method === "OPTIONS") {
    return new Response(cors.allowed ? "ok" : "Origin not allowed", {
      status: cors.allowed ? 200 : 403,
      headers: cors.headers,
    });
  }

  if (!cors.allowed) {
    return json(request, { error: "Origin not allowed.", requestId }, 403);
  }

  if (request.method !== "POST") {
    return json(request, { error: "Method not allowed.", requestId }, 405);
  }

  const authorization = await resolveAuthorizedProfile(request);
  if (!authorization.ok) {
    return json(request, { error: authorization.error, requestId }, authorization.status);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(request, { error: "Malformed JSON body.", requestId }, 400);
  }

  const validation = validateHalloAiMessageBody(body, HALLO_AI_ASSISTANT_MAX_MESSAGE_CHARS);
  if (!validation.ok) {
    return json(request, { error: validation.error, requestId }, 400);
  }

  const ai = await askOpenAi(validation.message, requestId);
  if (!ai.ok) {
    return json(request, { error: ai.error, requestId }, ai.status);
  }

  return json(request, { answer: ai.answer, requestId });
});
