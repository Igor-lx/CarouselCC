export interface PaginationClassMap {
  [key: string]: string | undefined;
  paginationWrapper?: string;
  dot?: string;
  dotActive?: string;
}

export interface PaginationProps {
  className?: PaginationClassMap;
}
