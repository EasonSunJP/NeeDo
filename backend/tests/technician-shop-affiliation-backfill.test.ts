import {
  TechnicianShopAffiliationBackfillBlockedError,
  planTechnicianShopAffiliationBackfill,
  runTechnicianShopAffiliationBackfill,
  type TechnicianShopAffiliationBackfillBatch,
  type TechnicianShopAffiliationBackfillRuntime,
  type TechnicianShopAffiliationBackfillSnapshot
} from "../scripts/backfill-technician-shop-affiliations";
import { checkTechnicianShopAffiliationCutover } from "../scripts/check-technician-shop-affiliation-cutover";

const startsAt = new Date("2026-08-01T00:00:00.000Z");
const createdAt = new Date("2026-07-01T00:00:00.000Z");

const snapshot = (
  overrides: Partial<TechnicianShopAffiliationBackfillSnapshot> = {}
): TechnicianShopAffiliationBackfillSnapshot => ({
  technicianProfileId: 47,
  shopId: 16,
  employmentType: "FULL_TIME",
  employmentStartedAt: startsAt,
  createdAt,
  profileStatus: "published",
  shopActive: true,
  technicianPublicIds: ["s0000000047"],
  hasBusinessEvidence: true,
  hasApprovedApplicationEvidence: false,
  hasMerchantIdentityAtShop: false,
  currentAffiliations: [],
  ...overrides
});

const batch = (
  technicians: TechnicianShopAffiliationBackfillSnapshot[]
): TechnicianShopAffiliationBackfillBatch => ({ technicians });

const runtime = (
  initialBatches: TechnicianShopAffiliationBackfillBatch[],
  afterBatches = initialBatches
): jest.Mocked<TechnicianShopAffiliationBackfillRuntime> => {
  let scanCount = 0;
  return {
    scan: jest.fn((batchSize: number) => {
      void batchSize;
      const source = scanCount === 0 ? initialBatches : afterBatches;
      scanCount += 1;
      return (async function* () {
        for (const item of source) yield item;
      })();
    }),
    applyOperations: jest.fn(async (operations) => operations.length)
  };
};

