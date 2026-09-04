import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * The one class of regression neither the unit suite nor the motion smoke can
 * see: what assistive technology gets. jsdom renders no layout and computes no
 * contrast, and the motion smoke asks where the track sits, never what the deck
 * announces. A missing label on a control, a role lost in a refactor, a colour
 * pair that drops below contrast — all pass every other check we have.
 *
 * Scope is the carousel, not the page. The demo stand around it is scaffolding
 * (see `src/app/CLAUDE.md`): auditing it would report defects nobody intends to
 * fix and teach us to skim the output.
 *
 * Severity gate is serious and critical. Minor and moderate findings are advice
 * whose weight depends on the product; making them fail the run would turn the
 * smoke into a channel that cries wolf, and a channel like that stops being
 * read.
 */
test("карусель проходит аудит доступности", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator("[data-carousel-track]")).toBeVisible();

  const audit = await new AxeBuilder({ page })
    .include("[data-carousel-root]")
    .analyze();

  const blocking = audit.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );

  expect(
    blocking.map((v) => `${v.id} (${v.impact}): ${v.help}`),
    "нарушения доступности уровня serious/critical",
  ).toEqual([]);
});
