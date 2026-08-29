import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const migrationsDirectory = path.join(root, "supabase", "migrations");
const markerPath = path.join(root, "supabase", "production-migration-version.txt");
const migrationPattern = /^(\d{14})_.+\.sql$/;

const filenames = await readdir(migrationsDirectory);
const versions = filenames
  .map((filename) => migrationPattern.exec(filename)?.[1])
  .filter((version) => Boolean(version))
  .sort();

if (versions.length === 0) {
  throw new Error("No ordered 14-digit Supabase migrations were found.");
}

const latestRepositoryVersion = versions.at(-1);
const confirmedProductionVersion = (await readFile(markerPath, "utf8")).trim();

if (!/^\d{14}$/.test(confirmedProductionVersion)) {
  throw new Error(`Invalid production migration marker: ${confirmedProductionVersion}`);
}

if (confirmedProductionVersion < latestRepositoryVersion) {
  throw new Error(
    [
      "Production migration parity check failed.",
      `Repository requires migration ${latestRepositoryVersion}.`,
      `Production is confirmed only through ${confirmedProductionVersion}.`,
      "Apply and verify the approved migration in production, then update",
      "supabase/production-migration-version.txt in a separate reviewed change.",
    ].join(" "),
  );
}

console.log(
  `Production migration parity confirmed at ${confirmedProductionVersion}.`,
);
