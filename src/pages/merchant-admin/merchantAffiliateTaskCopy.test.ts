import { describe, expect, it } from "vitest";
import { ApiClientError } from "../../api/httpClient";
import {
  describeMerchantAffiliateTaskError,
  getMerchantAffiliateTaskCopy,
  merchantAffiliateTaskLanguages,
  merchantAffiliateTaskStatusLabel
} from "./merchantAffiliateTaskCopy";

describe("merchant Affiliate task copy", () => {
  it("provides complete task and public-shop-ID terminology in all five languages", () => {
    for (const language of merchantAffiliateTaskLanguages) {
      const copy = getMerchantAffiliateTaskCopy(language);
      expect(copy.title.trim()).not.toBe("");
      expect(copy.taskCode.trim()).not.toBe("");
      expect(copy.shopPublicId.trim()).not.toBe("");
      expect(copy.createTask.trim()).not.toBe("");
      expect(copy.retry.trim()).not.toBe("");
      expect(merchantAffiliateTaskStatusLabel("pending_review", language).trim()).not.toBe("");
    }
  });

  it("maps formal failures to safe localized messages", () => {
    expect(describeMerchantAffiliateTaskError(new ApiClientError("expired", 40101, 401), "zh")).toContain(
      "登录"
    );
    expect(describeMerchantAffiliateTaskError(new ApiClientError("forbidden", 40301, 403), "zh")).toContain(
      "权限"
    );
    expect(
      describeMerchantAffiliateTaskError(
        new ApiClientError("error.affiliate.shop_public_id_unavailable", 40954, 409),
        "zh"
      )
    ).toContain("公开 ID");
    expect(
      describeMerchantAffiliateTaskError(new ApiClientError("internal detail", 50001, 500), "en")
    ).not.toContain("internal detail");
  });
});
