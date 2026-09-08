import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { AuthTokenService } from "../src/services/auth-token.service";
import { EkycApplicationService } from "../src/services/ekyc-application.service";
import { SensitiveFieldCipherService } from "../src/services/sensitive-field-cipher.service";
const createUser = (permissionCodes: string[]) => ({
  id: 7,
  email: "customer-7@example.test",
  phone: null,
  passwordHash: "unused",
  username: "Customer 7",
  avatarUrl: null,
  isActive: true,
  lastLoginAt: null,
  deletedAt: null,
  identities: [
    {
      id: 70,
      userId: 7,
      type: "customer",
      scopeType: "customer_profile",
      scopeId: 7,
      displayName: "Customer 7",
      isDefault: true,
      isActive: true,
      deletedAt: null
    }
  ],
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

const fixture = (permissions: string[]) => {
  const user = createUser(permissions),
    cipher = new SensitiveFieldCipherService("test-manual-ekyc-sensitive-key-123456");
  const profile = {
    familyName: "山本",
    givenName: "太郎",
    familyNameKana: "ヤマモト",
    givenNameKana: "タロウ",
    birthYear: "1990",
    birthMonth: "2",
    birthDay: "28",
    sex: "male",
    postalCode: "1000001",
    city: "東京都",
    street: "千代田1",
    building: "",
    occupation: "employee",
    otherOccupation: ""
  };
  const row = {
    id: 11,
    userId: 7,
    userPublicId: "u0000000007",
    status: "submitted",
    version: 1,
    profileEncrypted: cipher.seal(JSON.stringify(profile)),
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    reviewedAt: null,
    reviewerUserId: null,
    reviewNote: null,
    rejectionReason: null
  };
  const repository = {
    list: jest.fn(async () => ({ list: [row], total: 1, page: 1, page_size: 20 })),
    find: jest.fn(async () => row),
    create: jest.fn(async () => row),
    decide: jest.fn(async () => row)
  };
  const app = createApp(undefined, {
    testOnlyAllowLegacyAuthAdapters: true,
    authRepository: { findUserById: async () => user },
    authSessionStore: { isAccessTokenBlacklisted: async () => false },
    ekycApplicationService: new EkycApplicationService(repository, cipher)
  } as never);
  const token = new AuthTokenService(env).issueAccessToken({
    id: 7,
    email: user.email,
    currentIdentityId: 70
  }).token;
  return { app, token, repository, profile, row };
};
describe("manual eKYC API", () => {
  it("requires auth and dedicated permissions", async () => {
    const f = fixture([]);
    expect((await request(f.app).get("/api/v1/ekyc-applications/mine")).status).toBe(401);
    expect(
      (await request(f.app).get("/api/v1/ekyc-applications/mine").auth(f.token, { type: "bearer" }))
        .status
    ).toBe(403);
    expect(
      (await request(f.app).get("/api/v1/ops/ekyc-applications").auth(f.token, { type: "bearer" }))
        .status
    ).toBe(403);
  });
  it("lists existing applications without creating and omits PII", async () => {
    const f = fixture(["ekyc-application:own"]);
    const r = await request(f.app)
      .get("/api/v1/ekyc-applications/mine")
      .auth(f.token, { type: "bearer" });
    expect(r.status).toBe(200);
    expect(r.body.data.list[0]).not.toHaveProperty("profile");
    expect(f.repository.create).not.toHaveBeenCalled();
  });
  it("validates complete submission and does not approve", async () => {
    const f = fixture(["ekyc-application:own"]);
    expect(
      (
        await request(f.app)
          .post("/api/v1/ekyc-applications")
          .auth(f.token, { type: "bearer" })
          .send({ profile: { ...f.profile, birthDay: "30" } })
      ).status
    ).toBe(400);
    const r = await request(f.app)
      .post("/api/v1/ekyc-applications")
      .auth(f.token, { type: "bearer" })
      .send({ profile: f.profile });
    expect(r.status).toBe(201);
    expect(r.body.data.status).toBe("submitted");
    expect(f.repository.decide).not.toHaveBeenCalled();
  });
  it("isolates owner details", async () => {
    const f = fixture(["ekyc-application:own"]);
    f.row.userId = 8;
    expect(
      (await request(f.app).get("/api/v1/ekyc-applications/11").auth(f.token, { type: "bearer" }))
        .status
    ).toBe(404);
  });
  it("requires review permission separately from read", async () => {
    const f = fixture(["ops:ekyc-application:read"]);
    expect(
      (
        await request(f.app)
          .get("/api/v1/ops/ekyc-applications/11")
          .auth(f.token, { type: "bearer" })
      ).status
    ).toBe(200);
    expect(
      (
        await request(f.app)
          .post("/api/v1/ops/ekyc-applications/11/approve")
          .auth(f.token, { type: "bearer" })
          .send({
            expectedVersion: 1,
            reviewNote: "Checked external evidence",
            identityConfirmed: true
          })
      ).status
    ).toBe(403);
  });
  it("blocks self review and unconfirmed approval", async () => {
    const f = fixture(["ops:ekyc-application:review"]);
    expect(
      (
        await request(f.app)
          .post("/api/v1/ops/ekyc-applications/11/approve")
          .auth(f.token, { type: "bearer" })
          .send({
            expectedVersion: 1,
            reviewNote: "Checked external evidence",
            identityConfirmed: true
          })
      ).status
    ).toBe(403);
    expect(
      (
        await request(f.app)
          .post("/api/v1/ops/ekyc-applications/11/approve")
          .auth(f.token, { type: "bearer" })
          .send({ expectedVersion: 1, reviewNote: "Checked external evidence" })
      ).status
    ).toBe(400);
  });
});
