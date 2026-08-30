// See ../README.md
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// ../.. — this file sits in boundary/tests/, the box root is Carousel/.
const boxRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
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
        // Judged by RESOLVED target, not by the `../` prefix: a test living in
        // data-gen/tests/ reaches its own kit that way. `node:*` and npm deps
        // are bare specifiers and never resolve to a path.
        .filter((spec) => {
          if (!spec.startsWith(".")) return false;
          const target = path.resolve(path.dirname(file), spec);
          return (
            target !== DATA_GEN_DIR &&
            !target.startsWith(DATA_GEN_DIR + path.sep)
          );
        })
        .map((spec) => `${rel(file)} -> ${spec}`),
    );
    expect(offenders).toEqual([]);
  });

  it("the self-containment guard can actually fail", () => {
    // The check above is a path comparison; if it silently accepted everything
    // the suite would be green and useless. A specifier that provably escapes
    // must be rejected.
    const escaping = path.resolve(DATA_GEN_DIR, "../client/domain");
    expect(escaping.startsWith(DATA_GEN_DIR + path.sep)).toBe(false);
  });
});
