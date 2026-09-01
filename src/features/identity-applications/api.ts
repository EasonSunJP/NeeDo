import { httpClient } from "../../api/httpClient";
import type { IdentityAvailability } from "./model";

export type ContractLanguage = "zh-CN" | "ja" | "en";
export type IdentityApplicationStatus = "draft" | "submitted" | "under_review" | "approved" | "rejected" | "withdrawn";

export type Paginated<T> = { list: T[]; total: number; page: number; page_size: number };
export type IdentityApplication = {
  id: number;
  userId: number;
  type: "technician" | "merchant";
  status: IdentityApplicationStatus;
  version: number;
  rejectionReason: string | null;
  purgeAt: string | null;
  technicianDetail: TechnicianApplicationProfile | null;
  merchantDetail: MerchantApplicationProfile | null;
};

export type TechnicianApplicationProfile = {
  targetShopId: number;
  applicantName: string;
  phone: string | null;
  city: string | null;
  serviceAreas: string[];
  skills: string[];
  yearsExperience: number | null;
  bio: string | null;
  gender: "male" | "female" | "other" | "undisclosed" | null;
  birthDate: string | null;
};

export type MerchantApplicationProfile = {
  applicantKind: "corporate" | "individual";
  corporateLegalName: string | null;
  corporateLegalNameKana: string | null;
  representativeName: string;
  representativeNameKana: string;
  shopName: string;
  businessAddress: string;
  contactPhone: string;
  responsiblePersonName: string;
  showcaseDraft: Record<string, unknown>;
  serviceCategoryIds: number[];
  businessKeywordIds: number[];
  bankAccountId: number | null;
  contractAcceptanceId: number | null;
  mediaPurposes: string[];
  bankVerificationStatus: string | null;
  eKycVerified: boolean;
};

export type EligibleShop = { id: number; merchantId: string; name: string; city: string; address: string };
export type ContractDefinition = {
  type: "merchant" | "affiliate";
  version: string;
  effectiveAt: string;
  language: ContractLanguage;
  text: string;
  contentHash: string;
};

export type ContractAcceptanceInput = {
  contractVersion: string;
  contentHash: string;
  language: ContractLanguage;
  hasRead: true;
  hasAgreed: true;
};

export type AffiliateIdentityActivationResult = {
  contractAcceptance: {
    id: number;
    contractType: "affiliate";
    contractVersion: string;
    contentHash: string;
    acceptedAt: string;
    receiptId: string;
  };
  affiliate: {
    affiliateStatus: "active" | "suspended" | "closed";
    needoId: string;
    profileId: number;
  };
};

export type TechnicianReview = {
  applicationId: number;
  applicantUserId: number;
  targetShopId: number;
  status: IdentityApplicationStatus;
  version: number;
  applicantName: string;
  phone: string | null;
  city: string | null;
  serviceAreas: string[];
  skills: string[];
  yearsExperience: number | null;
  bio: string | null;
  gender: string | null;
  birthDate: string | null;
  submittedAt?: string | null;
  media: Array<{ id: number; purpose: string; url: string; mimeType: string }>;
};

export type MerchantReview = {
  applicationId: number;
  applicantUserId: number;
  status: IdentityApplicationStatus;
  version: number;
  applicantKind: "corporate" | "individual";
  corporateLegalName: string | null;
  corporateLegalNameKana: string | null;
  representativeName: string;
  representativeNameKana: string;
  shopName: string;
  businessAddress: string;
  contactPhone: string;
  responsiblePersonName: string;
  showcaseDraft: Record<string, unknown> | null;
  serviceCategories: Array<{ id: number; code: string; label: string; qualificationPolicy: string }>;
  businessKeywords: Array<{ id: number; code: string; categoryId: number; label: string; qualificationPolicy: string }>;
  bankAccount: { bankCode: string; bankName: string; branchCode: string; branchName: string; accountType: string; accountNumberMasked: string; accountHolderMasked: string; holderMatched: boolean; verificationStatus: string; verificationSource: string } | null;
  eKycVerified: boolean;
  contractAcceptance: { contractVersion: string; contentHash: string; language: string; receiptId: string; acceptedAt: string } | null;
  media: Array<{ id: number; purpose: string; url: string; mimeType: string }>;
};

const versionBody = (expectedVersion: number) => ({ expectedVersion });

