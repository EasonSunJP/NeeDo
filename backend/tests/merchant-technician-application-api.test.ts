import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { AuthTokenService } from "../src/services/auth-token.service";

const now = new Date("2026-08-26T05:00:00.000Z");
const record = {
  applicationId: 11,
  applicantUserId: 7,
  targetShopId: 21,
  targetShopServiceUserId: 30,
  status: "submitted",
  version: 2,
  applicantName: "山本太郎",
  phone: null,
  city: "东京",
  serviceAreas: ["银座"],
  skills: ["按摩"],
  yearsExperience: 4,
  bio: "四年经验",
  gender: "male",
  birthDate: new Date("1990-01-02T00:00:00.000Z"),
  submittedAt: new Date("2026-08-25T05:00:00.000Z"),
  createdAt: new Date("2026-08-24T05:00:00.000Z"),
  media: [{ id: 101, purpose: "portrait", url: "/media/101", mimeType: "image/png" }]
};

const permissionCodes = [
  "merchant:technician-application:read",
  "merchant:technician-application:review",
  "merchant:technician-application:contact",
  "merchant:technician-application:export"
];

const createFixture = (permissions = permissionCodes) => {
  const user = {
    id: 30,
    email: "merchant@example.test",
    phone: null,
    passwordHash: "unused",
    username: "Merchant",
    avatarUrl: null,
    isActive: true,
    lastLoginAt: null,
    deletedAt: null,
    identities: [
      {
        id: 300,
        userId: 30,
        type: "merchant_owner",
        scopeType: "shop",
        scopeId: 21,
        displayName: "Merchant",
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
          code: "merchant_owner",
          deletedAt: null,
          rolePermissions: permissions.map((code) => ({
            deletedAt: null,
            permission: { code, type: "api", deletedAt: null }
          }))
        }
      }
    ]
  };
  const technicianApplicationReviewService = {
    list: jest.fn(async () => ({ list: [record], total: 1, page: 1, page_size: 20 })),
    get: jest.fn(async () => record),
    approve: jest.fn(async () => ({
      applicationId: 11,
      status: "approved",
      version: 3,
      technicianProfileId: 51,
      identityId: 61,
      reviewedAt: now
    })),
    reject: jest.fn(async () => ({
      applicationId: 11,
      status: "rejected",
      version: 3,
      rejectionReason: "照片无法确认",
      reviewedAt: now
    })),
    contact: jest.fn(async () => ({ conversationId: 91 }))
  };
  const technicianResumeExportService = {
    export: jest.fn(async () => ({
      filename: "技师入住申请_山本太郎_NeeDoID7_20260825.xlsx",
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from("PK-test-xlsx")
    }))
  };
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    authRepository: { findUserById: jest.fn(async () => user) },
    authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    technicianApplicationReviewService,
    technicianResumeExportService
  } as never);
  const token = new AuthTokenService(env).issueAccessToken({
    id: user.id,
    email: user.email,
    currentIdentityId: 300
  }).token;
  return { app, token, technicianApplicationReviewService, technicianResumeExportService };
};

describe("merchant technician application HTTP API", () => {
  it("lists and reads every submitted field and media only in the current shop scope", async () => {
    const fixture = createFixture();
    const authorization = `Bearer ${fixture.token}`;
    await request(fixture.app)
      .get("/api/v1/merchant/technician-applications?page=1&page_size=20&status=submitted")
      .set("Authorization", authorization)
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({ total: 1, page: 1, page_size: 20 });
        expect(response.body.data.list[0]).toMatchObject({
          applicantName: "山本太郎",
          media: [{ id: 101, purpose: "portrait" }]
        });
      });
    expect(fixture.technicianApplicationReviewService.list).toHaveBeenCalledWith(21, {
      page: 1,
      pageSize: 20,
      status: "submitted"
    });

    await request(fixture.app)
      .get("/api/v1/merchant/technician-applications/11")
      .set("Authorization", authorization)
      .expect(200);
    expect(fixture.technicianApplicationReviewService.get).toHaveBeenCalledWith(11, 21);
  });

  it("approves, rejects with a reason, and contacts without changing review state", async () => {
    const fixture = createFixture();
    const authorization = `Bearer ${fixture.token}`;
    await request(fixture.app)
      .post("/api/v1/merchant/technician-applications/11/approve")
      .set("Authorization", authorization)
      .send({ expectedVersion: 2 })
      .expect(200);
    expect(fixture.technicianApplicationReviewService.approve).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: 11,
        reviewerUserId: 30,
        reviewerShopId: 21,
        expectedVersion: 2
      })
    );

    await request(fixture.app)
      .post("/api/v1/merchant/technician-applications/11/reject")
      .set("Authorization", authorization)
      .send({ expectedVersion: 2, rejectionReason: "" })
      .expect(400);
    await request(fixture.app)
      .post("/api/v1/merchant/technician-applications/11/reject")
      .set("Authorization", authorization)
      .send({ expectedVersion: 2, rejectionReason: "照片无法确认" })
      .expect(200);

    await request(fixture.app)
      .post("/api/v1/merchant/technician-applications/11/contact")
      .set("Authorization", authorization)
      .send({})
      .expect(200)
      .expect((response) => expect(response.body.data).toEqual({ conversationId: 91 }));
    expect(fixture.technicianApplicationReviewService.contact).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: 11,
        reviewerUserId: 30,
        reviewerShopId: 21
      })
    );
  });

  it("downloads a safe binary XLSX response with the UTF-8 filename", async () => {
    const fixture = createFixture();
    const response = await request(fixture.app)
      .get("/api/v1/merchant/technician-applications/11/resume.xlsx")
      .set("Authorization", `Bearer ${fixture.token}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(response.headers["content-type"]).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(response.headers["content-disposition"]).toContain("filename*=UTF-8''");
    expect(response.body).toEqual(Buffer.from("PK-test-xlsx"));
    expect(fixture.technicianResumeExportService.export).toHaveBeenCalledWith(
      expect.objectContaining({ applicationId: 11, reviewerUserId: 30, reviewerShopId: 21 })
    );
  });

  it("enforces separate read, review, contact, and export permissions", async () => {
    const readOnly = createFixture(["merchant:technician-application:read"]);
    const authorization = `Bearer ${readOnly.token}`;
    await request(readOnly.app)
      .get("/api/v1/merchant/technician-applications")
      .set("Authorization", authorization)
      .expect(200);
    await request(readOnly.app)
      .post("/api/v1/merchant/technician-applications/11/approve")
      .set("Authorization", authorization)
      .send({ expectedVersion: 2 })
      .expect(403);
    await request(readOnly.app)
      .post("/api/v1/merchant/technician-applications/11/contact")
      .set("Authorization", authorization)
      .send({})
      .expect(403);
    await request(readOnly.app)
      .get("/api/v1/merchant/technician-applications/11/resume.xlsx")
      .set("Authorization", authorization)
      .expect(403);
  });
});
