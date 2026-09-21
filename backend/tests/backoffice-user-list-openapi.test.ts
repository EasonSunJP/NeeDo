import request from "supertest";
import { createStep06Fixture } from "./helpers/step06-fixture";

describe("backoffice all-user OpenAPI", () => {
  it("documents the paginated list, detail and nullable customer experience", async () => {
    const fixture = await createStep06Fixture();
    const response = await request(fixture.app).get("/api/v1/openapi.json").expect(200);

    expect(response.body.paths["/api/v1/backoffice/users"].get).toBeDefined();
    expect(response.body.paths["/api/v1/backoffice/users/{userId}"].get).toBeDefined();
    expect(response.body.paths["/api/v1/merchant-admin/users"].get).toMatchObject({
      operationId: "listMerchantManagedUsers",
      "x-permission": "merchant-admin:customers:list"
    });
    expect(response.body.paths["/api/v1/merchant-admin/users/{userId}"].get).toMatchObject({
      operationId: "getMerchantManagedUser",
      "x-permission": "merchant-admin:customers:list"
    });
    expect(response.body.components.schemas.BackofficeManagedUserDetail.allOf[1].required).toEqual(
      expect.arrayContaining(["metrics", "capabilities"])
    );
    expect(response.body.components.schemas.BackofficeManagedUser.required).toEqual(
      expect.arrayContaining(["displayName", "city", "privacyMode", "privacyScope"])
    );
    const queryNames = response.body.paths["/api/v1/backoffice/users"].get.parameters.map(
      (parameter: { name: string }) => parameter.name
    );
    expect(queryNames).toEqual(
      expect.arrayContaining([
        "city",
        "emailState",
        "isTestAccount",
        "privacy",
        "minBookings",
        "maxBookings",
        "sortBy",
        "sortDirection"
      ])
    );
    const merchantQueryNames = response.body.paths[
      "/api/v1/merchant-admin/users"
    ].get.parameters.map((parameter: { name: string }) => parameter.name);
    expect(merchantQueryNames).toEqual(queryNames.filter((name: string) => name !== "isTestAccount"));
    const experienceSchema = response.body.components.schemas.BackofficeManagedUserExperience;
    expect(experienceSchema.required).toContain("totalExp");
    expect(experienceSchema.properties.totalExp.type).toBe("string");
    expect(experienceSchema.properties.totalExpUnits.deprecated).toBe(true);
    for (const path of ["/api/v1/backoffice/users", "/api/v1/merchant-admin/users"]) {
      expect(response.body.paths[path].get.parameters.find((parameter: { name: string }) => parameter.name === "sortBy").schema.enum)
        .toEqual(expect.arrayContaining(["ndpBalance", "bookingCount"]));
    }
    expect(
      response.body.components.schemas.BackofficeManagedUser.properties.experience.nullable
    ).toBe(true);
    expect(response.body.components.schemas.BackofficeManagedUser.properties.testNdpBalance).toMatchObject({
      type: ["object", "null"],
      required: ["available", "frozen"],
      properties: { available: { type: "integer" }, frozen: { type: "integer" } }
    });
  });
});
