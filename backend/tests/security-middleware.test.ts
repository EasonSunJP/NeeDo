import express from "express";
import request from "supertest";
import { env } from "../src/config/env";
import { createRateLimitMiddleware } from "../src/middlewares/security.middleware";
import { AuthTokenService } from "../src/services/auth-token.service";

describe("global API rate limiting", () => {
  it("isolates verified users while retaining a per-user limit across token rotation", async () => {
    const app = express();
    const tokenService = new AuthTokenService(env);
    const userAToken = tokenService.issueAccessToken({
      id: 101,
      email: "user-a@example.com"
    }).token;
    const userASecondToken = tokenService.issueAccessToken({
      id: 101,
      email: "user-a@example.com"
    }).token;
    const userBToken = tokenService.issueAccessToken({
      id: 202,
      email: "user-b@example.com"
    }).token;
    app.use(
      createRateLimitMiddleware({
        ...env,
        RATE_LIMIT_MAX: 1,
        RATE_LIMIT_WINDOW_MS: 60_000
      })
    );
    app.get("/resource", (_request, response) => response.status(200).json({ ok: true }));

    await request(app).get("/resource").set("Authorization", `Bearer ${userAToken}`).expect(200);
    await request(app).get("/resource").set("Authorization", `Bearer ${userBToken}`).expect(200);
    await request(app)
      .get("/resource")
      .set("Authorization", `Bearer ${userASecondToken}`)
      .expect(429);
  });
});
