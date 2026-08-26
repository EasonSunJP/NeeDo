import { hash } from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app";
import { ERROR_CODES } from "../src/constants/error-codes";

class InMemorySessionStore {
  private readonly values = new Map<string, string>();

  public async getLoginLock(): Promise<boolean> { return false; }
  public async recordFailedLogin(): Promise<{ count: number; locked: boolean }> { return { count: 1, locked: false }; }
  public async clearFailedLogin(): Promise<void> { return undefined; }
  public async storeOtp(email: string, otp: string): Promise<void> { this.values.set(`otp:${email}`, otp); }
  public async getOtp(email: string): Promise<string | null> { return this.values.get(`otp:${email}`) ?? null; }
  public async deleteOtp(email: string): Promise<void> { this.values.delete(`otp:${email}`); }
  public async hasOtpCooldown(): Promise<boolean> { return false; }
  public async storeOtpCooldown(): Promise<void> { return undefined; }
  public async clearOtpCooldown(): Promise<void> { return undefined; }
  public async storeRefreshToken(userId: number, jti: string): Promise<void> { this.values.set(`refresh:${userId}:${jti}`, "1"); }
  public async hasRefreshToken(userId: number, jti: string): Promise<boolean> { return this.values.has(`refresh:${userId}:${jti}`); }
  public async revokeRefreshToken(userId: number, jti: string): Promise<void> { this.values.delete(`refresh:${userId}:${jti}`); }
  public async blacklistAccessToken(jti: string): Promise<void> { this.values.set(`blacklist:${jti}`, "1"); }
  public async isAccessTokenBlacklisted(jti: string): Promise<boolean> { return this.values.has(`blacklist:${jti}`); }
}

const now = new Date("2026-08-25T00:00:00.000Z");

