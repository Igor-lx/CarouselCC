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
([`config/resolve/buildConfig.ts`](../../config/resolve/buildConfig.ts)); it does **not**
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
- This trust extends all the way down, and **the line it draws is repair, not
  arithmetic**. The two are routinely confused, and the confusion has already
  cost a wrong change here, so it is spelled out:

  - **A number outside its declared range is still that number**, and clamping
    it to the nearest end is ordinary arithmetic, not a rescue. The engines do
    exactly that in several places (`safeResistance`, the `Math.max(0, …)`
    around curvature and magnitudes), and it is not a violation of this
    decision: a resistance of `1.4` clamped to `1` still behaves like the
    maximum the caller asked for, only bounded.
  - **A value that is not a number is never substituted with a plausible one.**
    It propagates — the offset goes `NaN`, the transform is invalid, the
    behaviour visibly dies — and that is the intended signal. The asymmetry is
    not aesthetic: a clamped `1.4` is still legible to whoever set it, while a
    repaired `NaN` would read as a deliberate `0` ("none was asked for") and
    hide the mistake for good.

  Over-allocated acceleration/deceleration shares (accel + decel > 1) are not
  rescued either — they are reported by Diagnostic as a plain misconfiguration.
  See [`docs/architecture/diagnostics.md`](../architecture/diagnostics.md).
- **The other half of trusting — the breach must be visible in development —
  is carried by two things, and neither of them is the code being trusted.**
  `<Diagnostic />` audits every tuning constant for finiteness and range, and
  `modules/Diagnostic/tests/shippedConstants.test.ts` runs that audit against
  the set actually shipped, so a typo in `config/` turns the suite red before it
  reaches a finger. Where a blank from `shared/` is copied into a project with
  no such layer, the engine still keeps its half — the failure stays visible —
  and the new host owes itself the other. Each blank states this in its own
  README, because it cannot reference this decision: knowing about the carousel
  is exactly what a portable blank must not do.
- Diagnostic is strictly observe-only and its presence never changes the values
  the carousel uses, so the whole layer compiles out of production
  ([`docs/architecture/diagnostics.md`](../architecture/diagnostics.md)).
