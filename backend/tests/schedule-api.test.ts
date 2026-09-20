import { hash } from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app";
import { createDirectShopContextRepository } from "./helpers/merchant-shop-context";
import { ERROR_CODES } from "../src/constants/error-codes";

class InMemorySessionStore {
  private readonly values = new Map<string, string>();
  public async getLoginLock(): Promise<boolean> {
    return false;
  }
  public async recordFailedLogin(): Promise<{ count: number; locked: boolean }> {
    return { count: 1, locked: false };
  }
  public async clearFailedLogin(): Promise<void> {
    return undefined;
  }
  public async storeOtp(email: string, otp: string): Promise<void> {
    this.values.set(`otp:${email}`, otp);
  }
  public async getOtp(email: string): Promise<string | null> {
    return this.values.get(`otp:${email}`) ?? null;
  }
  public async deleteOtp(email: string): Promise<void> {
    this.values.delete(`otp:${email}`);
  }
  public async hasOtpCooldown(): Promise<boolean> {
    return false;
  }
  public async storeOtpCooldown(): Promise<void> {
    return undefined;
  }
  public async clearOtpCooldown(): Promise<void> {
    return undefined;
  }
  public async storeRefreshToken(userId: number, jti: string): Promise<void> {
    this.values.set(`refresh:${userId}:${jti}`, "1");
  }
  public async hasRefreshToken(userId: number, jti: string): Promise<boolean> {
    return this.values.has(`refresh:${userId}:${jti}`);
  }
  public async revokeRefreshToken(userId: number, jti: string): Promise<void> {
    this.values.delete(`refresh:${userId}:${jti}`);
  }
  public async blacklistAccessToken(jti: string): Promise<void> {
    this.values.set(`blacklist:${jti}`, "1");
  }
  public async isAccessTokenBlacklisted(jti: string): Promise<boolean> {
    return this.values.has(`blacklist:${jti}`);
  }
}

const startsAt = new Date("2026-08-26T01:00:00.000Z");
const endsAt = new Date("2026-08-26T02:00:00.000Z");

const createFixture = async (options: { technicianPermissions?: string[] } = {}) => {
  const passwordHash = await hash("Abcd@1234", 12);
  const makeRole = (code: string, permissions: string[]) => ({
    code,
    deletedAt: null,
    rolePermissions: permissions.map((permission, index) => ({
      deletedAt: null,
      permission: { id: index + 1, code: permission, type: "api", deletedAt: null }
    }))
  });
  const permissions = [
    "auth:me",
    "page:merchant-app",
    "page:technician-app",
    "schedule:slots:list",
    "schedule:slots:write"
  ];
  const users = [
    {
      id: 1,
      email: "merchant@example.com",
      phone: null,
      passwordHash,
      username: "Merchant",
      avatarUrl: null,
      isActive: true,
      lastLoginAt: null,
      deletedAt: null,
      identities: [
        {
          id: 1,
          userId: 1,
          type: "merchant_owner",
          scopeType: "shop",
          scopeId: 11,
          displayName: "Merchant",
          isDefault: true,
          isActive: true,
          deletedAt: null
        },
        {
          id: 3,
          userId: 1,
          type: "technician",
          scopeType: "technician_profile",
          scopeId: 31,
          displayName: "Merchant Technician",
          isDefault: false,
          isActive: true,
          deletedAt: null
        }
      ],
      userRoles: [{ deletedAt: null, role: makeRole("merchant_owner", permissions) }]
    },
    {
      id: 2,
      email: "technician@example.com",
      phone: null,
      passwordHash,
      username: "Technician",
      avatarUrl: null,
      isActive: true,
      lastLoginAt: null,
      deletedAt: null,
      identities: [
        {
          id: 2,
          userId: 2,
          type: "technician",
          scopeType: "technician_profile",
          scopeId: 31,
          displayName: "Technician",
          isDefault: true,
          isActive: true,
          deletedAt: null
        }
      ],
      userRoles: [
        {
          deletedAt: null,
          role: makeRole("technician", options.technicianPermissions ?? permissions)
        }
      ]
    }
  ];
  const slot = {
    id: 10,
    serviceId: 20,
    technicianServiceId: null,
    shopId: 11,
    technicianProfileId: 31,
    startsAt,
    endsAt,
    capacity: 1,
    bookedCount: 0,
    status: "available",
    serviceName: "Aroma 60",
    shopName: "Aoyama Studio",
    technicianName: "Mika",
    priceAmount: "12000.00",
    currency: "JPY",
    durationMinutes: 60
  };
  const availabilityWindow = {
    id: 88,
    shopId: 11,
    technicianProfileId: 31,
    sourceType: "technician",
    visibility: "technician_shops",
    startsAt,
    endsAt: new Date(startsAt.getTime() + 6 * 60 * 60_000),
    capacity: 1,
    isActive: true,
    shopName: "Aoyama Studio",
    createdAt: startsAt,
    updatedAt: startsAt
  };
  let auditFailure = false;
  const auditLogs: Array<Record<string, unknown>> = [];
  const bookingRepository = {
    listAvailableSlots: jest.fn(),
    listAvailabilityWindows: jest.fn(async () => ({ list: [availabilityWindow], total: 1, page: 1, page_size: 20 })),
    createAvailabilityWindow: jest.fn(async () => ({ outcome: "ok", window: availabilityWindow })),
    updateAvailabilityWindow: jest.fn(async () => ({ outcome: "ok", window: availabilityWindow })),
    deleteAvailabilityWindow: jest.fn(async () => ({ outcome: "ok", window: availabilityWindow })),
    createBooking: jest.fn(),
    listOrders: jest.fn(),
    findOrderById: jest.fn(),
    transitionOrder: jest.fn(),
    findScheduleSlotById: jest.fn(async () => slot),
    listScheduleSlots: jest.fn(async () => ({ list: [slot], total: 1, page: 1, page_size: 20 })),
    createScheduleSlot: jest.fn(async (input: { serviceId: number }) =>
      input.serviceId === 999 ? { outcome: "not_found" } : { outcome: "ok", slot }
    ),
    updateScheduleSlot: jest.fn(async () => ({ outcome: "ok", slot })),
    deleteScheduleSlot: jest.fn(async () => ({ outcome: "ok", slot }))
  };
  const app = createApp(undefined, {
    redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
    authRepository: {
      findUserByEmail: jest.fn(
        async (email: string) => users.find((user) => user.email === email) ?? null
      ),
      findUserByLoginIdentifier: jest.fn(
        async (identifier: string) => users.find((user) => user.email === identifier) ?? null
      ),
      findUserById: jest.fn(async (id: number) => users.find((user) => user.id === id) ?? null),
      updateLastLoginAt: jest.fn(async () => undefined),
      createLoginLog: jest.fn(async () => undefined),
      createAuditLog: jest.fn(async () => undefined)
    },
    testOnlyAllowLegacyAuthAdapters: true,
    authSessionStore: new InMemorySessionStore(),
    otpDeliveryClient: { sendOtp: jest.fn(async () => undefined) },
    auditLogRepository: {
      create: jest.fn(async (entry: Record<string, unknown>) => {
        if (auditFailure) throw new Error("audit unavailable");
        auditLogs.push(entry);
      })
    },
    bookingRepository,
    merchantShopContextRepository: createDirectShopContextRepository({ shopId: 11 })
  } as never);
  const login = async (email: string) => {
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({ loginIdentifier: email, password: "Abcd@1234" })
      .expect(200);
    return response.body.data.accessToken as string;
  };
  return {
    app,
    auditLogs,
    bookingRepository,
    login,
    setAuditFailure: (value: boolean) => {
      auditFailure = value;
    }
  };
};

