import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  HALLO_AI_ASSISTANT_DEFAULT_MODEL,
  HALLO_AI_ASSISTANT_MAX_MESSAGE_CHARS,
  HALLO_AI_ASSISTANT_SYSTEM_INSTRUCTION,
  canUseHalloAiAssistant,
  extractOpenAiResponseText,
  isAllowedHalloAiOrigin,
  validateHalloAiMessageBody,
} from "../../supabase/functions/_shared/hallo-ai-assistant";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const app = source("src/App.tsx");
const edgeFunction = source("supabase/functions/hallo-ai-assistant/index.ts");
const service = source("src/services/admin-ai-assistant.service.ts");
const page = source("src/pages/AdminAiAssistant.tsx");
const adminShell = source("src/components/admin/AdminToolShell.tsx");
const adminMore = source("src/pages/AdminMore.tsx");
const config = source("config.toml");

test("HALLO AI message validation rejects empty, malformed and oversized requests", () => {
  assert.deepEqual(validateHalloAiMessageBody(null), { ok: false, error: "JSON body must be an object." });
  assert.deepEqual(validateHalloAiMessageBody([]), { ok: false, error: "JSON body must be an object." });
  assert.deepEqual(validateHalloAiMessageBody({}), { ok: false, error: "message must be a string." });
  assert.deepEqual(validateHalloAiMessageBody({ message: "   " }), { ok: false, error: "message is required." });
  assert.deepEqual(
    validateHalloAiMessageBody({ message: "x".repeat(HALLO_AI_ASSISTANT_MAX_MESSAGE_CHARS + 1) }),
    { ok: false, error: `message must be ${HALLO_AI_ASSISTANT_MAX_MESSAGE_CHARS} characters or fewer.` },
  );
  assert.deepEqual(validateHalloAiMessageBody({ message: "  Summarize today  " }), {
    ok: true,
    message: "Summarize today",
  });
});

test("HALLO AI authorization allows active Admin and CEO only", () => {
  assert.equal(canUseHalloAiAssistant({ role: "admin", driver_status: "active" }), true);
  assert.equal(canUseHalloAiAssistant({ role: "ceo", driver_status: null }), true);
  assert.equal(canUseHalloAiAssistant({ role: "Admin", driver_status: "active" }), true);
  assert.equal(canUseHalloAiAssistant({ role: "customer", driver_status: "active" }), false);
  assert.equal(canUseHalloAiAssistant({ role: "driver", driver_status: "approved" }), false);
  assert.equal(canUseHalloAiAssistant({ role: "partner", driver_status: "active" }), false);
  assert.equal(canUseHalloAiAssistant({ role: "admin", driver_status: "suspended" }), false);
  assert.equal(canUseHalloAiAssistant(null), false);
});

test("HALLO AI CORS stays limited to known frontend origins plus server-side config", () => {
  assert.equal(isAllowedHalloAiOrigin("https://hamiltontruck.github.io"), true);
  assert.equal(isAllowedHalloAiOrigin("http://localhost:5173"), true);
  assert.equal(isAllowedHalloAiOrigin("https://evil.example"), false);
  assert.equal(isAllowedHalloAiOrigin("https://ops.hallo.example", "https://ops.hallo.example"), true);
});

test("HALLO AI system instruction prevents fabricated data and write claims", () => {
  assert.match(HALLO_AI_ASSISTANT_SYSTEM_INSTRUCTION, /logistics operations assistant/i);
  assert.match(HALLO_AI_ASSISTANT_SYSTEM_INSTRUCTION, /trusted HALLO data/i);
  assert.match(HALLO_AI_ASSISTANT_SYSTEM_INSTRUCTION, /operational data is unavailable/i);
  assert.match(HALLO_AI_ASSISTANT_SYSTEM_INSTRUCTION, /Never reveal secrets/i);
  assert.match(HALLO_AI_ASSISTANT_SYSTEM_INSTRUCTION, /read-only chat support/i);
});

