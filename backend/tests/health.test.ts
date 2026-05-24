import request from "supertest";
import { createApp } from "../src/app";

describe("GET /api/v1/health", () => {
  it("returns the unified success response shape", async () => {
    const response = await request(createApp()).get("/api/v1/health").expect(200);

    expect(response.body).toEqual({
      code: 0,
      message: "success",
      data: {
        status: "ok",
        service: "needo-backend",
        timestamp: expect.any(String)
      }
    });
    expect(new Date(response.body.data.timestamp).toISOString()).toBe(response.body.data.timestamp);
  });
});
