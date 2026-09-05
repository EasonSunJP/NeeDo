import { describe, expect, it } from "vitest";
import { createDefaultTierBenefits } from "./MembershipTierEditor";

describe("membership tier benefit defaults", () => {
  it("keeps traceless recall off for free members", () => {
    expect(createDefaultTierBenefits("free").find((benefit) => benefit.code === "traceless_recall"))
      .toMatchObject({ isEnabled: false, configuration: {} });
  });

  it.each(["silver", "gold", "black_diamond"] as const)(
    "enables traceless recall for %s members",
    (tierCode) => {
      expect(createDefaultTierBenefits(tierCode).find((benefit) => benefit.code === "traceless_recall"))
        .toMatchObject({ isEnabled: true, configuration: {} });
    }
  );
});
