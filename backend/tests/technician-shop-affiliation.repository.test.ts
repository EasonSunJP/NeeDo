import type { PrismaClient } from "@prisma/client";
import { TechnicianShopAffiliationRepository } from "../src/repositories/technician-shop-affiliation.repository";

const startsAt = new Date("2026-08-28T00:00:00.000Z");

const employeeRecord = (overrides: Record<string, unknown> = {}) => ({
  id: 91,
  relationshipType: "PARTNER",
  workStatus: "ACTIVE",
  startsAt,
  endsAt: null,
  technicianProfile: {
    displayName: "斋藤 健太",
    bio: "整体与放松护理",
    city: "东京都涩谷区",
    serviceArea: "涩谷区、新宿区",
    yearsExperience: 9,
    status: "published",
    verifiedAt: new Date("2026-05-25T00:00:00.000Z"),
    updatedAt: new Date("2026-08-28T00:00:00.000Z"),
    user: {
      avatarUrl: "/avatar.png",
      email: "staff@example.com",
      phone: "+81-90-0000-0000",
      isActive: true,
      lastLoginAt: new Date("2026-08-27T12:00:00.000Z"),
      identities: [
        {
          publicIdentifier: {
            publicId: "s0000000086",
            kind: "S",
            status: "ACTIVE"
          }
        }
      ]
    }
  },
  shop: {
    id: 16,
    name: "LifeDance Wellness",
    publicIdentifier: {
      publicId: "shop0000000016",
      kind: "SHOP",
      status: "ACTIVE"
    }
  },
  ...overrides
});

const transactionClient = (overrides: Record<string, unknown> = {}) => ({
  userIdentity: {
    findFirst: jest.fn().mockResolvedValue({
      user: { technicianProfile: { id: 47 } }
    })
  },
  shop: { findFirst: jest.fn().mockResolvedValue({ id: 16 }) },
  technicianShopAffiliation: {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(employeeRecord()),
    create: jest.fn().mockResolvedValue(employeeRecord()),
    update: jest.fn().mockResolvedValue(employeeRecord())
  },
  technicianProfile: {
    update: jest.fn().mockResolvedValue({ id: 47 })
  },
  $queryRaw: jest.fn().mockResolvedValue([{ id: 47 }]),
  ...overrides
});

const transactionalClient = (tx: ReturnType<typeof transactionClient>) =>
  ({
    $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx))
  }) as unknown as PrismaClient;

