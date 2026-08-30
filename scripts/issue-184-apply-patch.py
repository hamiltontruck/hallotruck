from pathlib import Path


def replace_once(value: str, old: str, new: str) -> str:
    count = value.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one match, found {count}: {old[:100]}")
    return value.replace(old, new, 1)


page_path = Path("src/pages/SmartLogistics.tsx")
page = page_path.read_text()
page = replace_once(
    page,
    '  const [cancelReason,setCancelReason]=useState("");',
    '  const [cancelReason,setCancelReason]=useState("");\n  const [confirmDelete,setConfirmDelete]=useState(false);',
)
page = replace_once(
    page,
    "  const orderPayments=payments.filter(p=>p.order_id===order.id);",
    '  const orderPayments=payments.filter(p=>p.order_id===order.id);\n  const canDeleteOrder=order.status==="cancelled"&&!order.driver_id&&!order.truck_id;',
)
page = replace_once(
    page,
    "  async function cancelOrder(){await run(()=>adminCancelOrder(order.id,cancelReason));}",
    '  async function cancelOrder(){await run(()=>adminCancelOrder(order.id,cancelReason));}\n  async function deleteOrder(){await run(async()=>{const {error:deleteError}=await supabase.rpc("admin_delete_cancelled_order",{p_order_id:order.id});if(deleteError)throw new Error(deleteError.message);});}',
)

old_cancelled = '{order.status==="cancelled"&&<div className="mt-4 border border-red-200 bg-red-50 p-4 text-sm text-red-900"><p className="font-semibold">Cancelled by {order.cancellation_source ?? "customer"}</p><p className="mt-2 whitespace-pre-wrap">{order.cancellation_reason ?? "No cancellation reason recorded."}</p>{order.cancelled_at&&<p className="mt-2 text-xs text-red-700">{new Date(order.cancelled_at).toLocaleString()}</p>}<p className="mt-3 text-xs text-steel">Payments are not refunded automatically. Review them in Finance.</p></div>}'
new_cancelled = '{order.status==="cancelled"&&<div className="mt-4 border border-red-200 bg-red-50 p-4 text-sm text-red-900"><p className="font-semibold">Cancelled by {order.cancellation_source ?? "customer"}</p><p className="mt-2 whitespace-pre-wrap">{order.cancellation_reason ?? "No cancellation reason recorded."}</p>{order.cancelled_at&&<p className="mt-2 text-xs text-red-700">{new Date(order.cancelled_at).toLocaleString()}</p>}<p className="mt-3 text-xs text-steel">Payments are not refunded automatically. Review them in Finance.</p>{canDeleteOrder&&<div className="mt-4 border-t border-red-200 pt-4"><p className="text-xs leading-5 text-red-900">Permanent deletion is available only for cancelled, unassigned orders. The database will reject this action if any payment, receipt, delivery, commission, settlement, rating or audit history exists.</p>{!confirmDelete?<button type="button" disabled={saving} onClick={()=>setConfirmDelete(true)} className="mt-3 w-full border border-route bg-white px-4 py-3 text-sm font-semibold text-route disabled:opacity-40 sm:w-auto">Delete order</button>:<div className="mt-3 border border-route bg-white p-3"><p className="font-semibold text-route">Permanently delete {order.tracking_id}?</p><p className="mt-1 text-xs text-red-900">This cannot be undone.</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><button type="button" disabled={saving} onClick={()=>setConfirmDelete(false)} className="border border-asphalt/20 px-4 py-3 text-sm font-semibold text-asphalt disabled:opacity-40">Keep order</button><button type="button" disabled={saving} onClick={deleteOrder} className="bg-route px-4 py-3 text-sm font-semibold text-white disabled:opacity-40">{saving?"Deleting…":"Permanently delete order"}</button></div></div>}</div>}</div>}'
page = replace_once(page, old_cancelled, new_cancelled)
page_path.write_text(page)


test_path = Path("tests/regression/admin-order-assignment-evidence.test.ts")
tests = test_path.read_text()
test_name = "Manage Order permanently deletes only safe cancelled unassigned orders"
if test_name not in tests:
    tests += r'''

test("Manage Order permanently deletes only safe cancelled unassigned orders", async () => {
  const migration = await readFile(path.join(process.cwd(), "supabase/migrations/20260830034000_admin_delete_cancelled_unassigned_order.sql"), "utf8");

  assert.match(page, /supabase\.rpc\("admin_delete_cancelled_order"/);
  assert.match(page, /canDeleteOrder=order\.status==="cancelled"&&!order\.driver_id&&!order\.truck_id/);
  assert.match(page, /Delete order/);
  assert.match(page, /Permanently delete order/);
  assert.match(page, /This cannot be undone/);
  assert.match(page, /database will reject this action if any payment, receipt, delivery, commission, settlement, rating or audit history exists/i);
  assert.match(migration, /create or replace function public\.admin_delete_cancelled_order/);
  assert.match(migration, /private\.require_active_leadership/);
  assert.match(migration, /v_status <> 'cancelled'/);
  assert.match(migration, /v_driver_id is not null or v_truck_id is not null/);
  assert.match(migration, /v_accepted_at is not null or v_delivered_at is not null/);
  assert.match(migration, /public\.payments/);
  assert.match(migration, /private\.payment_reference_registry/);
  assert.match(migration, /public\.payment_review_audit/);
  assert.match(migration, /public\.financial_corrections/);
  assert.match(migration, /public\.delivery_proofs/);
  assert.match(migration, /public\.driver_commission_charges/);
  assert.match(migration, /public\.driver_payment_confirmation_events/);
  assert.match(migration, /public\.driver_trip_payment_results/);
  assert.match(migration, /public\.partner_freight_earnings/);
  assert.match(migration, /public\.ratings/);
  assert.match(migration, /public\.notifications/);
  assert.match(migration, /revoke delete, truncate, references, trigger[\s\S]*public\.orders/);
  assert.match(migration, /delete from public\.orders/);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.(payments|payment_review_audit|financial_corrections|delivery_proofs|driver_commission_charges|driver_payment_confirmations|partner_freight_earnings|ratings)/i);
});
'''

test_path.write_text(tests)
