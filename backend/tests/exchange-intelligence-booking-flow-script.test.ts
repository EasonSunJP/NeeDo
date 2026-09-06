import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import packageJson from "../package.json";

const scriptPath = resolve(__dirname, "../scripts/check-exchange-intelligence-booking-flow.ts");

describe("Exchange intelligence booking formal-flow checker", () => {
  it("is wired as an explicit command and guarded scratch-database proof", () => {
    expect(packageJson.scripts["check:exchange-intelligence-booking-flow"]).toBe(
      "tsx scripts/check-exchange-intelligence-booking-flow.ts"
    );
    expect(existsSync(scriptPath)).toBe(true);
    const source = readFileSync(scriptPath, "utf8");
    expect(source).toContain("FORMAL_BACKEND_ENV_FILE");
    expect(source).toContain("needo_intelligence_check_");
    expect(source).toContain("prisma migrate deploy");
    expect(source).toContain("INFORMATION_SCHEMA.COLUMNS");
    expect(source).toContain("INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS");
    expect(source).toContain("exchange_intelligences_service_binding_check");
    expect(source).toContain("BookingService");
    expect(source).toContain("exchangeIntelligencePostId");
    expect(source).toContain("WITHDRAWN");
    expect(source).toContain("expiresAt: atHours(-1)");
    expect(source).toContain("CREATE TRIGGER");
    expect(source).toContain("injected transaction failure");
    expect(source).toContain("new PrismaClient");
    expect(source).toContain("concurrencyGate");
    expect(source).toContain("DROP DATABASE");
  });
});
