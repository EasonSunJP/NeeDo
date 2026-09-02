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

  it("reuses the formal user foundation cleanup after removing shop identifiers", () => {
    const source = readFileSync(resolve(__dirname, "../scripts/check-schedule-flow.ts"), "utf8");
    const shopIdentifierCleanup = source.indexOf("transaction.publicIdentifier.deleteMany");
    const userFoundationCleanup = source.indexOf("deleteFormalTestUserFoundations(");

    expect(shopIdentifierCleanup).toBeGreaterThan(-1);
    expect(userFoundationCleanup).toBeGreaterThan(shopIdentifierCleanup);
  });

  it("deletes current identity and experience foundations in foreign-key order", () => {
    const source = readFileSync(
      resolve(__dirname, "../scripts/support/formal-test-user.ts"),
      "utf8"
    );
    const publicIdentifierCleanup = source.indexOf("transaction.publicIdentifier.deleteMany");
    const merchantProfileCleanup = source.indexOf("transaction.merchantIdentityProfile.deleteMany");
    const experienceEntryCleanup = source.indexOf("transaction.userExperienceEntry.deleteMany");
    const experienceAccountCleanup = source.indexOf("transaction.userExperienceAccount.deleteMany");
    const identityCleanup = source.indexOf("transaction.userIdentity.deleteMany");

    expect(publicIdentifierCleanup).toBeGreaterThan(-1);
    expect(merchantProfileCleanup).toBeGreaterThan(publicIdentifierCleanup);
    expect(experienceEntryCleanup).toBeGreaterThan(merchantProfileCleanup);
    expect(experienceAccountCleanup).toBeGreaterThan(experienceEntryCleanup);
    expect(identityCleanup).toBeGreaterThan(experienceAccountCleanup);
  });

  it("uses the current merchant identity claim in the acceptance control checker", () => {
    const source = readFileSync(
      resolve(__dirname, "../scripts/check-order-acceptance-control-flow.ts"),
      "utf8"
    );
    const providerActor = source.match(/const providerActor = \{[\s\S]*?\n\s{4}\};/)?.[0] ?? "";

    expect(providerActor).toContain('currentIdentityType: "merchant_owner"');
  });
});
