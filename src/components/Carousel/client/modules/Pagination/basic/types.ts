// See docs/architecture/modules.md
export interface PaginationClassMap {
  [key: string]: string | undefined;
  paginationWrapper?: string;
  dot?: string;
  dotActive?: string;
  /** Applied only while the dots accept clicks — carries the pointer
   * affordance (cursor / hover / pointer-events). */
  dotInteractive?: string;
}

export interface PaginationProps {
  className?: PaginationClassMap;
}
