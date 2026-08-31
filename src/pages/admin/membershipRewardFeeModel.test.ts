import { describe, expect, it } from "vitest";
import { buildMembershipRewardFeeInput, parseFeePercent, validateMembershipRewardFeeDraft } from "./membershipRewardFeeModel";

describe("membership reward fee model", () => {
  it("parses 0–100 percent to integer bps with at most two decimals", () => {
    expect(parseFeePercent("0")).toBe(0);
    expect(parseFeePercent("10")).toBe(1000);
    expect(parseFeePercent("12.34")).toBe(1234);
    expect(parseFeePercent("12.345")).toBeNull();
    expect(parseFeePercent("100.01")).toBeNull();
  });

  it("requires a future activation and an audit reason", () => {
    const now = new Date("2026-08-31T00:00:00.000Z");
    expect(validateMembershipRewardFeeDraft({ percent: "10", effectiveFrom: "2026-08-30T00:00", reason: "" }, now)).toEqual({ effectiveFrom: "future", reason: "invalid" });
    expect(buildMembershipRewardFeeInput({ percent: "12.5", effectiveFrom: "2099-01-01T00:00", reason: " new rate " }, 3)).toEqual({ feeRateBps: 1250, expectedVersion: 3, effectiveFrom: new Date("2099-01-01T00:00").toISOString(), reason: "new rate" });
  });
});
