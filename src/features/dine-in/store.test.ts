import { describe, expect, it } from "vitest";
import { defaultDineInState } from "./seed";
import {
  confirmDineInPaymentInState,
  createDineInMenuCategoryInState,
  createDineInMenuItemInState,
  createDineInOrderInState,
  deleteDineInMenuCategoryInState,
  getDefaultDineInStateForReset,
  getMenuItemMaximumOrderQuantity,
  getMenuItemTaxIncludedPriceJpy,
  resolveQrTokenInState,
  requestDineInCheckoutInState,
  updateDineInMenuCategoryInState,
  updateDineInMenuItemInState,
  updateDineInOrderItemStatusInState,
  updateDineInOrderStatusInState
} from "./store";

describe("dine-in store", () => {
  it("resolves repeated table QR scans into the same active session", () => {
    const first = resolveQrTokenInState(getDefaultDineInStateForReset(), "qr-table-a08", "2026-05-08T10:00:00+09:00");
    const second = resolveQrTokenInState(first.state, "needo://qr/qr-table-a08", "2026-05-08T10:02:00+09:00");

    expect(first.result.sessionId).toBe("session-a08");
    expect(second.result.sessionId).toBe("session-a08");
    expect(second.state.diningSessions.filter((session) => session.facilityUnitId === "facility-table-a08")).toHaveLength(1);
  });

  it("creates a dine-in order without changing the existing booking ledger", () => {
    const mutation = createDineInOrderInState(
      getDefaultDineInStateForReset(),
      "session-a08",
      [{ menuItemId: "item-burger", quantity: 2 }],
      "2026-05-08T10:10:00+09:00"
    );

    expect(mutation.result.orderNo).toBe("DINE-20260508-0004");
    expect(mutation.result.status).toBe("PENDING");
    expect(mutation.state.orderItems.filter((item) => item.orderId === mutation.result.id)).toHaveLength(1);
    expect(defaultDineInState.orders).toHaveLength(3);
  });

  it("keeps food, drink, and service sheets separate with editable food categories", () => {
    const state = getDefaultDineInStateForReset();

    expect(state.menus.map((menu) => [menu.kind, menu.name.zh])).toEqual([
      ["FOOD", "菜单"],
      ["DRINK", "酒单"],
      ["SERVICE", "服务单"]
    ]);
    expect(state.menuCategories.filter((category) => category.menuId === "menu-dinner").map((category) => category.name.zh)).toEqual([
      "推荐",
      "套餐",
      "前菜",
      "料理",
      "主食"
    ]);
    expect(state.menuItems.find((item) => item.id === "item-beer")?.menuId).toBe("menu-drinks");
  });

  it("updates menu item copy, tax price, minimum quantity, and special offer", () => {
    const updated = updateDineInMenuItemInState(
      getDefaultDineInStateForReset(),
      "item-burger",
      {
        name: { zh: "新版和牛汉堡" },
        description: { zh: "可编辑说明" },
        basePriceJpy: 1880,
        minimumOrderQuantity: 2,
        maximumPurchaseQuantity: 3,
        maximumPerOrderQuantity: 2,
        maximumPerPersonQuantity: 3,
        restrictionFlags: ["ONLINE_RESERVATION_ONLY", "BIRTHDAY_ONLY"],
        specialOffer: { active: true, priceJpy: 1580, label: "晚市特价" }
      },
      "2026-05-08T11:00:00+09:00"
    );
    const item = updated.result;

    expect(item.name.zh).toBe("新版和牛汉堡");
    expect(item.description.zh).toBe("可编辑说明");
    expect(item.minimumOrderQuantity).toBe(2);
    expect(getMenuItemMaximumOrderQuantity(item)).toBe(2);
    expect(item.restrictionFlags).toEqual(["ONLINE_RESERVATION_ONLY", "BIRTHDAY_ONLY"]);
    expect(getMenuItemTaxIncludedPriceJpy(item)).toBe(1580);
    expect(() =>
      createDineInOrderInState(updated.state, "session-a08", [{ menuItemId: "item-burger", quantity: 1 }], "2026-05-08T11:01:00+09:00")
    ).toThrow(/minimum order quantity/);
    expect(() =>
      createDineInOrderInState(updated.state, "session-a08", [{ menuItemId: "item-burger", quantity: 3 }], "2026-05-08T11:02:00+09:00")
    ).toThrow(/per-order quantity limit/);
  });

  it("creates a new menu item under a specific category", () => {
    const created = createDineInMenuItemInState(
      getDefaultDineInStateForReset(),
      {
        categoryId: "cat-appetizer",
        name: { zh: "番茄沙拉" },
        description: { zh: "冷前菜。" },
        imageUrl: "data:image/png;base64,abc",
        basePriceJpy: 680,
        minimumOrderQuantity: 1,
        maximumPerOrderQuantity: 5,
        restrictionFlags: ["ADVANCE_RESERVATION_ONLY"],
        productionArea: "KITCHEN"
      },
      "2026-05-08T11:30:00+09:00"
    );

    expect(created.result.menuId).toBe("menu-dinner");
    expect(created.result.categoryId).toBe("cat-appetizer");
    expect(created.result.imageUrl).toBe("data:image/png;base64,abc");
    expect(created.result.restrictionFlags).toEqual(["ADVANCE_RESERVATION_ONLY"]);
    expect(created.state.menuItems.find((item) => item.id === created.result.id)?.name.zh).toBe("番茄沙拉");
  });

  it("creates, renames, and deletes menu categories while moving affected items", () => {
    const created = createDineInMenuCategoryInState(getDefaultDineInStateForReset(), "menu-dinner", "甜品", "2026-05-08T12:00:00+09:00");
    const renamed = updateDineInMenuCategoryInState(created.state, created.result.id, { name: { zh: "甜点" } }, "2026-05-08T12:01:00+09:00");
    const moved = updateDineInMenuItemInState(renamed.state, "item-burger", { categoryId: created.result.id }, "2026-05-08T12:02:00+09:00");
    const deleted = deleteDineInMenuCategoryInState(moved.state, created.result.id, "2026-05-08T12:03:00+09:00");

    expect(renamed.result.name.zh).toBe("甜点");
    expect(deleted.state.menuCategories.some((category) => category.id === created.result.id)).toBe(false);
    expect(deleted.state.menuItems.find((item) => item.id === "item-burger")?.categoryId).not.toBe(created.result.id);
  });

  it("rolls item status into order status for KDS and serving", () => {
    const created = createDineInOrderInState(
      getDefaultDineInStateForReset(),
      "session-a08",
      [{ menuItemId: "item-burger", quantity: 1 }],
      "2026-05-08T10:15:00+09:00"
    );
    const accepted = updateDineInOrderStatusInState(created.state, created.result.id, "ACCEPTED", "2026-05-08T10:16:00+09:00");
    const itemId = accepted.state.orderItems.find((item) => item.orderId === created.result.id)?.id;

    expect(itemId).toBeTruthy();

    const preparing = updateDineInOrderItemStatusInState(accepted.state, itemId!, "PREPARING", "2026-05-08T10:17:00+09:00");
    const ready = updateDineInOrderItemStatusInState(preparing.state, itemId!, "READY", "2026-05-08T10:20:00+09:00");
    const served = updateDineInOrderItemStatusInState(ready.state, itemId!, "SERVED", "2026-05-08T10:25:00+09:00");

    expect(preparing.state.orders.find((order) => order.id === created.result.id)?.status).toBe("PREPARING");
    expect(ready.state.orders.find((order) => order.id === created.result.id)?.status).toBe("READY");
    expect(served.state.orders.find((order) => order.id === created.result.id)?.status).toBe("SERVED");
  });

  it("confirms offline payment and creates a review intent", () => {
    const checkout = requestDineInCheckoutInState(getDefaultDineInStateForReset(), "session-a08", "CASH", "2026-05-08T10:30:00+09:00");
    const review = confirmDineInPaymentInState(checkout.state, checkout.result, { method: "CASH" }, "2026-05-08T10:34:00+09:00");

    expect(review.result).toMatch(/^review-intent-/);
    expect(review.state.diningSessions.find((session) => session.id === "session-a08")?.status).toBe("PAID");
    expect(review.state.facilityUnits.find((facility) => facility.id === "facility-table-a08")?.status).toBe("CLEANING");
    expect(review.state.reviewIntents.find((intent) => intent.id === review.result)?.targets).toContain("SHOP");
  });
});
