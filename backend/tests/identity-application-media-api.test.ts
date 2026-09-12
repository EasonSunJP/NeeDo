import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { AuthTokenService } from "../src/services/auth-token.service";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const createFixture = () => {
  const user = {
    id: 7,
    email: "customer@example.test",
    phone: null,
    passwordHash: "unused",
    username: "Customer",
    avatarUrl: null,
    isActive: true,
    lastLoginAt: null,
    deletedAt: null,
    identities: [
      {
        id: 70,
        userId: 7,
        type: "customer",
        scopeType: "global",
        scopeId: null,
        displayName: "Customer",
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
          rolePermissions: ["identity-application:own"].map((code) => ({
            deletedAt: null,
            permission: { code, type: "api", deletedAt: null }
          }))
        }
      }
    ]
  };
  const identityApplicationMediaService = {
    upload: jest.fn(async () => ({
      id: 101,
      applicationId: 41,
      purpose: "showcase",
      mimeType: "image/png",
      applicationVersion: 3,
      createdAt: new Date("2026-08-26T05:00:00.000Z")
    })),
    uploadBundle: jest.fn(async () => ({
      original: {
        id: 101,
        applicationId: 41,
        purpose: "portrait",
        mimeType: "image/png",
        applicationVersion: 3,
        createdAt: new Date("2026-08-26T05:00:00.000Z"),
        variant: "original"
      },
      preview: {
        id: 102,
        applicationId: 41,
        purpose: "portrait",
        mimeType: "image/png",
        applicationVersion: 3,
        createdAt: new Date("2026-08-26T05:00:00.000Z"),
        variant: "preview"
      },
      applicationVersion: 3
    })),
    read: jest.fn(async () => ({ buffer: png, mimeType: "image/png" }))
  };
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    testOnlyAllowLegacyAuthAdapters: true,
    authRepository: { findUserById: jest.fn(async () => user) },
    authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    identityApplicationMediaService
  } as never);
  const token = new AuthTokenService(env).issueAccessToken({
    id: 7,
    email: user.email,
    currentIdentityId: 70
  }).token;
  return { app, token, identityApplicationMediaService };
};

describe("identity application media HTTP API", () => {
  it("keeps the raw endpoint for non-sensitive showcase uploads", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .post("/api/v1/identity-applications/41/media?purpose=showcase&expected_version=2")
      .set("Authorization", `Bearer ${fixture.token}`)
      .set("Content-Type", "image/png")
      .send(png)
      .expect(201)
      .expect((response) =>
        expect(response.body.data).toMatchObject({
          id: 101,
          applicationVersion: 3,
          purpose: "showcase"
        })
      );
    expect(fixture.identityApplicationMediaService.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        applicationId: 41,
        expectedVersion: 2,
        purpose: "showcase",
        mimeType: "image/png",
        bytes: png
      })
    );
  });

  it("accepts exactly one original and one client-generated preview", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .post("/api/v1/identity-applications/41/media-bundle?purpose=portrait&expected_version=2")
      .set("Authorization", `Bearer ${fixture.token}`)
      .attach("original", png, { filename: "portrait.png", contentType: "image/png" })
      .attach("preview", png, { filename: "portrait-preview.png", contentType: "image/png" })
      .expect(201)
      .expect((response) => expect(response.body.data).toMatchObject({
        original: { id: 101 },
        preview: { id: 102 },
        applicationVersion: 3
      }));
    expect(fixture.identityApplicationMediaService.uploadBundle).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        applicationId: 41,
        expectedVersion: 2,
        purpose: "portrait",
        original: expect.objectContaining({ bytes: png, mimeType: "image/png" }),
        preview: expect.objectContaining({ bytes: png, mimeType: "image/png" })
      })
    );
  });

  it("rejects incomplete, unexpected, and oversized preview bundles", async () => {
    const fixture = createFixture();
    const url = "/api/v1/identity-applications/41/media-bundle?purpose=portrait&expected_version=2";
    await request(fixture.app)
      .post(url)
      .set("Authorization", `Bearer ${fixture.token}`)
      .attach("original", png, { filename: "portrait.png", contentType: "image/png" })
      .expect(400);
    await request(fixture.app)
      .post(url)
      .set("Authorization", `Bearer ${fixture.token}`)
      .attach("original", png, { filename: "portrait.png", contentType: "image/png" })
      .attach("unexpected", png, { filename: "preview.png", contentType: "image/png" })
      .expect(400);
    await request(fixture.app)
      .post(url)
      .set("Authorization", `Bearer ${fixture.token}`)
      .attach("original", png, { filename: "portrait.png", contentType: "image/png" })
      .attach("preview", Buffer.alloc(2 * 1024 * 1024 + 1), {
        filename: "preview.png",
        contentType: "image/png"
      })
      .expect(413);
    expect(fixture.identityApplicationMediaService.uploadBundle).not.toHaveBeenCalled();
  });

  it("streams authorized private media without exposing a public file path", async () => {
    const fixture = createFixture();
    const response = await request(fixture.app)
      .get("/api/v1/identity-applications/41/media/101")
      .set("Authorization", `Bearer ${fixture.token}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(response.headers["content-type"]).toContain("image/png");
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.body).toEqual(png);
  });

  it("rejects unsupported MIME types and invalid purposes at the route boundary", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .post("/api/v1/identity-applications/41/media?purpose=showcase&expected_version=2")
      .set("Authorization", `Bearer ${fixture.token}`)
      .set("Content-Type", "application/octet-stream")
      .send(png)
      .expect(415);
    await request(fixture.app)
      .post("/api/v1/identity-applications/41/media?purpose=unknown&expected_version=2")
      .set("Authorization", `Bearer ${fixture.token}`)
      .set("Content-Type", "image/png")
      .send(png)
      .expect(400);
  });
});
