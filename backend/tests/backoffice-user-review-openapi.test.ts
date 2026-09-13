import request from "supertest";
import { createStep06Fixture } from "./helpers/step06-fixture";

describe("backoffice received-review OpenAPI", () => {
  it("documents scoped ten-row reads and append-only correction without delete", async () => {
    const fixture = await createStep06Fixture();
    const response = await request(fixture.app).get("/api/v1/openapi.json").expect(200);
    const operationsPath =
      response.body.paths["/api/v1/backoffice/users/{userId}/received-reviews"];
    const merchantPath =
      response.body.paths["/api/v1/merchant-admin/users/{userId}/received-reviews"];
    const amendmentPath = response.body.paths["/api/v1/backoffice/reviews/{reviewId}/amendments"];
    const reviewListPath = response.body.paths["/api/v1/backoffice/reviews"];
    const reviewDetailPath = response.body.paths["/api/v1/backoffice/reviews/{reviewId}"];

    expect(reviewListPath.get).toMatchObject({
      operationId: "listBackofficeReviews",
      "x-permission": "backoffice:users:read"
    });
    expect(reviewDetailPath.get).toMatchObject({
      operationId: "getBackofficeReview",
      "x-permission": "backoffice:users:read"
    });
    const reviewQueryNames = reviewListPath.get.parameters.map((parameter: { name: string }) => parameter.name);
    expect(reviewQueryNames).toEqual(
      expect.arrayContaining(["page", "page_size", "keyword", "rating", "status", "targetType", "from", "to"])
    );

    expect(operationsPath.get).toMatchObject({ "x-permission": "backoffice:users:read" });
    expect(merchantPath.get).toMatchObject({
      "x-permission": "merchant-admin:customers:list"
    });
    expect(amendmentPath.post).toMatchObject({
      "x-permission": "backoffice:customers:write"
    });
    expect(amendmentPath.delete).toBeUndefined();
    const order = response.body.components.schemas.BackofficeReceivedUserReview.properties.order;
    expect(order.required).toEqual(expect.arrayContaining(["paymentMethod", "paymentStatus", "paymentCurrency", "otherPaymentMethod", "addOnMinutes", "addOnCount", "note"]));
    expect(order.properties.paymentStatus.enum).toEqual(["pending", "confirmed", "refund_pending", "refunded"]);
    expect(
      response.body.components.schemas.BackofficeReceivedUserReviewPage.properties.page_size
    ).toMatchObject({ enum: [10] });
    expect(response.body.components.schemas.BackofficeUserReviewAmendmentInput.required).toEqual(
      expect.arrayContaining(["reason", "expectedVersion"])
    );
  });
});
