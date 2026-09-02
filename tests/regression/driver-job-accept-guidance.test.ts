import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../../src/pages/JobBoard.tsx", import.meta.url), "utf8");

test("driver load acceptance explains disabled and busy states", () => {
  assert.match(source, /const acceptGuidance = isAccepting/);
  assert.match(source, /Choose a compatible truck before accepting this load\./);
  assert.match(source, /disabled=\{isAccepting \|\| !selected\}/);
  assert.match(source, /aria-describedby=\{acceptGuidanceId\}/);
  assert.match(source, /aria-busy=\{isAccepting\}/);
  assert.match(source, /title=\{acceptGuidance\}/);
  assert.match(source, /role="status" aria-live="polite"/);
});

test("matching-truck loading state is announced without changing eligibility", () => {
  assert.match(source, /disabled=\{isLoadingTrucks\}/);
  assert.match(source, /aria-busy=\{isLoadingTrucks\}/);
  assert.match(source, /aria-describedby=\{truckGuidanceId\}/);
  assert.match(source, /getAvailableTrucksForOrder\(jobId\)/);
  assert.match(source, /acceptJob\(job\.id, truckId\)/);
});

