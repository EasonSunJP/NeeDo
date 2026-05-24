import type { Prisma, PrismaClient, Role, User, UserIdentity, UserRole } from "@prisma/client";
import { prisma } from "../prisma/client";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import type { PaginatedResponse, PaginationInput } from "../utils/pagination";
import type { RoleRecord } from "./role.repository";

export interface UserRoleRecord extends UserRole {
  role: RoleRecord;
}

export interface UserRecord extends User {
  identities: UserIdentity[];
  userRoles: UserRoleRecord[];
}

export interface UserListInput extends PaginationInput {
  keyword?: string;
  isActive?: boolean;
}

export interface UserCreateData {
  email: string;
  phone?: string | null;
  passwordHash: string;
  username: string;
  avatarUrl?: string | null;
  isActive: boolean;
}

export interface UserUpdateData {
  email?: string;
  phone?: string | null;
  username?: string;
  avatarUrl?: string | null;
}

export interface UserRoleAssignmentData {
  roleId: number;
  scopeType: string | null;
  scopeId: number | null;
}

export interface UserRepositoryPort {
  list: (input: UserListInput) => Promise<PaginatedResponse<UserRecord>>;
  findById: (id: number) => Promise<UserRecord | null>;
  findByEmail: (email: string) => Promise<UserRecord | null>;
  findByPhone: (phone: string) => Promise<UserRecord | null>;
  create: (input: UserCreateData) => Promise<UserRecord>;
  update: (id: number, input: UserUpdateData) => Promise<UserRecord | null>;
  setActive: (id: number, isActive: boolean) => Promise<UserRecord | null>;
  softDelete: (id: number) => Promise<UserRecord | null>;
  findRolesByIds: (roleIds: number[]) => Promise<Role[]>;
  assignRoles: (
    userId: number,
    roleAssignments: UserRoleAssignmentData[]
  ) => Promise<UserRecord | null>;
}

const userInclude = {
  identities: {
    where: { deletedAt: null },
    orderBy: [{ isDefault: "desc" as const }, { id: "asc" as const }]
  },
  userRoles: {
    where: { deletedAt: null },
    include: {
      role: {
        include: {
          rolePermissions: {
            where: { deletedAt: null },
            include: { permission: true }
          }
        }
      }
    },
    orderBy: { roleId: "asc" as const }
  }
};

export class UserRepository implements UserRepositoryPort {
  public constructor(private readonly client: PrismaClient = prisma) {}

  public async list(input: UserListInput): Promise<PaginatedResponse<UserRecord>> {
    const pagination = toPrismaPagination(input);
    const where = this.buildListWhere(input);
    const [list, total] = await Promise.all([
      this.client.user.findMany({
        where,
        include: userInclude,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: "desc" }
      }),
      this.client.user.count({ where })
    ]);

    return buildPaginatedResponse(list, total, pagination);
  }

  public findById(id: number): Promise<UserRecord | null> {
    return this.client.user.findFirst({
      where: { id, deletedAt: null },
      include: userInclude
    });
  }

  public findByEmail(email: string): Promise<UserRecord | null> {
    return this.client.user.findFirst({
      where: { email },
      include: userInclude
    });
  }

  public findByPhone(phone: string): Promise<UserRecord | null> {
    return this.client.user.findFirst({
      where: { phone },
      include: userInclude
    });
  }

  public async create(input: UserCreateData): Promise<UserRecord> {
    const user = await this.client.user.create({
      data: {
        email: input.email,
        phone: input.phone ?? null,
        passwordHash: input.passwordHash,
        username: input.username,
        avatarUrl: input.avatarUrl ?? null,
        isActive: input.isActive
      }
    });

    return { ...user, identities: [], userRoles: [] };
  }

  public async update(id: number, input: UserUpdateData): Promise<UserRecord | null> {
    const existing = await this.findById(id);

    if (!existing) {
      return null;
    }

    return this.client.user.update({
      where: { id },
      data: input,
      include: userInclude
    });
  }

  public async setActive(id: number, isActive: boolean): Promise<UserRecord | null> {
    const existing = await this.findById(id);

    if (!existing) {
      return null;
    }

    return this.client.user.update({
      where: { id },
      data: { isActive },
      include: userInclude
    });
  }

  public async softDelete(id: number): Promise<UserRecord | null> {
    const existing = await this.findById(id);

    if (!existing) {
      return null;
    }

    return this.client.user.update({
      where: { id },
      data: { deletedAt: new Date() },
      include: userInclude
    });
  }

  public findRolesByIds(roleIds: number[]): Promise<Role[]> {
    return this.client.role.findMany({
      where: {
        id: { in: roleIds },
        deletedAt: null
      }
    });
  }

  public assignRoles(
    userId: number,
    roleAssignments: UserRoleAssignmentData[]
  ): Promise<UserRecord | null> {
    const normalizedAssignments = roleAssignments.map((assignment) => ({
      roleId: assignment.roleId,
      scopeType: assignment.scopeType,
      scopeId: assignment.scopeId
    }));

    return this.client.$transaction(async (tx) => {
      await tx.userRole.updateMany({
        where: {
          userId,
          deletedAt: null
        },
        data: { deletedAt: new Date() }
      });

      for (const assignment of normalizedAssignments) {
        const existing = await tx.userRole.findFirst({
          where: {
            userId,
            roleId: assignment.roleId,
            scopeType: assignment.scopeType,
            scopeId: assignment.scopeId
          }
        });

        if (existing) {
          await tx.userRole.update({
            where: { id: existing.id },
            data: { deletedAt: null }
          });
        } else {
          await tx.userRole.create({
            data: {
              userId,
              roleId: assignment.roleId,
              scopeType: assignment.scopeType,
              scopeId: assignment.scopeId
            }
          });
        }
      }

      return tx.user.findFirst({
        where: { id: userId, deletedAt: null },
        include: userInclude
      });
    });
  }

  private buildListWhere(input: UserListInput): Prisma.UserWhereInput {
    return {
      deletedAt: null,
      ...(typeof input.isActive === "boolean" ? { isActive: input.isActive } : {}),
      ...(input.keyword
        ? {
            OR: [
              { email: { contains: input.keyword } },
              { phone: { contains: input.keyword } },
              { username: { contains: input.keyword } }
            ]
          }
        : {})
    };
  }
}
