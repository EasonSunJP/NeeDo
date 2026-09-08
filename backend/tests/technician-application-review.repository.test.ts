import type { PrismaClient } from "@prisma/client";
import { TechnicianApplicationReviewRepository } from "../src/repositories/technician-application-review.repository";

const now = new Date("2026-08-26T05:00:00.000Z");

describe("TechnicianApplicationReviewRepository", () => {
  it("returns a technician application only through its target shop scope", async () => {
    const identityApplication = {
      findFirst: jest.fn().mockResolvedValue({
        id: 11,
        userId: 7,
        status: "submitted",
        version: 2,
        submittedAt: now,
        createdAt: now,
        media: [],
        technicianDetail: {
          targetShopId: 21,
          applicantName: "山本太郎",
          phone: null,
          city: "东京",
          serviceAreas: ["银座"],
          skills: ["按摩"],
          yearsExperience: 4,
          bio: "四年经验",
          gender: "male",
          birthDate: new Date("1990-01-02T00:00:00.000Z"),
          targetShop: { ownerUserId: 30 }
        }
      })
    };
    const client = { identityApplication } as unknown as PrismaClient;
    const repository = new TechnicianApplicationReviewRepository(client);

    await expect(repository.findForShop(11, 21)).resolves.toMatchObject({
      applicationId: 11,
      applicantUserId: 7,
      targetShopId: 21,
      targetShopServiceUserId: 30
    });
    expect(identityApplication.findFirst).toHaveBeenCalledWith({
      where: {
        id: 11,
        type: "technician",
        deletedAt: null,
        status: { not: "draft" },
        technicianDetail: { targetShopId: 21, deletedAt: null }
      },
      select: expect.any(Object)
    });
  });

  it("atomically creates the technician profile, identity, role, closes the application, notification, and audits", async () => {
    const tx = {
      identityApplication: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      technicianProfile: {
        upsert: jest.fn().mockResolvedValue({ id: 51 })
      },
      role: {
        findFirst: jest.fn().mockResolvedValue({ id: 6, code: "technician" })
      },
      publicIdentifier: { create: jest.fn().mockResolvedValue({ id: 301 }) },
      userIdentity: {
        findFirst: jest.fn().mockResolvedValue({ id: 130, user: { accountNo: "8274936150" } }),
        create: jest.fn().mockResolvedValue({
          id: 61,
          userId: 7,
          type: "technician",
          scopeType: "technician_profile",
          scopeId: 51
        })
      },
      userRole: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 71 })
      },
      notification: {
        create: jest.fn().mockResolvedValue({ id: 81 })
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 91 })
      }
    };
    const client = {
      $transaction: jest.fn(async (callback: (database: typeof tx) => unknown) => callback(tx))
    } as unknown as PrismaClient;
    const repository = new TechnicianApplicationReviewRepository(client);

    await expect(
      repository.approveInTransaction({
        applicationId: 11,
        applicantUserId: 7,
        targetShopId: 21,
        reviewerUserId: 30,
        expectedVersion: 2,
        applicantName: "山本太郎",
        city: "东京",
        bio: "四年经验",
        reviewedAt: now,
        purgeAt: new Date("2026-09-25T05:00:00.000Z")
      })
    ).resolves.toMatchObject({
      status: "approved",
      version: 3,
      technicianProfileId: 51,
      identityId: 61
    });
    expect(tx.identityApplication.updateMany).toHaveBeenCalledWith({
      where: {
        id: 11,
        userId: 7,
        version: 2,
        status: { in: ["submitted", "under_review"] },
        deletedAt: null,
        technicianDetail: { targetShopId: 21 }
      },
      data: {
        status: "approved",
        activeKey: null,
        version: { increment: 1 },
        reviewedAt: now,
        reviewerUserId: 30,
        rejectionReason: null,
        closedAt: now,
        purgeAt: new Date("2026-09-25T05:00:00.000Z")
      }
    });
    expect(tx.technicianProfile.upsert).toHaveBeenCalledWith({
      where: { userId: 7 },
      create: expect.objectContaining({ userId: 7, shopId: 21, displayName: "山本太郎" }),
      update: expect.objectContaining({ shopId: 21, displayName: "山本太郎", deletedAt: null })
    });
    expect(tx.userIdentity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        activeKey: "identity-activation:7:technician:application:11",
        scopeId: 51
      })
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "identity_application.technician.approved",
        targetType: "IdentityApplication",
        targetId: 11,
        ip: null
      })
    });
  });

  it("rejects in one optimistic transition and sends a system notification without activating", async () => {
    const tx = {
      identityApplication: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      userIdentity: { findFirst: jest.fn().mockResolvedValue({ id: 107 }) },
      notification: { create: jest.fn().mockResolvedValue({ id: 81 }) },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 91 }) }
    };
    const client = {
      $transaction: jest.fn(async (callback: (database: typeof tx) => unknown) => callback(tx))
    } as unknown as PrismaClient;
    const repository = new TechnicianApplicationReviewRepository(client);

    await repository.rejectInTransaction({
      applicationId: 11,
      applicantUserId: 7,
      targetShopId: 21,
      reviewerUserId: 30,
      expectedVersion: 2,
      rejectionReason: "照片无法确认",
      reviewedAt: now,
      purgeAt: new Date("2026-09-25T05:00:00.000Z")
    });
    expect(tx.identityApplication.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "rejected",
          activeKey: null,
          rejectionReason: "照片无法确认"
        })
      })
    );
    expect(tx.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        recipientUserId: 7,
        recipientIdentityId: 107,
        actorUserId: 30,
        actorIdentityId: 107,
        type: "SYSTEM",
        payload: { applicationId: 11, rejectionReason: "照片无法确认" }
      })
    });
  });
});
