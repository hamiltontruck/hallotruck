from pathlib import Path


def replace_once(source: str, old: str, new: str, label: str) -> str:
    if old not in source:
        raise SystemExit(f"Missing source fragment: {label}")
    return source.replace(old, new, 1)


smoke_path = Path("scripts/fleet-enterprise-e2e-smoke.mjs")
smoke = smoke_path.read_text()
smoke = replace_once(
    smoke,
    'await new Promise((resolve)=>setTimeout(resolve,300));\nconst adminPage=document.querySelector(\'[data-testid="fleet-enterprise-page"]\');',
    'await new Promise((resolve)=>setTimeout(resolve,300));\nconst activeTripGuidance=Array.from(document.querySelectorAll(\'[id^="fleet-action-guidance-"]\')).some((node)=>node.textContent.includes("Active trip locks status and driver changes until the trip closes."));\ndocument.documentElement.dataset.activeTripGuidance=String(activeTripGuidance);\nconst adminPage=document.querySelector(\'[data-testid="fleet-enterprise-page"]\');',
    'capture active-trip guidance before busy action',
)
smoke = replace_once(
    smoke,
    '"Active trip locks status and driver changes until the trip closes.",',
    '\'data-active-trip-guidance="true"\',',
    'replace stale active-trip DOM expectation',
)
smoke_path.write_text(smoke)

regression_path = Path("tests/regression/dead-route-controls.test.ts")
regression = regression_path.read_text()
regression = replace_once(
    regression,
    '  assert.match(smoke, /data-admin-action-label/);\n});',
    '  assert.match(smoke, /data-admin-action-label/);\n  assert.match(smoke, /data-active-trip-guidance/);\n});',
    'guard pre-action active-trip assertion',
)
regression_path.write_text(regression)

Path(".github/scripts/fix_admin_fleet_smoke.py").unlink()
Path(".github/workflows/fix-admin-fleet-smoke.yml").unlink()
