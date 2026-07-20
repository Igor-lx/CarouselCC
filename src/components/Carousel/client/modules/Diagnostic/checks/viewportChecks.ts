import {
  SLIDE_CANONICAL_SOURCE_MEDIA,
  SLIDE_VIEWPORT_BREAKPOINTS,
} from "../../../config";
import type { CarouselSlideMediaView } from "../../../context";
import type { CarouselDiagnosticWarning } from "../types";

/**
 * Viewport-axes audit (config/viewport.ts). The axes table is the single
 * source for breakpoint NAMES and NUMBERS; these checks verify every leg
 * that derives from it at runtime:
 *  - the numbers themselves (finite, non-negative, unique — NO ordering or
 *    naming semantics: names are custom by design and resolution is purely
 *    numeric, so declaration order cannot shadow anything);
 *  - the canonical media strings parse in THIS browser (`matchMedia` reports
 *    an unparseable query as `"not all"` — the real parser, not a regex);
 *  - the LIVE slide data: every `<source media>` the host actually fed the
 *    carousel uses a canonical string (unlike the CI sync test, this covers
 *    arbitrary hosts and hand-written data);
 *  - the stylesheets: every `[data-breakpoint="…"]` /
 *    `[data-orientation="…"]` selector references a REAL state name — a typo
 *    there is a silently dead style block. Cross-origin sheets cannot be
 *    read (the browser throws on `cssRules`) and are skipped; the
 *    component's own module styles are always same-origin.
 */

const canonical = new Set<string>(SLIDE_CANONICAL_SOURCE_MEDIA);
const breakpointNames = new Set<string>(
  Object.keys(SLIDE_VIEWPORT_BREAKPOINTS),
);
const ORIENTATION_NAMES = new Set(["portrait", "landscape"]);

export const collectViewportAxisWarnings =
  (): CarouselDiagnosticWarning[] => {
    const out: CarouselDiagnosticWarning[] = [];
    const entries = Object.entries(SLIDE_VIEWPORT_BREAKPOINTS) as Array<
      [string, number]
    >;

    if (entries.length === 0) {
      out.push({
        severity: "CRITICAL",
        layer: "Viewport",
        field: "SLIDE_VIEWPORT_BREAKPOINTS",
        actual: "{}",
        expected: "At least one tier (a `0` fallback tier at minimum)",
        consequence:
          "No breakpoint resolves; data-breakpoint is empty and every styled state is dead",
      });
      return out;
    }

    const seen = new Map<number, string>();
    for (const [name, px] of entries) {
      if (!Number.isFinite(px) || px < 0) {
        out.push({
          severity: "CRITICAL",
          layer: "Viewport",
          field: `SLIDE_VIEWPORT_BREAKPOINTS.${name}`,
          actual: px,
          expected: "A finite, non-negative min-width in px",
          consequence:
            "The tier can never resolve and its canonical media string is malformed",
        });
        continue;
      }
      const holder = seen.get(px);
      if (holder !== undefined) {
        out.push({
          severity: "CRITICAL",
          layer: "Viewport",
          field: `SLIDE_VIEWPORT_BREAKPOINTS.${name}`,
          actual: px,
          expected: `A threshold distinct from "${holder}" (${px}px)`,
          consequence:
            "Two tiers share one threshold — which name resolves is accidental",
        });
      }
      seen.set(px, name);
    }

    if (![...seen.keys()].includes(0)) {
      out.push({
        severity: "LOGICAL",
        layer: "Viewport",
        field: "SLIDE_VIEWPORT_BREAKPOINTS",
        actual: [...seen.keys()].join(", "),
        expected: "One `0` tier as the always-matching fallback",
        consequence:
          "Below the narrowest threshold the resolver falls back to the narrowest tier implicitly — declare the intent with a 0 tier",
      });
    }

    if (typeof window !== "undefined") {
      for (const media of SLIDE_CANONICAL_SOURCE_MEDIA) {
        if (window.matchMedia(media).media === "not all") {
          out.push({
            severity: "CRITICAL",
            layer: "Viewport",
            field: "SLIDE_CANONICAL_SOURCE_MEDIA",
            actual: media,
            expected: "A media condition this browser can parse",
            consequence:
              "The condition never matches: its geometry state, asset choice and veil never fire",
          });
        }
      }
    }

    return out;
  };

