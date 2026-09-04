import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
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
  /** Справочник режимов уезжает вместе с инструментом: без него новый проект
   * получает набор команд и ни слова о том, чего каждая НЕ делает. Пары
   * «рабочий файл → копия на полке», сверяются побайтово, как и сам инструмент.
   * Пустой список — сопровождающих файлов нет. */
  toolDocs: [["graph.md", "../src/shared/context/tools/graph.md"]],
  /** Список разрешений среды: проектный и шаблон на полке. Правила и инструмент
   * переносятся копированием, а среда — нет, и её расхождение платится не
   * красным прогоном, а часом простоя: длинная задача встаёт на запросе
   * подтверждения и ждёт человека, который отошёл. Сверяется **включение**, а
   * не равенство: проект вправе добавить своё, но не вправе потерять то, что
   * полка обещает следующему проекту. `null` — пары нет. */
  settingsPair: {
    project: "../.claude/settings.json",
    shelf: "../src/shared/context/settings.template.json",
  },
  /** Известные исключения к сверке путей в обратных кавычках: адрес, которого
   * на диске нет намеренно. Формат `<файл>|<токен>`, причина — строкой рядом.
   * Список короткий не случайно: разрастётся — значит проверка ловит не то, и
   * чинить надо её, а не пополнять список. */
  docPathExceptions: [
    // --- проектные: при посадке в новый проект удаляются -------------------
    // Иллюстрация того, во что нормализуются ссылки при сравнении форков.
    "00-map.md|../README.md",
    // Обе записи говорят, что бочка УДАЛЕНА, и называют её по имени.
    "01-facts.md|client/modules/index.ts",
    "03-graph.md|modules/index.ts",
    // --- полочные: едут вместе с полкой и удалять их нельзя ---------------
    // Образец формы якоря в объяснении, а не ссылка на файл. Строки описывают
    // файлы САМОЙ полки, поэтому в новом проекте они остаются нужны: без них
    // первый же verify краснеет на тексте, который приехал вместе с правилами.
    "README.md|docs/architecture/x.md",
    "shared/context/knowledge-base.md|docs/architecture/x.md",
  ],
  // Отложенное: закрытый пункт отсюда удаляют, а не помечают.
  todo: "02-todo.md",
  /** Полка правил: те же методы, что в `CLAUDE.md` проекта, но уезжающие в
   * следующий проект. Инструмент держит побайтовая сверка `toolCopy`, а текст
   * не держало ничто — и полка отстала молча в первый же заход, когда правило
   * добавили в проект. Сверяется не формулировка (полка пишет обобщённо), а
   * то, что **обе таблицы машинных сверок описывают одинаковое их число**:
   * завёл сверку — опиши в обеих, иначе следующий проект увезёт инструмент с
   * проверками, которых его база не знает. */
  checkTables: ["01-facts.md", "../src/shared/context/knowledge-base.md"],
  /** Корень полки правил: её трогают в той же правке, что и правила проекта. */
  rulesShelf: "../src/shared/context",
  /** Заголовок таблицы машинных сверок — один и тот же в обоих файлах. */
  checkTableHeading: "| Что сверяется | Как |",
  /** Разделы правил проекта против полки. Сверяется не текст и не совпадение
   * заголовков с шаблоном — шаблон обобщённый, и у проекта законно есть свои
   * разделы. Сверяется, что про КАЖДЫЙ раздел решение принято и записано: либо
   * назван его адрес на полке, либо он помечен проектным. Новый раздел без
   * строки в таблице роняет прогон — и это единственный момент, когда вопрос
   * «а на полку это едет?» ещё дёшево задать. `null` — таблицы нет. */
  rulesManifest: {
    /** Правила живут не в одном файле: доктрина в корне, локальное — вложенными
     * `CLAUDE.md` в своих папках, где оно грузится само и пропустить его нельзя.
     * Список заявлен здесь, потому что «сколько у нас файлов правил» — тот же
     * вопрос, что «сколько сверок»: пока он не записан, ответа нет. */
    rules: [
      "../CLAUDE.md",
      "../src/shared/CLAUDE.md",
      "../src/app/CLAUDE.md",
      "../src/components/Carousel/client/config/CLAUDE.md",
      "../e2e/CLAUDE.md",
    ],
    table: "01-facts.md",
    heading: "| Раздел правил проекта | Где на полке |",
    /** Ссылка на раздел по названию переживает переезд файла, а позиционная
     * («правило выше») — нет. Поэтому именные сверяются, а остальные при
     * переносе переписываются в именные. Ищется оборот `раздел «X»` и `§ «X»`;
     * `см. «X»` тоже, но только когда X — заголовок, а не ярлык вывода. */
    refExceptions: [
      // Ярлыки секций вывода `brief`, а не заголовки документов.
      "упомянут по имени",
    ],
  },
  /** Область, чью поломку видно ТОЛЬКО в браузере: кадры, посадка, ввод. Задета
   * правкой — смоук обязателен, и напоминает об этом `tested`, а не память:
   * прогон «по требованию» без machinery, которая это требование предъявляет,
   * превращается в инструмент, о котором никто не вспомнит.
   *
   * Список намеренно узкий — ровно то, про что смоук делает утверждения. Шире
   * значило бы требовать прогон, который про эту правку ничего не докажет, а
   * канал, кричащий не по делу, перестают читать. */
  smokeScope: [
    "src/components/Carousel/client/visual-position",
    "src/components/Carousel/client/motion",
    "src/components/Carousel/client/geometry",
    "src/components/Carousel/client/gesture",
    "src/components/Carousel/client/Carousel.module.scss",
    "src/shared/engines/motion",
    "src/shared/engines/gesture",
    "src/shared/engines/kinetic/internal",
  ],
  /** Команда смоука — печатается в напоминании, чтобы её не искали. */
  smokeCommand: "npm run test:e2e",
  /** Скиллы проекта: папка, где они лежат, и таблица, объявляющая их состав.
   * Проверяется трижды: объявленный существует, существующий объявлен, и его
   * шаблон на полке совпадает с рабочим файлом байт в байт. Последнее — то же
   * правило, что у инструмента: скилл, разошедшийся с полкой, увезёт в новый
   * проект не тот порядок работы. Агенты сюда не входят: они не файлы
   * репозитория, и проверить их наличие скриптом нельзя — они названы прозой в
   * `environment.md`. `null` — скиллов у проекта нет. */
  skills: {
    dir: "../.claude/skills",
    shelf: "../src/shared/context",
    table: "01-facts.md",
    heading: "| Скилл | Шаблон на полке |",
  },
  /** Отчёт последнего мутационного прогона. HTML-репортер держит внутри тот
   * же объект, что отдал бы JSON, поэтому второй репортер не нужен. */
  mutationReport: "../reports/mutation/mutation.html",
  /** Конфиг мутационного прогона: из него берётся ОБЛАСТЬ. Считать долг по
   * всему `src` значило бы врать — часть файлов исключена намеренно. */
  mutationConfig: "../stryker.config.json",
  /** Накопительный реестр замеров: файл → счёт и хеш содержимого, на котором
   * он получен. Нужен потому, что Stryker ПЕРЕЗАПИСЫВАЕТ отчёт каждым
   * прогоном: без реестра однофайловый прогон стирал бы память о полном, и
   * долг считался бы неверно. Хеш, а не время: клон ставит всем файлам одну
   * свежую метку, и по времени всё выглядело бы устаревшим. */
  mutationLedger: "mutation-ledger.json",
};

const ROOT = path.join(HERE, CONFIG.src).split(path.sep).join("/");
const SHELF_RULES = path
  .join(HERE, CONFIG.rulesShelf)
  .split(path.sep)
  .join("/");

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

// --- общие части досье ------------------------------------------------------
// Их спрашивают два режима: `brief` («что это такое») и `plan` («что придётся
// тронуть»). Второй экземпляр этой логики был бы ровно тем дефектом, который
// мы ловим у форков: сверка строк базы тут тонкая — уникальность голого имени,
// сосед по папке, строка про ДРУГОЙ файл, — и разойдясь, две копии начали бы
// отвечать по-разному на один вопрос.
const LF = String.fromCharCode(10);
const BACKTICK = String.fromCharCode(96);

let LINES_CACHE = null;
const dossierLines = () => {
  if (LINES_CACHE !== null) return LINES_CACHE;
  const base = [];
  const docs = [];
  for (const d of docFiles)
    readFileSync(d, "utf8")
      .split(LF)
      .forEach((line, i) => docs.push([rel(d), i + 1, line]));
  for (const name of readdirSync(HERE).filter((n) => n.endsWith(".md")))
    readFileSync(path.join(HERE, name), "utf8")
      .split(LF)
      .forEach((line, i) => base.push([name, i + 1, line]));
  LINES_CACHE = { base, docs };
  return LINES_CACHE;
};

// Обратная достижимость: какой тест дотягивается до файла ПО ГРАФУ, а не по
// совпадению имён. Имена врут — `useTrackBinding` закрыт `trackBinding.test.tsx`.
let REACH_CACHE = null;
const testReach = () => {
  if (REACH_CACHE !== null) return REACH_CACHE;
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
  REACH_CACHE = reach;
  return reach;
};

