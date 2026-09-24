import { describe, expect, it } from "vitest";
import { translateText } from "../../i18n/translations";
import { formatCustomerMembershipLevel, resolveCustomerMembership } from "./customerMembership";
import { platformMembershipTierText } from "./platformMembershipTierText";

describe("customer membership labels", () => {
  it("maps supported membership kinds to the product tiers", () => {
    expect(resolveCustomerMembership("FREE")).toEqual({ label: "免费会员" });
    expect(resolveCustomerMembership("Gold")).toEqual({ label: "黄金会员", kind: "gold" });
    expect(resolveCustomerMembership("Silver")).toEqual({ label: "白银会员", kind: "gold" });
    expect(resolveCustomerMembership("Platinum")).toEqual({ label: "钻石会员", kind: "diamond" });
    expect(resolveCustomerMembership("Black Diamond")).toEqual({ label: "黑钻会员", kind: "black" });
  });

  it("keeps the membership kind and customer level together", () => {
    expect(formatCustomerMembershipLevel("钻石会员", "Lv.72")).toBe("钻石会员 · Lv.72");
  });

  it("keeps all formal tier labels complete in all five UI languages", () => {
    expect(platformMembershipTierText("silver", "zh")).toBe("白银会员");
    expect(platformMembershipTierText("silver", "zh-Hant")).toBe("白銀會員");
    expect(platformMembershipTierText("silver", "ja")).toBe("シルバー会員");
    expect(platformMembershipTierText("silver", "en")).toBe("Silver membership");
    expect(platformMembershipTierText("silver", "ko")).toBe("실버 회원");
    expect(platformMembershipTierText("black_diamond", "ja")).toBe("ブラックダイヤ会員");
    expect(translateText("黑钻", "ja")).toBe("ブラックダイヤ");
    expect(translateText("黑钻会员", "ja")).toBe("ブラックダイヤ会員");
  });
});
