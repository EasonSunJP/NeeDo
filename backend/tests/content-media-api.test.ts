import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { AuthTokenService } from "../src/services/auth-token.service";
import { ContentMediaFileStorage } from "../src/services/content-media.storage";
import {
  ContentMediaService,
  type ContentMediaLockedRepositoryPort,
  type ContentMediaRepositoryPort
} from "../src/services/content-media.service";
import { createValidExcessivePixelPng, validTwoFrameApng } from "./fixtures/content-images";

const validPng = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("needo-public-content")
]);

const createFixture = async (hasPermission = true, useRealService = false) => {
  const directory = await mkdtemp(join(tmpdir(), "needo-content-media-api-"));
  const permissions = hasPermission ? ["button:backoffice-content-media-upload"] : [];
  const user = {
    id: 7,
    email: "operator@example.test",
    phone: null,
    passwordHash: "unused",
    username: "Operator",
    avatarUrl: null,
    isActive: true,
    lastLoginAt: null,
    deletedAt: null,
    identities: [
      {
        id: 70,
        userId: 7,
        type: "admin",
        scopeType: "global",
        scopeId: null,
        displayName: "Operator",
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
          code: "operator",
          deletedAt: null,
          rolePermissions: permissions.map((code) => ({
            deletedAt: null,
            permission: { code, type: "button", deletedAt: null }
          }))
        }
      }
    ]
  };
  const mockedContentMediaService = {
    upload: jest.fn(async () => ({
      publicId: "a".repeat(64),
      mediaAssetId: 101,
      url: `/media/content/${"a".repeat(64)}.png`,
      mimeType: "image/png",
      width: null,
      height: null,
      checksumSha256: "a".repeat(64)
    }))
  };
  const contentMediaRepository: ContentMediaRepositoryPort = {
    async withChecksumLock<T>(
      _checksumSha256: string,
      operation: (locked: ContentMediaLockedRepositoryPort) => Promise<T>
    ): Promise<T> {
      return operation({
        create: jest.fn(async (input) => ({
          publicId: input.checksumSha256,
          mediaAssetId: 101,
          url: input.url,
          mimeType: input.mimeType,
          width: null,
          height: null,
          checksumSha256: input.checksumSha256
        }))
      });
    }
  };
  const contentMediaService = useRealService
    ? new ContentMediaService(contentMediaRepository, new ContentMediaFileStorage(directory))
    : mockedContentMediaService;
  const app = createApp({ ...env, CONTENT_MEDIA_STORAGE_DIR: directory }, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    testOnlyAllowLegacyAuthAdapters: true,
    authRepository: { findUserById: jest.fn(async () => user) },
    authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    contentMediaService
  } as never);
  const token = new AuthTokenService(env).issueAccessToken({
    id: 7,
    email: user.email,
    currentIdentityId: 70
  }).token;
  return { app, directory, token, contentMediaService };
};

