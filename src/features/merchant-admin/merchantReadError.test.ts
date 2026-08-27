import { describe, expect, it } from "vitest";
import { ApiClientError } from "../../api/httpClient";
import { describeMerchantReadError } from "./merchantReadError";

describe("describeMerchantReadError", () => {
  it.each([
    [
      new ApiClientError("error.auth.unauthorized", 401, 401),
      "Your session has expired. Sign in again"
    ],
    [
      new ApiClientError("error.forbidden", 403, 403),
      "The current identity cannot view this shop's operating data"
    ],
    [
      new ApiClientError("error.network.timeout", 408, 408),
      "The network request timed out. Try again later."
    ],
    [
      new ApiClientError("error.internal", 500, 500),
      "The shop data service is temporarily unavailable. Try again later"
    ]
  ])("maps a formal API error without exposing its raw key", (error, expected) => {
    expect(describeMerchantReadError(error, "en")).toBe(expected);
  });

  it("maps an unreachable browser network to the localized generic recovery message", () => {
    expect(describeMerchantReadError(new TypeError("Failed to fetch"), "ja")).toBe(
      "店舗経営データの読み込みに失敗しました。ネットワークを確認してもう一度お試しください"
    );
  });

  it("recognizes a timeout error key even when it is not wrapped", () => {
    expect(describeMerchantReadError(new Error("error.network.timeout"), "zh")).toBe(
      "网络响应超时，请稍后重试。"
    );
  });
});
