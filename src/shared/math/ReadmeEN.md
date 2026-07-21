# `math` — numeric validators

Pure, dependency-free type guards for validating config values, props and
constants. Every guard accepts `unknown` and implies finiteness — `NaN`,
`±Infinity` and non-numbers never pass, so no separate finite pre-check is
needed.

- Guards: `isFiniteNumber`, `isPositiveFinite`, `isNonNegativeFinite`,
  `isPositiveInteger`, `isNonNegativeInteger`.
- Factories: `greaterThan(min)`, `atLeast(min)`, `inRangeInclusive(min,max)`,
  `inRangeExclusiveLower/Upper(min,max)`.

```ts
if (!isPositiveInteger(count)) { /* reject */ }
```
