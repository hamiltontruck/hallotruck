const NAME_CHARACTERS = /^[\p{L}\p{M}]+(?:[ '\u2019-][\p{L}\p{M}]+)*$/u;

export function sanitizeCustomerFullName(value: string) {
  return value
    .replace(/[^\p{L}\p{M}\s'\u2019-]/gu, "")
    .replace(/\s{2,}/g, " ")
    .slice(0, 80);
}

export function isValidCustomerFullName(value: string) {
  const clean = value.trim();
  return clean.length >= 2 && clean.length <= 80 && NAME_CHARACTERS.test(clean);
}

export function sanitizeEthiopianPhoneInput(value: string) {
  const trimmed = value.trimStart();
  const hasLeadingPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "").slice(0, 12);
  return hasLeadingPlus ? `+${digits}` : digits;
}

export function normalizeEthiopianMobile(value: string) {
  const compact = value.trim().replace(/[\s()-]/g, "");
  if (/^0[79]\d{8}$/.test(compact)) return `+251${compact.slice(1)}`;
  if (/^251[79]\d{8}$/.test(compact)) return `+${compact}`;
  if (/^\+251[79]\d{8}$/.test(compact)) return compact;
  return null;
}

export function isValidSixDigitPin(value: string) {
  return /^\d{6}$/.test(value);
}
