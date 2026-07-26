// Two implementations of the one pagination slot (attach exactly one): `basic`
// fixed dots, `widget` sliding strip. See docs/architecture/modules.md
export { Pagination } from "./basic";
export type { PaginationProps, PaginationClassMap } from "./basic";

export { PaginationWidget } from "./widget";
export type {
  PaginationWidgetProps,
  PaginationWidgetClassMap,
} from "./widget";
