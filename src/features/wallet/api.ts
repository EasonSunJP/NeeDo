import { httpClient } from "../../api/httpClient";

export type WalletOwnerType = "user" | "shop" | "platform";
export type WalletAdjustmentType = "topup" | "withdrawal";
export type WalletAdjustmentStatus = "pending" | "approved" | "rejected";

export type Wallet = {
  id: number;
  ownerType: WalletOwnerType;
  ownerId: number;
  currency: "NDP" | "TEST_NDP";
  availableBalance: number;
  frozenBalance: number;
  createdAt: string;
  updatedAt: string;
};

export type WalletSummary = {
  activeCurrency: "NDP" | "TEST_NDP";
  ndp: { available: number; frozen: number };
  testNdp: { available: number; frozen: number };
};

export type WalletAdjustmentRequest = {
  id: number;
  type: WalletAdjustmentType;
  status: WalletAdjustmentStatus;
  ownerType: WalletOwnerType;
  ownerId: number;
  walletId: number;
  amountNdp: number;
  idempotencyKey: string;
  bankReference: string | null;
  note: string | null;
  requestedById: number;
  reviewedById: number | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  ledgerTransactionId: number | null;
  createdAt: string;
  updatedAt: string;
};

export type WalletAdjustmentPage = {
  list: WalletAdjustmentRequest[];
  total: number;
  page: number;
  page_size: number;
};

export type CreateWalletAdjustmentInput = {
  type: WalletAdjustmentType;
  amountNdp: number;
  idempotencyKey: string;
  bankReference?: string | null;
  note?: string | null;
};

export type WalletAdjustmentListQuery = {
  page?: number;
  pageSize?: number;
  ownerType?: WalletOwnerType;
  ownerId?: number;
  type?: WalletAdjustmentType;
  status?: WalletAdjustmentStatus;
};

export const walletApi = {
  getMyWallet() {
    return httpClient.request<Wallet>("/wallets/me");
  },
  getMyWalletSummary() {
    return httpClient.request<WalletSummary>("/wallets/me/summary");
  },
  createAdjustment(input: CreateWalletAdjustmentInput) {
    return httpClient.request<WalletAdjustmentRequest>("/wallet-adjustments", {
      body: input,
      method: "POST"
    });
  },
  listMyAdjustments(query: Pick<WalletAdjustmentListQuery, "page" | "pageSize"> = {}) {
    return httpClient.request<WalletAdjustmentPage>("/wallet-adjustments/me", { query });
  },
  listBackofficeAdjustments(query: WalletAdjustmentListQuery = {}) {
    return httpClient.request<WalletAdjustmentPage>("/backoffice/wallet-adjustments", { query });
  },
  reviewAdjustment(id: number, input: { action: "approve" | "reject"; note: string }) {
    return httpClient.request<WalletAdjustmentRequest>(
      `/backoffice/wallet-adjustments/${id}/review`,
      { body: input, method: "POST" }
    );
  }
};
