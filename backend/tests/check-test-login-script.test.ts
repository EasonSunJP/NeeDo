import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("formal test-login self-check script", () => {
  it("uses the strict /auth/login request contract", () => {
    const source = readFileSync(join(process.cwd(), "scripts/check-test-login.ts"), "utf8");

    expect(source).toContain("body: JSON.stringify({ loginIdentifier: account.email, password })");
    expect(source).not.toContain("body: JSON.stringify({ email: account.email, password })");
  });

  it("allows the documented admin-password fallback only for local development", () => {
    const source = readFileSync(join(process.cwd(), "scripts/check-test-login.ts"), "utf8");

    expect(source).toContain('import { compare } from "bcryptjs";');
    expect(source).toContain('env.NODE_ENV === "development"');
    expect(source).toContain("await compare(candidate, passwordHash)");
  });
});
