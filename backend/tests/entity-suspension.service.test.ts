import type { AuthRequestContext, AuthenticatedAccessContext } from "../src/services/auth.service";
import {
  MerchantSaasBillingService,
  type MerchantSaasBillingRepositoryPort
} from "../src/services/merchant-saas-billing.service";

const actor = {
  userId: 1,
  roles: ["admin"],
  currentIdentityId: 1,
  currentIdentityType: "platform",
  currentIdentityScopeType: "global",
  currentIdentityScopeId: null,
  permissions: []
} as unknown as AuthenticatedAccessContext;

const context = { ip: "127.0.0.1", userAgent: "jest" } as AuthRequestContext;

const makeRepository = () =>
  ({
    createSuspension: jest.fn(async (input) => ({
      id: 70,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      scope: input.scope,
      reasonCodes: input.reasonCodes,
      note: input.note,
      startsAt: new Date("2026-08-25T00:00:00.000Z"),
      affectedShopIds: input.subjectType === "shop" ? [input.subjectId] : [11, 12],
      detachedShopIds: input.scope === "merchant_detach_shops" ? [11, 12] : [],
      promotedAdminUserIds: input.scope === "merchant_detach_shops" ? [101, 102] : []
    })),
    releaseSuspension: jest.fn(async () => ({
      id: 70,
      subjectType: "shop",
      subjectId: 11,
      releasedAt: new Date("2026-08-26T00:00:00.000Z")
    })),
    softDeleteMerchant: jest.fn(async () => ({ deleted: true, blockedShopIds: [] })),
    softDeleteShop: jest.fn(async () => ({ deleted: true, activeOrderCount: 0 }))
  }) as unknown as jest.Mocked<MerchantSaasBillingRepositoryPort>;

describe("manual entity suspension service", () => {
  it("suspends a shop without cancelling bookings or disabling login", async () => {
    const repository = makeRepository();
    const audit = { record: jest.fn(async () => undefined) };
    const service = new MerchantSaasBillingService(repository, audit);

    const result = await service.createSuspension(actor, context, "shop", 11, {
      reasonCodes: ["overdue_payment", "customer_complaints"],
      note: "Manual operations review",
      scope: "subject_only"
    });

    expect(repository.createSuspension).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectType: "shop",
        subjectId: 11,
        actorUserId: 1,
        scope: "subject_only"
      })
    );
    expect(result).toMatchObject({ affectedShopIds: [11], detachedShopIds: [] });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "backoffice.entity_suspension.create",
        targetType: "shop",
        targetId: 11
      })
    );
  });

  it("detaches group shops and promotes their current highest-permission accounts", async () => {
    const repository = makeRepository();
    const service = new MerchantSaasBillingService(repository, {
      record: jest.fn(async () => undefined)
    });

    const result = await service.createSuspension(actor, context, "merchant_account", 5, {
      reasonCodes: ["serious_service_violation"],
      note: "Suspend group only and preserve child shops",
      scope: "merchant_detach_shops"
    });

    expect(repository.createSuspension).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectType: "merchant_account",
        subjectId: 5,
        scope: "merchant_detach_shops",
        actorUserId: 1
      })
    );
    expect(result).toMatchObject({
      affectedShopIds: [11, 12],
      detachedShopIds: [11, 12],
      promotedAdminUserIds: [101, 102]
    });
  });

  it("releases the restriction without restoring blocked availability", async () => {
    const repository = makeRepository();
    const service = new MerchantSaasBillingService(repository, {
      record: jest.fn(async () => undefined)
    });

    const result = await service.releaseSuspension(actor, context, "shop", 11, 70, {
      reason: "Compliance review completed"
    });

    expect(repository.releaseSuspension).toHaveBeenCalledWith({
      subjectType: "shop",
      subjectId: 11,
      suspensionId: 70,
      reason: "Compliance review completed",
      actorUserId: 1
    });
    expect(result.releasedAt).toBe("2026-08-26T00:00:00.000Z");
  });
});
