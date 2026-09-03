import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { Order } from "../../types/domain";
import { OrderServiceMiniCard, buildOrderServiceMiniCardData } from "./OrderServiceMiniCard";

const legacyOrder = {
  id: "legacy-order-1",
  orderNo: "ND-LEGACY-1",
  mode: "store",
  status: "completed",
  customerId: "customer-1",
  customerName: "历史用户",
  itemName: "历史护理服务",
  storeName: "历史店铺",
  city: "東京都",
  area: "中央区",
  amount: 8800,
  paymentStatus: "paid",
  bookedAt: "2026-08-01 10:00",
  createdAt: "2026-07-20 09:00",
  source: "app"
} satisfies Order;

describe("OrderServiceMiniCard legacy snapshots", () => {
  it("renders an honest unavailable duration when the persisted name has no duration", () => {
    expect(buildOrderServiceMiniCardData(legacyOrder).durationMinutes).toBeNull();

    const markup = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(OrderServiceMiniCard, { order: legacyOrder }))
    );

    expect(markup).toContain("时长未读取");
    expect(markup).not.toContain("/0分钟");
  });

  it("retains a reliably parsed persisted duration", () => {
    expect(buildOrderServiceMiniCardData({ ...legacyOrder, itemName: "历史护理服务 75 分钟" }).durationMinutes).toBe(75);
  });
});