const createFixture = async () => {
  const passwordHash = await hash("Abcd@1234", 12);
  const auditLogs: Array<Record<string, unknown>> = [];
  let auditFailure = false;
  const adminPermissions = [
    "auth:me",
    "backoffice:shops:list",
    "backoffice:shops:write",
    "backoffice:technicians:list",
    "backoffice:technicians:write",
    "backoffice:customers:list",
    "backoffice:customers:write",
    "backoffice:services:list",
    "backoffice:services:write"
  ];
  const merchantPermissions = [
    "auth:me",
    "merchant-admin:technicians:list",
    "merchant-admin:technicians:write",
    "merchant-admin:customers:list",
    "merchant-admin:services:list",
    "merchant-admin:services:write",
    "merchant-admin:shop:read",
    "merchant-admin:shop:write"
  ];
  const makeRole = (code: string, permissions: string[]) => ({
    code,
    deletedAt: null,
    rolePermissions: permissions.map((permission, index) => ({
      deletedAt: null,
      permission: { code: permission, type: "api", deletedAt: null, id: index + 1 }
    }))
  });
  const users = [
    {
      id: 1,
      email: "admin@example.com",
      phone: null,
      passwordHash,
      username: "Admin",
      avatarUrl: null,
      isActive: true,
      lastLoginAt: null,
      deletedAt: null,
      identities: [{ id: 1, userId: 1, type: "platform_admin", scopeType: "global", scopeId: null, displayName: "Admin", isDefault: true, isActive: true, deletedAt: null }],
      userRoles: [{ deletedAt: null, role: makeRole("admin", adminPermissions) }]
    },
    {
      id: 2,
      email: "merchant@example.com",
      phone: null,
      passwordHash,
      username: "Merchant",
      avatarUrl: null,
      isActive: true,
      lastLoginAt: null,
      deletedAt: null,
      identities: [{ id: 2, userId: 2, type: "merchant_owner", scopeType: "shop", scopeId: 11, displayName: "Merchant", isDefault: true, isActive: true, deletedAt: null }],
      userRoles: [{ deletedAt: null, role: makeRole("merchant_owner", merchantPermissions) }]
    }
  ];
  const authRepository = {
    findUserByEmail: jest.fn(async (email: string) => users.find((user) => user.email === email) ?? null),
    findUserByLoginIdentifier: jest.fn(async (identifier: string) => users.find((user) => user.email === identifier) ?? null),
    findUserById: jest.fn(async (id: number) => users.find((user) => user.id === id) ?? null),
    updateLastLoginAt: jest.fn(async () => undefined),
    createLoginLog: jest.fn(async () => undefined),
    createAuditLog: jest.fn(async () => undefined)
  };
  const shop = {
    id: 11,
    ownerUserId: 20,
    ownerEmail: "owner@example.com",
    name: "Aoyama Studio",
    description: "A calm private studio",
    city: "Tokyo",
    address: "Aoyama 1-1",
    phone: null,
    status: "pending_review",
    isRecommended: false,
    createdAt: now.toISOString()
  };
  const technician = {
    id: 31,
    userId: 41,
    displayName: "Pending Tech",
    email: "pending.tech@example.com",
    shopId: 11,
    shopName: "Aoyama Studio",
    city: "Tokyo",
    serviceArea: null,
    status: "pending_review",
    verifiedAt: null,
    createdAt: now.toISOString()
  };
  const technicianDetail = {
    ...technician,
    bio: "Experienced therapist",
    yearsExperience: 6,
    isRecommended: true,
    updatedAt: now.toISOString(),
    account: {
      username: "Technician",
      email: "technician@example.com",
      phone: null,
      avatarUrl: null,
      isActive: true,
      lastLoginAt: null,
      roles: [],
      identities: []
    },
    statistics: {
      bookingCount: 0,
      completedCount: 0,
      cancelledCount: 0,
      completedRevenueJpy: 0,
      todayScheduleMinutes: 0,
      weekScheduleMinutes: 0,
      monthScheduleMinutes: 0
    },
    reviewSummary: null,
    services: [],
    upcomingSchedule: [],
    compensationProfile: null,
    timeline: [],
    unavailableMetrics: ["acceptanceRate", "lateness", "shiftPreferences"]
  };
  const customer = {
    id: 41,
    userId: 61,
    displayName: "Customer One",
    email: "customer@example.com",
    city: "Tokyo",
    membershipLevel: "standard",
    isPublic: true,
    bookingCount: 2,
    createdAt: now.toISOString()
  };
  const customerDetail = {
    ...customer,
    bio: "Customer profile",
    updatedAt: now.toISOString(),
    account: {
      username: "Customer One",
      email: "customer@example.com",
      phone: null,
      avatarUrl: null,
      isActive: true,
      lastLoginAt: null,
      roles: [],
      identities: []
    },
    bookingStatusTotals: { completed: 2 },
    completedSpendJpy: 24000,
    nextBooking: null,
    recentBookings: [],
    reviewSummary: null,
    timeline: []
  };
  const service = {
    id: 71,
    categoryId: 81,
    categoryName: "Massage",
    shopId: 11,
    technicianProfileId: null,
    name: "Aroma 60",
    description: null,
    city: "Tokyo",
    serviceMode: "store",
    priceAmount: 12000,
    currency: "JPY",
    durationMinutes: 60,
    status: "published",
    isRecommended: false,
    sortOrder: 0,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
  const page = <T>(row: T) => ({ list: [row], total: 1, page: 1, page_size: 20 });
  const backofficeRepository = {
    getDashboard: jest.fn(), listOrders: jest.fn(), listSchedule: jest.fn(), listFinanceSettlements: jest.fn(), exportFinanceSettlements: jest.fn(),
    listTechnicians: jest.fn(async () => page(technician)), listShops: jest.fn(async () => page(shop)),
    findUserByEmail: jest.fn(async (email: string) => email === "existing@example.com" ? { id: 99 } : null),
    createShop: jest.fn(async () => shop), updateShop: jest.fn(async () => ({ ...shop, name: "Updated Studio" })), approveShop: jest.fn(async () => ({ ...shop, status: "published" })), softDeleteShop: jest.fn(async () => ({ ...shop, status: "archived" })),
    updateTechnician: jest.fn(async (input: { technicianId: number }) => input.technicianId === 32 ? null : technician), approveTechnician: jest.fn(async () => ({ ...technician, status: "published", verifiedAt: now.toISOString() })), softDeleteTechnician: jest.fn(async () => ({ ...technician, status: "archived" })),
    getTechnicianDetail: jest.fn(async (input: { id: number }) => input.id === 999 ? null : technicianDetail),
    listCustomers: jest.fn(async () => page(customer)), getCustomer: jest.fn(async () => customer), getCustomerDetail: jest.fn(async (input: { id: number }) => input.id === 999 ? null : customerDetail), updateCustomer: jest.fn(async () => ({ ...customer, city: "Osaka" })), softDeleteCustomer: jest.fn(async () => customer),
    listServices: jest.fn(async () => page(service)), createService: jest.fn(async () => service), updateService: jest.fn(async (input: { serviceId: number }) => input.serviceId === 72 ? null : { ...service, priceAmount: 13000 }), softDeleteService: jest.fn(async () => ({ ...service, status: "archived" }))
  };
  const auditLogRepository = {
    create: jest.fn(async (entry: Record<string, unknown>) => {
      if (auditFailure) throw new Error("audit unavailable");
      auditLogs.push(entry);
    })
  };
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    authRepository,
    testOnlyAllowLegacyAuthAdapters: true,
    authSessionStore: new InMemorySessionStore(),
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    auditLogRepository,
    backofficeRepository
  } as never);
  const login = async (email: string) => {
    const response = await request(app).post("/api/v1/auth/login").send({ email, password: "Abcd@1234" }).expect(200);
    return response.body.data.accessToken as string;
  };

  return { app, auditLogs, backofficeRepository, login, setAuditFailure: (value: boolean) => { auditFailure = value; } };
};

