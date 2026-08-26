import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { AuthTokenService } from "../src/services/auth-token.service";

const reviewRecord = {
  applicationId: 41,
  applicantUserId: 7,
  status: "submitted",
  version: 3,
  submittedSnapshotHash: "a".repeat(64),
  submittedAt: new Date("2026-08-15T03:00:00.000Z"),
  createdAt: new Date("2026-08-14T03:00:00.000Z"),
  applicantKind: "corporate",
  corporateLegalName: "株式会社ニード",
  corporateLegalNameKana: "カブシキガイシャニード",
  representativeName: "山本太郎",
  representativeNameKana: "ヤマモトタロウ",
  shopName: "NeeDo 银座店",
  businessAddress: "東京都中央区銀座3-4-12",
  contactPhone: "03-1234-5678",
  responsiblePersonName: "山本太郎",
  showcaseDraft: { city: "東京都中央区" },
  bankAccount: {
    id: 81,
    bankCode: "0001",
    bankName: "みずほ銀行",
    branchCode: "001",
    branchName: "銀座支店",
    accountType: "ordinary",
    accountNumberMasked: "•••4567",
    accountHolderMasked: "カ•••••••••ド",
    verificationSource: "corporate_registration",
    verificationStatus: "verified",
    holderMatched: true,
    verifiedAt: new Date("2026-08-15T02:00:00.000Z")
  },
  eKycVerified: false,
  contractAcceptance: {
    id: 91,
    contractType: "merchant",
    contractVersion: "merchant-ja-2026-08",
    contentHash: "b".repeat(64),
    acceptedAt: new Date("2026-08-15T02:30:00.000Z"),
    language: "ja",
    receiptId: "receipt-91"
  },
  media: [
    { id: 101, purpose: "corporate_registration", url: "/media/101", mimeType: "image/png" }
  ]
};

const allPermissions = [
  "ops:merchant-application:read",
  "ops:merchant-application:review",
  "identity-application-media:sensitive-read"
];

const createFixture = (permissions = allPermissions) => {
  const user = {
    id: 9,
    email: "operations@example.test",
    phone: null,
    passwordHash: "unused",
    username: "Operations",
    avatarUrl: null,
    isActive: true,
    lastLoginAt: null,
    deletedAt: null,
    identities: [
      {
        id: 900,
        userId: 9,
        type: "admin",
        scopeType: "global",
        scopeId: null,
        displayName: "Operations",
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
          code: "platform_admin",
          deletedAt: null,
          rolePermissions: permissions.map((code) => ({
            deletedAt: null,
            permission: { code, type: "api", deletedAt: null }
          }))
        }
      }
    ]
  };
  const merchantApplicationReviewService = {
    list: jest.fn(async (_query, includeSensitiveDocuments: boolean) => ({
      list: [
        includeSensitiveDocuments ? reviewRecord : { ...reviewRecord, media: [] }
      ],
      total: 1,
      page: 1,
      page_size: 20
    })),
    get: jest.fn(async (_id, includeSensitiveDocuments: boolean) =>
      includeSensitiveDocuments ? reviewRecord : { ...reviewRecord, media: [] }
    ),
    approve: jest.fn(async () => ({
      applicationId: 41,
      status: "approved",
      version: 4,
      merchantAccountId: 51,
      shopId: 61,
      identityId: 71,
      billingProfileId: 81
    })),
    reject: jest.fn(async () => ({
      applicationId: 41,
      status: "rejected",
      version: 4,
      rejectionReason: "法人登记文件无法确认"
    }))
  };
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    testOnlyAllowLegacyAuthAdapters: true,
    authRepository: { findUserById: jest.fn(async () => user) },
    authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    merchantApplicationReviewService
  } as never);
  const token = new AuthTokenService(env).issueAccessToken({
    id: user.id,
    email: user.email,
    currentIdentityId: 900
  }).token;
  return { app, token, merchantApplicationReviewService };
};

describe("operations merchant application HTTP API", () => {
  it("paginates merchant applications and returns only masked bank data", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .get("/api/v1/ops/merchant-applications?page=1&page_size=20&status=submitted")
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({ total: 1, page: 1, page_size: 20 });
        expect(response.body.data.list[0].bankAccount).toMatchObject({
          accountNumberMasked: "•••4567",
          accountHolderMasked: "カ•••••••••ド",
          holderMatched: true
        });
        expect(JSON.stringify(response.body)).not.toContain("1234567");
      });
    expect(fixture.merchantApplicationReviewService.list).toHaveBeenCalledWith(
      { page: 1, pageSize: 20, status: "submitted" },
      true
    );
  });

  it("authorizes sensitive documents separately from application read", async () => {
    const readOnly = createFixture(["ops:merchant-application:read"]);
    await request(readOnly.app)
      .get("/api/v1/ops/merchant-applications/41")
      .set("Authorization", `Bearer ${readOnly.token}`)
      .expect(200)
      .expect((response) => expect(response.body.data.media).toEqual([]));
    expect(readOnly.merchantApplicationReviewService.get).toHaveBeenCalledWith(41, false);

    const sensitive = createFixture();
    await request(sensitive.app)
      .get("/api/v1/ops/merchant-applications/41")
      .set("Authorization", `Bearer ${sensitive.token}`)
      .expect(200)
      .expect((response) =>
        expect(response.body.data.media).toEqual([
          expect.objectContaining({ id: 101, purpose: "corporate_registration" })
        ])
      );
  });

  it("approves idempotently and requires a reason for rejection", async () => {
    const fixture = createFixture();
    const authorization = `Bearer ${fixture.token}`;
    await request(fixture.app)
      .post("/api/v1/ops/merchant-applications/41/approve")
      .set("Authorization", authorization)
      .send({ expectedVersion: 3 })
      .expect(200);
    await request(fixture.app)
      .post("/api/v1/ops/merchant-applications/41/approve")
      .set("Authorization", authorization)
      .send({ expectedVersion: 3 })
      .expect(200);
    expect(fixture.merchantApplicationReviewService.approve).toHaveBeenCalledTimes(2);

    await request(fixture.app)
      .post("/api/v1/ops/merchant-applications/41/reject")
      .set("Authorization", authorization)
      .send({ expectedVersion: 3, rejectionReason: "" })
      .expect(400);
    await request(fixture.app)
      .post("/api/v1/ops/merchant-applications/41/reject")
      .set("Authorization", authorization)
      .send({ expectedVersion: 3, rejectionReason: "法人登记文件无法确认" })
      .expect(200);
  });

  it("enforces read and review permissions independently", async () => {
    const noPermissions = createFixture([]);
    await request(noPermissions.app)
      .get("/api/v1/ops/merchant-applications")
      .set("Authorization", `Bearer ${noPermissions.token}`)
      .expect(403);

    const readOnly = createFixture(["ops:merchant-application:read"]);
    await request(readOnly.app)
      .get("/api/v1/ops/merchant-applications")
      .set("Authorization", `Bearer ${readOnly.token}`)
      .expect(200);
    await request(readOnly.app)
      .post("/api/v1/ops/merchant-applications/41/approve")
      .set("Authorization", `Bearer ${readOnly.token}`)
      .send({ expectedVersion: 3 })
      .expect(403);
  });
});
