import { rename } from "node:fs/promises";

await rename("dist-partner-platform/partner-platform.html", "dist-partner-platform/index.html");
