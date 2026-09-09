import request from "supertest";
import { createApp } from "../src/app";

describe("formal profile detail OpenAPI contract", () => {
  it("documents public NeeDo account identity and both paginated user timeline routes", async () => {
    const response = await request(createApp()).get("/api/v1/openapi.json").expect(200);
    const account = response.body.components.schemas.BackofficeAccount;
    const platformTimeline = response.body.paths["/api/v1/backoffice/customers/{id}/timeline"].get;
    const merchantTimeline =
      response.body.paths["/api/v1/merchant-admin/customers/{id}/timeline"].get;

    expect(account.required).toContain("needoId");
    expect(account.properties.needoId).toMatchObject({ type: "string" });
    for (const operation of [platformTimeline, merchantTimeline]) {
      expect(operation.security).toEqual([{ bearerAuth: [] }]);
      expect(operation.parameters.map((parameter: { name: string }) => parameter.name)).toEqual([
        "id",
        "page",
        "pageSize"
      ]);
      expect(operation.responses["200"]).toBeDefined();
      expect(operation.responses["401"]).toBeDefined();
      expect(operation.responses["403"]).toBeDefined();
      expect(operation.responses["404"]).toBeDefined();
    }
  });

  it("documents the operations-only complimentary membership grant contract", async () => {
    const response = await request(createApp()).get("/api/v1/openapi.json").expect(200);
    const operation = response.body.paths["/api/v1/backoffice/customers/{id}/membership"].put;
    const input = response.body.components.schemas.BackofficeCustomerMembershipGrantInput;
    const detail = response.body.components.schemas.BackofficeCustomerDetail;

    expect(operation.security).toEqual([{ bearerAuth: [] }]);
    expect(operation.requestBody.content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/BackofficeCustomerMembershipGrantInput"
    });
    expect(operation.responses).toEqual(
      expect.objectContaining({
        "200": expect.any(Object),
        "400": expect.any(Object),
        "401": expect.any(Object),
        "403": expect.any(Object),
        "404": expect.any(Object)
      })
    );
    expect(input).toMatchObject({
      additionalProperties: false,
      required: ["membershipLevel", "grantMode", "durationUnit", "durationValue", "startsAt"]
    });
    expect(input.properties.membershipLevel.enum).toEqual(["silver", "gold", "black_diamond"]);
    expect(input.properties.durationUnit.enum).toEqual(["month"]);
    expect(input.properties.durationValue.enum).toEqual([1, 12]);
    expect(detail.allOf[1].required).toEqual(
      expect.arrayContaining([
        "membershipGrantMode",
        "membershipDurationUnit",
        "membershipDurationValue",
        "membershipStartsAt",
        "membershipExpiresAt",
        "membershipGrantedBy"
      ])
    );
  });

  it("documents bounded technician services and the non-silent truncation fields", async () => {
    const response = await request(createApp()).get("/api/v1/openapi.json").expect(200);
    const schema = response.body.components.schemas.BackofficeTechnicianDetail;

    expect(schema.required).toEqual(
      expect.arrayContaining(["services", "servicesLimit", "servicesTruncated"])
    );
    expect(schema.properties.servicesLimit).toMatchObject({ type: "integer", minimum: 1 });
    expect(schema.properties.servicesTruncated).toEqual({ type: "boolean" });
  });

  it("documents persisted technician employment on detail and update contracts", async () => {
    const response = await request(createApp()).get("/api/v1/openapi.json").expect(200);
    const detail = response.body.components.schemas.BackofficeTechnicianDetail;
    const update = response.body.components.schemas.BackofficeTechnicianUpdateInput;

    expect(detail.required).toEqual(
      expect.arrayContaining(["employmentType", "employmentStartedAt"])
    );
    expect(detail.properties.employmentType).toEqual({
      type: "string",
      enum: ["independent", "full_time", "temporary"]
    });
    expect(detail.properties.employmentStartedAt).toEqual({
      type: ["string", "null"],
      format: "date-time"
    });
    expect(update.properties.employmentType).toEqual(detail.properties.employmentType);
    expect(update.properties.employmentStartedAt).toEqual(detail.properties.employmentStartedAt);
  });

  it("documents the shop-scoped employee affiliation contract without a shopId input", async () => {
    const response = await request(createApp()).get("/api/v1/openapi.json").expect(200);
    const list = response.body.paths["/api/v1/merchant-admin/employees"].get;
    const detail = response.body.paths["/api/v1/merchant-admin/employees/{needoId}"].get;
    const schedule = response.body.paths["/api/v1/merchant-admin/employees/{needoId}/schedule"].get;
    const update =
      response.body.paths["/api/v1/merchant-admin/employees/{needoId}/affiliation"].put;
    const profileUpdate =
      response.body.paths["/api/v1/merchant-admin/employees/{needoId}/profile"].patch;

    expect(list.security).toEqual([{ bearerAuth: [] }]);
    expect(list.parameters.map((parameter: { name: string }) => parameter.name)).toEqual(
      expect.arrayContaining(["page", "pageSize", "keyword", "relationshipType", "workStatus"])
    );
    expect(list.parameters.map((parameter: { name: string }) => parameter.name)).not.toContain(
      "shopId"
    );
    expect(detail.parameters[0]).toMatchObject({
      name: "needoId",
      required: true,
      schema: { type: "string", pattern: "^s[0-9]{10}$" }
    });
    expect(schedule.security).toEqual([{ bearerAuth: [] }]);
    expect(schedule.parameters.map((parameter: { name: string }) => parameter.name)).toEqual([
      "needoId",
      "from",
      "to",
      "view"
    ]);
    expect(schedule.responses).toEqual(
      expect.objectContaining({
        "200": expect.any(Object),
        "400": expect.any(Object),
        "401": expect.any(Object),
        "403": expect.any(Object),
        "404": expect.any(Object)
      })
    );
    expect(response.body.components.schemas.MerchantEmployeeScheduleProjection.required).toEqual([
      "employee",
      "range",
      "events"
    ]);
    expect(update.requestBody.content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/MerchantEmployeeAffiliationInput"
    });
    expect(profileUpdate.requestBody.content["application/json"].schema).toEqual({
      $ref: "#/components/schemas/MerchantEmployeeProfileInput"
    });
    expect(response.body.components.schemas.MerchantEmployeeAffiliationInput).toMatchObject({
      additionalProperties: false,
      required: ["relationshipType", "workStatus", "startsAt", "endsAt"]
    });
    expect(update.responses).toEqual(
      expect.objectContaining({
        "400": expect.any(Object),
        "401": expect.any(Object),
        "403": expect.any(Object),
        "404": expect.any(Object)
      })
    );
    expect(response.body.components.schemas.MerchantEmployee.required).toEqual(
      expect.arrayContaining(["needoId", "displayName", "profile", "account", "affiliation"])
    );
    expect(response.body.components.schemas.MerchantEmployeeProfile).toMatchObject({
      additionalProperties: false,
      required: ["bio", "city", "serviceArea", "yearsExperience", "updatedAt"],
      properties: {
        yearsExperience: { type: "integer", minimum: 0, maximum: 80 }
      }
    });
    expect(response.body.components.schemas.MerchantEmployeeAccount).toMatchObject({
      additionalProperties: false,
      required: ["isActive", "lastLoginAt"]
    });
    expect(response.body.components.schemas.MerchantEmployeeProfileInput).toMatchObject({
      additionalProperties: false,
      minProperties: 1,
      properties: {
        displayName: { type: "string", minLength: 1, maxLength: 120 },
        bio: { type: ["string", "null"], maxLength: 5000 },
        city: { type: "string", minLength: 1, maxLength: 100 },
        serviceArea: { type: ["string", "null"], maxLength: 255 },
        yearsExperience: { type: "integer", minimum: 0, maximum: 80 }
      }
    });
    expect(profileUpdate.responses).toEqual(
      expect.objectContaining({
        "400": expect.any(Object),
        "401": expect.any(Object),
        "403": expect.any(Object),
        "404": expect.any(Object)
      })
    );
    expect(response.body.components.schemas.MerchantEmployee.properties.needoId.pattern).toBe(
      "^s[0-9]{10}$"
    );
  });
});
