import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Test runner config, kept separate from `vite.config.ts` so the dev-server
 * options (`base`, `server.open`) never leak into the test environment.
 *
 * Default environment is `node` — the carousel's logic layers (reducer,
 * motion timing, profile math) are pure and need no DOM. Files that exercise
 * DOM-bound code (the image-resource store) opt into jsdom with a
 * `// @vitest-environment jsdom` pragma at the top of the file.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/components/Carousel/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.{test,spec}.{ts,tsx}",
        "src/**/index.ts",
        "src/**/*.types.ts",
        "src/components/Carousel/**/*.tsx",
      ],
    },
  },
});
