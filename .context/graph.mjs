import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..", "src").split(path.sep).join("/");

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

// --- разрешение спецификатора импорта в файл ---------------------------------
const resolve = (fromFile, spec) => {
  if (!spec.startsWith(".")) return null;
  const base = path.resolve(path.dirname(fromFile), spec).replace(/\\/g, "/");
  const cands = [
    base + ".ts",
    base + ".tsx",
    base + "/index.ts",
    base + "/index.tsx",
    base,
  ];
  for (const c of cands) if (files.includes(c)) return c;
  return null;
};

// --- разбор импортов и экспортов ---------------------------------------------
const importsOf = new Map(); // файл -> набор файлов, которые он импортирует
const importedNames = new Map(); // файл -> имена, которые из него утащили
const exportsOf = new Map(); // файл -> имена, которые он экспортирует

const NAME_RE = /^[A-Za-z_$][\w$]*$/;

for (const f of files) {
  const src = readFileSync(f, "utf8");
  importsOf.set(f, new Set());

  // разбираемые формы: import { a, b as c } from "x" | import x from "y" | export {...} from "z"
  const re =
    /(?:^|\n)\s*(?:import|export)\s+([\s\S]*?)\s*from\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(src))) {
    const clause = m[1];
    const target = resolve(f, m[2]);
    if (!target) continue;
    importsOf.get(f).add(target);
    if (!importedNames.has(target)) importedNames.set(target, new Set());
    const set = importedNames.get(target);
    if (clause.includes("*")) {
      set.add("*");
      continue;
    }
    const braces = clause.match(/\{([\s\S]*)\}/);
    if (braces) {
      for (let part of braces[1].split(",")) {
        part = part.trim().replace(/^type\s+/, "");
        if (!part) continue;
        const name = part.split(/\s+as\s+/)[0].trim();
        if (NAME_RE.test(name)) set.add(name);
      }
    }
    const def = clause
      .replace(/\{[\s\S]*\}/, "")
      .replace(/^type\s+/, "")
      .split(",")[0]
      .trim();
    if (def && NAME_RE.test(def)) set.add("default");
  }

  // экспорты, объявленные в самом файле
  const ex = new Set();
  for (const mm of src.matchAll(
    /export\s+(?:const|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g,
  ))
    ex.add(mm[1]);
  if (/export\s+default\s/.test(src)) ex.add("default");
  for (const mm of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (let part of mm[1].split(",")) {
      part = part.trim().replace(/^type\s+/, "");
      if (!part) continue;
      const name = (
        part.split(/\s+as\s+/)[1] ?? part.split(/\s+as\s+/)[0]
      ).trim();
      if (NAME_RE.test(name)) ex.add(name);
    }
  }
  exportsOf.set(f, ex);
}

// --- обратный граф: кто кого импортирует ------------------------------------
const importedBy = new Map();
for (const [f, deps] of importsOf) {
  for (const d of deps) {
    if (!importedBy.has(d)) importedBy.set(d, new Set());
    importedBy.get(d).add(f);
  }
}

const mode = process.argv[2];

if (mode === "dead") {
  console.log(
    "=== Экспорты, которые нигде не импортируют (тесты включены) ===\n",
  );
  const rows = [];
  for (const f of files) {
    if (isTest(f)) continue;
    const pulled = importedNames.get(f) ?? new Set();
    if (pulled.has("*")) continue; // утащено через export * — разобрать нельзя
    const dead = [...exportsOf.get(f)].filter((n) => !pulled.has(n));
    if (dead.length) rows.push([rel(f), dead]);
  }
  for (const [f, dead] of rows.sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`${f}\n    ${dead.join(", ")}`);
  }
  console.log(
    `\nФайлов хотя бы с одним неимпортируемым экспортом: ${rows.length}.`,
  );
}

