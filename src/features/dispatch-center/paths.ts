import type { DispatchScheduleCell } from "./store";

export function getMerchantScheduleCellPath(cell: DispatchScheduleCell) {
  const slot = cell.hour == null ? "day" : String(cell.hour);
  const technicianId = cell.technicianId ?? "all";

  return `/merchant/schedule/cells/${encodeURIComponent(cell.date)}/${encodeURIComponent(slot)}/${encodeURIComponent(technicianId)}`;
}
