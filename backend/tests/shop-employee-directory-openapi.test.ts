import request from "supertest";
import { createApp } from "../src/app";

describe("shop employee directory OpenAPI contract", () => {
  it("documents the current-shop directory without accepting shopId", async () => {
    const response = await request(createApp()).get("/api/v1/openapi.json").expect(200);
    const operation = response.body.paths["/api/v1/merchant-admin/employee-directory"].get;
    const parameterNames = operation.parameters.map(
      (parameter: { name: string }) => parameter.name
    );

    expect(operation.security).toEqual([{ bearerAuth: [] }]);
    expect(operation["x-permission"]).toBe("merchant-admin:employee-affiliation:read");
    expect(parameterNames).toEqual(["page", "pageSize", "keyword", "status", "roleCode"]);
    expect(parameterNames).not.toContain("shopId");
    expect(operation.responses).toEqual(
      expect.objectContaining({
        "200": expect.any(Object),
        "400": expect.any(Object),
        "401": expect.any(Object),
        "403": expect.any(Object)
      })
    );
  });

  it("documents localized roles and the optional technician projection", async () => {
    const response = await request(createApp()).get("/api/v1/openapi.json").expect(200);
    const item = response.body.components.schemas.ShopEmployeeDirectoryItem;
    const role = response.body.components.schemas.ShopEmployeeDirectoryRole;
    const technician = response.body.components.schemas.ShopEmployeeDirectoryTechnician;

    expect(item).toMatchObject({
      additionalProperties: false,
      required: [
        "needoId",
        "displayName",
        "avatarUrl",
        "email",
        "phone",
        "status",
        "startsAt",
        "endsAt",
        "roles",
        "technician"
      ]
    });
    expect(item.properties.needoId).toMatchObject({
      type: "string",
      pattern: "^u[0-9]{10}$"
    });
    expect(role.required).toEqual(["code", "names", "isTechnicianRole"]);
    expect(role.properties.names.required).toEqual(["zhHans", "zhHant", "ja", "en", "ko"]);
    expect(technician.properties.needoId).toMatchObject({
      type: "string",
      pattern: "^s[0-9]{10}$"
    });
    expect(item.properties.technician).toEqual({
      anyOf: [{ $ref: "#/components/schemas/ShopEmployeeDirectoryTechnician" }, { type: "null" }]
    });
  });
});
