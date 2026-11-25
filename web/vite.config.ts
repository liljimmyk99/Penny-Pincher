import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { cspSafeStyles } from "./plugins/cspSafeStyles.ts";

export default defineConfig({
  plugins: [cspSafeStyles(), react(), tailwindcss()],
  resolve: {
    alias: [
      // `@/…` is `src/…` (shadcn/ui's import paths; also in tsconfig.json).
      { find: /^@\//, replacement: fileURLToPath(new URL("./src/", import.meta.url)) },
      // Radix's scroll lock without inline <style> elements, so the CSP can keep
      // style-src strict (see the file's comment).
      {
        find: /^react-style-singleton$/,
        replacement: fileURLToPath(new URL("./src/lib/cspStyleSingleton.ts", import.meta.url)),
      },
    ],
  },
  server: {
    // `npm run dev` proxies API calls to a locally running backend.
    proxy: {
      "/v1": "http://localhost:8080",
      "/healthz": "http://localhost:8080",
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    // Run these packages through Vite, so the CSP rewrites above (the
    // react-style-singleton alias and cspSafeStyles) apply in tests as in the build.
    // Vitest resolves these to their CommonJS `main` builds, whose require() calls
    // skip the react-style-singleton alias; point it at the ES builds the app bundles.
    alias: [
      { find: /^react-remove-scroll$/, replacement: fileURLToPath(new URL("./node_modules/react-remove-scroll/dist/es2015/index.js", import.meta.url)) },
      { find: /^react-remove-scroll-bar$/, replacement: fileURLToPath(new URL("./node_modules/react-remove-scroll-bar/dist/es2015/index.js", import.meta.url)) },
    ],
    server: { deps: { inline: [/[\\/]node_modules[\\/](@radix-ui|radix-ui|react-remove-scroll[^\\/]*|cmdk|sonner)[\\/]/] } },
  },
});