describe("technician shop affiliation backfill planner", () => {
  it("maps full-time and temporary legacy rows deterministically", () => {
    const plan = planTechnicianShopAffiliationBackfill(
      batch([
        snapshot(),
        snapshot({
          technicianProfileId: 48,
          employmentType: "TEMPORARY",
          technicianPublicIds: ["s0000000048"]
        })
      ])
    );

    expect(plan.issues).toEqual([]);
    expect(plan.operations).toEqual([
      {
        technicianProfileId: 47,
        shopId: 16,
        relationshipType: "EXCLUSIVE",
        startsAt,
        activeKey: "technician:47:shop:16"
      },
      {
        technicianProfileId: 48,
        shopId: 16,
        relationshipType: "PARTNER",
        startsAt,
        activeKey: "technician:48:shop:16"
      }
    ]);
  });

  it("requires persisted business evidence before mapping independent rows", () => {
    const verified = planTechnicianShopAffiliationBackfill(
      batch([snapshot({ employmentType: "INDEPENDENT" })])
    );
    const unverified = planTechnicianShopAffiliationBackfill(
      batch([snapshot({ employmentType: "INDEPENDENT", hasBusinessEvidence: false })])
    );

    expect(verified.operations[0]).toMatchObject({ relationshipType: "PARTNER" });
    expect(unverified.operations).toEqual([]);
    expect(unverified.issues).toEqual([
      {
        technicianProfileId: 47,
        code: "INDEPENDENT_RELATION_UNVERIFIED"
      }
    ]);
  });

  it("accepts an approved target-shop application as repair evidence for an independent profile", () => {
    const plan = planTechnicianShopAffiliationBackfill(
      batch([
        snapshot({
          employmentType: "INDEPENDENT",
          hasBusinessEvidence: false,
          hasApprovedApplicationEvidence: true
        } as unknown as Partial<TechnicianShopAffiliationBackfillSnapshot>)
      ])
    );

    expect(plan.issues).toEqual([]);
    expect(plan.operations).toEqual([
      expect.objectContaining({
        technicianProfileId: 47,
        shopId: 16,
        relationshipType: "PARTNER"
      })
    ]);
  });

  it("skips a private merchant identity-switch profile that has no service evidence", () => {
    const plan = planTechnicianShopAffiliationBackfill(
      batch([
        snapshot({
          employmentType: "INDEPENDENT",
          profileStatus: "private",
          hasBusinessEvidence: false,
          hasMerchantIdentityAtShop: true
        })
      ])
    );

    expect(plan.operations).toEqual([]);
    expect(plan.issues).toEqual([]);
    expect(plan.skippedNonEmployeeProfiles).toBe(1);
  });

  it("skips unassigned profiles and reports identity or shop blockers", () => {
    const plan = planTechnicianShopAffiliationBackfill(
      batch([
        snapshot({ technicianProfileId: 40, shopId: null }),
        snapshot({ technicianProfileId: 41, technicianPublicIds: [] }),
        snapshot({ technicianProfileId: 42, shopActive: false })
      ])
    );

    expect(plan.skippedUnassigned).toBe(1);
    expect(plan.operations).toEqual([]);
    expect(plan.issues).toEqual([
      { technicianProfileId: 41, code: "TECHNICIAN_PUBLIC_ID_MISSING" },
      { technicianProfileId: 42, code: "SHOP_NOT_ACTIVE" }
    ]);
  });

  it("reports ambiguous technician identities without exposing identifiers", () => {
    const plan = planTechnicianShopAffiliationBackfill(
      batch([snapshot({ technicianPublicIds: ["s0000000047", "s0000000147"] })])
    );

    expect(plan.operations).toEqual([]);
    expect(plan.issues).toEqual([
      { technicianProfileId: 47, code: "TECHNICIAN_PUBLIC_ID_AMBIGUOUS" }
    ]);
    expect(JSON.stringify(plan.issues)).not.toContain("s0000000047");
  });

  it("is idempotent for a matching current relation", () => {
    const plan = planTechnicianShopAffiliationBackfill(
      batch([
        snapshot({
          currentAffiliations: [
            {
              shopId: 16,
              relationshipType: "EXCLUSIVE",
              workStatus: "ACTIVE",
              activeKey: "technician:47:shop:16"
            }
          ]
        })
      ])
    );

    expect(plan.operations).toEqual([]);
    expect(plan.issues).toEqual([]);
    expect(plan.alreadyCovered).toBe(1);
  });

  it("fails closed for mismatched and exclusive current relations", () => {
    const mismatched = planTechnicianShopAffiliationBackfill(
      batch([
        snapshot({
          currentAffiliations: [
            {
              shopId: 16,
              relationshipType: "PARTNER",
              workStatus: "ACTIVE",
              activeKey: "technician:47:shop:16"
            }
          ]
        })
      ])
    );
    const exclusiveConflict = planTechnicianShopAffiliationBackfill(
      batch([
        snapshot({
          employmentType: "TEMPORARY",
          currentAffiliations: [
            {
              shopId: 99,
              relationshipType: "EXCLUSIVE",
              workStatus: "ON_LEAVE",
              activeKey: "technician:47:shop:99"
            }
          ]
        })
      ])
    );
    const hiddenExclusiveConflict = planTechnicianShopAffiliationBackfill(
      batch([
        snapshot({
          employmentType: "TEMPORARY",
          currentAffiliations: [
            {
              shopId: 16,
              relationshipType: "PARTNER",
              workStatus: "ACTIVE",
              activeKey: "technician:47:shop:16"
            },
            {
              shopId: 99,
              relationshipType: "EXCLUSIVE",
              workStatus: "SUSPENDED",
              activeKey: "technician:47:shop:99"
            }
          ]
        })
      ])
    );

    expect(mismatched.issues).toEqual([{ technicianProfileId: 47, code: "AFFILIATION_MISMATCH" }]);
    expect(exclusiveConflict.issues).toEqual([
      { technicianProfileId: 47, code: "EXCLUSIVE_CONFLICT" }
    ]);
    expect(hiddenExclusiveConflict.issues).toEqual([
      { technicianProfileId: 47, code: "EXCLUSIVE_CONFLICT" }
    ]);
  });
});

