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

export type CalendarParticipantBusyRange = {
  participantIdentityId: number;
  startsAt: string;
  endsAt: string;
  status: "locked";
};

type CalendarParticipantBusyPage = {
  list: CalendarParticipantBusyRange[];
  total: number;
  page: number;
  page_size: number;
};

function assertCalendarParticipantBusyPage(value: CalendarParticipantBusyPage): CalendarParticipantBusyPage {
  if (!value || !Array.isArray(value.list) || !Number.isInteger(value.total) || !Number.isInteger(value.page) || !Number.isInteger(value.page_size)) {
    throw new Error("Invalid participant busy response");
  }
  const busyKeys = ["endsAt", "participantIdentityId", "startsAt", "status"];
  for (const range of value.list) {
    if (!range || Object.keys(range).sort().join(",") !== busyKeys.join(",") ||
      !Number.isInteger(range.participantIdentityId) || range.participantIdentityId <= 0 ||
      range.status !== "locked" || !Number.isFinite(Date.parse(range.startsAt)) ||
      !Number.isFinite(Date.parse(range.endsAt)) || Date.parse(range.endsAt) <= Date.parse(range.startsAt)) {
      throw new Error("Invalid participant busy response");
    }
  }
  return value;
}

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
  async listParticipantBusy({
    from,
    to,
    participantIdentityIds,
    page = 1,
    pageSize = 100,
  }: {
    from: Date;
    to: Date;
    participantIdentityIds: number[];
    page?: number;
    pageSize?: number;
  }) {
    const response = await httpClient.request<CalendarParticipantBusyPage>("/calendar-events/participant-busy", {
      query: {
        from: from.toISOString(),
        to: to.toISOString(),
        participant_identity_ids: participantIdentityIds.join(","),
        page,
        page_size: pageSize,
      },
    });
    return assertCalendarParticipantBusyPage(response);
  },
  async listAllParticipantBusy({
    from,
    to,
    participantIdentityIds,
    pageSize = 100,
  }: {
    from: Date;
    to: Date;
    participantIdentityIds: number[];
    pageSize?: number;
  }) {
    const rows: CalendarParticipantBusyRange[] = [];
    let page = 1;
    while (true) {
      const response = await calendarEventApi.listParticipantBusy({
        from,
        to,
        participantIdentityIds,
        page,
        pageSize,
      });
      if (!Number.isInteger(response.total) || response.total < 0 || response.page !== page || response.page_size < 1 || !Array.isArray(response.list)) {
        throw new Error("Invalid participant busy response");
      }
      rows.push(...response.list);
      if (rows.length >= response.total) return rows.slice(0, response.total);
      if (response.list.length === 0) throw new Error("Incomplete participant busy response");
      page += 1;
    }
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
