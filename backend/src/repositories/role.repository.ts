import type { Permission, Prisma, PrismaClient, Role, RolePermission } from "@prisma/client";
import { prisma } from "../prisma/client";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import type { PaginatedResponse, PaginationInput } from "../utils/pagination";

export interface RolePermissionRecord extends RolePermission {
  permission: Permission;
}

export interface RoleRecord extends Role {
  rolePermissions: RolePermissionRecord[];
}

export interface RoleListInput extends PaginationInput {
  keyword?: string;
}

export interface RoleCreateData {
  name: string;
  code: string;
  description?: string | null;
  isSystem?: boolean;
}

export interface RoleUpdateData {
  name?: string;
  code?: string;
  description?: string | null;
}

export interface RoleRepositoryPort {
  list: (input: RoleListInput) => Promise<PaginatedResponse<RoleRecord>>;
  findById: (id: number) => Promise<RoleRecord | null>;
  findByCode: (code: string) => Promise<RoleRecord | null>;
  create: (input: RoleCreateData) => Promise<RoleRecord>;
  update: (id: number, input: RoleUpdateData) => Promise<RoleRecord | null>;
  softDelete: (id: number) => Promise<RoleRecord | null>;
  findPermissionsByIds: (permissionIds: number[]) => Promise<Permission[]>;
  assignPermissions: (roleId: number, permissionIds: number[]) => Promise<RoleRecord | null>;
}

const roleInclude = {
  rolePermissions: {
    where: { deletedAt: null },
    include: {
      permission: true
    },
    orderBy: { permissionId: "asc" as const }
  }
};

export class RoleRepository implements RoleRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async list(input: RoleListInput): Promise<PaginatedResponse<RoleRecord>> {
    const pagination = toPrismaPagination(input);
    const where = this.buildListWhere(input);
    const [list, total] = await Promise.all([
      this.client.role.findMany({
        where,
        include: roleInclude,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ isSystem: "desc" }, { code: "asc" }]
      }),
      this.client.role.count({ where })
    ]);

    return buildPaginatedResponse(list, total, pagination);
  }

  public findById(id: number): Promise<RoleRecord | null> {
    return this.client.role.findFirst({
      where: { id, deletedAt: null },
      include: roleInclude
    });
  }

  public findByCode(code: string): Promise<RoleRecord | null> {
    return this.client.role.findFirst({
      where: { code },
      include: roleInclude
    });
  }

  public async create(input: RoleCreateData): Promise<RoleRecord> {
    const role = await this.client.role.create({
      data: {
        name: input.name,
        code: input.code,
        description: input.description ?? null,
        isSystem: input.isSystem ?? false
      }
    });

    return { ...role, rolePermissions: [] };
  }

  public async update(id: number, input: RoleUpdateData): Promise<RoleRecord | null> {
    const existing = await this.findById(id);

    if (!existing) {
      return null;
    }

    return this.client.role.update({
      where: { id },
      data: input,
      include: roleInclude
    });
  }

  public async softDelete(id: number): Promise<RoleRecord | null> {
    const existing = await this.findById(id);

    if (!existing) {
      return null;
    }

    return this.client.role.update({
      where: { id },
      data: { deletedAt: new Date() },
      include: roleInclude
    });
  }

  public findPermissionsByIds(permissionIds: number[]): Promise<Permission[]> {
    return this.client.permission.findMany({
      where: {
        id: { in: permissionIds },
        deletedAt: null
      }
    });
  }

  public assignPermissions(roleId: number, permissionIds: number[]): Promise<RoleRecord | null> {
    const uniquePermissionIds = Array.from(new Set(permissionIds));

    return this.client.$transaction(async (tx) => {
      await tx.rolePermission.updateMany({
        where: {
          roleId,
          deletedAt: null,
          permissionId: uniquePermissionIds.length > 0 ? { notIn: uniquePermissionIds } : undefined
        },
        data: { deletedAt: new Date() }
      });

      for (const permissionId of uniquePermissionIds) {
        await tx.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId,
              permissionId
            }
          },
          create: {
            roleId,
            permissionId
          },
          update: {
            deletedAt: null
          }
        });
      }

      return tx.role.findFirst({
        where: { id: roleId, deletedAt: null },
        include: roleInclude
      });
    });
  }

  private buildListWhere(input: RoleListInput): Prisma.RoleWhereInput {
    return {
      deletedAt: null,
      ...(input.keyword
        ? {
            OR: [
              { name: { contains: input.keyword } },
              { code: { contains: input.keyword } },
              { description: { contains: input.keyword } }
            ]
          }
        : {})
    };
  }
}
