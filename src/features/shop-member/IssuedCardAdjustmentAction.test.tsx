// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MerchantShopMembershipCard } from "./api";
import { IssuedCardAdjustmentAction } from "./IssuedCardAdjustmentAction";

const card: MerchantShopMembershipCard = {
  publicId: "10000000-0000-4000-8000-000000000001",
  cardNoMasked: "NMC-********************AABB",
  name: "青山储值卡",
  type: "stored_value",
  status: "active",
  principalBalanceJpy: 1_000,
  bonusBalanceJpy: 0,
  remainingUses: null,
  totalUses: null,
  initialPrincipalJpy: 1_000,
  initialUses: null,
  issuanceSource: "offline_paid",
  platformFeeRateBpsSnapshot: 1_000,
  planPublicId: "30000000-0000-4000-8000-000000000001",
  planVersionPublicId: "40000000-0000-4000-8000-000000000001",
  customerDisplayName: "望月 結菜",
  customerNeedoId: "u0000000001",
  membershipPublicId: "50000000-0000-4000-8000-000000000001",
  planVersion: 1,
  expiresAt: null,
  frozenAt: null,
  issuedAt: "2026-09-01T00:00:00.000Z",
  pendingAdjustment: null
};

const pending: NonNullable<MerchantShopMembershipCard["pendingAdjustment"]> = {
  publicId: "20000000-0000-4000-8000-000000000001",
  status: "pending",
  beforeValue: 1_000,
  targetValue: 1_500,
  expiresAt: "2026-09-04T00:00:00.000Z"
};

describe("IssuedCardAdjustmentAction", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  it("replaces the duplicate request action with a pending summary", async () => {
    const onAdjust = vi.fn();
    const onViewRequests = vi.fn();
    await act(async () => root.render(<IssuedCardAdjustmentAction canAdjust card={card} lookupStatus="ready" onAdjust={onAdjust} onViewRequests={onViewRequests} pendingRequest={pending} />));

    expect(document.body.textContent).toContain("已有调整等待客户确认");
    expect(document.body.textContent).toContain("￥1,000");
    expect(document.body.textContent).toContain("￥1,500");
    expect(document.body.textContent).toContain("查看调整申请");
    expect(document.body.textContent).not.toContain("申请调整");
    await act(async () => Array.from(document.body.querySelectorAll("button")).find((button) => button.textContent?.includes("查看调整申请"))?.click());
    expect(onViewRequests).toHaveBeenCalledOnce();
    expect(onAdjust).not.toHaveBeenCalled();
  });

  it("fails closed while the pending-request lookup is unavailable", async () => {
    const onAdjust = vi.fn();
    await act(async () => root.render(<IssuedCardAdjustmentAction canAdjust card={card} lookupStatus="error" onAdjust={onAdjust} onViewRequests={vi.fn()} pendingRequest={null} />));

    expect(document.body.textContent).toContain("调整状态读取失败");
    expect(document.body.textContent).not.toContain("申请调整");
  });
});
