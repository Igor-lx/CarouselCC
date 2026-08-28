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

  // PENDING — the React Compiler rules that ship with eslint-plugin-react-hooks
  // v7. They report 110 sites here: refs written during render, module state
  // reassigned from tests, locals mutated after render, setState inside an
  // effect. Several are deliberate patterns in this codebase and each needs its
  // own verdict, so they are switched off until that pass is done — not because
  // the rules are wrong.
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "react-hooks/refs": "off",
      "react-hooks/globals": "off",
      "react-hooks/immutability": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },

  prettier,
);
