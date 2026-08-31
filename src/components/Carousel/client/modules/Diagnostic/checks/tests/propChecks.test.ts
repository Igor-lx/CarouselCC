import { describe, expect, it } from "vitest";

import type { CarouselDiagnosticContextValue } from "../../../../context";
import { collectPropWarnings } from "../propChecks";

type DiagnosticProps = CarouselDiagnosticContextValue["props"];

/** All public props undefined — the public-default contract, no warnings. */
const baseProps = (
  overrides: Partial<DiagnosticProps> = {},
): DiagnosticProps => ({
  slidesData: [{ id: "a" }, { id: "b" }],
  visibleSlidesNr: undefined,
  durationAutoplay: undefined,
  durationStep: undefined,
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
        userEnvironment: {
          reducedMotion: false,
          touch: false,
          dataSaver: false,
        },
      }),
    );
    expect(warnings).toHaveLength(0);
  });

  it("flags an explicitly invalid numeric prop", () => {
    const warnings = collectPropWarnings(
      baseProps({
        visibleSlidesNr: -1,
        userEnvironment: {
          reducedMotion: false,
          touch: false,
          dataSaver: false,
        },
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
        userEnvironment: {
          reducedMotion: "yes",
          touch: true,
          dataSaver: false,
        },
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

describe("slide identity", () => {
  // The id IS the React key: a repeat makes React reuse one node for two
  // lanes. ADR-002 keeps the deck as it came, so being SEEN is the whole
  // guarantee the host gets.
  it("reports a repeated id, naming the value that repeats", () => {
    const warnings = collectPropWarnings(
      baseProps({
        slidesData: [{ id: "a" }, { id: "b" }, { id: "a" }],
      }),
    );
    const duplicate = warnings.filter((w) => w.field === "slidesData");
    expect(duplicate).toHaveLength(1);
    expect(duplicate[0]!.severity).toBe("CRITICAL");
    expect(duplicate[0]!.actual).toEqual(["a"]);
  });

  it("counts slides with no id at all as sharing one key", () => {
    const warnings = collectPropWarnings(baseProps({ slidesData: [{}, {}] }));
    expect(warnings.some((w) => w.field === "slidesData")).toBe(true);
  });

  it("stays silent on a unique deck, and on a deck that is not an array", () => {
    expect(
      collectPropWarnings(baseProps()).some((w) => w.field === "slidesData"),
    ).toBe(false);
    expect(
      collectPropWarnings(baseProps({ slidesData: null })).some(
        (w) => w.field === "slidesData",
      ),
    ).toBe(false);
  });
});

/**
 * The duration and interval props, which no test reached before: whole
 * branches of the collector, invisible to every check in the project.
 *
 * They are the ones that fail quietly. A bad `visibleSlidesNr` shows up as a
 * deck that renders wrong; a bad `durationStep` shows up as motion that is
 * subtly off — or as a ride that never ends — and the host has nothing telling
 * it which number caused that.
 */
describe("collectPropWarnings — the timing props", () => {
  // Слой Environment сюда не входит: у него свои случаи выше, а без
  // `userEnvironment` он говорит всегда и заглушал бы счёт этого блока.
  const fieldsOf = (props: DiagnosticProps) =>
    collectPropWarnings(props)
      .filter((warning) => warning.layer !== "Environment")
      .map((warning) => warning.field);

  it("says nothing about a timing prop the host did not pass", () => {
    // Absent is the documented default, not an error — and the difference
    // between "absent" and "zero" is the whole point of the guard.
    expect(fieldsOf(baseProps())).not.toContain("durationStep");
    expect(fieldsOf(baseProps())).not.toContain("intervalAutoplay");
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, "500"])(
    "flags a step duration of %p",
    (value) => {
      expect(fieldsOf(baseProps({ durationStep: value }))).toContain(
        "durationStep",
      );
    },
  );

  it("flags an autoplay duration by the same rule, and names it separately", () => {
    // Two fields, one loop: a warning that names the wrong one sends the host
    // to the wrong prop.
    const fields = fieldsOf(
      baseProps({ durationAutoplay: 0, durationStep: 0 }),
    );
    expect(fields).toContain("durationAutoplay");
    expect(fields).toContain("durationStep");
  });

  it("accepts a positive duration without comment", () => {
    expect(fieldsOf(baseProps({ durationStep: 800 }))).toHaveLength(0);
  });

  it("lets an autoplay interval be zero, but not negative or broken", () => {
    // Zero is a legal interval — "as soon as the last ride settles" — so the
    // rule here is non-negative, not positive. Copy the duration rule across
    // and a valid configuration starts warning.
    expect(fieldsOf(baseProps({ intervalAutoplay: 0 }))).toHaveLength(0);
    expect(fieldsOf(baseProps({ intervalAutoplay: -1 }))).toContain(
      "intervalAutoplay",
    );
    expect(fieldsOf(baseProps({ intervalAutoplay: Number.NaN }))).toContain(
      "intervalAutoplay",
    );
  });

  it("flags a placeholder that would render as nothing", () => {
    expect(fieldsOf(baseProps({ errAltPlaceholder: "" }))).toContain(
      "errAltPlaceholder",
    );
    expect(fieldsOf(baseProps({ errAltPlaceholder: "   " }))).toContain(
      "errAltPlaceholder",
    );
    expect(fieldsOf(baseProps({ errAltPlaceholder: "Failed" }))).toHaveLength(
      0,
    );
  });
});
