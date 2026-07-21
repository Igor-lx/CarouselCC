# `math` — числовые валидаторы

Чистые type-guard'ы без зависимостей для проверки значений конфига, пропсов
и констант. Каждый принимает `unknown` и подразумевает конечность — `NaN`,
`±Infinity` и не-числа не проходят, поэтому отдельная проверка на конечность
не нужна.

- Гварды: `isFiniteNumber`, `isPositiveFinite`, `isNonNegativeFinite`,
  `isPositiveInteger`, `isNonNegativeInteger`.
- Фабрики: `greaterThan(min)`, `atLeast(min)`, `inRangeInclusive(min,max)`,
  `inRangeExclusiveLower/Upper(min,max)`.

```ts
if (!isPositiveInteger(count)) { /* отклонить */ }
```
