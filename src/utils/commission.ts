export const HALLO_SMART_COMMISSION_RATE = 0.02;
export const HALLO_SMART_COMMISSION_PERCENT = 2;
export const HALLO_PLATFORM_TAX_RATE = 0.15;
export const HALLO_PLATFORM_TAX_PERCENT = 15;

function roundMoney(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function splitHalloPlatformTax(commissionEtb: number) {
  const grossCommissionEtb = Math.max(0, Number.isFinite(Number(commissionEtb)) ? Number(commissionEtb) : 0);
  const taxEtb = roundMoney(grossCommissionEtb * HALLO_PLATFORM_TAX_RATE);
  const netCommissionAfterTaxEtb = roundMoney(Math.max(0, grossCommissionEtb - taxEtb));
  return { grossCommissionEtb: roundMoney(grossCommissionEtb), taxEtb, netCommissionAfterTaxEtb };
}

export function splitHalloCommission(grossEtb: number) {
  const gross = Math.max(0, Number.isFinite(Number(grossEtb)) ? Number(grossEtb) : 0);
  const commissionEtb = roundMoney(gross * HALLO_SMART_COMMISSION_RATE);
  const driverNetEtb = roundMoney(Math.max(0, gross - commissionEtb));
  const { taxEtb, netCommissionAfterTaxEtb } = splitHalloPlatformTax(commissionEtb);
  return { grossEtb: roundMoney(gross), commissionEtb, driverNetEtb, taxEtb, netCommissionAfterTaxEtb };
}
