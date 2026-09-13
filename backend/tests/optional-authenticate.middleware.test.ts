import express from "express";
import request from "supertest";
import { ERROR_CODES } from "../src/constants/error-codes";
import { createOptionalAuthenticateMiddleware } from "../src/middlewares/authenticate.middleware";
import { AppError } from "../src/utils/app-error";

describe("optional authentication middleware", () => {
  const createFixture = () => {
    const authenticateAccessToken = jest.fn(async (token: string) => {
      if (token !== "valid-token") {
        throw new AppError({
          code: ERROR_CODES.TOKEN_INVALID,
          message: "error.auth.token_invalid",
          statusCode: 401
        });
      }
      return { userId: 249, currentIdentityId: 250 };
    });
    const app = express();
    app.get(
      "/profile",
      createOptionalAuthenticateMiddleware({ authenticateAccessToken } as never),
      (_request, response) => response.json({ auth: response.locals.auth ?? null })
    );
    app.use(
      (
        error: AppError,
        _request: express.Request,
        response: express.Response,
        next: express.NextFunction
      ) => {
        void next;
        response.status(error.statusCode ?? 500).json({ code: error.code, message: error.message });
      }
    );
    return { app, authenticateAccessToken };
  };

  it("keeps an anonymous public request anonymous", async () => {
    const fixture = createFixture();
    await request(fixture.app).get("/profile").expect(200, { auth: null });
    expect(fixture.authenticateAccessToken).not.toHaveBeenCalled();
  });

  it("attaches valid authentication and rejects an invalid supplied credential", async () => {
    const fixture = createFixture();
    await request(fixture.app)
      .get("/profile")
      .set("Authorization", "Bearer valid-token")
      .expect(200, { auth: { userId: 249, currentIdentityId: 250 } });
    await request(fixture.app)
      .get("/profile")
      .set("Authorization", "Bearer invalid-token")
      .expect(401, { code: ERROR_CODES.TOKEN_INVALID, message: "error.auth.token_invalid" });
  });
});
