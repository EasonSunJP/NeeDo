import { hash } from "bcryptjs";
import { ERROR_CODES } from "../constants/error-codes";
import type {
  UserRecord,
  UserRepositoryPort,
  UserRoleAssignmentData
} from "../repositories/user.repository";
import { AppError } from "../utils/app-error";
import type { PaginatedResponse } from "../utils/pagination";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";

const BCRYPT_ROUNDS = 12;
const ADMIN_ROLE_CODE = "admin";

export interface UserIdentityPayload {
  id: number;
  type: string;
  scopeType: string | null;
  scopeId: number | null;
  displayName: string | null;
  isDefault: boolean;
  isActive: boolean;
}

export interface UserRolePayload {
  id: number;
  roleId: number;
  code: string;
  name: string;
  scopeType: string | null;
  scopeId: number | null;
}

export interface UserPayload {
  id: number;
  email: string;
  phone: string | null;
  username: string;
  avatarUrl: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  identities: UserIdentityPayload[];
  roleAssignments: UserRolePayload[];
  roles: string[];
}

export interface UserListInput {
  page?: number;
  pageSize?: number;
  keyword?: string;
  isActive?: boolean;
}

export interface UserCreateInput {
  email: string;
  phone?: string | null;
  username: string;
  avatarUrl?: string | null;
  password: string;
  isActive?: boolean;
}

export interface UserUpdateInput {
  email?: string;
  phone?: string | null;
  username?: string;
  avatarUrl?: string | null;
}

export interface UserRoleAssignmentInput {
  roleId: number;
  scopeType?: string | null;
  scopeId?: number | null;
}

export class UserService {
  public constructor(
    private readonly repository: UserRepositoryPort,
    private readonly auditLogService: AuditLogService
  ) {}

  public async list(input: UserListInput): Promise<PaginatedResponse<UserPayload>> {
    const page = await this.repository.list(input);

    return {
      ...page,
      list: page.list.map((user) => this.serializeUser(user))
    };
  }

  public async get(id: number): Promise<UserPayload> {
    return this.serializeUser(await this.requireUser(id));
  }

