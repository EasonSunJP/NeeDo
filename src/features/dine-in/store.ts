import { useEffect, useMemo, useState } from "react";
import { parseBrowserStorageJson, writeBrowserStorage } from "../../lib/browserStorage";
import { defaultDineInState, dineInShopId } from "./seed";
import type {
  DineInCartLineInput,
  DineInMenu,
  DineInMenuItem,
  DineInOrder,
  DineInOrderItem,
  DineInOrderItemStatus,
  DineInOrderStatus,
  DineInPaymentMethod,
  DineInPaymentStatus,
  DineInState,
  FacilityStatus,
  LocalizedText,
  MenuCategory,
  MenuItemRestrictionFlag,
  ProductionArea,
  QrResolution
} from "./types";

const dineInStorageKey = "needo.dine-in.state.v1";
const dineInStateEventName = "needo:dine-in-state";
const activeSessionStatuses = new Set(["OPEN", "ACTIVE", "CHECKOUT_REQUESTED", "PAYMENT_PENDING"]);
const standardMenuIds = ["menu-dinner", "menu-drinks", "menu-service"] as const;

type DineInMutationResult<T = void> = {
  state: DineInState;
  result: T;
};

export type DineInMenuItemUpdateInput = {
  name?: Partial<LocalizedText>;
  description?: Partial<LocalizedText>;
  categoryId?: string;
  imageUrl?: string;
  basePriceJpy?: number;
  taxMode?: DineInMenuItem["taxMode"];
  minimumOrderQuantity?: number;
  maximumPurchaseQuantity?: number;
  maximumPerOrderQuantity?: number;
  maximumPerPersonQuantity?: number;
  specialOffer?: DineInMenuItem["specialOffer"];
  active?: boolean;
  stockStatus?: DineInMenuItem["stockStatus"];
  restrictionFlags?: MenuItemRestrictionFlag[];
  productionArea?: ProductionArea;
};

export type DineInMenuCategoryUpdateInput = {
  name?: Partial<LocalizedText>;
};

export type DineInMenuItemCreateInput = Required<Pick<DineInMenuItemUpdateInput, "categoryId">> &
  Pick<
    DineInMenuItemUpdateInput,
    | "name"
    | "description"
    | "imageUrl"
    | "basePriceJpy"
    | "taxMode"
    | "minimumOrderQuantity"
    | "maximumPurchaseQuantity"
    | "maximumPerOrderQuantity"
    | "maximumPerPersonQuantity"
    | "specialOffer"
    | "stockStatus"
    | "active"
    | "restrictionFlags"
    | "productionArea"
  >;

function cloneState(state: DineInState): DineInState {
  return JSON.parse(JSON.stringify(state)) as DineInState;
}

function getSeedMenu(menuId: string) {
  return defaultDineInState.menus.find((menu) => menu.id === menuId);
}

function normalizeMenuKind(menu: DineInMenu): DineInMenu["kind"] {
  if (menu.kind) {
    return menu.kind;
  }

  if (menu.id === "menu-drinks") {
    return "DRINK";
  }

  if (menu.id === "menu-room" || menu.id === "menu-bed" || menu.id === "menu-service" || menu.serviceMode === "BED" || menu.serviceMode === "ROOM") {
    return "SERVICE";
  }

  return "FOOD";
}

function normalizePositiveInteger(value: number | undefined, fallback: number) {
  const numericValue = typeof value === "number" && Number.isFinite(value) ? value : fallback;

  return Math.max(1, Math.floor(numericValue));
}

function normalizeOptionalPositiveInteger(value: number | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return Math.floor(value);
}

function normalizeRestrictionFlags(flags: MenuItemRestrictionFlag[] | undefined) {
  const allowed = new Set<MenuItemRestrictionFlag>([
    "ALCOHOL",
    "AGE_CHECK",
    "IN_STORE_ONLY",
    "ONLINE_RESERVATION_ONLY",
    "ADVANCE_RESERVATION_ONLY",
    "BIRTHDAY_ONLY"
  ]);

  return Array.from(new Set((flags ?? []).filter((flag): flag is MenuItemRestrictionFlag => allowed.has(flag))));
}

function normalizeSpecialOffer(item: DineInMenuItem): DineInMenuItem["specialOffer"] {
  const fallbackPrice = Math.max(1, Math.round(item.basePriceJpy * 0.9));

  return {
    active: Boolean(item.specialOffer?.active),
    priceJpy: normalizePositiveInteger(item.specialOffer?.priceJpy, fallbackPrice),
    label: item.specialOffer?.label?.trim() || "特价"
  };
}

function getNormalizedMenuPlacement(item: DineInMenuItem) {
  if (item.productionArea === "BAR" || item.restrictionFlags?.includes("ALCOHOL") || item.menuId === "menu-drinks") {
    return { menuId: "menu-drinks", categoryId: item.categoryId === "cat-soft-drink" ? "cat-soft-drink" : "cat-alcohol" };
  }

  if (item.productionArea === "CAST" || item.menuId === "menu-bed" || item.menuId === "menu-service") {
    return { menuId: "menu-service", categoryId: "cat-service" };
  }

  if (item.id === "item-chicken") {
    return { menuId: "menu-dinner", categoryId: "cat-appetizer" };
  }

  if (item.id === "item-burger") {
    return { menuId: "menu-dinner", categoryId: "cat-staple" };
  }

  return { menuId: item.menuId || "menu-dinner", categoryId: item.categoryId || "cat-recommend" };
}

