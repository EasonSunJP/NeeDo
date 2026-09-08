import { ERROR_CODES } from "../src/constants/error-codes";
import { ExchangeIntelligenceServiceService } from "../src/services/exchange-intelligence-service.service";
import type { ExchangeActorRecord } from "../src/services/exchange.service";

const page = { list: [], total: 0, page: 1, page_size: 20 };
const baseActor: ExchangeActorRecord = {
  userId: 7,
  identityId: 17,
  identityType: "merchant_staff",
  scopeType: "shop",
  scopeId: 11,
  publicId: "b0000000017",
  displayName: "青山ケア",
  avatarUrl: null,
  isTestAccount: true,
  customerMembership: null,
  shopScope: { shopId: 11, status: "published" }
};
const access = {
  userId: 7,
  currentIdentityId: 17,
  currentIdentityType: "merchant_staff",
  currentIdentityScopeType: "shop",
  currentIdentityScopeId: 11,
  currentPublicId: "b0000000017"
};

describe("ExchangeIntelligenceServiceService", () => {
  it("derives merchant scope from the resolved active identity", async () => {
    const repository = { listOptions: jest.fn(async () => page) };
    const actorResolver = { resolveActor: jest.fn(async () => baseActor) };
    const service = new ExchangeIntelligenceServiceService(repository, actorResolver, () =>
      new Date("2026-09-05T09:00:00.000Z")
    );

    await expect(service.listOptions(access as never, { page: 1, page_size: 20 })).resolves.toBe(
      page
    );
    expect(repository.listOptions).toHaveBeenCalledWith({
      scope: { kind: "merchant", shopId: 11 },
      page: 1,
      pageSize: 20,
      now: new Date("2026-09-05T09:00:00.000Z")
    });
  });

  it("derives technician scope and rejects customer or mismatched identity context", async () => {
    const repository = { listOptions: jest.fn(async () => page) };
    const technicianActor: ExchangeActorRecord = {
      ...baseActor,
      identityType: "technician",
      scopeType: "technician_profile",
      scopeId: 81,
      publicId: "s0000000081",
      shopScope: null
    };
    const actorResolver = {
      resolveActor: jest.fn(
        async (): Promise<ExchangeActorRecord | null> => technicianActor
      )
    };
    const service = new ExchangeIntelligenceServiceService(repository, actorResolver);

    await service.listOptions(
      {
        ...access,
        currentIdentityType: "technician",
        currentIdentityScopeType: "technician_profile",
        currentIdentityScopeId: 81,
        currentPublicId: "s0000000081"
      } as never,
      { page: 1, page_size: 20 }
    );
    expect(repository.listOptions).toHaveBeenCalledWith(
      expect.objectContaining({ scope: { kind: "technician", technicianProfileId: 81 } })
    );

    actorResolver.resolveActor.mockResolvedValueOnce({
      ...baseActor,
      identityType: "customer",
      scopeType: "customer_profile",
      scopeId: 31,
      shopScope: null
    });
    await expect(
      service.listOptions(
        {
          ...access,
          currentIdentityType: "customer",
          currentIdentityScopeType: "customer_profile",
          currentIdentityScopeId: 31
        } as never,
        { page: 1, page_size: 20 }
      )
    ).rejects.toMatchObject({ code: ERROR_CODES.IDENTITY_FORBIDDEN, statusCode: 403 });

    actorResolver.resolveActor.mockResolvedValueOnce(null);
    await expect(
      service.listOptions(access as never, { page: 1, page_size: 20 })
    ).rejects.toMatchObject({ code: ERROR_CODES.IDENTITY_FORBIDDEN, statusCode: 403 });
  });
});
