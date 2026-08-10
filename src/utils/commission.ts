export const HALLO_SMART_COMMISSION_RATE = 0.02;
export const HALLO_SMART_COMMISSION_PERCENT = 2;

function roundMoney(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function splitHalloCommission(grossEtb: number) {
  const gross = Math.max(0, Number.isFinite(Number(grossEtb)) ? Number(grossEtb) : 0);
  const commissionEtb = roundMoney(gross * HALLO_SMART_COMMISSION_RATE);
  const driverNetEtb = roundMoney(Math.max(0, gross - commissionEtb));
  return { grossEtb: roundMoney(gross), commissionEtb, driverNetEtb };
}
