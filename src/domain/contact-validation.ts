const ETHIOPIAN_MOBILE_PATTERN = /^(?:\+251|251|0)?9\d{8}$/;
const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@.]{1,190}\.[A-Za-z]{2,63}$/;

export function normalizeEthiopianPhone(value: string) {
  const compact = value.trim().replace(/[\s()-]/g, "");
  if (!ETHIOPIAN_MOBILE_PATTERN.test(compact)) return null;

  if (compact.startsWith("+251")) return `0${compact.slice(4)}`;
  if (compact.startsWith("251")) return `0${compact.slice(3)}`;
  if (compact.startsWith("9")) return `0${compact}`;
  return compact;
}

export function validateEmailAddress(value: string) {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) return null;
  return email;
}

export function requireValidEmail(value: string) {
  const email = validateEmailAddress(value);
  if (!email) throw new Error("Enter a valid email address, for example name@example.com.");
  return email;
}

export function requireValidEthiopianPhone(value: string) {
  const phone = normalizeEthiopianPhone(value);
  if (!phone) throw new Error("Phone must be an Ethiopian mobile number: 09xxxxxxxx or +2519xxxxxxxx.");
  return phone;
}
