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
    expect(update.properties.employmentStartedAt).toEqual(
      detail.properties.employmentStartedAt
    );
  });
});
