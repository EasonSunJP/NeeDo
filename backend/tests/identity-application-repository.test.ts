import { Prisma, type PrismaClient } from "@prisma/client";
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
  it("creates a technician invitation draft, notification, and audit in one transaction", async () => {
    const transaction = {
      identityApplication: { create: jest.fn().mockResolvedValue(applicationRow) },
      userIdentity: { findFirst: jest.fn().mockResolvedValue({ id: 70 }) },
      notification: { create: jest.fn().mockResolvedValue({ id: 4 }) },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 5 }) }
    };
    const client = { $transaction: jest.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)) } as unknown as PrismaClient;
    const repository = new IdentityApplicationRepository(client);
    const result = await repository.createTechnicianInvitation({
      actorUserId: 9, userId: 3, activeKey: "3:technician",
      detail: { targetShopId: 7, applicantName: "山本太郎", phone: null, city: null, serviceAreas: [], skills: [], yearsExperience: null, bio: null, gender: null, birthDate: null }
    });
    expect(result).toMatchObject({ id: 11, status: "draft", userId: 3 });
    expect(client.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.identityApplication.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: 3, type: "technician", status: "draft" }) }));
    expect(transaction.notification.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ recipientUserId: 3, recipientIdentityId: 70, actorUserId: 9, title: "identity.application.technician.invited.title" }) }));
    expect(transaction.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actorId: 9, targetType: "IdentityApplication", targetId: 11 }) }));
  });

  it("reports a concurrent invitation as a conflict", async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "test" });
    const client = { $transaction: jest.fn().mockRejectedValue(duplicate) } as unknown as PrismaClient;
    const repository = new IdentityApplicationRepository(client);
    await expect(repository.createTechnicianInvitation({
      actorUserId: 9, userId: 3, activeKey: "3:technician",
      detail: { targetShopId: 7, applicantName: "山本太郎", phone: null, city: null, serviceAreas: [], skills: [], yearsExperience: null, bio: null, gender: null, birthDate: null }
    })).rejects.toMatchObject({ statusCode: 409, message: "error.identity_application.conflict" });
  });

  it("searches and returns the formal shop ID instead of padding its database key", async () => {
    const shop = { findMany: jest.fn().mockResolvedValue([{ id: 217, name: "麻布十番", city: "東京", address: "港区", publicIdentifier: { publicId: "shop1357924680" } }]), count: jest.fn().mockResolvedValue(1) };
    const client = { shop, $transaction: (operations: Promise<unknown>[]) => Promise.all(operations) } as unknown as PrismaClient;
    const result = await new IdentityApplicationRepository(client).searchEligibleShops({ query: "shop1357924680", page: 1, pageSize: 20 });
    expect(result.list[0].merchantId).toBe("shop1357924680");
    expect(shop.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ OR: expect.arrayContaining([{ publicIdentifier: { is: { publicId: "shop1357924680", deletedAt: null } } }]) }) }));
  });

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
        orderBy: [{ createdAt: "desc" }, { id: "desc" }]
      })
    );
  });

  it("searches published shops by formal merchant id, name, city, or address", async () => {
    const shop = {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 21,
          publicIdentifier: { publicId: "shop2468135790" },
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
      repository.searchEligibleShops({ page: 1, pageSize: 20, query: "shop2468135790" })
    ).resolves.toEqual({
      list: [
        {
          id: 21,
          merchantId: "shop2468135790",
          coverUrl: null, rating: null, reviewCount: 0, keywords: [],
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
            { publicIdentifier: { is: { publicId: "shop2468135790", deletedAt: null } } },
            { name: { contains: "shop2468135790" } },
            { city: { contains: "shop2468135790" } },
            { address: { contains: "shop2468135790" } }
          ]
        },
        skip: 0,
        take: 20
      })
    );
  });
});