// Три РАЗНЫХ ответа, и путать их нельзя. Напрямую — тест сам назвал файл. Через
// бочку — взял из `index.ts` имя, которое определяет этот файл: бочка реэкспорт,
// а не потребитель, так что тест его всё-таки гоняет. Транзитивно — дотянулся
// через обычные модули, и это почти всегда не про него.
const testsFor = (target) => {
  const all = testReach().get(target) ?? [];
  const exported = exportsOf.get(target) ?? new Set();
  const direct = all.filter((t) => (importsOf.get(t) ?? new Set()).has(target));
  const byName = all.filter(
    (t) =>
      !direct.includes(t) &&
      [...(namesPulledBy.get(t) ?? [])].some((n) => exported.has(n)),
  );
  return {
    direct,
    byName,
    transitive: all.length - direct.length - byName.length,
  };
};

// Стиль в графе импортов не участвует: его подключают побочным импортом
// `import "./x.scss";` без `from`, а тесты читают его ТЕКСТОМ. Спрашивать про
// него у `importedBy` значит получить ноль и прочитать это как «никому не
// нужен». Оба режима, `brief` и `plan`, обязаны отвечать про стиль одинаково —
// отсюда общий разбор.
const styleUsers = (target) => {
  const base = rel(target).slice(rel(target).lastIndexOf("/") + 1);
  const needle = "/" + base;
  const modules = files.filter(
    (f) => !isTest(f) && readFileSync(f, "utf8").includes(needle),
  );
  const tests = files.filter(
    (f) => isTest(f) && readFileSync(f, "utf8").includes(base),
  );
  return { modules, tests };
};

const quotedIn = (line) =>
  line
    .split(BACKTICK)
    .filter((_, i) => i % 2 === 1)
    .flatMap((t) => t.split(",").map((x) => x.trim()));

// Записи базы про адрес: точные (назван путём) и нестрогие (упомянут по имени).
const baseHitsFor = (target) => {
  const r = rel(target);
  const base = r.slice(r.lastIndexOf("/") + 1);
  const bare = base.replace(/\.(tsx?|scss)$/, "");
  const dir = r.slice(0, r.lastIndexOf("/"));
  // Голое имя засчитывается, только если оно в проекте одно: `index.ts` носят
  // сорок один файл, `types.ts` — двадцать.
  const uniqueBase =
    [...files, ...styleFiles].filter((f) => rel(f).endsWith("/" + base))
      .length === 1;
  // …но если та же строка называет соседа по папке, речь именно об этой бочке:
  // контекст строки снимает неоднозначность имени.
  const namesSibling = (line) =>
    quotedIn(line).some(
      (t) =>
        t.includes("/") &&
        /[.](tsx?|scss)$/.test(t) &&
        dir.endsWith(t.slice(0, t.lastIndexOf("/"))),
    );
  const exact = dossierLines().base.filter(([, , line]) =>
    quotedIn(line).some(
      (t) =>
        t === r ||
        (t.includes("/") && r.endsWith("/" + t)) ||
        (t === base && (uniqueBase || namesSibling(line))),
    ),
  );
  // Строка, которая в кавычках называет ДРУГОЙ существующий файл, — про него, а
  // не про этот: иначе короткое имя собирает весь модуль и топит попадания.
  const namesOther = (line) =>
    quotedIn(line).some(
      (t) =>
        /[.](tsx?|scss)$/.test(t) &&
        t !== base &&
        !r.endsWith("/" + t) &&
        files.some((f) => rel(f) === t || rel(f).endsWith("/" + t)),
    );
  const loose = dossierLines().base.filter(
    ([, , line]) =>
      line.includes(bare) &&
      !exact.some((e) => e[2] === line) &&
      !namesOther(line),
  );
  return { exact, loose };
};

// Один шаг по импортам — это соседи, а не радиус. Разница видна на нижнем
// слое: у `domain/layout.ts` прямых импортёров двое, но один из них бочка
// папки, и через неё правка расходится по всему клиенту. Печатать «2» и
// называть это радиусом значит показывать дешёвую правку там, где она
// дорогая, — а правило проекта берёт масштаб именно отсюда. Спрашивают двое:
// `blast` и `plan`.
const transitiveUsers = (start) => {
  const seen = new Set();
  const queue = [start];
  while (queue.length) {
    for (const u of importedBy.get(queue.pop()) ?? []) {
      if (isTest(u) || seen.has(u)) continue;
      seen.add(u);
      queue.push(u);
    }
  }
  return seen;
};

const mode = process.argv[2];

/** Путь-аргумент принимается в обеих ходовых формах: как его печатает база
 * (`components/…`) и как его печатает всё остальное — git, редактор, отчёт
 * (`src/components/…`). Вторая форма раньше отвечала «Ничего не нашлось», то
 * есть говорила «файла нет» про существующий файл; при этом соседний режим
 * (`mutated`) её принимал. Найдено пробой, и это тот же класс, что записан в
 * базе отдельно: отсутствие и «я не понял адрес» звучали одинаково. */
