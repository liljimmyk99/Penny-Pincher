import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "node_modules"] },
  {
    files: ["**/*.{ts,tsx}", "eslint.config.js"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },
  {
    // Radix is reached through our wrappers in src/components/ui/ (#180).
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/ui/**", "src/lib/cspSafeStyles.test.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "radix-ui", message: "Use the wrappers in src/components/ui/ instead." }],
          patterns: [{ group: ["@radix-ui/*"], message: "Use the wrappers in src/components/ui/ instead." }],
        },
      ],
    },
  },
  {
    // shadcn/ui primitives export their variants (e.g. `buttonVariants`) beside
    // the component; allowed here only, not app-wide.
    files: ["src/components/ui/**/*.tsx"],
    rules: { "react-refresh/only-export-components": "off" },
  },
);
