import type {
  Prisma,
  PrismaClient,
  PublicIdentifier,
  Role,
  User,
  UserIdentity,
  UserRole
} from "@prisma/client";
import { prisma } from "../prisma/client";
import { UserBootstrapKeyAllocator } from "../services/user-bootstrap-key.service";
import { IdentifierAllocator } from "../services/public-identifier.service";
import { buildPaginatedResponse, toPrismaPagination } from "../utils/pagination";
import type { PaginatedResponse, PaginationInput } from "../utils/pagination";
import type { RoleRecord } from "./role.repository";
import { PublicIdentifierRepository } from "./public-identifier.repository";

export interface UserRoleRecord extends UserRole {
  role: RoleRecord;
}

export interface UserRecord extends User {
  identities: Array<UserIdentity & { publicIdentifier: PublicIdentifier | null }>;
  userRoles: UserRoleRecord[];
  balances: UserBalancesRecord;
}

export interface UserBalancesRecord {
  ndp: { available: number; frozen: number };
  testNdp: { available: number; frozen: number };
}

export interface UserListInput extends PaginationInput {
  keyword?: string;
  isActive?: boolean;
  isTestAccount?: boolean;
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
    orderBy: [{ isDefault: "desc" as const }, { id: "asc" as const }],
    include: { publicIdentifier: true }
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
  public constructor(
    private readonly client: PrismaClient = prisma,
    private readonly bootstrapKeyAllocator = new UserBootstrapKeyAllocator(),
    private readonly createIdentifierAllocator = (client: Prisma.TransactionClient) =>
      new IdentifierAllocator(new PublicIdentifierRepository(client))
  ) {}

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

    return buildPaginatedResponse(await this.attachBalances(list), total, pagination);
  }

  public async findById(id: number): Promise<UserRecord | null> {
    const user = await this.client.user.findFirst({
      where: { id, deletedAt: null },
      include: userInclude
    });
    return this.attachBalance(user);
  }

  public async findByEmail(email: string): Promise<UserRecord | null> {
    const user = await this.client.user.findFirst({
      where: { email },
      include: userInclude
    });
    return this.attachBalance(user);
  }

  public async findByPhone(phone: string): Promise<UserRecord | null> {
    const user = await this.client.user.findFirst({
      where: { phone },
      include: userInclude
    });
    return this.attachBalance(user);
  }

  public async create(input: UserCreateData): Promise<UserRecord> {
    const user = await this.bootstrapKeyAllocator.withNewKey((bootstrapKey) =>
      this.client.$transaction(async (transaction) => {
        const customerRole = await transaction.role.findFirst({
          where: { code: "customer", deletedAt: null },
          select: { id: true }
        });
        if (!customerRole) throw new Error("Registration role is missing: customer");

        const user = await transaction.user.create({
          data: {
            needoId: bootstrapKey,
            email: input.email,
            phone: input.phone ?? null,
            emailVerifiedAt: new Date(),
            passwordHash: input.passwordHash,
            username: input.username,
            avatarUrl: input.avatarUrl ?? null,
            isActive: input.isActive
          }
        });
        const profile = await transaction.customerProfile.create({
          data: { userId: user.id, displayName: input.username }
        });
        await transaction.userExperienceAccount.create({
          data: { userId: user.id, currentLevel: 1, totalExpUnits: 0n }
        });
        const identity = await transaction.userIdentity.create({
          data: {
            userId: user.id,
            type: "customer",
            scopeType: "customer_profile",
            scopeId: profile.id,
            displayName: input.username,
            isDefault: true,
            isActive: true
          }
        });
        const identifier = await this.createIdentifierAllocator(transaction).allocate({
          kind: "U",
          userIdentityId: identity.id
        });
        await transaction.user.update({
          where: { id: user.id },
          data: { needoId: identifier.publicId }
        });
        await transaction.userRole.create({
          data: {
            userId: user.id,
            roleId: customerRole.id,
            scopeType: "customer_profile",
            scopeId: profile.id
          }
        });

        return transaction.user.findUniqueOrThrow({
          where: { id: user.id },
          include: userInclude
        });
      })
    );
    return (await this.attachBalances([user]))[0];
  }

  public async update(id: number, input: UserUpdateData): Promise<UserRecord | null> {
    const existing = await this.findById(id);

    if (!existing) {
      return null;
    }

    const user = await this.client.user.update({
      where: { id },
      data: input,
      include: userInclude
    });
    return this.attachBalance(user);
  }

  public async setActive(id: number, isActive: boolean): Promise<UserRecord | null> {
    const existing = await this.findById(id);

    if (!existing) {
      return null;
    }

    const user = await this.client.user.update({
      where: { id },
      data: { isActive },
      include: userInclude
    });
    return this.attachBalance(user);
  }

  public async softDelete(id: number): Promise<UserRecord | null> {
    const existing = await this.findById(id);

    if (!existing) {
      return null;
    }

    const user = await this.client.user.update({
      where: { id },
      data: { deletedAt: new Date() },
      include: userInclude
    });
    return this.attachBalance(user);
  }

  public findRolesByIds(roleIds: number[]): Promise<Role[]> {
    return this.client.role.findMany({
      where: {
        id: { in: roleIds },
        deletedAt: null
      }
    });
  }

  public async assignRoles(
    userId: number,
    roleAssignments: UserRoleAssignmentData[]
  ): Promise<UserRecord | null> {
    const normalizedAssignments = roleAssignments.map((assignment) => ({
      roleId: assignment.roleId,
      scopeType: assignment.scopeType,
      scopeId: assignment.scopeId
    }));

    const user = await this.client.$transaction(async (tx) => {
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
    return this.attachBalance(user);
  }

  private buildListWhere(input: UserListInput): Prisma.UserWhereInput {
    return {
      deletedAt: null,
      ...(typeof input.isActive === "boolean" ? { isActive: input.isActive } : {}),
      ...(typeof input.isTestAccount === "boolean" ? { isTestAccount: input.isTestAccount } : {}),
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

  private async attachBalance(
    user: Omit<UserRecord, "balances"> | null
  ): Promise<UserRecord | null> {
    if (!user) return null;
    return (await this.attachBalances([user]))[0];
  }

  private async attachBalances(users: Array<Omit<UserRecord, "balances">>): Promise<UserRecord[]> {
    if (users.length === 0) return [];

    const wallets = await this.client.wallet.findMany({
      where: {
        ownerType: "USER",
        ownerId: { in: users.map((user) => user.id) },
        currency: { in: ["NDP", "TEST_NDP"] },
        deletedAt: null
      },
      select: {
        ownerId: true,
        currency: true,
        availableBalance: true,
        frozenBalance: true
      }
    });
    const balancesByUser = new Map<number, UserBalancesRecord>();
    for (const user of users) {
      balancesByUser.set(user.id, this.emptyBalances());
    }
    for (const wallet of wallets) {
      const balances = balancesByUser.get(wallet.ownerId);
      if (!balances) continue;
      const balance = {
        available: wallet.availableBalance,
        frozen: wallet.frozenBalance
      };
      if (wallet.currency === "NDP") balances.ndp = balance;
      if (wallet.currency === "TEST_NDP") balances.testNdp = balance;
    }

    return users.map((user) => ({
      ...user,
      balances: balancesByUser.get(user.id) ?? this.emptyBalances()
    }));
  }

  private emptyBalances(): UserBalancesRecord {
    return {
      ndp: { available: 0, frozen: 0 },
      testNdp: { available: 0, frozen: 0 }
    };
  }
}
