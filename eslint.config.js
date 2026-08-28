// Flat config. Kept intentionally small: correctness rules only, formatting is
// Prettier's job (`eslint-config-prettier` disables everything that overlaps).
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier/flat";

export default tseslint.config(
  { ignores: ["dist", "coverage", "node_modules", "public"] },

  // Application, shelves and tests: type-aware linting.
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat["recommended-latest"],
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { "react-refresh": reactRefresh },
    rules: {
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  // Node-side tooling that lives outside the TypeScript projects.
  {
    files: ["**/*.{js,mjs}"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
  },

  // React's `act` returns a thenable only when its scope is async, so test
  // helpers declare `async` without awaiting inside — by design, not by slip.
  {
    files: ["**/tests/**/*.{ts,tsx}"],
    rules: { "@typescript-eslint/require-await": "off" },
  },

  // Slot components are `Object.assign(Component, { slot })`: Fast Refresh
  // cannot track that shape, and the shape is the module contract. Nothing to
  // fix inside these files.
  {
    files: ["src/components/Carousel/client/modules/**/*.tsx"],
    rules: { "react-refresh/only-export-components": "off" },
  },

  // The React Compiler rules from eslint-plugin-react-hooks v7 are on, with
  // two scoped exemptions below.

  // Tests: fixtures live at module scope and are reassigned between cases, and
  // a test reads and stubs refs on purpose. Both rules describe component code.
  {
    files: ["**/tests/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/globals": "off",
      "react-hooks/refs": "off",
    },
  },

  // PENDING — one node left. useCarouselState refreshes the reducer envelope
  // from a ref during render so that `dispatch` can stay stable and still serve
  // a same-commit dispatch from a child. The agreed fix is to give the reducer
  // its own context — config and isInstantMode move into the state, the way
  // layout already lives there, and the envelope goes away — which is an
  // architecture change with its own ADR. Parked for this file only.
  {
    files: ["src/components/Carousel/client/state/useCarouselState.ts"],
    rules: { "react-hooks/refs": "off" },
  },

  prettier,
);
