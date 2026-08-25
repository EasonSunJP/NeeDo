import request from "supertest";
import { createApp } from "../src/app";

describe("formal profile detail OpenAPI contract", () => {
  it("documents bounded technician services and the non-silent truncation fields", async () => {
    const response = await request(createApp()).get("/api/v1/openapi.json").expect(200);
    const schema = response.body.components.schemas.BackofficeTechnicianDetail;

    expect(schema.required).toEqual(expect.arrayContaining(["services", "servicesLimit", "servicesTruncated"]));
    expect(schema.properties.servicesLimit).toMatchObject({ type: "integer", minimum: 1 });
    expect(schema.properties.servicesTruncated).toEqual({ type: "boolean" });
  });
});
