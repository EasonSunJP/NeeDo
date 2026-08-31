import type { PrismaClient } from "@prisma/client";
import { NdpExperienceCampaignRepository } from "../src/repositories/ndp-experience-campaign.repository";

describe("NdpExperienceCampaignRepository", () => {
  it("resolves published campaigns with inclusive-start exclusive-end boundaries", async () => {
    const client = {
      ndpExperienceCampaign: { findFirst: jest.fn(async () => null) }
    };
    const repository = new NdpExperienceCampaignRepository(client as unknown as PrismaClient);
    const occurredAt = new Date("2026-12-01T00:00:00Z");

    await repository.resolveCampaignAt(occurredAt);

    expect(client.ndpExperienceCampaign.findFirst).toHaveBeenCalledWith({
      where: {
        status: "PUBLISHED",
        deletedAt: null,
        effectiveFrom: { lte: occurredAt },
        effectiveTo: { gt: occurredAt }
      },
      orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
      select: expect.any(Object)
    });
  });

  it("rejects an overlapping published window while holding a range lock", async () => {
    const transaction = {
      ndpExperienceCampaign: {
        findFirst: jest.fn(async () => ({
          id: 2,
          publicId: "campaign-v2",
          version: 2,
          status: "DRAFT",
          lockVersion: 1,
          effectiveFrom: new Date("2026-12-01T00:00:00Z"),
          effectiveTo: new Date("2026-12-31T00:00:00Z")
        })),
        updateMany: jest.fn(async () => ({ count: 1 })),
        findUnique: jest.fn(async () => null)
      },
      $queryRaw: jest.fn(async () => [{ id: 1 }]),
      auditLog: { create: jest.fn(async () => ({})) }
    };
    const client = {
      $transaction: jest.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction))
    };
    const repository = new NdpExperienceCampaignRepository(client as unknown as PrismaClient);

    await expect(
      repository.publishDraftWithAudit({
        actorId: 7,
        versionPublicId: "campaign-v2",
        expectedVersion: 2,
        expectedLockVersion: 1,
        publishedAt: new Date("2026-11-01T00:00:00Z"),
        audit: {
          actorId: 7,
          action: "backoffice.ndp_experience_campaign.publish",
          targetType: "NdpExperienceCampaign",
          metadata: {}
        }
      })
    ).resolves.toEqual({ kind: "overlap" });

    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transaction.ndpExperienceCampaign.updateMany).not.toHaveBeenCalled();
    expect(transaction.auditLog.create).not.toHaveBeenCalled();
  });

  it("allows an exactly adjacent window and publishes it atomically", async () => {
    const published = {
      publicId: "campaign-v2",
      version: 2,
      status: "PUBLISHED",
      name: "双倍",
      description: null,
      factorBps: 20_000,
      effectiveFrom: new Date("2026-12-01T00:00:00Z"),
      effectiveTo: new Date("2026-12-31T00:00:00Z"),
      publishedAt: new Date("2026-11-01T00:00:00Z"),
      lockVersion: 2
    };
    const transaction = {
      ndpExperienceCampaign: {
        findFirst: jest.fn(async () => ({
          id: 2,
          publicId: "campaign-v2",
          version: 2,
          status: "DRAFT",
          lockVersion: 1,
          effectiveFrom: published.effectiveFrom,
          effectiveTo: published.effectiveTo
        })),
        updateMany: jest.fn(async () => ({ count: 1 })),
        findUnique: jest.fn(async () => published)
      },
      $queryRaw: jest.fn(async () => []),
      auditLog: { create: jest.fn(async () => ({})) }
    };
    const client = {
      $transaction: jest.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction))
    };
    const repository = new NdpExperienceCampaignRepository(client as unknown as PrismaClient);

    await expect(
      repository.publishDraftWithAudit({
        actorId: 7,
        versionPublicId: "campaign-v2",
        expectedVersion: 2,
        expectedLockVersion: 1,
        publishedAt: new Date("2026-11-01T00:00:00Z"),
        audit: {
          actorId: 7,
          action: "backoffice.ndp_experience_campaign.publish",
          targetType: "NdpExperienceCampaign",
          metadata: {}
        }
      })
    ).resolves.toMatchObject({ kind: "published", value: { versionPublicId: "campaign-v2" } });
    expect(transaction.auditLog.create).toHaveBeenCalledTimes(1);
  });
});
