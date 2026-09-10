import { httpClient } from "../../api/httpClient";
import { getAuthenticatedPersistentCacheScope } from "../../lib/persistentCacheScope";
import { persistentResourceCache } from "../../lib/persistentResourceCache";

export type AvailabilityWindow = {
  id: number;
  shopId: number;
  technicianProfileId: number;
  sourceType: "shop" | "technician";
  visibility: "shop_only" | "affiliated_shops";
  startsAt: string;
  endsAt: string;
  capacity: number;
  isActive: boolean;
  shopName: string;
  createdAt: string;
  updatedAt: string;
};

type AvailabilityWindowPage = {
  list: AvailabilityWindow[];
  total: number;
  page: number;
  page_size: number;
};

type AvailabilityWindowScope = "merchant-admin" | "technician";

async function invalidateCalendarCache() {
  const scope = getAuthenticatedPersistentCacheScope();
  if (scope) await persistentResourceCache.invalidate(scope, "calendar:");
}

const prefix = (scope: AvailabilityWindowScope) => `/${scope}/availability-windows`;

export const availabilityWindowApi = {
  list(scope: AvailabilityWindowScope, input: { from: Date; to: Date; page?: number; pageSize?: number; technicianProfileId?: number }) {
    return httpClient.request<AvailabilityWindowPage>(prefix(scope), {
      query: { ...input, from: input.from.toISOString(), to: input.to.toISOString() }
    });
  },
  async listAll(scope: AvailabilityWindowScope, input: { from: Date; to: Date; technicianProfileId?: number }) {
    const first = await availabilityWindowApi.list(scope, { ...input, page: 1, pageSize: 100 });
    const pageCount = Math.ceil(first.total / Math.max(1, first.page_size));
    if (pageCount <= 1) return first.list;
    const remaining = await Promise.all(
      Array.from({ length: pageCount - 1 }, (_, index) =>
        availabilityWindowApi.list(scope, { ...input, page: index + 2, pageSize: 100 })
      )
    );
    return [first, ...remaining].flatMap((page) => page.list);
  },
  async create(scope: AvailabilityWindowScope, input: { startsAt: Date; endsAt: Date; capacity?: number; technicianProfileId?: number }) {
    const window = await httpClient.request<AvailabilityWindow>(prefix(scope), {
      body: { ...input, startsAt: input.startsAt.toISOString(), endsAt: input.endsAt.toISOString() },
      method: "POST"
    });
    await invalidateCalendarCache();
    return window;
  },
  async update(scope: AvailabilityWindowScope, id: number, input: { startsAt?: Date; endsAt?: Date; capacity?: number }) {
    const window = await httpClient.request<AvailabilityWindow>(`${prefix(scope)}/${id}`, {
      body: {
        ...input,
        ...(input.startsAt ? { startsAt: input.startsAt.toISOString() } : {}),
        ...(input.endsAt ? { endsAt: input.endsAt.toISOString() } : {})
      },
      method: "PATCH"
    });
    await invalidateCalendarCache();
    return window;
  },
  async delete(scope: AvailabilityWindowScope, id: number) {
    const window = await httpClient.request<AvailabilityWindow>(`${prefix(scope)}/${id}`, { method: "DELETE" });
    await invalidateCalendarCache();
    return window;
  }
};