export const identityApplicationsApi = {
  listMine(query: { page?: number; pageSize?: number; type?: "technician" | "merchant"; status?: IdentityApplicationStatus } = {}) {
    return httpClient.request<Paginated<IdentityApplication>>("/identity-applications/mine", {
      query: { page: query.page ?? 1, page_size: query.pageSize ?? 20, type: query.type, status: query.status }
    });
  },
  searchShops(query: string, page = 1, pageSize = 20) {
    return httpClient.request<Paginated<EligibleShop>>("/merchants/search", { query: { query, page, page_size: pageSize } });
  },
  createTechnicianDraft(body: { targetShopId: number; applicantName: string }) {
    return httpClient.request<IdentityApplication>("/identity-applications/technician", { body, method: "POST" });
  },
  updateTechnicianProfile(id: number, body: TechnicianApplicationProfile & { expectedVersion: number }) {
    return httpClient.request<IdentityApplication>(`/identity-applications/${id}/technician-profile`, { body, method: "PATCH" });
  },
  createMerchantDraft(body: Omit<MerchantApplicationProfile, "bankAccountId" | "contractAcceptanceId" | "mediaPurposes" | "bankVerificationStatus" | "eKycVerified">) {
    return httpClient.request<IdentityApplication>("/identity-applications/merchant", { body, method: "POST" });
  },
  updateMerchantShowcase(id: number, body: Omit<MerchantApplicationProfile, "bankAccountId" | "contractAcceptanceId" | "mediaPurposes" | "bankVerificationStatus" | "eKycVerified"> & { expectedVersion: number }) {
    return httpClient.request<IdentityApplication>(`/identity-applications/${id}/merchant-showcase`, { body, method: "PATCH" });
  },
  bindMerchantBankAccount(id: number, body: BankAccountInput & { expectedVersion: number }) {
    return httpClient.request<{ applicationVersion: number; accountNumberMasked: string; holderMatched: true }>(`/identity-applications/${id}/merchant-bank-account`, { body, method: "PATCH" });
  },
  uploadMedia(id: number, purpose: string, expectedVersion: number, file: File) {
    return httpClient.request<{ id: number; applicationVersion: number }>(`/identity-applications/${id}/media`, {
      body: file,
      headers: { "Content-Type": file.type },
      method: "POST",
      query: { expected_version: expectedVersion, purpose }
    });
  },
  readMedia(id: number, mediaId: number) {
    return httpClient.requestDataUrl(`/identity-applications/${id}/media/${mediaId}`);
  },
  submit(id: number, expectedVersion: number) {
    return httpClient.request<IdentityApplication>(`/identity-applications/${id}/submit`, { body: versionBody(expectedVersion), method: "POST" });
  },
  withdraw(id: number, expectedVersion: number) {
    return httpClient.request<IdentityApplication>(`/identity-applications/${id}/withdraw`, { body: versionBody(expectedVersion), method: "POST" });
  },
  getCurrentContract(type: "merchant" | "affiliate", language: ContractLanguage) {
    return httpClient.request<ContractDefinition>(`/contracts/${type}/current`, { query: { language } });
  },
  acceptMerchantContract(id: number, body: ContractAcceptanceInput & { expectedVersion: number }) {
    return httpClient.request<{ applicationVersion: number; receiptId: string }>(`/identity-applications/${id}/merchant-contract-acceptance`, { body, method: "POST" });
  },
  activateAffiliate(body: ContractAcceptanceInput) {
    return httpClient.request<AffiliateIdentityActivationResult>("/identity-activations/affiliate", {
      body,
      method: "POST"
    });
  },
  bindAffiliateBankAccount(body: BankAccountInput) {
    return httpClient.request<{ holderMatched: boolean; accountNumberMasked: string }>("/bank-accounts/affiliate-withdrawal", { body, method: "PUT" });
  },
  getContractReceipt(receiptId: string) {
    return httpClient.request<{ receiptId: string; acceptedTextSnapshot: string; contentHash: string }>(`/contracts/acceptances/${encodeURIComponent(receiptId)}/receipt`);
  },
  listTechnicianReviews(query: { page?: number; pageSize?: number; status?: IdentityApplicationStatus } = {}) {
    return httpClient.request<Paginated<TechnicianReview>>("/merchant/technician-applications", { query: { page: query.page ?? 1, page_size: query.pageSize ?? 20, status: query.status } });
  },
  getTechnicianReview(id: number) {
    return httpClient.request<TechnicianReview>(`/merchant/technician-applications/${id}`);
  },
  approveTechnicianApplication(id: number, expectedVersion: number) {
    return httpClient.request(`/merchant/technician-applications/${id}/approve`, { body: versionBody(expectedVersion), method: "POST" });
  },
  rejectTechnicianApplication(id: number, expectedVersion: number, rejectionReason: string) {
    return httpClient.request(`/merchant/technician-applications/${id}/reject`, { body: { expectedVersion, rejectionReason }, method: "POST" });
  },
  contactTechnicianApplicant(id: number) {
    return httpClient.request<{ conversationId: number }>(`/merchant/technician-applications/${id}/contact`, { body: {}, method: "POST" });
  },
  downloadTechnicianResume(id: number) {
    return httpClient.requestDataUrl(`/merchant/technician-applications/${id}/resume.xlsx`, { headers: { Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } });
  },
  listMerchantReviews(query: { page?: number; pageSize?: number; status?: IdentityApplicationStatus } = {}) {
    return httpClient.request<Paginated<MerchantReview>>("/ops/merchant-applications", { query: { page: query.page ?? 1, page_size: query.pageSize ?? 20, status: query.status } });
  },
  getMerchantReview(id: number) {
    return httpClient.request<MerchantReview>(`/ops/merchant-applications/${id}`);
  },
  approveMerchantApplication(id: number, expectedVersion: number) {
    return httpClient.request(`/ops/merchant-applications/${id}/approve`, { body: versionBody(expectedVersion), method: "POST" });
  },
  rejectMerchantApplication(id: number, expectedVersion: number, rejectionReason: string) {
    return httpClient.request(`/ops/merchant-applications/${id}/reject`, { body: { expectedVersion, rejectionReason }, method: "POST" });
  }
};

export type BankAccountInput = {
  bankCode: string;
  bankName: string;
  branchCode: string;
  branchName: string;
  accountType: "ordinary" | "current";
  accountNumber: string;
  accountHolderName: string;
};

export type { IdentityAvailability };
