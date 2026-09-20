import {
  ShopAutoDispatchRuleValidationError,
  type ShopAutoDispatchRepositoryPort
} from "../src/repositories/shop-auto-dispatch.repository";
import { ShopAutoDispatchService } from "../src/services/shop-auto-dispatch.service";
import {
  shopAutoDispatchRuleBodySchema,
  type ShopAutoDispatchRuleBody
} from "../src/validators/shop-auto-dispatch.validator";

const actor = {
  userId: 7,
  email: "merchant@example.test",
  accessTokenJti: "jti",
  accessTokenExpiresAt: Date.now() + 60_000,
  currentIdentityId: 70,
  currentIdentityType: "merchant_owner",
  currentIdentityScopeType: "shop",
  currentIdentityScopeId: 16,
  roles: ["merchant_owner"],
  permissions: ["schedule:slots:list", "schedule:slots:write"]
};
const context = { ip: "127.0.0.1", userAgent: "jest" };
const input = {
  enabled: true,
  startsOn: "2026-09-20",
  endsOn: "2026-10-20",
  startMinute: 600,
  endMinute: 1380,
  allowStore: true,
  allowHome: true,
  minimumRating: 4,
  minimumAcceptanceRate: 80,
  maximumCancellationRate: 20,
  dailyTechnicianLimit: 5,
  strategy: "preferred" as const,
  preferredTechnicianIds: [31],
  travelMinutesPerKm: 3,
  strictWindow: true
};
const payload = {
  ...input,
  id: 1,
  shopId: 16,
  candidates: [{ id: 31, displayName: "Misaki" }],
  createdAt: "2026-09-20T00:00:00.000Z",
  updatedAt: "2026-09-20T00:00:00.000Z"
};

describe("ShopAutoDispatchService", () => {
  it("rejects empty or overnight automatic-dispatch time ranges", () => {
    expect(shopAutoDispatchRuleBodySchema.safeParse({ ...input, startMinute: 600, endMinute: 600 }).success).toBe(false);
    expect(shopAutoDispatchRuleBodySchema.safeParse({ ...input, startMinute: 1380, endMinute: 600 }).success).toBe(false);
  });

  it("persists the selected shop rule and records the strategy and preferred employees", async () => {
    const repository: jest.Mocked<ShopAutoDispatchRepositoryPort> = {
      read: jest.fn(async (shopId: number) => { void shopId; return payload; }),
      replace: jest.fn(async (shopId: number, actorUserId: number, rule: ShopAutoDispatchRuleBody) => {
        void shopId;
        void actorUserId;
        void rule;
        return payload;
      })
    };
    const audit = { record: jest.fn(async () => undefined) };
    const service = new ShopAutoDispatchService(repository, audit);

    await expect(service.update(actor, context, input)).resolves.toEqual(payload);
    expect(repository.replace).toHaveBeenCalledWith(16, 7, input);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      action: "merchant_admin.auto_dispatch_rule.update",
      targetId: 16,
      metadata: expect.objectContaining({ strategy: "preferred", preferredTechnicianIds: [31] })
    }));
  });

  it("returns a public validation error when the preferred employee list becomes stale", async () => {
    const repository: jest.Mocked<ShopAutoDispatchRepositoryPort> = {
      read: jest.fn(async (shopId: number) => { void shopId; return payload; }),
      replace: jest.fn(async (shopId: number, actorUserId: number, rule: ShopAutoDispatchRuleBody) => {
        void shopId;
        void actorUserId;
        void rule;
        throw new ShopAutoDispatchRuleValidationError();
      })
    };
    const service = new ShopAutoDispatchService(repository, { record: jest.fn(async () => undefined) });

    await expect(service.update(actor, context, input)).rejects.toMatchObject({
      message: "error.auto_dispatch.technician_not_affiliated",
      statusCode: 400
    });
  });
});
