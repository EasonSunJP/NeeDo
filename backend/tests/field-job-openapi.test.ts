import { createOpenApiDocument } from "../src/api/openapi";
import { env } from "../src/config/env";
import { FIELD_JOB_PERMISSIONS } from "../src/constants/permissions.constants";

describe("field-job OpenAPI contract", () => {
  const document = createOpenApiDocument(env) as {
    paths: Record<
      string,
      {
        get: Record<string, unknown> & {
          parameters: Array<{ name: string }>;
          responses: Record<
            string,
            { content: { "application/json": { schema: { properties: { data: unknown } } } } }
          >;
        };
      }
    >;
    components: { schemas: Record<string, unknown> };
  };

  it("documents authenticated paginated list and detail operations", () => {
    const list = document.paths["/api/v1/backoffice/field-jobs"].get;
    const detail = document.paths["/api/v1/backoffice/field-jobs/{id}"].get;
    expect(list.security).toEqual([{ bearerAuth: [] }]);
    expect(detail.security).toEqual([{ bearerAuth: [] }]);
    expect(list["x-required-permission"]).toBe(FIELD_JOB_PERMISSIONS.read);
    expect(detail["x-required-permission"]).toBe(FIELD_JOB_PERMISSIONS.read);
    expect(list.parameters.map((item) => item.name)).toEqual([
      "page",
      "pageSize",
      "keyword",
      "status",
      "assignment"
    ]);
    expect(list.responses["200"].content["application/json"].schema.properties.data).toEqual({
      $ref: "#/components/schemas/FieldJobPage"
    });
    expect(detail.responses["200"].content["application/json"].schema.properties.data).toEqual({
      $ref: "#/components/schemas/FieldJobDetail"
    });
  });

  it("documents conditional address and SOS disclosure without any credential secret", () => {
    const serialized = JSON.stringify({
      schemas: {
        summary: document.components.schemas.FieldJobSummary,
        detail: document.components.schemas.FieldJobDetail
      }
    });
    expect(serialized).toContain(FIELD_JOB_PERMISSIONS.addressRead);
    expect(serialized).toContain("sos:list");
    expect(serialized).not.toMatch(
      /verificationHash|verificationCode|customerEmail|customerPhone/i
    );
  });
});
