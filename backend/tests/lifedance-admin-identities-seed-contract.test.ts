import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { buildLifeDanceAdminTechnicianProfileUpsertData } from "../src/simulation/lifedance-admin-ownership";

const seedSource = readFileSync(
  resolve(__dirname, "../scripts/seed-three-month-simulation.ts"),
  "utf8"
);
const ownershipSource = readFileSync(
  resolve(__dirname, "../src/simulation/lifedance-admin-ownership.ts"),
  "utf8"
);
const checkerSource = readFileSync(
  resolve(__dirname, "../scripts/check-three-month-simulation.ts"),
  "utf8"
);
const ownershipCheckerSource = readFileSync(
  resolve(__dirname, "../scripts/check-lifedance-admin-ownership.ts"),
  "utf8"
);
const formalSocialSeedSource = readFileSync(
  resolve(__dirname, "../scripts/seed-formal-social-test.ts"),
  "utf8"
);

describe("LifeDance administrator cross-portal seed contract", () => {
  it("keeps the existing admin password while attaching real merchant ownership", () => {
    expect(seedSource).toContain("LIFEDANCE_ADMIN_EMAIL");
    expect(seedSource).toContain("migrateLifeDanceAdminOwnership(tx)");
    expect(ownershipSource).toContain("merchantAccount.upsert");
    expect(ownershipSource).toContain("merchantShopMembership.upsert");
    expect(ownershipSource).toContain('code: "lifedance-real-ops"');
    expect(ownershipSource).toContain('type: "merchant_owner"');
    expect(seedSource).not.toContain(
      "passwordHash: getRequiredId(passwordHashes, LIFEDANCE_ADMIN_EMAIL"
    );
    expect(seedSource).toContain("credentialAccounts");
    expect(seedSource).toContain("account.email !== LIFEDANCE_ADMIN_EMAIL");
    expect(seedSource).not.toContain("ADMIN_DEFAULT_PASSWORD");
    expect(formalSocialSeedSource).toContain("credentialUserIds");
    expect(formalSocialSeedSource).toContain("account.email !== LIFEDANCE_ADMIN_EMAIL");
  });

  it("keeps technician visibility user-controlled when formal seeds are rerun", () => {
    const upsertData = buildLifeDanceAdminTechnicianProfileUpsertData(1);

    expect(upsertData.create).toMatchObject({
      userId: 1,
      shopId: null,
      status: "private",
      visibility: "public",
      employmentType: "INDEPENDENT"
    });
    expect(upsertData.update).not.toHaveProperty("status");
    expect(upsertData.update).not.toHaveProperty("visibility");
    expect(checkerSource).toContain("visibility: true");
    expect(checkerSource).not.toContain('admin.technicianProfile.status === "private"');
    expect(checkerSource).not.toContain("adminAvailabilities");
    expect(checkerSource).toContain("adminTechnicianServices === 0 && adminBookings === 0");
    expect(ownershipCheckerSource).toContain("visibility: true");
    expect(ownershipCheckerSource).not.toContain(
      'admin.technicianProfile.status === "private"'
    );
    expect(ownershipCheckerSource).not.toContain("availabilities");
    expect(seedSource).toContain("buildSimulationIdentityGrants");
    expect(seedSource).toContain("forceNonDefault: shop.key === LIFEDANCE_SHOP_KEY");
  });

  it("removes only the previous LifeDance merchant scope and verifies exact admin scopes", () => {
    expect(ownershipSource).toContain("previousOwnerUserId");
    expect(ownershipSource).toContain('action: "seed.lifedance_shop.owner_migrate"');
    expect(checkerSource).toContain("LIFEDANCE_ADMIN_EMAIL");
    expect(checkerSource).toContain('expectIdentity(admin, "platform", "global", null)');
    expect(checkerSource).toContain(
      'expectIdentity(admin, "merchant_owner", "shop", lifeDanceShop.id)'
    );
    expect(checkerSource).toContain(
      'expectIdentity(admin, "technician", "technician_profile", admin.technicianProfile.id)'
    );
    expect(checkerSource).toContain('expectIdentity(admin, "scout", "global", null)');
  });

  it("keeps the administrator merchant organization identity scoped to the formal merchant account", () => {
    expect(ownershipSource).toContain('type: "merchant_organization"');
    expect(ownershipSource).toContain('scopeType: "merchant_account"');
    expect(ownershipCheckerSource).toContain(
      'identityKey("merchant_organization", "merchant_account", merchantAccount.id)'
    );
    expect(ownershipSource).toContain(
      'action: "seed.lifedance_admin.merchant_organization_scope_reconcile"'
    );
  });
});
