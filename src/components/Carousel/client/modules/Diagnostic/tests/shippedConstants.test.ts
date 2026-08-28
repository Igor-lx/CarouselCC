import { describe, expect, it } from "vitest";

import { collectConstantWarnings } from "../checks/constantChecks";
import { collectWidgetWarnings } from "../checks/widgetChecks";
import { PAGINATION_WIDGET_DEFAULTS } from "../../Pagination/widget/defaults";

/**
 * `collectConstantWarnings` audits the tuning constants this project actually
 * ships — it takes no arguments and reads them straight from `config/`.
 *
 * That makes it testable exactly one way, and it happens to be the useful one:
 * the shipped set must be internally consistent. Someone raising an
 * acceleration share to 0.9 next to a deceleration share of 0.7 is a plausible
 * afternoon's tuning, and it breaks a profile invariant with nothing to show
 * for it at rest — the deck simply behaves oddly under one specific motion.
 *
 * This is the check the checker cannot do for itself: the audit only helps if
 * the baseline it is compared against is clean.
 */

describe("the constants this project ships", () => {
  it("pass their own consistency audit", () => {
    const warnings = collectConstantWarnings();
    expect(
      warnings.map((w) => `${w.layer} -> ${w.field}: ${w.expected}`),
    ).toEqual([]);
  });

  // NOT asserted: that the collector is non-vacuous. It reads the constants
  // from the module directly, so there is no way to feed it a violating set
  // without mocking `config/` — and the only alternative, measuring the
  // function's own source, is implementation policing of the kind this suite
  // removed elsewhere. The widget audit below covers the warning machinery
  // itself on inputs that CAN be injected.
});

describe("collectWidgetWarnings", () => {
  const healthy = {
    visibleDots: PAGINATION_WIDGET_DEFAULTS.visibleDots,
    dotSize: PAGINATION_WIDGET_DEFAULTS.dotSize,
    dotGap: PAGINATION_WIDGET_DEFAULTS.dotGap,
    scaleFactor: PAGINATION_WIDGET_DEFAULTS.scaleFactor,
  };

  const fieldsFor = (overrides: Record<string, unknown>) =>
    collectWidgetWarnings({ ...healthy, ...overrides }).map((w) => w.field);

  it("says nothing about the widget's own defaults", () => {
    // The baseline the audit compares against has to be clean, or every host
    // that changes nothing still gets warned.
    expect(collectWidgetWarnings(healthy)).toEqual([]);
  });

  it("requires an odd dot count — the strip needs a centre", () => {
    expect(fieldsFor({ visibleDots: 4 })).toContain("visibleDots");
    expect(fieldsFor({ visibleDots: 7 })).toEqual([]);
  });

  it("requires at least three dots, so there is something either side", () => {
    expect(fieldsFor({ visibleDots: 1 })).toContain("visibleDots");
    expect(fieldsFor({ visibleDots: 3 })).toEqual([]);
  });

  it("rejects a scale factor outside (0, 1] — dots shrink outward, never grow", () => {
    expect(fieldsFor({ scaleFactor: 0 })).toContain("scaleFactor");
    expect(fieldsFor({ scaleFactor: 1.5 })).toContain("scaleFactor");
    expect(fieldsFor({ scaleFactor: 1 })).toEqual([]);
  });

  it("rejects a non-positive dot size", () => {
    expect(fieldsFor({ dotSize: 0 })).toContain("dotSize");
    expect(fieldsFor({ dotSize: -4 })).toContain("dotSize");
  });

  it("allows a zero gap but not a negative one", () => {
    expect(fieldsFor({ dotGap: 0 })).toEqual([]);
    expect(fieldsFor({ dotGap: -1 })).toContain("dotGap");
  });

  it("rejects the values that slip past a naive number check", () => {
    for (const bad of [Number.NaN, Infinity, "5", null, undefined]) {
      expect(fieldsFor({ dotSize: bad }), String(bad)).toContain("dotSize");
    }
  });

  it("reports every bad prop, not just the first", () => {
    expect(fieldsFor({ visibleDots: 2, dotSize: -1 }).length).toBeGreaterThan(
      1,
    );
  });
});
