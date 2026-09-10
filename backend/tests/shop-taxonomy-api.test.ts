import request from "supertest";
import { createApp } from "../src/app";
import { createStep06Fixture } from "./helpers/step06-fixture";

const paginated = <T>(list: T[]) => ({ list, total: list.length, page: 1, page_size: 20 });

describe("shop taxonomy public catalog API", () => {
  const category = {
    id: 1,
    code: "massage",
    label: "マッサージ",
    qualificationPolicy: "PLATFORM_REVIEW"
  };
  const keyword = {
    id: 10,
    code: "massage_home_visit",
    categoryId: 1,
    label: "訪問マッサージ",
    qualificationPolicy: "PLATFORM_REVIEW"
  };

  const createFixture = () => {
    const shopTaxonomyRepository = {
      listCategories: jest.fn(async () => paginated([category])),
      listKeywords: jest.fn(async () => paginated([keyword])),
      assertSelectable: jest.fn(async () => undefined)
    };
    const app = createApp(undefined, {
      redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
      shopTaxonomyRepository
    } as never);
    return { app, shopTaxonomyRepository };
  };

  it("defaults locale to ja and returns the standard pagination envelope", async () => {
    const fixture = createFixture();
    const response = await request(fixture.app).get("/api/v1/service-categories").expect(200);

    expect(response.body).toEqual({ code: 0, message: "success", data: paginated([category]) });
    expect(fixture.shopTaxonomyRepository.listCategories).toHaveBeenCalledWith({
      locale: "ja",
      page: undefined,
      pageSize: undefined
    });
  });

  it("accepts every supported locale and paginates category keywords", async () => {
    const fixture = createFixture();

    for (const locale of ["zh-CN", "zh-TW", "ja", "en", "ko"]) {
      await request(fixture.app)
        .get(
          `/api/v1/service-categories/1/keywords?locale=${encodeURIComponent(locale)}&page=1&pageSize=20`
        )
        .expect(200);
    }

    expect(fixture.shopTaxonomyRepository.listKeywords).toHaveBeenLastCalledWith(1, {
      locale: "ko",
      page: 1,
      pageSize: 20
    });
  });

  it("rejects unknown locales and invalid pagination", async () => {
    const fixture = createFixture();
    await request(fixture.app).get("/api/v1/service-categories?locale=fr").expect(400);
    await request(fixture.app).get("/api/v1/service-categories?pageSize=101").expect(400);
  });

  it("requires separate read/write permissions and forwards the current shop scope", async () => {
    const payload = {
      revision: 1,
      categoryLimit: 5,
      keywordLimit: 5,
      selectedCategories: [category],
      selectedKeywords: [keyword],
      removedKeywordIds: []
    };
    const shopTaxonomyRepository = {
      listCategories: jest.fn(),
      listKeywords: jest.fn(),
      assertSelectable: jest.fn(async () => undefined),
      getShopSelectionState: jest.fn(async () => ({
        revision: 1,
        selectedCategories: [category],
        selectedKeywords: [keyword]
      })),
      replaceShopSelection: jest.fn(async () => ({ ...payload, revision: 2 }))
    };
    const merchantShopContextRepository = {
      listManageableShops: jest.fn(async () => ({
        list: [
          {
            publicId: "shop1234567890",
            name: "Test Shop",
            city: "Tokyo",
            status: "published",
            selected: true
          }
        ],
        total: 1,
        page: 1,
        page_size: 1
      })),
      resolveShop: jest.fn(),
      resolveDefaultShop: jest.fn()
    };
    const fixture = await createStep06Fixture({
      shopTaxonomyRepository,
      merchantShopContextRepository
    } as never);
    fixture.users[0].identities[0] = {
      ...fixture.users[0].identities[0],
      type: "merchant_owner",
      scopeType: "shop",
      scopeId: 1
    };
    fixture.replaceAdminPermissions(["auth:me", "merchant-admin:shop:service-taxonomy:read"]);
    const readToken = await fixture.loginAsAdmin();

    await request(fixture.app)
      .get("/api/v1/merchant-admin/shop/service-taxonomy?locale=ja")
      .set("Authorization", `Bearer ${readToken}`)
      .expect(200);
    await request(fixture.app)
      .put("/api/v1/merchant-admin/shop/service-taxonomy")
      .set("Authorization", `Bearer ${readToken}`)
      .send({
        categoryIds: [1],
        keywordIds: [10],
        expectedRevision: 1,
        idempotencyKey: "taxonomy-command-0001"
      })
      .expect(403);

    fixture.replaceAdminPermissions([
      "merchant-admin:shop:service-taxonomy:read",
      "merchant-admin:shop:service-taxonomy:write",
      "auth:me"
    ]);
    const writeToken = await fixture.loginAsAdmin();
    await request(fixture.app)
      .put("/api/v1/merchant-admin/shop/service-taxonomy")
      .set("Authorization", `Bearer ${writeToken}`)
      .send({
        categoryIds: [1],
        keywordIds: [10],
        expectedRevision: 1,
        idempotencyKey: "taxonomy-command-0001"
      })
      .expect(200);
    expect(shopTaxonomyRepository.replaceShopSelection).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: 1, actorUserId: fixture.users[0].id })
    );
  });
});
