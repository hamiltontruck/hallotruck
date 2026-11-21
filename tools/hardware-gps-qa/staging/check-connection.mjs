import { spawnSync } from "node:child_process";
import { STAGING_CA_FILE, stagingConnection, stagingPoolerTarget } from "./replicate.mjs";

try {
  const target = stagingPoolerTarget();
  switch (process.argv[2]) {
    case "network": {
      const host = target.PGHOST;
      const result = spawnSync("openssl", [
        "s_client", "-4", "-starttls", "postgres", "-connect", `${host}:${target.PGPORT}`,
        "-servername", host, "-verify_hostname", host, "-verify_return_error",
        "-CAfile", STAGING_CA_FILE, "-no-CApath", "-no-CAstore", "-brief",
      ], { stdio: ["ignore", "ignore", "inherit"], timeout: 15_000 });
      if (result.status !== 0) throw new Error("IPv4 PostgreSQL TLS verification failed");
      console.log("IPv4 reachability and certificate hostname verification passed");
      break;
    }
    case "writer": {
      const connection = stagingConnection({
        PATH: process.env.PATH,
        PGPASSWORD: process.env.PGPASSWORD,
        HALLO_GPS_ENV: "qa",
        ...target,
      });
      const result = spawnSync("psql", [
        "-XAtq", "--no-password", "-v", "ON_ERROR_STOP=1", "-c",
        "SELECT current_user = 'hallo_gps_qa_ingest' AND current_database() = 'postgres'",
      ], { env: connection, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 20_000 });
      if (result.status !== 0 || result.stdout.trim() !== "t") {
        throw new Error("Writer authentication or role verification failed");
      }
      console.log("TLS-verified writer authentication passed");
      break;
    }
    default:
      throw new Error("Expected network or writer check");
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
