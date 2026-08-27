import { readFileSync } from "node:fs";
import { join } from "node:path";

const repositoryRoot = join(__dirname, "../..");
const read = (path: string) => readFileSync(join(repositoryRoot, path), "utf8");

describe("formal Google authentication operator documentation", () => {
  it("documents the guarded checks and immutable NeeDo identity behavior", () => {
    const readme = read("README.md");
    const userManagement = read("docs/User Management.md");

    expect(readme).toContain("check:google-auth-flow");
    expect(readme).toContain("No User row is created before OTP verification");
    expect(userManagement).toContain("`n` + 10");
    expect(userManagement).toContain("immutable");
    expect(userManagement).toContain("Google Calendar");
  });

  it("documents every formal API and stable product error key", () => {
    const api = read("docs/api.md");
    for (const route of [
      "/api/v1/auth/register",
      "/api/v1/auth/register/verify",
      "/api/v1/auth/login",
      "/api/v1/auth/google/init",
      "/api/v1/auth/google",
      "/api/v1/auth/google/verify",
      "/api/v1/auth/google/link",
      "/api/v1/auth/google/link/init",
      "/api/v1/auth/google/link/verify",
      "/api/v1/auth/google/unlink",
      "/api/v1/auth/google/unlink/verify",
      "/api/v1/auth/password/setup",
      "/api/v1/auth/password/setup/verify"
    ]) {
      expect(api).toContain(route);
    }
    for (const errorKey of [
      "error.auth.google_credential_invalid",
      "error.auth.google_nonce_invalid",
      "error.auth.google_conflict",
      "error.auth.verification_challenge_expired",
      "error.auth.verification_code_invalid",
      "error.auth.verification_attempts_exhausted",
      "error.auth.otp_cooldown",
      "error.dependency.google_auth_unavailable",
      "error.auth.otp_delivery_not_configured"
    ]) {
      expect(api).toContain(errorKey);
    }
    expect(api).toContain("| `error.auth.verification_challenge_expired` | `401` |");
    expect(api).toContain("| `error.auth.verification_code_invalid` | `401` |");
    expect(api).toContain("| `error.auth.verification_attempts_exhausted` | `429` |");
    expect(api).toContain(
      "| `error.dependency.google_auth_unavailable` | `503` | Required Google-capable repository wiring is unavailable or outdated |"
    );
  });

  it("documents Redis limits, Cloud origins, email delivery, migrations, and rollback", () => {
    const environment = read("docs/environment.md");
    const release = read("docs/production-release-checklist.md");

    for (const required of [
      "auth:verification:email:{challengeId}",
      "auth:verification:google-nonce:{nonceChallengeId}",
      "AUTH_VERIFICATION_MAX_ATTEMPTS",
      "GOOGLE_AUTH_CLIENT_ID",
      "http://localhost:5180",
      "authorized JavaScript origins",
      "No Google client secret",
      "callback redirect URI",
      "AUTH_OTP_EMAIL_WEBHOOK_URL",
      "Google Calendar"
    ]) {
      expect(environment).toContain(required);
    }
    expect(release).toContain("20260826140000_formal_google_auth_identity");
    expect(release).toContain("20260827090000_google_account_security_hardening");
    expect(release).toContain("check:google-auth-flow");
    expect(release).toContain("rollback boundary");
    expect(environment).toContain(
      "`auth:verification:email:{challengeId}` | Allowlisted challenge JSON with an HMAC OTP digest"
    );
    expect(environment).toContain("Fixed `600` seconds");
    expect(environment).toContain("Fixed `60` seconds");
    expect(environment).toContain("legacy generic OTP adapter only");
    expect(environment).not.toContain("Encrypted/HMAC-bound email challenge");
    const userManagement = read("docs/User Management.md");
    expect(userManagement).toContain(
      "| Formal email challenge | `auth:verification:email:{challengeId}` | 固定 600s |"
    );
    expect(userManagement).toContain(
      "| Formal OTP 冷却 | `auth:verification:cooldown:{HMAC}` | 固定 60s |"
    );
    expect(userManagement).not.toContain("`refresh:{userId}:{jti}`");
  });

  it("keeps frontend env examples secret-free and origin-specific", () => {
    const examples = [
      read(".env.development.example"),
      read(".env.staging.example"),
      read(".env.production.example")
    ];
    for (const example of examples) {
      expect(example).toContain("GOOGLE_AUTH_CLIENT_ID");
      expect(example).toContain("authorized JavaScript origin");
      expect(example).toContain("no client secret");
      expect(example).not.toContain("GOOGLE_AUTH_CLIENT_SECRET=");
    }
  });
});
