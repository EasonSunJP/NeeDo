import request from "supertest";
import { createApp } from "../src/app";

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
        .get(`/api/v1/service-categories/1/keywords?locale=${encodeURIComponent(locale)}&page=1&pageSize=20`)
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
});
