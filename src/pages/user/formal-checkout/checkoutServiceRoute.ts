import { isBookingApiId } from "../../../features/booking/api";

export type CheckoutServiceRoute =
  | { kind: "shop"; serviceId: number }
  | { kind: "technician"; serviceId: number; shopId: number; technicianId: number };

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