function normalizeDineInState(state: DineInState): DineInState {
  const nextState = cloneState(state);
  const menusById = new Map(nextState.menus.map((menu) => [menu.id, menu]));

  standardMenuIds.forEach((menuId) => {
    if (!menusById.has(menuId)) {
      const seedMenu = getSeedMenu(menuId);

      if (seedMenu) {
        nextState.menus.push(cloneState({ ...nextState, menus: [seedMenu] }).menus[0]);
      }
    }
  });

  nextState.menus = nextState.menus.map((menu) => {
    const seedMenu = getSeedMenu(menu.id);

    return {
      ...menu,
      kind: seedMenu?.kind ?? normalizeMenuKind(menu),
      name: menu.name ?? seedMenu?.name ?? { zh: "菜单", ja: "メニュー" },
      defaultLanguage: menu.defaultLanguage ?? seedMenu?.defaultLanguage ?? "ja",
      active: menu.id === "menu-room" || menu.id === "menu-bed" ? false : menu.active
    };
  });

  const categoryIds = new Set(nextState.menuCategories.map((category) => category.id));
  defaultDineInState.menuCategories.forEach((category) => {
    if (!categoryIds.has(category.id)) {
      nextState.menuCategories.push(cloneState({ ...nextState, menuCategories: [category] }).menuCategories[0]);
    }
  });

  nextState.menuItems = nextState.menuItems.map((item) => {
    const placement = getNormalizedMenuPlacement(item);

    return {
      ...item,
      menuId: placement.menuId,
      categoryId: placement.categoryId,
      minimumOrderQuantity: normalizePositiveInteger(item.minimumOrderQuantity, 1),
      maximumPurchaseQuantity: normalizeOptionalPositiveInteger(item.maximumPurchaseQuantity),
      maximumPerOrderQuantity: normalizeOptionalPositiveInteger(item.maximumPerOrderQuantity),
      maximumPerPersonQuantity: normalizeOptionalPositiveInteger(item.maximumPerPersonQuantity),
      specialOffer: normalizeSpecialOffer(item),
      restrictionFlags: normalizeRestrictionFlags(item.restrictionFlags)
    };
  });

  return nextState;
}

function getStoredDineInState() {
  const state = parseBrowserStorageJson<DineInState>(dineInStorageKey, cloneState(defaultDineInState), {
    removeOnError: true,
    silent: true
  });

  return normalizeDineInState(state);
}

function persistDineInState(state: DineInState) {
  writeBrowserStorage(dineInStorageKey, JSON.stringify(state), { silent: true });

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(dineInStateEventName));
  }
}

function createId(prefix: string, now: string) {
  const safeTime = now.replace(/\D/g, "").slice(0, 14);
  const random = Math.random().toString(36).slice(2, 7);

  return `${prefix}-${safeTime}-${random}`;
}

function createOrderNo(now: string, index: number) {
  const datePart = now.slice(0, 10).replaceAll("-", "");

  return `DINE-${datePart}-${String(index).padStart(4, "0")}`;
}

function getShopName(shopId: string) {
  return shopId === dineInShopId ? "GINZA Calm Body Lab" : "NeeDo Dining Bar";
}

function getMenuItemLabel(item: DineInMenuItem) {
  return item.name.zh || item.name.ja;
}

function findOptionLabels(item: DineInMenuItem, optionIds: string[]) {
  const labels: string[] = [];

  item.optionGroups?.forEach((group) => {
    group.options.forEach((option) => {
      if (optionIds.includes(option.id)) {
        labels.push(option.name.zh || option.name.ja);
      }
    });
  });

  return labels;
}

function findOptionPriceDelta(item: DineInMenuItem, optionIds: string[]) {
  let total = 0;

  item.optionGroups?.forEach((group) => {
    group.options.forEach((option) => {
      if (optionIds.includes(option.id)) {
        total += option.priceDeltaJpy;
      }
    });
  });

  return total;
}

export function getMenuItemMinimumOrderQuantity(item: DineInMenuItem) {
  return normalizePositiveInteger(item.minimumOrderQuantity, 1);
}

export function getMenuItemMaximumOrderQuantity(item: DineInMenuItem) {
  const limits = [item.maximumPurchaseQuantity, item.maximumPerOrderQuantity, item.maximumPerPersonQuantity]
    .map((limit) => normalizeOptionalPositiveInteger(limit))
    .filter((limit): limit is number => typeof limit === "number");

  return limits.length > 0 ? Math.min(...limits) : undefined;
}

function getExistingSessionQuantityForItem(state: DineInState, sessionId: string, menuItemId: string) {
  const orderIds = new Set(
    state.orders
      .filter((order) => order.sessionId === sessionId && !["CANCELLED", "REFUNDED"].includes(order.status))
      .map((order) => order.id)
  );

  return state.orderItems
    .filter((item) => orderIds.has(item.orderId) && item.menuItemId === menuItemId && !["CANCELLED", "REFUNDED", "UNAVAILABLE"].includes(item.status))
    .reduce((sum, item) => sum + item.quantity, 0);
}

