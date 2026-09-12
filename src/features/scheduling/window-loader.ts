import {
  bookingApi,
  type BookingOrder,
  type OrderListQuery,
  type PaginatedBookingData,
  type BookingScheduleSlot
} from "../booking/api";
import {
  schedulingApi,
  type SchedulingScope,
  type ScheduleSlotListInput
} from "./api";

const formalPageSize = 100;
const maxConcurrentPageLoads = 4;

type PageLoader<T> = (page: number) => Promise<PaginatedBookingData<T>>;

async function loadEveryPage<T>(loadPage: PageLoader<T>): Promise<T[]> {
  const first = await loadPage(1);
  validatePage(first, 1);
  const rows: T[] = [...first.list];
  if (rows.length >= first.total) return rows.slice(0, first.total);
  const totalPages = Math.max(1, Math.ceil(first.total / first.page_size));
  if (first.list.length === 0 || totalPages === 1) throw new Error("error.pagination.no_progress");
  const seenPages = new Set<number>();
  seenPages.add(1);

  for (let firstPage = 2; firstPage <= totalPages; firstPage += maxConcurrentPageLoads) {
    const requestedPages = Array.from(
      { length: Math.min(maxConcurrentPageLoads, totalPages - firstPage + 1) },
      (_, index) => firstPage + index
    );
    const responses = await Promise.all(requestedPages.map((page) => loadPage(page)));
    responses.forEach((response, index) => {
      const requestedPage = requestedPages[index]!;
      validatePage(response, requestedPage);
      if (seenPages.has(response.page) || response.total !== first.total || response.page_size !== first.page_size) {
        throw new Error("error.pagination.no_progress");
      }
      seenPages.add(response.page);
      rows.push(...response.list);
    });
    if (responses.some((response) => response.list.length === 0) && rows.length < first.total) {
      throw new Error("error.pagination.no_progress");
    }
  }

  if (rows.length < first.total) throw new Error("error.pagination.no_progress");
  return rows.slice(0, first.total);
}

function validatePage<T>(response: PaginatedBookingData<T>, requestedPage: number) {
  if (!Number.isInteger(response.page) || response.page !== requestedPage) {
    throw new Error("error.pagination.no_progress");
  }
  if (!Number.isInteger(response.page_size) || response.page_size <= 0) {
    throw new Error("error.pagination.invalid_page_size");
  }
  if (!Number.isInteger(response.total) || response.total < 0) {
    throw new Error("error.pagination.invalid_total");
  }
}

export async function loadManagedScheduleWindow(
  scope: SchedulingScope,
  input: Omit<ScheduleSlotListInput, "page" | "pageSize">
): Promise<BookingScheduleSlot[]> {
  const rows = await loadEveryPage((page) => schedulingApi.listSlots(scope, {
    ...input,
    page,
    pageSize: formalPageSize
  }));

  return rows.sort((left, right) =>
    left.startsAt.localeCompare(right.startsAt) || left.id - right.id
  );
}

export async function loadEveryScopedOrder(
  query: Omit<OrderListQuery, "page" | "pageSize"> = {}
): Promise<BookingOrder[]> {
  const rows = await loadEveryPage((page) => bookingApi.listOrders({
    ...query,
    page,
    pageSize: formalPageSize
  }));

  return rows.sort((left, right) =>
    right.startsAt.localeCompare(left.startsAt) || right.id - left.id
  );
}

// Existing technician consumers keep the same scoped order contract.
export const loadEveryTechnicianOrder = loadEveryScopedOrder;