describe("master data write APIs", () => {
  it("reads platform and authenticated-shop profile details", async () => {
    const fixture = await createFixture();
    const adminToken = await fixture.login("admin@example.com");
    const merchantToken = await fixture.login("merchant@example.com");

    await request(fixture.app)
      .get("/api/v1/backoffice/technicians/31")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200)
      .expect((response) => expect(response.body.data.account.email).toBe("technician@example.com"));

    await request(fixture.app)
      .get("/api/v1/merchant-admin/technicians/31")
      .set("Authorization", `Bearer ${merchantToken}`)
      .expect(200);

    await request(fixture.app)
      .get("/api/v1/backoffice/customers/41")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(200)
      .expect((response) => expect(response.body.data.completedSpendJpy).toBe(24000));

    await request(fixture.app)
      .get("/api/v1/merchant-admin/customers/41")
      .set("Authorization", `Bearer ${merchantToken}`)
      .expect(200);

    expect(fixture.backofficeRepository.getTechnicianDetail).toHaveBeenCalledWith({
      scope: "platform",
      id: 31
    });
    expect(fixture.backofficeRepository.getTechnicianDetail).toHaveBeenCalledWith({
      scope: "merchant",
      shopId: 11,
      id: 31
    });
    expect(fixture.backofficeRepository.getCustomerDetail).toHaveBeenCalledWith({
      scope: "platform",
      id: 41
    });
    expect(fixture.backofficeRepository.getCustomerDetail).toHaveBeenCalledWith({
      scope: "merchant",
      shopId: 11,
      id: 41
    });
    expect(fixture.auditLogs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "backoffice.technician.read",
        targetType: "TechnicianProfile",
        metadata: { technicianProfileId: 31 }
      }),
      expect.objectContaining({
        action: "merchant_admin.technician.read",
        targetType: "TechnicianProfile",
        metadata: { technicianProfileId: 31, shopId: 11 }
      }),
      expect.objectContaining({
        action: "backoffice.customer.read",
        targetType: "CustomerProfile",
        metadata: { customerProfileId: 41 }
      }),
      expect.objectContaining({
        action: "merchant_admin.customer.read",
        targetType: "CustomerProfile",
        metadata: { customerProfileId: 41, shopId: 11 }
      })
    ]));
  });

  it("returns uniform not-found responses for missing profile details", async () => {
    const fixture = await createFixture();
    const adminToken = await fixture.login("admin@example.com");
    const merchantToken = await fixture.login("merchant@example.com");

    await request(fixture.app)
      .get("/api/v1/backoffice/technicians/999")
      .set("Authorization", `Bearer ${adminToken}`)
      .expect(404)
      .expect((response) => expect(response.body).toEqual({
        code: ERROR_CODES.NOT_FOUND,
        message: "error.technician.not_found",
        data: null
      }));

    await request(fixture.app)
      .get("/api/v1/merchant-admin/customers/999")
      .set("Authorization", `Bearer ${merchantToken}`)
      .expect(404)
      .expect((response) => expect(response.body).toEqual({
        code: ERROR_CODES.NOT_FOUND,
        message: "error.customer.not_found",
        data: null
      }));
  });

  it("rejects detail reads without permission before repository access", async () => {
    const fixture = await createFixture();
    const merchantToken = await fixture.login("merchant@example.com");

    fixture.backofficeRepository.getTechnicianDetail.mockClear();
    await request(fixture.app)
      .get("/api/v1/backoffice/technicians/31")
      .set("Authorization", `Bearer ${merchantToken}`)
      .expect(403)
      .expect((response) => expect(response.body.code).toBe(ERROR_CODES.FORBIDDEN));

    expect(fixture.backofficeRepository.getTechnicianDetail).not.toHaveBeenCalled();
  });

  it("updates only the authenticated merchant shop with validation and audit", async () => {
    const fixture = await createFixture();
    const merchantToken = await fixture.login("merchant@example.com");

    const response = await request(fixture.app)
      .patch("/api/v1/merchant-admin/shop")
      .set("Authorization", `Bearer ${merchantToken}`)
      .send({ name: "Updated Studio", description: "Updated profile", city: "Yokohama" })
      .expect(200);

    expect(response.body.data.name).toBe("Updated Studio");
    expect(fixture.backofficeRepository.updateShop).toHaveBeenCalledWith(11, {
      name: "Updated Studio",
      description: "Updated profile",
      city: "Yokohama"
    });
    expect(fixture.auditLogs).toContainEqual(expect.objectContaining({
      action: "merchant_admin.shop.update",
      targetType: "Shop"
    }));

    await request(fixture.app)
      .patch("/api/v1/merchant-admin/shop")
      .set("Authorization", `Bearer ${merchantToken}`)
      .send({ name: "" })
      .expect(400);
  });

  it("creates, updates, approves, and soft-deletes a shop with validation and audit logs", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("admin@example.com");
    const body = { ownerEmail: "owner@example.com", ownerUsername: "Owner", ownerPassword: "Owner.2026!", name: "Aoyama Studio", city: "Tokyo", address: "Aoyama 1-1" };

    await request(fixture.app).post("/api/v1/backoffice/shops").set("Authorization", `Bearer ${token}`).send(body).expect(201);
    await request(fixture.app).patch("/api/v1/backoffice/shops/11").set("Authorization", `Bearer ${token}`).send({ name: "Updated Studio" }).expect(200);
    await request(fixture.app).post("/api/v1/backoffice/shops/11/approve").set("Authorization", `Bearer ${token}`).expect(200);
    await request(fixture.app).delete("/api/v1/backoffice/shops/11").set("Authorization", `Bearer ${token}`).expect(200);

    expect(fixture.backofficeRepository.createShop).toHaveBeenCalledWith(expect.objectContaining({ ownerEmail: "owner@example.com", ownerPasswordHash: expect.any(String) }));
    expect(fixture.auditLogs.map((entry) => entry.action)).toEqual(expect.arrayContaining(["backoffice.shop.create", "backoffice.shop.update", "backoffice.shop.approve", "backoffice.shop.delete"]));

    await request(fixture.app).post("/api/v1/backoffice/shops").set("Authorization", `Bearer ${token}`).send({ ...body, ownerEmail: "existing@example.com" }).expect(409).expect((response) => expect(response.body.code).toBe(ERROR_CODES.EMAIL_ALREADY_EXISTS));
    await request(fixture.app).post("/api/v1/backoffice/shops").set("Authorization", `Bearer ${token}`).send({ ...body, ownerPassword: "weak" }).expect(400);
  });

  it("approves and updates technicians while deriving merchant shop scope from auth", async () => {
    const fixture = await createFixture();
    const adminToken = await fixture.login("admin@example.com");
    const merchantToken = await fixture.login("merchant@example.com");

    await request(fixture.app).post("/api/v1/backoffice/technicians/31/approve").set("Authorization", `Bearer ${adminToken}`).send({ shopId: 11 }).expect(200);
    await request(fixture.app).patch("/api/v1/merchant-admin/technicians/31").set("Authorization", `Bearer ${merchantToken}`).send({ displayName: "Store Tech", shopId: 999 }).expect(200);

    expect(fixture.backofficeRepository.approveTechnician).toHaveBeenCalledWith(expect.objectContaining({ scope: "platform", technicianId: 31, shopId: 11 }));
    expect(fixture.backofficeRepository.updateTechnician).toHaveBeenCalledWith(expect.objectContaining({ scope: "merchant", shopId: 11, technicianId: 31, displayName: "Store Tech" }));
    expect(fixture.backofficeRepository.updateTechnician).not.toHaveBeenCalledWith(expect.objectContaining({ shopId: 999 }));

    await request(fixture.app).patch("/api/v1/merchant-admin/technicians/32").set("Authorization", `Bearer ${merchantToken}`).send({ displayName: "Other Store Tech" }).expect(404).expect((response) => expect(response.body.code).toBe(ERROR_CODES.NOT_FOUND));
  });

  it("lists scoped customers and performs service CRUD without trusting a body shop id", async () => {
    const fixture = await createFixture();
    const merchantToken = await fixture.login("merchant@example.com");
    const serviceBody = { shopId: 999, categoryId: 81, name: "Aroma 60", city: "Tokyo", serviceMode: "store", priceAmount: 12000, durationMinutes: 60 };

    await request(fixture.app).get("/api/v1/merchant-admin/customers?page=1&pageSize=20").set("Authorization", `Bearer ${merchantToken}`).expect(200);
    await request(fixture.app).post("/api/v1/merchant-admin/services").set("Authorization", `Bearer ${merchantToken}`).send(serviceBody).expect(201);
    await request(fixture.app).patch("/api/v1/merchant-admin/services/71").set("Authorization", `Bearer ${merchantToken}`).send({ priceAmount: 13000, shopId: 999 }).expect(200);
    await request(fixture.app).delete("/api/v1/merchant-admin/services/71").set("Authorization", `Bearer ${merchantToken}`).expect(200);

    expect(fixture.backofficeRepository.listCustomers).toHaveBeenCalledWith(expect.objectContaining({ scope: "merchant", shopId: 11 }));
    expect(fixture.backofficeRepository.createService).toHaveBeenCalledWith(expect.objectContaining({ scope: "merchant", shopId: 11, categoryId: 81 }));
    expect(fixture.backofficeRepository.updateService).toHaveBeenCalledWith(expect.objectContaining({ scope: "merchant", shopId: 11, serviceId: 71, priceAmount: 13000 }));

    await request(fixture.app).patch("/api/v1/merchant-admin/services/72").set("Authorization", `Bearer ${merchantToken}`).send({ priceAmount: 14000 }).expect(404).expect((response) => expect(response.body.code).toBe(ERROR_CODES.NOT_FOUND));
  });

  it("fails closed when audit logging fails", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("admin@example.com");
    fixture.setAuditFailure(true);

    await request(fixture.app).patch("/api/v1/backoffice/shops/11").set("Authorization", `Bearer ${token}`).send({ name: "Updated Studio" }).expect(500);
  });
});
