import type { AppConfig } from "../src/config/env";
import { env } from "../src/config/env";
import { AuthTokenService } from "../src/services/auth-token.service";
import { createHmac } from "node:crypto";

const withAudience = (audience: string): AppConfig =>
  ({ ...env, AUTH_TOKEN_AUDIENCE: audience }) as AppConfig;

describe("AuthTokenService audience isolation", () => {
  it("includes the configured audience in access and refresh tokens", () => {
    const service = new AuthTokenService(withAudience("needo-ops-api"));
    const subject = { id: 71, email: "ops@example.com" };

    expect(service.verifyAccessToken(service.issueAccessToken(subject).token)).toMatchObject({
      aud: "needo-ops-api"
    });
    expect(service.verifyRefreshToken(service.issueRefreshToken(subject).token)).toMatchObject({
      aud: "needo-ops-api"
    });
  });

  it("rejects a validly signed token issued for the other administration service", () => {
    const opsTokens = new AuthTokenService(withAudience("needo-ops-api"));
    const merchantTokens = new AuthTokenService(withAudience("needo-merchant-api"));
    const accessToken = opsTokens.issueAccessToken({ id: 71, email: "ops@example.com" }).token;
    const refreshToken = opsTokens.issueRefreshToken({ id: 71, email: "ops@example.com" }).token;

    expect(() => merchantTokens.verifyAccessToken(accessToken)).toThrow("error.auth.token_invalid");
    expect(() => merchantTokens.verifyRefreshToken(refreshToken)).toThrow(
      "error.auth.token_invalid"
    );
  });

  it("allows audience-less legacy tokens only on the compatibility service", () => {
    const issuedAt = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        sub: "71",
        email: "ops@example.com",
        type: "access",
        jti: "legacy-jti",
        iat: issuedAt,
        exp: issuedAt + 900,
        sessionGeneration: 0
      })
    ).toString("base64url");
    const signingInput = `${header}.${payload}`;
    const signature = createHmac("sha256", env.AUTH_ACCESS_TOKEN_SECRET)
      .update(signingInput)
      .digest("base64url");
    const token = `${signingInput}.${signature}`;

    expect(new AuthTokenService(env).verifyAccessToken(token)).toMatchObject({
      aud: "needo-backend"
    });
    expect(() =>
      new AuthTokenService(withAudience("needo-ops-api")).verifyAccessToken(token)
    ).toThrow("error.auth.token_invalid");
  });
});
