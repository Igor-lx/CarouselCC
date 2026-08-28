import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = "C:/dev/CarouselCC/src";

const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const full = path.join(dir, e);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.tsx?$/.test(e)) files.push(full.replace(/\\/g, "/"));
  }
})(ROOT);

const isTest = (f) => /\/tests\//.test(f) || /\.test\.tsx?$/.test(f);

const rel = (f) => f.replace(ROOT + "/", "");

// --- resolve a specifier to a file -----------------------------------------
const resolve = (fromFile, spec) => {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromFile), spec).replace(/\\/g, "/");
  const cands = [
    base + ".ts", base + ".tsx",
    base + "/index.ts", base + "/index.tsx",
    base,
  ];
  for (const c of cands) if (files.includes(c)) return c;
  return null;
};

// --- parse imports + exports ------------------------------------------------
const importsOf = new Map();   // file -> Set<file>
const importedNames = new Map(); // file -> Set<name>  (names pulled FROM that file)
const exportsOf = new Map();   // file -> Set<name>

const NAME_RE = /^[A-Za-z_$][\w$]*$/;

for (const f of files) {
  const src = readFileSync(f, "utf8");
  importsOf.set(f, new Set());

  // import { a, b as c } from "x" | import x from "y" | export {...} from "z"
  const re = /(?:^|\n)\s*(?:import|export)\s+([\s\S]*?)\s*from\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(src))) {
    const clause = m[1];
    const target = resolve(f, m[2]);
    if (!target) continue;
    importsOf.get(f).add(target);
    if (!importedNames.has(target)) importedNames.set(target, new Set());
    const set = importedNames.get(target);
    if (clause.includes("*")) { set.add("*"); continue; }
    const braces = clause.match(/\{([\s\S]*)\}/);
    if (braces) {
      for (let part of braces[1].split(",")) {
        part = part.trim().replace(/^type\s+/, "");
        if (!part) continue;
        const name = part.split(/\s+as\s+/)[0].trim();
        if (NAME_RE.test(name)) set.add(name);
      }
    }
    const def = clause.replace(/\{[\s\S]*\}/, "").replace(/^type\s+/, "").split(",")[0].trim();
    if (def && NAME_RE.test(def)) set.add("default");
  }

  // exports declared in this file
  const ex = new Set();
  for (const mm of src.matchAll(/export\s+(?:const|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g)) ex.add(mm[1]);
  if (/export\s+default\s/.test(src)) ex.add("default");
  for (const mm of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (let part of mm[1].split(",")) {
      part = part.trim().replace(/^type\s+/, "");
      if (!part) continue;
      const name = (part.split(/\s+as\s+/)[1] ?? part.split(/\s+as\s+/)[0]).trim();
      if (NAME_RE.test(name)) ex.add(name);
    }
  }
  exportsOf.set(f, ex);
}

// --- reverse graph ----------------------------------------------------------
const importedBy = new Map();
for (const [f, deps] of importsOf) {
  for (const d of deps) {
    if (!importedBy.has(d)) importedBy.set(d, new Set());
    importedBy.get(d).add(f);
  }
}

const mode = process.argv[2];

if (mode === "dead") {
  console.log("=== Exports never imported anywhere (incl. tests) ===\n");
  const rows = [];
  for (const f of files) {
    if (isTest(f)) continue;
    const pulled = importedNames.get(f) ?? new Set();
    if (pulled.has("*")) continue; // star-reexported: cannot tell
    const dead = [...exportsOf.get(f)].filter((n) => !pulled.has(n));
    if (dead.length) rows.push([rel(f), dead]);
  }
  for (const [f, dead] of rows.sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`${f}\n    ${dead.join(", ")}`);
  }
  console.log(`\n${rows.length} files carry at least one never-imported export.`);
}

if (mode === "blast") {
  console.log("=== Blast radius: non-test importers per source file ===\n");
  const rows = [];
  for (const f of files) {
    if (isTest(f)) continue;
    const users = [...(importedBy.get(f) ?? [])].filter((u) => !isTest(u));
    rows.push([rel(f), users.length, users.map(rel)]);
  }
  rows.sort((a, b) => b[1] - a[1]);
  for (const [f, n, users] of rows.slice(0, 30)) {
    console.log(`${String(n).padStart(3)}  ${f}`);
    if (n <= 6) console.log(`      ${users.join("\n      ")}`);
  }
  console.log("\n--- files nothing (non-test) imports ---");
  for (const [f, n] of rows) if (n === 0) console.log(`     ${f}`);
}

if (mode === "cycles") {
  const color = new Map();
  const stack = [];
  const found = [];
  const visit = (f) => {
    color.set(f, 1); stack.push(f);
    for (const d of importsOf.get(f) ?? []) {
      if (color.get(d) === 1) found.push([...stack.slice(stack.indexOf(d)), d]);
      else if (!color.has(d)) visit(d);
    }
    stack.pop(); color.set(f, 2);
  };
  for (const f of files) if (!color.has(f)) visit(f);
  console.log("=== Import cycles ===\n");
  const seen = new Set();
  for (const c of found) {
    const key = [...c].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(c.map(rel).join("\n  -> "));
    console.log("");
  }
  console.log(`${seen.size} distinct cycles.`);
}
