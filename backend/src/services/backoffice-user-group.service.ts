import { ERROR_CODES } from "../constants/error-codes";
import {
  SYSTEM_USER_GROUP_CODES,
  isCustomUserGroupCode,
  isSystemUserGroupCode,
  type BackofficeUserGroupMembersMutationResult,
  type BackofficeUserGroupMutationResult,
  type BackofficeUserGroupPayload,
  type BackofficeUserGroupRepositoryPort
} from "../domain/backoffice-user-group";
import { AppError } from "../utils/app-error";
import { normalizePagination, type PaginatedResponse, type PaginationInput } from "../utils/pagination";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";

type AuditInputFactory = Pick<AuditLogService, "createInput">;

const systemGroups: ReadonlyArray<Omit<BackofficeUserGroupPayload, "memberCount">> = [
  {
    code: "system:free",
    kind: "system",
    name: "免费用户",
    description: null,
    status: "active",
    mutableName: false
  },
  {
    code: "system:silver",
    kind: "system",
    name: "白银会员",
    description: null,
    status: "active",
    mutableName: false
  },
  {
    code: "system:gold",
    kind: "system",
    name: "黄金会员",
    description: null,
    status: "active",
    mutableName: false
  },
  {
    code: "system:black_diamond",
    kind: "system",
    name: "黑钻会员",
    description: null,
    status: "active",
    mutableName: false
  },
  {
    code: "system:operations",
    kind: "system",
    name: "运营成员",
    description: null,
    status: "active",
    mutableName: false
  }
];

