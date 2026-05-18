import { describe, expect, it } from "vitest";
import { formatCustomerMembershipLevel, resolveCustomerMembership } from "./customerMembership";

describe("customer membership labels", () => {
  it("maps supported membership kinds to the product tiers", () => {
    expect(resolveCustomerMembership("Gold")).toEqual({ label: "黄金会员", kind: "gold" });
    expect(resolveCustomerMembership("Silver")).toEqual({ label: "黄金会员", kind: "gold" });
    expect(resolveCustomerMembership("Platinum")).toEqual({ label: "钻石会员", kind: "diamond" });
    expect(resolveCustomerMembership("Black Diamond")).toEqual({ label: "黑卡会员", kind: "black" });
  });

  it("keeps the membership kind and customer level together", () => {
    expect(formatCustomerMembershipLevel("钻石会员", "Lv.72")).toBe("钻石会员 · Lv.72");
  });
});
