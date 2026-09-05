import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";

describe("Exchange Intelligence booking OpenAPI", () => {
  it("documents the source id, conditional idempotency header, source response, and conflicts", () => {
    const document = createOpenApiDocument(env) as unknown as {
      paths: Record<
        string,
        {
          post: {
            parameters: Array<Record<string, unknown>>;
            requestBody: {
              content: {
                "application/json": { schema: { properties: Record<string, unknown> } };
              };
            };
            responses: Record<string, { description: string }>;
          };
        }
      >;
      components: {
        schemas: Record<string, { required: string[]; properties: Record<string, unknown> }>;
      };
    };
    const operation = document.paths["/api/v1/bookings"].post;

    expect(operation.parameters).toContainEqual(
      expect.objectContaining({ name: "Idempotency-Key", in: "header", required: false })
    );
    expect(
      operation.requestBody.content["application/json"].schema.properties
    ).toHaveProperty("exchangeIntelligencePostId");
    expect(operation.responses["409"].description).toContain("Intelligence");
    expect(document.components.schemas.BookingOrder.required).toContain(
      "exchangeIntelligencePostId"
    );
    expect(document.components.schemas.BookingOrder.properties).toHaveProperty(
      "exchangeIntelligencePostId"
    );
  });
});
