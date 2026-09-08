import request from "supertest";
import { createStep06Fixture } from "./helpers/step06-fixture";

describe("backoffice user usage API", () => {
  it("exposes scoped reads and append-only operations mutations", async () => {
    const service = {
      listForOperations: jest.fn(async () => ({ list: [], total: 0, page: 1, page_size: 10 })),
      listForMerchant: jest.fn(),
      getTimelineForOperations: jest.fn(async () => ({
        order: { id: 88 },
        timeline: [],
        refund: null
      })),
      getTimelineForMerchant: jest.fn(),
      appendComment: jest.fn(async () => ({ commentId: 201 })),
      amendRefund: jest.fn(async () => ({ orderId: 88, version: 1 }))
    };
    const fixture = await createStep06Fixture({ backofficeUserUsageService: service } as never);
    fixture.replaceAdminPermissions([
      "backoffice:users:read",
      "backoffice:user-usage:comment",
      "backoffice:user-refund:amend"
    ]);
    const token = await fixture.loginAsAdmin();

    await request(fixture.app)
      .get("/api/v1/backoffice/users/41/usages?page=1&page_size=10&period=last7days")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    await request(fixture.app)
      .get("/api/v1/backoffice/users/41/usages/88")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    await request(fixture.app)
      .post("/api/v1/backoffice/users/41/usages/88/comments")
      .set("Authorization", `Bearer ${token}`)
      .send({ body: "Customer contacted" })
      .expect(201);
    await request(fixture.app)
      .post("/api/v1/backoffice/users/41/usages/88/refund-amendments")
      .set("Authorization", `Bearer ${token}`)
      .send({ note: "Confirmed", reason: "Provider evidence", expectedVersion: 0 })
      .expect(201);

    await request(fixture.app)
      .post("/api/v1/backoffice/users/41/usages/88/comments")
      .set("Authorization", `Bearer ${token}`)
      .send({ body: "" })
      .expect(400);
  });
});