export function isMenuItemSpecialOfferActive(item: DineInMenuItem) {
  return Boolean(item.specialOffer?.active && item.specialOffer.priceJpy > 0 && item.specialOffer.priceJpy < item.basePriceJpy);
}

export function getMenuItemEffectivePriceJpy(item: DineInMenuItem) {
  return isMenuItemSpecialOfferActive(item) ? item.specialOffer!.priceJpy : item.basePriceJpy;
}

export function getMenuItemTaxIncludedPriceJpy(item: DineInMenuItem) {
  const price = getMenuItemEffectivePriceJpy(item);

  return item.taxMode === "TAX_INCLUDED" ? price : Math.round(price * 1.1);
}

function addAuditLog(
  state: DineInState,
  {
    action,
    actorId = "staff-manager",
    actorType = "STAFF",
    after,
    before,
    entityId,
    entityType,
    now
  }: {
    action: string;
    actorId?: string;
    actorType?: "USER" | "STAFF" | "SYSTEM" | "ADMIN";
    before?: string;
    after?: string;
    entityType: "ORDER" | "ITEM" | "PAYMENT" | "SESSION" | "FACILITY" | "MENU" | "QR";
    entityId: string;
    now: string;
  }
) {
  state.auditLogs.unshift({
    id: createId("audit", now),
    shopId: dineInShopId,
    actorType,
    actorId,
    entityType,
    entityId,
    action,
    before,
    after,
    createdAt: now
  });
}

