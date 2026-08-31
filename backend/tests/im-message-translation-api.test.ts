import request from "supertest";
import { createOpenApiDocument } from "../src/api/openapi";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { ERROR_CODES } from "../src/constants/error-codes";
import { AuthTokenService } from "../src/services/auth-token.service";
import { AppError } from "../src/utils/app-error";

const createFixture = (
  permissionCodes = ["message:translate"],
  translateVisibleMessages = jest.fn()
) => {
  const user = {
    id: 41,
    email: "translate@example.test",
    phone: null,
    passwordHash: "unused",
    username: "Translate user",
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
        displayName: "Translate user",
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
  };
  const app = createApp(env, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    testOnlyAllowLegacyAuthAdapters: true,
    authRepository: { findUserById: jest.fn(async () => user) },
    authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    imMessageTranslationService: { translateVisibleMessages }
  } as never);
  const token = new AuthTokenService(env).issueAccessToken({
    id: 41,
    email: user.email,
    currentIdentityId: 71
  }).token;
  return { app, token, translateVisibleMessages };
};

const translate = (fixture: ReturnType<typeof createFixture>, body: Record<string, unknown>) =>
  request(fixture.app)
    .post("/api/v1/im/conversations/91/messages/translations")
    .set("Authorization", `Bearer ${fixture.token}`)
    .send(body);

describe("POST IM message translations", () => {
  it("returns the standard success envelope and passes no client raw text", async () => {
    const translateVisibleMessages = jest.fn(async () => [
      { messageId: 1, status: "translated", translatedContent: "こんにちは" },
      { messageId: 2, status: "ineligible" }
    ]);
    const fixture = createFixture(["message:translate"], translateVisibleMessages);

    const response = await translate(fixture, { messageIds: [1, 2], targetLanguage: "ja" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      code: 0,
      message: "success",
      data: [
        { messageId: 1, status: "translated", translatedContent: "こんにちは" },
        { messageId: 2, status: "ineligible" }
      ]
    });
    expect(translateVisibleMessages).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 41, currentIdentityId: 71 }),
      { conversationId: 91, messageIds: [1, 2], targetLanguage: "ja" }
    );
  });

  it.each([
    ["empty IDs", { messageIds: [], targetLanguage: "ja" }],
    ["duplicate IDs", { messageIds: [1, 1], targetLanguage: "ja" }],
    [
      "too many IDs",
      { messageIds: Array.from({ length: 51 }, (_, index) => index + 1), targetLanguage: "ja" }
    ],
    ["unknown field", { messageIds: [1], targetLanguage: "ja", text: "must not be accepted" }],
    ["unsupported language", { messageIds: [1], targetLanguage: "fr" }]
  ])("strictly rejects %s", async (_label, body) => {
    const fixture = createFixture();
    const response = await translate(fixture, body);
    expect(response.status).toBe(400);
    expect(fixture.translateVisibleMessages).not.toHaveBeenCalled();
  });

  it("requires the exact message:translate permission", async () => {
    const fixture = createFixture(["message:list"]);
    const response = await translate(fixture, { messageIds: [1], targetLanguage: "ja" });
    expect(response.status).toBe(403);
    expect(fixture.translateVisibleMessages).not.toHaveBeenCalled();
  });

  it.each([
    [404, ERROR_CODES.NOT_FOUND, "error.im.translation_message_not_found"],
    [409, ERROR_CODES.IM_TRANSLATION_CACHE_CONFLICT, "error.im.translation_cache_conflict"],
    [429, ERROR_CODES.IM_TRANSLATION_RATE_LIMITED, "error.im.translation_rate_limited"],
    [456, ERROR_CODES.IM_TRANSLATION_QUOTA_EXCEEDED, "error.im.translation_quota_exceeded"]
  ])(
    "preserves mapped AppError status %i and standard error envelope",
    async (statusCode, code, message) => {
      const fixture = createFixture(
        ["message:translate"],
        jest.fn(async () => {
          throw new AppError({ code, message, statusCode });
        })
      );
      const response = await translate(fixture, { messageIds: [1], targetLanguage: "ja" });
      expect(response.status).toBe(statusCode);
      expect(response.body).toEqual({ code, message, data: null });
    }
  );
});

describe("IM translation OpenAPI", () => {
  it("documents the protected strict contract and mapped responses", () => {
    const document = createOpenApiDocument(env) as {
      paths: Record<string, unknown>;
      components: { schemas: Record<string, unknown> };
    };
    const path = document.paths[
      "/api/v1/im/conversations/{conversationId}/messages/translations"
    ] as {
      post: {
        security: unknown;
        "x-permission": unknown;
        requestBody: { content: Record<string, { schema: unknown }> };
        responses: Record<string, unknown>;
      };
    };
    expect(path.post.security).toEqual([{ bearerAuth: [] }]);
    expect(path.post["x-permission"]).toBe("message:translate");
    expect(path.post.requestBody.content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/ImMessageTranslationRequest"
    });
    expect(Object.keys(path.post.responses).sort()).toEqual([
      "200",
      "400",
      "401",
      "403",
      "404",
      "409",
      "429",
      "456",
      "503"
    ]);
    expect(document.components.schemas.ImMessageTranslationRequest).toMatchObject({
      additionalProperties: false,
      required: ["messageIds", "targetLanguage"]
    });
  });
});
