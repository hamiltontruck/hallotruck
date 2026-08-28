from pathlib import Path

path = Path("scripts/payment-ledger-e2e-smoke.mjs")
source = path.read_text()
source = source.replace('"data-card-count=\\"12\\""', '"data-card-count=\\"13\\""')
path.write_text(source)
