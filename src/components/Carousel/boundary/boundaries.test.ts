import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Architecture test — enforces the box's two-halves boundary as a CI invariant,
 * not a convention:
 *
 *  - `client/` (browser component) must never import `data-gen/` — that is what
 *    keeps the Node-only generator (and `node:fs`) out of the app bundle.
 *  - `data-gen/` (server kit) must be self-contained — no import may escape the
 *    folder (`../`), so it can be copied to a server on its own and never
 *    reaches back into `client/`, `shared`, or the app.
 *
 * Lives in the box's `boundary/` folder (neutral ground, above both halves), so
 * it may see both halves without violating the boundary it guards.
 */

// This file sits in `Carousel/boundary/`; the box root is one level up.
const boxRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLIENT_DIR = path.join(boxRoot, "client");
const DATA_GEN_DIR = path.join(boxRoot, "data-gen");

const tsFiles = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...tsFiles(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
};

const importSpecifiers = (file: string): string[] => {
  const source = readFileSync(file, "utf8");
  const specs: string[] = [];
  const re = /(?:from|import)\s*["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    if (match[1]) specs.push(match[1]);
  }
  return specs;
};

const rel = (file: string): string =>
  path.relative(boxRoot, file).replace(/\\/g, "/");

describe("carousel box boundaries", () => {
  it("actually scans both halves (guards against a vacuous pass)", () => {
    // If a path were wrong the scans below would find no files and pass
    // silently — assert there is real source on both sides.
    expect(tsFiles(CLIENT_DIR).length).toBeGreaterThan(20);
    expect(tsFiles(DATA_GEN_DIR).length).toBeGreaterThan(3);
  });

  it("client/ never imports data-gen/", () => {
    const offenders = tsFiles(CLIENT_DIR).flatMap((file) =>
      importSpecifiers(file)
        .filter((spec) => spec.includes("data-gen"))
        .map((spec) => `${rel(file)} -> ${spec}`),
    );
    expect(offenders).toEqual([]);
  });

  it("data-gen/ is self-contained (no import escapes the folder)", () => {
    const offenders = tsFiles(DATA_GEN_DIR).flatMap((file) =>
      importSpecifiers(file)
        // `node:*`, bare npm deps, and in-folder `./*` are fine; a `../` import
        // would reach out of the kit (into client/shared/app) and break the
        // "copy this folder to a server" guarantee.
        .filter((spec) => spec.startsWith("../"))
        .map((spec) => `${rel(file)} -> ${spec}`),
    );
    expect(offenders).toEqual([]);
  });
});
