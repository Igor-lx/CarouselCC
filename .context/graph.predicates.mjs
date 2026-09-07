/**
 * Словарь области: «к какому файлу относится этот вопрос».
 *
 * Вынесен из `graph.mjs` не ради красоты. Инструмент задаёт вопросы разного
 * рода — про тесты, про поведение в браузере, про публичную поверхность полки, —
 * и каждый из них применим не ко всякому файлу. Пока это решение выводилось на
 * месте, оно выводилось по-разному: где-то учитывали расширение, где-то тест,
 * где-то ни того ни другого. Три дефекта подряд были именно забытым слагаемым
 * такой комбинации — вопрос срабатывал на README и на тестовом файле, у которых
 * спрашиваемого свойства нет вовсе.
 *
 * Поэтому здесь **чистые функции от пути**, без чтения диска и без состояния:
 * их можно прогнать таблицей, что и делают оба слоя — набор тестов и
 * самопроверка самого инструмента.
 */

/** Тест: лежит в папке слоя `tests/` либо назван суффиксом. */
export const isTestPath = (f) => /\/tests\//.test(f) || /\.test\.tsx?$/.test(f);

/** Лист стилей. В граф импортов не входит — его подключает сборщик. */
export const isStylePath = (f) => /\.scss$/.test(f);

/** Документ. */
export const isDocPath = (f) => /\.md$/.test(f);

/**
 * Исполняемый модуль: то, у чего есть форма и ответ, то есть контракт. Тест
 * сюда не входит — он сам проверка, поверхности у него нет.
 */
export const isCodePath = (f) => /\.tsx?$/.test(f) && !isTestPath(f);

/**
 * То, чья правка меняет наблюдаемое поведение продукта: код или стиль. Стиль
 * входит намеренно — в графе импортов его не видно, а краску он меняет.
 * Документ и тест — нет: первый ничего не исполняет, второй и есть проверка.
 */
export const touchesRuntime = (f) => isCodePath(f) || isStylePath(f);

/**
 * Позиция в строке приходится на комментарий. Нужен там, где сверка спрашивает
 * «существует ли имя в ИСПОЛНЯЕМОМ тексте»: иначе она держится за собственное
 * эхо — переименовали по всему коду, оставили старое имя в комментарии, и
 * запись считается живой.
 */
export const inComment = (line, at) => {
  const before = line.slice(0, at);
  return before.includes("//") || /^\s*(\*|\/\*)/.test(line);
};

/**
 * Таблица случаев — **единственный** источник для обоих слоёв: набора тестов и
 * самопроверки инструмента. Две отдельные таблицы разошлись бы, и разошлись бы
 * молча, потому что обе зелёные.
 *
 * Случаи взяты не из головы: каждая строка с пометкой «дефект» — тот вход, на
 * котором инструмент уже отвечал неверно.
 */
export const PREDICATE_CASES = [
  // --- isTestPath ---
  ["isTestPath", "src/a/tests/b.ts", true],
  ["isTestPath", "src/a/b.test.ts", true],
  ["isTestPath", "src/a/b.test.tsx", true],
  ["isTestPath", "src/a/b.ts", false],
  ["isTestPath", "src/a/testing/b.ts", false],

  // --- isStylePath ---
  ["isStylePath", "src/a/b.module.scss", true],
  ["isStylePath", "src/a/b.ts", false],

  // --- isDocPath ---
  ["isDocPath", "src/a/README.md", true],
  ["isDocPath", "src/a/b.ts", false],

  // --- isCodePath: дефект — тест считался кодом с поверхностью ---
  ["isCodePath", "src/a/b.ts", true],
  ["isCodePath", "src/a/b.tsx", true],
  ["isCodePath", "src/a/tests/b.test.tsx", false],
  ["isCodePath", "src/a/b.test.ts", false],
  ["isCodePath", "src/a/README.md", false],
  ["isCodePath", "src/a/b.scss", false],

  // Точка в расширении — литерал, а не «любой символ». Различить это можно
  // только входом, где перед `ts` стоит буква: на настоящих путях обе формы
  // отвечают одинаково. Найдено собственной опиской при откате правки.
  ["isCodePath", "src/a/bartsx", false],
  ["isCodePath", "src/a/b_ts", false],
  ["isStylePath", "src/a/bscss", false],
  ["isDocPath", "src/a/READMEmd", false],
  ["isTestPath", "src/a/b_test_ts", false],

  // --- touchesRuntime: дефекты — README и тест требовали браузерного прогона ---
  ["touchesRuntime", "src/a/b.ts", true],
  ["touchesRuntime", "src/a/b.tsx", true],
  ["touchesRuntime", "src/a/b.module.scss", true],
  ["touchesRuntime", "src/a/README.md", false],
  ["touchesRuntime", "src/a/tests/b.test.tsx", false],
  ["touchesRuntime", "src/a/b.test.ts", false],
];

const BY_NAME = {
  isTestPath,
  isStylePath,
  isDocPath,
  isCodePath,
  touchesRuntime,
};

/**
 * Прогон таблицы. Возвращает список расхождений — пустой, когда всё сходится.
 *
 * Инструмент зовёт это на КАЖДОМ запуске и отказывается работать при непустом
 * списке. Причина в том, что «запустить тесты после правки» иначе держится
 * памятью: набор гоняется, когда о нём вспомнили, а инструмент вызывают
 * постоянно — и сломанный словарь виден в тот же миг, а не в конце дня.
 */
export const selfCheck = () => {
  const failed = [];
  for (const [name, input, want] of PREDICATE_CASES) {
    const got = BY_NAME[name](input);
    if (got !== want) failed.push(`${name}(${input}) = ${got}, ждали ${want}`);
  }
  return failed;
};
