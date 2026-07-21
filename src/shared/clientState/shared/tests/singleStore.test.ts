import { readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE STORE IS SINGLE — the one invariant this shelf cannot express through
 * folder layout alone.
 *
 * Blanks duplicate their hooks on purpose (copy one folder, nothing is
 * missing). A STORE is the exception: it keeps a registry of live browser
 * listeners, so a second copy silently splits that registry — the same media
 * query would be watched twice and "one listener per query" would hold only
 * per copy. Hence exactly ONE `useMediaQuery.ts` in the project, living in
 * the visible `clientState/shared/` folder so a copier sees both facts at
 * once: take it along, and keep only one.
 *
 * If this fails after you added a blank: delete the copy that came with it
 * and point its imports at the existing store.
 */

const SRC_ROOT = resolve(__dirname, "../../../..");
const STORE_FILE = "useMediaQuery.ts";
const EXPECTED = "shared/clientState/shared/useMediaQuery.ts";

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (name === "node_modules") return [];
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

describe("clientState store is single-source", () => {
  it(`exactly one ${STORE_FILE} exists in src/`, () => {
    const found = walk(SRC_ROOT)
      .filter((file) => file.endsWith(sep + STORE_FILE))
      .map((file) => relative(SRC_ROOT, file).split(sep).join("/"))
      .sort();

    expect(found).toEqual([EXPECTED]);
  });
});
