import { isBookingApiId } from "../../../features/booking/api";

export type CheckoutServiceRoute =
  | { kind: "shop"; serviceId: number }
  | { kind: "technician"; serviceId: number; shopId: number; technicianId: number };

type TechnicianServiceCheckoutSelection = {
  date?: string | null;
  people?: string | null;
  scheduleSlotId?: number | string | null;
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
  if (/^[1-9]\d*$/u.test(slotId)) params.set("scheduleSlotId", slotId);

  return `/checkout/technician-service/${technicianServiceId}?${params.toString()}`;
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
