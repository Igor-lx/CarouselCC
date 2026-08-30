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
const specsOf = new Map(); // файл -> спецификаторы как написаны, включая пакеты

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
    if (!specsOf.has(f)) specsOf.set(f, new Set());
    specsOf.get(f).add(m[2]);
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

// --- open: что в проекте открыто --------------------------------------------
// Три сводки, каждая считается заново. Написанные рукой, они бы устарели первыми
// — а нужны они именно тому, кто садится за рефактор с чистого листа.
if (mode === "open") {
  const BASE = HERE;
  const NEWLINE = String.fromCharCode(10);
  const TICK = String.fromCharCode(96);

  const scan = (title, test) => {
    console.log(`=== ${title} ===`);
    let count = 0;
    for (const name of readdirSync(BASE).filter((n) => n.endsWith(".md"))) {
      const lines = readFileSync(path.join(BASE, name), "utf8").split(NEWLINE);
      lines.forEach((line, i) => {
        if (!test(line)) return;
        count++;
        console.log(`  ${name}:${i + 1}  ${line.trim().slice(0, 96)}`);
      });
    }
    console.log(`  всего: ${count}`);
  };

  // Гипотезы базы: помечаются `?` в начале пункта (README, «Формат записи»).
  scan("Гипотезы — проверить, прежде чем на них опираться", (line) =>
    new RegExp("^[ ]*[-*][ ]+" + TICK + "[?]" + TICK).test(line),
  );
  // Записанные дыры в тестовой сети.
  scan("Записано «не закреплено»", (line) =>
    /не закреплен|Чего в слое не|Чего не закреплено/i.test(line),
  );

  // Файлы, до которых не дотягивается ни один тест — даже транзитивно. Это не
  // «нет своего теста»: `useTrackBinding` покрыт `trackBinding.test.tsx`, имена
  // не совпадают, и считать по именам было бы враньём.
  const reached = new Set();
  const stack = files.filter(isTest);
  while (stack.length > 0) {
    const f = stack.pop();
    for (const d of importsOf.get(f) ?? []) {
      if (reached.has(d)) continue;
      reached.add(d);
      stack.push(d);
    }
  }
  const code = files.filter((f) => !isTest(f) && !f.endsWith(".d.ts"));
  const cold = code.filter((f) => !reached.has(f));
  console.log("=== Файлы, до которых не дотягивается ни один тест ===");
  for (const f of cold) console.log("  " + rel(f));
  console.log(`  всего: ${cold.length} из ${code.length}`);
}

// --- verify: сверка базы с кодом ---------------------------------------------
// Восемь проверок, и все механические: покрытие карты, покрытие тестов, пометки
// CONSTRAINT и пометки решений, правила направления импортов, живость якорей
// с их цитатами, объявленный состав папок и радиусы поражения. Ненулевой код
// возврата означает, что база отстала от кода.
// Объём файлов — по запросу. В базе этих чисел нет намеренно: строка меняется
// от любой правки, и записанный объём превращает каждый коммит в правку базы.
if (mode === "sizes") {
  const NEWLINE = String.fromCharCode(10);
  const size = (f) =>
    readFileSync(f, "utf8")
      .split(NEWLINE)
      .filter((l) => l.trim() !== "").length;
  const arg = process.argv[3];
  const rows = files
    .filter((f) => (arg ? rel(f).includes(arg) : true))
    .map((f) => [rel(f), size(f)])
    .sort((a, b) => b[1] - a[1]);
  console.log("=== Непустых строк на файл ===" + NEWLINE);
  for (const [f, n] of rows) console.log(String(n).padStart(5) + "  " + f);
  const total = rows.reduce((sum, r) => sum + r[1], 0);
  console.log(NEWLINE + `Файлов: ${rows.length}, непустых строк: ${total}.`);
}

