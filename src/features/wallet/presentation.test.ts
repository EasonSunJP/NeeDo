import { describe, expect, it } from "vitest";
import { hasTestNdpWallet } from "./presentation";

describe("wallet presentation", () => {
  it("uses wallet existence rather than balance size to decide whether Test NDP is shown", () => {
    expect(hasTestNdpWallet({
      activeCurrency: "NDP",
      hasTestNdpWallet: true,
      ndp: { available: 100, frozen: 0 },
      testNdp: { available: 0, frozen: 0 }
    })).toBe(true);
    expect(hasTestNdpWallet({
      activeCurrency: "NDP",
      hasTestNdpWallet: false,
      ndp: { available: 100, frozen: 0 },
      testNdp: { available: 0, frozen: 0 }
    })).toBe(false);
  });
});
