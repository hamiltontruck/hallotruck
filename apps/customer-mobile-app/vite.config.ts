import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  // Customer Mobile uses plain CSS. An inline empty PostCSS pipeline keeps
  // Vite from auto-loading the repository root Tailwind v3 configuration.
  css: {
    postcss: { plugins: [] },
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
  },
});
