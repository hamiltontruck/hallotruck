import {
  getMyCommissionPayments,
  getMyCommissionSummary,
  openCommissionReceipt,
  submitCommissionPayment,
} from "../../services/driver-commission.service";
import { DriverCommissionWalletState } from "./DriverCommissionWalletState";

export function DriverCommissionWallet() {
  return (
    <DriverCommissionWalletState
      loadSummary={getMyCommissionSummary}
      loadPayments={getMyCommissionPayments}
      submitPayment={submitCommissionPayment}
      openReceipt={openCommissionReceipt}
    />
  );
}
