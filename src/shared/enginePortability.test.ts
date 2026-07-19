import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * COPY-PORTABILITY contract of the engine libraries. `shared/gesture` and
 * `shared/motion` are designed to be lifted into another project by copying
 * the FOLDER — so their source may import only React and files inside their
 * own folder. Anything else (another shared util, a carousel module, an npm
 * helper) would break the copied folder silently. Tests are exempt for
 * `vitest` and the react-dom renderer only; the sanctioned escape for tiny
 * helpers is a LOCAL copy (see `motion/profile/clamp.ts`).
 */

const ENGINE_ROOTS = ["gesture", "motion"] as const;
const ALLOWED_BARE = new Set(["react"]);
// Tests additionally get the renderer: the LIBRARY may import only react,
// but its use* hooks cannot be exercised without one, and any project the
// folder is copied into is a React project — react-dom is there by
// definition. The source allowlist stays react-only.
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

describe("engine copy-portability (react + self only)", () => {
  for (const engine of ENGINE_ROOTS) {
    it(`shared/${engine} imports nothing outside its own folder`, () => {
      const root = resolve(__dirname, engine);
      const violations: string[] = [];

      for (const file of walk(root)) {
        const isTest = /\.test\.tsx?$/.test(file);
        const allowedBare = isTest ? ALLOWED_TEST_BARE : ALLOWED_BARE;

        for (const specifier of importSpecifiers(readFileSync(file, "utf8"))) {
          if (!specifier.startsWith(".")) {
            if (!allowedBare.has(specifier)) {
              violations.push(`${file}: bare import "${specifier}"`);
            }
            continue;
          }
          const target = resolve(dirname(file), specifier);
          if (!(target + sep).startsWith(root + sep) && target !== root) {
            violations.push(`${file}: escapes the engine folder via "${specifier}"`);
          }
        }
      }

      expect(violations).toEqual([]);
    });
  }
});
