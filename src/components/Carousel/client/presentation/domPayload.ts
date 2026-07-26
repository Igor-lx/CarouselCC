// See docs/architecture/presentation.md
import { SLIDE_CLASS_KEYS } from "../public-api/types";
import type { ClassNameMap, SlideClassMap } from "../public-api/types";

/** Project the merged class map onto the slide-facing subset (missing → `""`,
 * never `undefined`, which would drop the attribute). */
export const buildSlideClassMap = (classNames: ClassNameMap): SlideClassMap => {
  const map = {} as SlideClassMap;
  for (const key of SLIDE_CLASS_KEYS) map[key] = classNames[key] ?? "";
  return map;
};

/** Active viewport flags → `data-<flag>="true"` on the root (absent = off). */
export const buildFlagAttributes = (
  flags: Readonly<Record<string, boolean>>,
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(flags)
      .filter(([, isOn]) => isOn)
      .map(([name]) => [`data-${name}`, "true"]),
  );
