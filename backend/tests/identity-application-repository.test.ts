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

  it("validates that application keywords are active and belong to a selected category", async () => {
    const category = { findMany: jest.fn().mockResolvedValue([{ id: 1 }]) };
    const businessKeyword = { findMany: jest.fn().mockResolvedValue([{ id: 10, categoryId: 1 }]) };
    const repository = new IdentityApplicationRepository({
      category,
      businessKeyword
    } as unknown as PrismaClient);

    await expect(
      repository.assertMerchantTaxonomySelection({
        serviceCategoryIds: [1],
        businessKeywordIds: [10]
      })
    ).resolves.toBeUndefined();
    expect(businessKeyword.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ category: { isActive: true, deletedAt: null } })
      })
    );

    businessKeyword.findMany.mockResolvedValueOnce([{ id: 10, categoryId: 2 }]);
    await expect(
      repository.assertMerchantTaxonomySelection({
        serviceCategoryIds: [1],
        businessKeywordIds: [10]
      })
    ).rejects.toMatchObject({
      message: "error.identity_application.taxonomy_selection_invalid",
      statusCode: 400
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

  it("creates merchant taxonomy joins in the same nested draft write", async () => {
    const merchantRow = {
      ...applicationRow,
      type: "merchant",
      technicianDetail: null,
      merchantDetail: {
        applicantKind: "individual",
        corporateLegalName: null,
        corporateLegalNameKana: null,
        representativeName: "山本太郎",
        representativeNameKana: "ヤマモトタロウ",
        shopName: "NeeDo 银座店",
        businessAddress: "東京都中央区",
        contactPhone: "0312345678",
        responsiblePersonName: "山本太郎",
        showcaseDraft: { description: "リラクゼーション", nearestStation: "新宿駅 南口", stationAccess: "徒歩5分" },
        bankAccountId: null,
        contractAcceptanceId: null,
        bankAccount: null
      },
      serviceCategories: [{ categoryId: 1 }],
      businessKeywords: [{ businessKeywordId: 10 }]
    };
    const identityApplication = { create: jest.fn().mockResolvedValue(merchantRow) };
    const repository = new IdentityApplicationRepository({
      identityApplication
    } as unknown as PrismaClient);

    await expect(
      repository.createMerchantDraft({
        userId: 3,
        activeKey: "3:merchant",
        detail: {
          applicantKind: "individual",
          corporateLegalName: null,
          corporateLegalNameKana: null,
          representativeName: "山本太郎",
          representativeNameKana: "ヤマモトタロウ",
          shopName: "NeeDo 银座店",
          businessAddress: "東京都中央区",
          contactPhone: "0312345678",
          responsiblePersonName: "山本太郎",
          showcaseDraft: { description: "リラクゼーション", nearestStation: "新宿駅 南口", stationAccess: "徒歩5分" },
          serviceCategoryIds: [1],
          businessKeywordIds: [10],
          bankAccountId: null,
          contractAcceptanceId: null,
          mediaPurposes: [],
          bankVerificationStatus: null,
          eKycVerified: false
        }
      })
    ).resolves.toMatchObject({
      merchantDetail: { serviceCategoryIds: [1], businessKeywordIds: [10], showcaseDraft: { description: "リラクゼーション", nearestStation: "新宿駅 南口", stationAccess: "徒歩5分" } }
    });
    expect(identityApplication.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          merchantDetail: { create: expect.objectContaining({ showcaseDraft: {
            description: "リラクゼーション", nearestStation: "新宿駅 南口", stationAccess: "徒歩5分"
          } }) },
          serviceCategories: { create: [{ categoryId: 1, selectedByUserId: 3 }] },
          businessKeywords: { create: [{ businessKeywordId: 10, selectedByUserId: 3 }] }
        })
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

  it("searches published shops by formal merchant id, name, city, or address", async () => {
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
      repository.searchEligibleShops({ page: 1, pageSize: 20, query: "s0000000021" })
    ).resolves.toEqual({
      list: [
        {
          id: 21,
          merchantId: "s0000000021",
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
            { name: { contains: "s0000000021" } },
            { city: { contains: "s0000000021" } },
            { address: { contains: "s0000000021" } }
          ]
        },
        skip: 0,
        take: 20
      })
    );
  });
});
