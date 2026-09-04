import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke in a REAL engine — deliberately narrow.
 *
 * The 1892 unit tests run in jsdom, which has no layout, no compositor and no
 * `Element.animate`. That leaves exactly one category of regression the whole
 * suite cannot see: motion that stopped moving. These specs assert only what
 * needs a real engine to be observable at all, and nothing that a unit test
 * already covers — a broad e2e suite would cost minutes per run and go flaky,
 * which is why this one stays small.
 *
 * NOT part of `npm test`: run it with `npm run test:e2e`, and before a deploy.
 * Vitest only collects `src/**`, so the two never overlap.
 *
 * Serves the BUILT bundle (`preview`) rather than the dev server: the build
 * takes under a second, and `server.open` in `vite.config.ts` would otherwise
 * pop a browser window on every run.
 */
const PORT = 4173;
const BASE = `http://localhost:${PORT}/CarouselCC/`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: BASE,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
