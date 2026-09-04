import { expect, test, type Page } from "@playwright/test";

/**
 * Every assertion here is one that jsdom CANNOT make: it needs layout, real
 * pointer events or a compositor. Anything provable without a browser belongs
 * in the unit suite, where it costs milliseconds instead of seconds.
 *
 * The hooks used are the ones the component publishes for exactly this purpose
 * (`data-carousel-root` / `-viewport` / `-track`, `data-active-zone`) — see
 * `.context/03-graph.md`, the DOM-attribute table.
 */

/** `matrix(a, b, c, d, tx, ty)` → tx. Identity and `none` both read as 0. */
const trackX = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const track = document.querySelector("[data-carousel-track]");
    if (track === null) return 0;
    const shape = getComputedStyle(track).transform;
    const parts = /matrix\(([^)]+)\)/.exec(shape);
    if (parts === null) return 0;
    return Number(parts[1]!.split(",")[4]);
  });

/**
 * Which slides the component currently calls the actual band. Identified by the
 * image each one shows: the demo's slides carry photos, not text, so reading
 * `textContent` here would compare empty strings to empty strings and pass on a
 * deck that never moved.
 */
const band = (page: Page): Promise<string> =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-active-zone="true"]'))
      .map((el) => el.querySelector("img")?.getAttribute("src") ?? "?")
      .join("|"),
  );

/** Waits until the track stops moving, then answers where it stopped. */
const settled = async (page: Page): Promise<number> => {
  let last = await trackX(page);
  for (let i = 0; i < 40; i += 1) {
    await page.waitForTimeout(100);
    const now = await trackX(page);
    if (now === last) return now;
    last = now;
  }
  throw new Error("трек не остановился за 4 секунды");
};

const next = async (page: Page): Promise<void> => {
  await page.locator("[data-carousel-viewport]").hover();
  await page.getByRole("button", { name: "Next slide" }).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await expect(page.locator("[data-carousel-track]")).toBeVisible();
  await settled(page);
});

test("колода смонтирована и трек на месте", async ({ page }) => {
  await expect(page.locator("[data-carousel-root]")).toBeVisible();
  await expect(page.locator("[data-carousel-viewport]")).toBeVisible();
  expect(await page.locator("[data-active-zone]").count()).toBeGreaterThan(0);
});

test("трек ДВИЖЕТСЯ между кадрами, а не прыгает разом", async ({ page }) => {
  const before = await trackX(page);
  await next(page);

  // Два замера внутри поездки. Равенство здесь означало бы, что анимации нет
  // вовсе: значение либо ещё не тронулось, либо уже прыгнуло на место. Ровно
  // это и не видит jsdom — там `Element.animate` не существует.
  await page.waitForTimeout(60);
  const early = await trackX(page);
  await page.waitForTimeout(120);
  const late = await trackX(page);

  expect(early).not.toBe(before);
  expect(late).not.toBe(early);
});

test("поездка заканчивается покоем и сменой активной полосы", async ({
  page,
}) => {
  const was = await band(page);
  await next(page);
  await settled(page);

  expect(await band(page)).not.toBe(was);
});

test("два шага двигают трек на одинаковое расстояние", async ({ page }) => {
  // Геометрия, которую может дать только настоящая раскладка: шаг — это ровно
  // страница, и второй шаг равен первому. Расхождение означает, что посадка
  // промахнулась мимо границы страницы.
  const start = await trackX(page);
  await next(page);
  const afterFirst = await settled(page);
  await next(page);
  const afterSecond = await settled(page);

  const first = Math.abs(afterFirst - start);
  const second = Math.abs(afterSecond - afterFirst);
  expect(first).toBeGreaterThan(1);
  expect(Math.abs(second - first)).toBeLessThan(1.5);
});

test.describe("на устройстве с касанием", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 412, height: 915 },
  });

  test("свайп пальцем коммитит страницу", async ({ page }) => {
    const was = await band(page);
    const box = await page.locator("[data-carousel-viewport]").boundingBox();
    expect(box).not.toBeNull();

    // Настоящие касания через протокол, а не `page.mouse`: движок принимает
    // ТОЛЬКО `pointerType === "touch"` (`usePointerSwipe.ts:450`) — мышиный
    // drag на десктопе игнорируется намеренно, там для этого стрелки. Свайп,
    // проверенный мышью, проверял бы то, чего в продукте нет.
    const cdp = await page.context().newCDPSession(page);
    const y = box!.y + box!.height / 2;
    const at = (share: number) => box!.x + box!.width * share;

    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: at(0.75), y }],
    });
    // Паузы между точками обязательны: скорость считается по времени, и жест,
    // уложенный в один кадр, — не медленный свайп, а скачок.
    for (let step = 1; step <= 8; step += 1) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: at(0.75 - 0.07 * step), y }],
      });
      await page.waitForTimeout(20);
    }
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await settled(page);

    expect(await band(page)).not.toBe(was);
  });
});

test("reduced motion садится мгновенно, а не едет", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload();
  await settled(page);

  const was = await band(page);
  await next(page);

  // Через 40 мс поездка была бы в разгаре; здесь её нет вовсе, и полоса уже
  // сменилась. Проверить это без движка нельзя: медиа-запрос читает хост.
  await page.waitForTimeout(40);
  const early = await trackX(page);
  await page.waitForTimeout(80);

  expect(await trackX(page)).toBe(early);
  expect(await band(page)).not.toBe(was);
});
