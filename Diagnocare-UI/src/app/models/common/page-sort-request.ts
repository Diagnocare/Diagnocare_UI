import { SortDirection } from './sort';

/**
 * Paging and sorting options sent by every list/search call.
 * Matches the API's PageSortRequest (Model/Common/PageSortRequest.cs).
 */
export interface PageSortRequest {
  pageNumber: number;
  pageSize: number;
  /** Sort key. Each endpoint has its own whitelist (e.g. 'regDate', 'name'). */
  sortBy?: string;
  sortDirection?: SortDirection;
}

/** Request body for list/search endpoints: paging/sort options plus the endpoint's filter. */
export interface PagedRequest<TFilter> {
  paging: PageSortRequest;
  filter: TFilter;
}

/** List response shape: item1 = total matching rows, item2 = rows on this page. */
export interface PagedResponse<T> {
  item1: number;
  item2: T[];
}

/** Builds a PageSortRequest. Values from <select> bindings can be strings, so they are converted to numbers. */
export function buildPageSortRequest(
  pageNumber: number | string,
  pageSize: number | string,
  sortBy?: string,
  sortDirection?: SortDirection
): PageSortRequest {
  return {
    pageNumber: Number(pageNumber) || 1,
    pageSize: Number(pageSize) || 10,
    sortBy,
    sortDirection,
  };
}
