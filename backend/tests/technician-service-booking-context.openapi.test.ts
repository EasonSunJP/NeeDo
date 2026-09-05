import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";

interface BookingContextOpenApiDocument {
  paths: Record<
    string,
    {
      get: {
        security: Array<{ bearerAuth: never[] }>;
        responses: Record<string, { description: string }>;
        "x-required-permission"?: string;
      };
    }
  >;
  components: { schemas: Record<string, { required?: string[] }> };
}

describe("technician service booking context OpenAPI", () => {
  it("documents auth, booking permission, hidden-state 404, and public card-only data", () => {
    const document = createOpenApiDocument(env) as unknown as BookingContextOpenApiDocument;
    const operation = document.paths["/api/v1/technician-services/{id}/booking-context"].get;

    expect(operation).toEqual(
      expect.objectContaining({
        security: [{ bearerAuth: [] }],
        "x-required-permission": "booking:create"
      })
    );
    expect(operation.responses["404"].description).toContain(
      "error.technician_service.booking_context_not_found"
    );
    expect(document.components.schemas.TechnicianServiceBookingContext.required).toEqual([
      "target",
      "serviceCard",
      "shopCard",
      "technicianCard"
    ]);
    expect(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(document.components.schemas).filter(([name]) =>
            name.startsWith("TechnicianServiceBooking")
          )
        )
      )
    ).not.toMatch(/userId|identityId|shopId|technicianProfileId|phone|email|homeAddress|kyc/iu);
  });
});
