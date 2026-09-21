import { CoreReadRepository } from "../src/repositories/core-read.repository";
import { CoreReadService } from "../src/services/core-read.service";

const viewer = {
  userId: 7,
  identityId: 70,
  identityType: "customer",
  identityScopeType: "customer_profile",
  identityScopeId: 71
};
const visibilityWhere = {
  OR: [{ visibility: "public" }, { ownerUserId: viewer.userId }]
};

describe("core read shop visibility", () => {
  it("applies the shared visibility filter before service and shop pagination", async () => {
    const serviceFindMany = jest.fn(async () => []);
    const serviceCount = jest.fn(async () => 0);
    const shopFindMany = jest.fn(async () => []);
    const shopCount = jest.fn(async () => 0);
    const policy = {
      buildVisibilityWhere: jest.fn(async () => visibilityWhere),
      canView: jest.fn(),
      canViewTarget: jest.fn(),
      findVisibility: jest.fn(),
      updateVisibility: jest.fn()
    };
    const repository = new CoreReadRepository(
      {
        service: { findMany: serviceFindMany, count: serviceCount },
        shop: { findMany: shopFindMany, count: shopCount }
      } as never,
      undefined,
      policy
    );

    await repository.listServices({ page: 1, pageSize: 20 }, viewer);
    await repository.searchShops(
      { entityType: "shop", keywords: [], categoryIds: [], page: 1, pageSize: 20 },
      viewer
    );

    expect(serviceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ shop: expect.objectContaining(visibilityWhere) })
      })
    );
    expect(shopFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining(visibilityWhere) })
    );
    expect(policy.buildVisibilityWhere).toHaveBeenCalledWith(viewer);
  });

  it("keeps visibility and keyword predicates when searching shops", async () => {
    const shopFindMany = jest.fn(async () => []);
    const shopCount = jest.fn(async () => 0);
    const policy = {
      buildVisibilityWhere: jest.fn(async () => visibilityWhere)
    };
    const repository = new CoreReadRepository(
      { shop: { findMany: shopFindMany, count: shopCount } } as never,
      undefined,
      policy as never
    );

    await repository.searchShops(
      {
        entityType: "shop",
        keyword: "StagingTest",
        keywords: [],
        categoryIds: [],
        page: 1,
        pageSize: 20
      },
      viewer
    );

    const expectedWhere = expect.objectContaining({
      AND: expect.arrayContaining([
        visibilityWhere,
        {
          OR: expect.arrayContaining([
            { name: { contains: "StagingTest" } },
            { city: { contains: "StagingTest" } },
            { address: { contains: "StagingTest" } }
          ])
        }
      ])
    });
    expect(shopFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere })
    );
    expect(shopCount).toHaveBeenCalledWith({ where: expectedWhere });
  });

  it("keeps public visibility on numeric and formal-id shop detail lookups", async () => {
    const shopFindFirst = jest.fn(async () => null);
    const anonymousWhere = { visibility: "public" };
    const policy = {
      buildVisibilityWhere: jest.fn(async (currentViewer?: typeof viewer) =>
        currentViewer ? visibilityWhere : anonymousWhere
      )
    };
    const repository = new CoreReadRepository(
      { shop: { findFirst: shopFindFirst } } as never,
      undefined,
      policy as never
    );

    await repository.findShopDetail(11, "ja");
    await repository.findShopDetail("shop6333731099", "ja", viewer);

    expect(shopFindFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          id: 11,
          deletedAt: null,
          status: "published",
          ...anonymousWhere
        })
      })
    );
    expect(shopFindFirst).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          publicIdentifier: {
            is: {
              publicId: "shop6333731099",
              status: "ACTIVE",
              deletedAt: null
            }
          },
          deletedAt: null,
          status: "published",
          ...visibilityWhere
        })
      })
    );
    expect(policy.buildVisibilityWhere).toHaveBeenNthCalledWith(1, undefined);
    expect(policy.buildVisibilityWhere).toHaveBeenNthCalledWith(2, viewer);
  });

  it("grants only a signed-in viewer the limited shop bound to a live published intelligence source", async () => {
    const shopFindFirst = jest.fn(async () => null);
    const sourceFindFirst = jest.fn(async () => ({
      service: { shopId: 11 },
      post: { authorIdentity: { type: "merchant_owner", scopeType: "shop", scopeId: 11, isActive: true, deletedAt: null } }
    }));
    const policy = { buildVisibilityWhere: jest.fn(async () => visibilityWhere) };
    const repository = new CoreReadRepository(
      { shop: { findFirst: shopFindFirst }, exchangeIntelligence: { findFirst: sourceFindFirst } } as never,
      undefined,
      policy as never
    );

    await Reflect.apply(repository.findShopDetail, repository, ["shop6333731099", undefined, viewer, 61]);

    expect(sourceFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        postId: 61,
        deletedAt: null,
        technicianServiceId: null,
        post: expect.objectContaining({ type: "INTELLIGENCE", status: "PUBLISHED", deletedAt: null, expiresAt: expect.any(Object) }),
        service: expect.objectContaining({ shop: expect.objectContaining({ publicIdentifier: expect.any(Object) }) })
      })
    }));
    expect(shopFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        AND: expect.arrayContaining([
          { OR: [visibilityWhere, { id: 11, visibility: "limited" }] }
        ])
      })
    }));

    await Reflect.apply(repository.findShopDetail, repository, ["shop6333731099", undefined, undefined, 61]);
    expect(sourceFindFirst).toHaveBeenCalledTimes(1);
    expect(shopFindFirst).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.not.objectContaining({ AND: expect.anything() })
    }));
  });

  it("does not grant a mismatched or inactive intelligence source", async () => {
    const shopFindFirst = jest.fn(async () => null);
    const sourceFindFirst = jest.fn(async () => ({
      service: { shopId: 11 },
      post: { authorIdentity: { type: "merchant_owner", scopeType: "shop", scopeId: 12, isActive: true, deletedAt: null } }
    }));
    const repository = new CoreReadRepository(
      { shop: { findFirst: shopFindFirst }, exchangeIntelligence: { findFirst: sourceFindFirst } } as never,
      undefined,
      { buildVisibilityWhere: jest.fn(async () => visibilityWhere) } as never
    );

    await Reflect.apply(repository.findShopDetail, repository, ["shop6333731099", undefined, viewer, 61]);

    expect(shopFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining(visibilityWhere)
    }));
    expect(shopFindFirst).not.toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ AND: expect.anything() })
    }));
  });

  it("passes the authenticated selected identity through list and detail services", async () => {
    const repository = {
      listServices: jest.fn(async () => ({ list: [], total: 0, page: 1, page_size: 20 })),
      findShopDetail: jest.fn(async () => null)
    };
    const service = new CoreReadService(repository as never);

    await service.listServices({ page: 1, pageSize: 20 }, viewer);
    await expect(service.getShopDetail(21, undefined, viewer)).rejects.toMatchObject({
      statusCode: 404
    });

    expect(repository.listServices).toHaveBeenCalledWith({ page: 1, pageSize: 20 }, viewer);
    expect(repository.findShopDetail).toHaveBeenCalledWith(21, undefined, viewer);
  });

  it("keeps hidden shop keywords and locations out of technician search eligibility", async () => {
    const technicianFindMany = jest.fn(async () => []);
    const technicianCount = jest.fn(async () => 0);
    const policy = {
      buildVisibilityWhere: jest.fn(async () => visibilityWhere)
    };
    const repository = new CoreReadRepository(
      { technicianProfile: { findMany: technicianFindMany, count: technicianCount } } as never,
      undefined,
      policy as never
    );
    const input = {
      entityType: "technician" as const,
      keyword: "private service",
      keywords: ["private service"],
      categoryIds: [],
      page: 1,
      pageSize: 20
    };

    await repository.searchTechnicians(input, viewer);
    await repository.countEligibleLocatedTechnicians(input, viewer);

    expect(technicianFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              services: {
                some: expect.objectContaining({
                  shop: { is: expect.objectContaining(visibilityWhere) }
                })
              }
            }),
            expect.objectContaining({
              technicianShopAffiliations: {
                some: expect.objectContaining({
                  shop: expect.objectContaining(visibilityWhere)
                })
              }
            })
          ])
        })
      })
    );
    expect(technicianCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: [{
            OR: expect.arrayContaining([
              expect.objectContaining({
                technicianShopAffiliations: {
                  some: expect.objectContaining({
                    shop: expect.objectContaining(visibilityWhere)
                  })
                }
              })
            ])
          }]
        })
      })
    );
  });
});
