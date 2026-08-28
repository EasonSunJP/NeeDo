import type { DineInState } from "./types";

export const dineInShopId = "";

/** Empty compatibility state. Formal dine-in records must come from the API. */
export const defaultDineInState: DineInState = {
  qrCodes: [],
  facilityAreas: [],
  facilityUnits: [],
  diningSessions: [],
  menus: [],
  menuCategories: [],
  menuItems: [],
  orderItems: [],
  orders: [],
  payments: [],
  facilityAssignments: [],
  staffPresence: [],
  serviceCalls: [],
  auditLogs: [],
  reviewIntents: [],
};
