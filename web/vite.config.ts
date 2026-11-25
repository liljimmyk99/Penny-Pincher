import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
  },
});
