import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// --- настройка -------------------------------------------------------------
// Единственное место, где проект задаёт свои пути и имена. Всё остальное в
// файле от проекта не зависит: инструмент переносится копированием, и правится
// в нём только этот блок.
const CONFIG = {
  /** Корень исходников, относительно папки базы. */
  src: "../src",
  /** Карта кода: каждый файл исходников обязан быть в ней назван. */
  map: "00-map.md",
  /** Реестр тестов: каждый тестовый файл обязан быть в нём назван. */
  tests: "08-tests.md",
  /** Каталог ограничений: адресат пометок CONSTRAINT из кода. */
  invariants: "07-invariants.md",
  /** Реестр решений: адресат пометок «сделано намеренно» из кода. */
  decisions: "09-decisions.md",
  /** Заголовок таблицы правил направления импортов, в любом файле базы. */
  rulesHeading: "Правила направления",
  /** Парные форки: папка и её копия. Копии НЕ обязаны совпадать байт в байт —
   * одиночной библиотеке и фасадной сборке нужны местами разные решения, и это
   * законное расхождение. Обязаны совпадать смысл, поведение и корректность:
   * найденный БАГ чинится в обеих. Отсюда и форма проверки — не сверка
   * содержимого, а напоминание в момент правки (режим `twins`). */
  forks: [
    {
      from: "shared/engines/motion",
      to: "shared/engines/kinetic/internal/motion",
    },
    {
      from: "shared/engines/gesture",
      to: "shared/engines/kinetic/internal/gesture",
    },
  ],
  /** Копия этого файла, уезжающая с полкой правил в новый проект. Обязана
   * совпадать байт в байт: разошедшийся инструмент проверяет не тот проект.
   * `null` — копии в проекте нет. */
  toolCopy: "../src/shared/context/tools/graph.mjs",
  // Отложенное: закрытый пункт отсюда удаляют, а не помечают.
  todo: "02-todo.md",
};

const ROOT = path.join(HERE, CONFIG.src).split(path.sep).join("/");

const norm = (f) => f.split(path.sep).join("/").replace(/[/]+$/, "");

const files = [];
// Документация лежит рядом с кодом и адресуется из него якорями `// See`,
// поэтому собирается тем же обходом.
const docFiles = [];
// Стили в граф импортов не входят — их подключает сборщик, а не разбор, —
// но адрес у них такой же, и досье обязано о них отвечать.
const styleFiles = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const full = norm(path.join(dir, e));
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.tsx?$/.test(e)) files.push(full);
    else if (/\.md$/.test(e)) docFiles.push(full);
    else if (/\.scss$/.test(e)) styleFiles.push(full);
  }
})(ROOT);

const isTest = (f) => /\/tests\//.test(f) || /\.test\.tsx?$/.test(f);

