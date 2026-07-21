import { SLIDE_CLASS_KEYS } from "../public-api/types";
import type { ClassNameMap, SlideClassMap } from "../public-api/types";

/**
 * The non-style halves of the same JS→DOM contract: which CLASSES a slide
 * receives, and which viewport states surface as DATA ATTRIBUTES. Pure and
 * testable — the composition root should compose, not assemble payloads.
 */

/**
 * Project the merged class map onto the slide-facing subset. `SlideItem`
 * takes exactly these keys, so the projection is what keeps the slide from
 * depending on the component's full class surface. A missing key becomes
 * `""` rather than `undefined` — `className={undefined}` would render the
 * attribute away and break a host's own override chain.
 */
export const buildSlideClassMap = (classNames: ClassNameMap): SlideClassMap => {
  const map = {} as SlideClassMap;
  for (const key of SLIDE_CLASS_KEYS) map[key] = classNames[key] ?? "";
  return map;
};

/**
 * Active viewport flags → `data-<flag>="true"` attributes on the root. Only
 * ACTIVE flags are stamped: an absent attribute is the "off" state, so a
 * stylesheet matches `[data-short-landscape="true"]` and nothing else has to
 * be written for the default case.
 */
export const buildFlagAttributes = (
  flags: Readonly<Record<string, boolean>>,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(flags)
      .filter(([, isOn]) => isOn)
      .map(([name]) => [`data-${name}`, "true"]),
  );
