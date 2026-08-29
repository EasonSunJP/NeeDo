import { hash } from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app";
import type { ExchangeService } from "../src/services/exchange.service";
import type { ExchangePostPayload } from "../src/types/exchange.types";

class InMemoryAuthSessionStore {
  private readonly values = new Map<string, string>();

  public async getLoginLock(): Promise<boolean> {
    return false;
  }
  public async getAccountLoginLock(): Promise<boolean> {
    return false;
  }
  public async recordFailedLogin(): Promise<{ count: number; locked: boolean }> {
    return { count: 1, locked: false };
  }
  public async recordFailedLoginForAccount(): Promise<{ count: number; locked: boolean }> {
    return { count: 1, locked: false };
  }
  public async clearFailedLogin(): Promise<void> {}
  public async clearFailedLoginForAccount(): Promise<void> {}
  public async storeOtp(): Promise<void> {}
  public async getOtp(): Promise<string | null> {
    return null;
  }
  public async deleteOtp(): Promise<void> {}
  public async hasOtpCooldown(): Promise<boolean> {
    return false;
  }
  public async storeOtpCooldown(): Promise<void> {}
  public async clearOtpCooldown(): Promise<void> {}
  public async storeRefreshToken(userId: number, jti: string): Promise<void> {
    this.values.set(`${userId}:${jti}`, "1");
  }
  public async hasRefreshToken(userId: number, jti: string): Promise<boolean> {
    return this.values.has(`${userId}:${jti}`);
  }
  public async revokeRefreshToken(userId: number, jti: string): Promise<void> {
    this.values.delete(`${userId}:${jti}`);
  }
  public async revokeAllRefreshTokens(): Promise<void> {
    this.values.clear();
  }
  public async rotateRefreshToken(): Promise<boolean> {
    return true;
  }
  public async blacklistAccessToken(): Promise<void> {}
  public async isAccessTokenBlacklisted(): Promise<boolean> {
    return false;
  }
}

const now = new Date("2026-08-30T03:00:00.000Z");
const authPermissions = ["auth:me", "auth:refresh", "auth:logout"];
const commonPermissions = [
  "exchange:posts:list",
  "exchange:posts:detail",
  "exchange:posts:withdraw-own",
  "exchange:comments:list",
  "exchange:comments:create",
  "exchange:likes:write",
  "exchange:shares:create"
];

const post: ExchangePostPayload = {
  id: 41,
  type: "demand",
  status: "published",
  title: "渋谷でヘアセットをお願いしたい",
  detail: "イベント前にお願いします。",
  contentLocale: "ja",
  areaLabel: "渋谷区",
  serviceStartAt: "2026-08-31T00:00:00.000Z",
  serviceEndAt: "2026-08-31T01:00:00.000Z",
  expiresAt: "2026-08-31T08:30:00.000Z",
  publishedAt: "2026-08-30T02:00:00.000Z",
  publisher: {
    publicId: "NC12345678",
    identityType: "customer",
    displayName: "佐藤 美咲",
    avatarUrl: null
  },
  counts: { comments: 4, likes: 21, shares: 5 },
  viewer: { liked: false, canWithdraw: true },
  demand: { budgetMinJpy: 8_000, budgetMaxJpy: 12_000 },
  intelligence: null
};

const createFixture = async () => {
  const passwordHash = await hash("Abcd@1234", 12);
  const allPermissionCodes = [
    ...authPermissions,
    ...commonPermissions,
    "exchange:posts:create-demand",
    "exchange:posts:create-intelligence"
  ];
  const permissions = allPermissionCodes.map((code, index) => ({
    id: index + 1,
    name: code,
    code,
    type: "api",
    module: "exchange",
    description: code,
    isSystem: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null
  }));
  const createRole = (id: number, code: string, allowed: string[]) => ({
    id,
    name: code,
    code,
    description: code,
    isSystem: true,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    rolePermissions: permissions
      .filter((permission) => allowed.includes(permission.code))
      .map((permission, index) => ({
        id: id * 100 + index,
        roleId: id,
        permissionId: permission.id,
        deletedAt: null,
        permission
      }))
  });
  const customerRole = createRole(1, "customer", [
    ...authPermissions,
    ...commonPermissions,
    "exchange:posts:create-demand"
  ]);
  const technicianRole = createRole(2, "technician", [
    ...authPermissions,
    ...commonPermissions,
    "exchange:posts:create-intelligence"
  ]);
  const makeUser = (
    id: number,
    email: string,
    identityType: string,
    role: ReturnType<typeof createRole>
  ) => ({
    id,
    needoId: `u${String(id).padStart(10, "0")}`,
    email,
    phone: null,
    passwordHash,
    username: email,
    avatarUrl: null,
    isActive: true,
    accessState: { disabled: false, restricted: false },
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    identities: [
      {
        id: id + 10,
        userId: id,
        type: identityType,
        scopeType: identityType === "customer" ? "customer_profile" : "technician_profile",
        scopeId: id + 20,
        displayName: email,
        isDefault: true,
        isActive: true,
        deletedAt: null
      }
    ],
    userRoles: [{ deletedAt: null, role }]
  });
  const users = [
    makeUser(7, "customer@example.test", "customer", customerRole),
    makeUser(8, "technician@example.test", "technician", technicianRole)
  ];
  const service = {
    listPosts: jest.fn(async () => ({ list: [post], total: 1, page: 1, page_size: 20 })),
    getPost: jest.fn(async () => post),
    publish: jest.fn(async () => post),
    withdraw: jest.fn(async () => ({ ...post, status: "withdrawn" as const })),
    listComments: jest.fn(async () => ({ list: [], total: 0, page: 1, page_size: 20 })),
    comment: jest.fn(async () => ({
      id: 301,
      postId: 41,
      author: post.publisher,
      content: "詳細を教えてください。",
      createdAt: now.toISOString()
    })),
    like: jest.fn(async () => ({ comments: 4, likes: 22, shares: 5 })),
    unlike: jest.fn(async () => ({ comments: 4, likes: 21, shares: 5 })),
    share: jest.fn(async () => ({ comments: 4, likes: 21, shares: 6 }))
  } as unknown as jest.Mocked<ExchangeService>;
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    authRepository: {
      findUserByEmail: jest.fn(
        async (email: string) => users.find((user) => user.email === email) ?? null
      ),
      findUserByLoginIdentifier: jest.fn(
        async (value: string) => users.find((user) => user.email === value) ?? null
      ),
      findUserById: jest.fn(async (id: number) => users.find((user) => user.id === id) ?? null),
      updateLastLoginAt: jest.fn(async () => undefined),
      createLoginLog: jest.fn(async () => undefined),
      createAuditLog: jest.fn(async () => undefined)
    },
    testOnlyAllowLegacyAuthAdapters: true,
    authSessionStore: new InMemoryAuthSessionStore(),
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    exchangeService: service
  } as never);
  const login = async (email: string): Promise<string> => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ loginIdentifier: email, password: "Abcd@1234" })
      .expect(200);
    return response.body.data.accessToken as string;
  };
  return { app, login, service };
};

