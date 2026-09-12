import { SchedulePreloadService } from "../src/services/schedule-preload.service";

const slotPage = (scopeLabel: string) => ({
  list: [{ id: scopeLabel === "merchant" ? 11 : 22 }],
  page: 1,
  page_size: 100,
  total: 1
});

describe("SchedulePreloadService", () => {
  it("loads the authenticated account's merchant and technician scopes without using the active identity", async () => {
    const identityRepository = {
      findUserById: jest.fn(async () => ({
        id: 7,
        isActive: true,
        deletedAt: null,
        identities: [
          { id: 70, type: "customer", scopeType: "customer_profile", scopeId: 7, isActive: true, deletedAt: null },
          { id: 71, type: "merchant_organization", scopeType: "merchant_account", scopeId: 41, isActive: true, deletedAt: null },
          { id: 72, type: "technician", scopeType: "technician_profile", scopeId: 31, isActive: true, deletedAt: null }
        ]
      }))
    };
    const merchantShopRepository = {
      resolveDefaultShop: jest.fn(async () => ({ shopId: 12, shopPublicId: "shop0000000012" })),
      resolveShop: jest.fn(),
      listManageableShops: jest.fn()
    };
    const scheduleRepository = {
      listScheduleSlots: jest.fn(async (input: { scope: string }) => slotPage(input.scope))
    };
    const service = new SchedulePreloadService(
      identityRepository as never,
      merchantShopRepository,
      scheduleRepository as never,
      () => new Date("2026-09-13T00:00:00.000Z")
    );
    const from = new Date("2026-09-13T00:00:00.000Z");
    const to = new Date("2026-09-27T00:00:00.000Z");

    const result = await service.preload(
      {
        userId: 7,
        email: "owner@example.com",
        accessTokenJti: "access-1",
        accessTokenExpiresAt: 2_000_000_000,
        currentIdentityId: 70,
        currentIdentityType: "customer",
        currentIdentityScopeType: "customer_profile",
        currentIdentityScopeId: 7,
        roles: ["customer"],
        permissions: ["page:merchant-app", "page:technician-app"]
      },
      { from, to, page: 1, pageSize: 100 }
    );

    expect(scheduleRepository.listScheduleSlots).toHaveBeenCalledTimes(2);
    expect(scheduleRepository.listScheduleSlots).toHaveBeenCalledWith({
      from,
      page: 1,
      pageSize: 100,
      scope: "merchant",
      shopId: 12,
      to
    });
    expect(scheduleRepository.listScheduleSlots).toHaveBeenCalledWith({
      from,
      page: 1,
      pageSize: 100,
      scope: "technician",
      technicianProfileId: 31,
      to
    });
    expect(result).toMatchObject({
      fetchedAt: "2026-09-13T00:00:00.000Z",
      merchant: { identityId: 71, shopId: 12, list: [{ id: 11 }] },
      technician: { identityId: 72, technicianProfileId: 31, list: [{ id: 22 }] }
    });
  });

  it("ignores inactive identities and returns null resources", async () => {
    const service = new SchedulePreloadService(
      {
        findUserById: jest.fn(async () => ({
          id: 8,
          isActive: true,
          deletedAt: null,
          identities: [
            { id: 81, type: "merchant_owner", scopeType: "shop", scopeId: 12, isActive: false, deletedAt: null },
            { id: 82, type: "technician", scopeType: "technician_profile", scopeId: 31, isActive: true, deletedAt: new Date() }
          ]
        }))
      } as never,
      { resolveDefaultShop: jest.fn(), resolveShop: jest.fn(), listManageableShops: jest.fn() },
      { listScheduleSlots: jest.fn() } as never
    );

    await expect(service.preload(
      {
        userId: 8,
        email: "customer@example.com",
        accessTokenJti: "access-2",
        accessTokenExpiresAt: 2_000_000_000,
        currentIdentityId: 80,
        roles: ["customer"],
        permissions: []
      },
      {
        from: new Date("2026-09-13T00:00:00.000Z"),
        to: new Date("2026-09-27T00:00:00.000Z"),
        page: 1,
        pageSize: 100
      }
    )).resolves.toMatchObject({ merchant: null, technician: null });
  });

  it("uses the already-authorized selected shop for the active merchant identity", async () => {
    const merchantShopRepository = {
      resolveDefaultShop: jest.fn(),
      resolveShop: jest.fn(),
      listManageableShops: jest.fn()
    };
    const scheduleRepository = { listScheduleSlots: jest.fn(async () => slotPage("merchant")) };
    const service = new SchedulePreloadService(
      {
        findUserById: jest.fn(async () => ({
          id: 9,
          isActive: true,
          deletedAt: null,
          identities: [
            { id: 91, type: "merchant_organization", scopeType: "merchant_account", scopeId: 41, isActive: true, deletedAt: null }
          ]
        }))
      } as never,
      merchantShopRepository,
      scheduleRepository as never
    );

    await service.preload({
      userId: 9,
      email: "owner@example.com",
      accessTokenJti: "access-3",
      accessTokenExpiresAt: 2_000_000_000,
      currentIdentityId: 91,
      currentIdentityType: "merchant_organization",
      currentIdentityScopeType: "merchant_account",
      currentIdentityScopeId: 41,
      selectedMerchantShopId: 22,
      selectedMerchantShopPublicId: "shop0000000022",
      roles: ["merchant_owner"],
      permissions: ["page:merchant-app"]
    }, {
      from: new Date("2026-09-13T00:00:00.000Z"),
      to: new Date("2026-09-27T00:00:00.000Z"),
      page: 1,
      pageSize: 100
    });

    expect(merchantShopRepository.resolveDefaultShop).not.toHaveBeenCalled();
    expect(scheduleRepository.listScheduleSlots).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "merchant", shopId: 22 })
    );
  });

  it("loads only schedule scopes whose portal permission is enabled", async () => {
    const scheduleRepository = { listScheduleSlots: jest.fn(async () => slotPage("merchant")) };
    const service = new SchedulePreloadService(
      {
        findUserById: jest.fn(async () => ({
          id: 10,
          isActive: true,
          deletedAt: null,
          identities: [
            { id: 101, type: "merchant_owner", scopeType: "shop", scopeId: 12, isActive: true, deletedAt: null },
            { id: 102, type: "technician", scopeType: "technician_profile", scopeId: 31, isActive: true, deletedAt: null }
          ]
        }))
      } as never,
      { resolveDefaultShop: jest.fn(), resolveShop: jest.fn(), listManageableShops: jest.fn() },
      scheduleRepository as never
    );

    const result = await service.preload({
      userId: 10,
      email: "owner@example.com",
      accessTokenJti: "access-4",
      accessTokenExpiresAt: 2_000_000_000,
      currentIdentityId: 101,
      currentIdentityType: "merchant_owner",
      currentIdentityScopeType: "shop",
      currentIdentityScopeId: 12,
      selectedMerchantShopId: 12,
      selectedMerchantShopPublicId: "shop0000000012",
      roles: ["merchant_owner"],
      permissions: ["page:merchant-app"]
    }, {
      from: new Date("2026-09-13T00:00:00.000Z"),
      to: new Date("2026-09-27T00:00:00.000Z")
    });

    expect(scheduleRepository.listScheduleSlots).toHaveBeenCalledTimes(1);
    expect(scheduleRepository.listScheduleSlots).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "merchant", shopId: 12 })
    );
    expect(result.technician).toBeNull();
  });
});
