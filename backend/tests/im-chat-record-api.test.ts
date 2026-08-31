import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { ERROR_CODES } from "../src/constants/error-codes";
import { AuthTokenService } from "../src/services/auth-token.service";
import { AppError } from "../src/utils/app-error";
import {
  chatRecordCommandBodySchema,
  messageIdsSchema
} from "../src/validators/im-chat-record.validator";

const now = new Date("2026-08-31T08:00:00.000Z");
const publicId = "11111111-1111-4111-8111-111111111111";
const checksum = "a".repeat(64);
const command = {
  idempotencyKey: "22222222-2222-4222-8222-222222222222",
  messageIds: [11, 12],
  sourceConversationId: 91
};
const bundle = {
  id: 501,
  publicId,
  title: "Alice、Bob",
  preview: "Alice: one\nBob: two",
  senderCount: 2,
  itemCount: 2,
  createdAt: now
};
const message = {
  id: 801,
  conversationId: 99,
  senderUserId: 41,
  type: "text",
  content: "Alice、Bob",
  metadata: { needoMessageType: "chat-record", needoMessageExt: { publicId } },
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
const favorite = {
  id: 601,
  bundlePublicId: publicId,
  title: bundle.title,
  preview: bundle.preview,
  senderCount: 2,
  itemCount: 2,
  createdAt: now
};
const item = {
  id: 701,
  position: 1,
  senderDisplayName: "Alice",
  senderAvatarUrl: null,
  messageType: "text",
  content: "one",
  metadata: null,
  sentAt: now
};

const userWithPermissions = (permissionCodes: string[]) => ({
  id: 41,
  email: "chat-record@example.test",
  phone: null,
  passwordHash: "unused",
  username: "Chat record user",
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
      displayName: "Chat record user",
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

const createFixture = (
  permissionCodes = ["message:forward", "message:list", "message:favorite"]
) => {
  const service = {
    createDelivery: jest.fn(async () => ({
      replayed: false,
      bundle,
      message,
      recipients: [{ userId: 99, identityId: 199 }]
    })),
    getBundle: jest.fn(async () => bundle),
    listItems: jest.fn(async () => ({
      list: [item],
      total: 2,
      page: 2,
      pageSize: 1,
      nextCursor: 1
    })),
    resolveAuthorizedMedia: jest.fn(async () => ({
      publicId,
      checksumSha256: checksum,
      mimeType: "image/png",
      size: 15,
      bytes: Buffer.from("protected-media")
    })),
    createFavorite: jest.fn(async () => ({ replayed: false, favorite })),
    listFavorites: jest.fn(async () => ({ list: [favorite], total: 1, page: 1, page_size: 20 })),
    removeFavorite: jest.fn(async () => ({ deleted: true }))
  };
  const realtimeService = {
    deleteMessagesForUser: jest.fn(async () => ({
      conversationId: 91,
      messageIds: [11, 12],
      count: 2,
      deleted: true,
      replayed: false
    })),
    deleteMessageForUser: jest.fn()
  };
  const user = userWithPermissions(permissionCodes);
  const app = createApp(env, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    testOnlyAllowLegacyAuthAdapters: true,
    authRepository: { findUserById: jest.fn(async () => user) },
    authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    imChatRecordService: service,
    realtimeService
  } as never);
  const token = new AuthTokenService(env).issueAccessToken({
    id: 41,
    email: user.email,
    currentIdentityId: 71
  }).token;
  return { app, realtimeService, service, token };
};

describe("chat-record validators", () => {
  it("coerces positive IDs but rejects duplicates, 101 items, and unknown command fields", () => {
    expect(messageIdsSchema.parse(["2", 1])).toEqual([2, 1]);
    expect(() => messageIdsSchema.parse([1, 1])).toThrow("error.im.message_ids_duplicate");
    expect(() =>
      messageIdsSchema.parse(Array.from({ length: 101 }, (_, index) => index + 1))
    ).toThrow();
    expect(() => chatRecordCommandBodySchema.parse({ ...command, actorUserId: 999 })).toThrow();
  });
});

describe("chat-record HTTP API", () => {
  it("requires authentication and each route's explicit RBAC permission", async () => {
    const permitted = createFixture();
    await request(permitted.app)
      .post("/api/v1/im/conversations/99/chat-records")
      .send(command)
      .expect(401);
    const forbidden = createFixture([]);
    await request(forbidden.app)
      .post("/api/v1/im/conversations/99/chat-records")
      .set("Authorization", `Bearer ${forbidden.token}`)
      .send(command)
      .expect(403);
    await request(forbidden.app)
      .get(`/api/v1/im/chat-records/${publicId}`)
      .set("Authorization", `Bearer ${forbidden.token}`)
      .expect(403);
    await request(forbidden.app)
      .post("/api/v1/im/chat-record-favorites")
      .set("Authorization", `Bearer ${forbidden.token}`)
      .send(command)
      .expect(403);
  });

  it("rejects duplicate IDs, 101 IDs, and unknown command fields before the service", async () => {
    const fixture = createFixture();
    for (const body of [
      { ...command, messageIds: [11, 11] },
      { ...command, messageIds: Array.from({ length: 101 }, (_, index) => index + 1) },
      { ...command, actorUserId: 999 }
    ]) {
      await request(fixture.app)
        .post("/api/v1/im/conversations/99/chat-records")
        .set("Authorization", `Bearer ${fixture.token}`)
        .send(body)
        .expect(400);
    }
    expect(fixture.service.createDelivery).not.toHaveBeenCalled();
  });

  it("creates a delivery without serializing recipient or internal bundle IDs", async () => {
    const fixture = createFixture();
    const response = await request(fixture.app)
      .post("/api/v1/im/conversations/99/chat-records")
      .set("Authorization", `Bearer ${fixture.token}`)
      .send(command)
      .expect(201);
    expect(response.body).toMatchObject({
      code: 0,
      message: "success",
      data: {
        replayed: false,
        bundle: { publicId, itemCount: 2 },
        message: { id: 801, conversationId: 99 }
      }
    });
    expect(response.body.data).not.toHaveProperty("recipients");
    expect(response.body.data.bundle).not.toHaveProperty("id");
  });

  it("returns safely equivalent 404 responses for inaccessible bundles and media", async () => {
    const fixture = createFixture();
    fixture.service.getBundle.mockRejectedValueOnce(
      new AppError({
        code: ERROR_CODES.NOT_FOUND,
        message: "error.im.chat_record_not_found",
        statusCode: 404
      })
    );
    await request(fixture.app)
      .get(`/api/v1/im/chat-records/${publicId}`)
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(404);
    fixture.service.resolveAuthorizedMedia.mockRejectedValueOnce(
      new AppError({
        code: ERROR_CODES.NOT_FOUND,
        message: "error.im.chat_record_media_unavailable",
        statusCode: 404
      })
    );
    await request(fixture.app)
      .get(`/api/v1/im/chat-records/${publicId}/media/${checksum}`)
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(404);
  });

  it("returns cursor-paginated items with the standard list envelope", async () => {
    const fixture = createFixture();
    const response = await request(fixture.app)
      .get(`/api/v1/im/chat-records/${publicId}/items?beforePosition=2&pageSize=1`)
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(200);
    expect(response.body.data).toEqual({
      list: [expect.objectContaining({ id: 701, position: 1 })],
      total: 2,
      page: 2,
      page_size: 1,
      nextCursor: 1
    });
  });

  it("streams protected bytes with private immutable validators and no storage descriptor", async () => {
    const fixture = createFixture();
    const response = await request(fixture.app)
      .get(`/api/v1/im/chat-records/${publicId}/media/${checksum}`)
      .set("Authorization", `Bearer ${fixture.token}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(response.headers).toMatchObject({
      "cache-control": "private, max-age=31536000, immutable",
      "content-length": "15",
      "content-type": "image/png",
      etag: `"${checksum}"`
    });
    expect(response.body).toEqual(Buffer.from("protected-media"));
    expect(response.text).toBeUndefined();
  });

  it("creates, replays, lists, and removes favorites while preserving conflicts", async () => {
    const fixture = createFixture();
    const first = await request(fixture.app)
      .post("/api/v1/im/chat-record-favorites")
      .set("Authorization", `Bearer ${fixture.token}`)
      .send(command)
      .expect(201);
    expect(first.body.data).toMatchObject({ replayed: false, favorite: { id: 601 } });
    fixture.service.createFavorite.mockResolvedValueOnce({ replayed: true, favorite });
    const replay = await request(fixture.app)
      .post("/api/v1/im/chat-record-favorites")
      .set("Authorization", `Bearer ${fixture.token}`)
      .send(command)
      .expect(201);
    expect(replay.body.data.replayed).toBe(true);
    fixture.service.createFavorite.mockRejectedValueOnce(
      new AppError({
        code: ERROR_CODES.IDEMPOTENCY_KEY_REUSED,
        message: "error.idempotency_key_reused",
        statusCode: 409
      })
    );
    await request(fixture.app)
      .post("/api/v1/im/chat-record-favorites")
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({ ...command, messageIds: [13] })
      .expect(409);
    const list = await request(fixture.app)
      .get("/api/v1/im/chat-record-favorites?page=1&pageSize=20")
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(200);
    expect(list.body.data).toEqual({
      list: [expect.any(Object)],
      total: 1,
      page: 1,
      page_size: 20
    });
    await request(fixture.app)
      .delete("/api/v1/im/chat-record-favorites/601")
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(200, { code: 0, message: "success", data: { deleted: true } });
  });

  it("returns no partial success when the atomic batch service fails", async () => {
    const fixture = createFixture();
    fixture.realtimeService.deleteMessagesForUser.mockRejectedValueOnce(new Error("rollback"));
    await request(fixture.app)
      .post("/api/v1/im/conversations/91/messages/delete-for-me")
      .set("Authorization", `Bearer ${fixture.token}`)
      .send({ messageIds: [11, 12], idempotencyKey: command.idempotencyKey })
      .expect(500);
    expect(fixture.realtimeService.deleteMessagesForUser).toHaveBeenCalledTimes(1);
  });
});
