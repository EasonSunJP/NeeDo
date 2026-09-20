import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";

describe("relationship-scoped customer profile OpenAPI contract", () => {
  it("documents visible basics and review summary without account or contact fields", () => {
    const document = createOpenApiDocument(env) as unknown as {
      components: { schemas: Record<string, { required?: string[]; properties?: Record<string, unknown> }> };
      paths: Record<string, { get?: { responses?: Record<string, unknown> } }>;
    };
    const schema = document.components.schemas.CustomerProfile;

    expect(schema.required).toEqual(expect.arrayContaining([
      "gender",
      "age",
      "heightCm",
      "languages",
      "membershipLevel",
      "level",
      "reviewSummary"
    ]));
    expect(schema.properties).toEqual(expect.objectContaining({
      gender: { type: "string", enum: ["female", "male", "private"] },
      age: { type: ["integer", "null"], minimum: 0, maximum: 150 },
      heightCm: { type: ["number", "null"], minimum: 30, maximum: 250 },
      languages: { type: "array", items: { type: "string" } },
      level: { type: "integer", minimum: 1, maximum: 100 },
      reviewSummary: { $ref: "#/components/schemas/ReviewSummary" }
    }));
    for (const sensitiveField of ["address", "email", "phone", "userId", "identityId"]) {
      expect(schema.properties).not.toHaveProperty(sensitiveField);
    }
    expect(document.paths["/api/v1/profiles/customers/{id}"].get?.responses?.["200"]).toMatchObject({
      content: {
        "application/json": {
          schema: {
            properties: {
              data: { $ref: "#/components/schemas/CustomerProfile" }
            }
          }
        }
      }
    });
  });
});
