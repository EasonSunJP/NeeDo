import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { assertSafeGoogleAuthFlowEnvironment } from "../scripts/check-google-auth-flow";
import { assertSafeRegistrationFlowEnvironment } from "../scripts/check-registration-flow";

const backendRoot = join(__dirname, "..");
const safeEnvironment = {
  NODE_ENV: "test",
  DEPLOY_ENV: "test",
  DATABASE_URL: "mysql://needo_test:password@127.0.0.1:3307/needo_test",
  REDIS_URL: "redis://127.0.0.1:6379/15"
} satisfies NodeJS.ProcessEnv;

describe("formal auth guarded flow scripts", () => {
  it("registers the Google lifecycle checker and keeps both checkers fail-closed", () => {
    const packageJson = JSON.parse(readFileSync(join(backendRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const googleScriptPath = join(backendRoot, "scripts/check-google-auth-flow.ts");

    expect(existsSync(googleScriptPath)).toBe(true);
    expect(packageJson.scripts["check:google-auth-flow"]).toBe(
      "tsx scripts/check-google-auth-flow.ts"
    );

    expect(() => assertSafeGoogleAuthFlowEnvironment(safeEnvironment)).not.toThrow();
    expect(() => assertSafeRegistrationFlowEnvironment(safeEnvironment)).not.toThrow();

    for (const unsafe of [
      { ...safeEnvironment, NODE_ENV: "production" },
      { ...safeEnvironment, DEPLOY_ENV: "prod" },
      { ...safeEnvironment, DEPLOY_ENV: "staging" },
      {
        ...safeEnvironment,
        DATABASE_URL: "mysql://needo_test:password@db.example.com:3306/needo_test"
      },
      {
        ...safeEnvironment,
        DATABASE_URL: "mysql://needo_test:password@127.0.0.1:3307/needo_dev"
      },
      { ...safeEnvironment, REDIS_URL: "redis://cache.example.com:6379/15" }
    ]) {
      expect(() => assertSafeGoogleAuthFlowEnvironment(unsafe)).toThrow();
      expect(() => assertSafeRegistrationFlowEnvironment(unsafe)).toThrow();
    }
  });

  it("drives registration through AuthService and proves pre-OTP absence and exact cleanup", () => {
    const source = readFileSync(join(backendRoot, "scripts/check-registration-flow.ts"), "utf8");

    expect(source).toContain("new AuthService(");
    expect(source).toContain("startRegistration");
    expect(source).toContain("verifyRegistration");
    expect(source).toContain("user was persisted before registration OTP verification");
    expect(source).toContain("registration cleanup left marked database rows behind");
    expect(source).toContain("registration cleanup left marked Redis keys behind");
    expect(source).toContain("discoverMarkedUserIds");
    expect(source).toContain("cleanupErrors");
    expect(source).toMatch(
      /auditLog\.deleteMany\(\{[\s\S]{0,220}targetType: "User", targetId:/
    );
  });

  it("proves the complete Google first-use, setup, login, unlink, and cleanup lifecycle", () => {
    const source = readFileSync(join(backendRoot, "scripts/check-google-auth-flow.ts"), "utf8");

    for (const requiredEvidence of [
      "email registration stored a User before OTP",
      "verifyRegistration",
      "email password login did not resolve the registered User",
      "NeeDo ID password login did not resolve the registered User",
      "first Google use did not require OTP",
      "Google first use did not link the existing email account",
      "repeat Google login was not direct",
      "distinct Google email did not create a Google-only customer",
      "Google-only account unexpectedly had a password",
      "verifyPasswordSetup",
      "password setup did not enable password login",
      "verifyGoogleUnlink",
      "unlink left a refresh token active",
      "unlink did not blacklist the current access token",
      "Google auth cleanup left marked database rows behind",
      "Google auth cleanup left marked Redis keys behind",
      "discoverMarkedUserIds",
      "cleanupErrors"
    ]) {
      expect(source).toContain(requiredEvidence);
    }

    expect(source).toContain("new AuthRepository(");
    expect(source).toContain("new RedisAuthSessionStore(");
    expect(source).toContain("new RedisVerificationChallengeStore(");
    expect(source).toContain("new AuthTokenService(");
    expect(source).toContain("compare(");
    expect(source).toContain("deterministicGoogleVerifier");
    expect(source).toContain("captureOnlyOtpDelivery");
    expect(source).toMatch(
      /auditLog\.deleteMany\(\{[\s\S]{0,220}targetType: "User", targetId:/
    );
    expect(source).not.toMatch(
      /authenticateAccessToken\([\s\S]{0,120}"auth:password:setup"/
    );
    expect(source).not.toMatch(/authenticateAccessToken\([\s\S]{0,120}"auth:google:unlink"/);
  });
});
