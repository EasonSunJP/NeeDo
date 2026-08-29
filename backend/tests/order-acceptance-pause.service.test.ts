import { ERROR_CODES } from "../src/constants/error-codes";
import {
  OrderAcceptancePauseService,
  type OrderAcceptancePausePayload,
  type OrderAcceptancePauseRepositoryPort
} from "../src/services/order-acceptance-pause.service";
import type { AuthenticatedAccessContext } from "../src/services/auth.service";

const pause: OrderAcceptancePausePayload = {
  id: 41,
  subjectType: "shop",
  subjectId: 11,
  merchantAccountId: null,
  merchantAccountName: null,
  shopId: 11,
  shopName: "Aoyama Care",
  authorityType: "operations",
  status: "active",
  reasonCode: "risk_review",
  reasonDetail: "Manual risk review",
  startsAt: new Date("2026-08-29T01:00:00.000Z"),
  releasedAt: null,
  releaseReason: null,
  createdAt: new Date("2026-08-29T01:00:00.000Z"),
  updatedAt: new Date("2026-08-29T01:00:00.000Z")
};

const operationsActor: AuthenticatedAccessContext = {
  userId: 1,
  email: "admin@lifedance.com",
  roles: ["admin"],
  permissions: [],
  currentIdentityScopeType: "global",
  currentIdentityScopeId: null,
  accessTokenJti: "operations-jti",
  accessTokenExpiresAt: 1_800_000_000
};

const merchantActor: AuthenticatedAccessContext = {
  ...operationsActor,
  userId: 2,
  roles: ["merchant_owner"],
  currentIdentityScopeType: "merchant_account",
  currentIdentityScopeId: 7
};

const shopActor: AuthenticatedAccessContext = {
  ...operationsActor,
  userId: 3,
  roles: ["merchant_staff"],
  currentIdentityScopeType: "shop",
  currentIdentityScopeId: 11
};

const createRepository = (): jest.Mocked<OrderAcceptancePauseRepositoryPort> => ({
  listPauses: jest.fn().mockResolvedValue({ list: [pause], total: 1, page: 1, pageSize: 20 }),
  createPause: jest.fn().mockResolvedValue({ kind: "created", value: pause }),
  releasePause: jest.fn().mockResolvedValue({
    kind: "released",
    value: {
      ...pause,
      status: "released",
      releasedAt: new Date("2026-08-29T02:00:00.000Z"),
      releaseReason: "Review complete"
    }
  })
});

const auditInputFactory = {
  createInput: jest.fn((input) => input)
};

describe("OrderAcceptancePauseService", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates an operations shop pause with a transaction-ready audit record", async () => {
    const repository = createRepository();
    const service = new OrderAcceptancePauseService(repository, auditInputFactory as never);

    await expect(
      service.createPause(operationsActor, {} as never, {
        subjectType: "shop",
        subjectId: 11,
        reasonCode: "risk_review",
        reasonDetail: "Manual risk review"
      })
    ).resolves.toEqual(pause);

    expect(repository.createPause).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: 1,
        actorScope: { authorityType: "operations" },
        subjectType: "shop",
        subjectId: 11,
        reasonCode: "risk_review",
        reasonDetail: "Manual risk review",
        audit: expect.objectContaining({
          action: "backoffice.order_acceptance_pause.create"
        })
      })
    );
  });

  it("preserves merchant-account and shop identity scope for repository enforcement", async () => {
    const repository = createRepository();
    const service = new OrderAcceptancePauseService(repository, auditInputFactory as never);

    await service.createPause(merchantActor, {} as never, {
      subjectType: "merchant_account",
      subjectId: 7,
      reasonCode: "merchant_manual",
      reasonDetail: "Group pause"
    });
    await service.createPause(shopActor, {} as never, {
      subjectType: "shop",
      subjectId: 11,
      reasonCode: "shop_manual",
      reasonDetail: "Shop pause"
    });

    expect(repository.createPause).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        actorScope: {
          authorityType: "merchant",
          scopeType: "merchant_account",
          scopeId: 7
        }
      })
    );
    expect(repository.createPause).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        actorScope: { authorityType: "shop", scopeType: "shop", scopeId: 11 }
      })
    );
  });

  it("fails closed for identities that cannot control acceptance", async () => {
    const repository = createRepository();
    const service = new OrderAcceptancePauseService(repository, auditInputFactory as never);

    await expect(
      service.listPauses(
        { ...operationsActor, roles: ["customer"], currentIdentityScopeType: "customer_profile" },
        { page: 1, pageSize: 20 }
      )
    ).rejects.toMatchObject({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      statusCode: 403
    });
    expect(repository.listPauses).not.toHaveBeenCalled();
  });

  it("does not let a merchant or shop release an operations pause", async () => {
    const repository = createRepository();
    repository.releasePause.mockResolvedValue({ kind: "scope_forbidden" });
    const service = new OrderAcceptancePauseService(repository, auditInputFactory as never);

    await expect(
      service.releasePause(merchantActor, {} as never, 41, { releaseReason: "override" })
    ).rejects.toMatchObject({
      code: ERROR_CODES.IDENTITY_FORBIDDEN,
      statusCode: 403
    });
  });
});
