import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SSOT guard for the dot LOOK. The fade reads the dot's opacity and scale from
 * the live custom properties; when they are unreadable it falls back to
 * literals compiled into `usePaginationFade.ts`. Those literals exist to land
 * the ride exactly where the CSS class picks the dot up, so a value edited on
 * one side alone ends the fade off its own target — visibly, and only on the
 * path where the variable could not be read.
 *
 * Nothing held the pair before this test: the requirement was stated in the
 * hook's comment and in the folder's rules, which is attention, not a check.
 * Same pattern as `layoutCssVarsSync.test.ts` — read the real files and assert
 * the two halves still carry the same numbers.
 */
const read = (relative: string) =>
  readFileSync(resolve(__dirname, relative), "utf8");

const scss = read("../Pagination.module.scss");
const hook = read("../usePaginationFade.ts");

const cssVar = (name: string): number => {
  const hit = scss.match(new RegExp(`--${name}:\\s*([\\d.]+)\\s*;`));
  if (hit === null)
    throw new Error(`--${name} is not declared in the stylesheet`);
  return Number.parseFloat(hit[1]!);
};

const fallback = (name: string): { opacity: number; scale: number } => {
  const hit = hook.match(
    new RegExp(
      `${name}[^=]*=\\s*\\{\\s*opacity:\\s*([\\d.]+),\\s*scale:\\s*([\\d.]+)\\s*\\}`,
    ),
  );
  if (hit === null) throw new Error(`${name} is not declared in the hook`);
  return {
    opacity: Number.parseFloat(hit[1]!),
    scale: Number.parseFloat(hit[2]!),
  };
};

describe("dot fade fallbacks mirror the stylesheet", () => {
  it("the resting dot falls back to the class opacity", () => {
    expect(fallback("FALLBACK_INACTIVE").opacity).toBe(
      cssVar("pagination-dot-opacity"),
    );
  });

  it("the active dot falls back to the class opacity and scale", () => {
    const active = fallback("FALLBACK_ACTIVE");
    expect(active.opacity).toBe(cssVar("pagination-dot-opacity-active"));
    expect(active.scale).toBe(cssVar("pagination-dot-scale-active"));
  });

  it("the resting scale is 1 because the stylesheet declares no variable for it", () => {
    expect(scss).not.toMatch(/--pagination-dot-scale:\s/);
    expect(fallback("FALLBACK_INACTIVE").scale).toBe(1);
  });
});
