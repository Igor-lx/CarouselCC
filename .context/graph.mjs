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

  // 1b. каждый тестовый файл назван в 08-tests.md
  // Группы вида `{a,b}.test.ts` раскрываются, иначе они читались бы как
  // неупомянутые — а это ровно та форма, которой база пользуется.
  const expandGroups = (text) => {
    const grow = (q) => {
      const group = /\{([^}]*)\}/.exec(q);
      if (group === null) return [q];
      const head = q.slice(0, group.index);
      const tail = q.slice(group.index + group[0].length);
      return group[1]
        .split(",")
        .flatMap((one) => grow(head + one.trim() + tail));
    };
    const extra = [];
    for (const piece of text.split("`")) {
      if (!piece.includes("{")) continue;
      extra.push(...grow(piece));
    }
    return text + extra.join(" ");
  };
  const testsText = expandGroups(
    readFileSync(path.join(BASE, "08-tests.md"), "utf8"),
  );
  const testFiles = files.filter(isTest);
  const namedInTests = (f) => {
    const base = rel(f).split("/").pop();
    const stem = base.slice(0, base.lastIndexOf("."));
    return testsText.includes(base) || testsText.includes(stem);
  };
  const unnamed = testFiles.filter((f) => !namedInTests(f));
  console.log("=== Покрытие тестов ===");
  console.log(
    `  тестовых файлов: ${testFiles.length}, не названо: ${unnamed.length}`,
  );
  for (const f of unnamed) console.log("    " + rel(f));

  // 2. якоря вида `путь:строка` указывают на существующий файл и живую строку
  const expand = (q) => {
    if (q.startsWith("src/")) return path.join(BASE, "..", q);
    if (q.startsWith("client/"))
      return path.join(BASE, "..", "src/components/Carousel", q);
    if (q.startsWith("docs/"))
      return path.join(BASE, "..", "src/components/Carousel/client", q);
    if (q.startsWith("shared/")) return path.join(BASE, "..", "src", q);
    if (q.startsWith("modules/"))
      return path.join(BASE, "..", "src/components/Carousel/client", q);
    if (q.startsWith("basic/") || q.startsWith("widget/"))
      return path.join(
        BASE,
        "..",
        "src/components/Carousel/client/modules/Pagination",
        q,
      );
    if (q.startsWith("app/")) return path.join(BASE, "..", "src", q);
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

  // 3. объявленные размеры: `путь.ts` (N), `папка/` (N файлов, M) и та же
  // папка в форме заголовка — `папка/**` — N файлов / M строк.
  // N — непустых строк, как требует README базы. Папка считается по коду без
  // тестов; путь, в котором есть `tests`, — наоборот, только по тестам.
  const everyFile = [];
  (function walkAll(dir) {
    for (const e of readdirSync(dir)) {
      const full = path.join(dir, e);
      if (statSync(full).isDirectory()) walkAll(full);
      else if (/\.(tsx?|scss)$/.test(e))
        everyFile.push(full.split(path.sep).join("/"));
    }
  })(path.join(BASE, "..", "src").split(path.sep).join("/"));

  const nonEmpty = (f) =>
    readFileSync(f, "utf8")
      .split(NEWLINE)
      .filter((l) => l.trim() !== "").length;

  const norm = (p) => p.split(path.sep).join("/").replace(/[/]+$/, "");
  const bare = (q) => q.replace(/[*]+$/, "").replace(/[/]+$/, "");

  // База пишет группы вида `{a,b}/tests`: раскрываем их в отдельные пути.
  const variants = (q) => {
    const group = /\{([^}]*)\}/.exec(q);
    if (group === null) return [q];
    const head = q.slice(0, group.index);
    const tail = q.slice(group.index + group[0].length);
    return group[1]
      .split(",")
      .flatMap((one) => variants(head + one.trim() + tail));
  };

  const locate = (q, prefix) => {
    const tries = prefix === null ? [q] : [q, prefix + q];
    for (const candidate of tries.map(expand)) {
      if (candidate !== null && everyFile.includes(norm(candidate)))
        return norm(candidate);
    }
    const hits = everyFile.filter((f) => f.endsWith("/" + q));
    return hits.length === 1 ? hits[0] : null;
  };

  // Звёздочки трактуются как «что угодно между»; первый кусок обязан быть
  // началом пути, иначе `motion/` поймал бы и `visual-position/motion/`.
  const matches = (file, pattern) => {
    const head = pattern.split("*")[0];
    const root = expand(head);
    if (root === null) return null;
    const slash = head.endsWith("/") ? "/" : "";
    const parts = (norm(root) + slash + pattern.slice(head.length)).split("**");
    let at = 0;
    for (let i = 0; i < parts.length; i++) {
      if (parts[i] === "") continue;
      const found = file.indexOf(parts[i], at);
      if (found < 0 || (i === 0 && found !== 0)) return false;
      at = found + parts[i].length;
    }
    return true;
  };

  const under = (q, prefix) => {
    const tries = prefix === null ? [q] : [q, prefix + q];
    for (const raw of tries) {
      const patterns = variants(raw);
      const wantTests = raw.includes("tests");
      let resolvable = false;
      const hits = everyFile.filter((f) => {
        if (isTest(f) !== wantTests) return false;
        for (const pattern of patterns) {
          const verdict = matches(f, pattern);
          if (verdict === null) continue;
          resolvable = true;
          if (verdict) return true;
        }
        return false;
      });
      if (resolvable && hits.length) return hits;
    }
    return null;
  };

  // Все три формы читаются только из бэктиков, поэтому проза с числами и
  // якоря вида `file:line` под проверку не попадают.
  const FILE_RE = /`([\w./{},*-]+\.(?:tsx|ts|scss))`\s*\((\d+)\)/g;
  const DIR_RE =
    /`([\w./*{},-]+\/(?:\*\*)?)`\s*\((\d+) файл[а-я]*(?:, (\d+))?\)/g;
  const DASH_RE =
    /`([\w./*{},-]+\/(?:\*\*)?)`[^`\n]*— (\d+) файл[а-я]* \/ (\d+) стро[а-я]*/g;
  const HEAD_RE = /^#{2,4}[^`]*`([^`]+)`/;

  let sized = 0;
  const unresolved = [];
  const wrong = [];
  const claimDir = (name, q, prefix, filesClaim, linesClaim) => {
    const hits = under(q, prefix);
    if (hits === null) {
      unresolved.push(name + ": " + q);
      return;
    }
    sized++;
    if (hits.length !== Number(filesClaim))
      wrong.push(
        `${name}: ${q} — записано ${filesClaim} файлов, на диске ${hits.length}`,
      );
    if (linesClaim === undefined) return;
    const total = hits.reduce((s, f) => s + nonEmpty(f), 0);
    if (total !== Number(linesClaim))
      wrong.push(
        `${name}: ${q} — записано ${linesClaim} строк, на диске ${total}`,
      );
  };

  for (const name of readdirSync(BASE)) {
    if (!name.endsWith(".md")) continue;
    // Заголовок раздела задаёт префикс: внутри него пути пишутся коротко.
    let prefix = null;
    const body = readFileSync(path.join(BASE, name), "utf8");
    for (const line of body.split(NEWLINE)) {
      const head = HEAD_RE.exec(line);
      if (head !== null) {
        const token = head[1];
        prefix = !token.includes("/")
          ? null
          : /\.(tsx?|scss)$/.test(token)
            ? token.slice(0, token.lastIndexOf("/") + 1)
            : bare(token) + "/";
      }
      let m;
      FILE_RE.lastIndex = 0;
      while ((m = FILE_RE.exec(line)) !== null) {
        const file = locate(m[1], prefix);
        if (file === null) {
          unresolved.push(name + ": " + m[1]);
          continue;
        }
        sized++;
        const real = nonEmpty(file);
        if (real !== Number(m[2]))
          wrong.push(`${name}: ${m[1]} — записано ${m[2]}, на диске ${real}`);
      }
      DIR_RE.lastIndex = 0;
      while ((m = DIR_RE.exec(line)) !== null)
        claimDir(name, m[1], prefix, m[2], m[3]);
      DASH_RE.lastIndex = 0;
      while ((m = DASH_RE.exec(line)) !== null)
        claimDir(name, m[1], prefix, m[2], m[3]);
    }
  }
  console.log("=== Объявленные размеры ===");
  console.log(
    `  сверено: ${sized}, разошлось: ${wrong.length}, не разобрано: ${unresolved.length}`,
  );
  for (const w of wrong) console.log("    " + w);
  for (const u of unresolved) console.log("    ? " + u);

  if (missing.length || unnamed.length || broken.length || wrong.length)
    process.exitCode = 1;
}
