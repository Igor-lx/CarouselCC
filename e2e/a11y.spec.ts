import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Единственный класс регрессий, которого не видят ни юниты, ни смоук движения:
 * то, что достаётся вспомогательной технологии. jsdom не строит раскладку и не
 * считает контраст, а смоук движения спрашивает, где стоит трек, и никогда — что
 * колода о себе сообщает. Пропавшее имя у кнопки, роль, потерянная в рефакторе,
 * пара цветов, ушедшая ниже контраста, — всё это проходит остальные проверки.
 *
 * Область — карусель, а не страница. Стенд вокруг неё обвязка
 * (см. `src/app/CLAUDE.md`): аудит по нему выдал бы дефекты, которые никто не
 * собирается чинить, и приучил бы просматривать вывод по диагонали.
 *
 * Порог — `serious` и `critical`. Находки уровня `minor` и `moderate` это совет,
 * вес которого зависит от продукта; роняя ими прогон, смоук превратился бы в
 * канал, кричащий не по делу, а такой канал перестают читать.
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