if (mode === "verify") {
  const BASE = HERE;
  const MAP = "00-map.md";
  const TESTS = "08-tests.md";
  const NEWLINE = String.fromCharCode(10);
  const REPO = path.join(BASE, "..");

  const norm = (p) => p.split(path.sep).join("/").replace(/[/]+$/, "");
  const bare = (q) => q.replace(/[*]+$/, "").replace(/[/]+$/, "");

  // Пути в базе сокращены и лежат на разной глубине — таблица в 01-facts.md.
  const expand = (q) => {
    if (q.startsWith("src/")) return path.join(REPO, q);
    if (
      q.startsWith("client/") ||
      q.startsWith("boundary/") ||
      q.startsWith("data-gen/")
    )
      return path.join(REPO, "src/components/Carousel", q);
    if (q.startsWith("docs/") || q.startsWith("modules/"))
      return path.join(REPO, "src/components/Carousel/client", q);
    if (q.startsWith("basic/") || q.startsWith("widget/"))
      return path.join(
        REPO,
        "src/components/Carousel/client/modules/Pagination",
        q,
      );
    if (q.startsWith("shared/") || q.startsWith("app/"))
      return path.join(REPO, "src", q);
    return null;
  };

  // Два списка, и смешивать их нельзя: размеры папок считаются по коду
  // (`everyFile`), а якоря указывают ещё и на доки (`everyPath`).
  const everyFile = [];
  const everyPath = [];
  (function walkAll(dir) {
    for (const e of readdirSync(dir)) {
      const full = path.join(dir, e);
      if (statSync(full).isDirectory()) walkAll(full);
      else if (/\.(tsx?|scss|md)$/.test(e)) {
        everyPath.push(full.split(path.sep).join("/"));
        if (!e.endsWith(".md")) everyFile.push(everyPath[everyPath.length - 1]);
      }
    }
  })(norm(path.join(REPO, "src")));

  // Файл ищется по сокращению, по префиксу раздела и, последним, по уникальному
  // хвосту пути: база пишет и `client/domain/track.ts`, и просто `track.ts`.
  const locate = (q, prefix) => {
    for (const candidate of prefix === null ? [q] : [q, prefix + q]) {
      const expanded = expand(candidate);
      if (expanded !== null && existsSync(expanded)) return norm(expanded);
      // Полки база пишет и без ведущего `shared/` — `engines/motion/tests/…`.
      // Только для путей с папкой: голое имя обязано разрешаться префиксом
      // раздела, иначе `index.ts` уедет в `shared/index.ts`.
      if (candidate.includes("/")) {
        const atShelf = path.join(REPO, "src/shared", candidate);
        if (existsSync(atShelf) && statSync(atShelf).isFile())
          return norm(atShelf);
      }
      const atRepo = path.join(REPO, candidate);
      if (existsSync(atRepo) && statSync(atRepo).isFile()) return norm(atRepo);
    }
    const hits = everyPath.filter((f) => f.endsWith("/" + q));
    return hits.length === 1 ? hits[0] : null;
  };

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

  // Звёздочки — «сколько угодно сегментов, в том числе ноль»; путь без них
  // означает «всё, что лежит под ним».
  const BACKSLASH = String.fromCharCode(92);
  const MID = String.fromCharCode(1);
  const TAIL = String.fromCharCode(2);
  const esc = (s) =>
    [...s].map((c) => (/[\w-]/.test(c) ? c : BACKSLASH + c)).join("");
  const asRegExp = (full) => {
    const marked = (full.includes("*") ? full : full + "**")
      .split("/**/")
      .join(MID)
      .split("**")
      .join(TAIL);
    const body = esc(marked)
      .split(esc(MID))
      .join("/(?:[^]*/)?")
      .split(esc(TAIL))
      .join("(?:[^]*)?");
    return new RegExp("^" + body + "$");
  };

  // Всё, что лежит под путём, тесты включительно.
  const inside = (q, prefix) => {
    for (const raw of prefix === null ? [q] : [q, prefix + q]) {
      const shapes = [];
      for (const pattern of variants(raw)) {
        const head = pattern.split("*")[0];
        // Тот же сокращённый вид полки, что понимает `locate`.
        const shelf = path.join(REPO, "src/shared", head);
        const root =
          expand(head) ??
          (head.includes("/") && existsSync(shelf) ? shelf : null);
        if (root === null) continue;
        const slash = head.endsWith("/") ? "/" : "";
        shapes.push(asRegExp(norm(root) + slash + pattern.slice(head.length)));
      }
      if (!shapes.length) continue;
      const hits = everyFile.filter((f) => shapes.some((rx) => rx.test(f)));
      if (hits.length) return { hits, wantTests: raw.includes("tests") };
    }
    return null;
  };

  // Размер папки считается по коду, а пути со словом `tests` — по тестам.
  const under = (q, prefix) => {
    const found = inside(q, prefix);
    if (found === null) return null;
    const hits = found.hits.filter((f) => isTest(f) === found.wantTests);
    return hits.length ? hits : null;
  };

  // 3, 4 и 5. якоря, состав объявленных папок и радиус поражения слоя —
  // проходом по строкам: все три читают контекст заголовка, он задаёт и префикс
  // пути, и файл, к которому относятся якоря вида `:120`.
  // Заявляется СОСТАВ папки, а не её объём: число файлов меняется, только
  // когда файл появился или исчез, — и это ровно то событие, которое база
  // обязана заметить. Объём строк не заявляется нигде (см. режим `sizes`).
  const DIR_RE = /`([\w./*{},-]+\/(?:\*\*)?)`\s*\((\d+) файл[а-я]*\)/g;
  const DASH_RE = /`([\w./*{},-]+\/(?:\*\*)?)`[^`\n]*— (\d+) файл[а-я]*/g;
  // Радиус поражения слоя: «22 импортёра (+12 тестовых)». Считается по графу,
  // а не по папке, поэтому и живёт в проверке, а не в тексте.
  const IMPORTERS_RE =
    /`([\w./*{},-]+\/(?:\*\*)?)`[^`\n]*?(\d+) импортёр[а-я]*(?: \(\+(\d+) тест[а-я]*\))?/g;
  const PATH_RE = /`([\w./{},*-]+\.(?:tsx|ts|scss))`/g;
  const HEAD_RE = /^#{2,4}[^`]*`([^`]+)`/;
  const HEAD_FILES_RE = /`([\w./{},*-]+\.(?:tsx|ts|scss))`/g;
  const ANCHOR_TAIL = /\.(tsx?|scss|md|json|html)$/;
  // Якорь с цитатой: (`:31` `export const buildCarouselLayout`). Номер съедет
  // от любой вставки выше, цитата — нет, поэтому проверяется именно она.
  const CITED_RE = /\(`([^`]*):(\d+)(?:-(\d+))?` `([^`]+)`\)/g;

  let anchors = 0;
  let cited = 0;
  let dirs = 0;
  const broken = [];
  const wrong = [];
  const unresolved = [];

  const claimDir = (name, q, prefix, filesClaim) => {
    const hits = under(q, prefix);
    if (hits === null) {
      unresolved.push(`${name}: ${q}`);
      return;
    }
    dirs++;
    // Заявленная папка описывает то, что в ней лежит; у тестов такого зачёта
    // нет — 08-tests.md обязан называть каждый файл поимённо.
    if (name === MAP) for (const hit of hits) mapMentions.add(hit);
    if (hits.length !== Number(filesClaim))
      wrong.push(
        `${name}: ${q} — записано ${filesClaim} файлов, на диске ${hits.length}`,
      );
  };

  let radii = 0;
  // Импортёр — файл **вне** слоя: собственные тесты слоя в радиус не входят,
  // иначе число росло бы от каждого нового теста внутри самой папки.
  const claimImporters = (name, q, prefix, codeClaim, testClaim) => {
    const found = inside(q, prefix);
    if (found === null) {
      unresolved.push(`${name}: ${q}`);
      return;
    }
    const target = found.hits;
    const users = files.filter(
      (f) =>
        !target.includes(f) &&
        [...(importsOf.get(f) ?? [])].some((d) => target.includes(d)),
    );
    radii++;
    const inCode = users.filter((f) => !isTest(f)).length;
    if (inCode !== Number(codeClaim))
      wrong.push(
        `${name}: ${q} — записано ${codeClaim} импортёров, на диске ${inCode}`,
      );
    if (testClaim === undefined) return;
    const inTests = users.length - inCode;
    if (inTests !== Number(testClaim))
      wrong.push(
        `${name}: ${q} — записано ${testClaim} тестовых импортёров, на диске ${inTests}`,
      );
  };

  // Куда указывают якоря каталога ограничений — по ним сверяются пометки
  // CONSTRAINT в коде.
  const invariantAnchors = [];
  // То же для реестра решений.
  const decisionAnchors = [];

  // Пути, разобранные из текста базы: покрытие считается по ним, а не по
  // совпадению имени файла — иначе одноимённые файлы засчитывают друг друга.
  const mapMentions = new Set();
  const testMentions = new Set();

  // Строки таблицы «Правила направления»: слой, запреты, разрешённые исключения.
  const RULES_HEAD = /^#+.*Правила направления/;
  const ROW_RE = /^\|(.+)\|(.+)\|(.*)\|\s*$/;
  const cellPaths = (cell) => [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  const rules = [];

  for (const name of readdirSync(BASE)) {
    if (!name.endsWith(".md")) continue;
    // Заголовок раздела задаёт префикс путей и, если называет ровно один файл,
    // адресата относительных якорей.
    let prefix = null;
    let current = null;
    let inRules = false;
    for (const line of readFileSync(path.join(BASE, name), "utf8").split(
      NEWLINE,
    )) {
      const head = HEAD_RE.exec(line);
      if (head !== null) {
        const token = head[1];
        prefix = !token.includes("/")
          ? null
          : /\.(tsx?|scss)$/.test(token)
            ? token.slice(0, token.lastIndexOf("/") + 1)
            : bare(token) + "/";
        const named = line.match(HEAD_FILES_RE) ?? [];
        current =
          named.length === 1
            ? locate(named[0].split(String.fromCharCode(96)).join(""), prefix)
            : null;
      }
      if (line.startsWith("#")) inRules = RULES_HEAD.test(line);

      const row = inRules ? ROW_RE.exec(line) : null;
      if (row !== null) {
        const layer = cellPaths(row[1]);
        if (layer.length === 1)
          rules.push({
            layer: layer[0],
            banned: cellPaths(row[2]),
            allowed: cellPaths(row[3]),
          });
      }

      for (const span of line
        .split(String.fromCharCode(96))
        .filter((_, i) => i % 2 === 1)) {
        const at = span.lastIndexOf(":");
        if (at < 0) continue;
        const numbers = span.slice(at + 1).split("-");
        if (!numbers.every((n) => /^[0-9]+$/.test(n))) continue;
        const where = span.slice(0, at);
        if (where !== "" && !ANCHOR_TAIL.test(where)) continue;
        const file = where === "" ? current : locate(where, prefix);
        if (file === null) {
          unresolved.push(`${name}: ${span}`);
          continue;
        }
        anchors++;
        const lines = readFileSync(file, "utf8").split(NEWLINE).length;
        const last = Number(numbers[numbers.length - 1]);
        if (last > lines)
          broken.push(`${name}: ${span} — в файле ${lines} строк`);
        if (name === "07-invariants.md")
          invariantAnchors.push({ file, from: Number(numbers[0]), to: last });
        if (name === "09-decisions.md")
          decisionAnchors.push({ file, from: Number(numbers[0]), to: last });
      }

      let m;
      CITED_RE.lastIndex = 0;
      while ((m = CITED_RE.exec(line)) !== null) {
        const file = m[1] === "" ? current : locate(m[1], prefix);
        if (file === null) continue;
        cited++;
        const body = readFileSync(file, "utf8").split(NEWLINE);
        const from = Number(m[2]);
        const to = Number(m[3] ?? m[2]);
        if (!body.slice(from - 1, to).some((l) => l.includes(m[4])))
          broken.push(
            `${name}: ${m[1]}:${m[2]} — цитаты «${m[4]}» на этих строках нет`,
          );
      }
      DIR_RE.lastIndex = 0;
      while ((m = DIR_RE.exec(line)) !== null)
        claimDir(name, m[1], prefix, m[2]);
      DASH_RE.lastIndex = 0;
      while ((m = DASH_RE.exec(line)) !== null)
        claimDir(name, m[1], prefix, m[2]);
      IMPORTERS_RE.lastIndex = 0;
      while ((m = IMPORTERS_RE.exec(line)) !== null)
        claimImporters(name, m[1], prefix, m[2], m[3]);
      PATH_RE.lastIndex = 0;
      while ((m = PATH_RE.exec(line)) !== null) {
        for (const one of variants(m[1])) {
          const hit = locate(one, prefix);
          if (hit === null) continue;
          if (name === MAP) mapMentions.add(hit);
          if (name === TESTS) testMentions.add(hit);
        }
      }
    }
  }

  // 6. каждая пометка CONSTRAINT в коде описана в каталоге ограничений
  // Соответствие — по якорю, указывающему в тот же файл рядом с пометкой:
  // формулировка ограничения живёт в 07-invariants.md, а не в комментарии.
  const CONSTRAINT_SLACK = 8;
  const uncovered = [];
  let constraints = 0;
  for (const f of files) {
    if (isTest(f)) continue;
    const body = readFileSync(f, "utf8").split(NEWLINE);
    body.forEach((line, index) => {
      if (!line.includes("CONSTRAINT —")) return;
      constraints++;
      const at = index + 1;
      const covered = invariantAnchors.some(
        (a) =>
          a.file === f &&
          at >= a.from - CONSTRAINT_SLACK &&
          at <= a.to + CONSTRAINT_SLACK,
      );
      if (!covered) uncovered.push(`${rel(f)}:${at}`);
    });
  }

  // 8. каждая пометка решения в коде описана в реестре степеней свободы
  // Ищется только в комментарии: те же слова встречаются внутри строк, которые
  // диагностика печатает пользователю, и решением проекта не являются.
  const DECISION_RE =
    /do not remove|by design|deliberat|intentional|on purpose/i;
  const inComment = (line, at) => {
    const before = line.slice(0, at);
    return before.includes("//") || /^\s*(\*|\/\*)/.test(line);
  };
  const undecided = [];
  let decisions = 0;
  for (const f of [...files, ...everyFile.filter((x) => x.endsWith(".scss"))]) {
    if (isTest(f)) continue;
    const body = readFileSync(f, "utf8").split(NEWLINE);
    body.forEach((line, index) => {
      const hit = DECISION_RE.exec(line);
      if (hit === null || !inComment(line, hit.index)) return;
      decisions++;
      const at = index + 1;
      const covered = decisionAnchors.some(
        (a) =>
          a.file === f &&
          at >= a.from - CONSTRAINT_SLACK &&
          at <= a.to + CONSTRAINT_SLACK,
      );
      if (!covered) undecided.push(`${rel(f)}:${at}`);
    });
  }

  // 1. каждый файл кода и каждый стиль упомянуты в карте
  // Ambient-объявления описывать нечем: в них нет ни поведения, ни связей.
  const code = [
    ...files.filter((f) => !isTest(f) && !f.endsWith(".d.ts")),
    ...everyFile.filter((f) => f.endsWith(".scss")),
  ];
  const missing = code.filter((f) => !mapMentions.has(f));
  console.log("=== Покрытие карты ===");
  console.log(
    `  файлов кода и стилей (без тестов): ${code.length}, не упомянуто: ${missing.length}`,
  );
  for (const f of missing) console.log("    " + rel(f));

  // 2. каждый тестовый файл назван в 08-tests.md — поимённо, папкой не зачесть
  const testFiles = files.filter(isTest);
  const unnamed = testFiles.filter((f) => !testMentions.has(f));
  console.log("=== Покрытие тестов ===");
  console.log(
    `  тестовых файлов: ${testFiles.length}, не названо: ${unnamed.length}`,
  );
  for (const f of unnamed) console.log("    " + rel(f));

  // 7. правила направления импортов держатся
  // Слой описан путём, запрет — либо путём (сверяется по графу), либо именем
  // пакета (сверяется по спецификатору как написан). Исключения перечислены
  // рядом с правилом: дыра, о которой известно, — это не то же, что дыра.
  const broken7 = [];
  for (const rule of rules) {
    const layer = (inside(rule.layer, null)?.hits ?? []).filter(
      (f) => !isTest(f),
    );
    const allowed = new Set(
      rule.allowed.flatMap((q) => inside(q, null)?.hits ?? []),
    );
    for (const banned of rule.banned) {
      const target = banned.includes("/")
        ? new Set(inside(banned, null)?.hits ?? [])
        : null;
      for (const f of layer) {
        if (target === null) {
          if (specsOf.get(f)?.has(banned))
            broken7.push(`${rel(f)} → ${banned}`);
          continue;
        }
        for (const dep of importsOf.get(f) ?? [])
          if (target.has(dep) && !allowed.has(dep))
            broken7.push(`${rel(f)} → ${rel(dep)}`);
      }
    }
  }
  console.log("=== Правила направления ===");
  console.log(`  правил: ${rules.length}, нарушено: ${broken7.length}`);
  for (const b of broken7) console.log("    " + b);

  console.log("=== Пометки CONSTRAINT ===");
  console.log(
    `  в коде: ${constraints}, без записи в 07-invariants: ${uncovered.length}`,
  );
  for (const u of uncovered) console.log("    " + u);
  console.log("=== Пометки решений ===");
  console.log(
    `  в коде: ${decisions}, без записи в 09-decisions: ${undecided.length}`,
  );
  for (const u of undecided) console.log("    " + u);

  console.log("=== Якоря ===");
  console.log(
    `  проверено: ${anchors}, из них с цитатой: ${cited}, битых: ${broken.length}`,
  );
  for (const b of broken) console.log("    " + b);
  console.log("=== Объявленный состав папок и радиусы ===");
  console.log(
    `  папок: ${dirs}, радиусов: ${radii}, разошлось: ${wrong.length}`,
  );
  for (const w of wrong) console.log("    " + w);
  if (unresolved.length) {
    console.log("=== Не разобрано (проверкой не покрыто) ===");
    for (const u of unresolved) console.log("    " + u);
  }

  if (
    missing.length ||
    unnamed.length ||
    uncovered.length ||
    undecided.length ||
    broken7.length ||
    broken.length ||
    wrong.length ||
    unresolved.length
  )
    process.exitCode = 1;
}
