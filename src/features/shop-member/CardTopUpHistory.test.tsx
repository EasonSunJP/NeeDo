// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { customerShopMembershipApi, merchantShopMembershipApi, type ShopMembershipCardTopUp } from "./api";
import { CardTopUpHistory } from "./CardTopUpHistory";
import source from "./CardTopUpHistory.tsx?raw";

const topUp: ShopMembershipCardTopUp = {
  publicId: "00000000-0000-4000-8000-000000000702",
  amountJpy: 5_000,
  paymentMethod: "cash",
  paymentReference: "receipt-001",
  note: "店内现金充值",
  principalBalanceBeforeJpy: 10_000,
  principalBalanceAfterJpy: 15_000,
  createdAt: "2026-09-01T03:00:00.000Z",
  updatedAt: "2026-09-01T03:00:00.000Z",
  card: { publicId: "00000000-0000-4000-8000-000000000701", cardNoMasked: "NMC-********************AABB", name: "青山储值卡", type: "stored_value", status: "active", principalBalanceJpy: 15_000, bonusBalanceJpy: 0 },
  shop: { shopNo: "s000000071", name: "青山护理店" },
  customer: { needoId: "u0000000041", displayName: "王小美" },
  createdBy: { needoId: "u0000000090", displayName: "青山店主" },
  replayed: false
};

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("CardTopUpHistory", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await act(async () => root.unmount());
    container.remove();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("shows immutable paid-principal evidence and never advertises NDP or gifts", () => {
    for (const copy of ["充值记录", "充值金额", "充值前", "充值后", "收款方式", "不可修改的正式记录"]) {
      expect(source).toContain(copy);
    }
    expect(source).toContain("<TestFeatureBadge");
    expect(source).not.toContain("赠送金额");
    expect(source).not.toContain("获得 NDP");
  });

  it("uses shop-scoped history for merchants and self-scoped history for customers", async () => {
    const merchantList = vi.spyOn(merchantShopMembershipApi, "topUps").mockResolvedValue({ list: [topUp], total: 1, page: 1, page_size: 20 });
    const customerList = vi.spyOn(customerShopMembershipApi, "topUps").mockResolvedValue({ list: [topUp], total: 1, page: 1, page_size: 20 });

    await act(async () => root.render(<CardTopUpHistory mode="merchant" revision={0} />));
    await flush();
    expect(merchantList).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
    expect(document.body.textContent).toContain("王小美");

    await act(async () => root.render(<CardTopUpHistory mode="customer" revision={0} />));
    await flush();
    expect(customerList).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
    expect(document.body.textContent).toContain("青山护理店");
  });
});
