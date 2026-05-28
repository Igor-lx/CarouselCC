import { describe, expect, it } from "vitest";

import type { CarouselDiagnosticContextValue } from "../../../context";
import { collectPropWarnings } from "./propChecks";

type DiagnosticProps = CarouselDiagnosticContextValue["props"];

const baseProps = (overrides: Partial<DiagnosticProps> = {}): DiagnosticProps => ({
  visibleSlidesNr: undefined,
  durationAutoplay: undefined,
  durationStep: undefined,
  jumpSpeedMultiplier: undefined,
  intervalAutoplay: undefined,
  errAltPlaceholder: undefined,
  userEnvironment: undefined,
  ...overrides,
});

const environmentWarnings = (props: DiagnosticProps) =>
  collectPropWarnings(props).filter((w) => w.layer === "Environment");

describe("collectPropWarnings — value props", () => {
  it("emits nothing when every prop is undefined except a complete environment", () => {
    const warnings = collectPropWarnings(
      baseProps({
        userEnvironment: { reducedMotion: false, touch: false, dataSaver: false },
      }),
    );
    expect(warnings).toHaveLength(0);
  });

  it("flags an explicitly invalid numeric prop", () => {
    const warnings = collectPropWarnings(
      baseProps({
        visibleSlidesNr: -1,
        userEnvironment: { reducedMotion: false, touch: false, dataSaver: false },
      }),
    );
    expect(warnings.some((w) => w.field === "visibleSlidesNr")).toBe(true);
  });
});

describe("collectPropWarnings — environment wiring", () => {
  it("reports all three signals when userEnvironment is absent", () => {
    const warnings = environmentWarnings(baseProps());
    expect(warnings.map((w) => w.field).sort()).toEqual([
      "userEnvironment.dataSaver",
      "userEnvironment.reducedMotion",
      "userEnvironment.touch",
    ]);
    for (const warning of warnings) {
      expect(warning.severity).toBe("LOGICAL");
      expect(warning.layer).toBe("Environment");
    }
  });

  it("reports only the missing fields of a partial environment", () => {
    const warnings = environmentWarnings(
      baseProps({ userEnvironment: { touch: true } }),
    );
    expect(warnings.map((w) => w.field).sort()).toEqual([
      "userEnvironment.dataSaver",
      "userEnvironment.reducedMotion",
    ]);
  });

  it("reports a field whose value is not a boolean", () => {
    const warnings = environmentWarnings(
      baseProps({
        userEnvironment: { reducedMotion: "yes", touch: true, dataSaver: false },
      }),
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.field).toBe("userEnvironment.reducedMotion");
    expect(warnings[0]!.actual).toBe("yes");
  });

  it("emits nothing when every environment signal is a boolean", () => {
    const warnings = environmentWarnings(
      baseProps({
        userEnvironment: { reducedMotion: true, touch: false, dataSaver: true },
      }),
    );
    expect(warnings).toHaveLength(0);
  });

  it("calls out the accessibility consequence for a missing reducedMotion signal", () => {
    const warnings = environmentWarnings(baseProps());
    const reducedMotion = warnings.find(
      (w) => w.field === "userEnvironment.reducedMotion",
    );
    expect(reducedMotion?.consequence.toLowerCase()).toContain("accessibility");
  });
});
