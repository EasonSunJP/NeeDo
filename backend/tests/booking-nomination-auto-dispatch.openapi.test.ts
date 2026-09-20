import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";

type Operation = {
  security?: Array<Record<string, string[]>>;
  requestBody?: { content: Record<string, { schema: unknown }> };
  responses?: Record<string, unknown>;
};

describe("booking nomination and merchant dispatch OpenAPI", () => {
  const document = createOpenApiDocument(env) as unknown as {
    paths: Record<string, Record<string, Operation>>;
    components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
  };

  it("documents nomination pricing on availability and booking creation", () => {
    expect(document.components.schemas.ScheduleSlot.properties).toMatchObject({
      nominationFeeJpy: { type: "integer", minimum: 0 }
    });
    const bookingSchema = document.paths["/api/v1/bookings"].post.requestBody!
      .content["application/json"].schema;
    expect(JSON.stringify(bookingSchema)).toContain("nominatedTechnicianProfileId");
  });

  it("documents formal auto dispatch, manual assignment and merchant order editing", () => {
    for (const [path, method] of [
      ["/api/v1/merchant-admin/auto-dispatch-rule", "get"],
      ["/api/v1/merchant-admin/auto-dispatch-rule", "put"],
      ["/api/v1/orders/{id}/assign-technician", "post"],
      ["/api/v1/orders/{id}/merchant-edit", "patch"]
    ] as const) {
      expect(document.paths[path]?.[method]).toMatchObject({
        security: [{ bearerAuth: [] }],
        responses: expect.objectContaining({ "401": expect.any(Object), "403": expect.any(Object) })
      });
    }
  });

  it("documents forwarding an existing immutable chat record", () => {
    expect(document.paths["/api/v1/im/chat-records/{publicId}/forward"]?.post).toMatchObject({
      security: [{ bearerAuth: [] }],
      responses: expect.objectContaining({
        "201": expect.any(Object),
        "401": expect.any(Object),
        "403": expect.any(Object),
        "404": expect.any(Object)
      })
    });
  });
});
