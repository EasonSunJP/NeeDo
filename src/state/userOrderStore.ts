import { useSyncExternalStore } from "react";
import type { Order } from "../types/domain";

const emptyOrders: Order[] = [];

function subscribe() {
  return () => undefined;
}

function getSnapshot() {
  return emptyOrders;
}

export function useUserOrders() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function addUserOrder(_order: Order): never {
  throw new Error("error.feature_unavailable");
}

export function findUserOrderById(_orderId?: string | null) {
  return undefined;
}
