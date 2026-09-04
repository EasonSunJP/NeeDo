import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { createOpenApiDocument } from "../src/api/openapi";
import { AuthTokenService } from "../src/services/auth-token.service";
import {
  contactCardCandidateListQuerySchema,
  contactCardIdempotencyKeySchema,
  contactCardSendBodySchema
} from "../src/validators/realtime.validator";

const now = new Date("2026-09-01T03:00:00.000Z");
const targetUserId = "u0000000052";
const idempotencyKey = "contact-card-send-0001";
const candidate = {
  targetUserId,
  needoId: targetUserId,
  nickname: "佐藤花子",
  avatarUrl: null,
  relationship: "friend" as const
};
const message = {
  id: 801,
  conversationId: 91,
  senderUserId: 41,
  type: "text",
  content: "佐藤花子",
  metadata: { snapshotVersion: 2, type: "contact-card" },
  reactions: [],
  expiresAt: null,
  createdAt: now,
  recallDeadlineAt: new Date(now.getTime() + 180_000),
  recalledAt: null,
  recallMode: null,
  contentPurgedAt: null,
  privacyPolicyVersionAtSend: null,
  lifecycleVersion: 1,
  reactionVersion: 0,
  availableRecallModes: ["standard"]
};

const createUser = (permissionCodes: string[]) => ({
  id: 41,
  email: "contact-card@example.test",
  phone: null,
  passwordHash: "unused",
  username: "Contact card user",
  avatarUrl: null,
  isActive: true,
  lastLoginAt: null,
  deletedAt: null,
  identities: [
    {
      id: 71,
      userId: 41,
      type: "customer",
      scopeType: "self",
      scopeId: 41,
      displayName: "Contact card user",
      isDefault: true,
      isActive: true,
      deletedAt: null
    }
  ],
  identityApplications: [],
  userRoles: [
    {
      deletedAt: null,
      role: {
        code: "customer",
        deletedAt: null,
        rolePermissions: permissionCodes.map((code) => ({
          deletedAt: null,
          permission: { code, type: "api", deletedAt: null }
        }))
      }
    }
  ]
});

const createFixture = (permissionCodes = ["message:create"]) => {
  const service = {
    listContactCardCandidates: jest.fn(async () => ({
      list: [candidate],
      total: 1,
      page: 2,
      page_size: 10
    })),
    sendContactCard: jest.fn(async () => ({ message, replayed: false }))
  };
  const user = createUser(permissionCodes);
  const app = createApp(env, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    testOnlyAllowLegacyAuthAdapters: true,
    authRepository: { findUserById: jest.fn(async () => user) },
    authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    realtimeService: service
  } as never);
  const token = new AuthTokenService(env).issueAccessToken({
    id: 41,
    email: user.email,
    currentIdentityId: 71
  }).token;

  return { app, service, token };
};