// Ссылка на документацию — любой путь `*.md`, названный в КОММЕНТАРИИ. Форма
// у неё разная и это нормально: и отдельная строка `// See docs/x.md`, и
// оговорка в середине фразы «(see docs/x.md)». Проверять надо ссылку, а не
// её оформление, иначе половина остаётся без присмотра.
// Голое имя без слэша — продолжение фразы, а не путь: одноимённых документов
// в проекте бывает несколько, и разрешать такое имя значило бы гадать.
// Проверяются пути; проза остаётся прозой.
const docRefsIn = (body) => {
  const out = [];
  for (const line of body.split(String.fromCharCode(10))) {
    if (!/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
    for (const t of line.match(/[\w./-]+\.md/g) ?? [])
      if (t.includes("/")) out.push(t);
  }
  return out;
};

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
const namesPulledBy = new Map(); // файл -> имена, которые он сам тянет откуда угодно

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
    if (!namesPulledBy.has(f)) namesPulledBy.set(f, new Set());
    const mine = namesPulledBy.get(f);
    if (clause.includes("*")) {
      (set.add("*"), mine.add("*"));
      continue;
    }
    const braces = clause.match(/\{([\s\S]*)\}/);
    if (braces) {
      for (let part of braces[1].split(",")) {
        part = part.trim().replace(/^type\s+/, "");
        if (!part) continue;
        const name = part.split(/\s+as\s+/)[0].trim();
        if (NAME_RE.test(name)) (set.add(name), mine.add(name));
      }
    }
    const def = clause
      .replace(/\{[\s\S]*\}/, "")
      .replace(/^type\s+/, "")
      .split(",")[0]
      .trim();
    if (def && NAME_RE.test(def)) (set.add("default"), mine.add("default"));
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
  // С аргументом — радиус одного адреса: кто именно от него зависит. Без
  // аргумента — весь список по убыванию. Раньше аргумент молча игнорировался,
  // и документированная команда `blast <путь>` печатала общий список: ответ на
  // не тот вопрос, поданный как ответ на заданный.
  const arg = process.argv[3];
  const rows = [];
  for (const f of files) {
    if (isTest(f)) continue;
    if (arg && !rel(f).includes(arg)) continue;
    const users = [...(importedBy.get(f) ?? [])].filter((u) => !isTest(u));
    rows.push([rel(f), users.length, users.map(rel).sort()]);
  }
  rows.sort((a, b) => b[1] - a[1]);
  if (arg && rows.length === 0) {
    console.log(`Ничего не нашлось по ${arg}.`);
    process.exitCode = 1;
  } else if (arg) {
    console.log(`=== Радиус поражения: ${arg} ===\n`);
    for (const [f, n, users] of rows) {
      console.log(`${String(n).padStart(3)}  ${f}`);
      if (n > 0) console.log(`      ${users.join("\n      ")}`);
    }
  } else {
    console.log("=== Радиус поражения: не-тестовых импортёров на файл ===\n");
    for (const [f, n, users] of rows.slice(0, 30)) {
      console.log(`${String(n).padStart(3)}  ${f}`);
      if (n <= 6) console.log(`      ${users.join("\n      ")}`);
    }
    console.log("\n--- файлы, которые не импортирует никто (кроме тестов) ---");
    for (const [f, n] of rows) if (n === 0) console.log(`     ${f}`);
  }
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
    // README базы описывает ФОРМЫ записи, а не находки. Сканер, читающий
    // собственную инструкцию, каждый прогон показывает фантом — и приучает не
    // читать секцию.
    const base = readdirSync(BASE).filter(
      (n) => n.endsWith(".md") && n !== "README.md",
    );
    for (const name of base) {
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
  // На обоих языках, по той же причине, что и остальные сканеры маркеров.
  scan("Записано «не закреплено»", (line) =>
    /не закреплен|Чего в слое не|Чего не закреплено|not covered|no test for/i.test(
      line,
    ),
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
  // Документация про файл есть, а сам файл на неё не ссылается: «почему»
  // существует, но при чтении кода его не видно. Это список работ, а не
  // приговор — поэтому здесь, а не в `verify`: совпадение по имени бывает
  // случайным, и превращать его в красный прогон значило бы завести
  // проверку, которая врёт.
  const surface = (f) => /\/index\.tsx?$/.test(f) || /types\.tsx?$/.test(f);
  const docBodies = docFiles
    .filter((d) => !d.includes("/context/"))
    .map((d) => [rel(d), readFileSync(d, "utf8")]);
  const unanchored = [];
  for (const f of files) {
    if (isTest(f) || surface(f)) continue;
    if (docRefsIn(readFileSync(f, "utf8")).length) continue;
    const base = f.slice(f.lastIndexOf("/") + 1);
    // Документация называет файл и с расширением, и без него — README полок
    // Имя без расширения засчитывается, только если документация называет его
    // КАК КОД, в обратных кавычках: голое слово вроде resolve встречается в
    // прозе трёх десятков документов и топит сигнал.
    const bare = base.replace(/[.](tsx?|scss)$/, "");
    const asCode = "`" + bare + "`";
    const named = docBodies.filter(
      ([, body]) => body.includes(base) || body.includes(asCode),
    );
    if (named.length) unanchored.push([rel(f), named.map(([d]) => d)]);
  }
  console.log("=== Документация есть, якоря `// See` в коде нет ===");
  for (const [f, docs] of unanchored)
    console.log(`  ${f}${NEWLINE}      → ${docs.join(", ")}`);
  console.log(`  всего: ${unanchored.length}`);

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
// Правка в одной копии из пары — единственный настоящий риск форков, и он
// виден только в диффе, а не в дереве: файлы законно расходятся там, где
/** Пути, тронутые текущей правкой: изменённые И новые, ещё не добавленные.
 * `git diff` вторых не видит, а новый тест — обычный способ закрыть правку. */
const changedPaths = async (repoRoot) => {
  try {
    const { execSync } = await import("node:child_process");
    // `-uall`: без него новая ПАПКА печатается одной строкой, и файлы
    // внутри неё в правку не попадают — ровно новый тест целиком.
    return (
      execSync("git status --porcelain -uall", {
        cwd: repoRoot,
        encoding: "utf8",
        // stderr гасим: про недоступность git режим говорит сам.
        stdio: ["ignore", "pipe", "ignore"],
      })
        .split(String.fromCharCode(10))
        .map((l) => l.slice(3).trim())
        .filter(Boolean)
        // Переименование печатается как "было -> стало": берут второе.
        .map((l) => (l.includes(" -> ") ? l.slice(l.indexOf(" -> ") + 4) : l))
        .map((l) => l.replace(/^"|"$/g, ""))
    );
  } catch {
    return null;
  }
};

// одиночной библиотеке и фасаду нужно по-разному. Поэтому не сверка
// содержимого, а вопрос в нужный момент: тронул одну копию — вот её близнец.
if (mode === "twins") {
  const NEWLINE = String.fromCharCode(10);
  let changed = process.argv.slice(3);
  if (changed.length === 0) {
    changed = await changedPaths(path.join(HERE, ".."));
    if (changed === null) {
      console.log(
        "git недоступен — передай пути аргументами: graph.mjs twins <путь> …",
      );
      process.exitCode = 1;
    }
  }
  if (changed !== null) {
    const srcPrefix = norm(path.relative(path.join(HERE, ".."), ROOT)) + "/";
    const touched = new Set(
      changed
        .map(norm)
        .filter((f) => f.startsWith(srcPrefix))
        .map((f) => f.slice(srcPrefix.length)),
    );
    const lonely = [];
    let inPairs = 0;
    for (const f of touched) {
      for (const pair of CONFIG.forks) {
        const a = pair.from + "/";
        const b = pair.to + "/";
        const twin = f.startsWith(a)
          ? b + f.slice(a.length)
          : f.startsWith(b)
            ? a + f.slice(b.length)
            : null;
        if (twin === null) continue;
        inPairs++;
        if (!touched.has(twin)) lonely.push([f, twin]);
      }
    }
    console.log("=== Правки внутри парных форков ===");
    console.log(
      `  тронуто файлов в парах: ${inPairs}, без пары в этой же правке: ${lonely.length}`,
    );
    for (const [f, twin] of lonely)
      console.log(`    ${f}${NEWLINE}      → близнец не тронут: ${twin}`);
    if (lonely.length === 0 && inPairs > 0)
      console.log("  обе копии каждой пары в правке — ок");
    if (inPairs === 0) console.log("  правка форков не касается");
    console.log(
      NEWLINE +
        "  Расхождение само по себе не дефект: одиночной библиотеке и фасаду" +
        NEWLINE +
        "  местами нужно по-разному. Дефект — БАГ, починенный в одной копии.",
    );
  }
}

// Код и его тесты — одна правка, а не две. Сверять содержимое бессмысленно:
// не всякая правка кода обязана менять тест (переименованный комментарий, снятая
// мёртвая ветка). Поэтому здесь не приговор, а вопрос в нужный момент: вот
// файлы, которые ты тронул, вот тесты, которые их гоняют, и вот те из них, что
// в эту правку не попали. Решение — за тобой; молча пройти мимо — нет.
if (mode === "tested") {
  const NEWLINE = String.fromCharCode(10);
  let changed = process.argv.slice(3);
  if (changed.length === 0) {
    changed = await changedPaths(path.join(HERE, ".."));
    if (changed === null) {
      console.log(
        "git недоступен — передай пути аргументами: graph.mjs tested <путь> …",
      );
      process.exitCode = 1;
    }
  }
  if (changed !== null) {
    const repoRoot = path.join(HERE, "..");
    const abs = (f) => norm(path.join(repoRoot, f));
    const touched = new Set(changed.map(abs));
    const touchedCode = [...touched].filter(
      (f) => files.includes(f) && !isTest(f) && !f.endsWith(".d.ts"),
    );

    const naked = [];
    const stale = [];
    let covered = 0;
    for (const f of touchedCode) {
      const tests = files.filter(
        (t) => isTest(t) && (importsOf.get(t) ?? new Set()).has(f),
      );
      if (tests.length === 0) {
        naked.push(rel(f));
        continue;
      }
      if (tests.some((t) => touched.has(t))) covered++;
      else stale.push([rel(f), tests.map(rel).sort()]);
    }

    console.log("=== Код и тесты в одной правке ===");
    console.log(
      `  тронуто файлов кода: ${touchedCode.length}, из них с тестами в этой же правке: ${covered}`,
    );
    if (touchedCode.length === 0) console.log("  правка кода не касается");

    if (stale.length) {
      console.log(NEWLINE + "  Тесты есть, но в правку не попали:");
      for (const [f, tests] of stale)
        console.log(
          `    ${f}${NEWLINE}      ${tests.join(NEWLINE + "      ")}`,
        );
      console.log(
        NEWLINE +
          "  Открой каждый и ответь: он всё ещё проверяет то, что называет," +
          NEWLINE +
          "  и он всё ещё умеет падать на новом коде? Нашёл слабый — чинится" +
          NEWLINE +
          "  здесь же, а не записывается.",
      );
    }
    if (naked.length) {
      console.log(
        NEWLINE + "  ВНИМАНИЕ: тронуто, и ни один тест на это не смотрит:",
      );
      for (const f of naked) console.log("    " + f);
      console.log(
        NEWLINE +
          "  Новая ветка логики закрывается тестом в том же заходе. Если" +
          NEWLINE +
          "  закрывать нечем — причина называется вслух, а не умалчивается.",
      );
    }
    if (touchedCode.length && !stale.length && !naked.length)
      console.log("  каждый тронутый файл правился вместе со своими тестами");

    // Якорь съезжает ровно от одного — вставки или удаления строк ВЫШЕ него,
    // то есть от правки того самого файла. Значит сверять его надо не всегда,
    // а именно сейчас. Якорь с цитатой чинит себя сам (`verify`), без цитаты —
    // только глазами, и вот их список. Приговора нет намеренно: правка ниже
    // якоря его не двигает, и падать на этом значило бы врать через раз.
    const ANCHOR = /`([\w./{}-]*):(\d+)(?:-\d+)?`(\s*`[^`]+`)?/g;
    const bySuffix = (q) => {
      const hits = files.filter((f) => f === q || f.endsWith("/" + q));
      return hits.length === 1 ? hits[0] : null;
    };
    const atRisk = [];
    for (const name of readdirSync(HERE).filter((n) => n.endsWith(".md"))) {
      let current = null;
      for (const line of readFileSync(path.join(HERE, name), "utf8").split(
        NEWLINE,
      )) {
        // Заголовок раздела карты задаёт файл для относительных якорей.
        const head = /^#{2,}\s+`([^`]+)`/.exec(line);
        if (head) current = bySuffix(head[1].replace(/^.*?([\w./-]+)$/, "$1"));
        ANCHOR.lastIndex = 0;
        let m;
        while ((m = ANCHOR.exec(line)) !== null) {
          if (m[3]) continue; // цитата есть — `verify` держит его сам
          const file = m[1] === "" ? current : bySuffix(m[1]);
          if (file === null || !touched.has(file)) continue;
          atRisk.push(`${name}: ${m[0]} → ${rel(file)}`);
        }
      }
    }
    if (atRisk.length) {
      console.log(
        NEWLINE +
          "  Якоря без цитаты в файлы этой правки — сверить номера глазами:",
      );
      for (const a of atRisk) console.log("    " + a);
      console.log(
        NEWLINE +
          "  Строки выше якоря сдвинулись — номер съехал молча. Сверил —" +
          NEWLINE +
          "  допиши цитату, чтобы дальше он чинился сам.",
      );
    }
  }
}

// Объём файлов — по запросу. В базе этих чисел нет намеренно: строка меняется
// от любой правки, и записанный объём превращает каждый коммит в правку базы.
// Досье на файл или папку: всё, что известно про этот адрес, собранное из
// графа и из базы разом. Существует потому, что база организована ПО ТЕМАМ, а
// задача всегда приходит ПО АДРЕСУ: без этой сборки знание об одном файле
// приходится обходить по девяти файлам базы вручную.
if (mode === "brief") {
  const NEWLINE = String.fromCharCode(10);
  const TICK = String.fromCharCode(96);
  const arg = process.argv[3];
  if (!arg) {
    console.log(
      "Укажи путь: node .context/graph.mjs brief <путь или его хвост>",
    );
    process.exitCode = 1;
  } else {
    // Не-тестовые впереди: спрашивают обычно про сам файл, а его тест
    // попадает в выборку по имени и оттесняет ответ вниз.
    const hits = [...files, ...styleFiles]
      .filter((f) => rel(f).includes(arg))
      .sort((x, y) => Number(isTest(x)) - Number(isTest(y)));
    if (hits.length === 0) {
      console.log(`Ничего не нашлось по ${TICK}${arg}${TICK}.`);
      process.exitCode = 1;
    } else {
      // Обратная достижимость: какой тест дотягивается до файла по графу, а
      // не по совпадению имён. Имена врут — `useTrackBinding` закрыт
      // `trackBinding.test.tsx`.
      const reach = new Map();
      for (const t of files.filter(isTest)) {
        const seen = new Set();
        const stack = [t];
        while (stack.length > 0) {
          for (const d of importsOf.get(stack.pop()) ?? []) {
            if (seen.has(d)) continue;
            seen.add(d);
            stack.push(d);
          }
        }
        for (const d of seen) {
          if (!reach.has(d)) reach.set(d, []);
          reach.get(d).push(t);
        }
      }

      // Строки базы, где адрес назван в обратных кавычках, — это её
      // собственный формат записи, поэтому попадание точное.
      const BASE_LINES = [];
      // Документация отвечает на другой вопрос, чем база: не «что и где», а
      // «почему так». Для рефактора это половина, без которой ломают
      // концепцию, ничего не нарушив формально.
      const DOC_LINES = [];
      for (const d of docFiles) {
        const body = readFileSync(d, "utf8").split(NEWLINE);
        body.forEach((line, i) => DOC_LINES.push([rel(d), i + 1, line]));
      }
      for (const name of readdirSync(HERE).filter((n) => n.endsWith(".md"))) {
        const body = readFileSync(path.join(HERE, name), "utf8").split(NEWLINE);
        body.forEach((line, i) => BASE_LINES.push([name, i + 1, line]));
      }
      const quoted = (line) =>
        line
          .split(TICK)
          .filter((_, i) => i % 2 === 1)
          .flatMap((t) => t.split(",").map((x) => x.trim()));

      for (const target of hits.slice(0, 12)) {
        const r = rel(target);
        const base = r.slice(r.lastIndexOf("/") + 1);
        const bare = base.replace(/\.(tsx?|scss)$/, "");
        console.log(`${NEWLINE}=== ${r} ===`);

        const down = [...(importsOf.get(target) ?? [])].map(rel).sort();
        // У теста спрашивать «что его накрывает» бессмысленно: он и есть
        // проверка. Тревога «его не гоняет ни один тест» на тестовом файле —
        // не предупреждение, а шум, который учит не читать эту строку.
        if (isTest(target)) {
          console.log("--- лежит среди тестов ---");
          console.log(
            "  вопрос «что его накрывает» тут не задают: что он гоняет — секция импортов выше, что закрепляет — записи базы ниже",
          );
        } else if (r.endsWith(".scss")) {
          const base = r.slice(r.lastIndexOf("/") + 1);
          // По тексту, а не по разобранным спецификаторам: стиль часто
          // подключают побочным импортом `import "./x.scss";` без `from`, и
          // разбор импортов такие строки не видит вовсе.
          const needle = "/" + base;
          const users = files.filter(
            (f) => !isTest(f) && readFileSync(f, "utf8").includes(needle),
          );
          console.log("--- подключают (модули, называющие путь в импорте) ---");
          console.log(
            users.length
              ? "  " +
                  users
                    .map(rel)
                    .sort()
                    .join(NEWLINE + "  ")
              : "  никто — стиль не подключён ни из одного модуля",
          );
          const named = files.filter(
            (f) => isTest(f) && readFileSync(f, "utf8").includes(base),
          );
          console.log("--- тесты, называющие файл (читают его текстом) ---");
          console.log(
            named.length
              ? "  " +
                  named
                    .map(rel)
                    .sort()
                    .join(NEWLINE + "  ")
              : "  ВНИМАНИЕ: ни один тест на него не смотрит",
          );
        } else {
          console.log(
            "--- импортирует (что надо понять, чтобы понять его) ---",
          );
          console.log(
            down.length ? "  " + down.join(NEWLINE + "  ") : "  ничего своего",
          );

          const up = files.filter((f) =>
            (importsOf.get(f) ?? new Set()).has(target),
          );
          const upCode = up
            .filter((f) => !isTest(f))
            .map(rel)
            .sort();
          console.log("--- импортируют (радиус поражения) ---");
          console.log(
            upCode.length
              ? "  " + upCode.join(NEWLINE + "  ")
              : "  никто — ни один файл проекта его не импортирует",
          );

          // Три РАЗНЫХ ответа, и путать их нельзя.
          // Напрямую — тест сам назвал файл. Через бочку — тест взял имя из
          // `index.ts`, а бочка это реэкспорт, а не потребитель: такой тест
          // файл всё-таки гоняет. Транзитивно — тест дотянулся через обычные
          // модули, и это почти всегда не про него.
          const all = reach.get(target) ?? [];
          // Средний уровень считается ПО ИМЕНАМ, а не по форме пути. Тест,
          // взявший `useImageResourceStore` из бочки слоя, гоняет файл, который
          // это имя определяет; тест, взявший из той же бочки соседнее имя, —
          // нет. Ни «только прямой импорт», ни «сквозь любую бочку» этого не
          // различают: первое врёт вниз, второе вверх.
          const exported = exportsOf.get(target) ?? new Set();
          const direct = all.filter((t) =>
            (importsOf.get(t) ?? new Set()).has(target),
          );
          const byName = all.filter(
            (t) =>
              !direct.includes(t) &&
              [...(namesPulledBy.get(t) ?? [])].some((n) => exported.has(n)),
          );
          console.log("--- тесты, называющие файл сами ---");
          console.log(
            direct.length
              ? "  " +
                  direct
                    .map(rel)
                    .sort()
                    .join(NEWLINE + "  ")
              : "  нет",
          );
          console.log(
            "--- тесты, тянущие его экспорты через бочку (тоже гоняют) ---",
          );
          console.log(
            byName.length
              ? "  " +
                  byName
                    .map(rel)
                    .sort()
                    .join(NEWLINE + "  ")
              : "  нет",
          );
          // Тревога поднимается, только когда пусты ВСЕ три уровня. Если файл
          // достают транзитивно, тест на него может существовать и гонять его
          // через композицию — так закрыт BrowserChromeSync через ThemeProvider.
          // Кричать «не гоняет никто» в этом случае значит врать.
          const rest = all.length - direct.length - byName.length;
          if (direct.length + byName.length === 0)
            console.log(
              rest === 0
                ? "  ВНИМАНИЕ: файл не гоняет ни один тест — правку проверять руками"
                : "  напрямую никто; проверь, гоняют ли его те, кто дотягивается ниже",
            );
          console.log(
            `--- дотягиваются транзитивно, через обычные модули: ${
              all.length - direct.length - byName.length
            } ---`,
          );
        }

        // Голое имя засчитывается, только если оно в проекте одно. `index.ts`
        // носят сорок один файл, `types.ts` — двадцать: принять такое совпадение
        // значит залить раздел, подписанный «точно», строками про чужие бочки.
        const uniqueBase =
          [...files, ...styleFiles].filter((f) => rel(f).endsWith("/" + base))
            .length === 1;
        const dir = r.slice(0, r.lastIndexOf("/"));
        // Голое `index.ts` носит сорок один файл, поэтому само по себе оно не
        // точное. Но если та же строка называет соседа по папке — `### `slots/
        // slotNames.ts` + `index.ts`` — то речь именно об этой бочке, и строка
        // засчитывается: контекст строки снимает неоднозначность имени.
        const namesSibling = (line) =>
          quoted(line).some(
            (t) =>
              t.includes("/") &&
              /[.](tsx?|scss)$/.test(t) &&
              dir.endsWith(t.slice(0, t.lastIndexOf("/"))),
          );
        const exact = BASE_LINES.filter(([, , line]) =>
          quoted(line).some(
            (t) =>
              t === r ||
              (t.includes("/") && r.endsWith("/" + t)) ||
              (t === base && (uniqueBase || namesSibling(line))),
          ),
        );
        // Строка, которая в кавычках называет ДРУГОЙ существующий файл, — про
        // него, а не про этот: иначе короткое имя вроде `Diagnostic` собирает
        // весь модуль и топит настоящие попадания.
        const namesOther = (line) =>
          quoted(line).some(
            (t) =>
              /[.](tsx?|scss)$/.test(t) &&
              t !== base &&
              !r.endsWith("/" + t) &&
              files.some((f) => rel(f) === t || rel(f).endsWith("/" + t)),
          );
        const loose = BASE_LINES.filter(
          ([, , line]) =>
            line.includes(bare) &&
            !exact.some((e) => e[2] === line) &&
            !namesOther(line),
        );
        console.log("--- записи базы: назван путём (точно) ---");
        for (const [n, i, line] of exact.slice(0, 40))
          console.log(`  ${n}:${i}  ${line.trim().slice(0, 110)}`);
        if (!exact.length) console.log("  нет");
        console.log(
          "--- записи базы: упомянут по имени (может промахнуться) ---",
        );
        for (const [n, i, line] of loose.slice(0, 20))
          console.log(`  ${n}:${i}  ${line.trim().slice(0, 110)}`);
        if (!loose.length) console.log("  нет");

        // Якорь в самом файле — точная ссылка, написанная его же автором.
        // Тем же помощником, что и проверка: два сканера одного и того же с
        // разными правилами — это гарантия однажды разойтись. Досье молчало про
        // документ у useOrientationSwapVeil, потому что тот пишет ссылку в
        // середине фразы, а не отдельной строкой.
        const anchors = [...new Set(docRefsIn(readFileSync(target, "utf8")))];
        console.log("--- документация: на что ссылается сам файл ---");
        console.log(
          anchors.length
            ? "  " + anchors.join(NEWLINE + "  ")
            : isTest(target)
              ? "  якоря нет, и не нужен: «почему» у теста — блок в его шапке (2 файла из 117 ссылаются на доки)"
              : "  якоря нет — «почему» этого файла нигде не объявлено",
        );

        const docHits = DOC_LINES.filter(([, , line]) =>
          quoted(line).some(
            (t) => t === r || r.endsWith("/" + t) || t === base || t === bare,
          ),
        );
        console.log("--- документация: где он назван ---");
        for (const [n, i, line] of docHits.slice(0, 20))
          console.log(`  ${n}:${i}  ${line.trim().slice(0, 110)}`);
        if (!docHits.length) console.log("  нет");
      }
      if (hits.length > 12)
        console.log(
          `${NEWLINE}...и ещё ${hits.length - 12} файлов подходит под запрос.`,
        );
    }
  }
}

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
  const MAP = CONFIG.map;
  const TESTS = CONFIG.tests;
  const NEWLINE = String.fromCharCode(10);
  const CR_LF = String.fromCharCode(13) + NEWLINE;
  const REPO = path.join(BASE, "..");

  const bare = (q) => q.replace(/[*]+$/, "").replace(/[/]+$/, "");

  // Пути в базе сокращены и лежат на разной глубине: разрешаются по префиксу
  // раздела, затем по однозначному суффиксу.
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
  //
  // Цитата есть у единиц, а номер съезжает у всех. Поэтому у якоря без цитаты
  // проверяется то немногое, что проверить можно: строка, на которую он
  // указывает, обязана быть содержательной. Якорь ставят на объявление, а не
  // на закрывающую скобку и не на пустоту — если он туда попал, он съехал.
  // Только для кода: в прозе пустая строка внутри диапазона законна.
  const JUNK_ANCHOR = /^\s*(?:[)\]}]+[;,]?|\{|,|)\s*$/;
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
  const RULES_HEAD = new RegExp("^#+.*" + CONFIG.rulesHeading);
  const ROW_RE = /^\|(.+)\|(.+)\|(.*)\|\s*$/;
  const cellPaths = (cell) => [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
  const rules = [];

  for (const name of readdirSync(BASE)) {
    // README базы описывает ФОРМЫ записи и приводит примеры: якорь с номером,
    // объём папки, радиус. Разбирать их как заявления значит ловить собственную
    // инструкцию — ровно это и случилось, когда пример `:120` в контракте
    // покраснел как битый якорь. Инструкция не факт о проекте.
    if (!name.endsWith(".md") || name === "README.md") continue;
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
        const body = readFileSync(file, "utf8").split(NEWLINE);
        const lines = body.length;
        const last = Number(numbers[numbers.length - 1]);
        if (last > lines)
          broken.push(`${name}: ${span} — в файле ${lines} строк`);
        else if (
          !file.endsWith(".md") &&
          JUNK_ANCHOR.test(body[Number(numbers[0]) - 1] ?? "")
        )
          broken.push(`${name}: ${span} — там скобка или пусто, якорь съехал`);
        if (name === CONFIG.invariants)
          invariantAnchors.push({ file, from: Number(numbers[0]), to: last });
        if (name === CONFIG.decisions)
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
  // формулировка ограничения живёт в каталоге ограничений, а не в комментарии.
  const CONSTRAINT_SLACK = 8;
  const uncovered = [];
  let constraints = 0;
  for (const f of files) {
    if (isTest(f)) continue;
    const body = readFileSync(f, "utf8").split(NEWLINE);
    body.forEach((line, index) => {
      // Тот же принцип, что у пометок решений: маркер узнаётся на обоих
      // языках, чтобы перевод проекта не выключил проверку молча.
      if (!/(CONSTRAINT|ОГРАНИЧЕНИЕ)\s+—/.test(line)) return;
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
  // Пометка решения узнаётся НА ОБОИХ ЯЗЫКАХ. Проект сегодня двуязычен по
  // расположению (код английский, база русская), а завтра может переехать
  // целиком в одну сторону. Сканер, знающий одну сторону, в этот день
  // замолчит и пройдёт зелёным — то есть соврёт ровно там, где его читают
  // как гарантию.
  const DECISION_RE =
    /do not remove|by design|deliberat|intentional|on purpose|не удалять|намеренно|осознанно|по замыслу|нарочно/i;
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
    `  в коде: ${constraints}, без записи в ${CONFIG.invariants}: ${uncovered.length}`,
  );
  for (const u of uncovered) console.log("    " + u);
  console.log("=== Пометки решений ===");
  console.log(
    `  в коде: ${decisions}, без записи в ${CONFIG.decisions}: ${undecided.length}`,
  );
  for (const u of undecided) console.log("    " + u);

  console.log("=== Якоря ===");
  console.log(
    `  проверено: ${anchors}, из них с цитатой: ${cited}, битых: ${broken.length}`,
  );
  for (const b of broken) console.log("    " + b);
  // 9. копия инструмента совпадает с рабочим файлом
  const toolDrift = [];
  if (CONFIG.toolCopy !== null) {
    const copy = path.join(HERE, CONFIG.toolCopy);
    const flat = (f) => readFileSync(f, "utf8").split(CR_LF).join(NEWLINE);
    if (!existsSync(copy)) toolDrift.push(`копии нет: ${CONFIG.toolCopy}`);
    else if (flat(copy) !== flat(fileURLToPath(import.meta.url)))
      toolDrift.push(`копия разошлась: ${CONFIG.toolCopy}`);
  }
  console.log("=== Копия инструмента ===");
  console.log(
    CONFIG.toolCopy === null
      ? "  копия не заявлена"
      : `  расхождений: ${toolDrift.length}`,
  );
  for (const t of toolDrift) console.log("    " + t);

  // 10. якорь на документацию в коде указывает на существующий файл
  // Ссылки собирает общий помощник docRefsIn (см. его шапку).
  const deadAnchors = [];
  let anchorCount = 0;
  for (const f of files) {
    const body = readFileSync(f, "utf8");
    const specs = docRefsIn(body);
    for (const spec of specs) {
      anchorCount++;
      // Якорь пишут относительно файла (`./README.md`), относительно корня
      // компонента (`docs/architecture/x.md`) или корня исходников
      // (`shared/engines/motion/README.md`). Поэтому пробуются все предки.
      let dir = norm(path.dirname(f));
      let found = false;
      while (dir.length >= ROOT.length) {
        if (docFiles.includes(norm(path.join(dir, spec)))) {
          found = true;
          break;
        }
        const up = norm(path.dirname(dir));
        if (up === dir) break;
        dir = up;
      }
      if (found) continue;
      deadAnchors.push(`${rel(f)} → ${spec}`);
    }
  }
  console.log("=== Якоря на документацию в коде ===");
  console.log(
    `  проверено: ${anchorCount}, ведут в никуда: ${deadAnchors.length}`,
  );
  for (const a of deadAnchors) console.log("    " + a);

  // 11. отложенное не превращается в историю
  // Правило написано дважды — в шапке самого файла и в CLAUDE.md — и всё равно
  // нарушается: пометить пункт дешевле, чем удалить. Ловится маркер статуса,
  // а не слово: капсом в любом месте заголовка, либо в его хвосте после тире
  // или в скобках. «Закрыть доступность» — законный открытый пункт, и он не
  // должен ловиться.
  const closedTodos = [];
  if (CONFIG.todo !== null) {
    const todoPath = path.join(BASE, CONFIG.todo);
    if (!existsSync(todoPath)) closedTodos.push(`файла нет: ${CONFIG.todo}`);
    else {
      const shouting = /(ЗАКРЫТО|СДЕЛАНО|ГОТОВО|ВЫПОЛНЕНО|DONE|CLOSED)/;
      const trailing = /[—\-(]\s*(закрыт|сделан|готов|выполнен)\S*\s*\)?\s*$/i;
      const struck = /^~~.*~~$/;
      for (const line of readFileSync(todoPath, "utf8").split(NEWLINE)) {
        if (!/^#{2,}\s/.test(line)) continue;
        const title = line.replace(/^#{2,}\s+/, "").trim();
        if (shouting.test(title) || trailing.test(title) || struck.test(title))
          closedTodos.push(`${CONFIG.todo}: ${title}`);
      }
    }
  }
  // 12. новый якорь пишется с цитатой
  // Старые не переписываем: их 185, и переписывание ради переписывания —
  // работа без адресата. Но каждый НОВЫЙ обязан нести цитату, иначе доля
  // проверяемых по существу не растёт никогда. Проверяется по строкам,
  // ДОБАВЛЕННЫМ этой правкой: старые записи под правило не попадают, а мимо
  // новой пройти нельзя. Без git сверка молчит и говорит об этом вслух.
  const uncitedNew = [];
  let newAnchorsChecked = true;
  {
    const NEW_ANCHOR = /`([\w./{}-]*):(\d+)(?:-\d+)?`/g;
    let diff = null;
    try {
      const { execSync } = await import("node:child_process");
      diff = execSync("git diff -U0 HEAD -- .context", {
        cwd: REPO,
        encoding: "utf8",
        // stderr гасим: про недоступность git мы говорим сами, а его
        // собственное сообщение — шум в отчёте инструмента.
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      newAnchorsChecked = false;
    }
    if (diff !== null) {
      let file = "";
      for (const line of diff.split(NEWLINE)) {
        if (line.startsWith("+++ b/")) {
          file = line.slice(6);
          continue;
        }
        if (!line.startsWith("+") || line.startsWith("+++")) continue;
        const body = line.slice(1);
        NEW_ANCHOR.lastIndex = 0;
        let m;
        while ((m = NEW_ANCHOR.exec(body)) !== null) {
          // Цитата — бэктик-фрагмент сразу за якорем, на той же строке.
          if (!/^\s*`[^`]+`/.test(body.slice(m.index + m[0].length)))
            uncitedNew.push(`${file}: ${m[0]} — якорь без цитаты`);
        }
      }
    }
  }
  console.log("=== Новые якоря — с цитатой ===");
  console.log(
    newAnchorsChecked
      ? `  добавлено якорей без цитаты: ${uncitedNew.length}`
      : "  git недоступен — не проверено",
  );
  for (const u of uncitedNew) console.log("    " + u);

  // 13. найденное чинится, а не записывается
  // Правило в CLAUDE.md, § «Найденное чинится сразу». Ловятся две формы
  // откладывания — обе объективные, без угадывания намерений:
  //
  //   а) маркер отложенной работы в самом коде (`TODO`, `FIXME`, `HACK`,
  //      `XXX`, `ВРЕМЕННО`, `ПОТОМ`, `ПОЧИНИТЬ`). В этом проекте их ноль, и
  //      это не случайность: находка либо исправлена, либо описана решением;
  //   б) абзац базы знаний, где рядом стоят слово о дефекте и слово об
  //      откладывании, но нет ссылки на файл решений. Два слова в одном
  //      абзаце — намного тише одного: «отложенный тик» и «вынесено в
  //      функцию» встречаются в описаниях сплошь и рядом, а вот «дыра ...
  //      отложена» без решения — ровно то, что правило запрещает.
  //
  // Что проверка НЕ ловит: молчание. Находку, которую просто не записали,
  // машина увидеть не может — это остаётся на ревью и на честности отчёта.
  const parked = [];
  {
    const CODE_MARK =
      /(^|[^A-Za-zА-Яа-я])(TODO|FIXME|HACK|XXX|ВРЕМЕННО|ПОТОМ|ПОЧИНИТЬ)([^A-Za-zА-Яа-я]|$)/;
    for (const f of files) {
      const body = readFileSync(f, "utf8").split(NEWLINE);
      body.forEach((line, i) => {
        if (CODE_MARK.test(line))
          parked.push(`${rel(f)}:${i + 1} — маркер отложенной работы в коде`);
      });
    }

    const DEFECT =
      /(дыр[аеуы]|баг|ошибк|дефект|сломан|неверн|расходит|не соответств|мёртв|дубл|утечк|bug|defect|broken|wrong|leak)/i;
    const DEFER =
      /(не исправл|не почин|не стал[аио]? прав|оставлен[оа]? как есть|выходит за рамки|в задачу не входил|не входит в объ[её]м|вынесен[оа]? разработчику|отложен[оа]? до|записан[оа]? и не|deferred|out of scope|left as is)/i;
    const DECIDED = /09-decisions\.md/;
    const baseDocs = readdirSync(BASE).filter(
      (n) => n.endsWith(".md") && n !== "README.md",
    );
    for (const name of baseDocs) {
      const p = path.join(BASE, name);
      if (!existsSync(p)) continue;
      const text = readFileSync(p, "utf8").split(NEWLINE);
      let start = 0;
      const flush = (end) => {
        const para = text.slice(start, end).join(" ");
        if (DEFECT.test(para) && DEFER.test(para) && !DECIDED.test(para))
          parked.push(
            `${name}:${start + 1} — дефект отложен без записи решения`,
          );
      };
      text.forEach((line, i) => {
        if (line.trim() !== "") return;
        flush(i);
        start = i + 1;
      });
      flush(text.length);
    }
  }
  console.log("=== Найденное — исправлено, а не отложено ===");
  console.log(`  отложенного без решения: ${parked.length}`);
  for (const p of parked) console.log("    " + p);

  console.log("=== Отложенное без закрытых пунктов ===");
  console.log(
    CONFIG.todo === null
      ? "  файл отложенного не заявлен"
      : `  помечено закрытыми: ${closedTodos.length}`,
  );
  for (const t of closedTodos) console.log("    " + t);

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
    toolDrift.length ||
    deadAnchors.length ||
    closedTodos.length ||
    uncitedNew.length ||
    parked.length ||
    unresolved.length
  )
    process.exitCode = 1;
}
