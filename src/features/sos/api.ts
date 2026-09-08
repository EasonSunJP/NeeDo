import { httpClient } from "../../api/httpClient";

export type SosAvailability = { canSend: boolean; serverNow: string; expiresAt: string | null; activeAlertId: number | null };
export type SosAlert = {
  id: number; orderId: number; orderNo: string; shopId: number; shopName: string;
  serviceName: string; senderName: string; senderType: "customer" | "technician";
  status: "pending" | "resolved"; createdAt: string; resolvedAt: string | null; resolvedByName: string | null;
};
export type SosAlertPage = { list: SosAlert[]; total: number; page: number; page_size: number };
export const sosApi = {
  availability: (orderId: number, signal?: AbortSignal) => httpClient.request<SosAvailability>(`/bookings/${orderId}/sos-availability`, { signal }),
  send: (orderId: number, idempotencyKey: string) => httpClient.request<{ alert: SosAlert; replayed: boolean }>(`/bookings/${orderId}/sos`, { method: "POST", body: { idempotencyKey } }),
  list: (status: SosAlert["status"], page: number, signal?: AbortSignal) => httpClient.request<SosAlertPage>("/sos-alerts", { query: { status, page, page_size: 20 }, signal }),
  count: (signal?: AbortSignal) => httpClient.request<{ pending: number }>("/sos-alerts/count", { signal }),
  resolve: (alertId: number) => httpClient.request<{ alert: SosAlert; replayed: boolean }>(`/sos-alerts/${alertId}/resolve`, { method: "POST", body: {} })
};
