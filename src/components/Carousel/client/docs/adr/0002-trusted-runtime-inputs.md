# ADR-002 — Trusted runtime inputs, external validation boundary

**Status:** Accepted

## Context

Public props, injected environment signals, slide IDs, numeric config values,
slot attachment, and CSS/class overrides all originate outside the component. A
component can either defend against every malformed input at runtime, or treat
inputs as caller-owned and keep the runtime path lean. Defensive validation
branches scattered through the render path are pure cost in the common case,
where the host already passes correct data.

## Decision

Treat all such values as **caller-owned runtime values**. The carousel applies
documented defaults only for `undefined` public props
([`config/buildConfig.ts`](../../config/buildConfig.ts)); it does **not**
validate, coerce, repair, deduplicate, or enforce these values during
production runtime.

Data hygiene is the host's responsibility, before render — for example with the
exported Zod schemas ([`public-api/schemas.ts`](../../public-api/schemas.ts))
when data comes from an API, CMS, or user config.

Observability is a **development** concern: the host mounts the `<Diagnostic />`
slot, which reports missing or invalid inputs and invariant risks but never
feeds corrected values back into the carousel.

## Consequences

- The production component stays small, predictable, and free of defensive
  validation branches.
- Invalid input fails **visibly** at the integration boundary (NaN propagation,
  impossible geometry, malformed transforms) — the intended signal that the
  input must be fixed, not silently absorbed.
- This trust extends all the way down: there is **no runtime normalization
  anywhere**. Over-allocated acceleration/deceleration shares (accel + decel > 1)
  are not rescued by the engine either — they are reported by Diagnostic as a
  plain misconfiguration. See
  [`docs/architecture/diagnostics.md`](../architecture/diagnostics.md).
- Diagnostic is strictly observe-only and its presence never changes the values
  the carousel uses, so the whole layer compiles out of production
  ([`docs/architecture/diagnostics.md`](../architecture/diagnostics.md)).
