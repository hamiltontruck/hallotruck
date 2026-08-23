import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const outputDirectory = path.join(root, ".test-dist");
const outputFile = path.join(outputDirectory, "business-rules.test.mjs");
const esbuildBinary = path.join(
  root,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "esbuild.cmd" : "esbuild",
);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
  return result.status === 0;
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

try {
  const bundled = run(esbuildBinary, [
    "tests/regression/business-rules.test.ts",
    "--bundle",
    "--platform=node",
    "--format=esm",
    "--target=node22",
    `--outfile=${outputFile}`,
  ]);

  if (!bundled) process.exit(process.exitCode || 1);

  const passed = run(process.execPath, ["--test", outputFile]);
  if (!passed) process.exit(process.exitCode || 1);
} finally {
  await rm(outputDirectory, { recursive: true, force: true });
}
