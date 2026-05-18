import {
  campaigns,
  customers,
  inventoryItems,
  merchants,
  orders,
  reviews,
  settlements,
  stores,
  technicians
} from "./mock";
import { getEntityStoreSnapshot } from "../state/entityStore";
import { getScheduleStoreSnapshot } from "../state/scheduleStore";

export function getMerchantAdminDemo() {
  const { customers: liveCustomers, stores: liveStores, technicians: liveTechnicians } = getEntityStoreSnapshot();
  const { schedules: liveSchedules } = getScheduleStoreSnapshot();
  const currentMerchant = merchants.find((merchant) => merchant.id === "merchant-1") ?? merchants[0];
  const merchantStores = liveStores.filter((store) => store.merchantId === currentMerchant.id);
  const currentStore = merchantStores[0] ?? liveStores[0] ?? stores[0];
  const storeIdSet = new Set(merchantStores.map((store) => store.id));
  const storeNameSet = new Set(merchantStores.map((store) => store.name));
  const storeTechnicians = liveTechnicians.filter((technician) => storeIdSet.has(technician.storeId));
  const technicianIdSet = new Set(storeTechnicians.map((technician) => technician.id));
  const technicianNameSet = new Set(storeTechnicians.map((technician) => technician.name));
  const merchantOrders = orders.filter(
    (order) => (order.storeName && storeNameSet.has(order.storeName)) || (order.technicianName && technicianNameSet.has(order.technicianName))
  );
  const merchantCustomerIds = [...new Set(merchantOrders.map((order) => order.customerId))];
  const merchantCustomers = liveCustomers.filter((customer) => merchantCustomerIds.includes(customer.id));
  const merchantSchedules = liveSchedules.filter((schedule) => technicianIdSet.has(schedule.staffId));
  const merchantInventoryItems = inventoryItems.filter((item) => storeNameSet.has(item.storeName));
  const merchantReviews = reviews.filter((review) => storeNameSet.has(review.targetName) || technicianNameSet.has(review.targetName));
  const merchantSettlements = settlements.filter((settlement) => settlement.merchantName === currentMerchant.name);

  return {
    merchant: currentMerchant,
    store: currentStore,
    stores: merchantStores,
    technicians: storeTechnicians,
    customers: merchantCustomers,
    orders: merchantOrders,
    schedules: merchantSchedules,
    inventoryItems: merchantInventoryItems,
    reviews: merchantReviews,
    settlements: merchantSettlements,
    campaigns
  };
}

export const merchantAdminDemo = new Proxy({} as ReturnType<typeof getMerchantAdminDemo>, {
  get(_target, property) {
    const snapshot = getMerchantAdminDemo();
    return snapshot[property as keyof typeof snapshot];
  }
});

export function getMerchantOrderAmount() {
  return getMerchantAdminDemo().orders.reduce((total, order) => total + order.amount, 0);
}

export function getMerchantPendingOrders() {
  return getMerchantAdminDemo().orders.filter((order) => ["pending", "confirmed", "scheduled", "unpaid"].includes(order.status));
}

export function getMerchantTodayOrders() {
  return getMerchantAdminDemo().orders.filter((order) => order.bookedAt.startsWith("2026-04-"));
}
