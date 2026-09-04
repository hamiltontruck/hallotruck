const ETHIOPIAN_MOBILE_PATTERN = /^(?:\+251|251|0)?[79]\d{8}$/;
const EMAIL_LOCAL_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/;
const EMAIL_DOMAIN_LABEL_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const EMAIL_TLD_PATTERN = /^[A-Za-z]{2,63}$/;

export function normalizeEthiopianPhone(value: string) {
  const compact = value.trim().replace(/[\s()-]/g, "");
  if (!ETHIOPIAN_MOBILE_PATTERN.test(compact)) return null;

  if (compact.startsWith("+251")) return `0${compact.slice(4)}`;
  if (compact.startsWith("251")) return `0${compact.slice(3)}`;
  if (compact.startsWith("7") || compact.startsWith("9")) return `0${compact}`;
  return compact;
}

export function validateEmailAddress(value: string) {
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254) return null;

  const atIndex = email.indexOf("@");
  if (atIndex <= 0 || atIndex !== email.lastIndexOf("@")) return null;

  const localPart = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  if (
    localPart.length > 64
    || !EMAIL_LOCAL_PATTERN.test(localPart)
    || localPart.startsWith(".")
    || localPart.endsWith(".")
    || localPart.includes("..")
  ) return null;

  if (!domain || domain.length > 253 || domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) return null;
  const labels = domain.split(".");
  const topLevelDomain = labels[labels.length - 1] ?? "";
  if (labels.length < 2 || !EMAIL_TLD_PATTERN.test(topLevelDomain)) return null;
  if (labels.some((label) => !EMAIL_DOMAIN_LABEL_PATTERN.test(label))) return null;

  return email;
}

export function requireValidEmail(value: string) {
  const email = validateEmailAddress(value);
  if (!email) throw new Error("Enter a valid email address, for example name@example.com.");
  return email;
}

export function requireValidEthiopianPhone(value: string) {
  const phone = normalizeEthiopianPhone(value);
  if (!phone) throw new Error("Phone must be an Ethiopian mobile number: 09xxxxxxxx, 07xxxxxxxx, +2519xxxxxxxx or +2517xxxxxxxx.");
  return phone;
}
