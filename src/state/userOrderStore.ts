import { useSyncExternalStore } from "react";
import { orders as mockOrders } from "../data/mock";
import { parseBrowserStorageJson, writeBrowserStorage } from "../lib/browserStorage";
import type { Order } from "../types/domain";

const storageKey = "needo.user-created-orders.v1";
const listeners = new Set<() => void>();
let hydrated = false;
let cachedCreatedOrders: Order[] = [];
let cachedSnapshot: Order[] | null = null;

function cloneOrder(order: Order): Order {
  return JSON.parse(JSON.stringify(order)) as Order;
}

function normalizePaymentStatus(value: unknown): Order["paymentStatus"] {
  return value === "paid" || value === "depositPaid" || value === "refunded" ? value : "unpaid";
}

function normalizeOrderStatus(value: unknown): Order["status"] {
  return value === "pending" ||
    value === "unpaid" ||
    value === "confirmed" ||
    value === "scheduled" ||
    value === "inService" ||
    value === "completed" ||
    value === "cancelled" ||
    value === "refunding" ||
    value === "refunded"
    ? value
    : "pending";
}

function normalizeOrder(raw: Partial<Order>): Order | null {
  if (!raw || typeof raw !== "object" || typeof raw.id !== "string" || typeof raw.orderNo !== "string") {
    return null;
  }

  return {
    id: raw.id,
    orderNo: raw.orderNo,
    mode: raw.mode === "store" ? "store" : "home",
    status: normalizeOrderStatus(raw.status),
    customerId: typeof raw.customerId === "string" ? raw.customerId : "cus-1",
    customerName: typeof raw.customerName === "string" ? raw.customerName : "NeeDo 用户",
    itemName: typeof raw.itemName === "string" ? raw.itemName : "预约服务",
    storeName: typeof raw.storeName === "string" ? raw.storeName : undefined,
    technicianName: typeof raw.technicianName === "string" ? raw.technicianName : undefined,
    city: typeof raw.city === "string" ? raw.city : "东京",
    area: typeof raw.area === "string" ? raw.area : "新宿",
    amount: typeof raw.amount === "number" && Number.isFinite(raw.amount) ? raw.amount : 0,
    paymentStatus: normalizePaymentStatus(raw.paymentStatus),
    paymentMethod: raw.paymentMethod,
    autoConfirmed: typeof raw.autoConfirmed === "boolean" ? raw.autoConfirmed : undefined,
    expectedArrivalAt: typeof raw.expectedArrivalAt === "string" ? raw.expectedArrivalAt : undefined,
    bookedAt: typeof raw.bookedAt === "string" ? raw.bookedAt : "",
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
    source: raw.source === "web" || raw.source === "line" || raw.source === "partner" ? raw.source : "app",
    remark: typeof raw.remark === "string" ? raw.remark : undefined
  };
}

function hydrate() {
  if (hydrated || typeof window === "undefined") {
    return;
  }

  hydrated = true;
  const parsed = parseBrowserStorageJson<Partial<Order>[]>(storageKey, [], { silent: true, removeOnError: true });
  cachedCreatedOrders = Array.isArray(parsed)
    ? parsed
        .map(normalizeOrder)
        .filter((order): order is Order => Boolean(order))
    : [];
}

function persist() {
  if (typeof window === "undefined") {
    return;
  }

  writeBrowserStorage(storageKey, JSON.stringify(cachedCreatedOrders), { silent: true });
}

function notify() {
  cachedSnapshot = null;
  listeners.forEach((listener) => listener());
}

function getSnapshot() {
  hydrate();

  if (!cachedSnapshot) {
    const createdIds = new Set(cachedCreatedOrders.map((order) => order.id));
    cachedSnapshot = [...cachedCreatedOrders.map(cloneOrder), ...mockOrders.filter((order) => !createdIds.has(order.id)).map(cloneOrder)];
  }

  return cachedSnapshot;
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function useUserOrders() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function addUserOrder(order: Order) {
  hydrate();
  cachedCreatedOrders = [cloneOrder(order), ...cachedCreatedOrders.filter((item) => item.id !== order.id)];
  persist();
  notify();

  return order;
}

export function findUserOrderById(orderId?: string | null) {
  return getSnapshot().find((order) => order.id === orderId);
}