describe("formal contact-card HTTP contract", () => {
  it("strictly validates bounded candidate queries and server-authoritative send commands", () => {
    expect(
      contactCardCandidateListQuerySchema.parse({ page: "2", pageSize: "10", query: " 花子 " })
    ).toEqual({ page: 2, pageSize: 10, query: "花子" });
    expect(contactCardSendBodySchema.parse({ targetUserId })).toEqual({ targetUserId });
    expect(contactCardIdempotencyKeySchema.parse(idempotencyKey)).toBe(idempotencyKey);

    for (const input of [
      { targetUserId, nickname: "伪造昵称" },
      { targetUserId: "52" },
      { targetUserId: "s0000000052" }
    ]) {
      expect(() => contactCardSendBodySchema.parse(input)).toThrow();
    }
    expect(() => contactCardCandidateListQuerySchema.parse({ pageSize: 101 })).toThrow();
    expect(() => contactCardCandidateListQuerySchema.parse({ query: "x".repeat(101) })).toThrow();
    expect(() => contactCardIdempotencyKeySchema.parse("short")).toThrow();
  });

  it("requires authentication and message:create permission on both endpoints", async () => {
    const permitted = createFixture();
    await request(permitted.app)
      .get("/api/v1/im/conversations/91/contact-card-candidates")
      .expect(401);
    await request(permitted.app)
      .post("/api/v1/im/conversations/91/contact-cards")
      .set("Idempotency-Key", idempotencyKey)
      .send({ targetUserId })
      .expect(401);

    const forbidden = createFixture([]);
    await request(forbidden.app)
      .get("/api/v1/im/conversations/91/contact-card-candidates")
      .set("Authorization", `Bearer ${forbidden.token}`)
      .expect(403);
    await request(forbidden.app)
      .post("/api/v1/im/conversations/91/contact-cards")
      .set("Authorization", `Bearer ${forbidden.token}`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ targetUserId })
      .expect(403);
  });

  it("passes only validated public IDs and idempotency keys to the formal service", async () => {
    const fixture = createFixture();
    const authorization = { Authorization: `Bearer ${fixture.token}` };

    const candidates = await request(fixture.app)
      .get(
        "/api/v1/im/conversations/91/contact-card-candidates?page=2&pageSize=10&query=%E8%8A%B1%E5%AD%90"
      )
      .set(authorization)
      .expect(200);
    expect(candidates.body.data).toEqual({
      list: [candidate],
      total: 1,
      page: 2,
      page_size: 10
    });
    expect(fixture.service.listContactCardCandidates).toHaveBeenCalledWith(expect.anything(), 91, {
      page: 2,
      pageSize: 10,
      query: "花子"
    });

    const sent = await request(fixture.app)
      .post("/api/v1/im/conversations/91/contact-cards")
      .set(authorization)
      .set("Idempotency-Key", idempotencyKey)
      .send({ targetUserId })
      .expect(201);
    expect(sent.body.data).toEqual({
      message: expect.objectContaining({ id: 801, conversationId: 91 }),
      replayed: false
    });
    expect(fixture.service.sendContactCard).toHaveBeenCalledWith(
      expect.anything(),
      91,
      targetUserId,
      idempotencyKey
    );
  });

  it("rejects missing headers, unsafe IDs, and extra client-authored card fields before the service", async () => {
    const fixture = createFixture();
    const path = "/api/v1/im/conversations/91/contact-cards";
    const authorization = { Authorization: `Bearer ${fixture.token}` };

    await request(fixture.app).post(path).set(authorization).send({ targetUserId }).expect(400);
    await request(fixture.app)
      .post(path)
      .set(authorization)
      .set("Idempotency-Key", idempotencyKey)
      .send({ targetUserId, nickname: "客户端伪造" })
      .expect(400);
    await request(fixture.app)
      .post("/api/v1/im/conversations/01/contact-cards")
      .set(authorization)
      .set("Idempotency-Key", idempotencyKey)
      .send({ targetUserId })
      .expect(400);

    expect(fixture.service.sendContactCard).not.toHaveBeenCalled();
  });

  it("documents bounded pagination, exact response projection, and required idempotency", () => {
    const document = createOpenApiDocument(env) as {
      paths: Record<string, Record<string, unknown>>;
      components: { schemas: Record<string, unknown> };
    };
    const candidatePath =
      document.paths["/api/v1/im/conversations/{conversationId}/contact-card-candidates"];
    const sendPath = document.paths["/api/v1/im/conversations/{conversationId}/contact-cards"];

    expect(candidatePath).toBeDefined();
    expect(sendPath).toBeDefined();
    expect(JSON.stringify(candidatePath)).toContain("ContactCardCandidatePage");
    expect(JSON.stringify(sendPath)).toContain("Idempotency-Key");
    expect(JSON.stringify(sendPath)).toContain("ContactCardSendRequest");
    expect(document.components.schemas.ContactCardCandidate).toEqual(
      expect.objectContaining({ additionalProperties: false })
    );
    expect(document.components.schemas.ContactCardSendRequest).toEqual(
      expect.objectContaining({
        additionalProperties: false,
        required: ["targetUserId"]
      })
    );
  });
});
