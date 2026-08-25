import type { PrismaClient } from "@prisma/client";
import { IdentityApplicationRepository } from "../src/repositories/identity-application.repository";

const applicationRow = {
  id: 11,
  userId: 3,
  type: "technician",
  status: "draft",
  activeKey: "3:technician",
  version: 1,
  submittedSnapshotHash: null,
  submittedAt: null,
  reviewedAt: null,
  reviewerUserId: null,
  rejectionReason: null,
  closedAt: null,
  purgeAt: null,
  purgedAt: null,
  createdAt: new Date("2026-08-26T00:00:00.000Z"),
  updatedAt: new Date("2026-08-26T00:00:00.000Z"),
  deletedAt: null,
  technicianDetail: {
    id: 20,
    applicationId: 11,
    targetShopId: 7,
    applicantName: "山本太郎",
    phone: null,
    city: null,
    serviceAreas: [],
    skills: [],
    yearsExperience: null,
    bio: null,
    gender: null,
    birthDate: null,
    submittedSnapshot: null,
    createdAt: new Date("2026-08-26T00:00:00.000Z"),
    updatedAt: new Date("2026-08-26T00:00:00.000Z"),
    deletedAt: null
  },
  merchantDetail: null,
  media: [],
  applicant: { ekycVerifications: [] }
};

describe("IdentityApplicationRepository", () => {
  it("filters active applications and deleted records", async () => {
    const identityApplication = {
      findFirst: jest.fn().mockResolvedValue(applicationRow)
    };
    const client = { identityApplication } as unknown as PrismaClient;
    const repository = new IdentityApplicationRepository(client);

    await expect(repository.findActiveByUserAndType(3, "technician")).resolves.toMatchObject({
      id: 11,
      technicianDetail: { targetShopId: 7, applicantName: "山本太郎" }
    });
    expect(identityApplication.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 3,
          type: "technician",
          activeKey: { not: null },
          deletedAt: null
        }
      })
    );
  });

  it("checks active formal identities using the merchant identity family", async () => {
    const userIdentity = { findFirst: jest.fn().mockResolvedValue({ id: 8 }) };
    const client = { userIdentity } as unknown as PrismaClient;
    const repository = new IdentityApplicationRepository(client);

    await expect(repository.hasActiveIdentity(3, "merchant")).resolves.toBe(true);
    expect(userIdentity.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 3,
        type: { in: ["merchant", "merchant_owner", "merchant_staff"] },
        isActive: true,
        deletedAt: null
      },
      select: { id: true }
    });
  });

  it("only exposes published, non-deleted shops as technician targets", async () => {
    const shop = { findFirst: jest.fn().mockResolvedValue({ id: 7 }) };
    const client = { shop } as unknown as PrismaClient;
    const repository = new IdentityApplicationRepository(client);

    await expect(repository.isShopEligibleForTechnicianApplications(7)).resolves.toBe(true);
    expect(shop.findFirst).toHaveBeenCalledWith({
      where: { id: 7, status: "published", deletedAt: null },
      select: { id: true }
    });
  });

  it("creates a technician application and typed detail in one nested write", async () => {
    const identityApplication = {
      create: jest.fn().mockResolvedValue(applicationRow)
    };
    const client = { identityApplication } as unknown as PrismaClient;
    const repository = new IdentityApplicationRepository(client);

    await repository.createTechnicianDraft({
      userId: 3,
      activeKey: "3:technician",
      detail: {
        targetShopId: 7,
        applicantName: "山本太郎",
        phone: null,
        city: null,
        serviceAreas: [],
        skills: [],
        yearsExperience: null,
        bio: null,
        gender: null,
        birthDate: null
      }
    });

    expect(identityApplication.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          userId: 3,
          type: "technician",
          status: "draft",
          activeKey: "3:technician",
          technicianDetail: {
            create: expect.objectContaining({ targetShopId: 7, applicantName: "山本太郎" })
          }
        }
      })
    );
  });

  it("paginates only the current user's non-deleted applications", async () => {
    const identityApplication = {
      findMany: jest.fn().mockResolvedValue([applicationRow]),
      count: jest.fn().mockResolvedValue(1)
    };
    const client = {
      $transaction: jest.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
      identityApplication
    } as unknown as PrismaClient;
    const repository = new IdentityApplicationRepository(client);

    await expect(
      repository.listMine(3, { page: 2, pageSize: 10, type: "technician", status: "draft" })
    ).resolves.toMatchObject({ total: 1, page: 2, page_size: 10 });
    expect(identityApplication.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 3, type: "technician", status: "draft", deletedAt: null },
        skip: 10,
        take: 10,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }]
      })
    );
  });

  it("searches published shops by numeric merchant id, name, city, or address", async () => {
    const shop = {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 21,
          name: "GINZA Calm Body Lab",
          city: "东京",
          address: "东京都中央区银座3-4-12"
        }
      ]),
      count: jest.fn().mockResolvedValue(1)
    };
    const client = {
      $transaction: jest.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
      shop
    } as unknown as PrismaClient;
    const repository = new IdentityApplicationRepository(client);

    await expect(
      repository.searchEligibleShops({ page: 1, pageSize: 20, query: "21" })
    ).resolves.toEqual({
      list: [
        {
          id: 21,
          merchantId: "21",
          name: "GINZA Calm Body Lab",
          city: "东京",
          address: "东京都中央区银座3-4-12"
        }
      ],
      total: 1,
      page: 1,
      page_size: 20
    });
    expect(shop.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "published",
          deletedAt: null,
          OR: [
            { id: 21 },
            { name: { contains: "21" } },
            { city: { contains: "21" } },
            { address: { contains: "21" } }
          ]
        },
        skip: 0,
        take: 20
      })
    );
  });
});
