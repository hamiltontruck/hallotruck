import { supabase } from "./supabase.client";

export type HalloAiAssistantResponse = {
  answer: string;
  requestId: string;
};

function fallbackErrorMessage(status?: number) {
  if (status === 401) return "Sign in again to use HALLO AI Assistant.";
  if (status === 403) return "HALLO AI Assistant is available only to Admin and CEO accounts.";
  if (status === 400) return "Check the message and try again.";
  if (status === 504) return "HALLO AI Assistant timed out. Please retry.";
  return "HALLO AI Assistant is temporarily unavailable.";
}

export async function askHalloAiAssistant(message: string): Promise<HalloAiAssistantResponse> {
  const trimmed = message.trim();
  const { data, error } = await supabase.functions.invoke<HalloAiAssistantResponse>("hallo-ai-assistant", {
    body: { message: trimmed },
  });

  if (error) {
    throw new Error(error.message || fallbackErrorMessage(error.context?.status));
  }

  if (!data || typeof data.answer !== "string" || typeof data.requestId !== "string") {
    throw new Error("HALLO AI Assistant returned an unexpected response.");
  }

  return data;
}
