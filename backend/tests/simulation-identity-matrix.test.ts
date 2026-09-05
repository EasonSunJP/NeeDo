import {
  SIMULATION_IDENTITY_ACTIVE_KEY_PREFIX,
  buildSimulationIdentityGrants,
  simulationIdentityActiveKey
} from "../src/simulation/simulation-identity-matrix";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("simulation identity matrix", () => {
  const build = (accountKind: "customer" | "technician" | "merchant") =>
    buildSimulationIdentityGrants({
      userId: 7,
      accountKind,
      displayName: "山本 太郎",
      customerProfileId: 71,
      technicianProfileId: 72,
      shopId: 73
    });

  it("keeps ordinary customers customer-only", () => {
    expect(build("customer").map((grant) => grant.identityType)).toEqual(["customer"]);
  });

  it("gives every technician customer, technician, and affiliate identities", () => {
    expect(build("technician")).toEqual([
      expect.objectContaining({
        identityType: "customer",
        scopeType: "customer_profile",
        scopeId: 71,
        isDefault: true
      }),
      expect.objectContaining({
        identityType: "technician",
        scopeType: "technician_profile",
        scopeId: 72,
        isDefault: false
      }),
      expect.objectContaining({
        identityType: "scout",
        scopeType: "global",
        scopeId: null,
        isDefault: false
      })
    ]);
  });

  it("gives every merchant customer, technician, merchant, and affiliate identities", () => {
    expect(build("merchant")).toEqual([
      expect.objectContaining({ identityType: "customer", scopeId: 71 }),
      expect.objectContaining({ identityType: "technician", scopeId: 72 }),
      expect.objectContaining({ identityType: "merchant_owner", scopeType: "shop", scopeId: 73 }),
      expect.objectContaining({ identityType: "scout", scopeType: "global", scopeId: null })
    ]);
  });

  it("creates stable unique keys for idempotent repeated seeds", () => {
    const first = build("merchant").map((grant) => simulationIdentityActiveKey(7, grant));
    const second = build("merchant").map((grant) => simulationIdentityActiveKey(7, grant));
    expect(second).toEqual(first);
    expect(new Set(first).size).toBe(first.length);
    expect(first.every((key) => key.startsWith(SIMULATION_IDENTITY_ACTIVE_KEY_PREFIX))).toBe(true);
  });

  it("rejects missing real scopes", () => {
    expect(() =>
      buildSimulationIdentityGrants({
        userId: 7,
        accountKind: "merchant",
        displayName: "店铺",
        customerProfileId: 71
      })
    ).toThrow("technicianProfileId");
  });

  it("is applied and independently checked by the local-only simulation workflow", () => {
    const seed = readFileSync(
      resolve(__dirname, "../scripts/seed-three-month-simulation.ts"),
      "utf8"
    );
    const check = readFileSync(
      resolve(__dirname, "../scripts/check-three-month-simulation.ts"),
      "utf8"
    );
    expect(seed).toContain("buildSimulationIdentityGrants");
    expect(seed).toContain("simulationIdentityActiveKey");
    expect(seed).toContain("activeKey: { startsWith: SIMULATION_IDENTITY_ACTIVE_KEY_PREFIX }");
    expect(seed).not.toContain("stagingCohortUsers");
    expect(seed).toContain('accountKind: "merchant"');
    expect(seed).toContain('accountKind: "technician"');
    expect(check).toContain("expectedTypes: string[]");
    expect(check).toContain('["customer", "technician", "merchant_owner", "scout"]');
    expect(check).toContain("must keep the customer identity only");
    expect(check).toContain("representative staging password hashes are missing");
    expect(check).toContain("existingPasswordHashesVerified");
  });

  it("removes every restrictive child before reseeding simulation booking orders", () => {
    const seed = readFileSync(
      resolve(__dirname, "../scripts/seed-three-month-simulation.ts"),
      "utf8"
    );
    const reviewTagDelete = seed.indexOf("tx.orderReviewTag.deleteMany");
    const reviewDelete = seed.indexOf("tx.orderReview.deleteMany");
    const timelineDelete = seed.indexOf("tx.orderTimelineComment.deleteMany");
    const rewardTransactionDelete = seed.indexOf("tx.affiliateRewardTransaction.deleteMany");
    const rewardDelete = seed.indexOf("tx.affiliateReward.deleteMany");
    const attributionDelete = seed.indexOf("tx.affiliateAttribution.deleteMany");
    const orderDelete = seed.indexOf("tx.bookingOrder.deleteMany");

    expect(reviewTagDelete).toBeGreaterThan(0);
    expect(reviewTagDelete).toBeLessThan(reviewDelete);
    expect(reviewDelete).toBeLessThan(timelineDelete);
    expect(timelineDelete).toBeLessThan(rewardTransactionDelete);
    expect(rewardTransactionDelete).toBeLessThan(rewardDelete);
    expect(rewardDelete).toBeLessThan(attributionDelete);
    expect(attributionDelete).toBeLessThan(orderDelete);
  });

  it("soft-deletes reusable scheduling and service records so historical orders stay intact", () => {
    const seed = readFileSync(
      resolve(__dirname, "../scripts/seed-three-month-simulation.ts"),
      "utf8"
    );

    expect(seed).toContain("tx.scheduleSlot.updateMany");
    expect(seed).toContain("tx.availability.updateMany");
    expect(seed).toContain("tx.technicianService.updateMany");
    expect(seed).toContain("tx.service.updateMany");
    expect(seed).not.toContain("tx.scheduleSlot.deleteMany");
    expect(seed).not.toContain("tx.availability.deleteMany");
    expect(seed).not.toContain("tx.technicianService.deleteMany");
    expect(seed).not.toContain("tx.service.deleteMany");
  });
});
