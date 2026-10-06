import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative asset URLs work both from the nested GitHub Pages path and from
  // Capacitor's local file:// WebView origin. Root-relative URLs render a
  // blank screen in the Android app because /assets is not an app asset path.
  base: "./",
  // Driver Mobile V4 uses Tailwind v4 through the Vite plugin. Keep the
  // repository root Tailwind v3 PostCSS config from being auto-loaded here.
  css: {
    postcss: fileURLToPath(new URL("./", import.meta.url)),
  },
});
