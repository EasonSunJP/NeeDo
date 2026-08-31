import { describe, expect, it } from "vitest";
import source from "./MembershipCardAdjustmentInbox.tsx?raw";

describe("MembershipCardAdjustmentInbox", () => {
  it("gives customers an explicit 72-hour approve or reject decision", () => {
    for (const copy of ["待确认的会员卡调整", "变更前", "变更后", "店铺说明", "同意修改", "拒绝修改", "到期不会自动同意"]) {
      expect(source).toContain(copy);
    }
    expect(source).toContain("adjustmentRequests");
    expect(source).toContain("decideCardAdjustment");
    expect(source).toContain('<TestFeatureBadge');
    expect(source).not.toContain("到期自动同意");
  });
});
