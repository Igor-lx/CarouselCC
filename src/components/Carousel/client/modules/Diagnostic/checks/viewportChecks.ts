import {
  SLIDE_CANONICAL_SOURCE_MEDIA,
  SLIDE_VIEWPORT_BASE_BREAKPOINT,
  SLIDE_VIEWPORT_BREAKPOINTS,
  SLIDE_VIEWPORT_FLAGS,
} from "../../../config";
import type { CarouselSlideMediaView } from "../../../context";
import type { CarouselDiagnosticWarning } from "../types";

// Viewport-axes audit (config/viewport.ts): breakpoint numbers, canonical media
// parseability, live slide <source media>, and CSS state names.
// See docs/architecture/diagnostics.md

// Lookup sets built on demand (a module-level const would survive tree-shaking).
const canonicalMediaSet = () => new Set<string>(SLIDE_CANONICAL_SOURCE_MEDIA);
const breakpointNameSet = () =>
  new Set<string>(Object.keys(SLIDE_VIEWPORT_BREAKPOINTS));
const flagNameSet = () => new Set<string>(Object.keys(SLIDE_VIEWPORT_FLAGS));
const orientationNameSet = () => new Set(["portrait", "landscape"]);

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
  const canonical = canonicalMediaSet();
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

// Stylesheet scan (call AFTER mount): CSS state names ↔ axes, both directions.
export const collectViewportCssWarnings = (): CarouselDiagnosticWarning[] => {
  if (typeof document === "undefined") return [];
  const breakpointNames = breakpointNameSet();
  const flagNames = flagNameSet();
  const ORIENTATION_NAMES = orientationNameSet();
  const out: CarouselDiagnosticWarning[] = [];
  const referencedBreakpoints = new Set<string>();
  const referencedFlags = new Set<string>();

  for (const sheet of document.styleSheets) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // cross-origin sheet — unreadable by design, skip
    }
    walkRules(rules, (selector) => {
      // Flags have no fixed anchor to typo-check; caught by the unreferenced note below.
      for (const flag of flagNames) {
        if (selector.includes(`[data-${flag}=`)) referencedFlags.add(flag);
      }
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

  // Flag a bad base-tier name first, so the exemption below is trusted.
  if (!breakpointNames.has(SLIDE_VIEWPORT_BASE_BREAKPOINT)) {
    out.push({
      severity: "LOGICAL",
      layer: "Viewport",
      field: "SLIDE_VIEWPORT_BASE_BREAKPOINT",
      actual: SLIDE_VIEWPORT_BASE_BREAKPOINT,
      expected: `One of the declared tiers: ${[...breakpointNames].join(", ")}`,
      consequence:
        "The base tier names no real tier — the base-rule exemption applies to nothing",
    });
  }

  for (const name of breakpointNames) {
    // The base tier is styled by the plain rule, so no attribute block is expected.
    if (name === SLIDE_VIEWPORT_BASE_BREAKPOINT) continue;
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

  for (const flag of flagNames) {
    if (!referencedFlags.has(flag)) {
      out.push({
        severity: "LOGICAL",
        layer: "Viewport",
        field: "SLIDE_VIEWPORT_FLAGS",
        actual: flag,
        expected: `A stylesheet rule keyed on [data-${flag}] (or deliberately unstyled)`,
        consequence:
          "The flag resolves and stamps data-" +
          flag +
          " but styles nothing — a forgotten or mistyped selector, or intended?",
      });
    }
  }

  return out;
};
