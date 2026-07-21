import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * "DON'T WIRE IN YOUR OWN — USE THE COMMON ONE."
 *
 * This blank ships with its own copy of `useIsomorphicLayoutEffect` so the
 * folder can be lifted into an empty project and just work. That copy is a
 * SHELF convenience, not a licence to run two of them: inside a real
 * application the helper should be imported from ONE place.
 *
 * So this guard (which travels with the folder) checks the project it finds
 * itself in:
 *  - no other copy anywhere → the local one IS the single source, fine;
 *  - another copy exists → nothing here may import the LOCAL file. Repoint
 *    the import at the project's own copy, wherever the developer keeps it,
 *    and leave the local file dormant (it is only needed if this folder is
 *    lifted out again).
 *
 * Unlike `useMediaQuery`, this helper is PURE — two copies cost nothing at
 * runtime. The rule is code hygiene: one helper, one import path.
 */

const SRC_ROOT = resolve(__dirname, "../../..");
const FOLDER = resolve(__dirname, "..");
const HELPER_FILE = "useIsomorphicLayoutEffect.ts";
const LOCAL_HELPER = join(FOLDER, HELPER_FILE);

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (name === "node_modules") return [];
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const rel = (file: string) => relative(SRC_ROOT, file).split(sep).join("/");

/** Files of this blank that import the LOCAL helper copy. */
const localImporters = (): string[] =>
  walk(FOLDER)
    .filter((file) => /\.tsx?$/.test(file) && file !== LOCAL_HELPER)
    .filter((file) =>
      [
        ...readFileSync(file, "utf8").matchAll(
          /from\s+["']([^"']+)["']/g,
        ),
      ].some(
        (match) =>
          resolve(dirname(file), match[1]!) === LOCAL_HELPER.replace(/\.ts$/, ""),
      ),
    )
    .map(rel);

describe("useIsomorphicLayoutEffect is single-source in this project", () => {
  it("when the project already has the helper, this blank uses THAT one", () => {
    const elsewhere = walk(SRC_ROOT)
      .filter(
        (file) => file.endsWith(sep + HELPER_FILE) && file !== LOCAL_HELPER,
      )
      .map(rel);

    if (elsewhere.length === 0) return; // local copy is the only one — fine

    expect(
      localImporters(),
      `The project already provides useIsomorphicLayoutEffect (${elsewhere.join(
        ", ",
      )}). Do not wire in this blank's own copy: repoint these imports at the project's helper and leave ./${HELPER_FILE} dormant (it exists so the folder can be lifted out standalone).`,
    ).toEqual([]);
  });
});
