import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

describe("LifeDance administrator cross-portal seed contract", () => {
  it("keeps the existing admin password while attaching real merchant ownership", () => {
    expect(seedSource).toContain("LIFEDANCE_ADMIN_EMAIL");
    expect(seedSource).toContain("migrateLifeDanceAdminOwnership(tx)");
    expect(ownershipSource).toContain("merchantAccount.upsert");
    expect(ownershipSource).toContain("merchantShopMembership.upsert");
    expect(ownershipSource).toContain('code: "lifedance-real-ops"');
    expect(ownershipSource).toContain('type: "merchant_owner"');
    expect(seedSource).not.toContain("passwordHash: getRequiredId(passwordHashes, LIFEDANCE_ADMIN_EMAIL");
  });

  it("creates a private, independent, non-bookable administrator technician profile", () => {
    expect(ownershipSource).toContain("TechnicianEmploymentType.INDEPENDENT");
    expect(ownershipSource).toContain('status: "private"');
    expect(ownershipSource).toContain("shopId: null");
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
});
