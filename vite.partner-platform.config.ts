import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/",
  plugins: [react()],
  build: { outDir: "dist-partner-platform", rollupOptions: { input: "partner-platform.html" } },
});
