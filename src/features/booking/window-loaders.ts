import {
  bookingApi,
  type BookingOrder,
  type BookingScheduleSlot,
  type PaginatedBookingData
} from "./api";

const MAX_WINDOW_MS = 93 * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 100;

function assertWindow(from: Date, to: Date): void {
  const duration = to.getTime() - from.getTime();
  if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_WINDOW_MS) {
    throw new Error("Formal schedule window must be between 1 ms and 93 days.");
  }
}

async function loadEveryPage<TItem>(
  request: (page: number) => Promise<PaginatedBookingData<TItem>>
): Promise<TItem[]> {
  const rows: TItem[] = [];
  for (let page = 1; ; page += 1) {
    const response = await request(page);
    rows.push(...response.list);
    if (rows.length >= response.total || response.list.length === 0) return rows;
  }
}

export async function loadCustomerOrderWindow(from: Date, to: Date): Promise<BookingOrder[]> {
  assertWindow(from, to);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  return loadEveryPage((page) => bookingApi.listOrders({
    from: fromIso,
    to: toIso,
    page,
    pageSize: PAGE_SIZE
  }));
}

export async function loadTechnicianAvailabilityWindow(
  technicianId: number,
  from: Date,
  to: Date
): Promise<BookingScheduleSlot[]> {
  assertWindow(from, to);
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  return loadEveryPage((page) => bookingApi.listAvailability({
    technicianId,
    from: fromIso,
    to: toIso,
    page,
    pageSize: PAGE_SIZE
  }));
}