describe("content media HTTP API", () => {
  it("fails app composition when public and protected media roots overlap", async () => {
    const fixture = await createFixture();
    expect(() =>
      createApp({
        ...env,
        CONTENT_MEDIA_STORAGE_DIR: fixture.directory,
        IDENTITY_APPLICATION_MEDIA_STORAGE_DIR: fixture.directory
      })
    ).toThrow(/must not overlap/u);
  });

  it("authenticates and authorizes before parsing raw upload bytes", async () => {
    const fixture = await createFixture(false);
    const response = await request(fixture.app)
      .post("/api/v1/backoffice/content/media?alt_text=Announcement")
      .set("Authorization", `Bearer ${fixture.token}`)
      .set("Content-Type", "image/png")
      .send(validPng);

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("error.forbidden");
    expect(fixture.contentMediaService.upload).not.toHaveBeenCalled();
  });

  it("validates query input before parsing raw upload bytes with the content error mapper", async () => {
    const fixture = await createFixture();
    const response = await request(fixture.app)
      .post("/api/v1/backoffice/content/media?alt_text=")
      .set("Authorization", `Bearer ${fixture.token}`)
      .set("Content-Type", "image/png")
      .send(validPng);

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("error.content.media_invalid");
    expect(fixture.contentMediaService.upload).not.toHaveBeenCalled();
  });

  it("uploads raw image bytes and returns the private database id only to backoffice", async () => {
    const fixture = await createFixture();
    await request(fixture.app)
      .post("/api/v1/backoffice/content/media?alt_text=NeeDo%20announcement")
      .set("Authorization", `Bearer ${fixture.token}`)
      .set("Content-Type", "image/png")
      .set("User-Agent", "content-media-api-test")
      .send(validPng)
      .expect(201)
      .expect((response) =>
        expect(response.body.data).toEqual({
          publicId: "a".repeat(64),
          mediaAssetId: 101,
          url: `/media/content/${"a".repeat(64)}.png`,
          mimeType: "image/png",
          width: null,
          height: null,
          checksumSha256: "a".repeat(64)
        })
      );
    expect(fixture.contentMediaService.upload).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 7 }),
      expect.objectContaining({ ip: expect.any(String), userAgent: "content-media-api-test" }),
      expect.objectContaining({
        bytes: validPng,
        mimeType: "image/png",
        altText: "NeeDo announcement",
        now: expect.any(Date)
      })
    );
  });

  it("accepts APNG and valid large-dimension images under the existing content route contract", async () => {
    const fixture = await createFixture(true, true);
    const validLargePng = await createValidExcessivePixelPng();

    expect(validLargePng.length).toBeLessThanOrEqual(8 * 1024 * 1024);
    await request(fixture.app)
      .post("/api/v1/backoffice/content/media")
      .set("Authorization", `Bearer ${fixture.token}`)
      .set("Content-Type", "image/png")
      .send(validTwoFrameApng)
      .expect(201);
    await request(fixture.app)
      .post("/api/v1/backoffice/content/media")
      .set("Authorization", `Bearer ${fixture.token}`)
      .set("Content-Type", "image/png")
      .send(validLargePng)
      .expect(201);
  });

  it("rejects empty, unsupported, and oversized uploads with stable content errors", async () => {
    const fixture = await createFixture();
    await request(fixture.app)
      .post("/api/v1/backoffice/content/media")
      .set("Authorization", `Bearer ${fixture.token}`)
      .set("Content-Type", "application/octet-stream")
      .send(validPng)
      .expect(415)
      .expect((response) => expect(response.body.message).toBe("error.content.media_invalid"));
    await request(fixture.app)
      .post("/api/v1/backoffice/content/media")
      .set("Authorization", `Bearer ${fixture.token}`)
      .set("Content-Type", "image/png")
      .send(Buffer.alloc(0))
      .expect(400)
      .expect((response) => expect(response.body.message).toBe("error.content.media_invalid"));
    await request(fixture.app)
      .post("/api/v1/backoffice/content/media")
      .set("Authorization", `Bearer ${fixture.token}`)
      .set("Content-Type", "image/png")
      .send(Buffer.alloc(8 * 1024 * 1024 + 1))
      .expect(413)
      .expect((response) => expect(response.body.message).toBe("error.content.media_too_large"));
  });

  it.each([
    ["unsupported content encoding", "compress", validPng, 415],
    ["invalid compressed bytes", "gzip", validPng, 400]
  ])("normalizes %s as invalid content media", async (_name, encoding, bytes, status) => {
    const fixture = await createFixture();
    await request(fixture.app)
      .post("/api/v1/backoffice/content/media")
      .set("Authorization", `Bearer ${fixture.token}`)
      .set("Content-Type", "image/png")
      .set("Content-Encoding", encoding)
      .send(bytes)
      .expect(status)
      .expect((response) => expect(response.body.message).toBe("error.content.media_invalid"));
  });

  it("delivers only strict public hash paths with immutable headers", async () => {
    const fixture = await createFixture();
    const checksum = "e".repeat(64);
    await writeFile(join(fixture.directory, `${checksum}.png`), validPng);

    const response = await request(fixture.app)
      .get(`/media/content/${checksum}.png`)
      .buffer(true)
      .parse((incoming, callback) => {
        const chunks: Buffer[] = [];
        incoming.on("data", (chunk: Buffer) => chunks.push(chunk));
        incoming.on("end", () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(response.body).toEqual(validPng);
    expect(response.headers["content-type"]).toContain("image/png");
    expect(response.headers["content-disposition"]).toBe("inline");
    expect(response.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    await request(fixture.app).get(`/media/content/${checksum}.png/extra`).expect(404);
    await request(fixture.app).get(`/media/content/${checksum.toUpperCase()}.png`).expect(404);
    await request(fixture.app).get(`/media/content/${checksum}.gif`).expect(404);
    await request(fixture.app).get(`/media/content/%2e%2e/${checksum}.png`).expect(404);
  });

  it("returns the normal missing-resource response for an absent strict asset", async () => {
    const fixture = await createFixture();
    const response = await request(fixture.app)
      .get(`/media/content/${"f".repeat(64)}.webp`)
      .expect(404);
    expect(response.body.message).toBe("error.not_found");
  });
});
