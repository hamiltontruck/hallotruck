import fs from "node:fs";

function replaceOnce(path, before, after) {
  const source = fs.readFileSync(path, "utf8");
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${path}: expected one patch target, found ${count}`);
  fs.writeFileSync(path, source.replace(before, after));
}

const viewPath = "apps/mobile-app/src/driver/DriverWalletView.tsx";
replaceOnce(
  viewPath,
  `} from "./driver-wallet.service";\n`,
  `} from "./driver-wallet.service";\nimport { DriverCommissionPaymentPanel } from "./DriverCommissionPaymentPanel";\nimport type { DriverCommissionPayment } from "./driver-commission-payment.model";\nimport { fetchDriverCommissionPayments } from "./driver-commission-payment.service";\n`,
);
replaceOnce(
  viewPath,
  `type SourceErrors = {\n  financial: string | null;\n  commission: string | null;\n  trips: string | null;\n};\n\nconst EMPTY_ERRORS: SourceErrors = { financial: null, commission: null, trips: null };`,
  `type SourceErrors = {\n  financial: string | null;\n  commission: string | null;\n  payments: string | null;\n  trips: string | null;\n};\n\nconst EMPTY_ERRORS: SourceErrors = { financial: null, commission: null, payments: null, trips: null };`,
);
replaceOnce(
  viewPath,
  `  const [commission, setCommission] = useState<DriverCommissionSummary | null>(null);\n  const [trips, setTrips] = useState<DriverWalletTrip[] | null>(null);`,
  `  const [commission, setCommission] = useState<DriverCommissionSummary | null>(null);\n  const [payments, setPayments] = useState<DriverCommissionPayment[] | null>(null);\n  const [trips, setTrips] = useState<DriverWalletTrip[] | null>(null);`,
);
replaceOnce(
  viewPath,
  `      fetchDriverCommissionSummary(userId),\n      fetchDriverWalletTrips(userId),\n    ]);`,
  `      fetchDriverCommissionSummary(userId),\n      fetchDriverCommissionPayments(userId),\n      fetchDriverWalletTrips(userId),\n    ]);`,
);
replaceOnce(
  viewPath,
  `    const [financialResult, commissionResult, tripsResult] = results;`,
  `    const [financialResult, commissionResult, paymentsResult, tripsResult] = results;`,
);
replaceOnce(
  viewPath,
  `    if (tripsResult.status === "fulfilled") {\n      setTrips(tripsResult.value);\n      confirmedAny = true;\n    } else {\n      nextErrors.trips = errorMessage(tripsResult.reason, "Seenaa trip fe'uun hin danda'amne.");\n    }`,
  `    if (paymentsResult.status === "fulfilled") {\n      setPayments(paymentsResult.value);\n      confirmedAny = true;\n    } else {\n      nextErrors.payments = errorMessage(paymentsResult.reason, "Commission payment history fe'uun hin danda'amne.");\n    }\n\n    if (tripsResult.status === "fulfilled") {\n      setTrips(tripsResult.value);\n      confirmedAny = true;\n    } else {\n      nextErrors.trips = errorMessage(tripsResult.reason, "Seenaa trip fe'uun hin danda'amne.");\n    }`,
);
replaceOnce(
  viewPath,
  `  const initialUnknown = !financial && !commission && !trips;`,
  `  const initialUnknown = !financial && !commission && !payments && !trips;`,
);
replaceOnce(
  viewPath,
  `    </section>\n\n    <section className="space-y-3">\n      <div className="flex items-end justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[0.14em] text-halo-muted">Recent activity</p>`,
  `    </section>\n\n    {commission && <DriverCommissionPaymentPanel\n      userId={userId}\n      balanceEtb={commission.balanceEtb}\n      pendingEtb={commission.pendingEtb}\n      payments={payments}\n      sourceError={errors.payments}\n      onRetry={() => void load(true)}\n      onSubmitted={async () => { await load(true); }}\n    />}\n\n    <section className="space-y-3">\n      <div className="flex items-end justify-between gap-3"><div><p className="text-[9px] font-black uppercase tracking-[0.14em] text-halo-muted">Recent activity</p>`,
);

const modelPath = "apps/mobile-app/src/driver/driver-commission-payment.model.ts";
replaceOnce(
  modelPath,
  `.replace(/-+/g, "-")\n    .replace(/^[-.]+|[-.]+$/g, "")`,
  `.replace(/-+/g, "-")\n    .replace(/-+\\./g, ".")\n    .replace(/^[-.]+|[-.]+$/g, "")`,
);

const testPath = "apps/mobile-app/tests/driver-commission-payment.test.mjs";
replaceOnce(
  testPath,
  `assert.equal(safeDriverCommissionReceiptName("../../My CBE Receipt (Final).PDF"), "my-cbe-receipt-final-.pdf".replace("-.", "."));`,
  `assert.equal(safeDriverCommissionReceiptName("../../My CBE Receipt (Final).PDF"), "my-cbe-receipt-final.pdf");`,
);

const packagePath = "apps/mobile-app/package.json";
const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
packageJson.scripts.test = `node -e "for (const path of ['.test-dist','.test-dist-active','.test-dist-delivery','.test-dist-wallet','.test-dist-commission']) require('fs').rmSync(path,{recursive:true,force:true})" && tsc -p tsconfig.policy.json && tsc -p tsconfig.driver-jobs.json && tsc -p tsconfig.active-trip.json && tsc -p tsconfig.delivery-proof.json && tsc -p tsconfig.driver-wallet.json && tsc -p tsconfig.driver-commission-payment.json && node --test tests/access-policy.test.mjs tests/driver-jobs.test.mjs tests/driver-active-trip.test.mjs tests/driver-delivery-proof.test.mjs tests/driver-wallet.test.mjs tests/driver-commission-payment.test.mjs`;
fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

const ignorePath = "apps/mobile-app/.gitignore";
const ignore = fs.readFileSync(ignorePath, "utf8");
if (!ignore.includes(".test-dist-commission/")) {
  fs.writeFileSync(ignorePath, ignore.replace(".test-dist-wallet/\n", ".test-dist-wallet/\n.test-dist-commission/\n"));
}

const readmePath = "apps/mobile-app/README.md";
replaceOnce(
  readmePath,
  `- Remains read-only; commission payment upload and payout requests are separate future slices.`,
  `- Allows the approved signed-in Driver to submit a commission payment through the existing \\`submit_driver_commission_payment\\` RPC.\n- Uploads JPG, PNG, WebP or PDF receipts up to 10 MB to the private \\`driver-commission-receipts\\` bucket under the Driver's own ID.\n- Subtracts already-pending submissions from the client-side payable amount while leaving the server RPC authoritative.\n- Shows recent pending, approved and rejected submissions, including the Admin/CEO rejection reason.\n- Prevents overlapping form submissions and refreshes wallet totals after successful submission or realtime review changes.\n- Does not approve payments, alter commission charges, modify deposits, create payouts or mutate ledger history.`,
);

console.log("Mobile Driver commission payment integration applied.");