  public async create(
    input: UserCreateInput,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<UserPayload> {
    await this.assertEmailAvailable(input.email);
    if (input.phone) {
      await this.assertPhoneAvailable(input.phone);
    }

    const user = await this.repository.create({
      email: input.email,
      phone: input.phone ?? null,
      passwordHash: await hash(input.password, BCRYPT_ROUNDS),
      username: input.username,
      avatarUrl: input.avatarUrl ?? null,
      isActive: input.isActive ?? true
    });
    await this.auditLogService.record({
      actor,
      action: "user.create",
      targetType: "User",
      targetId: user.id,
      context,
      metadata: { email: user.email }
    });

    return this.serializeUser(user);
  }

  public async update(
    id: number,
    input: UserUpdateInput,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<UserPayload> {
    const existing = await this.requireUser(id);
    if (input.email && input.email !== existing.email) {
      await this.assertEmailAvailable(input.email);
    }
    if (input.phone && input.phone !== existing.phone) {
      await this.assertPhoneAvailable(input.phone);
    }

    const user = await this.repository.update(id, input);
    if (!user) {
      throw this.notFoundError();
    }

    await this.auditLogService.record({
      actor,
      action: "user.update",
      targetType: "User",
      targetId: id,
      context,
      metadata: { changedFields: Object.keys(input) }
    });

    return this.serializeUser(user);
  }

  public async setActive(
    id: number,
    isActive: boolean,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<UserPayload> {
    await this.assertCanMutateStatus(id, isActive, actor);
    const user = await this.repository.setActive(id, isActive);
    if (!user) {
      throw this.notFoundError();
    }

    await this.auditLogService.record({
      actor,
      action: isActive ? "user.enable" : "user.disable",
      targetType: "User",
      targetId: id,
      context,
      metadata: { isActive }
    });

    return this.serializeUser(user);
  }

  public async softDelete(
    id: number,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<Record<string, never>> {
    const existing = await this.requireUser(id);
    this.assertNotSelf(id, actor);
    if (this.hasAdminRole(existing)) {
      throw this.systemProtectedError();
    }

    const user = await this.repository.softDelete(id);
    if (!user) {
      throw this.notFoundError();
    }

    await this.auditLogService.record({
      actor,
      action: "user.delete",
      targetType: "User",
      targetId: id,
      context,
      metadata: { email: existing.email }
    });

    return {};
  }

  public async assignRoles(
    id: number,
    roles: UserRoleAssignmentInput[],
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<UserPayload> {
    const existing = await this.requireUser(id);
    const roleAssignments = this.normalizeRoleAssignments(roles);
    const uniqueRoleIds = Array.from(new Set(roleAssignments.map((role) => role.roleId)));
    const activeRoles = await this.repository.findRolesByIds(uniqueRoleIds);

    if (activeRoles.length !== uniqueRoleIds.length) {
      throw new AppError({
        code: ERROR_CODES.ROLE_NOT_FOUND,
        message: "error.role.not_found",
        statusCode: 404
      });
    }

    if (
      id === actor.userId &&
      this.hasAdminRole(existing) &&
      !activeRoles.some((role) => role.code === ADMIN_ROLE_CODE)
    ) {
      throw this.selfMutationError();
    }

    const user = await this.repository.assignRoles(id, roleAssignments);
    if (!user) {
      throw this.notFoundError();
    }

    await this.auditLogService.record({
      actor,
      action: "user.assign_role",
      targetType: "User",
      targetId: id,
      context,
      metadata: { roles: roleAssignments }
    });

    return this.serializeUser(user);
  }

  private async assertCanMutateStatus(
    id: number,
    isActive: boolean,
    actor: AuthenticatedAccessContext
  ): Promise<void> {
    await this.requireUser(id);
    if (!isActive) {
      this.assertNotSelf(id, actor);
    }
  }

  private normalizeRoleAssignments(roles: UserRoleAssignmentInput[]): UserRoleAssignmentData[] {
    const seen = new Set<string>();
    const normalized: UserRoleAssignmentData[] = [];

    for (const role of roles) {
      const assignment = {
        roleId: role.roleId,
        scopeType: role.scopeType ?? null,
        scopeId: role.scopeId ?? null
      };
      const key = `${assignment.roleId}:${assignment.scopeType ?? ""}:${assignment.scopeId ?? ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        normalized.push(assignment);
      }
    }

    return normalized;
  }

  private async requireUser(id: number): Promise<UserRecord> {
    const user = await this.repository.findById(id);

    if (!user) {
      throw this.notFoundError();
    }

    return user;
  }

  private async assertEmailAvailable(email: string): Promise<void> {
    const existing = await this.repository.findByEmail(email);

    if (existing) {
      throw new AppError({
        code: ERROR_CODES.EMAIL_ALREADY_EXISTS,
        message: "error.user.email_exists",
        statusCode: 409
      });
    }
  }

  private async assertPhoneAvailable(phone: string): Promise<void> {
    const existing = await this.repository.findByPhone(phone);

    if (existing) {
      throw new AppError({
        code: ERROR_CODES.PHONE_ALREADY_EXISTS,
        message: "error.user.phone_exists",
        statusCode: 409
      });
    }
  }

  private assertNotSelf(id: number, actor: AuthenticatedAccessContext): void {
    if (id === actor.userId) {
      throw this.selfMutationError();
    }
  }

  private hasAdminRole(user: UserRecord): boolean {
    return user.userRoles.some(
      (userRole) =>
        userRole.deletedAt === null &&
        userRole.role.deletedAt === null &&
        userRole.role.code === ADMIN_ROLE_CODE
    );
  }

  private notFoundError(): AppError {
    return new AppError({
      code: ERROR_CODES.USER_NOT_FOUND,
      message: "error.user.not_found",
      statusCode: 404
    });
  }

  private selfMutationError(): AppError {
    return new AppError({
      code: ERROR_CODES.CANNOT_MODIFY_SELF,
      message: "error.user.cannot_modify_self",
      statusCode: 403
    });
  }

  private systemProtectedError(): AppError {
    return new AppError({
      code: ERROR_CODES.CANNOT_DELETE_SYSTEM,
      message: "error.system_record_protected",
      statusCode: 403
    });
  }

  private serializeUser(user: UserRecord): UserPayload {
    const roleAssignments = user.userRoles
      .filter((userRole) => userRole.deletedAt === null && userRole.role.deletedAt === null)
      .map((userRole) => ({
        id: userRole.id,
        roleId: userRole.roleId,
        code: userRole.role.code,
        name: userRole.role.name,
        scopeType: userRole.scopeType,
        scopeId: userRole.scopeId
      }));

    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      username: user.username,
      avatarUrl: user.avatarUrl,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      deletedAt: user.deletedAt,
      identities: user.identities
        .filter((identity) => identity.deletedAt === null)
        .map((identity) => ({
          id: identity.id,
          type: identity.type,
          scopeType: identity.scopeType,
          scopeId: identity.scopeId,
          displayName: identity.displayName,
          isDefault: identity.isDefault,
          isActive: identity.isActive
        })),
      roleAssignments,
      roles: roleAssignments.map((role) => role.code)
    };
  }
}
