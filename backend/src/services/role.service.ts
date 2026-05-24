import { ERROR_CODES } from "../constants/error-codes";
import type { RoleRecord, RoleRepositoryPort } from "../repositories/role.repository";
import { AppError } from "../utils/app-error";
import type { PaginatedResponse } from "../utils/pagination";
import type { AuditLogService } from "./audit-log.service";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import type { PermissionPayload } from "./permission.service";

export interface RolePayload {
  id: number;
  name: string;
  code: string;
  description: string | null;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  permissions: PermissionPayload[];
}

export interface RoleListInput {
  page?: number;
  pageSize?: number;
  keyword?: string;
}

export interface RoleCreateInput {
  name: string;
  code: string;
  description?: string | null;
}

export interface RoleUpdateInput {
  name?: string;
  code?: string;
  description?: string | null;
}

export class RoleService {
  public constructor(
    private readonly repository: RoleRepositoryPort,
    private readonly auditLogService: AuditLogService
  ) {}

  public async list(input: RoleListInput): Promise<PaginatedResponse<RolePayload>> {
    const page = await this.repository.list(input);

    return {
      ...page,
      list: page.list.map((role) => this.serializeRole(role))
    };
  }

  public async get(id: number): Promise<RolePayload> {
    return this.serializeRole(await this.requireRole(id));
  }

  public async create(
    input: RoleCreateInput,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<RolePayload> {
    await this.assertCodeAvailable(input.code);
    const role = await this.repository.create({ ...input, isSystem: false });
    await this.auditLogService.record({
      actor,
      action: "role.create",
      targetType: "Role",
      targetId: role.id,
      context,
      metadata: { code: role.code }
    });

    return this.serializeRole(role);
  }

  public async update(
    id: number,
    input: RoleUpdateInput,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<RolePayload> {
    const existing = await this.requireRole(id);
    if (existing.isSystem && input.code && input.code !== existing.code) {
      throw this.systemProtectedError();
    }
    if (input.code && input.code !== existing.code) {
      await this.assertCodeAvailable(input.code);
    }

    const role = await this.repository.update(id, input);
    if (!role) {
      throw this.notFoundError();
    }

    await this.auditLogService.record({
      actor,
      action: "role.update",
      targetType: "Role",
      targetId: id,
      context,
      metadata: { changedFields: Object.keys(input) }
    });

    return this.serializeRole(role);
  }

  public async softDelete(
    id: number,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<Record<string, never>> {
    const existing = await this.requireRole(id);
    if (existing.isSystem) {
      throw this.systemProtectedError();
    }

    const role = await this.repository.softDelete(id);
    if (!role) {
      throw this.notFoundError();
    }

    await this.auditLogService.record({
      actor,
      action: "role.delete",
      targetType: "Role",
      targetId: id,
      context,
      metadata: { code: existing.code }
    });

    return {};
  }

  public async assignPermissions(
    id: number,
    permissionIds: number[],
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<RolePayload> {
    const existing = await this.requireRole(id);
    if (existing.isSystem) {
      throw this.systemProtectedError();
    }

    const uniquePermissionIds = Array.from(new Set(permissionIds));
    const permissions = await this.repository.findPermissionsByIds(uniquePermissionIds);
    if (permissions.length !== uniquePermissionIds.length) {
      throw new AppError({
        code: ERROR_CODES.PERMISSION_NOT_FOUND,
        message: "error.permission.not_found",
        statusCode: 404
      });
    }

    const role = await this.repository.assignPermissions(id, uniquePermissionIds);
    if (!role) {
      throw this.notFoundError();
    }

    await this.auditLogService.record({
      actor,
      action: "role.assign_permission",
      targetType: "Role",
      targetId: id,
      context,
      metadata: { permissionIds: uniquePermissionIds }
    });

    return this.serializeRole(role);
  }

  private async requireRole(id: number): Promise<RoleRecord> {
    const role = await this.repository.findById(id);

    if (!role) {
      throw this.notFoundError();
    }

    return role;
  }

  private async assertCodeAvailable(code: string): Promise<void> {
    const existing = await this.repository.findByCode(code);

    if (existing) {
      throw new AppError({
        code: ERROR_CODES.ROLE_CODE_EXISTS,
        message: "error.role.code_exists",
        statusCode: 409
      });
    }
  }

  private notFoundError(): AppError {
    return new AppError({
      code: ERROR_CODES.ROLE_NOT_FOUND,
      message: "error.role.not_found",
      statusCode: 404
    });
  }

  private systemProtectedError(): AppError {
    return new AppError({
      code: ERROR_CODES.CANNOT_DELETE_SYSTEM,
      message: "error.system_record_protected",
      statusCode: 403
    });
  }

  private serializeRole(role: RoleRecord): RolePayload {
    return {
      id: role.id,
      name: role.name,
      code: role.code,
      description: role.description,
      isSystem: role.isSystem,
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
      deletedAt: role.deletedAt,
      permissions: role.rolePermissions
        .filter((rolePermission) => rolePermission.deletedAt === null)
        .map((rolePermission) => ({
          id: rolePermission.permission.id,
          name: rolePermission.permission.name,
          code: rolePermission.permission.code,
          type: rolePermission.permission.type,
          module: rolePermission.permission.module,
          description: rolePermission.permission.description,
          isSystem: rolePermission.permission.isSystem,
          createdAt: rolePermission.permission.createdAt,
          updatedAt: rolePermission.permission.updatedAt,
          deletedAt: rolePermission.permission.deletedAt
        }))
    };
  }
}
