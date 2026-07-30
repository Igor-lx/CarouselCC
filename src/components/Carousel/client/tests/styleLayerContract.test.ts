// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Why the component's stylesheets sit inside `@layer` at all.
 *
 * The public API accepts a `className` map and merges it onto the SAME
 * elements the component styles (`mergeStyleMaps(styles, className)` in the
 * presentation root and in each module). For a host's class to win there, one
 * of two things has to be true: it out-specifies the component's rule AND
 * arrives later in the bundled sheet — which depends on import order and
 * chunking — or the component's rules are LAYERED and the host's are not,
 * because unlayered styles beat every layer regardless of specificity.
 *
 * This project chose the second. That makes the layer wrappers load-bearing
 * rather than decorative: drop one and the host's override silently becomes a
 * specificity race it may lose, with nothing to report it. The stand does not
 * pass `className`, so nothing else here would notice.
 *
 * Not asserted: the layer ORDER between reset / baseStyles / components. No
 * rule currently depends on it — `reset` only carries element, universal and
 * `#root` selectors, which every class-based component rule already beats on
 * specificity, and the two component layers never share a selector because CSS
 * Modules hashes the names. A test for it would pass with the order reversed.
 */

const repoRoot = resolve(__dirname, "../../../../..");
const read = (relative: string) => readFileSync(resolve(repoRoot, relative), "utf8");

const GLOBALS = "src/globals.scss";
const HOST_STYLESHEET = "src/app/App.module.scss";
const COMPONENT_STYLESHEETS = [
  "src/components/Carousel/client/Carousel.module.scss",
  "src/components/Carousel/client/modules/Controls/Controls.module.scss",
  "src/components/Carousel/client/modules/Pagination/basic/Pagination.module.scss",
  "src/components/Carousel/client/modules/Pagination/widget/PaginationWidget.module.scss",
];

/** The layer a stylesheet wraps itself in, or `null` when it is unlayered. */
const layerOf = (source: string): string | null =>
  source.match(/^@layer\s+([A-Za-z][\w-]*)\s*\{/m)?.[1] ?? null;

/** The names in the `@layer a, b, c;` ordering statement. */
const declaredLayers = (source: string): string[] => {
  const statement = source.match(/^@layer\s+([^;{]+);/m)?.[1];
  return statement === undefined
    ? []
    : statement.split(",").map((name) => name.trim());
};

describe("component styles are layered, the host's are not", () => {
  it("every component stylesheet wraps itself in a DECLARED layer", () => {
    const declared = declaredLayers(read(GLOBALS));
    expect(declared.length).toBeGreaterThan(0);

    for (const path of COMPONENT_STYLESHEETS) {
      const layer = layerOf(read(path));
      expect(layer, `${path} is unlayered — a host override would become a specificity race`).not.toBeNull();
      expect(declared, `${path} names a layer nothing declares`).toContain(layer);
    }
  });

  it("the host stylesheet stays unlayered — that is what lets it win", () => {
    expect(layerOf(read(HOST_STYLESHEET))).toBeNull();
  });
});

describe("the cascade this buys", () => {
  it("a host's single unlayered class beats a layered component rule three classes deep", () => {
    // The real layer name, so removing the wrapper above breaks this too.
    const componentLayer = layerOf(read(COMPONENT_STYLESHEETS[0]!))!;
    const order = declaredLayers(read(GLOBALS)).join(", ");

    const HOST = "rgb(0, 255, 0)";
    const COMPONENT = "rgb(255, 0, 0)";

    const style = document.createElement("style");
    style.textContent = `
      @layer ${order};
      @layer ${componentLayer} { .c1.c2.c3 { color: ${COMPONENT}; } }
      .hostOverride { color: ${HOST}; }
    `;
    document.head.append(style);

    const element = document.createElement("div");
    // Exactly what mergeStyleMaps produces: both classes on one element.
    element.className = "c1 c2 c3 hostOverride";
    document.body.append(element);

    expect(getComputedStyle(element).color).toBe(HOST);

    element.remove();
    style.remove();
  });
});
