import type { PrismaClient } from "@prisma/client";
import { OrderAcceptancePauseRepository } from "../src/repositories/order-acceptance-pause.repository";

const now = new Date("2026-08-29T00:00:00.000Z");

const pauseRecord = (status: "ACTIVE" | "RELEASED") => ({
  id: 71,
  subjectType: "SHOP" as const,
  merchantAccountId: null,
  shopId: 11,
  authorityType: "OPERATIONS" as const,
  status,
  reasonCode: "risk_review",
  reasonDetail: "Internal review",
  createdById: 1,
  releasedById: status === "RELEASED" ? 1 : null,
  startsAt: now,
  releasedAt: status === "RELEASED" ? now : null,
  releaseReason: status === "RELEASED" ? "complete" : null,
  activeKey: status === "ACTIVE" ? "operations:shop:11" : null,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
  merchantAccount: null,
  shop: { id: 11, name: "Aoyama Care" }
});

describe("OrderAcceptancePauseRepository", () => {
  it("keeps actor visibility and caller filters in separate AND clauses", async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const repository = new OrderAcceptancePauseRepository({
      orderAcceptancePause: { findMany, count }
    } as unknown as PrismaClient);

    await repository.listPauses(
      {
        authorityType: "merchant",
        scopeType: "merchant_account",
        scopeId: 41
      },
      { subjectId: 999, page: 1, pageSize: 20 }
    );

    const where = findMany.mock.calls[0][0].where as { AND: unknown[] };
    expect(where.AND).toHaveLength(3);
    expect(where.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ deletedAt: null }),
        expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              subjectType: "MERCHANT_ACCOUNT",
              merchantAccountId: 41
            })
          ])
        }),
        {
          OR: [{ merchantAccountId: 999 }, { shopId: 999 }]
        }
      ])
    );
    expect(count).toHaveBeenCalledWith({ where });
  });

  it("re-reads after the subject lock so concurrent release is idempotent", async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(pauseRecord("ACTIVE"))
      .mockResolvedValueOnce(pauseRecord("RELEASED"));
    const updateMany = jest.fn();
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 11 }]),
      orderAcceptancePause: { findFirst, updateMany }
    };
    const repository = new OrderAcceptancePauseRepository({
      $transaction: jest.fn(async (handler) => handler(tx))
    } as unknown as PrismaClient);

    await expect(
      repository.releasePause({
        pauseId: 71,
        releaseReason: "complete",
        actorUserId: 1,
        actorScope: { authorityType: "operations" },
        audit: {
          actorId: 1,
          action: "backoffice.order_acceptance_pause.release",
          targetType: "OrderAcceptancePause"
        }
      })
    ).resolves.toMatchObject({ kind: "already_released", value: { status: "released" } });
    expect(findFirst).toHaveBeenCalledTimes(2);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