const SRC_PREFIX = path.basename(CONFIG.src) + "/";
const argPath = (a) => {
  if (a === undefined) return a;
  const s = a.split("\\").join("/").replace(/^\.\//, "");
  return s.startsWith(SRC_PREFIX) ? s.slice(SRC_PREFIX.length) : s;
};

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
  const arg = argPath(process.argv[3]);
  const rows = [];
  for (const f of files) {
    if (isTest(f)) continue;
    if (arg && !rel(f).includes(arg)) continue;
    const users = [...(importedBy.get(f) ?? [])].filter((u) => !isTest(u));
    rows.push([rel(f), users.length, users.map(rel).sort(), f]);
  }
  const isBarrel = (f) => /[\\/]index\.tsx?$/.test(f);
  rows.sort((a, b) => b[1] - a[1]);
  if (arg && rows.length === 0) {
    console.log(`Ничего не нашлось по ${arg}.`);
    process.exitCode = 1;
  } else if (arg) {
    console.log(`=== Радиус поражения: ${arg} ===\n`);
    for (const [f, n, users, abs] of rows) {
      const all = transitiveUsers(abs);
      const bridges = [...(importedBy.get(abs) ?? [])]
        .filter((u) => !isTest(u) && isBarrel(u))
        .map(rel)
        .sort();
      console.log(`${String(n).padStart(3)}  ${f}  (прямых)`);
      if (n > 0) console.log(`      ${users.join("\n      ")}`);
      console.log(`      всего транзитивно: ${all.size}`);
      if (bridges.length > 0)
        console.log(`      наружу ведёт бочка: ${bridges.join(", ")}`);
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

if (mode === "plan") {
  // `brief` отвечает «что это такое», `blast` — «кто зависит», `tested` — «что
  // с тестами в уже сделанной правке». Перед правкой спрашивают другое, и
  // спрашивают первым: **что придётся тронуть**. Собрать этот ответ можно и
  // четырьмя вызовами, но каждый стоит контекста, а склеивать их приходится
  // руками и по памяти — то есть ровно там, где память и подводит.
  const arg = argPath(process.argv[3]);
  const matched = arg
    ? [...files, ...styleFiles].filter((f) => rel(f).includes(arg))
    : [];
  const hits = matched.filter((f) => !isTest(f));
  if (!arg) {
    console.log(
      "Укажи путь: node .context/graph.mjs plan <путь или его хвост>",
    );
    process.exitCode = 1;
  } else if (hits.length === 0 && matched.length > 0) {
    // «Ничего не нашлось» про существующий файл отправляет читателя искать
    // опечатку в пути, которой нет. У теста вопрос «что придётся тронуть»
    // стоит наоборот: тронут будет он сам, а его радиус — то, что он гоняет.
    console.log(
      `${BACKTICK}${arg}${BACKTICK} — это тест, у него «что придётся тронуть» не спрашивают:` +
        ` что он гоняет и что закрепляет — ${BACKTICK}graph.mjs brief${BACKTICK}.`,
    );
    process.exitCode = 1;
  } else if (hits.length === 0) {
    console.log(`Ничего не нашлось по ${BACKTICK}${arg}${BACKTICK}.`);
    process.exitCode = 1;
  } else {
    for (const target of hits.slice(0, 6)) {
      const r = rel(target);
      console.log(`${LF}=== что придётся тронуть: ${r} ===`);

      // У стиля радиус считается по тексту, а не по графу: см. `styleUsers`.
      // Печатать ему «прямых 0» значило бы сказать «никому не нужен» про файл,
      // который подключён побочным импортом.
      const isStyle = r.endsWith(".scss");
      const direct = (
        isStyle
          ? styleUsers(target).modules
          : [...(importedBy.get(target) ?? [])].filter((u) => !isTest(u))
      )
        .map(rel)
        .sort();
      const all = isStyle ? null : transitiveUsers(target);
      console.log(
        isStyle
          ? `--- подключают (по тексту, стиль не в графе): ${direct.length} ---`
          : `--- радиус: прямых ${direct.length}, транзитивно ${all.size} ---`,
      );
      for (const d of direct) console.log("  " + d);

      // Близнец: расхождение копий законно, а вот баг, починенный в одной, —
      // нет. Поэтому пара называется ДО правки, а не после неё.
      const twins = [];
      for (const { from, to } of CONFIG.forks) {
        if (r.startsWith(from + "/")) twins.push(to + r.slice(from.length));
        if (r.startsWith(to + "/")) twins.push(from + r.slice(to.length));
      }
      const live = twins.filter((t) => files.some((f) => rel(f) === t));
      console.log("--- парная копия ---");
      console.log(
        live.length
          ? "  " + live.join(LF + "  ") + LF + "  правится в той же правке"
          : "  пары нет",
      );

      const {
        direct: td,
        byName,
        transitive,
      } = isStyle
        ? { direct: styleUsers(target).tests, byName: [], transitive: 0 }
        : testsFor(target);
      console.log("--- тесты, которые обязаны покраснеть на сломе ---");
      const runners = [...td, ...byName].map(rel).sort();
      console.log(
        runners.length
          ? "  " + runners.join(LF + "  ")
          : transitive === 0
            ? "  НЕТ НИ ОДНОГО — правку проверять руками, и это пункт отчёта"
            : "  напрямую никто; проверь тех, кто дотягивается транзитивно",
      );

      const { exact } = baseHitsFor(target);
      console.log("--- записи базы, которые придётся обновить ---");
      console.log(
        exact.length
          ? exact
              .map(
                ([name, n, line]) =>
                  `  ${name}:${n}  ${line.trim().slice(0, 96)}`,
              )
              .join(LF)
          : "  ни одной — значит и описывать правку негде: это само по себе находка",
      );

      // Один и тот же документ файл нередко называет дважды — в шапке и в теле;
      // печатать его дважды значит подсказывать, что это два разных адреса.
      const anchors = [...new Set(docRefsIn(readFileSync(target, "utf8")))];
      console.log("--- документация, объявленная самим файлом ---");
      console.log(
        anchors.length ? "  " + anchors.join(LF + "  ") : "  якоря нет",
      );
    }
    console.log(
      `${LF}Долг по мутациям спрашивают отдельно: он про всю правку, а не про один файл — ${BACKTICK}graph.mjs mutated${BACKTICK}.`,
    );
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
  // Имя файла без папки — ещё не адрес. `defaults.ts` лежит в трёх местах, и
  // документация карусели про `config/defaults.ts` засчитывалась полке
  // `engines/kinetic/internal/defaults.ts`: пункт, который нельзя закрыть, —
  // якорь из полки на документы компонента как раз и есть та связь, которой в
  // полке быть не должно. Поэтому для неуникальных имён требуем два последних
  // сегмента пути; для уникальных прежнего имени достаточно.
  const baseCount = new Map();
  for (const f of files) {
    if (isTest(f) || surface(f)) continue;
    const b = f.slice(f.lastIndexOf("/") + 1);
    baseCount.set(b, (baseCount.get(b) ?? 0) + 1);
  }
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
    const withParent = rel(f).split("/").slice(-2).join("/");
    const named = docBodies.filter(([, body]) =>
      (baseCount.get(base) ?? 0) > 1
        ? body.includes(withParent)
        : body.includes(base) || body.includes(asCode),
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
// Все проверки механические, и перечень их — не здесь: он живёт таблицей в
// `01-facts.md` и её двойником на полке, и пересказ здесь ровно это и сделал —
// разошёлся, оставшись на числе «восемь» при вдвое большем наборе. Ненулевой
// код возврата означает, что база отстала от кода.
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

    // Полка правил — такая же пара, только текстом. Сверять её содержимое
    // нельзя: полка пишет обобщённо, без имён файлов проекта. Поэтому тот же
    // вопрос в тот же момент — правило тронули здесь, а увозят его отсюда.
    const all = new Set(changed.map(norm));
    const shelf = norm(path.relative(path.join(HERE, ".."), SHELF_RULES));
    const rulesTouched = [...all].filter(
      (f) => /(^|\/)CLAUDE\.md$/.test(f) || f.startsWith(".context/"),
    );
    const shelfTouched = [...all].some((f) => f.startsWith(shelf));
    console.log(NEWLINE + "=== Правка правил против полки правил ===");
    if (rulesTouched.length === 0) console.log("  правила не тронуты");
    else if (shelfTouched) console.log("  полка правил в этой же правке — ок");
    else {
      console.log(
        `  тронуто в правилах проекта: ${rulesTouched.length}, полка не тронута:`,
      );
      for (const f of rulesTouched) console.log("    " + f);
      console.log(
        NEWLINE +
          "  Не всякая правка сюда относится: «текущий проект», числа базовой" +
          NEWLINE +
          "  линии, записи про этот код — местные. Метод, правило и инструмент —" +
          NEWLINE +
          `  общие, и уезжают в следующий проект из ${shelf}.`,
      );
    }
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

    // Удалённый файл в граф не попадает: его больше нет на диске. А записи о
    // нём остались — и это худший случай, потому что запись про то, чего нет,
    // выглядит достоверной. Рецепт удаления узла отсылает сюда, значит здесь
    // и должно быть сказано, что именно осталось висеть.
    const deletedCode = changed
      .map(abs)
      .filter((f) => /\.(tsx?|scss)$/.test(f) && !isTest(f) && !existsSync(f));

    console.log("=== Код и тесты в одной правке ===");
    console.log(
      `  тронуто файлов кода: ${touchedCode.length}, из них с тестами в этой же правке: ${covered}`,
    );
    if (touchedCode.length === 0 && deletedCode.length === 0)
      console.log("  правка кода не касается");

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

    // Смоук в браузере закрывает то, чего юнит-сеть не видит В ПРИНЦИПЕ. Он
    // «по требованию», а требование предъявляет не память: сравнение идёт по
    // сырым путям правки, поэтому в область попадают и стили, которых нет в
    // графе импортов.
    const smokeHits = changed.filter((f) =>
      CONFIG.smokeScope.some((p) => norm(f).startsWith(p)),
    );
    console.log(String.fromCharCode(10) + "=== Смоук в браузере ===");
    if (smokeHits.length === 0)
      console.log("  правка область смоука не задела — прогон не нужен");
    else {
      console.log("  задета область, чью поломку видно только в браузере:");
      for (const f of smokeHits) console.log("    " + f);
      console.log(
        `  прогнать ${CONFIG.smokeCommand} и назвать результат в отчёте`,
      );
    }

    if (deletedCode.length > 0) {
      console.log(
        NEWLINE + "=== Удалённые файлы: что о них осталось в базе ===",
      );
      for (const f of deletedCode) {
        const { exact } = baseHitsFor(f);
        console.log("  " + rel(f));
        console.log(
          exact.length
            ? "    " + exact.map(([name, line]) => `${name}:${line}`).join(", ")
            : "    записей нет",
        );
      }
      console.log(
        NEWLINE +
          "  Эти строки описывают файл, которого больше нет, и читаются как" +
          NEWLINE +
          "  достоверные. Снимаются здесь же — вместе с якорями на него и с" +
          NEWLINE +
          "  описаниями связи у тех, кто его импортировал.",
      );
    }

    // «Не забыть ВО ВСЕХ МЕСТАХ» — это не призыв к внимательности, а список,
    // который можно напечатать. База описывает файл в нескольких своих файлах
    // сразу (карта, состояние, потоки, тайминг, инварианты), и держать их в
    // голове нельзя. Плюс рябь: новый или изменившийся узел меняет то, что
    // делают его ПОТРЕБИТЕЛИ, и их записи устаревают молча — именно так
    // однажды и вышло с утверждением про кэш, поправленным в трёх записях из
    // четырёх.
    if (touchedCode.length) {
      const at = (hits) =>
        hits.length
          ? hits.map(([name, line]) => `${name}:${line}`).join(", ")
          : null;
      console.log(NEWLINE + "=== Записи базы про тронутые файлы ===");
      for (const f of touchedCode) {
        const where = at(baseHitsFor(f).exact);
        console.log("  " + rel(f));
        console.log(
          where === null
            ? "    записей нет — узел базе неизвестен, запись обязательна"
            : "    " + where,
        );
      }

      const neighbours = new Set();
      for (const f of touchedCode)
        for (const u of importedBy.get(f) ?? [])
          if (!isTest(u) && !touchedCode.includes(u)) neighbours.add(u);
      if (neighbours.size > 0) {
        const shown = [...neighbours].slice(0, 8);
        console.log(
          NEWLINE +
            "  Соседи, чьё описание могло измениться (кто импортирует):",
        );
        for (const n of shown)
          console.log(
            `    ${rel(n)} → ${at(baseHitsFor(n).exact) ?? "записей нет"}`,
          );
        if (neighbours.size > shown.length)
          console.log(`    …и ещё ${neighbours.size - shown.length}`);
      }
      console.log(
        NEWLINE +
          "  Открыть каждую и ответить: описывает ли она ещё то, что файл делает" +
          NEWLINE +
          "  сейчас? Какой факт в какой файл базы — таблица в knowledge-base.md:" +
          NEWLINE +
          "  состояние в 04, порядок в 06, сценарий в 05, связи в 03, идиома в 10.",
      );
    }

    // Документация отвечает на другой вопрос, чем база, и закрывается ОТДЕЛЬНО
    // от неё. Названные в правилах одной строкой, они сливаются в одно дело:
    // базу ведут по ходу правки, пара кажется закрытой, а `docs/**` остаются
    // описывать код, которого больше нет. Ровно так и вышло однажды. Поэтому
    // список печатается здесь — это второй вопрос того же момента, и задавать
    // его надо машиной, а не памятью.
    if (touchedCode.length) {
      const TICK = String.fromCharCode(96);
      const DOC_LINES = [];
      for (const d of docFiles) {
        const body = readFileSync(d, "utf8").split(NEWLINE);
        body.forEach((line, i) => DOC_LINES.push([rel(d), i + 1, line]));
      }
      const quoted = (line) =>
        line
          .split(TICK)
          .filter((_, i) => i % 2 === 1)
          .flatMap((t) => t.split(",").map((x) => x.trim()));

      const described = [];
      for (const f of touchedCode) {
        const r = rel(f);
        const base = r.slice(r.lastIndexOf("/") + 1);
        const bare = base.replace(/\.(tsx?|scss)$/, "");
        const named = [
          ...new Set(
            DOC_LINES.filter(([, , line]) =>
              quoted(line).some(
                (t) =>
                  t === r || r.endsWith("/" + t) || t === base || t === bare,
              ),
            ).map(([n, i]) => n + ":" + i),
          ),
        ];
        const own = [...new Set(docRefsIn(readFileSync(f, "utf8")))];
        if (named.length || own.length) described.push([r, own, named]);
      }

      console.log(NEWLINE + "=== Документация тронутых файлов ===");
      if (!described.length)
        console.log("  ни один тронутый файл не описан документацией");
      for (const [r, own, named] of described) {
        console.log("  " + r);
        if (own.length) console.log("    ссылается сам: " + own.join(", "));
        if (named.length)
          console.log("    назван в: " + named.slice(0, 8).join(", "));
      }
      if (described.length)
        console.log(
          NEWLINE +
            "  Открыть и ответить: описывает ли это ещё тот код, что сейчас в" +
            NEWLINE +
            "  файле? Приговора здесь нет — не всякая правка меняет «почему»." +
            NEWLINE +
            "  Но пройти мимо молча нельзя.",
        );
    }

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
if (mode === "mutated") {
  const NEWLINE = String.fromCharCode(10);
  const repoRoot = path.join(HERE, "..");
  const ledgerPath = path.join(HERE, CONFIG.mutationLedger);

  // Содержимое, а не время: реестр переживает клон, где mtime у всех файлов
  // одинаковый и новее любой записи. Концы строк нормализуются — иначе одна
  // и та же строка в CRLF и LF даёт разные хеши.
  const stamp = (f) =>
    createHash("sha1")
      .update(readFileSync(f, "utf8").split("\r\n").join("\n"))
      .digest("hex")
      .slice(0, 12);

  const ledger = existsSync(ledgerPath)
    ? JSON.parse(readFileSync(ledgerPath, "utf8"))
    : {};

  // Область прогона берётся из конфига самого инструмента. Считать долг по
  // всему `src` значило бы врать: часть файлов исключена намеренно и с
  // записанной причиной, и они бы числились долгом навсегда.
  const mutateGlobs = (() => {
    const cfg = path.join(HERE, CONFIG.mutationConfig);
    if (!existsSync(cfg)) return null;
    return JSON.parse(readFileSync(cfg, "utf8")).mutate ?? [];
  })();
  const globsToTest = (globs) => {
    const toRe = (glob) => {
      let out = "";
      for (let i = 0; i < glob.length; i += 1) {
        const ch = glob[i];
        if (ch === "*") {
          if (glob[i + 1] === "*") {
            if (glob[i + 2] === "/") {
              out += "(?:[^/]*/)*";
              i += 2;
            } else {
              out += ".*";
              i += 1;
            }
          } else out += "[^/]*";
        } else if (".+^${}()|[]\\?".includes(ch)) out += "\\" + ch;
        else out += ch;
      }
      return new RegExp("^" + out + "$");
    };
    const yes = globs.filter((g) => !g.startsWith("!")).map(toRe);
    const no = globs
      .filter((g) => g.startsWith("!"))
      .map((g) => toRe(g.slice(1)));
    return (f) => yes.some((r) => r.test(f)) && !no.some((r) => r.test(f));
  };
  const inScope = mutateGlobs === null ? null : globsToTest(mutateGlobs);
  const key = (f) => norm(path.relative(repoRoot, f));

  // Отчёт последнего прогона. HTML-репортер Stryker держит внутри ТОТ ЖЕ
  // объект, что отдал бы JSON-репортер: `app.report = {…}` перед закрытием
  // тега. Разбираем его, а не заводим второй источник истины рядом.
  const reportPath = path.join(HERE, CONFIG.mutationReport);
  let merged = 0;
  if (existsSync(reportPath)) {
    const html = readFileSync(reportPath, "utf8");
    const head = "app.report = ";
    const from = html.indexOf(head);
    const to = from < 0 ? -1 : html.indexOf("</script>", from);
    if (to > from) {
      const body = html
        .slice(from + head.length, to)
        .trim()
        .replace(/;$/, "");
      const reportedAt = statSync(reportPath).mtimeMs;
      const parsed = new Function("return " + body)();
      // Отчёт несёт СВОЮ область (`config.mutate`). Совпала с конфигом —
      // прогон был полным, и тогда файл в области, которого в отчёте нет,
      // доказанно не дал ни одного мутанта: мутировать в нём нечего. Без этой
      // сверки такие файлы числились бы долгом вечно — а проверка, которую
      // нельзя удовлетворить, учит не читать её вывод.
      const fullScope =
        mutateGlobs !== null &&
        JSON.stringify(parsed.config?.mutate ?? null) ===
          JSON.stringify(mutateGlobs);
      for (const [key, d] of Object.entries(parsed.files ?? {})) {
        const file = norm(path.join(repoRoot, key));
        if (!files.includes(file)) continue;
        // Числа описывают тот код, что был на момент прогона. Если файл
        // тронут ПОСЛЕ него, приписать их нынешнему содержимому нельзя —
        // такую запись пропускаем, и файл остаётся непромеренным.
        if (statSync(file).mtimeMs > reportedAt) continue;
        let killed = 0;
        let alive = 0;
        for (const m of d.mutants ?? []) {
          // Исключённые мутаторы остаются в отчёте пометкой `Ignored` — они
          // не убиты и не выжили, в знаменатель счёта не входят.
          if (m.status === "Ignored") continue;
          if (m.status === "Killed" || m.status === "Timeout") killed += 1;
          else alive += 1;
        }
        const row = { killed, alive, hash: stamp(file) };
        if (JSON.stringify(ledger[key]) !== JSON.stringify(row)) merged += 1;
        ledger[key] = row;
      }
      if (fullScope) {
        for (const file of files) {
          if (isTest(file) || file.endsWith(".d.ts")) continue;
          const k = key(file);
          if (!inScope(k) || parsed.files[k] !== undefined) continue;
          if (statSync(file).mtimeMs > reportedAt) continue;
          const row = { killed: 0, alive: 0, hash: stamp(file) };
          if (JSON.stringify(ledger[k]) !== JSON.stringify(row)) merged += 1;
          ledger[k] = row;
        }
      }
    }
  }
  // Запись об удалённом файле не снимается слиянием: оно только добавляет и
  // обновляет ключи. Оставленная, она навсегда завышает размер реестра и
  // описывает долг по коду, которого нет, — а рецепт удаления узла обещает
  // обратное. Дешевле снимать её здесь, чем требовать это руками.
  let dropped = 0;
  for (const k of Object.keys(ledger))
    if (!existsSync(path.join(repoRoot, k))) {
      delete ledger[k];
      dropped += 1;
      merged += 1;
    }

  if (merged) {
    const ordered = {};
    for (const k of Object.keys(ledger).sort()) ordered[k] = ledger[k];
    writeFileSync(
      ledgerPath,
      JSON.stringify(ordered, null, 2) + String.fromCharCode(10),
      "utf8",
    );
  }

  const scoreOf = (row) =>
    row.killed + row.alive === 0
      ? "мутировать нечего"
      : ((100 * row.killed) / (row.killed + row.alive)).toFixed(2) +
        " %, живых " +
        row.alive;

  console.log("=== Мутационный прогон против правки ===");
  console.log(
    `  в реестре файлов: ${Object.keys(ledger).length}` +
      (merged ? `, обновлено этим прогоном: ${merged}` : "") +
      (dropped ? `, снято об удалённых файлах: ${dropped}` : ""),
  );

  let changed = process.argv.slice(3);
  if (changed.length === 0) {
    changed = await changedPaths(repoRoot);
    if (changed === null) {
      console.log(
        "  git недоступен — передай пути аргументами: graph.mjs mutated <путь> …",
      );
      process.exitCode = 1;
    }
  }

  const needRun = [];
  if (changed !== null) {
    const touched = new Set(changed.map((f) => norm(path.join(repoRoot, f))));
    const touchedCode = [...touched].filter(
      (f) =>
        files.includes(f) &&
        !isTest(f) &&
        !f.endsWith(".d.ts") &&
        (inScope === null || inScope(key(f))),
    );

    const never = [];
    const stale = [];
    const fresh = [];
    for (const f of touchedCode) {
      const row = ledger[key(f)];
      if (row === undefined) {
        never.push(rel(f));
        needRun.push(key(f));
      } else if (row.hash !== stamp(f)) {
        stale.push(`${rel(f)} — было ${scoreOf(row)}`);
        needRun.push(key(f));
      } else {
        fresh.push(`${rel(f)} — ${scoreOf(row)}`);
      }
    }

    console.log(`  тронуто файлов в области прогона: ${touchedCode.length}`);
    if (touchedCode.length === 0)
      console.log("  правка файлов в области прогона не касается");
    for (const [title, rows] of [
      ["Под мутациями не были ни разу:", never],
      [
        "Содержимое изменилось после прогона — число уже не про этот код:",
        stale,
      ],
      ["Измерено на нынешнем содержимом:", fresh],
    ]) {
      if (!rows.length) continue;
      console.log(NEWLINE + "  " + title);
      for (const r of rows) console.log("    " + r);
    }
  }

  if (needRun.length) {
    console.log(
      NEWLINE +
        "  Прогнать по ним:" +
        NEWLINE +
        `    npx stryker run --mutate "${needRun.join(",")}"` +
        NEWLINE +
        NEWLINE +
        "  У каждого выжившего ровно три законных исхода, и каждый называется" +
        NEWLINE +
        "  вслух: добавлен тест; исправлен код; признан неубиваемым — с" +
        NEWLINE +
        "  причиной. Счёт здесь не ворота, а список для разбора.",
    );
  }

  // Долг по всей области, а не только по правке: файл, который уезжает
  // пользователю и ни разу не был под прогоном, — непромеренная поверхность.
  if (inScope !== null) {
    const surface = files.filter(
      (f) => !isTest(f) && !f.endsWith(".d.ts") && inScope(key(f)),
    );
    const unseen = surface.filter((f) => ledger[key(f)] === undefined);
    const drifted = surface.filter(
      (f) => ledger[key(f)] !== undefined && ledger[key(f)].hash !== stamp(f),
    );
    console.log(
      NEWLINE +
        "=== Непромеренная поверхность ===" +
        NEWLINE +
        `  в области прогона: ${surface.length}; ни разу не мерены: ${unseen.length}; ` +
        `изменились после замера: ${drifted.length}`,
    );
    for (const f of [...unseen, ...drifted].slice(0, 15))
      console.log("    " + rel(f));
    const rest = unseen.length + drifted.length - 15;
    if (rest > 0) console.log(`    …и ещё ${rest}`);
  }
}

if (mode === "brief") {
  const NEWLINE = String.fromCharCode(10);
  const TICK = String.fromCharCode(96);
  const arg = argPath(process.argv[3]);
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
      // Достижимость тестов, строки базы и разбор записей — общие с `plan`,
      // живут на уровне модуля. Документация отвечает на другой вопрос, чем
      // база: не «что и где», а «почему так». Для рефактора это половина, без
      // которой ломают концепцию, ничего не нарушив формально.
      const DOC_LINES = dossierLines().docs;

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
          // Секция импортов печатается ниже только для НЕ-тестов, поэтому
          // отсылать к ней тест значило бы отправить читателя в пустоту —
          // ровно это тут и стояло. А вопрос «что он гоняет» у теста как раз
          // главный: это его импорты, и печатаются они здесь.
          console.log("--- гоняет (что берёт напрямую) ---");
          console.log(
            down.length ? "  " + down.join(NEWLINE + "  ") : "  ничего своего",
          );
          console.log(
            "  «что накрывает его» тут не спрашивают: тест и есть проверка; что он закрепляет — записи базы ниже",
          );
        } else if (r.endsWith(".scss")) {
          // Разбор по тексту общий с `plan`, см. `styleUsers`: стиль часто
          // подключают побочным импортом без `from`, и граф его не видит.
          const { modules: users, tests: named } = styleUsers(target);
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

          // Средний уровень считается ПО ИМЕНАМ, а не по форме пути: тест,
          // взявший `useImageResourceStore` из бочки слоя, гоняет файл, который
          // это имя определяет; тест, взявший из той же бочки соседнее имя, —
          // нет. Разбор общий с `plan`, см. `testsFor`.
          const { direct, byName, transitive } = testsFor(target);
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
          if (direct.length + byName.length === 0)
            console.log(
              transitive === 0
                ? "  ВНИМАНИЕ: файл не гоняет ни один тест — правку проверять руками"
                : "  напрямую никто; проверь, гоняют ли его те, кто дотягивается ниже",
            );
          console.log(
            `--- дотягиваются транзитивно, через обычные модули: ${transitive} ---`,
          );
        }

        // Разбор записей базы — общий с `plan`, см. `baseHitsFor`: там же
        // объяснено, почему голое имя засчитывается не всегда и что делает
        // строка, называющая соседа по папке.
        const { exact, loose } = baseHitsFor(target);
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
          quotedIn(line).some(
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
  const goneTests = [];
  const goneMapped = [];

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
          // Реестр тестов сверялся в одну сторону: каждый тест с диска обязан
          // быть назван. Обратное молчало — удалённый тест оставлял строку,
          // описывающую проверку, которой нет, и это хуже отсутствующей: она
          // читается как действующая гарантия. Ловится только имя, похожее на
          // тест, — иначе в список посыпалась бы проза.
          if (hit === null) {
            // `locate` молчит и когда файла нет, и когда имя неоднозначно —
            // у парных форков одноимённых тестов по два. Неоднозначность
            // отсутствием не является, иначе список наполнится живыми файлами.
            const existsSomewhere = files.some(
              (f) => rel(f) === one || rel(f).endsWith("/" + one),
            );
            if (name === TESTS && /\.test\.tsx?$/.test(one) && !existsSomewhere)
              goneTests.push(`${name}: ${one}`);
            // Шаблоны со звёздочкой и перечисления расширений (`.ts/.tsx`)
            // адресами не являются: они описывают форму, а не файл. Замер на
            // здоровом дереве дал ровно три таких и ноль настоящих.
            if (
              name === MAP &&
              /\.(tsx?|scss)$/.test(one) &&
              !/\.test\.tsx?$/.test(one) &&
              !one.includes("*") &&
              one.split("/").every((s) => !s.startsWith(".")) &&
              !existsSomewhere
            )
              goneMapped.push(`${name}: ${one}`);
            continue;
          }
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
    `  файлов кода и стилей (без тестов): ${code.length}, не упомянуто: ${missing.length}` +
      (goneMapped.length
        ? `, названо и не существует: ${goneMapped.length}`
        : ""),
  );
  for (const f of missing) console.log("    " + rel(f));
  for (const m of goneMapped) console.log("    " + m);

  // 2. каждый тестовый файл назван в 08-tests.md — поимённо, папкой не зачесть
  const testFiles = files.filter(isTest);
  const unnamed = testFiles.filter((f) => !testMentions.has(f));
  console.log("=== Покрытие тестов ===");
  console.log(
    `  тестовых файлов: ${testFiles.length}, не названо: ${unnamed.length}` +
      (goneTests.length
        ? `, названо и не существует: ${goneTests.length}`
        : ""),
  );
  for (const f of unnamed) console.log("    " + rel(f));
  for (const t of goneTests) console.log("    " + t);

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
  for (const [own, shelf] of CONFIG.toolDocs) {
    const flat = (f) => readFileSync(f, "utf8").split(CR_LF).join(NEWLINE);
    const mine = path.join(HERE, own);
    const there = path.join(HERE, shelf);
    if (!existsSync(mine)) toolDrift.push(`нет файла: ${own}`);
    else if (!existsSync(there)) toolDrift.push(`копии нет: ${shelf}`);
    else if (flat(mine) !== flat(there))
      toolDrift.push(`копия разошлась: ${shelf}`);
  }
  // 9a. каждый режим инструмента описан в справочнике и назван в правилах.
  // Заведено после пробы: справочник объявляет себя полным («оговорки и ловушки
  // КАЖДОГО режима»), а держать это обещание было нечему — новый режим мог
  // остаться неописанным, и заметить это стало бы некому.
  const undocumented = [];
  {
    const own = readFileSync(fileURLToPath(import.meta.url), "utf8");
    const modes = [...own.matchAll(/mode === "([a-z]+)"/g)].map((m) => m[1]);
    const named = (text, m) => new RegExp("`" + m + "\\b").test(text);
    const manual = CONFIG.toolDocs.length
      ? readFileSync(path.join(HERE, CONFIG.toolDocs[0][0]), "utf8")
      : null;
    const rulesText = CONFIG.rulesManifest.rules
      .map((r) => {
        const at = path.join(HERE, r);
        return existsSync(at) ? readFileSync(at, "utf8") : "";
      })
      .join("\n");
    for (const m of [...new Set(modes)].sort()) {
      if (
        manual !== null &&
        !new RegExp("^### `" + m + "\\b", "m").test(manual)
      )
        undocumented.push(`нет раздела в справочнике: ${m}`);
      if (!named(rulesText, m)) undocumented.push(`не назван в правилах: ${m}`);
    }
  }

  console.log("=== Копия инструмента ===");
  console.log(
    CONFIG.toolCopy === null
      ? "  копия не заявлена"
      : `  расхождений: ${toolDrift.length}`,
  );
  for (const t of toolDrift) console.log("    " + t);

  console.log("=== Режимы инструмента описаны ===");
  console.log(`  без описания: ${undocumented.length}`);
  for (const u of undocumented) console.log("    " + u);

  // 9b. список разрешений среды не потерял того, что обещает полка
  const settingsDrift = [];
  if (CONFIG.settingsPair !== null) {
    const readList = (relPath) => {
      const at = path.join(HERE, relPath);
      if (!existsSync(at)) return null;
      const parsed = JSON.parse(readFileSync(at, "utf8"));
      return parsed?.permissions?.allow ?? [];
    };
    const mine = readList(CONFIG.settingsPair.project);
    const shelf = readList(CONFIG.settingsPair.shelf);
    if (mine === null)
      settingsDrift.push(`нет файла: ${CONFIG.settingsPair.project}`);
    else if (shelf === null)
      settingsDrift.push(`нет файла: ${CONFIG.settingsPair.shelf}`);
    else
      for (const entry of shelf)
        if (!mine.includes(entry)) settingsDrift.push(`потеряно: ${entry}`);
  }
  console.log("=== Разрешения среды ===");
  console.log(
    CONFIG.settingsPair === null
      ? "  пара не заявлена"
      : `  из шаблона полки потеряно: ${settingsDrift.length}`,
  );
  for (const s of settingsDrift) console.log("    " + s);

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
  // 11-бис. ссылка на пункт отложенного ведёт в существующий пункт.
  // Закрытый пункт удаляется целиком, следующие сдвигаются — и «пункт 8»
  // остаётся висеть в пяти файлах сразу. Проверяется не нумерация: дыра в ней
  // безвредна, вредна ссылка в никуда. Считается только там, где рядом назван
  // сам файл отложенного или список отложенного по-английски, иначе проверка
  // ловила бы «пункт 3» любого другого перечня и врала бы.
  const danglingTodo = [];
  if (CONFIG.todo !== null) {
    const todoPath = path.join(BASE, CONFIG.todo);
    if (existsSync(todoPath)) {
      const numbers = new Set();
      for (const line of readFileSync(todoPath, "utf8").split(NEWLINE)) {
        const head = /^#{2,}\s+(\d+)\./.exec(line);
        if (head !== null) numbers.add(head[1]);
      }
      const REF = /(?:пункт[ае]?|item)\s+(\d+)/gi;
      const NAMES = new RegExp(
        CONFIG.todo.replace(".", "\\.") + "|deferred-work list",
      );
      const scan = [
        ...readdirSync(BASE)
          .filter((n) => n.endsWith(".md") && n !== CONFIG.todo)
          .map((n) => [n, path.join(BASE, n)]),
        ...files.map((f) => [rel(f), f]),
        ...docFiles.map((f) => [rel(f), f]),
      ];
      // Сам файл отложенного сканируется по тем же правилам, но без требования
      // назвать себя по имени: внутри списка «пункт 4» и так значит его
      // собственный пункт. Пропуск найден пробой — а именно здесь ссылки друг
      // на друга и живут, и именно здесь их ломает удаление закрытого пункта.
      scan.push([CONFIG.todo, todoPath]);
      for (const [name, full] of scan) {
        const selfRef = full === todoPath;
        readFileSync(full, "utf8")
          .split(NEWLINE)
          .forEach((line, i) => {
            if (!selfRef && !NAMES.test(line)) return;
            REF.lastIndex = 0;
            let m;
            while ((m = REF.exec(line)) !== null)
              if (!numbers.has(m[1]))
                danglingTodo.push(
                  name + ":" + (i + 1) + " — пункта " + m[1] + " там нет",
                );
          });
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
      // Полка правил везёт копию ЭТОГО файла, и в ней маркеры перечислены как
      // данные. Сканер, читающий собственный список, докладывает о себе —
      // сегодня спасает только расширение (`.mjs` в обход не попадает), и
      // полагаться на это нельзя.
      if (rel(f).includes("shared/context/tools/")) continue;
      const body = readFileSync(f, "utf8").split(NEWLINE);
      body.forEach((line, i) => {
        if (CODE_MARK.test(line))
          parked.push(`${rel(f)}:${i + 1} — маркер отложенной работы в коде`);
      });
    }

    const DEFECT =
      /(дыр[аеуы]|баг|ошибк|дефект|сломан|неверн|расходит|не соответств|мёртв|дубл|утечк|bug|defect|broken|wrong|leak)/i;
    // Список намеренно узкий — это обороты, которыми дефект паркуют, а не
    // слова, которыми описывают устройство. Широкий словарь пробовался и был
    // отвергнут замером: «отложенный тик», «не покрыто контрактным тестом»,
    // «расходится молча» — нормальная проза, и на ней сверка давала четыре
    // ложных срабатывания из четырёх. Естественную форму отказа («не делаем»,
    // «остался без теста») ловит не она, а правило про заголовки ниже.
    const DEFER =
      /(не исправл|не почин|не стал[аио]? прав|оставлен[оа]? как есть|выходит за рамки|в задачу не входил|не входит в объ[её]м|вынесен[оа]? разработчику|отложен[оа]? до|записан[оа]? и не|deferred|out of scope|left as is)/i;
    const DECIDED = /09-decisions\.md/;
    const baseDocs = readdirSync(BASE).filter(
      (n) => n.endsWith(".md") && n !== "README.md",
    );

    // Тот же маркер, но в прозе базы и правил. Сеть выше читает только код, и
    // `TODO`, вписанный в запись базы, проходил мимо неё молча — поймано
    // пробой. Описания самих маркеров всегда стоят в обратных кавычках,
    // поэтому код в кавычках вырезается перед поиском: иначе сверка доложила
    // бы о строке, которая её же и описывает. Файл отложенного не сканируется
    // намеренно: он и есть список согласованных отсрочек.
    for (const rp of [
      ...baseDocs.map((n) => path.join(BASE, n)),
      ...CONFIG.rulesManifest.rules.map((r) => path.join(HERE, r)),
    ]) {
      if (!existsSync(rp) || path.basename(rp) === CONFIG.todo) continue;
      const lines = readFileSync(rp, "utf8").split(NEWLINE);
      lines.forEach((line, i) => {
        const bare = line.replace(/`[^`]*`/g, " ");
        if (CODE_MARK.test(bare))
          parked.push(
            `${path.relative(HERE, rp).split(path.sep).join("/")}:${i + 1} — маркер отложенной работы в тексте`,
          );
      });
    }

    for (const name of baseDocs) {
      const p = path.join(BASE, name);
      if (!existsSync(p)) continue;
      const text = readFileSync(p, "utf8").split(NEWLINE);
      let start = 0;
      const flush = (end) => {
        // Строки таблицы из абзаца выбрасываются. Таблица без пустых строк —
        // формально один абзац, и словарь ловит в нём слова из РАЗНЫХ строк:
        // «дефект» из одной, «отложено» из другой. Поймано пересадкой полки в
        // пустой проект: скопированная туда таблица сверок роняла прогон,
        // ничего при этом не откладывая. Парковка дефекта — это проза, а не
        // ячейка таблицы.
        const para = text
          .slice(start, end)
          .filter((l) => !l.trimStart().startsWith("|"))
          .join(" ");
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

      // Раздел, чей заголовок сам объявляет «этого мы не сделали», — и есть
      // штатное место парковки. Здесь словарь не нужен: место названо, и
      // каждый его абзац обязан назвать решение, по которому работа не
      // делается. Заголовки и таблицы пропускаются — решение пишется прозой.
      // Заголовок про НЕСДЕЛАННУЮ РАБОТУ, а не про методику измерения:
      // «Что тестами не покрыто» — раздел о том, как считается покрытие, и
      // ссылки на решение там не место. Проверено замером: широкий вариант
      // ловил его пять раз подряд.
      const UNDONE =
        /^#{2,6}\s+.*(не сделан|не закрыт|не дела|оставлен как есть|отказ|not done|left undone)/i;
      let inUndone = false;
      let level = 0;
      let block = [];
      let blockAt = 0;
      const flushBlock = () => {
        const body = block.join(" ").trim();
        block = [];
        if (!inUndone || body === "" || DECIDED.test(body)) return;
        parked.push(
          `${name}:${blockAt} — раздел «не сделано» без ссылки на решение`,
        );
      };
      text.forEach((line, i) => {
        const heading = /^(#{2,6})\s/.exec(line);
        if (heading) {
          flushBlock();
          const depth = heading[1].length;
          if (inUndone && depth <= level) inUndone = false;
          if (UNDONE.test(line)) {
            inUndone = true;
            level = depth;
          }
          return;
        }
        // Пустая строка, строка таблицы и разделитель абзацем не являются:
        // решение пишется прозой, а `---` сам по себе ничего не утверждает.
        if (
          line.trim() === "" ||
          line.trimStart().startsWith("|") ||
          /^\s*([-*_])\1{2,}\s*$/.test(line)
        ) {
          flushBlock();
          return;
        }
        if (block.length === 0) blockAt = i + 1;
        block.push(line);
      });
      flushBlock();
    }
  }
  console.log("=== Найденное — исправлено, а не отложено ===");
  console.log(`  отложенного без решения: ${parked.length}`);
  for (const p of parked) console.log("    " + p);

  // 14. полка правил не отстаёт от проекта
  // Инструмент на полке держит побайтовая сверка выше; текст правил не держало
  // ничто, и полка отстала в первый же заход, когда сверку добавили в проект,
  // а на полку — нет. Сверять формулировки нельзя: полка пишет обобщённо, без
  // имён файлов проекта, и совпадение слов было бы ложной целью. Сверяется
  // счёт: обе таблицы машинных сверок описывают одинаковое их число.
  const shelfDrift = [];
  {
    const rows = (file) => {
      const p = path.join(BASE, file);
      if (!existsSync(p)) return null;
      const lines = readFileSync(p, "utf8").split(NEWLINE);
      const at = lines.findIndex(
        (l) => l.trim() === CONFIG.checkTableHeading.trim(),
      );
      if (at < 0) return null;
      let n = 0;
      // Строка-разделитель под шапкой в счёт не идёт.
      for (let i = at + 2; i < lines.length; i += 1) {
        if (!lines[i].trimStart().startsWith("|")) break;
        n += 1;
      }
      return n;
    };
    const counts = CONFIG.checkTables.map((f) => [f, rows(f)]);
    for (const [f, n] of counts)
      if (n === null) shelfDrift.push(`${f}: таблицу сверок не нашли`);
    const numbers = counts.map(([, n]) => n).filter((n) => n !== null);
    if (numbers.length === counts.length && new Set(numbers).size > 1)
      shelfDrift.push(
        counts.map(([f, n]) => `${f}: ${n}`).join("  ≠  ") +
          " — сверку описали не везде",
      );
  }
  console.log("=== Полка правил не отстаёт ===");
  console.log(`  таблицы сверок разошлись: ${shelfDrift.length}`);
  for (const d of shelfDrift) console.log("    " + d);

  // 13b. Каждый раздел правил проекта КЛАССИФИЦИРОВАН: либо назван его адрес
  // на полке, либо он помечен проектным. Сверять заголовки проекта с
  // заголовками шаблона напрямую нельзя — шаблон обобщённый, у проекта законно
  // есть свои разделы, и прямой диф шумел бы. А вот «раздел появился и никто
  // не решил, едет он на полку или нет» — ровно тот дрейф, из-за которого полка
  // однажды увезла в следующий проект не все правила.
  const unclassified = [];
  const danglingRefs = [];
  if (CONFIG.rulesManifest !== null) {
    const tableAt = path.join(BASE, CONFIG.rulesManifest.table);
    // Заголовки собираются со ВСЕХ заявленных файлов правил: разложенные по
    // папкам, они остаются одним корпусом, и сверять их надо как один.
    const heads = [];
    for (const one of CONFIG.rulesManifest.rules) {
      const at = path.join(HERE, one);
      if (!existsSync(at)) {
        unclassified.push(`нет файла правил: ${one}`);
        continue;
      }
      for (const line of readFileSync(at, "utf8").split(NEWLINE))
        if (line.startsWith("## ")) heads.push(line.slice(3).trim());
    }
    if (!existsSync(tableAt))
      unclassified.push(`нет файла таблицы: ${CONFIG.rulesManifest.table}`);
    else {
      const lines = readFileSync(tableAt, "utf8").split(NEWLINE);
      const at = lines.findIndex(
        (l) => l.trim() === CONFIG.rulesManifest.heading.trim(),
      );
      const listed = [];
      if (at < 0) unclassified.push("таблицу разделов не нашли");
      else
        for (let i = at + 2; i < lines.length; i += 1) {
          if (!lines[i].trimStart().startsWith("|")) break;
          listed.push(lines[i].split("|")[1].trim().replace(/`/g, ""));
        }
      for (const h of heads)
        if (!listed.includes(h)) unclassified.push(`не классифицирован: ${h}`);
      for (const l of listed)
        if (!heads.includes(l)) unclassified.push(`раздела больше нет: ${l}`);
    }

    // 13b-2. Ссылка на раздел по названию обязана разрешаться.
    // Позиционная ссылка («правило выше») переезда файла не переживает и
    // проверке не поддаётся — поэтому при выносе раздела такие переписывают в
    // именные, а именные держит эта сверка. Заголовки берутся и из правил, и
    // из базы: база ссылается на разделы правил, правила — на разделы базы.
    // Корпус — это правила проекта, база И полка: правила ссылаются на разделы
    // базы, база на разделы правил, а шаблон полки — на разделы `quality.md`,
    // который в новом проекте станет соседом скопированного `CLAUDE.md`.
    const allHeads = new Set(heads);
    const shelfAt = path.join(HERE, CONFIG.rulesShelf);
    const headSources = [
      ...readdirSync(BASE)
        .filter((n) => n.endsWith(".md"))
        .map((n) => path.join(BASE, n)),
      ...(existsSync(shelfAt)
        ? readdirSync(shelfAt)
            .filter((n) => n.endsWith(".md"))
            .map((n) => path.join(shelfAt, n))
        : []),
    ];
    for (const at of headSources)
      for (const line of readFileSync(at, "utf8").split(NEWLINE))
        if (/^#{2,}\s/.test(line))
          allHeads.add(line.replace(/^#+\s*/, "").trim());
    const skip = new Set(CONFIG.rulesManifest.refExceptions);
    const REF_RE = /(?:раздел[ае]?|§)\s+«([^»]+)»/g;
    const sources = [
      ...CONFIG.rulesManifest.rules
        .map((one) => [one, path.join(HERE, one)])
        .filter(([, at]) => existsSync(at)),
      ...readdirSync(BASE)
        .filter((n) => n.endsWith(".md"))
        .map((n) => [n, path.join(BASE, n)]),
    ];
    for (const [name, at] of sources) {
      const body = readFileSync(at, "utf8");
      REF_RE.lastIndex = 0;
      let m;
      while ((m = REF_RE.exec(body)) !== null) {
        // Ссылка нередко разорвана переносом строки: сравнивать надо смысл, а
        // не вёрстку, иначе живой заголовок читается как висячий.
        const title = m[1].replace(/\s+/g, " ").trim();
        if (skip.has(title)) continue;
        // Заголовок могли назвать началом: «раздел «Планка качества»» против
        // «## Планка качества — сверяется, а не подразумевается».
        const found = [...allHeads].some(
          (h) => h === title || h.startsWith(title),
        );
        if (!found) danglingRefs.push(`${name}: «${title}»`);
      }
    }
  }
  console.log("=== Ссылки на разделы ===");
  console.log(
    CONFIG.rulesManifest === null
      ? "  реестр правил не заявлен"
      : `  именных ссылок ведут в никуда: ${danglingRefs.length}`,
  );
  for (const d of danglingRefs) console.log("    " + d);
  // 13c. Скиллы проекта: объявлены, лежат на месте, совпадают с полкой.
  const skillDrift = [];
  if (CONFIG.skills !== null) {
    const dir = path.join(HERE, CONFIG.skills.dir);
    const onDisk = existsSync(dir)
      ? readdirSync(dir).filter((n) =>
          existsSync(path.join(dir, n, "SKILL.md")),
        )
      : [];
    const tableAt = path.join(BASE, CONFIG.skills.table);
    const listed = new Map();
    if (!existsSync(tableAt))
      skillDrift.push(`нет файла таблицы: ${CONFIG.skills.table}`);
    else {
      const lines = readFileSync(tableAt, "utf8").split(NEWLINE);
      const at = lines.findIndex(
        (l) => l.trim() === CONFIG.skills.heading.trim(),
      );
      if (at < 0) skillDrift.push("таблицу скиллов не нашли");
      else
        for (let i = at + 2; i < lines.length; i += 1) {
          if (!lines[i].trimStart().startsWith("|")) break;
          const cells = lines[i].split("|");
          listed.set(
            cells[1].trim().replace(/`/g, ""),
            cells[2].trim().replace(/`/g, ""),
          );
        }
    }
    for (const name of onDisk)
      if (!listed.has(name)) skillDrift.push(`не объявлен в таблице: ${name}`);
    for (const [name, template] of listed) {
      if (!onDisk.includes(name)) {
        skillDrift.push(`объявлен, но файла нет: ${name}`);
        continue;
      }
      const shelfAt = path.join(HERE, CONFIG.skills.shelf, template);
      if (!existsSync(shelfAt)) {
        skillDrift.push(`нет шаблона на полке: ${template}`);
        continue;
      }
      const flat = (f) => readFileSync(f, "utf8").split(CR_LF).join(NEWLINE);
      if (flat(shelfAt) !== flat(path.join(dir, name, "SKILL.md")))
        skillDrift.push(`шаблон разошёлся с рабочим файлом: ${template}`);
    }
  }
  console.log("=== Скиллы проекта ===");
  console.log(
    CONFIG.skills === null
      ? "  скиллы не заявлены"
      : `  расхождений: ${skillDrift.length}`,
  );
  for (const s of skillDrift) console.log("    " + s);

  console.log("=== Разделы правил классифицированы ===");
  console.log(
    CONFIG.rulesManifest === null
      ? "  таблица разделов не заявлена"
      : `  без решения «на полку или проектное»: ${unclassified.length}`,
  );
  for (const u of unclassified) console.log("    " + u);

  console.log("=== Отложенное без закрытых пунктов ===");
  console.log(
    CONFIG.todo === null
      ? "  файл отложенного не заявлен"
      : `  помечено закрытыми: ${closedTodos.length}`,
  );
  for (const t of closedTodos) console.log("    " + t);
  console.log(`  ссылок на несуществующий пункт: ${danglingTodo.length}`);
  for (const t of danglingTodo) console.log("    " + t);

  // 14-16. Три шва, которые до сих пор держались только вниманием.
  // Общий источник для всех трёх: файлы базы (по имени) и документация рядом с
  // кодом (путём от `src`).
  const docSources = [
    ...readdirSync(HERE)
      .filter((n) => n.endsWith(".md"))
      .map((n) => [n, norm(path.join(HERE, n))]),
    ...docFiles.map((d) => [rel(d), d]),
    // Файлы правил сюда не входили, и это ловилось только вниманием: битая
    // ссылка на вложенный `CLAUDE.md` прошла пробу молча. Читают их чаще всего
    // остального, а проверяли — реже: адреса в них живут ровно так же и
    // устаревают ровно так же.
    ...CONFIG.rulesManifest.rules
      .map((r) => norm(path.join(HERE, r)))
      .filter((p) => existsSync(p))
      .map((p) => [path.relative(REPO, p).split(path.sep).join("/"), p]),
  ];

  // 14. путь в обратных кавычках указывает на существующий файл.
  // Якоря `файл:строка` закрыты пунктом 8; здесь — голые адреса без номера
  // строки, а их втрое больше. Адресом считается токен с косой чертой и
  // известным расширением: без косой это обычно имя из прозы («положите рядом
  // `config.json`»), а сегмент, начинающийся с точки, — перечисление
  // расширений (`.ts/.tsx/.scss`), а не путь.
  const PATH_EXT = /\.(tsx?|scss|md|json|mjs)$/;
  const looksLikePath = (tok) =>
    tok.includes("/") &&
    PATH_EXT.test(tok) &&
    tok.split("/").every((s) => s === "." || s === ".." || !s.startsWith("."));
  // `everyPath` собран под подсчёт папок и намеренно держит только
  // `.ts/.tsx/.scss/.md`; расширять его нельзя — на его составе стоят числа
  // заявленных папок. Поэтому у сверки путей свой инвентарь: тот же список
  // плюс скрипты, на которые база ссылается по имени.
  const scriptFiles = [];
  (function walkScripts(dir) {
    for (const e of readdirSync(dir)) {
      const full = path.join(dir, e);
      if (statSync(full).isDirectory()) walkScripts(full);
      else if (e.endsWith(".mjs")) scriptFiles.push(norm(full));
    }
  })(norm(path.join(REPO, "src")));
  const inventory = [...everyPath, ...scriptFiles];
  const knownDangling = new Set(CONFIG.docPathExceptions);
  const danglingPaths = [];
  let pathTokens = 0;
  for (const [name, at] of docSources) {
    const dir = norm(path.dirname(at));
    for (const hit of readFileSync(at, "utf8").matchAll(/`([^`\n]+)`/g)) {
      let tok = hit[1].trim();
      if (/[\s(){}*[\]<>|,]/.test(tok)) continue;
      tok = tok.replace(/[:#].*$/, "");
      if (!looksLikePath(tok)) continue;
      pathTokens++;
      if (knownDangling.has(`${name}|${tok}`)) continue;
      const asRelative =
        tok.startsWith("./") || tok.startsWith("../")
          ? norm(path.resolve(dir, tok))
          : null;
      // `locate` требует ОДНОЗНАЧНОГО разрешения и молчит, когда путь есть в
      // двух копиях, — а у парных форков так почти всё (`runtime/types.ts`
      // живёт и в движке, и в форке). Для вопроса «существует ли файл»
      // неоднозначность отсутствием не является, поэтому запасной шаг —
      // совпадение по хвосту пути.
      if (
        (asRelative !== null && existsSync(asRelative)) ||
        locate(tok, null) !== null ||
        inventory.some((f) => f.endsWith("/" + tok))
      )
        continue;
      danglingPaths.push(`${name}: ${tok}`);
    }
  }
  console.log("=== Пути в обратных кавычках ===");
  console.log(
    `  проверено: ${pathTokens}, ведут в никуда: ${danglingPaths.length}`,
  );
  for (const d of danglingPaths) console.log("    " + d);

  // 15. ALL_CAPS-имя в обратных кавычках существует в исходниках.
  // Константы база называет поимённо, и переименование оставляет в тексте имя,
  // которого больше нет. Маркеры отложенной работы исключены: их в коде нет
  // намеренно — про них как раз и написано, что их быть не должно.
  const WORK_MARKERS = new Set(["TODO", "FIXME", "HACK", "XXX"]);
  const sourceBlob = [...files, ...styleFiles]
    .map((f) => readFileSync(f, "utf8"))
    .join(NEWLINE);
  const goneNames = [];
  let capsTokens = 0;
  for (const [name, at] of docSources) {
    // Имя ищется ВНУТРИ кода-спана, а не «в кавычках целиком»: база пишет и
    // `NAME`, и `NAME = 400`, и вторая форма при сверке по целому спану
    // молча не проверялась бы — на ней проверка и попалась при фальсификации.
    for (const span of readFileSync(at, "utf8").matchAll(/`([^`\n]+)`/g)) {
      // Только СОСТАВНОЕ имя, и не часть имени файла. Односложные заглавные
      // слова в тексте — это `CLAUDE.md`, `LOCALAPPDATA`, `PIPESTATUS`: имена
      // не из исходников, и проверять их здесь значило бы шуметь. Подчёркивание
      // отделяет константу проекта от такого слова надёжнее любого списка.
      for (const hit of span[1].matchAll(
        /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g,
      )) {
        if (WORK_MARKERS.has(hit[0])) continue;
        if (span[1][hit.index + hit[0].length] === ".") continue;
        capsTokens++;
        if (!sourceBlob.includes(hit[0])) goneNames.push(`${name}: ${hit[0]}`);
      }
    }
  }
  console.log("=== Имена констант в тексте ===");
  console.log(
    `  проверено: ${capsTokens}, нет в исходниках: ${goneNames.length}`,
  );
  for (const g of goneNames) console.log("    " + g);

  // 16. тест лежит в папке `tests/` своего слоя.
  // Соглашение несущее: база описывает каждый тест ПУТЁМ, а размер папки
  // считается по коду, отдельно от путей со словом `tests`. Перенос теста к
  // его файлу не уронил бы ни один прогон — `isTest` ловит и по суффиксу
  // имени, — зато обессмыслил бы записи базы молча.
  const strayTests = files.filter(
    (f) => /\.test\.tsx?$/.test(f) && !f.includes("/tests/"),
  );
  console.log("=== Тесты лежат в `tests/` ===");
  console.log(`  вне своей папки: ${strayTests.length}`);
  for (const s of strayTests) console.log("    " + rel(s));

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
    goneTests.length ||
    goneMapped.length ||
    uncovered.length ||
    undecided.length ||
    broken7.length ||
    broken.length ||
    wrong.length ||
    toolDrift.length ||
    undocumented.length ||
    deadAnchors.length ||
    closedTodos.length ||
    danglingTodo.length ||
    uncitedNew.length ||
    parked.length ||
    shelfDrift.length ||
    // Проверка, не влияющая на код возврата, печатает, но не держит. Здесь
    // такое уже случилось однажды: сверка разрешений среды была добавлена
    // мимо этого списка и молча не роняла прогон.
    settingsDrift.length ||
    skillDrift.length ||
    unclassified.length ||
    danglingRefs.length ||
    danglingPaths.length ||
    goneNames.length ||
    strayTests.length ||
    unresolved.length
  )
    process.exitCode = 1;
}
