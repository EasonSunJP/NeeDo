import type {
  NdpConsumptionCalculatedEvent,
  UserExperienceAccountSnapshot,
  UserExperienceRepositoryPort
} from "../src/domain/user-experience";
import type { PlatformMembershipBenefitCodeValue } from "../src/domain/platform-membership";
import { UserExperienceService } from "../src/services/user-experience.service";

const account: UserExperienceAccountSnapshot = {
  publicId: "experience-account-41",
  userId: 41,
  totalUnits: 0n,
  currentLevel: 1,
  lockVersion: 1
};

const source = (settledNdp: number, transactionNo: string) => ({
  kind: "qualifying_consumption" as const,
  userId: 41,
  settledNdp,
  ledgerTransactionId: Number(transactionNo.replace(/\D/g, "")) || 1,
  transactionNo,
  occurredAt: new Date("2026-09-01T03:00:00.000Z")
});

const membership = (
  multiplier: number,
  benefitEnabled = true,
  configuration: Record<string, unknown> = {
    extraThresholdNdp: null,
    extraAwardExpUnits: null
  },
  tierBenefitId = 301
) => ({
  resolveMembershipAt: jest.fn(async () => ({
    tierCode:
      multiplier === 10
        ? ("black_diamond" as const)
        : multiplier === 5
          ? ("gold" as const)
          : multiplier === 2
            ? ("silver" as const)
            : ("free" as const),
    tierVersionPublicId: `tier-version-${multiplier}`,
    multiplier,
    benefits: benefitEnabled
      ? [
          {
            code: "ndp_experience" as PlatformMembershipBenefitCodeValue,
            configuration,
            tierBenefitId,
            tierBenefitPublicId: `tier-benefit-${tierBenefitId}`
          }
        ]
      : []
  }))
});

const policy = () => ({
  resolvePolicyAt: jest.fn(async () => ({
    versionPublicId: "policy-version-1",
    ndpPerBaseExp: 100,
    baseExpUnitsPerThreshold: 10_000
  }))
});

const campaign = (factorBps = 10_000) => ({
  resolveCampaignAt: jest.fn(async (occurredAt: Date) => {
    const effectiveFactor =
      occurredAt.getTime() < new Date("2026-09-02T00:00:00.000Z").getTime()
        ? factorBps
        : 10_000;
    return {
      factorBps: effectiveFactor,
      versionPublicId: effectiveFactor === 10_000 ? null : "campaign-version-10x"
    };
  })
});

const repository = () => {
  const remainders = new Map<string, bigint>();
  const entries = new Map<
    number,
    NdpConsumptionCalculatedEvent & {
      extraUnits: bigint;
      finalUnits: bigint;
      reversalOfEntryId: null;
      accumulatorBeforeNumerator: bigint | null;
      accumulatorAfterNumerator: bigint | null;
    }
  >();
  const repo: jest.Mocked<UserExperienceRepositoryPort> = {
    findActiveAccount: jest.fn(async (userId: number) => {
      void userId;
      return account;
    }),
    listEntries: jest.fn(async (userId, input) => {
      void userId;
      void input;
      return { list: [], total: 0, page: 1, page_size: 20 };
    }),
    recordCalculatedEvent: jest.fn(),
    recordNdpConsumptionEvent: jest.fn(async (event) => {
      const duplicate = entries.get(event.ledgerTransactionId);
      if (duplicate) {
        return {
          status: "duplicate" as const,
          account,
          entry: { publicId: "duplicate", ...duplicate }
        };
      }
      const accumulatorKey = `${event.userId}:${event.tierBenefitId}`;
      const before = remainders.get(accumulatorKey) ?? 0n;
      const numerator = event.extraThresholdNdp
        ? before + BigInt(event.ndpAmount) * event.extraAwardUnits
        : 0n;
      const extraUnits = event.extraThresholdNdp
        ? numerator / BigInt(event.extraThresholdNdp)
        : 0n;
      const after = event.extraThresholdNdp
        ? numerator % BigInt(event.extraThresholdNdp)
        : 0n;
      remainders.set(accumulatorKey, after);
      const finalUnits =
        (event.baseUnits *
          BigInt(event.campaignFactorBps) *
          BigInt(event.membershipMultiplierBps)) /
          100_000_000n +
        extraUnits;
      const stored: NdpConsumptionCalculatedEvent & {
        extraUnits: bigint;
        finalUnits: bigint;
        reversalOfEntryId: null;
        accumulatorBeforeNumerator: bigint | null;
        accumulatorAfterNumerator: bigint | null;
      } = {
        ...event,
        extraUnits,
        finalUnits,
        reversalOfEntryId: null,
        accumulatorBeforeNumerator: event.extraThresholdNdp ? before : null,
        accumulatorAfterNumerator: event.extraThresholdNdp ? after : null
      };
      entries.set(event.ledgerTransactionId, stored);
      return {
        status: "awarded" as const,
        account: { ...account, totalUnits: finalUnits, lockVersion: 2 },
        entry: { publicId: `entry-${event.ledgerTransactionId}`, ...stored }
      };
    })
  };
  return repo;
};