test("OpenAI response extraction returns only assistant text", () => {
  assert.equal(extractOpenAiResponseText({ output_text: "Direct answer" }), "Direct answer");
  assert.equal(
    extractOpenAiResponseText({
      output: [
        { content: [{ type: "output_text", text: "Line one" }, { type: "output_text", text: "Line two" }] },
      ],
    }),
    "Line one\nLine two",
  );
  assert.equal(extractOpenAiResponseText({ output: [{ content: [{ type: "image" }] }] }), "");
});

test("Edge Function authenticates with Supabase JWT and current profile role", () => {
  assert.match(edgeFunction, /bearerToken\(request\)/);
  assert.match(edgeFunction, /Authentication required\./);
  assert.match(edgeFunction, /userClient\.auth\.getUser\(token\)/);
  assert.match(edgeFunction, /from\("profiles"\)[\s\S]*select\("role,driver_status"\)/);
  assert.match(edgeFunction, /canUseHalloAiAssistant\(profile\)/);
  assert.match(edgeFunction, /Admin or CEO access required\./);
  assert.doesNotMatch(edgeFunction, /user_metadata|app_metadata|localStorage|request-body role|SUPABASE_SERVICE_ROLE_KEY/i);
});

test("Edge Function handles malformed JSON and OpenAI failures safely", () => {
  assert.match(edgeFunction, /Malformed JSON body\./);
  assert.match(edgeFunction, /OPENAI_API_KEY/);
  assert.match(edgeFunction, /HALLO_AI_MODEL/);
  assert.equal(HALLO_AI_ASSISTANT_DEFAULT_MODEL, "gpt-4.1-mini");
  assert.match(edgeFunction, /HALLO_AI_ASSISTANT_DEFAULT_MODEL/);
  assert.match(edgeFunction, /max_output_tokens/);
  assert.match(edgeFunction, /AbortController/);
  assert.match(edgeFunction, /AI assistant is temporarily unavailable\./);
  assert.match(edgeFunction, /AI assistant timed out\. Please retry\./);
  assert.doesNotMatch(edgeFunction, /response\.text\(\)|console\.(log|debug)/);
});

test("Edge Function returns minimal sanitized response and never returns API keys", () => {
  assert.match(edgeFunction, /return json\(request, \{ answer: ai\.answer, requestId \}\)/);
  assert.doesNotMatch(edgeFunction, /return json\(request, \{[^}]*openAiApiKey/i);
  assert.doesNotMatch(edgeFunction, /JSON\.stringify\([^)]*openAiApiKey/i);
  assert.doesNotMatch(service, /OPENAI_API_KEY|VITE_OPENAI|HALLO_AI_MODEL|apiKey/i);
  assert.doesNotMatch(page, /OPENAI_API_KEY|VITE_OPENAI|HALLO_AI_MODEL|apiKey/i);
});

test("HALLO AI performs no database writes, SQL execution or production actions in V1", () => {
  assert.doesNotMatch(edgeFunction, /\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(|\bsql\b|migration|service_role/i);
  for (const forbidden of ["create orders", "cancel orders", "verify payments", "change driver balances", "change commissions", "modify settlements", "modify users", "alter RLS"]) {
    assert.doesNotMatch(edgeFunction, new RegExp(forbidden, "i"));
  }
});

test("Admin UI exposes HALLO AI only inside AdminGate/AdminToolShell", () => {
  assert.match(app, /path="\/admin\/ai-assistant" element={<AdminGate><AdminToolShell><AdminAiAssistant \/><\/AdminToolShell><\/AdminGate>}/);
  assert.match(adminShell, /to: "\/admin\/ai-assistant", label: "AI Assistant"/);
  assert.match(adminMore, /HALLO AI Assistant/);
  assert.match(page, /askHalloAiAssistant/);
  assert.match(page, /role="alert"/);
  assert.match(page, /onKeyDown=\{handleKeyDown\}/);
  assert.match(page, /maxLength=\{3000\}/);
  assert.doesNotMatch(app, /CustomerGate><AdminAiAssistant|DriverGate><AdminAiAssistant|PartnerGate><AdminAiAssistant/);
});

test("Supabase function config delegates auth to the function without adding migrations", () => {
  assert.match(config, /\[functions\."hallo-ai-assistant"\]\s+verify_jwt = false/i);
  assert.doesNotMatch(edgeFunction, /create policy|alter policy|grant |revoke |security definer/i);
});
