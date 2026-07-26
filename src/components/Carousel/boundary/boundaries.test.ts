// See ./README.md
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

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
        // `../` reaches out of the kit; `node:*`, npm deps and `./*` are fine.
        .filter((spec) => spec.startsWith("../"))
        .map((spec) => `${rel(file)} -> ${spec}`),
    );
    expect(offenders).toEqual([]);
  });
});
