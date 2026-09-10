import type { AuditLogCreateInput } from "../repositories/audit-log.repository";
import type { PaginatedResponse, PaginationInput } from "../utils/pagination";
import type { PlatformMembershipTierCodeValue } from "./platform-membership";

export const SYSTEM_USER_GROUP_CODES = [
  "system:free",
  "system:silver",
  "system:gold",
  "system:black_diamond",
  "system:operations"
] as const;

export type SystemUserGroupCode = (typeof SYSTEM_USER_GROUP_CODES)[number];
export type BackofficeUserGroupCode = SystemUserGroupCode | `custom:${string}`;

export interface BackofficeUserGroupPayload {
  code: BackofficeUserGroupCode;
  kind: "system" | "custom";
  name: string;
  description: string | null;
  status: "active" | "archived";
  mutableName: boolean;
  memberCount: number;
}

export interface BackofficeUserGroupMemberPayload {
  id: number;
  needoId: string;
  username: string;
  avatarUrl: string | null;
  email: string;
}

export interface DerivedSystemGroupFacts {
  tierCode: PlatformMembershipTierCodeValue;
  expiresAt: Date | null;
  operationsMember: boolean;
}

const paidTierGroup: Readonly<
  Record<Exclude<PlatformMembershipTierCodeValue, "free">, SystemUserGroupCode>
> = {
  silver: "system:silver",
  gold: "system:gold",
  black_diamond: "system:black_diamond"
};

export const classifySystemUserGroups = (
  facts: DerivedSystemGroupFacts,
  occurredAt: Date
): SystemUserGroupCode[] => {
  const paidIsActive =
    facts.tierCode !== "free" &&
    (facts.expiresAt === null || facts.expiresAt.getTime() > occurredAt.getTime());
  const membershipGroup = paidIsActive
    ? paidTierGroup[facts.tierCode as Exclude<PlatformMembershipTierCodeValue, "free">]
    : "system:free";
  return facts.operationsMember ? [membershipGroup, "system:operations"] : [membershipGroup];
};

export const isSystemUserGroupCode = (code: string): code is SystemUserGroupCode =>
  (SYSTEM_USER_GROUP_CODES as readonly string[]).includes(code);

export const isCustomUserGroupCode = (code: string): code is `custom:${string}` =>
  code.startsWith("custom:") && code.length > "custom:".length;

export type BackofficeUserGroupMutationResult =
  | { kind: "created" | "updated"; value: BackofficeUserGroupPayload }
  | { kind: "archived" }
  | { kind: "not_found" | "name_conflict" | "invalid_state" };

export type BackofficeUserGroupMembersMutationResult =
  | { kind: "updated"; added: number; removed: number; unchanged: number }
  | { kind: "not_found" | "invalid_state" | "user_not_found" };

export interface BackofficeUserGroupRepositoryPort {
  countCustomGroups: () => Promise<number>;
  listCustomGroups: (
    query: PaginationInput & { offset?: number; limit?: number }
  ) => Promise<BackofficeUserGroupPayload[]>;
  countSystemGroupMembers: (groupCode: SystemUserGroupCode, occurredAt: Date) => Promise<number>;
  listSystemGroupMembers: (
    groupCode: SystemUserGroupCode,
    occurredAt: Date,
    query: PaginationInput
  ) => Promise<PaginatedResponse<BackofficeUserGroupMemberPayload>>;
  listCustomGroupMembers: (
    groupCode: `custom:${string}`,
    query: PaginationInput
  ) => Promise<PaginatedResponse<BackofficeUserGroupMemberPayload> | null>;
  createCustomGroupWithAudit: (input: {
    actorId: number;
    name: string;
    activeNameKey: string;
    description: string | null;
    audit: AuditLogCreateInput;
  }) => Promise<BackofficeUserGroupMutationResult>;
  updateCustomGroupWithAudit: (input: {
    actorId: number;
    groupCode: `custom:${string}`;
    name: string;
    activeNameKey: string;
    description: string | null;
    audit: AuditLogCreateInput;
  }) => Promise<BackofficeUserGroupMutationResult>;
  archiveCustomGroupWithAudit: (input: {
    actorId: number;
    groupCode: `custom:${string}`;
    reason: string;
    audit: AuditLogCreateInput;
  }) => Promise<BackofficeUserGroupMutationResult>;
  setCustomGroupMembersWithAudit: (input: {
    actorId: number;
    groupCode: `custom:${string}`;
    userIds: string[];
    reason: string;
    audit: AuditLogCreateInput;
  }) => Promise<BackofficeUserGroupMembersMutationResult>;
}
