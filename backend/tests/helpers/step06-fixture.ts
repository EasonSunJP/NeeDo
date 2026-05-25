import { hash } from "bcryptjs";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../../src/app";

interface StoredValue {
  value: string;
  expiresAt: number;
}

class InMemoryAuthSessionStore {
  public readonly refreshTokens = new Set<string>();
  private readonly values = new Map<string, StoredValue>();
  private readonly failureCounts = new Map<string, number>();

  public async getLoginLock(email: string): Promise<boolean> {
    return this.getValue(`login:lock:${email}`) !== null;
  }

  public async recordFailedLogin(
    ip: string,
    email: string,
    options: { failureLimit: number; windowSeconds: number; lockSeconds: number }
  ): Promise<{ count: number; locked: boolean }> {
    const key = `login:fail:${ip}:${email}`;
    const nextCount = (this.failureCounts.get(key) ?? 0) + 1;
    this.failureCounts.set(key, nextCount);
    this.setValue(key, String(nextCount), options.windowSeconds);

    if (nextCount >= options.failureLimit) {
      this.setValue(`login:lock:${email}`, "1", options.lockSeconds);
      return { count: nextCount, locked: true };
    }

    return { count: nextCount, locked: false };
  }

  public async clearFailedLogin(ip: string, email: string): Promise<void> {
    const key = `login:fail:${ip}:${email}`;
    this.failureCounts.delete(key);
    this.values.delete(key);
    this.values.delete(`login:lock:${email}`);
  }

  public async storeOtp(email: string, otp: string, ttlSeconds: number): Promise<void> {
    this.setValue(`otp:${email}`, otp, ttlSeconds);
  }

  public async getOtp(email: string): Promise<string | null> {
    return this.getValue(`otp:${email}`);
  }

  public async deleteOtp(email: string): Promise<void> {
    this.values.delete(`otp:${email}`);
  }

  public async hasOtpCooldown(email: string): Promise<boolean> {
    return this.getValue(`otp:cooldown:${email}`) !== null;
  }

  public async storeOtpCooldown(email: string, ttlSeconds: number): Promise<void> {
    this.setValue(`otp:cooldown:${email}`, "1", ttlSeconds);
  }

  public async clearOtpCooldown(email: string): Promise<void> {
    this.values.delete(`otp:cooldown:${email}`);
  }

  public async storeRefreshToken(userId: number, jti: string, ttlSeconds: number): Promise<void> {
    this.refreshTokens.add(`${userId}:${jti}`);
    this.setValue(`refresh:${userId}:${jti}`, "1", ttlSeconds);
  }

  public async hasRefreshToken(userId: number, jti: string): Promise<boolean> {
    return this.getValue(`refresh:${userId}:${jti}`) !== null;
  }

  public async revokeRefreshToken(userId: number, jti: string): Promise<void> {
    this.refreshTokens.delete(`${userId}:${jti}`);
    this.values.delete(`refresh:${userId}:${jti}`);
  }

  public async blacklistAccessToken(jti: string, ttlSeconds: number): Promise<void> {
    this.setValue(`token:blacklist:${jti}`, "1", ttlSeconds);
  }

  public async isAccessTokenBlacklisted(jti: string): Promise<boolean> {
    return this.getValue(`token:blacklist:${jti}`) !== null;
  }

  private setValue(key: string, value: string, ttlSeconds: number): void {
    this.values.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000
    });
  }

  private getValue(key: string): string | null {
    const stored = this.values.get(key);
    if (!stored) {
      return null;
    }
    if (stored.expiresAt <= Date.now()) {
      this.values.delete(key);
      return null;
    }
    return stored.value;
  }
}

