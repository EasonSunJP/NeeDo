import request from "supertest";
import { createApp } from "../src/app";

describe("GET /api/v1/openapi.json", () => {
  it("describes the health endpoint with the versioned API prefix", async () => {
    const response = await request(createApp()).get("/api/v1/openapi.json").expect(200);

    expect(response.body.openapi).toBe("3.1.0");
    expect(response.body.paths).toHaveProperty("/api/v1/health");
  });
});