export class BackofficeUserGroupService {
  public constructor(
    private readonly repository: BackofficeUserGroupRepositoryPort,
    private readonly auditInputFactory?: AuditInputFactory,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async listGroups(
    actor: AuthenticatedAccessContext,
    query: PaginationInput
  ): Promise<PaginatedResponse<BackofficeUserGroupPayload>> {
    this.assertOperationsIdentity(actor);
    const pagination = normalizePagination(query);
    const occurredAt = this.now();
    const [customCount, ...systemCounts] = await Promise.all([
      this.repository.countCustomGroups(),
      ...SYSTEM_USER_GROUP_CODES.map((code) =>
        this.repository.countSystemGroupMembers(code, occurredAt)
      )
    ]);
    const systemRows = systemGroups.map((group, index) => ({
      ...group,
      memberCount: systemCounts[index] ?? 0
    }));
    const start = (pagination.page - 1) * pagination.pageSize;
    const end = start + pagination.pageSize;
    const visibleSystem = systemRows.slice(start, Math.min(end, systemRows.length));
    const customOffset = Math.max(0, start - systemRows.length);
    const customLimit = Math.max(0, pagination.pageSize - visibleSystem.length);
    const customRows =
      customLimit > 0 && customOffset < customCount
        ? await this.repository.listCustomGroups({
            page: 1,
            pageSize: customLimit,
            offset: customOffset,
            limit: customLimit
          })
        : [];
    return {
      list: [...visibleSystem, ...customRows],
      total: systemRows.length + customCount,
      page: pagination.page,
      page_size: pagination.pageSize
    };
  }

  public async listGroupMembers(
    actor: AuthenticatedAccessContext,
    groupCode: string,
    query: PaginationInput
  ) {
    this.assertOperationsIdentity(actor);
    if (isSystemUserGroupCode(groupCode)) {
      return this.repository.listSystemGroupMembers(groupCode, this.now(), query);
    }
    if (!isCustomUserGroupCode(groupCode)) throw this.validationError();
    const result = await this.repository.listCustomGroupMembers(groupCode, query);
    if (result) return result;
    throw this.notFound();
  }

  public async createCustomGroup(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    input: { name: string; description?: string | null }
  ): Promise<BackofficeUserGroupPayload> {
    this.assertOperationsIdentity(actor);
    const normalized = this.normalizeGroup(input.name, input.description);
    return this.unwrapGroupMutation(
      await this.repository.createCustomGroupWithAudit({
        actorId: actor.userId,
        ...normalized,
        audit: this.requireAuditFactory().createInput({
          actor,
          context,
          action: "backoffice.user_group.create",
          targetType: "BackofficeUserGroup",
          metadata: { name: normalized.name }
        })
      })
    );
  }

  public async updateCustomGroup(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    groupCode: string,
    input: { name: string; description?: string | null }
  ): Promise<BackofficeUserGroupPayload> {
    this.assertOperationsIdentity(actor);
    const customCode = this.requireCustomCode(groupCode);
    const normalized = this.normalizeGroup(input.name, input.description);
    return this.unwrapGroupMutation(
      await this.repository.updateCustomGroupWithAudit({
        actorId: actor.userId,
        groupCode: customCode,
        ...normalized,
        audit: this.requireAuditFactory().createInput({
          actor,
          context,
          action: "backoffice.user_group.update",
          targetType: "BackofficeUserGroup",
          metadata: { groupCode: customCode, name: normalized.name }
        })
      })
    );
  }

  public async archiveCustomGroup(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    groupCode: string,
    input: { reason: string }
  ): Promise<{ archived: true }> {
    this.assertOperationsIdentity(actor);
    const customCode = this.requireCustomCode(groupCode);
    const reason = this.normalizeReason(input.reason);
    const result = await this.repository.archiveCustomGroupWithAudit({
      actorId: actor.userId,
      groupCode: customCode,
      reason,
      audit: this.requireAuditFactory().createInput({
        actor,
        context,
        action: "backoffice.user_group.archive",
        targetType: "BackofficeUserGroup",
        metadata: { groupCode: customCode, reason }
      })
    });
    this.assertArchived(result);
    return { archived: true };
  }

  public async setCustomGroupMembers(
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext,
    groupCode: string,
    input: { userIds: string[]; reason: string }
  ): Promise<Extract<BackofficeUserGroupMembersMutationResult, { kind: "updated" }>> {
    this.assertOperationsIdentity(actor);
    const customCode = this.requireCustomCode(groupCode);
    const reason = this.normalizeReason(input.reason);
    const userIds = [...new Set(input.userIds.map((id) => id.trim()).filter(Boolean))].sort();
    if (userIds.length > 500 || userIds.some((id) => id.length > 32)) {
      throw this.validationError();
    }
    const result = await this.repository.setCustomGroupMembersWithAudit({
      actorId: actor.userId,
      groupCode: customCode,
      userIds,
      reason,
      audit: this.requireAuditFactory().createInput({
        actor,
        context,
        action: "backoffice.user_group.members.replace",
        targetType: "BackofficeUserGroup",
        metadata: { groupCode: customCode, reason, memberCount: userIds.length }
      })
    });
    if (result.kind === "updated") return result;
    if (result.kind === "not_found") throw this.notFound();
    if (result.kind === "user_not_found") {
      throw new AppError({
        code: ERROR_CODES.NOT_FOUND,
        message: "error.backoffice_user_group.user_not_found",
        statusCode: 404
      });
    }
    throw this.invalidState();
  }

  private normalizeGroup(nameInput: string, descriptionInput?: string | null) {
    const name = nameInput.normalize("NFKC").trim().replace(/\s+/g, " ");
    const description = descriptionInput?.trim() || null;
    if (!name || name.length > 100 || (description?.length ?? 0) > 500) {
      throw this.validationError();
    }
    return { name, activeNameKey: name.toLocaleLowerCase("ja-JP"), description };
  }

  private normalizeReason(reasonInput: string): string {
    const reason = reasonInput.trim();
    if (!reason || reason.length > 500) throw this.validationError();
    return reason;
  }

  private requireCustomCode(groupCode: string): `custom:${string}` {
    if (isSystemUserGroupCode(groupCode)) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.backoffice_user_group.system_group_immutable",
        statusCode: 422
      });
    }
    if (isCustomUserGroupCode(groupCode)) return groupCode;
    throw this.validationError();
  }

  private unwrapGroupMutation(result: BackofficeUserGroupMutationResult): BackofficeUserGroupPayload {
    if ("value" in result) return result.value;
    if (result.kind === "not_found") throw this.notFound();
    if (result.kind === "name_conflict") {
      throw new AppError({
        code: ERROR_CODES.BACKOFFICE_USER_GROUP_CONFLICT,
        message: "error.backoffice_user_group.name_conflict",
        statusCode: 409
      });
    }
    throw this.invalidState();
  }

  private assertArchived(result: BackofficeUserGroupMutationResult): void {
    if (result.kind === "archived") return;
    if (result.kind === "not_found") throw this.notFound();
    throw this.invalidState();
  }

  private assertOperationsIdentity(actor: AuthenticatedAccessContext): void {
    if (actor.currentIdentityScopeType === "global" || actor.currentIdentityScopeType === "platform") {
      return;
    }
    throw new AppError({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      message: "error.identity.forbidden",
      statusCode: 403
    });
  }

  private requireAuditFactory(): AuditInputFactory {
    if (this.auditInputFactory) return this.auditInputFactory;
    throw new AppError({
      code: ERROR_CODES.INTERNAL,
      message: "error.backoffice_user_group.audit_unavailable",
      statusCode: 500
    });
  }

  private validationError(): AppError {
    return new AppError({
      code: ERROR_CODES.VALIDATION,
      message: "error.validation",
      statusCode: 400
    });
  }

  private notFound(): AppError {
    return new AppError({
      code: ERROR_CODES.NOT_FOUND,
      message: "error.backoffice_user_group.not_found",
      statusCode: 404
    });
  }

  private invalidState(): AppError {
    return new AppError({
      code: ERROR_CODES.BACKOFFICE_USER_GROUP_CONFLICT,
      message: "error.backoffice_user_group.invalid_state",
      statusCode: 409
    });
  }
}