export interface TestPermissionRecord {
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

export interface TestRolePermissionRecord {
  id: number;
  roleId: number;
  permissionId: number;
  deletedAt: Date | null;
  permission: TestPermissionRecord;
}

export interface TestRoleRecord {
  id: number;
  name: string;
  code: string;
  description: string | null;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  rolePermissions: TestRolePermissionRecord[];
}

export interface TestUserRoleRecord {
  id: number;
  userId: number;
  roleId: number;
  scopeType: string | null;
  scopeId: number | null;
  deletedAt: Date | null;
  role: TestRoleRecord;
}

export interface TestUserIdentityRecord {
  id: number;
  userId: number;
  type: string;
  scopeType: string | null;
  scopeId: number | null;
  displayName: string | null;
  isDefault: boolean;
  isActive: boolean;
  deletedAt: Date | null;
}

export interface TestUserRecord {
  id: number;
  email: string;
  phone: string | null;
  passwordHash: string;
  username: string;
  avatarUrl: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  identities: TestUserIdentityRecord[];
  userRoles: TestUserRoleRecord[];
}

interface AuditLogEntry {
  actorId?: number | null;
  action: string;
  targetType: string;
  targetId?: number | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: unknown;
}

const now = (): Date => new Date("2026-05-25T00:00:00.000Z");

const activePermissions = (permissions: TestPermissionRecord[]): TestPermissionRecord[] =>
  permissions.filter((permission) => permission.deletedAt === null);

const activeRoles = (roles: TestRoleRecord[]): TestRoleRecord[] =>
  roles.filter((role) => role.deletedAt === null);

const makeAuthOnlyPermission = (code: string): TestPermissionRecord => ({
  id: 9000 + code.length,
  name: code,
  code,
  type: "api",
  module: code.split(":")[0],
  description: code,
  isSystem: true,
  createdAt: now(),
  updatedAt: now(),
  deletedAt: null
});

const attachRolePermissions = (
  roles: TestRoleRecord[],
  permissions: TestPermissionRecord[]
): void => {
  for (const role of roles) {
    role.rolePermissions = role.rolePermissions.map((rolePermission) => ({
      ...rolePermission,
      permission:
        permissions.find((permission) => permission.id === rolePermission.permissionId) ??
        rolePermission.permission
    }));
  }
};

export const createStep06Fixture = async () => {
  const passwordHash = await hash("Abcd@1234", 12);
  const auditLogs: AuditLogEntry[] = [];
  const permissionAssignCalls: Array<{ roleId: number; permissionIds: number[] }> = [];
  const userRoleAssignCalls: Array<{
    userId: number;
    roleAssignments: Array<{ roleId: number; scopeType: string | null; scopeId: number | null }>;
  }> = [];
  const permissions: TestPermissionRecord[] = [
    {
      id: 1,
      name: "Permission List",
      code: "permission:list",
      type: "api",
      module: "permission",
      description: "List permissions",
      isSystem: true,
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null
    },
    {
      id: 2,
      name: "Permission Delete",
      code: "permission:delete",
      type: "api",
      module: "permission",
      description: "Delete permissions",
      isSystem: true,
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null
    },
    {
      id: 3,
      name: "Custom Read",
      code: "custom:read",
      type: "api",
      module: "custom",
      description: "Read custom resources",
      isSystem: false,
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null
    },
    {
      id: 4,
      name: "Role List",
      code: "role:list",
      type: "api",
      module: "role",
      description: "List roles",
      isSystem: true,
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null
    },
    {
      id: 5,
      name: "User List",
      code: "user:list",
      type: "api",
      module: "user",
      description: "List users",
      isSystem: true,
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null
    },
    {
      id: 6,
      name: "User Create Button",
      code: "button:user:create",
      type: "button",
      module: "user",
      description: "Show create user action",
      isSystem: true,
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null
    }
  ];
  const roles: TestRoleRecord[] = [
    {
      id: 1,
      name: "Admin",
      code: "admin",
      description: "All permissions",
      isSystem: true,
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null,
      rolePermissions: [
        ...permissions,
        ...[
          "permission:create",
          "permission:update",
          "role:create",
          "role:update",
          "role:delete",
          "role:assign-permission",
          "user:create",
          "user:update",
          "user:delete",
          "user:status:update",
          "user:assign-role"
        ].map((code) => makeAuthOnlyPermission(code))
      ].map((permission, index) => ({
        id: index + 1,
        roleId: 1,
        permissionId: permission.id,
        deletedAt: null,
        permission
      }))
    },
    {
      id: 2,
      name: "Operator",
      code: "operator",
      description: "Daily operations",
      isSystem: true,
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null,
      rolePermissions: [
        {
          id: 100,
          roleId: 2,
          permissionId: 5,
          deletedAt: null,
          permission: permissions[4]
        }
      ]
    },
    {
      id: 3,
      name: "Custom Manager",
      code: "custom_manager",
      description: "Custom role",
      isSystem: false,
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null,
      rolePermissions: [
        {
          id: 101,
          roleId: 3,
          permissionId: 3,
          deletedAt: null,
          permission: permissions[2]
        }
      ]
    }
  ];
  const users: TestUserRecord[] = [
    {
      id: 1,
      email: "admin@example.com",
      phone: null,
      passwordHash,
      username: "NeeDo Admin",
      avatarUrl: null,
      isActive: true,
      lastLoginAt: null,
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null,
      identities: [
        {
          id: 1,
          userId: 1,
          type: "platform",
          scopeType: "global",
          scopeId: null,
          displayName: "NeeDo Admin",
          isDefault: true,
          isActive: true,
          deletedAt: null
        }
      ],
      userRoles: [
        {
          id: 1,
          userId: 1,
          roleId: 1,
          scopeType: "global",
          scopeId: null,
          deletedAt: null,
          role: roles[0]
        }
      ]
    },
    {
      id: 2,
      email: "operator@example.com",
      phone: "+819012345678",
      passwordHash,
      username: "Operator",
      avatarUrl: null,
      isActive: true,
      lastLoginAt: null,
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null,
      identities: [],
      userRoles: [
        {
          id: 2,
          userId: 2,
          roleId: 2,
          scopeType: "global",
          scopeId: null,
          deletedAt: null,
          role: roles[1]
        }
      ]
    },
    {
      id: 3,
      email: "second-admin@example.com",
      phone: null,
      passwordHash,
      username: "Second Admin",
      avatarUrl: null,
      isActive: true,
      lastLoginAt: null,
      createdAt: now(),
      updatedAt: now(),
      deletedAt: null,
      identities: [],
      userRoles: [
        {
          id: 3,
          userId: 3,
          roleId: 1,
          scopeType: "global",
          scopeId: null,
          deletedAt: null,
          role: roles[0]
        }
      ]
    }
  ];

  const authRepository = {
    findUserByEmail: jest.fn(
      async (email: string) =>
        users.find((user) => user.email === email && user.deletedAt === null) ?? null
    ),
    findUserByLoginIdentifier: jest.fn(
      async (identifier: string) =>
        users.find(
          (user) =>
            (user.email === identifier || user.username === identifier) && user.deletedAt === null
        ) ?? null
    ),
    findUserById: jest.fn(async (id: number) => {
      attachRolePermissions(roles, permissions);
      const user = users.find((item) => item.id === id && item.deletedAt === null);
      if (!user) {
        return null;
      }
      user.userRoles = user.userRoles.map((userRole) => ({
        ...userRole,
        role: roles.find((role) => role.id === userRole.roleId) ?? userRole.role
      }));
      return user;
    }),
    updateLastLoginAt: jest.fn(async (id: number, loggedInAt: Date) => {
      const user = users.find((item) => item.id === id);
      if (user) {
        user.lastLoginAt = loggedInAt;
      }
    }),
    createLoginLog: jest.fn(async () => undefined),
    createAuditLog: jest.fn(async (entry: AuditLogEntry) => {
      auditLogs.push(entry);
    })
  };
  const auditLogRepository = {
    create: jest.fn(async (entry: AuditLogEntry) => {
      auditLogs.push(entry);
    })
  };
  const permissionRepository = {
    list: jest.fn(async ({ page, pageSize }: { page: number; pageSize: number }) => ({
      list: activePermissions(permissions).slice((page - 1) * pageSize, page * pageSize),
      total: activePermissions(permissions).length,
      page,
      page_size: pageSize
    })),
    listAll: jest.fn(async () => activePermissions(permissions)),
    findById: jest.fn(async (id: number) => permissions.find((item) => item.id === id) ?? null),
    findByCode: jest.fn(
      async (code: string) => permissions.find((item) => item.code === code) ?? null
    ),
    create: jest.fn(
      async (input: Omit<TestPermissionRecord, "id" | "createdAt" | "updatedAt" | "deletedAt">) => {
        const permission = {
          ...input,
          id: Math.max(...permissions.map((item) => item.id)) + 1,
          createdAt: now(),
          updatedAt: now(),
          deletedAt: null
        };
        permissions.push(permission);
        return permission;
      }
    ),
    update: jest.fn(async (id: number, input: Partial<TestPermissionRecord>) => {
      const permission = permissions.find((item) => item.id === id);
      if (!permission) {
        return null;
      }
      Object.assign(permission, input, { updatedAt: now() });
      return permission;
    }),
    softDelete: jest.fn(async (id: number) => {
      const permission = permissions.find((item) => item.id === id);
      if (!permission) {
        return null;
      }
      permission.deletedAt = now();
      return permission;
    })
  };
  const roleRepository = {
    list: jest.fn(async ({ page, pageSize }: { page: number; pageSize: number }) => ({
      list: activeRoles(roles).slice((page - 1) * pageSize, page * pageSize),
      total: activeRoles(roles).length,
      page,
      page_size: pageSize
    })),
    findById: jest.fn(async (id: number) => roles.find((role) => role.id === id) ?? null),
    findByCode: jest.fn(async (code: string) => roles.find((role) => role.code === code) ?? null),
    create: jest.fn(
      async (
        input: Omit<
          TestRoleRecord,
          "id" | "createdAt" | "updatedAt" | "deletedAt" | "rolePermissions"
        >
      ) => {
        const role = {
          ...input,
          id: Math.max(...roles.map((item) => item.id)) + 1,
          createdAt: now(),
          updatedAt: now(),
          deletedAt: null,
          rolePermissions: []
        };
        roles.push(role);
        return role;
      }
    ),
    update: jest.fn(async (id: number, input: Partial<TestRoleRecord>) => {
      const role = roles.find((item) => item.id === id);
      if (!role) {
        return null;
      }
      Object.assign(role, input, { updatedAt: now() });
      return role;
    }),
    softDelete: jest.fn(async (id: number) => {
      const role = roles.find((item) => item.id === id);
      if (!role) {
        return null;
      }
      role.deletedAt = now();
      return role;
    }),
    assignPermissions: jest.fn(async (roleId: number, permissionIds: number[]) => {
      permissionAssignCalls.push({ roleId, permissionIds });
      const role = roles.find((item) => item.id === roleId);
      if (!role) {
        return null;
      }
      role.rolePermissions = permissionIds.map((permissionId, index) => ({
        id: 1000 + index,
        roleId,
        permissionId,
        deletedAt: null,
        permission:
          permissions.find((permission) => permission.id === permissionId) ?? permissions[0]
      }));
      return role;
    }),
    findPermissionsByIds: jest.fn(async (permissionIds: number[]) =>
      permissions.filter(
        (permission) => permissionIds.includes(permission.id) && permission.deletedAt === null
      )
    )
  };
  const userRepository = {
    list: jest.fn(async ({ page, pageSize }: { page: number; pageSize: number }) => ({
      list: users
        .filter((user) => user.deletedAt === null)
        .slice((page - 1) * pageSize, page * pageSize),
      total: users.filter((user) => user.deletedAt === null).length,
      page,
      page_size: pageSize
    })),
    findById: jest.fn(async (id: number) => users.find((user) => user.id === id) ?? null),
    findByEmail: jest.fn(
      async (email: string) => users.find((user) => user.email === email) ?? null
    ),
    findByPhone: jest.fn(
      async (phone: string) => users.find((user) => user.phone === phone) ?? null
    ),
    create: jest.fn(
      async (input: {
        email: string;
        phone?: string | null;
        passwordHash: string;
        username: string;
        avatarUrl?: string | null;
        isActive: boolean;
      }) => {
        const user: TestUserRecord = {
          id: Math.max(...users.map((item) => item.id)) + 1,
          email: input.email,
          phone: input.phone ?? null,
          passwordHash: input.passwordHash,
          username: input.username,
          avatarUrl: input.avatarUrl ?? null,
          isActive: input.isActive,
          lastLoginAt: null,
          createdAt: now(),
          updatedAt: now(),
          deletedAt: null,
          identities: [],
          userRoles: []
        };
        users.push(user);
        return user;
      }
    ),
    update: jest.fn(async (id: number, input: Partial<TestUserRecord>) => {
      const user = users.find((item) => item.id === id);
      if (!user) {
        return null;
      }
      Object.assign(user, input, { updatedAt: now() });
      return user;
    }),
    setActive: jest.fn(async (id: number, isActive: boolean) => {
      const user = users.find((item) => item.id === id);
      if (!user) {
        return null;
      }
      user.isActive = isActive;
      user.updatedAt = now();
      return user;
    }),
    softDelete: jest.fn(async (id: number) => {
      const user = users.find((item) => item.id === id);
      if (!user) {
        return null;
      }
      user.deletedAt = now();
      return user;
    }),
    findRolesByIds: jest.fn(async (roleIds: number[]) =>
      roles.filter((role) => roleIds.includes(role.id) && role.deletedAt === null)
    ),
    assignRoles: jest.fn(
      async (
        userId: number,
        roleAssignments: Array<{ roleId: number; scopeType: string | null; scopeId: number | null }>
      ) => {
        userRoleAssignCalls.push({ userId, roleAssignments });
        const user = users.find((item) => item.id === userId);
        if (!user) {
          return null;
        }
        user.userRoles = roleAssignments.map((assignment, index) => ({
          id: 2000 + index,
          userId,
          roleId: assignment.roleId,
          scopeType: assignment.scopeType,
          scopeId: assignment.scopeId,
          deletedAt: null,
          role: roles.find((role) => role.id === assignment.roleId) ?? roles[0]
        }));
        return user;
      }
    )
  };
  const sessionStore = new InMemoryAuthSessionStore();
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    authRepository,
    authSessionStore: sessionStore,
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    auditLogRepository,
    permissionRepository,
    roleRepository,
    userRepository
  } as never);
  const loginAsAdmin = async (): Promise<string> => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin@example.com", password: "Abcd@1234" })
      .expect(200);

    return response.body.data.accessToken as string;
  };

  const replaceAdminPermissions = (codes: string[]): void => {
    roles[0].rolePermissions = codes.map((code, index) => {
      const permission = permissions.find((item) => item.code === code) ?? permissions[0];
      return {
        id: 5000 + index,
        roleId: 1,
        permissionId: permission.id,
        deletedAt: null,
        permission
      };
    });
  };

  return {
    app: app as Express,
    permissions,
    roles,
    users,
    auditLogs,
    permissionAssignCalls,
    userRoleAssignCalls,
    permissionRepository,
    roleRepository,
    userRepository,
    loginAsAdmin,
    replaceAdminPermissions
  };
};