describe("formal Exchange routes", () => {
  it("requires authentication and the per-route read permission", async () => {
    const { app } = await createFixture();

    await request(app)
      .get("/api/v1/exchange/posts?type=demand")
      .expect(401)
      .expect((response) =>
        expect(response.body).toEqual({
          code: 40105,
          message: "error.auth.token_invalid",
          data: null
        })
      );
  });

  it("lists and reads only the public persisted response contract", async () => {
    const { app, login, service } = await createFixture();
    const token = await login("customer@example.test");

    const listResponse = await request(app)
      .get("/api/v1/exchange/posts?type=demand&page=1&page_size=20")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    await request(app)
      .get("/api/v1/exchange/posts/41")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(service.listPosts).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, currentIdentityType: "customer" }),
      { type: "demand", page: 1, pageSize: 20 }
    );
    expect(JSON.stringify(listResponse.body)).not.toContain("authorUserId");
    expect(JSON.stringify(listResponse.body)).not.toContain("authorIdentityId");
  });

  it("validates body and idempotency header, then authorizes the matching subtype", async () => {
    const { app, login, service } = await createFixture();
    const customerToken = await login("customer@example.test");
    const technicianToken = await login("technician@example.test");
    const demandBody = {
      type: "demand",
      title: post.title,
      detail: post.detail,
      contentLocale: "ja",
      areaLabel: post.areaLabel,
      serviceStartAt: "2026-08-31T09:00:00+09:00",
      serviceEndAt: "2026-08-31T10:00:00+09:00",
      expiresAt: "2026-08-31T08:30:00Z",
      budgetMinJpy: 8_000,
      budgetMaxJpy: 12_000
    };

    await request(app)
      .post("/api/v1/exchange/posts")
      .set("Authorization", `Bearer ${customerToken}`)
      .set("Idempotency-Key", "publish-demand-0001")
      .send(demandBody)
      .expect(201);
    expect(service.publish).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7 }),
      expect.objectContaining({
        type: "demand",
        serviceStartAt: new Date("2026-08-31T00:00:00.000Z")
      }),
      "publish-demand-0001"
    );

    await request(app)
      .post("/api/v1/exchange/posts")
      .set("Authorization", `Bearer ${technicianToken}`)
      .set("Idempotency-Key", "publish-demand-0002")
      .send(demandBody)
      .expect(403);
    await request(app)
      .post("/api/v1/exchange/posts")
      .set("Authorization", `Bearer ${customerToken}`)
      .set("Idempotency-Key", "short")
      .send(demandBody)
      .expect(400);
    expect(service.publish).toHaveBeenCalledTimes(1);
  });

  it("exposes comments, like, unlike, share, and withdrawal without deferred routes", async () => {
    const { app, login, service } = await createFixture();
    const token = await login("customer@example.test");
    const auth = { Authorization: `Bearer ${token}`, "Idempotency-Key": "interaction-key-001" };

    await request(app).get("/api/v1/exchange/posts/41/comments").set(auth).expect(200);
    await request(app)
      .post("/api/v1/exchange/posts/41/comments")
      .set(auth)
      .send({ content: "詳細を教えてください。" })
      .expect(201);
    await request(app).put("/api/v1/exchange/posts/41/like").set(auth).expect(200);
    await request(app).delete("/api/v1/exchange/posts/41/like").set(auth).expect(200);
    await request(app).post("/api/v1/exchange/posts/41/shares").set(auth).expect(200);
    await request(app).post("/api/v1/exchange/posts/41/withdraw").set(auth).expect(200);

    expect(service.comment).toHaveBeenCalledTimes(1);
    expect(service.like).toHaveBeenCalledTimes(1);
    expect(service.unlike).toHaveBeenCalledTimes(1);
    expect(service.share).toHaveBeenCalledTimes(1);
    expect(service.withdraw).toHaveBeenCalledTimes(1);

    for (const deferredPath of ["offers", "matches", "bookings", "orders", "payments"]) {
      await request(app).post(`/api/v1/exchange/posts/41/${deferredPath}`).set(auth).expect(404);
    }
  });
});
