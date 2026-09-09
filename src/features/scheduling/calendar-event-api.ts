import { httpClient } from "../../api/httpClient";
import { getAuthenticatedPersistentCacheScope } from "../../lib/persistentCacheScope";
import { persistentResourceCache } from "../../lib/persistentResourceCache";

export type FormalCalendarEvent = {
  id: number;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  reminderMinutes: number | null;
  repeatRule: "none" | "daily" | "weekly" | "monthly" | "yearly";
  location: string;
  url: string;
  note: string;
  visibility: "private" | "participants";
  participantIdentityIds: number[];
  imageUrls: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type FormalCalendarEventInput = Omit<
  FormalCalendarEvent,
  "id" | "version" | "createdAt" | "updatedAt"
>;

type CalendarEventPage = { list: FormalCalendarEvent[]; total: number; page: number; page_size: number };

async function invalidateCalendarCache() {
  const scope = getAuthenticatedPersistentCacheScope();
  if (scope) await persistentResourceCache.invalidate(scope, "calendar:");
}

export const calendarEventApi = {
  list({ from, to, page = 1, pageSize = 100 }: { from: Date; to: Date; page?: number; pageSize?: number }) {
    return httpClient.request<CalendarEventPage>("/calendar-events", {
      query: { from: from.toISOString(), to: to.toISOString(), page, page_size: pageSize },
    });
  },
  async create(input: FormalCalendarEventInput, idempotencyKey: string) {
    const result = await httpClient.request<FormalCalendarEvent>("/calendar-events", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: input,
    });
    await invalidateCalendarCache();
    return result;
  },
  async update(id: number, input: Partial<FormalCalendarEventInput> & { expectedVersion: number }) {
    const result = await httpClient.request<FormalCalendarEvent>(`/calendar-events/${id}`, {
      method: "PATCH",
      body: input,
    });
    await invalidateCalendarCache();
    return result;
  },
  async remove(id: number, expectedVersion: number) {
    const result = await httpClient.request<FormalCalendarEvent>(`/calendar-events/${id}`, {
      method: "DELETE",
      query: { expected_version: expectedVersion },
    });
    await invalidateCalendarCache();
    return result;
  },
};
