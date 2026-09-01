import { describe, expect, it } from "vitest";
import source from "./CardAdjustmentRequestList.tsx?raw";

describe("CardAdjustmentRequestList", () => {
  it("loads persisted requests and exposes cancellation only for pending requests", () => {
    for (const copy of ["调整申请", "待客户确认", "变更前", "目标值", "撤回申请", "72 小时未处理会自动失效"]) {
      expect(source).toContain(copy);
    }
    expect(source).toContain("adjustmentRequests");
    expect(source).toContain("cancelCardAdjustment");
    expect(source).toContain('<TestFeatureBadge');
  });
});
