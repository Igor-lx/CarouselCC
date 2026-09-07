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
    // Второй шаблон — про инструмент базы знаний. Он держит все остальные
    // сверки, а сам до этого не держался ничем: собирать его тесты было
    // некому, потому что область кончалась на `src`. Тесты словаря лежат
    // рядом с ним, в `.context/`, и попадают в `npm test` — то есть в
    // обязательный набор — сами, без отдельной команды и без памяти о ней.
    include: ["src/**/*.{test,spec}.{ts,tsx}", ".context/**/*.test.mjs"],
    // Coverage measures everything the component ships: the carousel AND the
    // shelves it stands on. Excluding either -- or excluding `.tsx`, which
    // silently drops every component and hook that touches JSX -- produces a
    // number that describes a fraction of the code while reading like the
    // whole. Only files with nothing to execute are left out.
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "src/components/Carousel/**/*.{ts,tsx}",
        "src/shared/**/*.{ts,tsx}",
      ],
      exclude: [
        "src/**/*.{test,spec}.{ts,tsx}",
        "src/**/index.ts",
        "src/**/*.types.ts",
        "src/**/*.d.ts",
      ],
    },
  },
});
