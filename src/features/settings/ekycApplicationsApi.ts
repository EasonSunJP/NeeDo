import { httpClient } from "../../api/httpClient";
import type { Paginated } from "../identity-applications/api";
import type { EkycProfile } from "./ekycProfileModel";
export type EkycApplicationStatus = "submitted" | "approved" | "rejected" | "withdrawn";
export type EkycApplicationSummary = {
  id: number; userId: number; status: EkycApplicationStatus; version: number;
  createdAt: string; updatedAt: string; reviewedAt: string | null;
  reviewNote: string | null; rejectionReason: string | null;
};
export type EkycApplicationDetail = EkycApplicationSummary & { profile: EkycProfile };
export const ekycApplicationsApi = {
  listMine: () => httpClient.request<Paginated<EkycApplicationSummary>>("/ekyc-applications/mine", { query: { page: 1, page_size: 20 } }),
  getMine: (id: number) => httpClient.request<EkycApplicationDetail>(`/ekyc-applications/${id}`),
  submit: (profile: EkycProfile) => httpClient.request<EkycApplicationDetail>("/ekyc-applications", { method: "POST", body: { profile } }),
  withdraw: (id: number, expectedVersion: number) => httpClient.request<EkycApplicationDetail>(`/ekyc-applications/${id}/withdraw`, { method: "POST", body: { expectedVersion } }),
  listReviews: (page = 1, status?: EkycApplicationStatus) => httpClient.request<Paginated<EkycApplicationSummary>>("/ops/ekyc-applications", { query: { page, page_size: 20, status } }),
  getReview: (id: number) => httpClient.request<EkycApplicationDetail>(`/ops/ekyc-applications/${id}`),
  approve: (id: number, expectedVersion: number, reviewNote: string) => httpClient.request<EkycApplicationDetail>(`/ops/ekyc-applications/${id}/approve`, { method: "POST", body: { expectedVersion, reviewNote, identityConfirmed: true } }),
  reject: (id: number, expectedVersion: number, rejectionReason: string) => httpClient.request<EkycApplicationDetail>(`/ops/ekyc-applications/${id}/reject`, { method: "POST", body: { expectedVersion, rejectionReason } })
};
