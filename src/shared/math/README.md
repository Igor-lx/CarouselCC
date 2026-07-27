# math

Pure, dependency-free numeric type guards for validating config values, props,
and constants. Every guard accepts `unknown` and **implies finiteness** — `NaN`,
`±Infinity`, and non-numbers never pass — so callers need no separate finite
pre-check.

## API

Guards (`unknown → value is number`):

- **`isFiniteNumber`**, **`isPositiveFinite`**, **`isNonNegativeFinite`**,
  **`isPositiveInteger`**, **`isNonNegativeInteger`**.

Factories (return a guard):

- **`greaterThan(min)`**, **`atLeast(min)`**,
- **`inRangeInclusive(min, max)`** (`min ≤ v ≤ max`),
  **`inRangeExclusiveLower(min, max)`** (`min < v ≤ max`),
  **`inRangeExclusiveUpper(min, max)`** (`min ≤ v < max`).

## Usage

```ts
if (!isPositiveInteger(count)) { /* reject */ }
const inUnit = inRangeInclusive(0, 1);
```
