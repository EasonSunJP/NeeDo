import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../../api/httpClient";
import { setCoordinatorExpectedUserId } from "../../auth/authCredentialCoordinator";
import { persistentResourceCache } from "../../lib/persistentResourceCache";
import { walletApi } from "./api";

vi.mock("../../api/httpClient", () => ({ httpClient: { request: vi.fn() } }));

describe("walletApi", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    setCoordinatorExpectedUserId(null);
    vi.restoreAllMocks();
  });

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

  it("reads the current identity wallet without accepting an owner id", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});

    await walletApi.getMyWallet();

    expect(httpClient.request).toHaveBeenCalledWith("/wallets/me");
  });

  it("reads both current-user balances from the fixed summary endpoint", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});

    await walletApi.getMyWalletSummary();

    expect(httpClient.request).toHaveBeenCalledWith("/wallets/me/summary");
  });

  it("invalidates wallet-bearing caches only within the current account scope", async () => {
    setCoordinatorExpectedUserId(12);
    const invalidate = vi.spyOn(persistentResourceCache, "invalidate").mockResolvedValue();

    await walletApi.invalidateCurrentWalletCaches();

    expect(invalidate).toHaveBeenNthCalledWith(1, "account:12", "user-center:self:");
    expect(invalidate).toHaveBeenNthCalledWith(
      2,
      "account:12",
      "technician:wallet-summary:"
    );
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

  it("uses distinct backoffice endpoints for Test NDP credit and formal NDP review requests", async () => {
    vi.mocked(httpClient.request).mockResolvedValue({});

    await walletApi.creditTestNdp({
      targetUserId: 41,
      amountNdp: 2500,
      reason: "staging scenario",
      idempotencyKey: "test-credit-41"
    });
    await walletApi.createBackofficeTopup({
      targetUserId: 42,
      amountNdp: 5000,
      note: "partner demo balance",
      idempotencyKey: "formal-topup-42"
    });

    expect(httpClient.request).toHaveBeenNthCalledWith(1, "/backoffice/test-ndp/credits", {
      body: {
        targetUserId: 41,
        amountNdp: 2500,
        reason: "staging scenario",
        idempotencyKey: "test-credit-41"
      },
      method: "POST"
    });
    expect(httpClient.request).toHaveBeenNthCalledWith(2, "/backoffice/wallet-adjustments", {
      body: {
        targetUserId: 42,
        amountNdp: 5000,
        note: "partner demo balance",
        idempotencyKey: "formal-topup-42"
      },
      method: "POST"
    });
  });
});
