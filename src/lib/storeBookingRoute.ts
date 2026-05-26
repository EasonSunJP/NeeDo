export type StoreBookingRouteInput = {
  storeId: string;
  technicianId?: string;
  date?: string;
  time?: string;
  people?: string;
};

function appendOptionalParam(params: URLSearchParams, key: string, value: string | null | undefined) {
  const normalized = value?.trim();

  if (normalized) {
    params.set(key, normalized);
  }
}

export function buildStoreBookingRoute({ date, storeId, technicianId, time }: StoreBookingRouteInput) {
  const params = new URLSearchParams();
  appendOptionalParam(params, "technician", technicianId);
  appendOptionalParam(params, "date", date);
  appendOptionalParam(params, "time", time);

  const query = params.toString();
  return `/stores/${encodeURIComponent(storeId)}${query ? `?${query}` : ""}`;
}

export function buildStoreCheckoutRoute(serviceId: string, { date, people, storeId, technicianId, time }: StoreBookingRouteInput) {
  const params = new URLSearchParams({ mode: "store", store: storeId });
  appendOptionalParam(params, "technician", technicianId);
  appendOptionalParam(params, "date", date);
  appendOptionalParam(params, "people", people);
  appendOptionalParam(params, "time", time);

  return `/checkout/${encodeURIComponent(serviceId)}?${params.toString()}`;
}
