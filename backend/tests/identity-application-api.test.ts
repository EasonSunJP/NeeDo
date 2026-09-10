import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { AuthTokenService } from "../src/services/auth-token.service";

const now = new Date("2026-08-26T05:00:00.000Z");

const application = {
  id: 11,
  userId: 7,
  type: "technician" as const,
  status: "draft" as const,
  version: 1,
  activeKey: "7:technician",
  submittedSnapshotHash: null,
  submittedAt: null,
  closedAt: null,
  purgeAt: null,
  rejectionReason: null,
  createdAt: now,
  updatedAt: now,
  technicianDetail: {
    targetShopId: 21,
    applicantName: "山本太郎",
    phone: null,
    city: null,
    serviceAreas: [],
    skills: [],
    yearsExperience: null,
    bio: null,
    gender: null,
    birthDate: null
  },
  merchantDetail: null
};

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

const createFixture = (permissionCodes = ["identity-application:own", "bank-account:own"]) => {
  const user = createUser(permissionCodes);
  const identityApplicationService = {
    listMine: jest.fn(async () => ({
      list: [application],
      total: 1,
      page: 1,
      page_size: 20
    })),
    searchEligibleShops: jest.fn(async () => ({
      list: [
        {
          id: 21,
          merchantId: "21",
          name: "GINZA Calm Body Lab",
          city: "东京",
          address: "东京都中央区银座3-4-12"
        }
      ],
      total: 1,
      page: 1,
      page_size: 20
    })),
    createTechnicianDraft: jest.fn(async () => application),
    updateTechnicianDraft: jest.fn(async () => ({ ...application, version: 2 })),
    createMerchantDraft: jest.fn(async () => ({
      ...application,
      type: "merchant",
      technicianDetail: null,
      merchantDetail: {}
    })),
    updateMerchantShowcase: jest.fn(async () => ({
      ...application,
      type: "merchant",
      version: 2,
      technicianDetail: null,
      merchantDetail: {}
    })),
    submit: jest.fn(async () => ({ ...application, status: "submitted", version: 2 })),
    withdraw: jest.fn(async () => ({ ...application, status: "withdrawn", version: 2 }))
  };
  const protectedBankAccountService = {
    bindMerchantAccount: jest.fn(async () => ({
      id: 44,
      bankCode: "0005",
      bankName: "三菱UFJ银行",
      branchCode: "001",
      branchName: "本店",
      accountType: "ordinary",
      accountNumberMasked: "•••4567",
      verifiedAt: null,
      applicationVersion: 2
    }))
  };
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    testOnlyAllowLegacyAuthAdapters: true,
    authRepository: {
      findUserById: jest.fn(async (id: number) => (id === user.id ? user : null))
    },
    authSessionStore: { isAccessTokenBlacklisted: jest.fn(async () => false) },
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    identityApplicationService,
    protectedBankAccountService
  } as never);
  const token = new AuthTokenService(env).issueAccessToken({
    id: user.id,
    email: user.email,
    currentIdentityId: user.identities[0].id
  }).token;

  return { app, token, identityApplicationService, protectedBankAccountService };
};