export const collectSlideSourceMediaWarnings = (
  slides: readonly CarouselSlideMediaView[],
): CarouselDiagnosticWarning[] => {
  const offending = new Set<string>();
  for (const slide of slides) {
    for (const source of slide.sources ?? []) {
      if (source.media !== undefined && !canonical.has(source.media)) {
        offending.add(source.media);
      }
    }
  }
  return [...offending].map((media) => ({
    severity: "LOGICAL",
    layer: "Viewport",
    field: "slidesData image.sources[].media",
    actual: media,
    expected: "One of the canonical axis strings (SLIDE_CANONICAL_SOURCE_MEDIA)",
    consequence:
      "The browser still evaluates it, but nothing guarantees this crop flips together with the slide box, the warm and the veil",
  }));
};

const collectSelectorStateNames = (
  selector: string,
  attribute: string,
): string[] =>
  [...selector.matchAll(new RegExp(`\\[${attribute}="([^"]*)"\\]`, "g"))].map(
    (match) => match[1]!,
  );

const walkRules = (
  rules: CSSRuleList,
  onSelector: (selector: string) => void,
): void => {
  for (const rule of rules) {
    if (rule instanceof CSSStyleRule) onSelector(rule.selectorText);
    const nested = (rule as { cssRules?: CSSRuleList }).cssRules;
    if (nested) walkRules(nested, onSelector);
  }
};

/**
 * Stylesheet scan — call AFTER mount (styles must be attached). Verifies the
 * two directions of the names contract:
 *  1. every state name referenced in CSS exists in the axes (a typo is a
 *     silently dead block) — firm warning;
 *  2. a declared breakpoint tier never referenced in CSS — soft note, since
 *     a state may deliberately ride on the base variables.
 */
export const collectViewportCssWarnings = (): CarouselDiagnosticWarning[] => {
  if (typeof document === "undefined") return [];
  const out: CarouselDiagnosticWarning[] = [];
  const referencedBreakpoints = new Set<string>();

  for (const sheet of document.styleSheets) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // cross-origin sheet — unreadable by design, skip
    }
    walkRules(rules, (selector) => {
      for (const name of collectSelectorStateNames(selector, "data-breakpoint")) {
        referencedBreakpoints.add(name);
        if (!breakpointNames.has(name)) {
          out.push({
            severity: "LOGICAL",
            layer: "Viewport",
            field: "CSS [data-breakpoint]",
            actual: name,
            expected: `One of: ${[...breakpointNames].join(", ")}`,
            consequence:
              "The style block can never apply — the root never stamps this name (typo or renamed tier)",
          });
        }
      }
      for (const name of collectSelectorStateNames(selector, "data-orientation")) {
        if (!ORIENTATION_NAMES.has(name)) {
          out.push({
            severity: "LOGICAL",
            layer: "Viewport",
            field: "CSS [data-orientation]",
            actual: name,
            expected: 'One of: "portrait", "landscape"',
            consequence:
              "The style block can never apply — orientation is only ever stamped as portrait/landscape",
          });
        }
      }
    });
  }

  for (const name of breakpointNames) {
    if (!referencedBreakpoints.has(name)) {
      out.push({
        severity: "LOGICAL",
        layer: "Viewport",
        field: "SLIDE_VIEWPORT_BREAKPOINTS",
        actual: name,
        expected: "Referenced from at least one stylesheet (or deliberately unstyled)",
        consequence:
          "The tier resolves and stamps but styles nothing — intended fallback-to-base, or a forgotten block?",
      });
    }
  }

  return out;
};
