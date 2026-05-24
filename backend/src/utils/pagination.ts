export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface PaginationInput {
  page?: number;
  pageSize?: number;
}

export interface NormalizedPagination {
  page: number;
  pageSize: number;
}

export interface PrismaPaginationArgs extends NormalizedPagination {
  skip: number;
  take: number;
}

export interface PaginatedResponse<TItem> {
  list: TItem[];
  total: number;
  page: number;
  page_size: number;
}

const normalizePositiveInteger = (value: number | undefined, fallback: number): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  const normalized = Math.floor(value);
  return normalized >= 1 ? normalized : fallback;
};

export const normalizePagination = (input: PaginationInput = {}): NormalizedPagination => {
  const page = normalizePositiveInteger(input.page, DEFAULT_PAGE);
  const requestedPageSize = normalizePositiveInteger(input.pageSize, DEFAULT_PAGE_SIZE);

  return {
    page,
    pageSize: Math.min(requestedPageSize, MAX_PAGE_SIZE)
  };
};

export const toPrismaPagination = (input: PaginationInput = {}): PrismaPaginationArgs => {
  const pagination = normalizePagination(input);

  return {
    ...pagination,
    skip: (pagination.page - 1) * pagination.pageSize,
    take: pagination.pageSize
  };
};

export const buildPaginatedResponse = <TItem>(
  list: TItem[],
  total: number,
  input: PaginationInput = {}
): PaginatedResponse<TItem> => {
  const pagination = normalizePagination(input);

  return {
    list,
    total,
    page: pagination.page,
    page_size: pagination.pageSize
  };
};
