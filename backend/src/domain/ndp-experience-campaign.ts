import type { AuditLogCreateInput } from "../repositories/audit-log.repository";
import type { PaginatedResponse, PaginationInput } from "../utils/pagination";

export interface NdpExperienceCampaignPayload {
  versionPublicId: string;
  version: number;
  status: "draft" | "published" | "archived";
  name: string;
  description: string | null;
  factorBps: number;
  effectiveFrom: Date;
  effectiveTo: Date;
  publishedAt: Date | null;
  lockVersion: number;
}

export interface NdpExperienceCampaignDraftInput {
  expectedPublishedVersion: number;
  expectedDraftLockVersion: number | null;
  name: string;
  description: string | null;
  factorBps: number;
  effectiveFrom: Date;
  effectiveTo: Date;
}

export type NdpExperienceCampaignMutationResult =
  | { kind: "saved" | "published" | "archived"; value: NdpExperienceCampaignPayload }
  | { kind: "not_found" | "version_conflict" | "invalid_state" | "overlap" };

export interface NdpExperienceCampaignRepositoryPort {
  resolveCampaignAt: (occurredAt: Date) => Promise<NdpExperienceCampaignPayload | null>;
  listCampaigns: (
    query: PaginationInput
  ) => Promise<PaginatedResponse<NdpExperienceCampaignPayload>>;
  saveDraftWithAudit: (input: {
    actorId: number;
    draft: NdpExperienceCampaignDraftInput;
    audit: AuditLogCreateInput;
  }) => Promise<NdpExperienceCampaignMutationResult>;
  publishDraftWithAudit: (input: {
    actorId: number;
    versionPublicId: string;
    expectedVersion: number;
    expectedLockVersion: number;
    publishedAt: Date;
    audit: AuditLogCreateInput;
  }) => Promise<NdpExperienceCampaignMutationResult>;
  archiveCampaignWithAudit: (input: {
    actorId: number;
    versionPublicId: string;
    expectedVersion: number;
    expectedLockVersion: number;
    reason: string;
    archivedAt: Date;
    audit: AuditLogCreateInput;
  }) => Promise<NdpExperienceCampaignMutationResult>;
}
