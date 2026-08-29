import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const workflow = source(".github/workflows/deploy-pages.yml");
const regressionRunner = source("scripts/run-regression-tests.mjs");

function requiredStep(label: string) {
  const index = workflow.indexOf(label);
  assert.notEqual(index, -1, `missing workflow step: ${label}`);
  return index;
}

test("production workflow runs lint before regression, build and browser smoke", () => {
  const install = requiredStep("- name: Install");
  const lint = requiredStep("- name: Lint");
  const regression = requiredStep("- name: Business regression tests");
  const build = requiredStep("- name: Build");
  const browserSmoke = requiredStep("- name: Browser E2E smoke tests");

  assert.ok(install < lint && lint < regression && regression < build && build < browserSmoke);
  assert.match(workflow, /- name: Lint\s+run: npm run lint/);
  assert.doesNotMatch(workflow, /- name: Lint[\s\S]{0,160}continue-on-error:\s*true/i);
  assert.doesNotMatch(workflow, /npm run lint\s*(?:\|\|\s*true|;\s*true)/i);
});

test("production workflow preserves migration, route-smoke and Pages deployment gates", () => {
  assert.match(workflow, /pull_request:\s+branches: \["main"\]/);
  assert.match(workflow, /push:\s+branches: \["main"\]/);
  assert.match(workflow, /Block deploy when production migrations are behind[\s\S]*github\.event_name != 'pull_request'[\s\S]*verify-production-migration-parity\.mjs/);
  assert.match(workflow, /Browser E2E smoke tests\s+run: npm run test:e2e-smoke/);
  assert.match(workflow, /Configure Pages[\s\S]*github\.event_name != 'pull_request'/);
  assert.match(workflow, /Upload site[\s\S]*github\.event_name != 'pull_request'/);
  assert.match(workflow, /deploy:\s+if: github\.event_name != 'pull_request'/);
});

test("deployment workflow regression suite remains part of the business test runner", () => {
  assert.match(regressionRunner, /tests\/regression\/deployment-workflow\.test\.ts/);
  assert.match(regressionRunner, /deployment-workflow\.test\.mjs/);
});
