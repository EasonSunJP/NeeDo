import { BackofficeUserUsageService } from "../src/services/backoffice-user-usage.service";

const operationsActor = {
  userId: 9,
  email: "ops@example.test",
  accessTokenJti: "jti",
  accessTokenExpiresAt: 1,
  currentIdentityScopeType: "platform",
  roles: ["operations"],
  permissions: []
};

const audit = {
  createInput: jest.fn((input) => ({
    actorId: input.actor.userId,
    action: input.action,
    targetType: input.targetType
  }))
} as never;

describe("BackofficeUserUsageService", () => {
  it("resolves Tokyo bounds before applying merchant scope and pagination", async () => {
    const listUsage = jest.fn(async () => ({
      list: [],
      total: 0,
      page: 1,
      page_size: 10 as const
    }));
    const service = new BackofficeUserUsageService(
      {
        listUsage,
        getTimeline: jest.fn(),
        createCommentWithAudit: jest.fn(),
        createRefundAmendmentWithAudit: jest.fn()
      },
      audit,
      () => new Date("2026-09-07T03:00:00.000Z")
    );
    await service.listForMerchant(
      {
        ...operationsActor,
        currentIdentityType: "merchant",
        currentIdentityScopeType: "shop",
        currentIdentityScopeId: 11
      },
      41,
      { page: 1, page_size: 10, period: "last7days" }
    );
    expect(listUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "merchant",
        shopId: 11,
        userId: 41,
        pageSize: 10,
        from: new Date("2026-08-31T15:00:00.000Z"),
        to: new Date("2026-09-07T15:00:00.000Z")
      })
    );
  });

  it("maps missing refunds and stale versions without changing booking facts", async () => {
    const createRefundAmendmentWithAudit = jest
      .fn()
      .mockResolvedValueOnce({ kind: "refund_not_found" })
      .mockResolvedValueOnce({ kind: "version_conflict" });
    const service = new BackofficeUserUsageService(
      {
        listUsage: jest.fn(),
        getTimeline: jest.fn(),
        createCommentWithAudit: jest.fn(),
        createRefundAmendmentWithAudit
      },
      audit
    );
    const input = { note: "Confirmed", reason: "Evidence", expectedVersion: 0 };
    await expect(
      service.amendRefund(operationsActor, { ip: "127.0.0.1" }, 41, 88, input)
    ).rejects.toMatchObject({ statusCode: 422 });
    await expect(
      service.amendRefund(operationsActor, { ip: "127.0.0.1" }, 41, 88, input)
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});
