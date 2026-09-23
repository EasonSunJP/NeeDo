import type { PrismaClient } from "@prisma/client";
import { MerchantSaasBillingRepository } from "../src/repositories/merchant-saas-billing.repository";

describe("MerchantSaasBillingRepository billing transitions", () => {
  it("initializes a legacy group profile only for version zero and then applies the edit", async () => {
    const changedAt = new Date("2026-09-23T00:00:00.000Z");
    const base = {
      id: 25, subjectType: "merchant_account", subjectId: 5, billingCadence: "monthly",
      monthlyFeeJpy: 9800, cadenceLocked: false, amountLocked: false,
      trialStatus: "not_started", trialStartedAt: null, trialEndsAt: null, trialUsedAt: null,
      paidThrough: null, paymentProvider: "manual", version: 1, freePeriods: []
    };
    const tx = {
      merchantAccount: { findFirst: jest.fn(async () => ({ id: 5 })) },
      saasBillingProfile: {
        findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(base)
          .mockResolvedValueOnce({ ...base, billingCadence: "free", version: 2, freePeriods: [] }),
        createMany: jest.fn(async () => ({ count: 1 })),
        updateMany: jest.fn(async () => ({ count: 1 }))
      },
      saasFreePeriod: { create: jest.fn(async () => ({ id: 1 })) }
    };
    const client = { $transaction: jest.fn(async (callback: (database: typeof tx) => unknown) => callback(tx)) } as unknown as PrismaClient;
    const repository = new MerchantSaasBillingRepository(client);

    const result = await repository.updateBillingProfile({
      subjectType: "merchant_account", subjectId: 5, billingCadence: "free",
      monthlyFeeJpy: 9800, cadenceLocked: true, amountLocked: true,
      paymentProvider: "manual", version: 0, actorUserId: 1, changedAt
    });

    expect(tx.saasBillingProfile.createMany).toHaveBeenCalledWith(expect.objectContaining({
      skipDuplicates: true,
      data: expect.objectContaining({ merchantAccountId: 5, activeKey: "merchant:5" })
    }));
    expect(tx.saasBillingProfile.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 25, version: 1 }),
      data: expect.objectContaining({ billingCadence: "free" })
    }));
    expect(result?.after.version).toBe(2);
  });
  it("interrupts an active trial and opens an auditable manual-free period", async () => {
    const changedAt = new Date("2026-09-10T03:00:00.000Z");
    const before = {
      id: 21,
      subjectType: "shop",
      subjectId: 11,
      merchantAccountId: null,
      shopId: 11,
      activeKey: "shop:11",
      billingCadence: "monthly",
      monthlyFeeJpy: 9800,
      cadenceLocked: false,
      amountLocked: false,
      trialStatus: "active",
      trialStartedAt: new Date("2026-08-01T00:00:00.000Z"),
      trialEndsAt: new Date("2026-11-01T00:00:00.000Z"),
      trialUsedAt: new Date("2026-08-01T00:00:00.000Z"),
      paidThrough: null,
      paymentProvider: "manual",
      version: 1,
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      updatedAt: new Date("2026-08-01T00:00:00.000Z"),
      deletedAt: null,
      freePeriods: []
    };
    const after = {
      ...before,
      billingCadence: "free",
      cadenceLocked: true,
      trialStatus: "interrupted",
      trialEndsAt: changedAt,
      version: 2,
      freePeriods: [
        {
          id: 91,
          billingProfileId: 21,
          periodType: "manual_free",
          startsAt: changedAt,
          endsAt: null,
          extensionSequence: null,
          reason: "Administrative free billing lock",
          idempotencyKey: "profile:21:manual-free:v1",
          createdById: 1,
          createdAt: changedAt,
          updatedAt: changedAt,
          deletedAt: null
        }
      ]
    };
    const tx = {
      saasBillingProfile: {
        findFirst: jest.fn().mockResolvedValueOnce(before).mockResolvedValueOnce(after),
        updateMany: jest.fn(async () => ({ count: 1 }))
      },
      technicianProfile: { count: jest.fn(async () => 2) },
      saasFreePeriod: {
        updateMany: jest.fn(async () => ({ count: 0 })),
        create: jest.fn(async () => after.freePeriods[0])
      }
    };
    const client = {
      $transaction: jest.fn(async (callback: (database: typeof tx) => unknown) => callback(tx))
    } as unknown as PrismaClient;
    const repository = new MerchantSaasBillingRepository(client);

    const result = await repository.updateBillingProfile({
      subjectType: "shop",
      subjectId: 11,
      billingCadence: "free",
      monthlyFeeJpy: 9800,
      cadenceLocked: true,
      amountLocked: false,
      paymentProvider: "manual",
      version: 1,
      actorUserId: 1,
      changedAt
    });

    expect(tx.saasBillingProfile.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          billingCadence: "free",
          trialStatus: "interrupted",
          trialEndsAt: changedAt
        })
      })
    );
    expect(tx.saasFreePeriod.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        billingProfileId: 21,
        periodType: "manual_free",
        startsAt: changedAt,
        endsAt: null,
        createdById: 1
      })
    });
    expect(result?.after).toMatchObject({
      billingCadence: "free",
      trialStatus: "interrupted",
      freePeriods: [expect.objectContaining({ periodType: "manual_free", endsAt: null })]
    });
  });

  it("materializes one consolidated group invoice with the group and four billable shop lines", async () => {
    const periodStartsAt = new Date("2026-08-31T15:00:00.000Z");
    const groupProfile = {
      subjectType: "merchant_account",
      subjectId: 5,
      merchantAccountId: 5,
      shopId: null,
      billingCadence: "monthly",
      monthlyFeeJpy: 9800,
      trialStatus: "completed",
      trialEndsAt: periodStartsAt,
      paidThrough: null,
      paymentProvider: "manual"
    };
    const shopProfiles = [11, 12, 13, 14].map((shopId) => ({
      subjectType: "shop",
      subjectId: shopId,
      merchantAccountId: null,
      shopId,
      billingCadence: "monthly",
      monthlyFeeJpy: 9800,
      trialStatus: "completed",
      trialEndsAt: periodStartsAt,
      paidThrough: null,
      paymentProvider: "manual"
    }));
    const tx = {
      saasInvoice: {
        updateMany: jest.fn(async () => ({ count: 0 })),
        findFirst: jest.fn(async () => null),
        upsert: jest.fn(async () => ({ id: 30 }))
      },
      saasBillingProfile: {
        findMany: jest.fn(async () => [groupProfile, ...shopProfiles])
      },
      shop: {
        findMany: jest.fn(async () =>
          shopProfiles.map((profile) => ({ id: profile.shopId, name: `Shop ${profile.shopId}` }))
        )
      },
      technicianProfile: {
        groupBy: jest.fn(async () =>
          shopProfiles.map((profile) => ({ shopId: profile.shopId, _count: { _all: 2 } }))
        )
      },
      merchantShopMembership: {
        findMany: jest.fn(async () =>
          shopProfiles.map((profile) => ({
            shopId: profile.shopId,
            merchantAccountId: 5,
            merchantAccount: {
              name: "Tokyo Wellness Group",
              paymentResponsibility: "group_consolidated"
            }
          }))
        )
      },
      merchantAccount: {
        findMany: jest.fn(async () => [
          {
            id: 5,
            name: "Tokyo Wellness Group",
            paymentResponsibility: "group_consolidated"
          }
        ])
      },
      saasInvoiceLine: {
        upsert: jest.fn(async () => ({ id: 1 }))
      }
    };
    const client = {
      $transaction: jest.fn(async (callback: (database: typeof tx) => unknown) => callback(tx))
    } as unknown as PrismaClient;
    const repository = new MerchantSaasBillingRepository(client);

    const result = await repository.materializeDueInvoices({
      now: new Date("2026-08-25T00:00:00+09:00")
    });

    expect(result).toEqual([
      expect.objectContaining({
        payerType: "merchant_account",
        payerId: 5,
        amountJpy: 49000,
        lineCount: 5,
        periodStartsAt,
        periodEndsAt: new Date("2026-09-30T15:00:00.000Z")
      })
    ]);
    expect(tx.saasInvoice.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ amountJpy: 49000, status: "pending" })
      })
    );
    expect(tx.saasInvoiceLine.upsert).toHaveBeenCalledTimes(5);
  });
});
