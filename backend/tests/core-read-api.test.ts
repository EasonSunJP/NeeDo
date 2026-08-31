import request from "supertest";
import { createApp } from "../src/app";

const nowIso = "2026-05-25T00:00:00.000Z";

const paginated = <T>(list: T[]) => ({
  list,
  total: list.length,
  page: 1,
  page_size: 20
});

describe("Step 08 core read API", () => {
  const category = {
    id: 1,
    code: "wellness",
    name: "Wellness",
    nameJa: "ウェルネス",
    nameEn: "Wellness",
    parentId: null,
    iconUrl: "https://cdn.example.test/categories/wellness.png",
    sortOrder: 10,
    isActive: true,
    createdAt: nowIso,
    updatedAt: nowIso
  };
  const reviewSummary = {
    ratingAverage: "4.80",
    reviewCount: 128,
    latestReviewAt: nowIso,
    highlights: ["clean", "kind"]
  };
  const shopCard = {
    id: 1,
    publicId: "shop5831047296",
    name: "Aoyama Care Studio",
    city: "Tokyo",
    address: "3-1 Kita Aoyama",
    coverUrl: "https://cdn.example.test/shops/aoyama-cover.jpg",
    reviewSummary
  };
  const technicianCard = {
    id: 1,
    publicId: "s5831047296",
    displayName: "Mika Tanaka",
    city: "Tokyo",
    avatarUrl: "https://cdn.example.test/technicians/mika.jpg",
    reviewSummary
  };
  const serviceCard = {
    id: 1,
    publicId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    name: "Shiatsu Recovery",
    description: "60 minute recovery session",
    category,
    shop: shopCard,
    technician: technicianCard,
    city: "Tokyo",
    priceAmount: "8800.00",
    currency: "JPY",
    durationMinutes: 60,
    coverUrl: "https://cdn.example.test/services/shiatsu-cover.jpg",
    reviewSummary
  };

  const createFixture = () => {
    const coreReadRepository = {
      listCategories: jest.fn(async () => paginated([category])),
      listServices: jest.fn(async () => paginated([serviceCard])),
      findServiceDetail: jest.fn(async () => ({
        ...serviceCard,
        mediaAssets: [],
        createdAt: nowIso,
        updatedAt: nowIso
      })),
      getHomeRecommendations: jest.fn(async () => ({
        categories: [category],
        services: [serviceCard],
        shops: [shopCard],
        technicians: [technicianCard]
      })),
      search: jest.fn(async () => paginated([serviceCard])),
      searchShops: jest.fn(async () => paginated([shopCard])),
      searchTechnicians: jest.fn(async () => paginated([technicianCard])),
      findShopDetail: jest.fn(async () => ({
        ...shopCard,
        description: "Private care studio in Aoyama.",
        phone: "+81300000000",
        latitude: "35.672100",
        longitude: "139.723900",
        mediaAssets: [],
        services: [serviceCard],
        technicians: [technicianCard],
        createdAt: nowIso,
        updatedAt: nowIso
      })),
      findTechnicianDetail: jest.fn(async () => ({
        ...technicianCard,
        shop: shopCard,
        bio: "Certified body care technician.",
        serviceArea: "Minato, Shibuya",
        yearsExperience: 8,
        mediaAssets: [],
        services: [serviceCard],
        createdAt: nowIso,
        updatedAt: nowIso
      })),
      findCustomerProfile: jest.fn(async () => ({
        id: 1,
        publicId: "u3141592653",
        displayName: "Aya Customer",
        city: "Tokyo",
        bio: "Prefers evening appointments.",
        avatarUrl: "https://cdn.example.test/customers/aya.jpg",
        membershipLevel: "standard",
        reviewSummary,
        createdAt: nowIso,
        updatedAt: nowIso
      }))
    };
    const app = createApp(undefined, {
      redisHealthCheck: async () => ({ status: "ok", latencyMs: 1 }),
      coreReadRepository
    } as never);

    return { app, coreReadRepository };
  };

  it("lists categories and service cards from the core read repository", async () => {
    const fixture = createFixture();

    const categoryResponse = await request(fixture.app)
      .get("/api/v1/categories?page=1&pageSize=20")
      .expect(200);
    expect(categoryResponse.body.data).toEqual(paginated([category]));

    const serviceResponse = await request(fixture.app)
      .get("/api/v1/services?categoryId=1&city=Tokyo&sort=rating_desc")
      .expect(200);
    expect(serviceResponse.body.data).toEqual(paginated([serviceCard]));
    expect(fixture.coreReadRepository.listServices).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryId: 1,
        city: "Tokyo",
        sort: "rating_desc"
      })
    );
  });

  it("returns home recommendations and search results with stable paginated contracts", async () => {
    const fixture = createFixture();

    const homeResponse = await request(fixture.app).get("/api/v1/home/recommendations").expect(200);
    expect(homeResponse.body.data).toEqual({
      categories: [category],
      services: [serviceCard],
      shops: [shopCard],
      technicians: [technicianCard]
    });

    const searchResponse = await request(fixture.app)
      .get("/api/v1/search?keyword=shiatsu&categoryId=1&city=Tokyo&page=1&pageSize=20")
      .expect(200);
    expect(searchResponse.body.data).toEqual(paginated([serviceCard]));
    expect(fixture.coreReadRepository.search).toHaveBeenCalledWith(
      expect.objectContaining({
        keyword: "shiatsu",
        categoryId: 1,
        city: "Tokyo"
      })
    );
  });

  it("dispatches typed shop and technician searches with repeated OR inputs", async () => {
    const fixture = createFixture();

    const shopResponse = await request(fixture.app)
      .get("/api/v1/search?entityType=shop&keywords=LifeDance&keywords=%E5%AE%B6%E6%94%BF&categoryIds=3&categoryIds=9")
      .expect(200);
    expect(shopResponse.body.data).toEqual(paginated([shopCard]));
    expect(fixture.coreReadRepository.searchShops).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "shop",
        keywords: ["LifeDance", "家政"],
        categoryIds: [3, 9]
      })
    );

    const technicianResponse = await request(fixture.app)
      .get("/api/v1/search?entityType=technician&keywords=%E3%81%B2%E3%81%8B%E3%82%8A")
      .expect(200);
    expect(technicianResponse.body.data).toEqual(paginated([technicianCard]));
    expect(fixture.coreReadRepository.searchTechnicians).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "technician", keywords: ["ひかり"] })
    );
  });

  it("keeps the legacy omitted entity type on service search", async () => {
    const fixture = createFixture();

    await request(fixture.app).get("/api/v1/search?keyword=shiatsu").expect(200);

    expect(fixture.coreReadRepository.search).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "service", keyword: "shiatsu" })
    );
  });

  it("rejects invalid or excessive multi-entity search values", async () => {
    const fixture = createFixture();

    await request(fixture.app).get("/api/v1/search?entityType=customer").expect(400);
    await request(fixture.app)
      .get(`/api/v1/search?${Array.from({ length: 21 }, (_, index) => `keywords=k${index}`).join("&")}`)
      .expect(400);

    expect(fixture.coreReadRepository.search).not.toHaveBeenCalled();
    expect(fixture.coreReadRepository.searchShops).not.toHaveBeenCalled();
    expect(fixture.coreReadRepository.searchTechnicians).not.toHaveBeenCalled();
  });

  it("returns shop, technician, service, and customer profile details without sensitive user fields", async () => {
    const fixture = createFixture();

    const serviceResponse = await request(fixture.app).get("/api/v1/services/1").expect(200);
    expect(serviceResponse.body.data).toMatchObject({
      id: 1,
      name: "Shiatsu Recovery",
      reviewSummary
    });

    const shopResponse = await request(fixture.app).get("/api/v1/shops/1").expect(200);
    expect(shopResponse.body.data).toMatchObject({
      id: 1,
      publicId: "shop5831047296",
      name: "Aoyama Care Studio",
      services: [serviceCard],
      technicians: [technicianCard]
    });

    const technicianResponse = await request(fixture.app).get("/api/v1/technicians/1").expect(200);
    expect(technicianResponse.body.data).toMatchObject({
      id: 1,
      publicId: "s5831047296",
      displayName: "Mika Tanaka",
      shop: shopCard,
      yearsExperience: 8,
      services: [serviceCard]
    });

    const customerResponse = await request(fixture.app)
      .get("/api/v1/profiles/customers/1")
      .expect(200);
    expect(customerResponse.body.data).toMatchObject({
      id: 1,
      publicId: "u3141592653",
      displayName: "Aya Customer",
      membershipLevel: "standard"
    });
    expect(JSON.stringify(customerResponse.body)).not.toContain("passwordHash");
    expect(JSON.stringify(customerResponse.body)).not.toContain("email");
    expect(JSON.stringify(customerResponse.body)).not.toContain("phone");
  });

  it("resolves Service UUIDs to the same public detail while keeping numeric strings numeric", async () => {
    const fixture = createFixture();
    const servicePublicId = serviceCard.publicId;

    const legacyResponse = await request(fixture.app).get("/api/v1/services/1").expect(200);
    const publicResponse = await request(fixture.app)
      .get(`/api/v1/services/${servicePublicId}`)
      .expect(200);

    expect(publicResponse.body.data).toEqual(legacyResponse.body.data);
    expect(fixture.coreReadRepository.findServiceDetail).toHaveBeenNthCalledWith(1, 1);
    expect(fixture.coreReadRepository.findServiceDetail).toHaveBeenNthCalledWith(
      2,
      servicePublicId
    );
  });

  it("resolves public Shop identifiers without exposing an internal id in navigation", async () => {
    const fixture = createFixture();

    const response = await request(fixture.app)
      .get(`/api/v1/shops/${shopCard.publicId}`)
      .expect(200);

    expect(response.body.data).toMatchObject({
      id: 1,
      publicId: shopCard.publicId,
      name: "Aoyama Care Studio"
    });
    expect(fixture.coreReadRepository.findShopDetail).toHaveBeenCalledWith(
      shopCard.publicId
    );
  });

  it("rejects malformed public Shop identifiers", async () => {
    const fixture = createFixture();

    await request(fixture.app).get("/api/v1/shops/shop123").expect(400);
    await request(fixture.app).get("/api/v1/shops/not-a-shop").expect(400);
    expect(fixture.coreReadRepository.findShopDetail).not.toHaveBeenCalled();
  });

  it("rejects malformed Service identifiers without treating numeric strings as UUIDs", async () => {
    const fixture = createFixture();

    await request(fixture.app).get("/api/v1/services/not-a-service-id").expect(400);
    await request(fixture.app).get("/api/v1/services/0").expect(400);
    expect(fixture.coreReadRepository.findServiceDetail).not.toHaveBeenCalled();

    await request(fixture.app).get("/api/v1/services/123").expect(200);
    expect(fixture.coreReadRepository.findServiceDetail).toHaveBeenCalledWith(123);
    expect(fixture.coreReadRepository.findServiceDetail).not.toHaveBeenCalledWith("123");
  });
});
