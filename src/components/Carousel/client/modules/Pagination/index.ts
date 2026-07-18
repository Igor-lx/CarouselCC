/**
 * The pagination slot has two implementations, and they are now one family:
 * both drive a continuous OFFSET along the motion plan and derive each dot's
 * look from its distance to that offset. `basic` paints fixed dots (opacity
 * and stretch); `widget` slides a strip (position, scale, opacity). Exactly
 * one may be attached — they claim the same slot.
 *
 * What they genuinely share is domain-agnostic and lives in `client/motion`
 * (how a plan's stops become keyframes, where a span has reached now) — the
 * track consumes it too. Nothing else survived contact: their animation
 * bookkeeping and their "this dot shows nothing" rules differ in substance,
 * not just in spelling.
 */
export { Pagination } from "./basic";
export type { PaginationProps, PaginationClassMap } from "./basic";

export { PaginationWidget } from "./widget";
export type {
  PaginationWidgetProps,
  PaginationWidgetClassMap,
} from "./widget";
