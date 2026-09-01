import type { AuditLogCreateInput } from "../repositories/audit-log.repository";

export interface ResolvedUserGlobalPolicy {
  versionPublicId: string;
  version: number;
  status: "draft" | "published" | "archived";
  lockVersion: number;
  requirePhone: boolean;
  requireEmail: boolean;
  requireHomeServiceEkyc: boolean;
  requireStoreServiceEkyc: boolean;
  ndpPerBaseExp: number;
  baseExpUnitsPerThreshold: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  publishedAt: Date | null;
}

export interface UserGlobalPolicyDraftInput {
  expectedCurrentVersion: number;
  expectedDraftLockVersion: number | null;
  requirePhone: boolean;
  requireEmail: boolean;
  requireHomeServiceEkyc: boolean;
  requireStoreServiceEkyc: boolean;
  ndpPerBaseExp: number;
  baseExpUnitsPerThreshold: number;
  effectiveFrom: Date;
}

export type UserGlobalPolicyMutationResult =
  | { kind: "saved" | "published"; value: ResolvedUserGlobalPolicy }
  | { kind: "not_found" | "version_conflict" | "invalid_state" };

export interface UserGlobalPolicyRepositoryPort {
  resolvePolicyAt: (occurredAt: Date) => Promise<ResolvedUserGlobalPolicy | null>;
  getCurrentAndDraft: (occurredAt: Date) => Promise<{
    current: ResolvedUserGlobalPolicy | null;
    draft: ResolvedUserGlobalPolicy | null;
  }>;
  saveDraftWithAudit: (input: {
    actorId: number;
    draft: UserGlobalPolicyDraftInput;
    audit: AuditLogCreateInput;
  }) => Promise<UserGlobalPolicyMutationResult>;
  publishDraftWithAudit: (input: {
    actorId: number;
    expectedVersion: number;
    expectedLockVersion: number;
    publishedAt: Date;
    audit: AuditLogCreateInput;
  }) => Promise<UserGlobalPolicyMutationResult>;
}
