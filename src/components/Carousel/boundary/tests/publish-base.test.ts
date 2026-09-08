// See ../README.md
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The seam between the build's publish base and the generator's URL prefix.
 *
 * `vite.config.ts` sets `base` for the gh-pages deploy, and every slide URL the
 * generator bakes into `public/carousel-slides*.json` has to start with it. The
 * relationship was stated in a comment and held by nothing else, which is the
 * kind of promise that only breaks where nobody is looking: the two are edited
 * months apart, and the failure surfaces after a deploy as a deck of broken
 * images.
 *
 * Measured before writing this: with `urlBase` pointed elsewhere and the data
 * regenerated, every image 404s and the browser smoke still passes all six of
 * its checks — legitimately, since images are outside its declared scope. So
 * nothing anywhere said no.
 */

// ../../../../.. — this file sits in Carousel/boundary/tests/, five levels down.
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../..",
);

const publishBase = (): string => {
  const config = readFileSync(path.join(repoRoot, "vite.config.ts"), "utf8");
  const hit = /^\s*base:\s*"([^"]+)"/m.exec(config);
  expect(hit, "vite.config.ts declares no `base`").not.toBeNull();
  return hit![1]!;
};

const generatorConfigs = (): string[] =>
  readdirSync(repoRoot).filter((f) =>
    /^carousel-data\.config.*\.json$/.test(f),
  );

describe("publish base and generated URLs", () => {
  it("actually finds both sides (guards against a vacuous pass)", () => {
    expect(publishBase()).toMatch(/^\/.*\/$/);
    expect(generatorConfigs().length).toBeGreaterThan(0);
  });

  it("every generator config mirrors the publish base", () => {
    const base = publishBase();
    const offenders = generatorConfigs()
      .map((f) => {
        const raw: unknown = JSON.parse(
          readFileSync(path.join(repoRoot, f), "utf8"),
        );
        const urlBase = (raw as { urlBase?: unknown }).urlBase;
        return { file: f, urlBase };
      })
      .filter(
        ({ urlBase }) =>
          typeof urlBase !== "string" || !urlBase.startsWith(base),
      )
      .map(({ file, urlBase }) => `${file}: ${String(urlBase)} ⊄ ${base}`);

    expect(offenders).toEqual([]);
  });
});