describe("NDP consumption experience", () => {
  it("applies 100:1, a 10x campaign and black-diamond 10x using integers", async () => {
    const repo = repository();
    const service = new UserExperienceService(repo, membership(10), policy(), campaign(100_000));

    const result = await service.recordNdpConsumption(source(1_000, "TX-71"));

    expect(result.status).toBe("awarded");
    expect(repo.recordNdpConsumptionEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUnits: 100_000n,
        campaignFactorBps: 100_000,
        membershipMultiplierBps: 100_000,
        ndpAmount: 1_000,
        ndpPerBaseExp: 100,
        policyVersionId: "policy-version-1",
        campaignVersionId: "campaign-version-10x"
      }),
      undefined
    );
    expect(result.entry?.finalUnits).toBe(10_000_000n);
  });

  it.each([
    [1, 10_000],
    [2, 20_000],
    [5, 50_000],
    [10, 100_000]
  ])("uses the x%i tier multiplier for one NDP fractional base units", async (multiplier, expectedBps) => {
    const repo = repository();
    const service = new UserExperienceService(repo, membership(multiplier), policy(), campaign());
    const result = await service.recordNdpConsumption(source(1, `TX-${multiplier}`));
    expect(repo.recordNdpConsumptionEvent).toHaveBeenCalledWith(
      expect.objectContaining({ baseUnits: 100n, membershipMultiplierBps: expectedBps }),
      undefined
    );
    expect(result.entry?.finalUnits).toBe(BigInt(100 * multiplier));
  });

  it("adds the tier bonus without campaign or membership multiplication and keeps split-payment remainder", async () => {
    const repo = repository();
    const service = new UserExperienceService(
      repo,
      membership(10, true, { extraThresholdNdp: 100, extraAwardExpUnits: 10_000 }),
      policy(),
      campaign(100_000)
    );
    const first = await service.recordNdpConsumption(source(60, "TX-60"));
    const second = await service.recordNdpConsumption(source(40, "TX-40"));

    expect(first.entry).toMatchObject({
      extraUnits: 6_000n,
      accumulatorBeforeNumerator: 0n,
      accumulatorAfterNumerator: 0n
    });
    expect(second.entry).toMatchObject({
      extraUnits: 4_000n,
      accumulatorBeforeNumerator: 0n,
      accumulatorAfterNumerator: 0n
    });
    expect(first.entry!.finalUnits + second.entry!.finalUnits).toBe(1_010_000n);
  });

  it("isolates accumulator state by published tier-benefit version", async () => {
    const repo = repository();
    const oldService = new UserExperienceService(
      repo,
      membership(1, true, { extraThresholdNdp: 100, extraAwardExpUnits: 1 }, 301),
      policy(),
      campaign()
    );
    const newService = new UserExperienceService(
      repo,
      membership(1, true, { extraThresholdNdp: 100, extraAwardExpUnits: 1 }, 302),
      policy(),
      campaign()
    );
    const oldEntry = await oldService.recordNdpConsumption(source(60, "TX-601"));
    const newEntry = await newService.recordNdpConsumption(source(40, "TX-402"));
    expect(oldEntry.entry?.accumulatorAfterNumerator).toBe(60n);
    expect(newEntry.entry?.accumulatorBeforeNumerator).toBe(0n);
    expect(newEntry.entry?.accumulatorAfterNumerator).toBe(40n);
  });

  it("does not award when the NDP experience benefit is disabled", async () => {
    const repo = repository();
    const service = new UserExperienceService(repo, membership(10, false), policy(), campaign());
    await expect(service.recordNdpConsumption(source(1_000, "TX-80"))).resolves.toEqual({
      status: "ineligible",
      account
    });
    expect(repo.recordNdpConsumptionEvent).not.toHaveBeenCalled();
  });

  it("uses the campaign effective at the ledger occurrence timestamp", async () => {
    const repo = repository();
    const campaignResolver = campaign(100_000);
    const service = new UserExperienceService(repo, membership(1), policy(), campaignResolver);
    await service.recordNdpConsumption({
      ...source(100, "TX-90"),
      occurredAt: new Date("2026-09-02T00:00:00.000Z")
    });
    expect(repo.recordNdpConsumptionEvent).toHaveBeenCalledWith(
      expect.objectContaining({ campaignFactorBps: 10_000, campaignVersionId: null }),
      undefined
    );
  });
});
