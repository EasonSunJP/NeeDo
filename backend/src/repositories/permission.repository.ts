import type { Permission, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../prisma/client";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import type { PaginatedResponse, PaginationInput } from "../utils/pagination";

export type PermissionRecord = Permission;

export interface PermissionListInput extends PaginationInput {
  keyword?: string;
  module?: string;
  type?: string;
}

export interface PermissionCreateData {
  name: string;
  code: string;
  type: string;
  module: string;
  description?: string | null;
  isSystem?: boolean;
}

export interface PermissionUpdateData {
  name?: string;
  code?: string;
  type?: string;
  module?: string;
  description?: string | null;
}

export interface PermissionRepositoryPort {
  list: (input: PermissionListInput) => Promise<PaginatedResponse<PermissionRecord>>;
  listAll: () => Promise<PermissionRecord[]>;
  findById: (id: number) => Promise<PermissionRecord | null>;
  findByCode: (code: string) => Promise<PermissionRecord | null>;
  create: (input: PermissionCreateData) => Promise<PermissionRecord>;
  update: (id: number, input: PermissionUpdateData) => Promise<PermissionRecord | null>;
  softDelete: (id: number) => Promise<PermissionRecord | null>;
}

export class PermissionRepository implements PermissionRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async list(input: PermissionListInput): Promise<PaginatedResponse<PermissionRecord>> {
    const pagination = toPrismaPagination(input);
    const where = this.buildListWhere(input);
    const [list, total] = await Promise.all([
      this.client.permission.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: [{ module: "asc" }, { type: "asc" }, { code: "asc" }]
      }),
      this.client.permission.count({ where })
    ]);

    return buildPaginatedResponse(list, total, pagination);
  }

  public listAll(): Promise<PermissionRecord[]> {
    return this.client.permission.findMany({
      where: { deletedAt: null },
      orderBy: [{ module: "asc" }, { type: "asc" }, { code: "asc" }]
    });
  }

  public findById(id: number): Promise<PermissionRecord | null> {
    return this.client.permission.findFirst({
      where: { id, deletedAt: null }
    });
  }

  public findByCode(code: string): Promise<PermissionRecord | null> {
    return this.client.permission.findFirst({
      where: { code }
    });
  }

  public create(input: PermissionCreateData): Promise<PermissionRecord> {
    return this.client.permission.create({
      data: {
        name: input.name,
        code: input.code,
        type: input.type,
        module: input.module,
        description: input.description ?? null,
        isSystem: input.isSystem ?? false
      }
    });
  }

  public async update(id: number, input: PermissionUpdateData): Promise<PermissionRecord | null> {
    const existing = await this.findById(id);

    if (!existing) {
      return null;
    }

    return this.client.permission.update({
      where: { id },
      data: input
    });
  }

  public async softDelete(id: number): Promise<PermissionRecord | null> {
    const existing = await this.findById(id);

    if (!existing) {
      return null;
    }

    return this.client.permission.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }

  private buildListWhere(input: PermissionListInput): Prisma.PermissionWhereInput {
    return {
      deletedAt: null,
      ...(input.module ? { module: input.module } : {}),
      ...(input.type ? { type: input.type } : {}),
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
