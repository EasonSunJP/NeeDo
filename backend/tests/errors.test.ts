import request from "supertest";
import { createApp } from "../src/app";

describe("API error handling", () => {
  it("returns the unified failure response shape for unknown routes", async () => {
    const response = await request(createApp()).get("/api/v1/unknown").expect(404);

    expect(response.body).toEqual({
      code: 40401,
      message: "error.not_found",
      data: null
    });
  });
});
