import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

function collectSourceFiles(directory: string): string[] {
  const entries = readdirSync(directory);
  return entries.flatMap((entry) => {
    const fullPath = path.join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) return collectSourceFiles(fullPath);
    return /\.(ts|tsx)$/.test(entry) ? [fullPath] : [];
  });
}

const sourceFiles = collectSourceFiles(path.join(process.cwd(), "src"));

function readRelative(filePath: string) {
  return {
    relativePath: path.relative(process.cwd(), filePath),
    source: readFileSync(filePath, "utf8"),
  };
}

test("production route controls do not hardcode hash hrefs", () => {
  const offenders = sourceFiles
    .map(readRelative)
    .flatMap(({ relativePath, source }) => {
      const hasRawHashRoute = /href=(?:"|{\s*["`])#\//.test(source);
      const hasEmptyHashLink = /href="#"/.test(source);
      return hasRawHashRoute || hasEmptyHashLink ? [relativePath] : [];
    });

  assert.deepEqual(offenders, []);
});

test("programmatic route changes do not assign raw hash routes", () => {
  const offenders = sourceFiles
    .map(readRelative)
    .flatMap(({ relativePath, source }) => (/window\.location\.hash\s*=\s*["'`]#\//.test(source) ? [relativePath] : []));

  assert.deepEqual(offenders, []);
});

test("audited dead-control fixes use router navigation", () => {
  const auditedFiles = [
    "src/components/auth/AdminGate.tsx",
    "src/components/auth/CustomerGate.tsx",
    "src/components/auth/DriverGate.tsx",
    "src/components/auth/PartnerGate.tsx",
    "src/components/admin/AdminDriverDocumentsShortcut.tsx",
    "src/pages/AdminDriverCompliance.tsx",
    "src/pages/AdminDriverFinanceSearch.tsx",
    "src/pages/AdminPartnerControl.tsx",
  ];

  for (const filePath of auditedFiles) {
    const source = readFileSync(path.join(process.cwd(), filePath), "utf8");
    assert.match(source, /from "react-router-dom"/, `${filePath} should use React Router for route controls`);
    assert.doesNotMatch(source, /href=(?:"|{\s*["`])#\//, `${filePath} must not hardcode hash routes`);
  }
});

test("driver compliance disabled actions explain approval and active-trip locks", () => {
  const source = readFileSync(path.join(process.cwd(), "src/pages/AdminDriverCompliance.tsx"), "utf8");
  const packageJson = readFileSync(path.join(process.cwd(), "package.json"), "utf8");

  assert.match(source, /driver-compliance-action-\$\{driver\.id\}/);
  assert.match(source, /Cannot approve yet: \$\{onboardingStage\}\./);
  assert.match(source, /Cannot remove while active trip \$\{activeTripLabel\}\./);
  assert.match(source, /title=\{approvalDisabledReason \|\| "Approve verified driver"\}/);
  assert.match(source, /title=\{removalDisabledReason \|\| "Remove driver after confirming no active trip"\}/);
  assert.match(source, /aria-describedby=\{actionGuidanceId\}/);
  assert.match(packageJson, /admin-driver-compliance-e2e-smoke\.mjs/);
});

test("payment review disabled actions explain verification and rejection locks", () => {
  const source = readFileSync(path.join(process.cwd(), "src/pages/AdminPaymentReview.tsx"), "utf8");
  const packageJson = readFileSync(path.join(process.cwd(), "package.json"), "utf8");

  assert.match(source, /payment-review-action-\$\{payment\.id\}/);
  assert.match(source, /Verification is locked until receipt evidence is uploaded for this payment\./);
  assert.match(source, /Enter at least 5 characters explaining why this payment is being rejected\./);
  assert.match(source, /aria-describedby=\{reviewActionGuidanceId\}/);
  assert.match(source, /title=\{approveDisabledReason \|\| \(cashCollection \? "Verify this cash collection" : "Verify this payment"\)\}/);
  assert.match(source, /title=\{rejectDisabledReason \|\| "Reject this payment with the provided reason"\}/);
  assert.match(packageJson, /payment-ledger-e2e-smoke\.mjs/);
});

test("Partner settlement busy actions explain the temporary workflow lock", () => {
  const source = readFileSync(path.join(process.cwd(), "src/components/partner/AdminPartnerSettlementWorkflow.tsx"), "utf8");
  const smoke = readFileSync(path.join(process.cwd(), "scripts/partner-settlement-e2e-smoke.mjs"), "utf8");

  assert.match(source, /partner-settlement-workflow-busy-guidance/);
  assert.match(source, /Another settlement operation is in progress\. Wait for it to finish before starting a new settlement action\./);
  assert.match(source, /role="status" aria-live="polite"/);
  assert.match(source, /aria-describedby=\{busy \? settlementBusyGuidanceId : undefined\}/);
  assert.match(source, /title=\{busy \? settlementBusyReason : undefined\}/);
  assert.match(source, /aria-busy=\{busy\}/);
  assert.match(smoke, /data-busy-guidance/);
  assert.match(smoke, /data-described-disabled/);
});

test("Admin create-order submit action explains every lock state", () => {
  const action = readFileSync(path.join(process.cwd(), "src/components/admin/AdminCreateOrderAction.tsx"), "utf8");
  const modal = readFileSync(path.join(process.cwd(), "src/components/admin/AdminCreateOrderModal.tsx"), "utf8");
  const smoke = readFileSync(path.join(process.cwd(), "scripts/admin-create-order-action-e2e-smoke.mjs"), "utf8");
  const packageJson = readFileSync(path.join(process.cwd(), "package.json"), "utf8");

  assert.match(action, /admin-create-order-action-guidance-/);
  assert.match(action, /Select pickup and drop-off places and wait for the road distance\./);
  assert.match(action, /Select a vehicle type\./);
  assert.match(action, /Waiting for the latest server price\./);
  assert.match(action, /Latest server price is unavailable:/);
  assert.match(action, /Creating this order\. Wait for the save to finish\./);
  assert.match(action, /was already created\. Close this form before starting another order\./);
  assert.match(action, /aria-describedby=\{guidanceId\}/);
  assert.match(action, /title=\{disabledReason \|\| "Create order with the latest server price"\}/);
  assert.match(modal, /<AdminCreateOrderAction/);
  assert.match(modal, /aria-busy=\{saving\}/);
  assert.match(modal, /role="alert"/);
  assert.match(smoke, /data-described-disabled/);
  assert.match(smoke, /data-ready-enabled/);
  assert.match(packageJson, /admin-create-order-action-e2e-smoke\.mjs/);
});

test("Admin manage-order actions explain busy and resource locks", () => {
  const action = readFileSync(path.join(process.cwd(), "src/components/admin/AdminManageOrderAction.tsx"), "utf8");
  const operations = readFileSync(path.join(process.cwd(), "src/pages/SmartLogistics.tsx"), "utf8");
  const smoke = readFileSync(path.join(process.cwd(), "scripts/admin-manage-order-action-e2e-smoke.mjs"), "utf8");
  const packageJson = readFileSync(path.join(process.cwd(), "package.json"), "utf8");

  assert.match(action, /manage-order-busy-guidance-\$\{orderId\}/);
  assert.match(action, /Starting transit\. Other order actions are temporarily locked until this update finishes\./);
  assert.match(action, /Cancelling this order\. Other order actions are temporarily locked until this update finishes\./);
  assert.match(action, /Deleting this order\. Other order actions are temporarily locked until this update finishes\./);
  assert.match(action, /Assigning the truck and driver\. Other order actions are temporarily locked until this update finishes\./);
  assert.match(action, /Uploading proof of delivery\. Other order actions are temporarily locked until this update finishes\./);
  assert.match(action, /role="status"/);
  assert.match(action, /aria-live="polite"/);
  assert.match(action, /aria-describedby=\{resolvedDescription\}/);
  assert.match(action, /activeAction === action \? busyLabel \|\| idleLabel : idleLabel/);
  assert.match(operations, /<AdminManageOrderActionStatus orderId=\{order\.id\} action=\{activeAction\}/);
  assert.match(operations, /Assignment is locked because no available truck is eligible for this order\./);
  assert.match(operations, /Assignment is locked because no driver profiles are available\./);
  assert.match(operations, /aria-busy=\{saving\}/);
  assert.match(operations, /activeAction\s*===\s*"delivery"/);
  assert.match(smoke, /data-busy-descriptions/);
  assert.match(smoke, /data-resource-lock/);
  assert.match(packageJson, /admin-manage-order-action-e2e-smoke\.mjs/);
});

test("Payment correction busy state explains the immutable ledger lock", () => {
  const source = readFileSync(path.join(process.cwd(), "src/components/admin/PaymentCorrectionForm.tsx"), "utf8");
  const smoke = readFileSync(path.join(process.cwd(), "scripts/financial-correction-e2e-smoke.mjs"), "utf8");
  const packageJson = readFileSync(path.join(process.cwd(), "package.json"), "utf8");

  assert.match(source, /payment-correction-busy-\$\{paymentId\}/);
  assert.match(source, /Recording this immutable correction\. Wait for the ledger update to finish before closing or changing the form\./);
  assert.match(source, /submitCorrection = reversePayment/);
  assert.match(source, /if \(saving\) return;/);
  assert.match(source, /aria-busy=\{saving\}/);
  assert.match(source, /role="status" aria-live="polite"/);
  assert.match(source, /aria-describedby=\{saving \? busyGuidanceId : undefined\}/);
  assert.match(source, /title=\{saving \? correctionBusyReason/);
  assert.match(smoke, /data-busy-guidance/);
  assert.match(smoke, /data-form-busy/);
  assert.match(smoke, /data-fields-disabled/);
  assert.match(smoke, /data-described-disabled/);
  assert.match(smoke, /data-submit-label/);
  assert.match(packageJson, /financial-correction-e2e-smoke\.mjs/);
});

test("Partner fleet actions explain the shared workflow lock", () => {
  const source = readFileSync(path.join(process.cwd(), "src/components/partner/PartnerFleetPanel.tsx"), "utf8");
  const smoke = readFileSync(path.join(process.cwd(), "scripts/fleet-enterprise-e2e-smoke.mjs"), "utf8");

  assert.match(source, /executeAction = \(action\) => action\(\)/);
  assert.match(source, /await executeAction\(action\)/);
  assert.match(source, /if \(activeAction\) return;/);
  assert.match(source, /Registering a Partner vehicle\. Other fleet actions are temporarily locked until this update finishes\./);
  assert.match(source, /Creating a Partner fleet branch\. Other fleet actions are temporarily locked until this update finishes\./);
  assert.match(source, /Saving the vehicle compliance profile\. Other fleet actions are temporarily locked until this update finishes\./);
  assert.match(source, /Recording vehicle maintenance\. Other fleet actions are temporarily locked until this update finishes\./);
  assert.match(source, /id="partner-fleet-action-guidance" role="status" aria-live="polite"/);
  assert.match(source, /aria-busy=\{saving\}/);
  assert.match(source, /aria-describedby=\{saving \? "partner-fleet-action-guidance" : undefined\}/);
  assert.match(source, /Registering vehicle…/);
  assert.match(source, /Creating branch…/);
  assert.match(source, /Saving profile…/);
  assert.match(source, /Saving maintenance…/);
  assert.match(smoke, /executeAction:\(\)=>new Promise\(\(\)=>\{\}\)/);
  assert.match(smoke, /data-busy-guidance/);
  assert.match(smoke, /data-panel-busy/);
  assert.match(smoke, /data-described-disabled/);
  assert.match(smoke, /data-action-label/);
});
