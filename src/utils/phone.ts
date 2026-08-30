export function telephoneHref(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return `tel:${trimmed.startsWith("+") ? "+" : ""}${digits}`;
}
