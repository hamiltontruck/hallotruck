from pathlib import Path

path = Path("scripts/driver-payment-ux-e2e-smoke.mjs")
source = path.read_text()
source = source.replace(
    'import { DriverPaymentCollection } from ${JSON.stringify(path.join(root, "src", "pages", "DriverPaymentCollection.tsx"))};',
    'import { DriverDeliveryProofForm } from ${JSON.stringify(path.join(root, "src", "components", "driver", "DriverDeliveryProofForm.tsx"))};',
)
fixture_start = source.index('const fixture = {')
render_end = source.index('\n\nsetTimeout(() => {', fixture_start)
source = source[:fixture_start] + '''createRoot(document.getElementById("root")).render(
  React.createElement(LanguageProvider, null,
    React.createElement(MemoryRouter, null,
      React.createElement(DriverDeliveryProofForm, {
        orderId: "order-active-1",
        tripAmountEtb: 30000,
        onDelivered: () => undefined,
      })
    )
  )
);''' + source[render_end:]
start = source.index('setTimeout(() => {')
end = source.index('\n`;\n', start)
new_timer = '''setTimeout(() => {
  const cash = document.querySelector('input[value="cash_received"]');
  const bank = document.querySelector('input[value="bank_telebirr"]');
  const unpaid = document.querySelector('input[value="payment_not_received"]');
  const submit = document.querySelector('form button:not([type="button"])');
  const initialText = document.body.textContent ?? "";
  document.documentElement.dataset.initialCashSelected = String(Boolean(cash?.checked));
  document.documentElement.dataset.initialBankSelected = String(Boolean(bank?.checked));
  document.documentElement.dataset.initialSubmitDisabled = String(Boolean(submit?.disabled));
  document.documentElement.dataset.finishTrip = String(initialText.includes("Finish Trip") || initialText.includes("Submit proof"));
  document.documentElement.dataset.paymentMethod = String(initialText.includes("Payment result"));
  document.documentElement.dataset.cashOption = String(initialText.includes("Cash received"));
  document.documentElement.dataset.bankOption = String(initialText.includes("Bank / Telebirr"));
  document.documentElement.dataset.methodHelp = String(initialText.includes("Choose one result before Finish Trip"));
  document.documentElement.dataset.noUpload = String(!initialText.includes("receipt") && !initialText.includes("screenshot"));
  document.documentElement.dataset.fileInput = String(Boolean(document.querySelector('input[name="receipt"], input[name="paymentEvidence"]')));
  document.documentElement.dataset.unpaidNotice = String(Boolean(unpaid));
  document.documentElement.dataset.overflow = String(document.documentElement.scrollWidth > document.documentElement.clientWidth || document.body.scrollWidth > document.body.clientWidth);
  document.documentElement.dataset.ready = "true";
}, 250);'''
source = source[:start] + new_timer + source[end:]
source = source.replace('const label = `Driver unpaid payment ${width}px smoke`;', 'const label = `Driver atomic Finish Trip ${width}px smoke`;')
source = source.replace('"Payment not received", "No payment report was created.",\n      "Return to Jobs", "Review payment again",', '"Payment not received", "Exact amount collected",\n      "Optional payment note",')
source = source.replace('Driver unpaid-payment browser smoke passed', 'Driver atomic Finish Trip browser smoke passed')
source = source.replace('with the required form, no default choice, no upload input', 'with all three payment results, exact-cash input, no payment-evidence upload')
path.write_text(source)
