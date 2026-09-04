import { ShopEmployeeDirectoryRepository } from "../src/repositories/shop-employee-directory.repository";

const now = new Date("2026-09-03T04:00:00.000Z");

const role = (
  code: string,
  isTechnicianRole = false
) => ({
  startsAt: new Date("2026-08-28T00:00:00.000Z"),
  endsAt: null,
  activeKey: `assignment:${code}`,
  deletedAt: null,
  shopEmployeeRole: {
    code,
    nameZhHans: code === "TECHNICIAN" ? "技师" : "店主",
    nameZhHant: code === "TECHNICIAN" ? "技師" : "店主",
    nameJa: code === "TECHNICIAN" ? "技術者" : "オーナー",
    nameEn: code === "TECHNICIAN" ? "Technician" : "Owner",
    nameKo: code === "TECHNICIAN" ? "기술자" : "점주",
    isTechnicianRole,
    deletedAt: null
  }
});

const technicianEmployeeRecord = {
  status: "ACTIVE",
  startsAt: new Date("2026-08-28T00:00:00.000Z"),
  endsAt: null,
  user: {
    needoId: "u0000000047",
    username: "斋藤账号",
    avatarUrl: null,
    email: "staff@example.com",
    phone: null
  },
  roleAssignments: [role("TECHNICIAN", true)],
  technicianShopAffiliation: {
    relationshipType: "PARTNER",
    workStatus: "ACTIVE",
    startsAt: new Date("2026-08-28T00:00:00.000Z"),
    endsAt: null,
    deletedAt: null,
    technicianProfile: {
      displayName: "斋藤 花子",
      deletedAt: null,
      user: {
        identities: [
          {
            publicIdentifier: {
              publicId: "s0000000047",
              kind: "S",
              status: "ACTIVE",
              deletedAt: null
            }
          }
        ]
      }
    }
  }
};

const ownerEmployeeRecord = {
  status: "ON_LEAVE",
  startsAt: new Date("2026-08-20T00:00:00.000Z"),
  endsAt: null,
  user: {
    needoId: "u0000000086",
    username: "LifeDance 店主",
    avatarUrl: "/owner.png",
    email: "owner@example.com",
    phone: "+81-90-0000-0086"
  },
  roleAssignments: [role("OWNER")],
  technicianShopAffiliation: null
};

const setup = () => {
  const client = {
    shopEmployee: {
      findMany: jest.fn().mockResolvedValue([technicianEmployeeRecord, ownerEmployeeRecord]),
      count: jest.fn().mockResolvedValue(2)
    }
  };
  return {
    client,
    repository: new ShopEmployeeDirectoryRepository(client as never, () => now)
  };
};

describe("ShopEmployeeDirectoryRepository", () => {
  it("uses one current-shop Prisma projection with pagination and formal filters", async () => {
    const { client, repository } = setup();

    await repository.listCurrentShopEmployees({
      shopId: 16,
      page: 2,
      pageSize: 30,
      keyword: "斋藤",
      status: "active",
      roleCode: "TECHNICIAN"
    });

    expect(client.shopEmployee.findMany).toHaveBeenCalledTimes(1);
    expect(client.shopEmployee.count).toHaveBeenCalledTimes(1);
    const findInput = client.shopEmployee.findMany.mock.calls[0]?.[0];
    const countInput = client.shopEmployee.count.mock.calls[0]?.[0];

    expect(findInput).toMatchObject({
      where: {
        shopId: 16,
        status: "ACTIVE",
        startsAt: { lte: now },
        activeKey: { not: null },
        deletedAt: null,
        shop: { status: { not: "archived" }, deletedAt: null },
        user: { isActive: true, deletedAt: null },
        roleAssignments: {
          some: expect.objectContaining({
            startsAt: { lte: now },
            activeKey: { not: null },
            deletedAt: null,
            shopEmployeeRole: expect.objectContaining({
              code: "TECHNICIAN",
              deletedAt: null
            })
          })
        }
      },
      skip: 30,
      take: 30,
      orderBy: [{ user: { username: "asc" } }, { id: "asc" }]
    });
    expect(findInput.where.AND).toEqual(
      expect.arrayContaining([
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        expect.objectContaining({ OR: expect.any(Array) })
      ])
    );
    expect(JSON.stringify(findInput.where.AND)).toContain("needoId");
    expect(JSON.stringify(findInput.where.AND)).toContain("username");
    expect(JSON.stringify(findInput.where.AND)).toContain("email");
    expect(JSON.stringify(findInput.where.AND)).toContain("phone");
    expect(JSON.stringify(findInput.where.AND)).toContain("displayName");
    expect(JSON.stringify(findInput.where.AND)).toContain("publicId");
    expect(JSON.stringify(findInput.where.AND)).toContain("nameZhHans");
    expect(countInput.where).toBe(findInput.where);
  });

  it("maps localized roles and optional technician data without internal ids", async () => {
    const { repository } = setup();

    const result = await repository.listCurrentShopEmployees({ shopId: 16 });

    expect(result).toEqual({
      list: [
        {
          needoId: "u0000000047",
          displayName: "斋藤 花子",
          avatarUrl: null,
          email: "staff@example.com",
          phone: null,
          status: "active",
          startsAt: "2026-08-28T00:00:00.000Z",
          endsAt: null,
          roles: [
            {
              code: "TECHNICIAN",
              names: {
                zhHans: "技师",
                zhHant: "技師",
                ja: "技術者",
                en: "Technician",
                ko: "기술자"
              },
              isTechnicianRole: true
            }
          ],
          technician: {
            needoId: "s0000000047",
            relationshipType: "partner",
            workStatus: "active"
          }
        },
        {
          needoId: "u0000000086",
          displayName: "LifeDance 店主",
          avatarUrl: "/owner.png",
          email: "owner@example.com",
          phone: "+81-90-0000-0086",
          status: "on_leave",
          startsAt: "2026-08-20T00:00:00.000Z",
          endsAt: null,
          roles: [
            {
              code: "OWNER",
              names: {
                zhHans: "店主",
                zhHant: "店主",
                ja: "オーナー",
                en: "Owner",
                ko: "점주"
              },
              isTechnicianRole: false
            }
          ],
          technician: null
        }
      ],
      total: 2,
      page: 1,
      page_size: 20
    });
    expect(JSON.stringify(result)).not.toMatch(
      /"(?:id|shopEmployeeId|userId|roleId|affiliationId|identityId)":/
    );
  });
});
