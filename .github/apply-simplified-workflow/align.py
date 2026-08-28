from pathlib import Path

path = Path('tests/regression/trip-completion-workflow.test.ts')
source = path.read_text()
source = source.replace('  getDriverPostDeliveryRoute,\n', '')
source = source.replace(
'''test("POD completion sends every driver to the completed-trip payment page", () => {
  assert.equal(getDriverPostDeliveryRoute("pay_driver_on_delivery", "order-1"), "/driver/payment/order-1");
  assert.equal(getDriverPostDeliveryRoute("prepaid", "order-1"), "/driver/payment/order-1");
  assert.match(activeTrip, /getDriverPostDeliveryRoute\\(order\\.payment_terms, order\\.id\\)/);
});''',
'''test("Finish Trip records payment result atomically and opens Trip History", () => {
  assert.match(activeTrip, /tripAmountEtb=\\{grossFare\\}/);
  assert.match(activeTrip, /completionResult/);
  assert.match(activeTrip, /navigate\\("\\/driver\\/earnings"/);
  assert.doesNotMatch(activeTrip, /getDriverPostDeliveryRoute/);
});''')
source = source.replace('["complete", "attention", "waiting", "waiting"]', '["complete", "attention", "current", "waiting"]', 1)
source = source.replace('["complete", "current", "waiting", "waiting"]', '["complete", "current", "current", "waiting"]', 1)
source = source.replace(
'''test("POD retry preserves the original proof and avoids duplicate uploads", () => {
  assert.match(migration, /if v_status = 'delivered' and v_existing_proof then[\\s\\S]*return;/);
  assert.match(migration, /delivery proof cleanup[\\s\\S]*not exists \\([\\s\\S]*recorded_proof\\.photo_path/);
  assert.doesNotMatch(migration, /delete\\s+from\\s+public\\.(delivery_proofs|payments|driver_commission_charges|ratings)/i);
  assert.match(deliveryService, /from\\("delivery_proofs"\\)[\\s\\S]*maybeSingle\\(\\)/);
  assert.match(deliveryService, /recorded\\.data\\.photo_path !== photoPath/);
});''',
'''test("atomic Finish Trip denies duplicate proof, payment and completion", () => {
  const simplifiedMigration = readFileSync(path.join(root, "supabase/migrations/20260828173000_simplified_customer_driver_workflow.sql"), "utf8");
  assert.match(simplifiedMigration, /This trip was already completed/);
  assert.match(simplifiedMigration, /exists \\([\\s\\S]*driver_trip_payment_results/);
  assert.match(simplifiedMigration, /exists \\([\\s\\S]*delivery_proofs/);
  assert.match(deliveryService, /rpc\\("driver_finish_trip"/);
  assert.doesNotMatch(simplifiedMigration, /delete\\s+from\\s+public\\.(delivery_proofs|payments|driver_commission_charges|ratings)/i);
});''')
path.write_text(source)
