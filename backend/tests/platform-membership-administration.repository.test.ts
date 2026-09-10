import { PlatformMembershipBenefitCode, PlatformMembershipTierCode } from "@prisma/client";
import { PlatformMembershipRepository } from "../src/repositories/platform-membership.repository";

const nameTranslations = {
  zh: "优先下单",
  "zh-Hant": "優先下單",
  ja: "優先",
  en: "Priority",
  ko: "우선"
};
const descriptionTranslations = {
  zh: "说明",
  "zh-Hant": "說明",
  ja: "説明",
  en: "Description",
  ko: "설명"
};

describe("PlatformMembershipRepository administration", () => {
  it("lists the four fixed tiers by persisted sort order", async () => {
    const findMany = jest.fn(async () => [
      { code: PlatformMembershipTierCode.FREE, sortOrder: 0, versions: [] },
      { code: PlatformMembershipTierCode.SILVER, sortOrder: 1, versions: [] },
      { code: PlatformMembershipTierCode.GOLD, sortOrder: 2, versions: [] },
      { code: PlatformMembershipTierCode.BLACK_DIAMOND, sortOrder: 3, versions: [] }
    ]);
    const repository = new PlatformMembershipRepository({
      platformMembershipTier: { findMany }
    } as never);

    await expect(repository.listTiersForAdministration()).resolves.toEqual([
      { tierCode: "free", sortOrder: 0, publishedVersion: null, draftVersion: null },
      { tierCode: "silver", sortOrder: 1, publishedVersion: null, draftVersion: null },
      { tierCode: "gold", sortOrder: 2, publishedVersion: null, draftVersion: null },
      {
        tierCode: "black_diamond",
        sortOrder: 3,
        publishedVersion: null,
        draftVersion: null
      }
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }]
      })
    );
  });

  it("updates a benefit and its audit in one transaction", async () => {
    const updateMany = jest.fn(async () => ({ count: 1 }));
    const auditCreate = jest.fn(async () => ({}));
    const transaction = {
      platformMembershipBenefit: {
        findFirst: jest.fn(async () => ({
          id: 4,
          publicId: "benefit-priority-request",
          lockVersion: 2
        })),
        updateMany
      },
      auditLog: { create: auditCreate }
    };
    const client = {
      $transaction: jest.fn(async (callback: (value: typeof transaction) => unknown) =>
        callback(transaction)
      ),
      platformMembershipBenefit: {
        findFirst: jest.fn(async () => ({
          code: PlatformMembershipBenefitCode.PRIORITY_REQUEST,
          sortOrder: 2,
          isGloballyEnabled: false,
          nameTranslations,
          descriptionTranslations,
          lockVersion: 3
        }))
      }
    };
    const repository = new PlatformMembershipRepository(client as never);

    await expect(
      repository.updateBenefitWithAudit({
        actorId: 9,
        benefitCode: "priority_request",
        isGloballyEnabled: false,
        sortOrder: 2,
        nameTranslations,
        descriptionTranslations,
        expectedLockVersion: 2,
        audit: { actorId: 9, action: "benefit.update", targetType: "benefit" }
      })
    ).resolves.toEqual({
      kind: "updated",
      value: {
        code: "priority_request",
        sortOrder: 2,
        isGloballyEnabled: false,
        nameTranslations,
        descriptionTranslations,
        lockVersion: 3
      }
    });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ lockVersion: 2 }),
        data: {
          isGloballyEnabled: false,
          sortOrder: 2,
          nameTranslations,
          descriptionTranslations,
          lockVersion: { increment: 1 }
        }
      })
    );
    expect(auditCreate).toHaveBeenCalledTimes(1);
  });

  it("does not audit when the benefit lock is stale", async () => {
    const auditCreate = jest.fn();
    const transaction = {
      platformMembershipBenefit: {
        findFirst: jest.fn(async () => ({
          id: 4,
          publicId: "benefit-priority-request",
          lockVersion: 3
        })),
        updateMany: jest.fn()
      },
      auditLog: { create: auditCreate }
    };
    const repository = new PlatformMembershipRepository({
      $transaction: jest.fn(async (callback: (value: typeof transaction) => unknown) =>
        callback(transaction)
      )
    } as never);

    await expect(
      repository.updateBenefitWithAudit({
        actorId: 9,
        benefitCode: "priority_request",
        isGloballyEnabled: false,
        sortOrder: 2,
        nameTranslations,
        descriptionTranslations,
        expectedLockVersion: 2,
        audit: { actorId: 9, action: "benefit.update", targetType: "benefit" }
      })
    ).resolves.toEqual({ kind: "version_conflict" });
    expect(auditCreate).not.toHaveBeenCalled();
  });
});