describe("technician shop affiliation backfill runner", () => {
  it("dry-runs without mutations and reports pending operations", async () => {
    const source = runtime([batch([snapshot()])]);

    await expect(
      runTechnicianShopAffiliationBackfill(source, { mode: "dry-run", batchSize: 100 })
    ).resolves.toMatchObject({
      mode: "dry-run",
      plannedOperations: 1,
      mutatedRows: 0,
      before: { pendingOperations: 1 },
      after: { pendingOperations: 1 },
      issues: []
    });
    expect(source.applyOperations).not.toHaveBeenCalled();
  });

  it("reports each dry-run issue once", async () => {
    const source = runtime([
      batch([snapshot({ employmentType: "INDEPENDENT", hasBusinessEvidence: false })])
    ]);

    await expect(
      runTechnicianShopAffiliationBackfill(source, { mode: "dry-run", batchSize: 100 })
    ).resolves.toMatchObject({
      issues: [
        {
          technicianProfileId: 47,
          code: "INDEPENDENT_RELATION_UNVERIFIED"
        }
      ]
    });
  });

  it("applies a clean plan then proves the rerun has no pending work", async () => {
    const covered = snapshot({
      currentAffiliations: [
        {
          shopId: 16,
          relationshipType: "EXCLUSIVE",
          workStatus: "ACTIVE",
          activeKey: "technician:47:shop:16"
        }
      ]
    });
    const source = runtime([batch([snapshot()])], [batch([covered])]);

    await expect(
      runTechnicianShopAffiliationBackfill(source, { mode: "apply", batchSize: 100 })
    ).resolves.toMatchObject({
      mode: "apply",
      plannedOperations: 1,
      mutatedRows: 1,
      before: { pendingOperations: 1 },
      after: { pendingOperations: 0 },
      issues: []
    });
    expect(source.applyOperations).toHaveBeenCalledTimes(1);
  });

  it("blocks apply before any write when one issue exists", async () => {
    const source = runtime([
      batch([snapshot(), snapshot({ technicianProfileId: 48, shopActive: false })])
    ]);

    await expect(
      runTechnicianShopAffiliationBackfill(source, { mode: "apply", batchSize: 100 })
    ).rejects.toBeInstanceOf(TechnicianShopAffiliationBackfillBlockedError);
    expect(source.applyOperations).not.toHaveBeenCalled();
  });

  it("rejects unsafe batch sizes", async () => {
    const source = runtime([]);

    await expect(
      runTechnicianShopAffiliationBackfill(source, { mode: "dry-run", batchSize: 0 })
    ).rejects.toThrow("batchSize must be an integer from 1 through 500");
  });
});

describe("technician shop affiliation cutover checker", () => {
  it("is ready only after all clean operations are already covered", async () => {
    const pending = runtime([batch([snapshot()])]);
    const covered = runtime([
      batch([
        snapshot({
          currentAffiliations: [
            {
              shopId: 16,
              relationshipType: "EXCLUSIVE",
              workStatus: "ACTIVE",
              activeKey: "technician:47:shop:16"
            }
          ]
        })
      ])
    ]);

    await expect(checkTechnicianShopAffiliationCutover(pending, 100)).resolves.toMatchObject({
      ready: false,
      report: { after: { pendingOperations: 1 }, issues: [] }
    });
    await expect(checkTechnicianShopAffiliationCutover(covered, 100)).resolves.toMatchObject({
      ready: true,
      report: { after: { pendingOperations: 0 }, issues: [] }
    });
  });
});