describe("TechnicianShopAffiliationRepository", () => {
  it("lists only current employees in the requested shop and maps the canonical S identifier", async () => {
    const findMany = jest.fn().mockResolvedValue([employeeRecord()]);
    const count = jest.fn().mockResolvedValue(1);
    const repository = new TechnicianShopAffiliationRepository({
      technicianShopAffiliation: { findMany, count }
    } as unknown as PrismaClient);

    await expect(
      repository.listCurrentShopEmployees({
        shopId: 16,
        keyword: "斋藤",
        relationshipType: "partner",
        workStatus: "active",
        page: 1,
        pageSize: 20
      })
    ).resolves.toMatchObject({
      total: 1,
      list: [
        {
          needoId: "s0000000086",
          displayName: "斋藤 健太",
          affiliation: {
            relationshipType: "partner",
            workStatus: "active",
            shop: { publicId: "shop0000000016" }
          }
        }
      ]
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          shopId: 16,
          activeKey: { not: null },
          deletedAt: null,
          workStatus: "ACTIVE"
        }),
        skip: 0,
        take: 20
      })
    );
  });

  it("normalizes a legacy exclusive row to the single collaboration relationship", async () => {
    const repository = new TechnicianShopAffiliationRepository({
      technicianShopAffiliation: {
        findMany: jest.fn().mockResolvedValue([employeeRecord({ relationshipType: "EXCLUSIVE" })]),
        count: jest.fn().mockResolvedValue(1)
      }
    } as unknown as PrismaClient);

    await expect(
      repository.listCurrentShopEmployees({ shopId: 16, page: 1, pageSize: 20 })
    ).resolves.toMatchObject({
      list: [{ affiliation: { relationshipType: "partner" } }]
    });
  });

  it("finds details only through the technician identity inside the current shop", async () => {
    const findFirst = jest.fn().mockResolvedValue(employeeRecord());
    const repository = new TechnicianShopAffiliationRepository({
      technicianShopAffiliation: { findFirst }
    } as unknown as PrismaClient);

    await expect(repository.findCurrentShopEmployee(16, 86)).resolves.toMatchObject({
      needoId: "s0000000086",
      profile: {
        bio: "整体与放松护理",
        city: "东京都涩谷区",
        serviceArea: "涩谷区、新宿区",
        yearsExperience: 9,
        updatedAt: "2026-08-28T00:00:00.000Z"
      },
      account: {
        isActive: true,
        lastLoginAt: "2026-08-27T12:00:00.000Z"
      }
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          shopId: 16,
          activeKey: { not: null },
          technicianProfile: expect.objectContaining({
            user: expect.objectContaining({
              identities: { some: expect.objectContaining({ id: 86 }) }
            })
          })
        })
      })
    );
  });

  it("maps scoped audit mutations into paginated semantic employee events", async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 501,
        action: "merchant_admin.employee_profile.update",
        metadata: { changedFields: ["displayName", "city"] },
        createdAt: new Date("2026-08-28T15:43:00.000Z"),
        actor: {
          username: "LifeDance 管理员",
          email: "admin@example.jp",
          avatarUrl: "/admin-avatar.png"
        }
      }
    ]);
    const count = jest.fn().mockResolvedValue(1);
    const findAffiliation = jest.fn().mockResolvedValue({
      startsAt: new Date("2026-06-01T00:00:00.000Z"),
      technicianProfile: { verifiedAt: new Date("2026-05-25T00:00:00.000Z") },
      shop: { name: "LifeDance Wellness" }
    });
    const repository = new TechnicianShopAffiliationRepository({
      auditLog: { findMany, count },
      technicianShopAffiliation: { findFirst: findAffiliation }
    } as unknown as PrismaClient);

    const result = await repository.listCurrentShopEmployeeTimeline({
      affiliationId: 91,
      shopId: 16,
      page: 1,
      pageSize: 20
    });

    expect(result).toEqual({
      list: [
        {
          id: "audit-501",
          at: "2026-08-28T15:43:00.000Z",
          actorName: "LifeDance 管理员",
          actorAvatarUrl: "/admin-avatar.png",
          actorRole: "基本资料",
          message: "更新了姓名、城市",
          tone: "accent"
        },
        {
          id: "system-affiliation-91",
          at: "2026-06-01T00:00:00.000Z",
          actorName: "NeeDo 系统",
          actorAvatarUrl: null,
          actorRole: "从属关系",
          message: "加入店铺并建立员工从属关系 · LifeDance Wellness",
          tone: "green"
        },
        {
          id: "system-verified-91",
          at: "2026-05-25T00:00:00.000Z",
          actorName: "NeeDo 系统",
          actorAvatarUrl: null,
          actorRole: "档案验证",
          message: "员工档案已通过验证",
          tone: "green"
        }
      ],
      total: 3,
      page: 1,
      page_size: 20
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          action: { in: expect.arrayContaining(["merchant_admin.employee_profile.update"]) },
          targetType: "technician_shop_affiliation",
          targetId: 91,
          deletedAt: null
        },
        skip: 0,
        take: 1
      })
    );
    expect(findAffiliation).toHaveBeenCalledWith({
      where: { id: 91, shopId: 16, deletedAt: null },
      select: {
        startsAt: true,
        technicianProfile: { select: { verifiedAt: true } },
        shop: { select: { name: true } }
      }
    });
    expect(findMany.mock.calls[0]?.[0]?.select?.actor?.select).toEqual({
      username: true,
      avatarUrl: true
    });
    expect(JSON.stringify(result)).not.toMatch(/changedFields|merchant_admin|shopId|targetId/);
  });

  it("paginates employee system lifecycle events inside the same formal total", async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 505,
        action: "merchant_admin.employee_timeline.comment",
        metadata: { message: "第一条审计记录" },
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        actor: { username: "财务管理员", avatarUrl: null }
      },
      {
        id: 504,
        action: "merchant_admin.employee_timeline.comment",
        metadata: { message: "第二条审计记录" },
        createdAt: new Date("2026-07-15T00:00:00.000Z"),
        actor: { username: "财务管理员", avatarUrl: null }
      },
      {
        id: 503,
        action: "merchant_admin.employee_timeline.comment",
        metadata: { message: "第三条审计记录" },
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
        actor: { username: "财务管理员", avatarUrl: null }
      }
    ]);
    const repository = new TechnicianShopAffiliationRepository({
      auditLog: { findMany, count: jest.fn().mockResolvedValue(3) },
      technicianShopAffiliation: {
        findFirst: jest.fn().mockResolvedValue({
          startsAt: new Date("2026-06-01T00:00:00.000Z"),
          technicianProfile: { verifiedAt: new Date("2026-05-25T00:00:00.000Z") },
          shop: { name: "LifeDance Wellness" }
        })
      }
    } as unknown as PrismaClient);

    const result = await repository.listCurrentShopEmployeeTimeline({
      affiliationId: 91,
      shopId: 16,
      page: 2,
      pageSize: 2
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 3 }));
    expect(result).toEqual(
      expect.objectContaining({
        total: 5,
        page: 2,
        page_size: 2,
        list: [
          expect.objectContaining({ id: "audit-503" }),
          expect.objectContaining({ id: "system-affiliation-91" })
        ]
      })
    );
  });

  it("sorts lifecycle and audit events together before applying the page", async () => {
    const repository = new TechnicianShopAffiliationRepository({
      auditLog: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 500,
            action: "merchant_admin.employee_timeline.comment",
            metadata: { message: "更早的审计记录" },
            createdAt: new Date("2026-04-01T00:00:00.000Z"),
            actor: { username: "财务管理员", avatarUrl: null }
          }
        ]),
        count: jest.fn().mockResolvedValue(1)
      },
      technicianShopAffiliation: {
        findFirst: jest.fn().mockResolvedValue({
          startsAt: new Date("2026-06-01T00:00:00.000Z"),
          technicianProfile: { verifiedAt: new Date("2026-05-25T00:00:00.000Z") },
          shop: { name: "LifeDance Wellness" }
        })
      }
    } as unknown as PrismaClient);

    const result = await repository.listCurrentShopEmployeeTimeline({
      affiliationId: 91,
      shopId: 16,
      page: 1,
      pageSize: 2
    });

    expect(result.list.map((event) => event.id)).toEqual([
      "system-affiliation-91",
      "system-verified-91"
    ]);
    expect(result.total).toBe(3);
  });

  it("projects partner availability and merges other-shop confirmed time without leaking details", async () => {
    const bookingFindMany = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          startsAt: new Date("2026-08-29T13:00:00.000Z"),
          endsAt: new Date("2026-08-29T14:00:00.000Z")
        },
        {
          startsAt: new Date("2026-08-29T13:30:00.000Z"),
          endsAt: new Date("2026-08-29T15:00:00.000Z")
        }
      ]);
    const repository = new TechnicianShopAffiliationRepository({
      userIdentity: {
        findFirst: jest.fn().mockResolvedValue({
          user: { technicianProfile: { id: 47 } }
        })
      },
      technicianShopAffiliation: {
        findFirst: jest.fn().mockResolvedValue({ relationshipType: "PARTNER" })
      },
      scheduleSlot: { findMany: jest.fn().mockResolvedValue([]) },
      bookingOrder: { findMany: bookingFindMany },
      availability: {
        findMany: jest.fn().mockResolvedValue([
          {
            startsAt: new Date("2026-08-29T12:00:00.000Z"),
            endsAt: new Date("2026-08-29T16:00:00.000Z")
          }
        ])
      }
    } as unknown as PrismaClient);

    const result = await repository.listCurrentShopEmployeeSchedule({
      shopId: 16,
      technicianIdentityId: 86,
      from: new Date("2026-08-29T00:00:00.000Z"),
      to: new Date("2026-08-30T00:00:00.000Z"),
      view: "day"
    });

    expect(result).toEqual([
      expect.objectContaining({
        kind: "availability",
        startsAt: "2026-08-29T12:00:00.000Z",
        endsAt: "2026-08-29T16:00:00.000Z"
      }),
      {
        projectionId: "busy-redacted:2026-08-29T13:00:00.000Z:2026-08-29T15:00:00.000Z",
        kind: "busy_redacted",
        visibility: "busy_redacted",
        status: "busy",
        startsAt: "2026-08-29T13:00:00.000Z",
        endsAt: "2026-08-29T15:00:00.000Z",
        title: "其他店铺已有确认安排",
        isClickable: false,
        isEditable: false
      }
    ]);
    const serialized = JSON.stringify(result?.find((event) => event.kind === "busy_redacted"));
    expect(serialized).not.toMatch(/shop|order|service|customer|price|address|note|participant/i);
  });

  it("updates only a profile with a current affiliation in the requested shop", async () => {
    const tx = transactionClient();
    const repository = new TechnicianShopAffiliationRepository(transactionalClient(tx));

    await expect(
      repository.updateCurrentShopEmployeeProfile({
        shopId: 16,
        technicianIdentityId: 86,
        actorUserId: 7,
        profile: {
          displayName: "斋藤 健太",
          bio: "整体与放松护理",
          city: "东京都涩谷区",
          serviceArea: "涩谷区、新宿区",
          yearsExperience: 9
        }
      })
    ).resolves.toMatchObject({
      needoId: "s0000000086",
      profile: { city: "东京都涩谷区", yearsExperience: 9 }
    });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.technicianProfile.update).toHaveBeenCalledWith({
      where: { id: 47 },
      data: {
        displayName: "斋藤 健太",
        bio: "整体与放松护理",
        city: "东京都涩谷区",
        serviceArea: "涩谷区、新宿区",
        yearsExperience: 9
      }
    });
    expect(tx.technicianShopAffiliation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ shopId: 16 }),
        select: expect.any(Object)
      })
    );
  });

  it("refuses a profile update when the employee is not currently affiliated to the shop", async () => {
    const tx = transactionClient();
    tx.technicianShopAffiliation.findFirst.mockResolvedValue(null);
    const repository = new TechnicianShopAffiliationRepository(transactionalClient(tx));

    await expect(
      repository.updateCurrentShopEmployeeProfile({
        shopId: 20,
        technicianIdentityId: 86,
        actorUserId: 7,
        profile: { city: "东京都港区" }
      })
    ).resolves.toBeNull();

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.technicianProfile.update).not.toHaveBeenCalled();
  });

  it("allows a collaboration relationship when the technician already has three current shops including a legacy exclusive row", async () => {
    const tx = transactionClient();
    tx.technicianShopAffiliation.findFirst.mockResolvedValueOnce(null);
    tx.technicianShopAffiliation.findMany.mockResolvedValue([
      { id: 72, shopId: 20, relationshipType: "EXCLUSIVE" },
      { id: 73, shopId: 21, relationshipType: "PARTNER" },
      { id: 74, shopId: 22, relationshipType: "PARTNER" }
    ]);
    const repository = new TechnicianShopAffiliationRepository(transactionalClient(tx));

    await expect(
      repository.upsertCurrentAffiliation({
        shopId: 16,
        technicianIdentityId: 86,
        actorUserId: 7,
        relationshipType: "partner",
        workStatus: "active",
        startsAt,
        endsAt: null
      })
    ).resolves.toMatchObject({ affiliation: { relationshipType: "partner" } });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.technicianShopAffiliation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shopId: 16,
          technicianProfileId: 47,
          relationshipType: "PARTNER"
        })
      })
    );
  });

  it("allows the current shop to convert its own exclusive relationship to partner", async () => {
    const tx = transactionClient();
    tx.technicianShopAffiliation.findFirst.mockResolvedValueOnce({ id: 91 });
    tx.technicianShopAffiliation.update.mockResolvedValue(
      employeeRecord({ relationshipType: "PARTNER" })
    );
    const repository = new TechnicianShopAffiliationRepository(transactionalClient(tx));

    await expect(
      repository.upsertCurrentAffiliation({
        shopId: 16,
        technicianIdentityId: 86,
        actorUserId: 7,
        relationshipType: "partner",
        workStatus: "active",
        startsAt,
        endsAt: null
      })
    ).resolves.toMatchObject({
      needoId: "s0000000086",
      affiliation: { relationshipType: "partner" }
    });

    expect(tx.technicianShopAffiliation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 91 },
        data: expect.objectContaining({
          relationshipType: "PARTNER",
          workStatus: "ACTIVE",
          activeKey: "technician:47:shop:16",
          updatedById: 7
        })
      })
    );
  });

  it("allows a partner relationship to coexist across affiliated shops", async () => {
    const tx = transactionClient();
    tx.technicianShopAffiliation.findFirst.mockResolvedValueOnce(null);
    tx.technicianShopAffiliation.findMany.mockResolvedValue([
      { id: 72, shopId: 20, relationshipType: "PARTNER" }
    ]);
    const repository = new TechnicianShopAffiliationRepository(transactionalClient(tx));

    await expect(
      repository.upsertCurrentAffiliation({
        shopId: 16,
        technicianIdentityId: 86,
        actorUserId: 7,
        relationshipType: "partner",
        workStatus: "active",
        startsAt,
        endsAt: null
      })
    ).resolves.toMatchObject({ affiliation: { relationshipType: "partner" } });
    expect(tx.technicianShopAffiliation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          technicianProfileId: 47,
          shopId: 16,
          relationshipType: "PARTNER",
          activeKey: "technician:47:shop:16"
        })
      })
    );
  });

  it("ends the current relationship without deleting its history", async () => {
    const endsAt = new Date("2026-08-29T00:00:00.000Z");
    const tx = transactionClient();
    tx.technicianShopAffiliation.findFirst.mockResolvedValueOnce({ id: 91 });
    tx.technicianShopAffiliation.update.mockResolvedValue(
      employeeRecord({ workStatus: "ENDED", endsAt })
    );
    const repository = new TechnicianShopAffiliationRepository(transactionalClient(tx));

    await expect(
      repository.upsertCurrentAffiliation({
        shopId: 16,
        technicianIdentityId: 86,
        actorUserId: 7,
        relationshipType: "partner",
        workStatus: "ended",
        startsAt,
        endsAt
      })
    ).resolves.toMatchObject({ affiliation: { workStatus: "ended" } });
    expect(tx.technicianShopAffiliation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 91 },
        data: {
          workStatus: "ENDED",
          endsAt,
          activeKey: null,
          updatedById: 7
        }
      })
    );
  });

  it("creates a new current row when an earlier relationship has already ended", async () => {
    const tx = transactionClient();
    tx.technicianShopAffiliation.findFirst.mockResolvedValueOnce(null);
    const repository = new TechnicianShopAffiliationRepository(transactionalClient(tx));

    await repository.upsertCurrentAffiliation({
      shopId: 16,
      technicianIdentityId: 86,
      actorUserId: 7,
      relationshipType: "partner",
      workStatus: "active",
      startsAt,
      endsAt: null
    });

    expect(tx.technicianShopAffiliation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          activeKey: "technician:47:shop:16",
          createdById: 7
        })
      })
    );
  });

  it("does not manufacture an ended history row when no current relationship exists", async () => {
    const tx = transactionClient();
    tx.technicianShopAffiliation.findFirst.mockResolvedValueOnce(null);
    const repository = new TechnicianShopAffiliationRepository(transactionalClient(tx));

    await expect(
      repository.upsertCurrentAffiliation({
        shopId: 16,
        technicianIdentityId: 86,
        actorUserId: 7,
        relationshipType: "partner",
        workStatus: "ended",
        startsAt,
        endsAt: new Date("2026-08-29T00:00:00.000Z")
      })
    ).resolves.toBe("not_found");
    expect(tx.technicianShopAffiliation.create).not.toHaveBeenCalled();
  });
});
