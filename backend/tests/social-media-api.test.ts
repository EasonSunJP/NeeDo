import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { AuthTokenService } from "../src/services/auth-token.service";
import { ContentMediaFileStorage } from "../src/services/content-media.storage";
import { SocialMediaService } from "../src/services/social-media.service";

const validPng = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("needo-social-media-api")
]);

const createFixture = async (hasPermission = true, useRealService = false) => {
  const directory = await mkdtemp(join(tmpdir(), "needo-social-media-api-"));
  const permissions = hasPermission ? ["social-post:create"] : [];
  const user = {
    id: 41,
    email: "social@example.test",
    phone: null,
    passwordHash: "unused",
    username: "Social user",
    avatarUrl: null,
    isActive: true,
    lastLoginAt: null,
    deletedAt: null,
    identities: [
      {
        id: 410,
        userId: 41,
        type: "customer",
        scopeType: "self",
        scopeId: 41,
        displayName: "Social user",
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
          rolePermissions: permissions.map((code) => ({
            deletedAt: null,
            permission: { code, type: "api", deletedAt: null }
          }))
        }
      }
    ]
  };
  const repository = {
    createUpload: jest.fn(async (input) => ({
      publicId: input.checksumSha256,
      url: `/media/content/${input.fileKey}`,
      mimeType: input.mimeType,
      fileSize: input.fileSize
    }))
  };
  const service = useRealService
    ? new SocialMediaService(repository, new ContentMediaFileStorage(directory))
    : {
        upload: jest.fn(async () => ({
          publicId: "a".repeat(64),
          url: `/media/content/${"a".repeat(64)}.png`,
          mimeType: "image/png" as const,
          fileSize: validPng.length
        }))
      };
  const app = createApp(
    { ...env, CONTENT_MEDIA_STORAGE_DIR: directory },
    {
      redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
      testOnlyAllowLegacyAuthAdapters: true,
      authRepository: { findUserById: jest.fn(async () => user) },
      authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
      otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
      socialMediaService: service
    } as never
  );
  const token = new AuthTokenService(env).issueAccessToken({
    id: 41,
    email: user.email,
    currentIdentityId: 410
  }).token;
  return { app, directory, service, token };
};

describe("Social media HTTP API", () => {
  it("requires authentication and social-post:create before parsing bytes", async () => {
    const unauthenticated = await createFixture();
    await request(unauthenticated.app)
      .post("/api/v1/social/media?fileName=moment.png")
      .set("Content-Type", "image/png")
      .send(validPng)
      .expect(401);
    await rm(unauthenticated.directory, { recursive: true, force: true });

    const forbidden = await createFixture(false);
    await request(forbidden.app)
      .post("/api/v1/social/media?fileName=moment.png")
      .set("Authorization", `Bearer ${forbidden.token}`)
      .set("Content-Type", "image/png")
      .send(validPng)
      .expect(403)
      .expect((response) => expect(response.body.message).toBe("error.forbidden"));
    expect(forbidden.service.upload).not.toHaveBeenCalled();
    await rm(forbidden.directory, { recursive: true, force: true });
  });

  it("uploads raw image bytes with a strict filename query", async () => {
    const fixture = await createFixture();
    await request(fixture.app)
      .post("/api/v1/social/media?fileName=moment.png")
      .set("Authorization", `Bearer ${fixture.token}`)
      .set("Content-Type", "image/png")
      .set("User-Agent", "social-media-api-test")
      .send(validPng)
      .expect(201)
      .expect((response) =>
        expect(response.body.data).toEqual({
          publicId: "a".repeat(64),
          url: `/media/content/${"a".repeat(64)}.png`,
          mimeType: "image/png",
          fileSize: validPng.length
        })
      );

    expect(fixture.service.upload).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 41 }),
      expect.objectContaining({ ip: expect.any(String), userAgent: "social-media-api-test" }),
      expect.objectContaining({
        bytes: validPng,
        fileName: "moment.png",
        mimeType: "image/png",
        now: expect.any(Date)
      })
    );
    await rm(fixture.directory, { recursive: true, force: true });
  });

  it("rejects invalid query, unsupported MIME, spoofed bytes, and oversized files", async () => {
    const fixture = await createFixture(true, true);
    const requests = [
      request(fixture.app)
        .post("/api/v1/social/media?fileName=")
        .set("Authorization", `Bearer ${fixture.token}`)
        .set("Content-Type", "image/png")
        .send(validPng)
        .expect(400),
      request(fixture.app)
        .post("/api/v1/social/media?fileName=moment.gif")
        .set("Authorization", `Bearer ${fixture.token}`)
        .set("Content-Type", "image/gif")
        .send(validPng)
        .expect(415),
      request(fixture.app)
        .post("/api/v1/social/media?fileName=moment.png")
        .set("Authorization", `Bearer ${fixture.token}`)
        .set("Content-Type", "image/png")
        .send(Buffer.from("not-a-png"))
        .expect(400),
      request(fixture.app)
        .post("/api/v1/social/media?fileName=moment.png")
        .set("Authorization", `Bearer ${fixture.token}`)
        .set("Content-Type", "image/png")
        .send(Buffer.alloc(8 * 1024 * 1024 + 1))
        .expect(413)
    ];

    const responses = await Promise.all(requests);
    expect(responses.map((response) => response.body.message)).toEqual([
      "error.social.media_invalid",
      "error.social.media_invalid",
      "error.social.media_invalid",
      "error.social.media_too_large"
    ]);
    await rm(fixture.directory, { recursive: true, force: true });
  });
});
