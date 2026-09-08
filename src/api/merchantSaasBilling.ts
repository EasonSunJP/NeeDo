import { httpClient } from "./httpClient";
import type {
  BillingCadence,
  BillingProfileCard,
  BillingSubjectType,
  MerchantAccountCard,
  MerchantGroupCard,
  PaymentProviderType,
  PaymentResponsibility,
  ShopCard,
  SuspensionReasonCode,
  SuspensionScope
} from "../features/merchant-saas-billing/model";
import { isMerchantGroup } from "../features/merchant-saas-billing/model";

export interface PaginatedMerchantAccounts {
  list: MerchantAccountCard[];
  total: number;
  page: number;
  page_size: number;
}

export interface BillingProfileUpdate {
  billingCadence: BillingCadence;
  monthlyFeeJpy: number;
  cadenceLocked: boolean;
  amountLocked: boolean;
  paymentProvider?: PaymentProviderType;
  version: number;
}

export interface TrialExtensionInput {
  quickMonths?: 1 | 2 | 3;
  days?: number;
  paidFrom?: string;
  reason: string;
  version: number;
}

export interface SuspensionInput {
  reasonCodes: SuspensionReasonCode[];
  note: string;
  scope: SuspensionScope;
}

export interface SuspensionResult {
  id: number;
  subjectType: BillingSubjectType;
  subjectId: number;
  scope: SuspensionScope;
  reasonCodes: SuspensionReasonCode[];
  note: string;
  startsAt: string;
  affectedShopIds: number[];
  detachedShopIds: number[];
  promotedAdminUserIds: number[];
}

export interface FreePeriod {
  id: number;
  periodType: string;
  startsAt: string;
  endsAt: string | null;
  extensionSequence: number | null;
  reason: string | null;
}

export interface PaginatedFreePeriods {
  list: FreePeriod[];
  total: number;
  page: number;
  page_size: number;
}

export interface SaasInvoiceLine {
  id: number;
  subjectType: BillingSubjectType;
  subjectId: number;
  description: string;
  monthlyFeeJpy: number;
  amountJpy: number;
  periodStartsAt: string;
  periodEndsAt: string;
}

export interface SaasInvoice {
  id: number;
  invoiceNo: string;
  payerType: BillingSubjectType;
  payerId: number;
  billingCadence: BillingCadence;
  periodStartsAt: string;
  periodEndsAt: string;
  dueAt: string;
  amountJpy: number;
  status: string;
  paymentProvider: PaymentProviderType;
  lines: SaasInvoiceLine[];
  payments: Array<{
    id: number;
    provider: PaymentProviderType;
    externalReference: string | null;
    amountJpy: number;
    receivedAt: string;
    status: string;
  }>;
}

export interface PaginatedSaasInvoices {
  list: SaasInvoice[];
  total: number;
  page: number;
  page_size: number;
}

function billingProfilePath(subjectType: BillingSubjectType, subjectId: number) {
  return subjectType === "merchant_account"
    ? `/backoffice/merchant-accounts/${subjectId}/billing-profile`
    : `/backoffice/shops/${subjectId}/billing-profile`;
}

export const merchantSaasBillingApi = {
  listAccounts(query?: { page?: number; pageSize?: number; query?: string; status?: string }) {
    return httpClient.request<PaginatedMerchantAccounts>("/backoffice/merchant-accounts", { query });
  },
  getMerchantAccount(id: number) {
    return httpClient.request<MerchantGroupCard>(`/backoffice/merchant-accounts/${id}`);
  },
  getShopAccount(id: number) {
    return httpClient.request<ShopCard>(`/backoffice/shops/${id}/saas-account`);
  },
  updateBillingProfile(subjectType: BillingSubjectType, subjectId: number, body: BillingProfileUpdate) {
    return httpClient.request<BillingProfileCard>(billingProfilePath(subjectType, subjectId), {
      body,
      method: "PATCH"
    });
  },
  updatePaymentResponsibility(merchantAccountId: number, paymentResponsibility: PaymentResponsibility, effectiveFrom?: string) {
    return httpClient.request<MerchantGroupCard>(
      `/backoffice/merchant-accounts/${merchantAccountId}/payment-responsibility`,
      {
        body: { effectiveFrom, paymentResponsibility },
        method: "PATCH"
      }
    );
  },
  extendTrial(subjectType: BillingSubjectType, subjectId: number, body: TrialExtensionInput) {
    return httpClient.request<BillingProfileCard>(
      `/backoffice/billing-subjects/${subjectType}/${subjectId}/trial/extensions`,
      { body, method: "POST" }
    );
  },
  interruptTrial(subjectType: BillingSubjectType, subjectId: number, reason: string, version: number) {
    return httpClient.request<BillingProfileCard>(
      `/backoffice/billing-subjects/${subjectType}/${subjectId}/trial/interrupt`,
      { body: { reason, version }, method: "POST" }
    );
  },
  listFreePeriods(subjectType: BillingSubjectType, subjectId: number) {
    return httpClient.request<PaginatedFreePeriods>(
      `/backoffice/billing-subjects/${subjectType}/${subjectId}/free-periods`,
      { query: { page: 1, pageSize: 100 } }
    );
  },
  listInvoices(subjectType: BillingSubjectType) {
    return httpClient.request<PaginatedSaasInvoices>("/backoffice/saas-invoices", {
      query: { page: 1, pageSize: 100, payerType: subjectType }
    });
  },
  reviewManualPayment(invoiceId: number, body: {
    amountJpy: number;
    receivedAt: string;
    reference: string;
    idempotencyKey: string;
    coverageStartsAt?: string;
    coverageEndsAt?: string;
  }) {
    return httpClient.request<SaasInvoice>(`/backoffice/saas-invoices/${invoiceId}/manual-payments`, {
      body,
      method: "POST"
    });
  },
  suspend(subjectType: BillingSubjectType, subjectId: number, body: SuspensionInput) {
    return httpClient.request<SuspensionResult>(
      `/backoffice/entities/${subjectType}/${subjectId}/suspensions`,
      { body, method: "POST" }
    );
  },
  releaseSuspension(subjectType: BillingSubjectType, subjectId: number, suspensionId: number, reason: string) {
    return httpClient.request<{ id: number; subjectType: BillingSubjectType; subjectId: number; releasedAt: string }>(
      `/backoffice/entities/${subjectType}/${subjectId}/suspensions/${suspensionId}/release`,
      { body: { reason }, method: "POST" }
    );
  },
  dissolveMerchant(id: number, strategy: "detach_shops" | "delete_eligible_shops") {
    return httpClient.request<{ deleted: boolean; blockedShopIds: number[] }>(
      `/backoffice/merchant-accounts/${id}`,
      { body: { strategy }, method: "DELETE" }
    );
  },
  dissolveShop(id: number) {
    return httpClient.request<{ deleted: boolean; activeOrderCount: number }>(`/backoffice/shops/${id}`, {
      method: "DELETE"
    });
  }
};

export function refreshMerchantAccountCard(card: MerchantAccountCard) {
  return isMerchantGroup(card)
    ? merchantSaasBillingApi.getMerchantAccount(card.id)
    : merchantSaasBillingApi.getShopAccount(card.id);
}

export type { ShopCard };
