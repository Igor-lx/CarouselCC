import { describe, expect, it } from "vitest";

import {
  PREDICATE_CASES,
  inComment,
  isCodePath,
  isDocPath,
  isStylePath,
  isTestPath,
  selfCheck,
  touchesRuntime,
} from "./graph.predicates.mjs";

/**
 * Набор на словарь области инструмента.
 *
 * Инструмент — единственная часть обвязки, которая держит все остальные, и до
 * этого файла его не держало ничто: `0` экспортов, обход репозитория при
 * импорте, и потому ни одной точки, куда можно было бы войти тестом. Три
 * дефекта подряд нашлись только потому, что проба случайно посмотрела именно
 * туда, — и все три жили в одном месте: в решении «к какому файлу относится
 * этот вопрос».
 *
 * Таблица случаев живёт **в самом словаре**, а не здесь, и её же гоняет
 * самопроверка инструмента на каждом вызове. Два списка разошлись бы молча:
 * обе стороны были бы зелёными, просто про разное.
 */

describe("словарь области", () => {
  // Та же таблица, что гоняет сам инструмент. Здесь она даёт читаемый отчёт:
  // самопроверка умеет только отказаться работать.
  it.each(PREDICATE_CASES)("%s(%s) === %s", (name, input, want) => {
    const by = {
      isTestPath,
      isStylePath,
      isDocPath,
      isCodePath,
      touchesRuntime,
    };
    expect(by[name](input)).toBe(want);
  });

  it("самопроверка не находит расхождений", () => {
    expect(selfCheck()).toEqual([]);
  });

  it("таблица покрывает каждый предикат области", () => {
    const covered = new Set(PREDICATE_CASES.map(([name]) => name));
    for (const name of [
      "isTestPath",
      "isStylePath",
      "isDocPath",
      "isCodePath",
      "touchesRuntime",
    ]) {
      expect(covered.has(name), `${name} без единого случая`).toBe(true);
    }
  });

  // Различение, а не совпадение: у каждого предиката в таблице обязаны быть обе
  // стороны. Список только из `true` зелен и на предикате, который всегда
  // говорит «да».
  it("у каждого предиката в таблице есть и «да», и «нет»", () => {
    const sides = new Map();
    for (const [name, , want] of PREDICATE_CASES) {
      const seen = sides.get(name) ?? new Set();
      seen.add(want);
      sides.set(name, seen);
    }
    for (const [name, seen] of sides) {
      expect(seen.size, `${name} проверен только одной стороной`).toBe(2);
    }
  });
});

describe("inComment", () => {
  // Своя группа: предикат берёт не путь, а строку и позицию, и таблицей путей
  // его не выразить.
  it("видит хвост строчного комментария", () => {
    const line = "const a = 1; // имя";
    expect(inComment(line, line.indexOf("имя"))).toBe(true);
  });

  it("не считает комментарием код перед ним", () => {
    const line = "const a = 1; // имя";
    expect(inComment(line, line.indexOf("const"))).toBe(false);
  });

  it("видит строку блочного комментария и её продолжение", () => {
    expect(inComment("  /* имя", 5)).toBe(true);
    expect(inComment("   * имя", 5)).toBe(true);
  });

  it("не считает комментарием обычный код", () => {
    const line = 'export const NAME = "x";';
    expect(inComment(line, line.indexOf("NAME"))).toBe(false);
  });
});
