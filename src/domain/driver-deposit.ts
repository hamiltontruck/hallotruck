export const MIN_DRIVER_DEPOSIT_ETB = 5_000;
export const MAX_DRIVER_DEPOSIT_ETB = 100_000;

function money(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function isDriverDepositAmountAllowed(value: number) {
  return Number.isFinite(value)
    && value >= MIN_DRIVER_DEPOSIT_ETB
    && value <= MAX_DRIVER_DEPOSIT_ETB;
}

export function calculateDriverDepositWallet(input: {
  depositedEtb: number;
  commissionChargedEtb: number;
  commissionPaidEtb: number;
}) {
  const depositedEtb = money(input.depositedEtb);
  const commissionChargedEtb = money(input.commissionChargedEtb);
  const commissionPaidEtb = money(input.commissionPaidEtb);
  const unpaidCommissionEtb = Math.max(0, commissionChargedEtb - commissionPaidEtb);
  const depositConsumedEtb = Math.min(depositedEtb, unpaidCommissionEtb);

  return {
    depositedEtb,
    commissionChargedEtb,
    commissionPaidEtb,
    unpaidCommissionEtb,
    depositConsumedEtb,
    availableDepositEtb: Math.max(0, depositedEtb - depositConsumedEtb),
    commissionDueEtb: Math.max(0, unpaidCommissionEtb - depositConsumedEtb),
  };
}
