import { httpClient } from "../../api/httpClient";
import type { BookingScheduleSlot, PaginatedBookingData } from "../booking/api";
import { getAuthenticatedPersistentCacheScope } from "../../lib/persistentCacheScope";
import { persistentResourceCache } from "../../lib/persistentResourceCache";

export type SchedulingScope = "merchant-admin" | "technician";
export type ScheduleSlotStatus = BookingScheduleSlot["status"];

export type ScheduleSlotListInput = {
  from: Date;
  to: Date;
  page?: number;
  pageSize?: number;
  serviceId?: number;
  technicianServiceId?: number;
  technicianProfileId?: number;
  status?: ScheduleSlotStatus;
};

type ScheduleSlotTimeInput = {
  startsAt: Date;
  endsAt: Date;
  capacity?: number;
  technicianProfileId?: number | null;
};

export type ScheduleSlotCreateInput = ScheduleSlotTimeInput & (
  | { serviceId: number; technicianServiceId?: never }
  | { serviceId?: never; technicianServiceId: number }
);

export type ScheduleSlotUpdateInput = {
  startsAt?: Date;
  endsAt?: Date;
  capacity?: number;
  status?: "available" | "blocked";
  impactConfirmed?: boolean;
};

export type FormalScheduleCalendarItem = {
  id: string;
  slotId: number;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  subtitle: string;
  badge: string;
  status: ScheduleSlotStatus;
  technicianProfileId: number | null;
};

export type SchedulePreloadResource = PaginatedBookingData<BookingScheduleSlot> & {
  identityId: number;
};

export type SchedulePreloadPayload = {
  fetchedAt: string;
  merchant: (SchedulePreloadResource & { shopId: number }) | null;
  technician: (SchedulePreloadResource & { technicianProfileId: number }) | null;
};

const prefix = (scope: SchedulingScope) => `/${scope}/schedule/slots`;
const pad = (value: number) => String(value).padStart(2, "0");

async function invalidateScheduleCache() {
  const scope = getAuthenticatedPersistentCacheScope();
  if (scope) await persistentResourceCache.invalidate(scope, "calendar:");
}

export function mapScheduleSlotToCalendarItem(slot: BookingScheduleSlot): FormalScheduleCalendarItem {
  const start = new Date(slot.startsAt);
  const end = new Date(slot.endsAt);
  return {
    id: `formal-slot-${slot.id}`,
    slotId: slot.id,
    date: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
    startTime: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
    endTime: `${pad(end.getHours())}:${pad(end.getMinutes())}`,
    title: slot.serviceName,
    subtitle: [slot.technicianName, slot.shopName].filter(Boolean).join(" · "),
    badge: slot.status === "booked" ? "已预约" : slot.status === "blocked" ? "已锁定" : "可预约",
    status: slot.status,
    technicianProfileId: slot.technicianProfileId
  };
}

export const schedulingApi = {
  preload(input: Pick<ScheduleSlotListInput, "from" | "to" | "page" | "pageSize">) {
    return httpClient.request<SchedulePreloadPayload>("/schedule/preload", {
      query: {
        ...input,
        from: input.from.toISOString(),
        to: input.to.toISOString()
      }
    });
  },
  getTechnicianSlot(id: number) {
    return httpClient.request<BookingScheduleSlot>(`/technician/schedule/slots/${id}`);
  },
  listSlots(scope: SchedulingScope, input: ScheduleSlotListInput) {
    return httpClient.request<PaginatedBookingData<BookingScheduleSlot>>(prefix(scope), {
      query: {
        ...input,
        from: input.from.toISOString(),
        to: input.to.toISOString()
      }
    });
  },
  async createSlot(scope: SchedulingScope, input: ScheduleSlotCreateInput) {
    const slot = await httpClient.request<BookingScheduleSlot>(prefix(scope), {
      body: {
        ...input,
        startsAt: input.startsAt.toISOString(),
        endsAt: input.endsAt.toISOString()
      },
      method: "POST"
    });
    await invalidateScheduleCache();
    return slot;
  },
  async updateSlot(scope: SchedulingScope, id: number, input: ScheduleSlotUpdateInput) {
    const slot = await httpClient.request<BookingScheduleSlot>(`${prefix(scope)}/${id}`, {
      body: {
        ...input,
        ...(input.startsAt ? { startsAt: input.startsAt.toISOString() } : {}),
        ...(input.endsAt ? { endsAt: input.endsAt.toISOString() } : {})
      },
      method: "PATCH"
    });
    await invalidateScheduleCache();
    return slot;
  },
  async deleteSlot(scope: SchedulingScope, id: number, input: { impactConfirmed?: boolean } = {}) {
    const slot = await httpClient.request<BookingScheduleSlot>(`${prefix(scope)}/${id}`, {
      method: "DELETE",
      ...(input.impactConfirmed ? { query: { impactConfirmed: true } } : {})
    });
    await invalidateScheduleCache();
    return slot;
  }
};
