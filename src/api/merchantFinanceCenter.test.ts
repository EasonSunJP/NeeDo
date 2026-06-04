import { describe, expect, it } from "vitest";
import source from "./merchantFinanceCenter.ts?raw";

describe("merchant finance center typed API", () => {
  it("includes Request fee fields in the order finance detail payload", () => {
    expect(source).toContain("orderType: \"booking\" | \"request\"");
    expect(source).toContain("cRequestFeeHoldNdp: number");
    expect(source).toContain("cRequestFeeActualNdp: number");
    expect(source).toContain("requestFeeNdpRevenue: number");
  });
});
