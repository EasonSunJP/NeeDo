import { hash } from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app";
import { ExchangeService } from "../src/services/exchange.service";
import type { ExchangeActorLookup } from "../src/services/exchange.service";
import type { ExchangePostPayload } from "../src/types/exchange.types";
import { createDirectShopContextRepository } from "./helpers/merchant-shop-context";

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
  viewer: {
    liked: false,
    canWithdraw: true,
    canClaim: false,
    canViewClaims: true,
    canViewMatching: true,
    claimUnavailableReason: null
  },
  demand: {
    cover: { url: "/images/exchange-demand-default-cover.svg", isDefault: true },
    serviceMode: "store",
    targetProviderCount: 1,
    targetProviderLimitSnapshot: 1,
    publisherCapacitySource: "customer_membership",
    membershipLevelSnapshot: "standard",
    matchMode: "quick",
    budgetMode: "total",
    budgetMinJpy: 8_000,
    budgetMaxJpy: 12_000,
    address: {
      line1: "渋谷区",
      line2: null,
      line3: null,
      line2GenerallyVisible: false,
      line3GenerallyVisible: false,
      disclosure: "owner"
    }
  },
  intelligence: null
};

const createFixture = async (exchangeServiceOverride?: ExchangeService) => {
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
  const merchantStaffRole = createRole(3, "merchant_staff", [
    ...authPermissions,
    ...commonPermissions
  ]);
  const merchantStaffScopedDemandRole = createRole(4, "merchant_staff_scoped_demand", [
    ...authPermissions,
    ...commonPermissions,
    "exchange:posts:create-demand"
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
        scopeType:
          identityType === "customer"
            ? "customer_profile"
            : identityType === "merchant_staff"
              ? "shop"
              : "technician_profile",
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
    makeUser(8, "technician@example.test", "technician", technicianRole),
    makeUser(9, "merchant-staff@example.test", "merchant_staff", merchantStaffRole),
    makeUser(
      10,
      "merchant-staff-scoped-demand@example.test",
      "merchant_staff",
      merchantStaffScopedDemandRole
    )
  ];
  const service = {
    listPosts: jest.fn(async () => ({ list: [post], total: 1, page: 1, page_size: 20 })),
    getRequestPublicationContext: jest.fn(async () => ({
      canPublish: true,
      capacitySource: "customer_membership",
      membershipLevel: "gold",
      maxTargetProviderCount: 5,
      publicationFee: { amountNdp: 1000, currency: "TEST_NDP", ruleSetVersion: 3 }
    })),
    getPost: jest.fn(async () => post),
    uploadDemandCover: jest.fn(async () => ({ publicId: "a".repeat(64), url: "/media/content/aa.webp", mimeType: "image/webp", width: 1280, height: 720 })),
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
    merchantShopContextRepository: createDirectShopContextRepository(),
    testOnlyAllowLegacyAuthAdapters: true,
    authSessionStore: new InMemoryAuthSessionStore(),
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    exchangeService: exchangeServiceOverride ?? service
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
  it("protects raw pending-cover uploads and returns the public cover contract", async () => {
    const { app, login, service } = await createFixture();
    const token = await login("customer@example.test");
    const technicianToken = await login("technician@example.test");

    await request(app).post("/api/v1/exchange/demand-cover")
      .set("Content-Type", "image/webp").send(Buffer.from("valid-image")).expect(401);
    await request(app).post("/api/v1/exchange/demand-cover")
      .set("Authorization", `Bearer ${technicianToken}`)
      .set("Content-Type", "image/webp").send(Buffer.from("valid-image")).expect(403);
    await request(app).post("/api/v1/exchange/demand-cover")
      .set("Authorization", `Bearer ${token}`)
      .send({ image: "not raw bytes" }).expect(415)
      .expect(({ body }) => expect(body.message).toBe("error.exchange.demand_cover_invalid"));
    expect(service.uploadDemandCover).not.toHaveBeenCalled();
    await request(app).post("/api/v1/exchange/demand-cover")
      .set("Authorization", `Bearer ${token}`)
      .set("Content-Type", "image/webp")
      .send(Buffer.alloc(8 * 1024 * 1024 + 1)).expect(413)
      .expect(({ body }) => expect(body.message).toBe("error.exchange.demand_cover_too_large"));
    expect(service.uploadDemandCover).not.toHaveBeenCalled();
    await request(app).post("/api/v1/exchange/demand-cover?alt_text=Cover")
      .set("Authorization", `Bearer ${token}`)
      .set("Content-Type", "image/webp").send(Buffer.from("valid-image")).expect(201)
      .expect(({ body }) => expect(body.data).toEqual({ publicId: "a".repeat(64), url: "/media/content/aa.webp", mimeType: "image/webp", width: 1280, height: 720 }));
    expect(service.uploadDemandCover).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7, currentIdentityId: 17 }),
      expect.objectContaining({ ip: expect.any(String) }),
      { bytes: Buffer.from("valid-image"), mimeType: "image/webp", altText: "Cover" }
    );
  });

  it("requires authentication and the per-route read permission", async () => {
    const { app } = await createFixture();

    for (const path of ["/api/v1/exchange/posts?type=demand", "/api/v1/exchange/posts/41"]) {
      await request(app)
        .get(path)
        .expect(401)
        .expect((response) =>
          expect(response.body).toEqual({
            code: 40105,
            message: "error.auth.token_invalid",
            data: null
          })
        );
    }
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

  it("redacts complete Request addresses on direct API reads for independent unmatched providers", async () => {
    const preciseAddress = "東京都渋谷区道玄坂1-12-1";
    const generalPost: ExchangePostPayload = {
      ...post,
      areaLabel: preciseAddress,
      publisher: null,
      viewer: {
        liked: false,
        canWithdraw: false,
        canClaim: true,
        canViewClaims: false,
        canViewMatching: false,
        claimUnavailableReason: null
      },
      demand: {
        ...post.demand!,
        address: {
          line1: preciseAddress,
          line2: "渋谷マークシティ 12F",
          line3: "受付で田中を呼び出してください",
          line2GenerallyVisible: true,
          line3GenerallyVisible: true,
          disclosure: "general"
        }
      }
    };
    const repository = {
      resolveActor: jest.fn(async (lookup: ExchangeActorLookup) => ({
        ...lookup,
        displayName: "独立サービス提供者",
        avatarUrl: null,
        isTestAccount: true,
        customerMembership: null,
        shopScope:
          lookup.scopeType === "shop" && lookup.scopeId
            ? { shopId: lookup.scopeId, status: "published" }
            : null
      })),
      findPostById: jest.fn(async () => generalPost)
    };
    const realService = new ExchangeService(repository as never, () => now);
    const { app, login } = await createFixture(realService);

    for (const email of ["technician@example.test", "merchant-staff@example.test"]) {
      const token = await login(email);
      const response = await request(app)
        .get("/api/v1/exchange/posts/41")
        .set("Authorization", `Bearer ${token}`)
        .expect(200);
      expect(response.body.data.areaLabel).toBe("東京都渋谷区");
      expect(response.body.data.demand.address).toEqual({
        line1: null,
        line2: null,
        line3: null,
        line2GenerallyVisible: false,
        line3GenerallyVisible: false,
        disclosure: "general"
      });
      expect(JSON.stringify(response.body)).not.toContain("道玄坂1-12-1");
      expect(JSON.stringify(response.body)).not.toContain("渋谷マークシティ");
      expect(JSON.stringify(response.body)).not.toContain("田中");
      expect(JSON.stringify(response.body)).not.toMatch(/phone|email|phoneNumber/i);
    }
  });

  it("validates body and idempotency header, then authorizes the matching subtype", async () => {
    const { app, login, service } = await createFixture();
    const customerToken = await login("customer@example.test");
    const technicianToken = await login("technician@example.test");
    const merchantStaffToken = await login("merchant-staff@example.test");
    const scopedMerchantStaffToken = await login("merchant-staff-scoped-demand@example.test");
    const demandBody = {
      type: "demand",
      serviceMode: "store",
      title: post.title,
      detail: post.detail,
      contentLocale: "ja",
      serviceStartAt: "2026-08-31T09:00:00+09:00",
      serviceEndAt: "2026-08-31T10:00:00+09:00",
      expiresAt: "2026-08-30T23:30:00Z",
      targetProviderCount: 1,
      matchMode: "quick",
      budgetMode: "total",
      budgetMinJpy: 8_000,
      budgetMaxJpy: 12_000,
      addressLine1: post.areaLabel,
      addressLine2: null,
      addressLine3: null,
      addressLine2Public: false,
      addressLine3Public: false,
      publisherIdentityPublic: false
    };

    await request(app)
      .post("/api/v1/exchange/posts")
      .set("Authorization", `Bearer ${customerToken}`)
      .set("Idempotency-Key", "publish-demand-0001")
      .send({ ...demandBody, coverMediaAssetPublicId: "a".repeat(64) })
      .expect(201);
    expect(service.publish).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7 }),
      expect.objectContaining({
        type: "demand",
        coverMediaAssetPublicId: "a".repeat(64),
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
      .set("Authorization", `Bearer ${merchantStaffToken}`)
      .set("Idempotency-Key", "publish-demand-0003")
      .send(demandBody)
      .expect(403);
    await request(app)
      .post("/api/v1/exchange/posts")
      .set("Authorization", `Bearer ${scopedMerchantStaffToken}`)
      .set("Idempotency-Key", "publish-demand-0004")
      .send(demandBody)
      .expect(201);
    await request(app)
      .post("/api/v1/exchange/posts")
      .set("Authorization", `Bearer ${customerToken}`)
      .set("Idempotency-Key", "short")
      .send(demandBody)
      .expect(400);
    expect(service.publish).toHaveBeenCalledTimes(2);
    for (const method of ["patch", "put", "delete"] as const) {
      await request(app)[method]("/api/v1/exchange/posts/41/cover")
        .set("Authorization", `Bearer ${customerToken}`)
        .send({ coverMediaAssetPublicId: "b".repeat(64) })
        .expect(404);
    }
  });

  it("requires a formal service reference before publishing Intelligence", async () => {
    const { app, login, service } = await createFixture();
    const technicianToken = await login("technician@example.test");
    const intelligenceBody = {
      type: "intelligence",
      title: "平日限定ヘッドスパ",
      detail: "正式サービスの空き枠をご案内します。",
      contentLocale: "ja",
      serviceStartAt: "2026-08-31T09:00:00+09:00",
      serviceEndAt: "2026-08-31T10:00:00+09:00",
      expiresAt: "2026-08-31T08:30:00Z",
      campaignPriceJpy: 10_000
    };

    await request(app)
      .post("/api/v1/exchange/posts")
      .set("Authorization", `Bearer ${technicianToken}`)
      .set("Idempotency-Key", "publish-intel-no-service")
      .send(intelligenceBody)
      .expect(422)
      .expect((response) =>
        expect(response.body).toEqual({
          code: 42212,
          message: "error.exchange.intelligence_service_required",
          data: null
        })
      );
    expect(service.publish).not.toHaveBeenCalled();

    await request(app)
      .post("/api/v1/exchange/posts")
      .set("Authorization", `Bearer ${technicianToken}`)
      .set("Idempotency-Key", "publish-intel-service-01")
      .send({ ...intelligenceBody, serviceRef: "technician:701" })
      .expect(201);
    expect(service.publish).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 8, currentIdentityType: "technician" }),
      expect.objectContaining({
        type: "intelligence",
        serviceRef: "technician:701",
        campaignPriceJpy: 10_000
      }),
      "publish-intel-service-01"
    );
  });

  it("exposes a demand publication context only to the exact publish permission", async () => {
    const { app, login, service } = await createFixture();
    const customerToken = await login("customer@example.test");
    const merchantStaffToken = await login("merchant-staff@example.test");
    const scopedMerchantStaffToken = await login("merchant-staff-scoped-demand@example.test");

    const response = await request(app)
      .get("/api/v1/exchange/request-publication-context")
      .set("Authorization", `Bearer ${customerToken}`)
      .expect(200);
    expect(response.body.data).toEqual({
      canPublish: true,
      capacitySource: "customer_membership",
      membershipLevel: "gold",
      maxTargetProviderCount: 5,
      publicationFee: { amountNdp: 1000, currency: "TEST_NDP", ruleSetVersion: 3 }
    });
    expect(JSON.stringify(response.body.data)).not.toMatch(/ruleSetId|ruleId|walletBalance/);
    expect(service.getRequestPublicationContext).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7 })
    );

    await request(app)
      .get("/api/v1/exchange/request-publication-context")
      .set("Authorization", `Bearer ${merchantStaffToken}`)
      .expect(403);
    const scopedMerchantStaffResponse = await request(app)
      .get("/api/v1/exchange/request-publication-context")
      .set("Authorization", `Bearer ${scopedMerchantStaffToken}`)
      .expect(200);
    expect(scopedMerchantStaffResponse.body.data).toEqual({
      canPublish: true,
      capacitySource: "customer_membership",
      membershipLevel: "gold",
      maxTargetProviderCount: 5,
      publicationFee: { amountNdp: 1000, currency: "TEST_NDP", ruleSetVersion: 3 }
    });
  });

  it("exposes comments, like, unlike, share, and withdrawal without deferred routes", async () => {
    const { app, login, service } = await createFixture();
    const token = await login("customer@example.test");
    const auth = { Authorization: `Bearer ${token}`, "Idempotency-Key": "interaction-key-001" };

    const listed = await request(app).get("/api/v1/exchange/posts/41/comments").set(auth).expect(200);
    const created = await request(app)
      .post("/api/v1/exchange/posts/41/comments")
      .set(auth)
      .send({ content: "詳細を教えてください。" })
      .expect(201);
    const liked = await request(app).put("/api/v1/exchange/posts/41/like").set(auth).expect(200);
    const unliked = await request(app).delete("/api/v1/exchange/posts/41/like").set(auth).expect(200);
    const shared = await request(app).post("/api/v1/exchange/posts/41/shares").set(auth).expect(200);
    await request(app).post("/api/v1/exchange/posts/41/withdraw").set(auth).expect(200);

    expect(listed.body.data).toMatchObject({ list: [], total: 0 });
    expect(created.body.data).toMatchObject({ id: 301, postId: 41, content: "詳細を教えてください。", author: { publicId: "NC12345678", identityType: "customer" } });
    expect(liked.body.data).toEqual({ comments: 4, likes: 22, shares: 5 });
    expect(unliked.body.data).toEqual({ comments: 4, likes: 21, shares: 5 });
    expect(shared.body.data).toEqual({ comments: 4, likes: 21, shares: 6 });
    expect(service.comment).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, currentIdentityId: 17 }), 41, { content: "詳細を教えてください。" }, "interaction-key-001");

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
