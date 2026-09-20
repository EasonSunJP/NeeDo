import { isBookingApiId } from "../../../features/booking/api";

export type CheckoutServiceRoute =
  | { kind: "shop"; serviceId: number }
  | { kind: "technician"; serviceId: number; shopId: number; technicianId: number };

type TechnicianServiceCheckoutSelection = {
  date?: string | null;
  people?: string | null;
  scheduleSlotId?: number | string | null;
  serviceIds?: number[];
  time?: string | null;
};

function appendSelectionParam(
  params: URLSearchParams,
  key: "date" | "people" | "time",
  value: string | null | undefined
) {
  const normalized = value?.trim();
  if (normalized) params.set(key, normalized);
}

export function buildTechnicianServiceCheckoutRoute(
  technicianServiceId: number,
  selection: TechnicianServiceCheckoutSelection = {}
) {
  const params = new URLSearchParams({ mode: "store" });
  appendSelectionParam(params, "date", selection.date);
  appendSelectionParam(params, "people", selection.people);
  appendSelectionParam(params, "time", selection.time);
  const slotId = String(selection.scheduleSlotId ?? "");
  if (/^-?[1-9]\d*$/u.test(slotId)) params.set("scheduleSlotId", slotId);
  const serviceIds = selection.serviceIds?.filter((id) => Number.isInteger(id) && id > 0);
  if (serviceIds && serviceIds.length > 1) params.set("serviceIds", serviceIds.join(","));

  return `/checkout/technician-service/${technicianServiceId}?${params.toString()}`;
}

export function getTechnicianServiceDetailPath(
  technicianServiceId: number,
  scope: "user" | "merchant" | "technician" = "user"
) {
  const prefix = scope === "user" ? "" : `/${scope}`;
  return `${prefix}/technician-services/${technicianServiceId}`;
}

export function parseTechnicianServiceBundleIds(
  primaryServiceId: number,
  value: string | null
) {
  if (!value) return [primaryServiceId];
  const ids = value.split(",").map((item) => Number(item));
  if (
    ids.length < 2 ||
    ids.length > 10 ||
    ids[0] !== primaryServiceId ||
    ids.some((id) => !Number.isInteger(id) || id <= 0) ||
    new Set(ids).size !== ids.length
  ) return [primaryServiceId];
  return ids;
}

export function parseCheckoutServiceRoute(
  value: string | undefined,
  searchParams: URLSearchParams
): CheckoutServiceRoute | null {
  if (isBookingApiId(value)) {
    return { kind: "shop", serviceId: Number(value) };
  }

  const match = value?.match(/^technician-service-([1-9]\d*)$/);
  const shopId = searchParams.get("shop");
  const technicianId = searchParams.get("technician");
  if (!match || !isBookingApiId(shopId) || !isBookingApiId(technicianId)) return null;

  return {
    kind: "technician",
    serviceId: Number(match[1]),
    shopId: Number(shopId),
    technicianId: Number(technicianId)
  };
}
