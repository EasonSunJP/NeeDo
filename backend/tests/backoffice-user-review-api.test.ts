import request from "supertest";
import { createStep06Fixture } from "./helpers/step06-fixture";

describe("backoffice received-review API", () => {
  it("serves the paginated operations review center and review detail with existing RBAC", async () => {
    const service = {
      listOperationsReviews: jest.fn(async () => ({
        list: [{ reviewId: 77, rating: 5, status: "original" }],
        total: 1,
        page: 1,
        page_size: 20
      })),
      getOperationsReview: jest.fn(async () => ({
        reviewId: 77,
        rating: 5,
        status: "original",
        amendmentHistory: []
      })),
      listForOperations: jest.fn(),
      listForMerchant: jest.fn(),
      amend: jest.fn()
    };
    const fixture = await createStep06Fixture({ backofficeUserReviewService: service } as never);
    fixture.replaceAdminPermissions(["backoffice:users:read"]);
    const token = await fixture.loginAsAdmin();

    await request(fixture.app)
      .get("/api/v1/backoffice/reviews?page=1&page_size=20&rating=5&status=original&targetType=technician&from=2026-09-10&to=2026-09-10")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(service.listOperationsReviews).toHaveBeenCalledWith(
      expect.objectContaining({ userId: expect.any(Number) }),
      {
        page: 1,
        page_size: 20,
        rating: 5,
        status: "original",
        targetType: "technician",
        from: "2026-09-10",
        to: "2026-09-10"
      },
      true
    );

    await request(fixture.app)
      .get("/api/v1/backoffice/reviews/77")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(service.getOperationsReview).toHaveBeenCalledWith(
      expect.objectContaining({ userId: expect.any(Number) }),
      77,
      true
    );

    await request(fixture.app)
      .get("/api/v1/backoffice/reviews?from=2026-09-11&to=2026-09-10")
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
  });

  it("returns exactly ten-per-page reviews and forwards audited amendments", async () => {
    const service = {
      listOperationsReviews: jest.fn(),
      getOperationsReview: jest.fn(),
      listForOperations: jest.fn(async () => ({
        list: [
          {
            reviewId: 77,
            targetType: "customer",
            rating: 4,
            comment: "Corrected",
            tags: ["punctual"],
            createdAt: "2026-09-05T10:00:00.000Z",
            amendmentVersion: 1,
            order: {
              id: 88,
              orderNo: "B-88",
              serviceName: "Home care",
              startsAt: "2026-09-05T09:00:00.000Z"
            },
            reviewer: { needoId: "s0000000042", displayName: "Mika", avatarUrl: null }
          }
        ],
        total: 1,
        page: 1,
        page_size: 10
      })),
      listForMerchant: jest.fn(),
      amend: jest.fn(async () => ({ reviewId: 77, version: 2 }))
    };
    const fixture = await createStep06Fixture({ backofficeUserReviewService: service } as never);
    fixture.replaceAdminPermissions(["backoffice:users:read", "backoffice:customers:write"]);
    const token = await fixture.loginAsAdmin();

    const list = await request(fixture.app)
      .get("/api/v1/backoffice/users/41/received-reviews?page=1&page_size=10")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(list.body.data).toMatchObject({ total: 1, page_size: 10 });
    expect(service.listForOperations).toHaveBeenCalledWith(
      expect.objectContaining({ userId: expect.any(Number) }),
      41,
      { page: 1, page_size: 10 },
      true
    );

    await request(fixture.app)
      .post("/api/v1/backoffice/reviews/77/amendments")
      .set("Authorization", `Bearer ${token}`)
      .send({ rating: 3, reason: "Refund evidence confirmed", expectedVersion: 1 })
      .expect(201);
    expect(service.amend).toHaveBeenCalledWith(
      expect.objectContaining({ userId: expect.any(Number) }),
      expect.objectContaining({ ip: expect.any(String) }),
      77,
      { rating: 3, reason: "Refund evidence confirmed", expectedVersion: 1 }
    );

    await request(fixture.app)
      .post("/api/v1/backoffice/reviews/77/amendments")
      .set("Authorization", `Bearer ${token}`)
      .send({ rating: 3, reason: "", expectedVersion: 1 })
      .expect(400);
    await request(fixture.app)
      .get("/api/v1/backoffice/users/41/received-reviews?page_size=20")
      .set("Authorization", `Bearer ${token}`)
      .expect(400);
  });
});
