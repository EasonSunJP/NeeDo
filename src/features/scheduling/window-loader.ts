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

type PageLoader<T> = (page: number) => Promise<PaginatedBookingData<T>>;

async function loadEveryPage<T>(loadPage: PageLoader<T>): Promise<T[]> {
  const rows: T[] = [];
  const seenPages = new Set<number>();
  let requestedPage = 1;

  while (true) {
    const response = await loadPage(requestedPage);
    if (!Number.isInteger(response.page) || response.page !== requestedPage || seenPages.has(response.page)) {
      throw new Error("error.pagination.no_progress");
    }
    if (!Number.isInteger(response.page_size) || response.page_size <= 0) {
      throw new Error("error.pagination.invalid_page_size");
    }
    if (!Number.isInteger(response.total) || response.total < 0) {
      throw new Error("error.pagination.invalid_total");
    }

    seenPages.add(response.page);
    rows.push(...response.list);
    if (rows.length >= response.total) return rows.slice(0, response.total);

    const totalPages = Math.max(1, Math.ceil(response.total / response.page_size));
    if (requestedPage >= totalPages || response.list.length === 0) {
      throw new Error("error.pagination.no_progress");
    }
    requestedPage += 1;
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

export async function loadEveryTechnicianOrder(
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
