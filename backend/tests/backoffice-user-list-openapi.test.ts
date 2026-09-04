import request from "supertest";
import { createStep06Fixture } from "./helpers/step06-fixture";

describe("backoffice all-user OpenAPI", () => {
  it("documents the paginated list, detail and nullable customer experience", async () => {
    const fixture = await createStep06Fixture();
    const response = await request(fixture.app).get("/api/v1/openapi.json").expect(200);

    expect(response.body.paths["/api/v1/backoffice/users"].get).toBeDefined();
    expect(response.body.paths["/api/v1/backoffice/users/{userId}"].get).toBeDefined();
    expect(
      response.body.components.schemas.BackofficeManagedUser.properties.experience.nullable
    ).toBe(true);
  });
});
