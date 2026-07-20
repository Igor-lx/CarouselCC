import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * This library's OWN copy-portability guard — it lives INSIDE the folder and
 * checks ONLY the folder, so it travels with every copy and never depends on
 * any sibling library existing. Source may import only React and files
 * inside this folder; tests additionally get vitest, the react-dom renderer
 * and node: builtins (they run under vitest on node by definition). The
 * sanctioned escape for tiny helpers is a LOCAL copy, never an import.
 *
 * Deliberately duplicated in every library of the collection — each folder
 * is a self-sufficient заготовка, and its guard is part of it.
 */

const LIBRARY_ROOT = resolve(__dirname, "..");
const ALLOWED_BARE = new Set(["react"]);
const ALLOWED_TEST_BARE = new Set(["react", "vitest", "react-dom/client"]);

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });

const importSpecifiers = (source: string): string[] =>
  [...source.matchAll(/(?:^|\n)\s*(?:import|export)[^;'"]*from\s+["']([^"']+)["']/g)].map(
    (match) => match[1]!,
  );

describe("copy-portability (react + self only)", () => {
  it("imports nothing outside this folder", () => {
    const violations: string[] = [];

    for (const file of walk(LIBRARY_ROOT)) {
      const isTest = /\.test\.tsx?$/.test(file);
      const allowedBare = isTest ? ALLOWED_TEST_BARE : ALLOWED_BARE;

      for (const specifier of importSpecifiers(readFileSync(file, "utf8"))) {
        if (!specifier.startsWith(".")) {
          const isNodeBuiltin = specifier.startsWith("node:");
          if (!(allowedBare.has(specifier) || (isTest && isNodeBuiltin))) {
            violations.push(`${file}: bare import "${specifier}"`);
          }
          continue;
        }
        const target = resolve(dirname(file), specifier);
        if (!(target + sep).startsWith(LIBRARY_ROOT + sep) && target !== LIBRARY_ROOT) {
          violations.push(`${file}: escapes the library folder via "${specifier}"`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