function resolveQrTargetToken(input: string) {
  const trimmed = input.trim();

  if (trimmed.startsWith("needo://qr/")) {
    return trimmed.replace("needo://qr/", "");
  }

  const match = trimmed.match(/\/q\/([^/?#]+)/);

  return match?.[1] ?? trimmed;
}

export function getDefaultDineInStateForReset() {
  return cloneState(defaultDineInState);
}

export function resetDineInState() {
  const state = getDefaultDineInStateForReset();
  persistDineInState(state);
  return state;
}

export function resolveQrTokenInState(state: DineInState, inputToken: string, now = new Date().toISOString()): DineInMutationResult<QrResolution> {
  const nextState = cloneState(state);
  const token = resolveQrTargetToken(inputToken);
  const qr = nextState.qrCodes.find((item) => item.rawToken === token && item.active);

  if (!qr) {
    throw new Error("QR code is inactive or unknown.");
  }

  const facility = nextState.facilityUnits.find((unit) => unit.id === qr.targetId);
  let sessionId: string | undefined;
  let facilityUnitId: string | undefined;
  let actionUrl = "/dine/session-demo/menu";
  let actionType: QrResolution["action"]["type"] = "OPEN_DINE_IN_MENU";

  if (qr.type === "TABLE_MENU" || qr.type === "ROOM_MENU" || qr.type === "BED_MENU") {
    if (!facility) {
      throw new Error("QR code target facility is missing.");
    }

    const existingSession = nextState.diningSessions.find(
      (session) => session.facilityUnitId === facility.id && activeSessionStatuses.has(session.status)
    );
    const session = existingSession ?? {
      id: createId("session", now),
      shopId: qr.shopId,
      facilityUnitId: facility.id,
      status: "OPEN" as const,
      openedByUserId: "customer-demo",
      assignedStaffId: "staff-yamada",
      partySize: Math.max(1, Math.min(facility.capacity, 2)),
      openedAt: now
    };

    if (!existingSession) {
      nextState.diningSessions.unshift(session);
      facility.currentSessionId = session.id;
      facility.status = "ORDERING";
      addAuditLog(nextState, {
        action: "dining_session.opened",
        actorId: "customer-demo",
        actorType: "USER",
        entityType: "SESSION",
        entityId: session.id,
        after: session.status,
        now
      });
    }

    sessionId = session.id;
    facilityUnitId = facility.id;
    actionUrl = `/dine/${session.id}/menu`;
  } else if (qr.type === "CHECKOUT") {
    const session = nextState.diningSessions.find((item) => item.id === qr.targetId) ?? nextState.diningSessions.find((item) => item.id === facility?.currentSessionId);
    sessionId = session?.id;
    facilityUnitId = session?.facilityUnitId;
    actionType = "OPEN_DINE_IN_BILL";
    actionUrl = session ? `/dine/${session.id}/bill` : "/scan";
  } else if (qr.type === "ITEM") {
    actionType = "OPEN_DINE_IN_ITEM";
    actionUrl = `/dine/items/${qr.targetId}`;
  } else if (qr.type === "REVIEW") {
    actionType = "OPEN_REVIEW";
    actionUrl = `/reviews/new?intent_id=${encodeURIComponent(qr.targetId)}`;
  } else if (qr.type === "STAFF") {
    actionType = "OPEN_STAFF_PROFILE";
    actionUrl = `/profiles/technician/${encodeURIComponent(qr.targetId)}`;
  } else {
    actionType = "OPEN_SHOP";
    actionUrl = `/stores/${encodeURIComponent(qr.shopId)}`;
  }

  const resolvedFacility = facilityUnitId ? nextState.facilityUnits.find((unit) => unit.id === facilityUnitId) : facility;
  const resolution: QrResolution = {
    qrId: qr.id,
    type: qr.type,
    shopId: qr.shopId,
    facilityUnitId,
    sessionId,
    action: {
      type: actionType,
      url: actionUrl
    },
    context: {
      shopName: getShopName(qr.shopId),
      facilityLabel: resolvedFacility?.label,
      serviceMode: "DINE_IN"
    }
  };

  addAuditLog(nextState, {
    action: "qr.resolved",
    actorId: "customer-demo",
    actorType: "USER",
    entityType: "QR",
    entityId: qr.id,
    after: resolution.action.type,
    now
  });

  return { state: nextState, result: resolution };
}

export function createDineInOrderInState(
  state: DineInState,
  sessionId: string,
  lines: DineInCartLineInput[],
  now = new Date().toISOString()
): DineInMutationResult<DineInOrder> {
  const nextState = normalizeDineInState(state);
  const session = nextState.diningSessions.find((item) => item.id === sessionId);

  if (!session) {
    throw new Error("Dining session was not found.");
  }

  const facility = nextState.facilityUnits.find((unit) => unit.id === session.facilityUnitId);
  const normalizedLines = lines
    .map((line) => ({ ...line, quantity: Math.max(0, Math.floor(line.quantity)) }))
    .filter((line) => line.quantity > 0);

  if (normalizedLines.length === 0) {
    throw new Error("Order requires at least one menu item.");
  }

  const orderId = createId("order", now);
  let subtotal = 0;
  const items: DineInOrderItem[] = normalizedLines.map((line, index) => {
    const item = nextState.menuItems.find((menuItem) => menuItem.id === line.menuItemId);

    if (!item || !item.active || item.stockStatus === "SOLD_OUT") {
      throw new Error("One or more menu items are not available.");
    }

    if (line.quantity < getMenuItemMinimumOrderQuantity(item)) {
      throw new Error("One or more menu items are below the minimum order quantity.");
    }

    if (item.maximumPerOrderQuantity && line.quantity > item.maximumPerOrderQuantity) {
      throw new Error("One or more menu items exceed the per-order quantity limit.");
    }

    const existingSessionQuantity = getExistingSessionQuantityForItem(nextState, session.id, item.id);

    if (item.maximumPurchaseQuantity && existingSessionQuantity + line.quantity > item.maximumPurchaseQuantity) {
      throw new Error("One or more menu items exceed the total purchase quantity limit.");
    }

    if (item.maximumPerPersonQuantity && existingSessionQuantity + line.quantity > item.maximumPerPersonQuantity) {
      throw new Error("One or more menu items exceed the per-person quantity limit.");
    }

    const optionIds = line.optionIds ?? [];
    const unitPrice = getMenuItemTaxIncludedPriceJpy(item) + findOptionPriceDelta(item, optionIds);
    subtotal += unitPrice * line.quantity;

    return {
      id: `${orderId}-item-${index + 1}`,
      orderId,
      menuItemId: item.id,
      nameSnapshot: getMenuItemLabel(item),
      priceSnapshotJpy: unitPrice,
      quantity: line.quantity,
      optionsSnapshot: findOptionLabels(item, optionIds),
      note: line.note?.trim() || undefined,
      productionArea: item.productionArea,
      status: "SUBMITTED"
    };
  });

  const serviceFee = Math.round(subtotal * 0.1);
  const facilityFee = facility?.metadata?.facilityFeeJpy ?? 0;
  const order: DineInOrder = {
    id: orderId,
    orderNo: createOrderNo(now, nextState.orders.length + 1),
    shopId: session.shopId,
    sessionId,
    facilityUnitId: session.facilityUnitId,
    userId: session.openedByUserId,
    guestLabel: session.openedByUserId ? "扫码用户" : "临时访客",
    status: "PENDING",
    subtotalJpy: subtotal,
    taxJpy: 0,
    serviceFeeJpy: serviceFee,
    facilityFeeJpy: facilityFee,
    discountJpy: 0,
    totalJpy: subtotal + serviceFee + facilityFee,
    createdAt: now,
    assignedStaffId: session.assignedStaffId,
    alertFlags: ["新单"]
  };

  nextState.orders.unshift(order);
  nextState.orderItems.unshift(...items);
  session.status = "ACTIVE";

  if (facility) {
    facility.status = "ORDERING";
    facility.currentSessionId = session.id;
  }

  addAuditLog(nextState, {
    action: "dine_in.order.created",
    actorId: session.openedByUserId ?? "customer-demo",
    actorType: "USER",
    entityType: "ORDER",
    entityId: order.id,
    after: order.status,
    now
  });

  return { state: nextState, result: order };
}

export function updateDineInOrderStatusInState(
  state: DineInState,
  orderId: string,
  status: DineInOrderStatus,
  now = new Date().toISOString()
): DineInMutationResult<DineInOrder> {
  const nextState = cloneState(state);
  const order = nextState.orders.find((item) => item.id === orderId);

  if (!order) {
    throw new Error("Dine-in order was not found.");
  }

  const before = order.status;
  order.status = status;

  if (status === "ACCEPTED") {
    order.acceptedAt = now;
    nextState.orderItems
      .filter((item) => item.orderId === orderId && item.status === "SUBMITTED")
      .forEach((item) => {
        item.status = "CONFIRMED";
      });
  }

  if (status === "COMPLETED") {
    order.completedAt = now;
  }

  addAuditLog(nextState, {
    action: "dine_in.order.status_changed",
    entityType: "ORDER",
    entityId: order.id,
    before,
    after: status,
    now
  });

  return { state: nextState, result: order };
}

export function updateDineInOrderItemStatusInState(
  state: DineInState,
  itemId: string,
  status: DineInOrderItemStatus,
  now = new Date().toISOString()
): DineInMutationResult<DineInOrderItem> {
  const nextState = cloneState(state);
  const item = nextState.orderItems.find((candidate) => candidate.id === itemId);

  if (!item) {
    throw new Error("Dine-in order item was not found.");
  }

  const before = item.status;
  item.status = status;

  if (status === "SERVED") {
    item.servedAt = now;
  }

  const siblingItems = nextState.orderItems.filter((candidate) => candidate.orderId === item.orderId);
  const order = nextState.orders.find((candidate) => candidate.id === item.orderId);

  if (order) {
    if (siblingItems.every((candidate) => candidate.status === "SERVED")) {
      order.status = "SERVED";
    } else if (siblingItems.some((candidate) => candidate.status === "SERVED")) {
      order.status = "PARTIALLY_SERVED";
    } else if (siblingItems.every((candidate) => candidate.status === "READY")) {
      order.status = "READY";
    } else if (siblingItems.some((candidate) => candidate.status === "READY")) {
      order.status = "PARTIALLY_READY";
    } else if (siblingItems.some((candidate) => candidate.status === "PREPARING")) {
      order.status = siblingItems.every((candidate) => candidate.status === "PREPARING") ? "PREPARING" : "PARTIALLY_PREPARING";
    }
  }

  addAuditLog(nextState, {
    action: "dine_in.item.status_changed",
    entityType: "ITEM",
    entityId: item.id,
    before,
    after: status,
    now
  });

  return { state: nextState, result: item };
}

export function requestDineInCheckoutInState(
  state: DineInState,
  sessionId: string,
  method: DineInPaymentMethod = "CASH",
  now = new Date().toISOString()
): DineInMutationResult<string> {
  const nextState = cloneState(state);
  const session = nextState.diningSessions.find((item) => item.id === sessionId);

  if (!session) {
    throw new Error("Dining session was not found.");
  }

  const sessionOrders = nextState.orders.filter((order) => order.sessionId === sessionId && !["CANCELLED", "REFUNDED"].includes(order.status));
  const amount = sessionOrders.reduce((sum, order) => sum + order.totalJpy, 0);
  const existingPayment = nextState.payments.find((payment) => payment.sessionId === sessionId && payment.status !== "CONFIRMED");
  const paymentId = existingPayment?.id ?? createId("payment", now);

  session.status = "PAYMENT_PENDING";
  session.billLockedAt = session.billLockedAt ?? now;
  sessionOrders.forEach((order) => {
    order.status = "CHECKOUT_REQUESTED";
  });

  const facility = nextState.facilityUnits.find((unit) => unit.id === session.facilityUnitId);
  if (facility) {
    facility.status = "PAYMENT_PENDING";
  }

  if (existingPayment) {
    existingPayment.amountJpy = amount;
    existingPayment.method = method;
    existingPayment.status = "OFFLINE_PENDING_CONFIRMATION";
  } else {
    nextState.payments.unshift({
      id: paymentId,
      shopId: session.shopId,
      sessionId,
      amountJpy: amount,
      method,
      status: "OFFLINE_PENDING_CONFIRMATION"
    });
  }

  addAuditLog(nextState, {
    action: "checkout.requested",
    entityType: "SESSION",
    entityId: session.id,
    after: "PAYMENT_PENDING",
    now
  });

  return { state: nextState, result: paymentId };
}

export function confirmDineInPaymentInState(
  state: DineInState,
  paymentId: string,
  {
    method,
    posReference,
    status = "CONFIRMED"
  }: {
    method?: DineInPaymentMethod;
    posReference?: string;
    status?: Extract<DineInPaymentStatus, "CONFIRMED" | "FAILED" | "CANCELLED">;
  } = {},
  now = new Date().toISOString()
): DineInMutationResult<string | null> {
  const nextState = cloneState(state);
  const payment = nextState.payments.find((item) => item.id === paymentId);

  if (!payment) {
    throw new Error("Payment record was not found.");
  }

  const before = payment.status;
  payment.status = status;
  payment.method = method ?? payment.method;
  payment.posReference = posReference ?? payment.posReference;

  if (status === "CONFIRMED") {
    payment.confirmedAt = now;
    payment.confirmedByStaffId = "staff-cashier";
  }

  let reviewIntentId: string | null = null;

  if (status === "CONFIRMED") {
    const session = nextState.diningSessions.find((item) => item.id === payment.sessionId);
    const sessionOrders = nextState.orders.filter((order) => order.sessionId === payment.sessionId);
    const facility = session ? nextState.facilityUnits.find((unit) => unit.id === session.facilityUnitId) : undefined;

    if (session) {
      session.status = "PAID";
      session.closedAt = now;
    }

    sessionOrders.forEach((order) => {
      order.status = "PAID";
      order.completedAt = now;
    });

    if (facility) {
      facility.status = "CLEANING";
    }

    const existingIntent = nextState.reviewIntents.find((intent) => intent.sessionId === payment.sessionId && intent.status === "OPEN");
    reviewIntentId = existingIntent?.id ?? createId("review-intent", now);

    if (!existingIntent) {
      nextState.reviewIntents.unshift({
        id: reviewIntentId,
        shopId: payment.shopId,
        sessionId: payment.sessionId,
        orderIds: sessionOrders.map((order) => order.id),
        targets: ["SHOP", "MENU_ITEM", "STAFF", "CAST", "SESSION"],
        status: "OPEN",
        createdAt: now
      });
    }
  }

  addAuditLog(nextState, {
    action: "payment.confirmed",
    entityType: "PAYMENT",
    entityId: payment.id,
    before,
    after: payment.status,
    now
  });

  return { state: nextState, result: reviewIntentId };
}

export function setMenuItemStockStatusInState(
  state: DineInState,
  itemId: string,
  stockStatus: DineInMenuItem["stockStatus"],
  now = new Date().toISOString()
): DineInMutationResult<DineInMenuItem> {
  const nextState = normalizeDineInState(state);
  const item = nextState.menuItems.find((candidate) => candidate.id === itemId);

  if (!item) {
    throw new Error("Menu item was not found.");
  }

  const before = item.stockStatus;
  item.stockStatus = stockStatus;
  addAuditLog(nextState, {
    action: "menu_item.stock_status_changed",
    entityType: "MENU",
    entityId: item.id,
    before,
    after: stockStatus,
    now
  });

  return { state: nextState, result: item };
}

export function updateDineInMenuItemInState(
  state: DineInState,
  itemId: string,
  input: DineInMenuItemUpdateInput,
  now = new Date().toISOString()
): DineInMutationResult<DineInMenuItem> {
  const nextState = normalizeDineInState(state);
  const item = nextState.menuItems.find((candidate) => candidate.id === itemId);

  if (!item) {
    throw new Error("Menu item was not found.");
  }

  const before = JSON.stringify({
    name: item.name.zh,
    price: item.basePriceJpy,
    minimumOrderQuantity: item.minimumOrderQuantity,
    specialOffer: item.specialOffer
  });

  if (input.name) {
    item.name = { ...item.name, ...input.name };
  }

  if (input.description) {
    item.description = { ...item.description, ...input.description };
  }

  if (input.imageUrl?.trim()) {
    item.imageUrl = input.imageUrl.trim();
  }

  if (input.categoryId) {
    const nextCategory = nextState.menuCategories.find((category) => category.id === input.categoryId);

    if (nextCategory) {
      item.categoryId = nextCategory.id;
      item.menuId = nextCategory.menuId;
    }
  }

  if (typeof input.basePriceJpy === "number") {
    item.basePriceJpy = normalizePositiveInteger(input.basePriceJpy, item.basePriceJpy);
  }

  if (input.taxMode) {
    item.taxMode = input.taxMode;
  }

  if (typeof input.minimumOrderQuantity === "number") {
    item.minimumOrderQuantity = normalizePositiveInteger(input.minimumOrderQuantity, 1);
  }

  if ("maximumPurchaseQuantity" in input) {
    item.maximumPurchaseQuantity = normalizeOptionalPositiveInteger(input.maximumPurchaseQuantity);
  }

  if ("maximumPerOrderQuantity" in input) {
    item.maximumPerOrderQuantity = normalizeOptionalPositiveInteger(input.maximumPerOrderQuantity);
  }

  if ("maximumPerPersonQuantity" in input) {
    item.maximumPerPersonQuantity = normalizeOptionalPositiveInteger(input.maximumPerPersonQuantity);
  }

  if (input.specialOffer) {
    item.specialOffer = normalizeSpecialOffer({ ...item, specialOffer: input.specialOffer });
  }

  if (typeof input.active === "boolean") {
    item.active = input.active;
  }

  if (input.stockStatus) {
    item.stockStatus = input.stockStatus;
  }

  if (input.productionArea) {
    item.productionArea = input.productionArea;
  }

  if (input.restrictionFlags) {
    item.restrictionFlags = normalizeRestrictionFlags(input.restrictionFlags);
  }

  const after = JSON.stringify({
    name: item.name.zh,
    price: item.basePriceJpy,
    minimumOrderQuantity: item.minimumOrderQuantity,
    specialOffer: item.specialOffer
  });

  addAuditLog(nextState, {
    action: "menu_item.updated",
    entityType: "ITEM",
    entityId: item.id,
    before,
    after,
    now
  });

  return { state: nextState, result: item };
}

function getDefaultProductionAreaForMenu(menu: DineInMenu): ProductionArea {
  if (menu.kind === "DRINK") {
    return "BAR";
  }

  if (menu.kind === "SERVICE") {
    return "CAST";
  }

  return "KITCHEN";
}

export function createDineInMenuItemInState(
  state: DineInState,
  input: DineInMenuItemCreateInput,
  now = new Date().toISOString()
): DineInMutationResult<DineInMenuItem> {
  const nextState = normalizeDineInState(state);
  const category = nextState.menuCategories.find((candidate) => candidate.id === input.categoryId);

  if (!category) {
    throw new Error("Menu category was not found.");
  }

  const menu = nextState.menus.find((candidate) => candidate.id === category.menuId);

  if (!menu) {
    throw new Error("Menu was not found.");
  }

  const nameZh = input.name?.zh?.trim() || "新单品";
  const descriptionZh = input.description?.zh?.trim() || "请输入单品介绍。";
  const basePriceJpy = normalizePositiveInteger(input.basePriceJpy, 1000);
  const item: DineInMenuItem = {
    id: createId("item", now),
    menuId: menu.id,
    categoryId: category.id,
    name: { zh: nameZh, ja: input.name?.ja || nameZh, en: input.name?.en || nameZh, ko: input.name?.ko || nameZh },
    description: {
      zh: descriptionZh,
      ja: input.description?.ja || descriptionZh,
      en: input.description?.en || descriptionZh,
      ko: input.description?.ko || descriptionZh
    },
    imageUrl: input.imageUrl?.trim() || nextState.menuItems.find((candidate) => candidate.menuId === menu.id)?.imageUrl || "",
    basePriceJpy,
    taxMode: input.taxMode ?? "TAX_INCLUDED",
    minimumOrderQuantity: normalizePositiveInteger(input.minimumOrderQuantity, 1),
    maximumPurchaseQuantity: normalizeOptionalPositiveInteger(input.maximumPurchaseQuantity),
    maximumPerOrderQuantity: normalizeOptionalPositiveInteger(input.maximumPerOrderQuantity),
    maximumPerPersonQuantity: normalizeOptionalPositiveInteger(input.maximumPerPersonQuantity),
    specialOffer: normalizeSpecialOffer({
      id: "preview",
      menuId: menu.id,
      categoryId: category.id,
      name: { zh: nameZh, ja: nameZh },
      description: { zh: descriptionZh, ja: descriptionZh },
      imageUrl: input.imageUrl?.trim() || "",
      basePriceJpy,
      taxMode: input.taxMode ?? "TAX_INCLUDED",
      productionArea: input.productionArea ?? getDefaultProductionAreaForMenu(menu),
      stockStatus: input.stockStatus ?? "AVAILABLE",
      active: input.active ?? true,
      specialOffer: input.specialOffer
    }),
    productionArea: input.productionArea ?? getDefaultProductionAreaForMenu(menu),
    stockStatus: input.stockStatus ?? "AVAILABLE",
    active: input.active ?? true,
    restrictionFlags: normalizeRestrictionFlags(input.restrictionFlags)
  };

  nextState.menuItems.push(item);
  addAuditLog(nextState, {
    action: "menu_item.created",
    entityType: "ITEM",
    entityId: item.id,
    after: item.name.zh,
    now
  });

  return { state: nextState, result: item };
}

export function updateDineInMenuCategoryInState(
  state: DineInState,
  categoryId: string,
  input: DineInMenuCategoryUpdateInput,
  now = new Date().toISOString()
): DineInMutationResult<MenuCategory> {
  const nextState = normalizeDineInState(state);
  const category = nextState.menuCategories.find((candidate) => candidate.id === categoryId);

  if (!category) {
    throw new Error("Menu category was not found.");
  }

  const before = category.name.zh;

  if (input.name) {
    category.name = { ...category.name, ...input.name };
  }

  addAuditLog(nextState, {
    action: "menu_category.updated",
    entityType: "MENU",
    entityId: category.id,
    before,
    after: category.name.zh,
    now
  });

  return { state: nextState, result: category };
}

export function createDineInMenuCategoryInState(
  state: DineInState,
  menuId: string,
  nameZh: string,
  now = new Date().toISOString()
): DineInMutationResult<MenuCategory> {
  const nextState = normalizeDineInState(state);
  const menu = nextState.menus.find((candidate) => candidate.id === menuId);

  if (!menu) {
    throw new Error("Menu was not found.");
  }

  const trimmedName = nameZh.trim() || "新分类";
  const sameMenuCategories = nextState.menuCategories.filter((category) => category.menuId === menuId);
  const category: MenuCategory = {
    id: createId("cat", now),
    menuId,
    name: { zh: trimmedName, ja: trimmedName, en: trimmedName, ko: trimmedName },
    sortOrder: sameMenuCategories.reduce((max, current) => Math.max(max, current.sortOrder), 0) + 1
  };

  nextState.menuCategories.push(category);
  addAuditLog(nextState, {
    action: "menu_category.created",
    entityType: "MENU",
    entityId: category.id,
    after: category.name.zh,
    now
  });

  return { state: nextState, result: category };
}

export function deleteDineInMenuCategoryInState(
  state: DineInState,
  categoryId: string,
  now = new Date().toISOString()
): DineInMutationResult<MenuCategory> {
  const nextState = normalizeDineInState(state);
  const category = nextState.menuCategories.find((candidate) => candidate.id === categoryId);

  if (!category) {
    throw new Error("Menu category was not found.");
  }

  const sameMenuCategories = nextState.menuCategories
    .filter((candidate) => candidate.menuId === category.menuId && candidate.id !== category.id)
    .sort((left, right) => left.sortOrder - right.sortOrder);

  if (sameMenuCategories.length === 0) {
    throw new Error("At least one category is required.");
  }

  const fallbackCategoryId = sameMenuCategories[0].id;
  nextState.menuItems.forEach((item) => {
    if (item.categoryId === category.id) {
      item.categoryId = fallbackCategoryId;
    }
  });
  nextState.menuCategories = nextState.menuCategories.filter((candidate) => candidate.id !== category.id);

  addAuditLog(nextState, {
    action: "menu_category.deleted",
    entityType: "MENU",
    entityId: category.id,
    before: category.name.zh,
    now
  });

  return { state: nextState, result: category };
}

export function setFacilityStatusInState(
  state: DineInState,
  facilityId: string,
  status: FacilityStatus,
  now = new Date().toISOString()
) {
  const nextState = cloneState(state);
  const facility = nextState.facilityUnits.find((candidate) => candidate.id === facilityId);

  if (!facility) {
    throw new Error("Facility was not found.");
  }

  const before = facility.status;
  facility.status = status;
  addAuditLog(nextState, {
    action: "facility_status_changed",
    entityType: "FACILITY",
    entityId: facility.id,
    before,
    after: status,
    now
  });

  return { state: nextState, result: facility };
}

export function useDineInStore() {
  const [state, setState] = useState<DineInState>(() => getStoredDineInState());

  useEffect(() => {
    const sync = () => setState(getStoredDineInState());

    window.addEventListener("storage", sync);
    window.addEventListener(dineInStateEventName, sync);

    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(dineInStateEventName, sync);
    };
  }, []);

  const actions = useMemo(
    () => ({
      reset: () => {
        const nextState = resetDineInState();
        setState(nextState);
        return nextState;
      },
      resolveQrToken: (token: string) => {
        const mutation = resolveQrTokenInState(getStoredDineInState(), token);
        persistDineInState(mutation.state);
        setState(mutation.state);
        return mutation.result;
      },
      createOrder: (sessionId: string, lines: DineInCartLineInput[]) => {
        const mutation = createDineInOrderInState(getStoredDineInState(), sessionId, lines);
        persistDineInState(mutation.state);
        setState(mutation.state);
        return mutation.result;
      },
      updateOrderStatus: (orderId: string, status: DineInOrderStatus) => {
        const mutation = updateDineInOrderStatusInState(getStoredDineInState(), orderId, status);
        persistDineInState(mutation.state);
        setState(mutation.state);
        return mutation.result;
      },
      updateItemStatus: (itemId: string, status: DineInOrderItemStatus) => {
        const mutation = updateDineInOrderItemStatusInState(getStoredDineInState(), itemId, status);
        persistDineInState(mutation.state);
        setState(mutation.state);
        return mutation.result;
      },
      requestCheckout: (sessionId: string, method?: DineInPaymentMethod) => {
        const mutation = requestDineInCheckoutInState(getStoredDineInState(), sessionId, method);
        persistDineInState(mutation.state);
        setState(mutation.state);
        return mutation.result;
      },
      confirmPayment: (paymentId: string, method?: DineInPaymentMethod, posReference?: string) => {
        const mutation = confirmDineInPaymentInState(getStoredDineInState(), paymentId, { method, posReference });
        persistDineInState(mutation.state);
        setState(mutation.state);
        return mutation.result;
      },
      setMenuItemStockStatus: (itemId: string, stockStatus: DineInMenuItem["stockStatus"]) => {
        const mutation = setMenuItemStockStatusInState(getStoredDineInState(), itemId, stockStatus);
        persistDineInState(mutation.state);
        setState(mutation.state);
        return mutation.result;
      },
      updateMenuItem: (itemId: string, input: DineInMenuItemUpdateInput) => {
        const mutation = updateDineInMenuItemInState(getStoredDineInState(), itemId, input);
        persistDineInState(mutation.state);
        setState(mutation.state);
        return mutation.result;
      },
      createMenuItem: (input: DineInMenuItemCreateInput) => {
        const mutation = createDineInMenuItemInState(getStoredDineInState(), input);
        persistDineInState(mutation.state);
        setState(mutation.state);
        return mutation.result;
      },
      updateMenuCategory: (categoryId: string, input: DineInMenuCategoryUpdateInput) => {
        const mutation = updateDineInMenuCategoryInState(getStoredDineInState(), categoryId, input);
        persistDineInState(mutation.state);
        setState(mutation.state);
        return mutation.result;
      },
      createMenuCategory: (menuId: string, nameZh: string) => {
        const mutation = createDineInMenuCategoryInState(getStoredDineInState(), menuId, nameZh);
        persistDineInState(mutation.state);
        setState(mutation.state);
        return mutation.result;
      },
      deleteMenuCategory: (categoryId: string) => {
        const mutation = deleteDineInMenuCategoryInState(getStoredDineInState(), categoryId);
        persistDineInState(mutation.state);
        setState(mutation.state);
        return mutation.result;
      },
      setFacilityStatus: (facilityId: string, status: FacilityStatus) => {
        const mutation = setFacilityStatusInState(getStoredDineInState(), facilityId, status);
        persistDineInState(mutation.state);
        setState(mutation.state);
        return mutation.result;
      }
    }),
    []
  );

  return {
    state,
    actions
  };
}

export function getDineInOrderItems(state: DineInState, orderId: string) {
  return state.orderItems.filter((item) => item.orderId === orderId);
}

export function getDineInSessionOrders(state: DineInState, sessionId: string) {
  return state.orders.filter((order) => order.sessionId === sessionId);
}

export function getDineInSessionBillTotal(state: DineInState, sessionId: string) {
  return getDineInSessionOrders(state, sessionId).reduce((sum, order) => sum + order.totalJpy, 0);
}
