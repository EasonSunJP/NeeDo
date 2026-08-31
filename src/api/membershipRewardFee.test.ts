import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "./httpClient";
import { membershipRewardFeeApi } from "./membershipRewardFee";

vi.mock("./httpClient", () => ({ httpClient: { request: vi.fn() } }));

describe("membership reward fee API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the formal overview and immutable version routes", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});
    const body = { feeRateBps: 1200, expectedVersion: 1, effectiveFrom: "2099-01-01T00:00:00.000Z", reason: "rate update" };
    await membershipRewardFeeApi.getOverview({ page: 2, pageSize: 20 });
    await membershipRewardFeeApi.createVersion(body);
    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/backoffice/membership-reward-fee-policy", { query: { page: 2, pageSize: 20 } });
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/backoffice/membership-reward-fee-policy/versions", { method: "POST", body });
  });
});
