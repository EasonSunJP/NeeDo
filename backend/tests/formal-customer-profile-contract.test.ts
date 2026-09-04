import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("formal customer profile seed contract", () => {
  const userManagementSeedSource = readFileSync(resolve(__dirname, "../prisma/seed.ts"), "utf8");
  const socialSeedSource = readFileSync(
    resolve(__dirname, "../scripts/seed-formal-social-test.ts"),
    "utf8"
  );
  const socialCheckSource = readFileSync(
    resolve(__dirname, "../scripts/check-formal-social-test.ts"),
    "utf8"
  );
  const socialProfileSyncSource = readFileSync(
    resolve(__dirname, "../src/simulation/formal-social-account-profile.ts"),
    "utf8"
  );

  it("keeps the fixed formal customer profile readable by the user center", () => {
    const customerProfileBranch = userManagementSeedSource.slice(
      userManagementSeedSource.indexOf('if (input.account.identityType === "customer")'),
      userManagementSeedSource.indexOf("const seedRequiredTestAccounts")
    );

    expect(customerProfileBranch).toContain("isPublic: true");
    expect(customerProfileBranch).not.toContain("isPublic: false");
  });

  it("repairs all exported general-user profiles when refreshing formal social data", () => {
    expect(socialSeedSource).toContain("syncFormalSocialAccountProfile");
    expect(socialProfileSyncSource).toContain('account.socialType === "user"');
    expect(socialProfileSyncSource).toContain("tx.customerProfile.upsert");
    expect(socialProfileSyncSource).toContain("tx.userIdentity.create");
    expect(socialProfileSyncSource).toContain("isPublic: true");
    expect(socialProfileSyncSource).toContain("displayName: account.displayName");
    expect(socialProfileSyncSource).toContain("tx.technicianProfile.updateMany");
  });

  it("verifies profile nicknames, not only login-user names", () => {
    expect(socialCheckSource).toContain("customerProfiles");
    expect(socialCheckSource).toContain("technicianProfiles");
    expect(socialCheckSource).toContain("Profile nickname mismatch");
    expect(socialCheckSource).toContain('account.socialType === "user"');
    expect(socialCheckSource).toContain("uniqueNeeDoIds");
  });
});