describe("schedule slot write APIs", () => {
  it("preloads every schedule scope linked to the authenticated account", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("merchant@example.com");

    await request(fixture.app)
      .get(
        `/api/v1/schedule/preload?from=${encodeURIComponent(startsAt.toISOString())}&to=${encodeURIComponent(endsAt.toISOString())}&page=1&pageSize=100`
      )
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toMatchObject({
          merchant: { identityId: 1, shopId: 11, list: [{ id: 10 }] },
          technician: { identityId: 3, technicianProfileId: 31, list: [{ id: 10 }] }
        });
      });

    expect(fixture.bookingRepository.listScheduleSlots).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "merchant", shopId: 11 })
    );
    expect(fixture.bookingRepository.listScheduleSlots).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "technician", technicianProfileId: 31 })
    );
  });

  it("rejects client-supplied scope ids and oversized preload windows", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("merchant@example.com");
    const authorization = { Authorization: `Bearer ${token}` };

    await request(fixture.app)
      .get(
        `/api/v1/schedule/preload?from=${encodeURIComponent(startsAt.toISOString())}&to=${encodeURIComponent(endsAt.toISOString())}&shopId=11`
      )
      .set(authorization)
      .expect(400);
    await request(fixture.app)
      .get(
        `/api/v1/schedule/preload?from=${encodeURIComponent(startsAt.toISOString())}&to=${encodeURIComponent(new Date(startsAt.getTime() + 94 * 24 * 60 * 60_000).toISOString())}`
      )
      .set(authorization)
      .expect(400);

    expect(fixture.bookingRepository.listScheduleSlots).not.toHaveBeenCalled();
  });

  it("creates and lists independent technician availability windows through authenticated formal routes", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("technician@example.com");
    const auth = { Authorization: `Bearer ${token}` };
    const windowEndsAt = new Date(startsAt.getTime() + 6 * 60 * 60_000);

    await request(fixture.app)
      .post("/api/v1/technician/availability-windows")
      .set(auth)
      .send({ startsAt: startsAt.toISOString(), endsAt: windowEndsAt.toISOString(), capacity: 1 })
      .expect(201)
      .expect((response) => expect(response.body.data.sourceType).toBe("technician"));
    await request(fixture.app)
      .get(`/api/v1/technician/availability-windows?from=${encodeURIComponent(startsAt.toISOString())}&to=${encodeURIComponent(windowEndsAt.toISOString())}`)
      .set(auth)
      .expect(200)
      .expect((response) => expect(response.body.data.list).toHaveLength(1));

    expect(fixture.bookingRepository.createAvailabilityWindow).toHaveBeenCalledWith(expect.objectContaining({
      scope: "technician",
      technicianProfileId: 31
    }));
    expect(fixture.auditLogs.some((entry) => entry.action === "technician.availability_window.create")).toBe(true);
  });

  it("reads only the numeric schedule slot in the authenticated technician scope", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("technician@example.com");
    const auth = { Authorization: `Bearer ${token}` };

    await request(fixture.app)
      .get("/api/v1/technician/schedule/slots/10")
      .set(auth)
      .expect(200)
      .expect((response) => expect(response.body.data.id).toBe(10));

    expect(fixture.bookingRepository.findScheduleSlotById).toHaveBeenCalledWith({
      scope: "technician",
      technicianProfileId: 31,
      id: 10
    });

    await request(fixture.app)
      .get("/api/v1/technician/schedule/slots/not-a-number")
      .set(auth)
      .expect(400);

    fixture.bookingRepository.findScheduleSlotById.mockResolvedValueOnce(null as never);
    await request(fixture.app)
      .get("/api/v1/technician/schedule/slots/99")
      .set(auth)
      .expect(404)
      .expect((response) => expect(response.body.message).toBe("error.schedule.slot_not_found"));
  });

  it("requires schedule list permission for technician slot detail", async () => {
    const fixture = await createFixture({ technicianPermissions: ["auth:me"] });
    const token = await fixture.login("technician@example.com");

    await request(fixture.app)
      .get("/api/v1/technician/schedule/slots/10")
      .set("Authorization", `Bearer ${token}`)
      .expect(403);

    expect(fixture.bookingRepository.findScheduleSlotById).not.toHaveBeenCalled();
  });

  it("lists and creates merchant slots with strict offset timestamps and authenticated shop scope", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("merchant@example.com");
    const auth = { Authorization: `Bearer ${token}` };

    await request(fixture.app)
      .get(
        `/api/v1/merchant-admin/schedule/slots?from=${encodeURIComponent(startsAt.toISOString())}&to=${encodeURIComponent(endsAt.toISOString())}&page=1&pageSize=20`
      )
      .set(auth)
      .expect(200);
    await request(fixture.app)
      .post("/api/v1/merchant-admin/schedule/slots")
      .set(auth)
      .send({
        serviceId: 20,
        technicianProfileId: 31,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        capacity: 1
      })
      .expect(201);
    await request(fixture.app)
      .post("/api/v1/merchant-admin/schedule/slots")
      .set(auth)
      .send({
        serviceId: 20,
        technicianProfileId: 31,
        startsAt: "2026-08-26T10:00:00",
        endsAt: "2026-08-26T11:00:00",
        capacity: 1
      })
      .expect(400);

    expect(fixture.bookingRepository.listScheduleSlots).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "merchant", shopId: 11 })
    );
    expect(fixture.bookingRepository.createScheduleSlot).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "merchant", shopId: 11, serviceId: 20 })
    );
    expect(
      fixture.auditLogs.some((entry) => entry.action === "merchant_admin.schedule_slot.create")
    ).toBe(true);
  });

  it("derives technician scope and returns 404 for inaccessible shop services", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("technician@example.com");
    const auth = { Authorization: `Bearer ${token}` };

    await request(fixture.app)
      .post("/api/v1/technician/schedule/slots")
      .set(auth)
      .send({
        serviceId: 20,
        technicianProfileId: 999,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        capacity: 1
      })
      .expect(201);
    await request(fixture.app)
      .post("/api/v1/technician/schedule/slots")
      .set(auth)
      .send({
        serviceId: 999,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        capacity: 1
      })
      .expect(404)
      .expect((response) => expect(response.body.code).toBe(ERROR_CODES.NOT_FOUND));

    expect(fixture.bookingRepository.createScheduleSlot).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "technician", technicianProfileId: 31 })
    );
    expect(fixture.bookingRepository.createScheduleSlot).not.toHaveBeenCalledWith(
      expect.objectContaining({ technicianProfileId: 999 })
    );
  });

  it("fails the request when schedule audit persistence fails", async () => {
    const fixture = await createFixture();
    const token = await fixture.login("merchant@example.com");
    fixture.setAuditFailure(true);
    await request(fixture.app)
      .patch("/api/v1/merchant-admin/schedule/slots/10")
      .set("Authorization", `Bearer ${token}`)
      .send({ capacity: 2 })
      .expect(500);
  });
});
