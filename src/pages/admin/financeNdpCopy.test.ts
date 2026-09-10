import { describe, expect, it } from "vitest";
import { getFinanceNdpCopy } from "./financeNdpCopy";

describe("finance NDP copy", () => {
  it("provides the paired settlement labels in all five interface languages", () => {
    for (const language of ["zh", "zh-Hant", "ja", "en", "ko"] as const) {
      const copy = getFinanceNdpCopy(language);

      expect(copy.todayConsumption).toBeTruthy();
      expect(copy.settleable).toBeTruthy();
      expect(copy.testExcluded).toContain("Test NDP");
      expect(copy.testPaymentChannel).toContain("Test NDP");
      expect(copy.testPaymentExcluded).toContain("Test NDP");
      expect(copy.loadFailed).toBeTruthy();
    }
  });
});