describe("identity application applicant HTTP API", () => {
  it("requires authentication and a narrowly scoped own-application permission", async () => {
    const allowed = createFixture();
    await request(allowed.app).get("/api/v1/identity-applications/mine").expect(401);

    const denied = createFixture(["auth:me"]);
    await request(denied.app)
      .get("/api/v1/identity-applications/mine")
      .set("Authorization", `Bearer ${denied.token}`)
      .expect(403);
  });

  it("lists the current user's applications with snake-case pagination", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .get("/api/v1/identity-applications/mine?page=1&page_size=20&type=technician&status=draft")
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          code: 0,
          message: "success",
          data: { total: 1, page: 1, page_size: 20 }
        });
      });
    expect(fixture.identityApplicationService.listMine).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ page: 1, pageSize: 20, type: "technician", status: "draft" })
    );
  });

  it("searches eligible shops by merchant id, name, or address", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .get("/api/v1/merchants/search?page=1&page_size=10&query=GINZA")
      .set("Authorization", `Bearer ${fixture.token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data.list[0]).toMatchObject({
          merchantId: "21",
          name: "GINZA Calm Body Lab"
        });
      });
    expect(fixture.identityApplicationService.searchEligibleShops).toHaveBeenCalledWith({
      page: 1,
      pageSize: 10,
      query: "GINZA"
    });
  });

  it("creates, updates, submits, and withdraws a technician application", async () => {
    const fixture = createFixture();
    const authorization = `Bearer ${fixture.token}`;

    await request(fixture.app)
      .post("/api/v1/identity-applications/technician")
      .set("Authorization", authorization)
      .send({ targetShopId: 21, applicantName: " 山本太郎 " })
      .expect(201);
    expect(fixture.identityApplicationService.createTechnicianDraft).toHaveBeenCalledWith({
      userId: 7,
      targetShopId: 21,
      applicantName: "山本太郎"
    });

    await request(fixture.app)
      .patch("/api/v1/identity-applications/11/technician-profile")
      .set("Authorization", authorization)
      .send({
        expectedVersion: 1,
        targetShopId: 21,
        applicantName: "山本太郎",
        phone: null,
        city: "东京",
        serviceAreas: ["银座"],
        skills: ["按摩"],
        yearsExperience: 4,
        bio: null,
        gender: "male",
        birthDate: "1990-01-02"
      })
      .expect(200);
    expect(fixture.identityApplicationService.updateTechnicianDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        applicationId: 11,
        expectedVersion: 1,
        detail: expect.objectContaining({ birthDate: new Date("1990-01-02T00:00:00.000Z") })
      })
    );

    await request(fixture.app)
      .post("/api/v1/identity-applications/11/submit")
      .set("Authorization", authorization)
      .send({ expectedVersion: 1 })
      .expect(200);
    await request(fixture.app)
      .post("/api/v1/identity-applications/11/withdraw")
      .set("Authorization", authorization)
      .send({ expectedVersion: 1 })
      .expect(200);
    expect(fixture.identityApplicationService.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        applicationId: 11,
        expectedVersion: 1,
        now: expect.any(Date)
      })
    );
    expect(fixture.identityApplicationService.withdraw).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        applicationId: 11,
        expectedVersion: 1,
        now: expect.any(Date)
      })
    );
  });

  it("creates and edits the server-owned merchant draft without accepting protected fields", async () => {
    const fixture = createFixture();
    const authorization = `Bearer ${fixture.token}`;
    const body = {
      applicantKind: "corporate",
      corporateLegalName: "株式会社NeeDo",
      corporateLegalNameKana: "カブシキガイシャニード",
      representativeName: "山本太郎",
      representativeNameKana: "ヤマモトタロウ",
      shopName: "NeeDo 银座店",
      businessAddress: "东京都中央区银座1-1-1",
      contactPhone: "09000000000",
      responsiblePersonName: "山本太郎",
      showcaseDraft: { headline: "安心服务", nearestStation: "新宿駅 南口", stationAccess: "徒歩5分" },
      serviceCategoryIds: [1],
      businessKeywordIds: [10]
    };

    await request(fixture.app)
      .post("/api/v1/identity-applications/merchant")
      .set("Authorization", authorization)
      .send({ ...body, bankAccountId: 999, contractAcceptanceId: 999 })
      .expect(400);
    await request(fixture.app)
      .post("/api/v1/identity-applications/merchant")
      .set("Authorization", authorization)
      .send(body)
      .expect(201);
    expect(fixture.identityApplicationService.createMerchantDraft).toHaveBeenCalledWith({
      userId: 7,
      detail: expect.objectContaining({
        ...body,
        bankAccountId: null,
        contractAcceptanceId: null,
        mediaPurposes: [],
        bankVerificationStatus: null,
        eKycVerified: false
      })
    });

    await request(fixture.app)
      .patch("/api/v1/identity-applications/11/merchant-showcase")
      .set("Authorization", authorization)
      .send({ expectedVersion: 1, ...body })
      .expect(200);
  });

  it.each(["ordinary", "current", "savings", "other"])("binds a %s merchant bank account and exposes only its masked projection", async (accountType) => {
    const fixture = createFixture();
    const authorization = `Bearer ${fixture.token}`;
    const body = {
      expectedVersion: 1,
      bankCode: "0005",
      bankName: "三菱UFJ银行",
      branchCode: "001",
      branchName: "本店",
      accountType,
      accountNumber: "1234567",
      accountHolderName: "カ）ニード"
    };

    await request(fixture.app)
      .patch("/api/v1/identity-applications/11/merchant-bank-account")
      .set("Authorization", authorization)
      .send({ ...body, manualOverride: true })
      .expect(400);
    await request(fixture.app)
      .patch("/api/v1/identity-applications/11/merchant-bank-account")
      .set("Authorization", authorization)
      .send(body)
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({
          accountNumberMasked: "•••4567",
          applicationVersion: 2
        });
        expect(response.body.data).not.toHaveProperty("holderMatched");
        expect(JSON.stringify(response.body)).not.toContain("1234567");
        expect(JSON.stringify(response.body)).not.toContain("カ）ニード");
      });
    expect(fixture.protectedBankAccountService.bindMerchantAccount).toHaveBeenCalledWith({
      userId: 7,
      applicationId: 11,
      expectedVersion: 1,
      bankCode: "0005",
      bankName: "三菱UFJ银行",
      branchCode: "001",
      branchName: "本店",
      accountType,
      accountNumber: "1234567",
      accountHolderName: "カ）ニード",
      now: expect.any(Date)
    });
  });

  it("rejects invalid IDs, empty names, and unknown request fields through Zod", async () => {
    const fixture = createFixture();
    const authorization = `Bearer ${fixture.token}`;
    await request(fixture.app)
      .post("/api/v1/identity-applications/technician")
      .set("Authorization", authorization)
      .send({ targetShopId: 0, applicantName: "", role: "admin" })
      .expect(400);
    expect(fixture.identityApplicationService.createTechnicianDraft).not.toHaveBeenCalled();
  });
});
