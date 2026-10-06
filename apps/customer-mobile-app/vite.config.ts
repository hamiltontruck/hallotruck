import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  base: "./",
  // Customer Mobile owns its Vite CSS pipeline. Do not auto-load the
  // repository root Tailwind v3 PostCSS config when building this app.
  css: {
    postcss: fileURLToPath(new URL("./", import.meta.url)),
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
  },
});
