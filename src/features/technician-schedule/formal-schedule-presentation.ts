import type { BookingOrder, BookingScheduleSlot } from "../booking/api";
import type {
  TechnicianCalendarItem,
  TechnicianScheduleBrief,
  TechnicianScheduleSummary
} from "./model";

export type FormalTechnicianCalendarPresentation = {
  items: TechnicianCalendarItem[];
  dayItems: TechnicianCalendarItem[];
  itemsByDate: Record<string, TechnicianCalendarItem[]>;
  summary: TechnicianScheduleSummary;
  brief: TechnicianScheduleBrief;
};

const pad = (value: number) => String(value).padStart(2, "0");

function dateParts(value: string) {
  const date = new Date(value);
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`
  };
}

function durationHours(item: Pick<TechnicianCalendarItem, "date" | "startTime" | "endTime">) {
  const startsAt = new Date(`${item.date}T${item.startTime}:00`).getTime();
  const endsAt = new Date(`${item.date}T${item.endTime}:00`).getTime();
  return Math.max(0, endsAt - startsAt) / 3_600_000;
}

function mapSlot(slot: BookingScheduleSlot): TechnicianCalendarItem {
  const start = dateParts(slot.startsAt);
  const end = dateParts(slot.endsAt);
  return {
    id: `formal-slot-${slot.id}`,
    sourceId: String(slot.id),
    sourceType: "custom",
    date: start.date,
    startTime: start.time,
    endTime: end.time,
    title: slot.serviceName,
    subtitle: [slot.technicianName, slot.shopName].filter(Boolean).join(" · "),
    amount: Number.parseFloat(slot.priceAmount) || null,
    kind: slot.status === "available" ? "availability" : slot.status === "blocked" ? "locked" : "booked",
    preset: slot.status === "available" ? "availability" : slot.status === "blocked" ? "locked" : undefined,
    readOnly: slot.status === "booked" || slot.bookedCount > 0,
    withinConfirmedShift: slot.status !== "blocked",
    note: `${slot.bookedCount}/${slot.capacity} 已预约`,
    badgeLabel: slot.status === "available" ? "可预约" : slot.status === "blocked" ? "已锁定" : "已预约"
  };
}

function mapOrder(order: BookingOrder): TechnicianCalendarItem {
  const start = dateParts(order.startsAt);
  const end = dateParts(order.endsAt);
  return {
    id: `formal-order-${order.id}`,
    sourceId: String(order.id),
    sourceType: "booking",
    date: start.date,
    startTime: start.time,
    endTime: end.time,
    title: order.serviceName,
    subtitle: `${order.shopName} · 用户 #${order.customerUserId}`,
    amount: Number.parseFloat(order.priceAmount) || order.paymentAmountJpy || null,
    orderId: String(order.id),
    detailTargetType: "order_detail",
    detailTargetId: String(order.id),
    isClickable: true,
    kind: "booked",
    readOnly: true,
    withinConfirmedShift: true,
    note: order.note ?? undefined,
    badgeLabel: order.status === "pending" ? "待确认" : order.status === "confirmed" ? "已确认" : order.status === "inService" ? "服务中" : "已完成"
  };
}

function overlaps(left: TechnicianCalendarItem, right: TechnicianCalendarItem) {
  if (left.date !== right.date) return false;
  return left.startTime < right.endTime && right.startTime < left.endTime;
}

export function buildFormalTechnicianCalendar(
  slots: BookingScheduleSlot[],
  orders: BookingOrder[],
  selectedDate: string
): FormalTechnicianCalendarPresentation {
  const activeOrders = orders.filter((order) => order.status !== "cancelled");
  const orderedSlotIds = new Set(activeOrders.map((order) => order.scheduleSlotId));
  const items = [
    ...slots.filter((slot) => !orderedSlotIds.has(slot.id)).map(mapSlot),
    ...activeOrders.map(mapOrder)
  ].sort((left, right) =>
    left.date.localeCompare(right.date) ||
    left.startTime.localeCompare(right.startTime) ||
    left.id.localeCompare(right.id)
  );
  const itemsByDate = items.reduce<Record<string, TechnicianCalendarItem[]>>((result, item) => {
    (result[item.date] ??= []).push(item);
    return result;
  }, {});
  const dayItems = itemsByDate[selectedDate] ?? [];
  const slotItems = slots.map(mapSlot);
  const bookedItems = activeOrders.map(mapOrder);
  const summary: TechnicianScheduleSummary = {
    confirmedHours: slotItems
      .filter((item) => item.kind !== "locked")
      .reduce((total, item) => total + durationHours(item), 0),
    bookedHours: bookedItems.reduce((total, item) => total + durationHours(item), 0),
    freeHours: slotItems
      .filter((item) => item.kind === "availability")
      .reduce((total, item) => total + durationHours(item), 0),
    tentativeHours: slotItems
      .filter((item) => item.kind === "locked")
      .reduce((total, item) => total + durationHours(item), 0)
  };
  const dayOrders = dayItems.filter((item) => item.sourceType === "booking");
  const hasConflict = dayItems.some((item, index) =>
    dayItems.slice(index + 1).some((other) =>
      item.kind !== "availability" && other.kind !== "availability" && overlaps(item, other)
    )
  );
  const revenue = dayOrders.reduce((total, item) => total + (item.amount ?? 0), 0);
  const brief: TechnicianScheduleBrief = {
    orderCount: dayOrders.length,
    hasConflict,
    estimatedRevenue: dayOrders.length > 0 ? revenue : null
  };

  return { items, dayItems, itemsByDate, summary, brief };
}
