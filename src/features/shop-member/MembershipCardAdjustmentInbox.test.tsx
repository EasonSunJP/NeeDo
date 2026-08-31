// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "../../api/httpClient";
import { customerShopMembershipApi, type ShopMembershipCardAdjustment, type ShopMembershipCardAdjustmentStatus } from "./api";
import { MembershipCardAdjustmentInbox } from "./MembershipCardAdjustmentInbox";
import source from "./MembershipCardAdjustmentInbox.tsx?raw";

const adjustment = (status: ShopMembershipCardAdjustmentStatus, index: number): ShopMembershipCardAdjustment => ({
  publicId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  status,
  reason: "线下账目核对",
  dimension: "principal_balance",
  beforeValue: 1_000,
  targetValue: 1_500,
  difference: 500,
  expiresAt: "2026-09-04T00:00:00.000Z",
  remainingSeconds: 3_600,
  decidedAt: status === "approved" || status === "rejected" ? "2026-09-01T00:00:00.000Z" : null,
  cancelledAt: status === "cancelled" ? "2026-09-01T00:00:00.000Z" : null,
  invalidatedAt: status === "invalidated" ? "2026-09-01T00:00:00.000Z" : null,
  createdAt: "2026-08-31T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  card: {
    publicId: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    cardNoMasked: "NMC-********************AABB",
    name: "青山储值卡",
    type: "stored_value",
    status: "active",
    principalBalanceJpy: 1_000,
    bonusBalanceJpy: 0,
    remainingUses: null,
    totalUses: null
  },
  shop: { shopNo: "s000000001", name: "青山护理店" },
  customer: { needoId: "u0000000001", displayName: "望月 結菜" },
  replayed: false
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("MembershipCardAdjustmentInbox", () => {
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

  it("gives customers an explicit 72-hour approve or reject decision", () => {
    for (const copy of ["待确认的会员卡调整", "变更前", "变更后", "店铺说明", "同意修改", "拒绝修改", "到期不会自动同意"]) {
      expect(source).toContain(copy);
    }
    expect(source).toContain("adjustmentRequests");
    expect(source).toContain("decideCardAdjustment");
    expect(source).toContain('<TestFeatureBadge');
    expect(source).not.toContain("到期自动同意");
  });

  it("renders recent terminal outcomes read-only instead of discarding them", async () => {
    const records = (["approved", "rejected", "cancelled", "expired", "invalidated"] as const)
      .map((status, index) => adjustment(status, index + 1));
    const list = vi.spyOn(customerShopMembershipApi, "adjustmentRequests").mockResolvedValue({
      list: records,
      total: records.length,
      page: 1,
      page_size: 50
    });

    await act(async () => root.render(<MembershipCardAdjustmentInbox onChanged={vi.fn()} />));
    await flush();

    expect(list).toHaveBeenCalledWith({ page: 1, pageSize: 50 });
    for (const label of ["客户已同意", "客户已拒绝", "店铺已撤回", "已超时失效", "卡状态变化，已失效"]) {
      expect(document.body.textContent).toContain(label);
    }
    expect(Array.from(document.body.querySelectorAll("button")).some((button) => button.textContent?.includes("同意修改"))).toBe(false);
  });

  it("refetches after a terminal decision conflict and replaces stale actions", async () => {
    const pending = adjustment("pending", 11);
    const expired = adjustment("expired", 11);
    const list = vi.spyOn(customerShopMembershipApi, "adjustmentRequests")
      .mockResolvedValueOnce({ list: [pending], total: 1, page: 1, page_size: 50 })
      .mockResolvedValueOnce({ list: [expired], total: 1, page: 1, page_size: 50 });
    vi.spyOn(customerShopMembershipApi, "decideCardAdjustment")
      .mockRejectedValue(new ApiClientError("error.shop_membership_card_adjustment_expired", 409, 409));

    await act(async () => root.render(<MembershipCardAdjustmentInbox onChanged={vi.fn()} />));
    await flush();
    const approve = Array.from(document.body.querySelectorAll("button")).find((button) => button.textContent?.includes("同意修改"));
    await act(async () => approve?.click());
    const confirm = Array.from(document.body.querySelectorAll("button")).find((button) => button.textContent?.includes("确认提交"));
    await act(async () => confirm?.click());
    await flush();

    expect(list).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).toContain("已超时失效");
    expect(document.body.textContent).not.toContain("同意修改");
  });
});
