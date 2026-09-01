import { calculateNdpExperienceReversal } from "../src/domain/user-experience";
import {
  PlatformMembershipTierCode,
  UserExperienceEventType,
  type PrismaClient
} from "@prisma/client";
import { UserExperienceRepository } from "../src/repositories/user-experience.repository";

const original = {
  ndpAmount: 1_000,
  baseUnits: 100_000n,
  extraUnits: 10_000n,
  finalUnits: 10_010_000n
};

describe("NDP experience reversal arithmetic", () => {
  it("uses the original award totals for a proportional partial refund", () => {
    expect(
      calculateNdpExperienceReversal({
        original,
        previous: {
          reversedNdp: 0,
          reversedBaseUnits: 0n,
          reversedExtraUnits: 0n,
          reversedFinalUnits: 0n
        },
        requestedNdp: 400
      })
    ).toEqual({
      appliedNdp: 400,
      baseUnits: -40_000n,
      extraUnits: -4_000n,
      finalUnits: -4_004_000n,
      cumulativeReversedNdp: 400
    });
  });

  it("makes the final partial refund exactly compensate all original rounding", () => {
    expect(
      calculateNdpExperienceReversal({
        original,
        previous: {
          reversedNdp: 400,
          reversedBaseUnits: 40_000n,
          reversedExtraUnits: 4_000n,
          reversedFinalUnits: 4_004_000n
        },
        requestedNdp: 800
      })
    ).toEqual({
      appliedNdp: 600,
      baseUnits: -60_000n,
      extraUnits: -6_000n,
      finalUnits: -6_006_000n,
      cumulativeReversedNdp: 1_000
    });
  });

  it("caps cumulative refunds at the original NDP amount", () => {
    expect(
      calculateNdpExperienceReversal({
        original,
        previous: {
          reversedNdp: 999,
          reversedBaseUnits: 99_900n,
          reversedExtraUnits: 9_990n,
          reversedFinalUnits: 9_999_990n
        },
        requestedNdp: 500
      })?.appliedNdp
    ).toBe(1);
  });

  it("returns null for a replay after the original award is fully reversed", () => {
    expect(
      calculateNdpExperienceReversal({
        original,
        previous: {
          reversedNdp: 1_000,
          reversedBaseUnits: 100_000n,
          reversedExtraUnits: 10_000n,
          reversedFinalUnits: 10_010_000n
        },
        requestedNdp: 100
      })
    ).toBeNull();
  });

  it("rejects malformed original-snapshot or refund facts", () => {
    expect(() =>
      calculateNdpExperienceReversal({
        original: { ...original, ndpAmount: 0 },
        previous: {
          reversedNdp: 0,
          reversedBaseUnits: 0n,
          reversedExtraUnits: 0n,
          reversedFinalUnits: 0n
        },
        requestedNdp: 1
      })
    ).toThrow(RangeError);
  });
});

describe("NDP experience reversal persistence", () => {
  it("copies original snapshots and compensates account and accumulator atomically", async () => {
    const account = {
      id: 9,
      publicId: "account-41",
      userId: 41,
      totalExpUnits: 20_000_000n,
      currentLevel: 10,
      lockVersion: 3
    };
    const originalEntry = {
      id: 101,
      publicId: "entry-original",
      userId: 41,
      eventType: UserExperienceEventType.NDP_CONSUMED,
      sourceType: "ledger_transaction",
      sourcePublicId: "TX-NDP-ORIGINAL",
      idempotencyKey: "ndp-consumption:TX-NDP-ORIGINAL",
      baseUnits: 100_000n,
      campaignFactorBps: 100_000,
      membershipMultiplierBps: 100_000,
      extraUnits: 10_000n,
      finalUnits: 10_010_000n,
      membershipTierCode: PlatformMembershipTierCode.BLACK_DIAMOND,
      membershipTierVersionId: "tier-black-v3",
      policyVersionId: "policy-v1",
      campaignVersionId: "campaign-10x",
      occurredAt: new Date("2026-09-01T03:00:00.000Z"),
      reversalOfEntryId: null,
      ledgerTransactionId: 71,
      entitlementId: null,
      tierBenefitId: 301,
      ndpAmount: 1_000,
      ndpPerBaseExp: 100,
      extraThresholdNdp: 100,
      extraAwardUnits: 10_000n,
      accumulatorBeforeNumerator: 0n,
      accumulatorAfterNumerator: 0n
    };
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(originalEntry);
    const create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      publicId: "entry-reversal",
      ...data
    }));
    const transaction = {
      userExperienceEntry: {
        findFirst,
        aggregate: jest.fn(async () => ({
          _sum: { ndpAmount: 0, baseUnits: 0n, extraUnits: 0n, finalUnits: 0n }
        })),
        create
      },
      userExperienceAccount: {
        findFirst: jest.fn(async () => account),
        updateMany: jest.fn(async () => ({ count: 1 }))
      },
      userNdpExperienceAccumulator: {
        upsert: jest.fn(async () => ({ id: 401, remainderNumerator: 0n, lockVersion: 1 })),
        updateMany: jest.fn(async () => ({ count: 1 }))
      }
    };
    const client = {
      $transaction: jest.fn(async (handler: (tx: typeof transaction) => unknown) =>
        handler(transaction)
      ),
      userExperienceEntry: { findUnique: jest.fn() },
      userExperienceAccount: { findFirst: jest.fn() }
    };
    const repository = new UserExperienceRepository(client as unknown as PrismaClient);

    await expect(
      repository.recordNdpReversalEvent({
        kind: "reversal",
        userId: 41,
        reversedNdp: 400,
        ledgerTransactionId: 72,
        transactionNo: "TX-NDP-REFUND",
        originalLedgerTransactionNo: "TX-NDP-ORIGINAL",
        occurredAt: new Date("2026-10-01T03:00:00.000Z")
      })
    ).resolves.toMatchObject({
      status: "awarded",
      account: { totalUnits: 15_996_000n },
      entry: {
        eventType: "reversal",
        baseUnits: -40_000n,
        extraUnits: -4_000n,
        finalUnits: -4_004_000n,
        campaignFactorBps: 100_000,
        membershipMultiplierBps: 100_000,
        campaignVersionId: "campaign-10x",
        reversalOfEntryId: 101
      }
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ledgerTransactionId: 72,
          tierBenefitId: 301,
          ndpAmount: 400,
          campaignVersionId: "campaign-10x"
        })
      })
    );
    expect(transaction.userNdpExperienceAccumulator.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ remainderNumerator: 0n })
      })
    );
  });
});
