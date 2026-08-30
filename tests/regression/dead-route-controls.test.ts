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
