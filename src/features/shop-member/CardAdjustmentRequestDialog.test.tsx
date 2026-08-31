import { describe, expect, it } from "vitest";
import source from "./CardAdjustmentRequestDialog.tsx?raw";

describe("CardAdjustmentRequestDialog", () => {
  it("shows final-target review, 72-hour consent, Test badge and no financial side effects", () => {
    for (const copy of ["申请调整会员卡", "当前值", "调整后", "调整原因", "72 小时", "客户明确同意后才会生效", "不产生 NDP"]) {
      expect(source).toContain(copy);
    }
    expect(source).toContain("<TestFeatureBadge");
    expect(source).toContain("requestCardAdjustment");
    expect(source).not.toContain("topUp");
    expect(source).not.toContain("wallet");
  });
});
