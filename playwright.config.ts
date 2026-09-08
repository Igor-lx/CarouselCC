import { defineConfig, devices } from "@playwright/test";

/**
 * Smoke in a REAL engine — deliberately narrow.
 *
 * The unit suite runs in jsdom, which has no layout, no compositor and no
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
    // A server that is already up is NOT reused, and that is the whole point of
    // the line. Reuse skips `command`, so it skips the build with it: the smoke
    // then runs against whatever `dist` happens to hold and passes, proving
    // nothing about the code in front of you. Measured — with a preview server
    // left running the run took 12.6s and printed no build; with the port free
    // it took 28.0s and printed one. A green smoke that says nothing is worse
    // than no smoke, because a deploy is allowed on the strength of it.
    //
    // With `--strictPort`, an occupied port now fails the run loudly instead.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
