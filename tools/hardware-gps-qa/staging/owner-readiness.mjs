import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const fixture = "Public HALLO QA storage readiness fixture\n";
const fixturePassphrase = "public-fixture-passphrase\n";
let failed = false;

function check(label, callback) {
  try {
    callback();
    console.log(`PASS: ${label}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL: ${label}. ${error.message}`);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 20_000, ...options });
  if (result.status !== 0) throw new Error(`${command} did not complete successfully`);
  return result.stdout;
}

check("GnuPG encrypted temporary storage using a public fixture", () => {
  process.umask(0o077);
  const directory = mkdtempSync(join(tmpdir(), "hallo-gps-qa-"));
  try {
    chmodSync(directory, 0o700);
    const clear = join(directory, "fixture.txt");
    const encrypted = join(directory, "fixture.gpg");
    writeFileSync(clear, fixture, { mode: 0o600 });
    const options = [
      "--no-options", "--homedir", directory, "--batch", "--no-tty",
      "--no-symkey-cache", "--pinentry-mode", "loopback", "--passphrase-fd", "0",
    ];
    run("gpg", [...options, "--cipher-algo", "AES256", "--output", encrypted, "--symmetric", clear],
      { input: fixturePassphrase });
    const decoded = run("gpg", [...options, "--decrypt", encrypted], { input: fixturePassphrase });
    if (decoded !== fixture) throw new Error("encrypted fixture did not round-trip");
  } finally {
    spawnSync("gpgconf", ["--homedir", directory, "--kill", "gpg-agent"], { stdio: "ignore", timeout: 5_000 });
    rmSync(directory, { recursive: true, force: true });
  }
});

check("PostgreSQL client 16 or newer is installed", () => {
  const version = run("psql", ["--version"]);
  const major = Number(version.match(/PostgreSQL\) (\d+)/)?.[1]);
  if (!Number.isInteger(major) || major < 16) throw new Error("psql 16 or newer is required");
});

check("credential-free IPv4 and verified PostgreSQL TLS", () => {
  const script = fileURLToPath(new URL("./check-connection.mjs", import.meta.url));
  run(process.execPath, [script, "network"], { stdio: ["ignore", "inherit", "inherit"], timeout: 25_000 });
});

process.exitCode = Number(failed);
