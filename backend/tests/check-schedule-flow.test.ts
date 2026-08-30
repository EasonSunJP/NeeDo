import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("schedule flow checker cleanup", () => {
  it("creates current formal test users without the retired auth registration repository method", () => {
    const source = readFileSync(resolve(__dirname, "../scripts/check-schedule-flow.ts"), "utf8");

    expect(source).toContain("createFormalTestUser");
    expect(source).not.toContain("authRepository.registerUser");
    expect(source).not.toContain("{ AuthRepository }");
  });

  it("creates and cleans the active technician-shop affiliation required by formal schedule scope", () => {
    const source = readFileSync(resolve(__dirname, "../scripts/check-schedule-flow.ts"), "utf8");

    expect(source).toContain("prisma.technicianShopAffiliation.create");
    expect(source).toContain("transaction.technicianShopAffiliation.deleteMany");
    expect(source).toContain("activeKey:");
  });

  it("collects created booking ids from the current mutation result envelope", () => {
    const source = readFileSync(resolve(__dirname, "../scripts/check-schedule-flow.ts"), "utf8");

    expect(source).toContain("result.order.id");
    expect(source).not.toContain("successfulConcurrentOrders.map((order) => order.id)");
    expect(source).not.toContain("successfulPooledOrders.map((order) => order.id)");
  });

  it("removes generated public identifiers before their user identities", () => {
    const source = readFileSync(resolve(__dirname, "../scripts/check-schedule-flow.ts"), "utf8");
    const publicIdentifierCleanup = source.indexOf("transaction.publicIdentifier.deleteMany");
    const userIdentityCleanup = source.indexOf("transaction.userIdentity.deleteMany");

    expect(publicIdentifierCleanup).toBeGreaterThan(-1);
    expect(userIdentityCleanup).toBeGreaterThan(publicIdentifierCleanup);
  });
});
