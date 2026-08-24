import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../../api/httpClient";
import { walletApi } from "./api";

vi.mock("../../api/httpClient", () => ({ httpClient: { request: vi.fn() } }));

describe("walletApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("submits and lists identity-scoped wallet requests", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});

    await walletApi.createAdjustment({
      type: "topup",
      amountNdp: 5000,
      idempotencyKey: "topup-ui-001",
      bankReference: "BANK-001"
    });
    await walletApi.listMyAdjustments({ page: 1, pageSize: 20 });

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/wallet-adjustments", {
      body: {
        type: "topup",
        amountNdp: 5000,
        idempotencyKey: "topup-ui-001",
        bankReference: "BANK-001"
      },
      method: "POST"
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/wallet-adjustments/me", {
      query: { page: 1, pageSize: 20 }
    });
  });

  it("lists and reviews requests through the backoffice API", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});

    await walletApi.listBackofficeAdjustments({ status: "pending", type: "withdrawal" });
    await walletApi.reviewAdjustment(41, { action: "approve", note: "资料及到账确认" });

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/backoffice/wallet-adjustments", {
      query: { status: "pending", type: "withdrawal" }
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(
      2,
      "/backoffice/wallet-adjustments/41/review",
      { body: { action: "approve", note: "资料及到账确认" }, method: "POST" }
    );
  });
});
