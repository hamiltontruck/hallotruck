from pathlib import Path

path = Path("tests/regression/simplified-customer-driver-workflow.test.ts")
source = path.read_text()
source = source.replace(
    'assert.match(migration,/v_commission:=round\\(v_total\\*0\\.02,2\\)/);',
    'assert.ok(migration.includes("v_commission:=round(v_total*0.02,2)"));',
)
source = source.replace(
    'assert.match(migration,/v_commission:=round(v_total*0.02,2)/);',
    'assert.ok(migration.includes("v_commission:=round(v_total*0.02,2)"));',
)
path.write_text(source)
