import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const tscBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "tsc.cmd" : "tsc");
const sourceDirectories = ["src", "scripts", "tests"];
const checkedExtensions = new Set([".ts", ".tsx", ".mjs", ".css"]);

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? filesBelow(target) : [target];
  }));
  return nested.flat();
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  return result.status === 0;
}

const typeSafe = run(tscBinary, ["--noEmit"]);
const sourceFiles = (await Promise.all(sourceDirectories.map((directory) => filesBelow(path.join(root, directory)))))
  .flat()
  .filter((file) => checkedExtensions.has(path.extname(file)));

const errors = [];
for (const file of sourceFiles) {
  const relative = path.relative(root, file);
  const content = await readFile(file, "utf8");
  const lines = content.split("\n");

  lines.forEach((line, index) => {
    if (/[ \t]+$/.test(line)) errors.push(`${relative}:${index + 1}: trailing whitespace`);
    if (/^(<<<<<<<|=======|>>>>>>>)(?: |$)/.test(line)) errors.push(`${relative}:${index + 1}: unresolved merge marker`);
  });

  if ((file.endsWith(".ts") || file.endsWith(".tsx") || file.endsWith(".mjs")) && /\bdebugger\s*;/.test(content)) {
    errors.push(`${relative}: debugger statement is not allowed`);
  }

  if (file.endsWith(".mjs") && !run(process.execPath, ["--check", file])) {
    errors.push(`${relative}: Node syntax check failed`);
  }
}

if (!typeSafe) errors.unshift("TypeScript strict check failed");
if (errors.length) {
  for (const error of errors) console.error(error);
  process.exit(1);
}

console.log(`Lint passed: strict TypeScript, Node script syntax and source hygiene across ${sourceFiles.length} files.`);
