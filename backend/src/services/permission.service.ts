import { ERROR_CODES } from "../constants/error-codes";
import type {
  PermissionRepositoryPort,
  PermissionRecord
} from "../repositories/permission.repository";
import type { AuthRequestContext, AuthenticatedAccessContext } from "./auth.service";
import type { AuditLogService } from "./audit-log.service";
import { AppError } from "../utils/app-error";
import type { PaginatedResponse } from "../utils/pagination";

export interface PermissionPayload {
  id: number;
  name: string;
  code: string;
  type: string;
  module: string;
  description: string | null;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface PermissionTreeTypePayload {
  type: string;
  permissions: PermissionPayload[];
}

export interface PermissionTreeModulePayload {
  module: string;
  children: PermissionTreeTypePayload[];
}

export interface PermissionTreePayload {
  modules: PermissionTreeModulePayload[];
}

export interface PermissionListInput {
  page?: number;
  pageSize?: number;
  keyword?: string;
  module?: string;
  type?: string;
}

export interface PermissionCreateInput {
  name: string;
  code: string;
  type: string;
  module: string;
  description?: string | null;
}

export interface PermissionUpdateInput {
  name?: string;
  code?: string;
  type?: string;
  module?: string;
  description?: string | null;
}

export class PermissionService {
  public constructor(
    private readonly repository: PermissionRepositoryPort,
    private readonly auditLogService: AuditLogService
  ) {}

  public async list(input: PermissionListInput): Promise<PaginatedResponse<PermissionPayload>> {
    const page = await this.repository.list(input);

    return {
      ...page,
      list: page.list.map((permission) => this.serializePermission(permission))
    };
  }

  public async get(id: number): Promise<PermissionPayload> {
    return this.serializePermission(await this.requirePermission(id));
  }

  public async tree(): Promise<PermissionTreePayload> {
    const permissions = await this.repository.listAll();
    const modules = new Map<string, Map<string, PermissionPayload[]>>();

    for (const permission of permissions) {
      const moduleBucket = modules.get(permission.module) ?? new Map<string, PermissionPayload[]>();
      const typeBucket = moduleBucket.get(permission.type) ?? [];
      typeBucket.push(this.serializePermission(permission));
      moduleBucket.set(permission.type, typeBucket);
      modules.set(permission.module, moduleBucket);
    }

    return {
      modules: Array.from(modules.entries()).map(([module, childrenByType]) => ({
        module,
        children: Array.from(childrenByType.entries()).map(([type, permissionsByType]) => ({
          type,
          permissions: permissionsByType
        }))
      }))
    };
  }

  public async create(
    input: PermissionCreateInput,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<PermissionPayload> {
    await this.assertCodeAvailable(input.code);
    const permission = await this.repository.create({ ...input, isSystem: false });
    await this.auditLogService.record({
      actor,
      action: "permission.create",
      targetType: "Permission",
      targetId: permission.id,
      context,
      metadata: { code: permission.code }
    });

    return this.serializePermission(permission);
  }

  public async update(
    id: number,
    input: PermissionUpdateInput,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<PermissionPayload> {
    const existing = await this.requirePermission(id);
    if (existing.isSystem && input.code && input.code !== existing.code) {
      throw this.systemProtectedError();
    }
    if (input.code && input.code !== existing.code) {
      await this.assertCodeAvailable(input.code);
    }

    const permission = await this.repository.update(id, input);
    if (!permission) {
      throw this.notFoundError();
    }

    await this.auditLogService.record({
      actor,
      action: "permission.update",
      targetType: "Permission",
      targetId: id,
      context,
      metadata: { changedFields: Object.keys(input) }
    });

    return this.serializePermission(permission);
  }

  public async softDelete(
    id: number,
    actor: AuthenticatedAccessContext,
    context: AuthRequestContext
  ): Promise<Record<string, never>> {
    const existing = await this.requirePermission(id);
    if (existing.isSystem) {
      throw this.systemProtectedError();
    }

    const permission = await this.repository.softDelete(id);
    if (!permission) {
      throw this.notFoundError();
    }

    await this.auditLogService.record({
      actor,
      action: "permission.delete",
      targetType: "Permission",
      targetId: id,
      context,
      metadata: { code: existing.code }
    });

    return {};
  }

  private async requirePermission(id: number): Promise<PermissionRecord> {
    const permission = await this.repository.findById(id);

    if (!permission) {
      throw this.notFoundError();
    }

    return permission;
  }

  private async assertCodeAvailable(code: string): Promise<void> {
    const existing = await this.repository.findByCode(code);

    if (existing) {
      throw new AppError({
        code: ERROR_CODES.PERMISSION_CODE_EXISTS,
        message: "error.permission.code_exists",
        statusCode: 409
      });
    }
  }

  private notFoundError(): AppError {
    return new AppError({
      code: ERROR_CODES.PERMISSION_NOT_FOUND,
      message: "error.permission.not_found",
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

  private serializePermission(permission: PermissionRecord): PermissionPayload {
    return {
      id: permission.id,
      name: permission.name,
      code: permission.code,
      type: permission.type,
      module: permission.module,
      description: permission.description,
      isSystem: permission.isSystem,
      createdAt: permission.createdAt,
      updatedAt: permission.updatedAt,
      deletedAt: permission.deletedAt
    };
  }
}
