import request from "supertest";
import { createStep06Fixture } from "./helpers/step06-fixture";

describe("backoffice user usage OpenAPI", () => {
  it("documents scoped reads and append-only operations without delete", async () => {
    const fixture = await createStep06Fixture();
    const response = await request(fixture.app).get("/api/v1/openapi.json").expect(200);
    const paths = response.body.paths;
    expect(paths["/api/v1/backoffice/users/{userId}/usages"].get).toMatchObject({
      "x-permission": "backoffice:users:read"
    });
    expect(paths["/api/v1/merchant-admin/users/{userId}/usages"].get).toMatchObject({
      "x-permission": "merchant-admin:customers:list"
    });
    const comments = paths["/api/v1/backoffice/users/{userId}/usages/{orderId}/comments"];
    const refunds = paths["/api/v1/backoffice/users/{userId}/usages/{orderId}/refund-amendments"];
    expect(comments.post).toBeDefined();
    expect(refunds.post).toBeDefined();
    expect(comments.delete).toBeUndefined();
    expect(refunds.delete).toBeUndefined();
    expect(
      response.body.components.schemas.BackofficeUserUsagePage.properties.page_size.enum
    ).toEqual([10]);
  });
});