if (mode === "blast") {
  console.log("=== Радиус поражения: не-тестовых импортёров на файл ===\n");
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
  console.log("\n--- файлы, которые не импортирует никто (кроме тестов) ---");
  for (const [f, n] of rows) if (n === 0) console.log(`     ${f}`);
}

if (mode === "cycles") {
  const color = new Map();
  const stack = [];
  const found = [];
  const visit = (f) => {
    color.set(f, 1);
    stack.push(f);
    for (const d of importsOf.get(f) ?? []) {
      if (color.get(d) === 1) found.push([...stack.slice(stack.indexOf(d)), d]);
      else if (!color.has(d)) visit(d);
    }
    stack.pop();
    color.set(f, 2);
  };
  for (const f of files) if (!color.has(f)) visit(f);
  console.log("=== Циклические импорты ===\n");
  const seen = new Set();
  for (const c of found) {
    const key = [...c].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(c.map(rel).join("\n  -> "));
    console.log("");
  }
  console.log(`Различных циклов: ${seen.size}.`);
}

// --- verify: покрытие карты и живость якорей --------------------------------
if (mode === "verify") {
  const BASE = HERE;
  const NEWLINE = String.fromCharCode(10);
  const mapText = readFileSync(path.join(BASE, "00-map.md"), "utf8");

  // 1. каждый файл кода упомянут в карте
  // Ambient-объявления описывать нечем: в них нет ни поведения, ни связей.
  const code = files.filter((f) => !isTest(f) && !f.endsWith(".d.ts"));
  // Карта пишет и полными именами, и группами вида {a,b}.ts — поэтому
  // засчитывается имя как с расширением, так и без него.
  const mentioned = (f) => {
    const base = rel(f).split("/").pop();
    const stem = base.slice(0, base.lastIndexOf("."));
    return mapText.includes(base) || mapText.includes(stem);
  };
  const missing = code.filter((f) => !mentioned(f));
  console.log("=== Покрытие карты ===");
  console.log(
    `  файлов кода (без тестов): ${code.length}, не упомянуто: ${missing.length}`,
  );
  for (const f of missing) console.log("    " + rel(f));

  // 2. якоря вида `путь:строка` указывают на существующий файл и живую строку
  const expand = (q) => {
    if (q.startsWith("src/")) return path.join(BASE, "..", q);
    if (q.startsWith("client/"))
      return path.join(BASE, "..", "src/components/Carousel", q);
    if (q.startsWith("docs/"))
      return path.join(BASE, "..", "src/components/Carousel/client", q);
    if (q.startsWith("shared/")) return path.join(BASE, "..", "src", q);
    if (q.startsWith("boundary/") || q.startsWith("data-gen/"))
      return path.join(BASE, "..", "src/components/Carousel", q);
    return null;
  };

  let checked = 0;
  const broken = [];
  for (const name of readdirSync(BASE)) {
    if (!name.endsWith(".md")) continue;
    const text = readFileSync(path.join(BASE, name), "utf8");
    const spans = text.split("`").filter((_, i) => i % 2 === 1);
    for (const span of spans) {
      const at = span.lastIndexOf(":");
      if (at < 1) continue;
      const file = span.slice(0, at);
      const tail = span.slice(at + 1).split("-")[0];
      if (tail === "" || Number.isNaN(Number(tail))) continue;
      if (!file.includes("/") || !file.includes(".")) continue;
      const full = expand(file);
      if (full === null) continue;
      checked++;
      if (!existsSync(full)) {
        broken.push(`${name}: ${span} — файла нет`);
        continue;
      }
      const body = readFileSync(full, "utf8");
      const lines = body.split(NEWLINE).length;
      if (Number(tail) > lines) {
        broken.push(`${name}: ${span} — в файле ${lines} строк`);
      }
    }
  }
  console.log("=== Якоря ===");
  console.log(`  проверено: ${checked}, битых: ${broken.length}`);
  for (const b of broken) console.log("    " + b);

  if (missing.length || broken.length) process.exitCode = 1;
}
