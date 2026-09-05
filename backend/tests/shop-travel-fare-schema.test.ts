import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  SYSTEM_PERMISSION_CODES,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";

const TRAVEL_FARE_PERMISSIONS = {
  merchantRead: "merchant-admin:travel-fare-policy:read",
  merchantWrite: "merchant-admin:travel-fare-policy:write",
  backofficeRead: "backoffice:travel-fare:read",
  estimateCreate: "booking:travel-estimate:create"
} as const;

const schema = readFileSync(resolve(__dirname, "../prisma/schema.prisma"), "utf8");
const migrationPath = resolve(
  __dirname,
  "../prisma/migrations/20260905150000_shop_travel_fare_routing/migration.sql"
);

const modelBody = (name: string): string =>
  schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "";

describe("shop travel fare persistence schema", () => {
  it("defines versioned shop policies and ordered fare bands", () => {
    const policy = modelBody("ShopTravelFarePolicyVersion");
    const band = modelBody("ShopTravelFareBand");

    expect(policy).toMatch(/publicId\s+String\s+@unique/);
    expect(policy).toMatch(/shopId\s+Int/);
    expect(policy).toMatch(/version\s+Int/);
    expect(policy).toMatch(/effectiveFrom\s+DateTime/);
    expect(policy).toMatch(/publishedByUserId\s+Int/);
    expect(policy).toMatch(/reason\s+String/);
    expect(policy).toContain("@@unique([shopId, version]");
    expect(policy).toContain("@@index([shopId, effectiveFrom, deletedAt]");

    expect(band).toMatch(/policyVersionId\s+Int/);
    expect(band).toMatch(/ordinal\s+Int/);
    expect(band).toMatch(/maximumDistanceMeters\s+Int/);
    expect(band).toMatch(/fareAmountJpy\s+Int/);
    expect(band).toContain("@@unique([policyVersionId, ordinal]");
    expect(band).toContain("@@unique([policyVersionId, maximumDistanceMeters]");
  });

  it("binds expiring route estimates to customer, shop, service, policy, and one booking", () => {
    const estimate = modelBody("RouteEstimate");

    for (const field of [
      "publicId",
      "customerUserId",
      "shopId",
      "serviceId",
      "policyVersionId",
      "matchedBandId",
      "providerCode",
      "providerRequestId",
      "originAddressHash",
      "destinationAddressHash",
      "distanceMeters",
      "durationSeconds",
      "fareAmountJpy",
      "expiresAt",
      "consumedAt",
      "consumedByBookingOrderId"
    ]) {
      expect(estimate).toContain(field);
    }
    expect(estimate).toMatch(/consumedByBookingOrderId\s+Int\?\s+@unique/);
    expect(estimate).toContain(
      "@@index([customerUserId, shopId, serviceId, expiresAt, deletedAt]"
    );
    expect(estimate).toContain(
      "@@index([providerCode, originAddressHash, destinationAddressHash, expiresAt, deletedAt]"
    );
  });

  it("persists one immutable travel snapshot per booking and checkout fare defaults to zero", () => {
    const snapshot = modelBody("BookingTravelFareSnapshot");
    const checkout = modelBody("OrderCheckout");

    for (const field of [
      "publicId",
      "bookingOrderId",
      "routeEstimateId",
      "policyVersionId",
      "matchedBandId",
      "providerCode",
      "originAddressHash",
      "destinationAddressHash",
      "fulfillmentAddressJson",
      "distanceMeters",
      "durationSeconds",
      "fareAmountJpy"
    ]) {
      expect(snapshot).toContain(field);
    }
    expect(snapshot).toMatch(/bookingOrderId\s+Int\s+@unique/);
    expect(snapshot).toMatch(/routeEstimateId\s+Int\s+@unique/);
    expect(checkout).toMatch(
      /travelFareAmountJpy\s+Int\s+@default\(0\)\s+@map\("travel_fare_amount_jpy"\)/
    );
  });

  it("ships additive SQL with checks, restrictive foreign keys, and travel permissions", () => {
    expect(existsSync(migrationPath)).toBe(true);
    const migration = readFileSync(migrationPath, "utf8");

    for (const table of [
      "shop_travel_fare_policy_versions",
      "shop_travel_fare_bands",
      "route_estimates",
      "booking_travel_fare_snapshots"
    ]) {
      expect(migration).toContain(`CREATE TABLE \`${table}\``);
    }
    expect(migration).toContain("ADD COLUMN `travel_fare_amount_jpy` INTEGER NOT NULL DEFAULT 0");
    expect(migration).toMatch(/CHECK \(`maximum_distance_meters` > 0\)/);
    expect(migration).toMatch(/CHECK \(`fare_amount_jpy` >= 0\)/);
    expect(migration).toMatch(/CHECK \(`distance_meters` > 0\)/);
    expect(migration).toMatch(/CHECK \(`duration_seconds` > 0\)/);
    expect(migration).toMatch(/CHECK \(`expires_at` > `created_at`\)/);
    expect(migration).toMatch(/ON DELETE RESTRICT ON UPDATE RESTRICT/g);
    expect(migration).not.toMatch(/DROP TABLE|DELETE FROM|UPDATE\s+`?(booking_orders|order_checkouts)/i);

    for (const permission of Object.values(TRAVEL_FARE_PERMISSIONS)) {
      expect(migration).toContain(permission);
    }
  });

  it("registers least-privilege role grants in the formal permission seed", () => {
    const permissions = Object.values(TRAVEL_FARE_PERMISSIONS);
    expect(SYSTEM_PERMISSION_CODES).toEqual(expect.arrayContaining(permissions));

    const assignments = buildRolePermissionAssignments();
    expect(assignments.merchant_owner).toEqual(
      expect.arrayContaining([
        TRAVEL_FARE_PERMISSIONS.merchantRead,
        TRAVEL_FARE_PERMISSIONS.merchantWrite
      ])
    );
    expect(assignments.merchant_staff).toContain(TRAVEL_FARE_PERMISSIONS.merchantRead);
    expect(assignments.merchant_staff).not.toContain(TRAVEL_FARE_PERMISSIONS.merchantWrite);
    expect(assignments.customer).toContain(TRAVEL_FARE_PERMISSIONS.estimateCreate);
    expect(assignments.operator).toContain(TRAVEL_FARE_PERMISSIONS.backofficeRead);
    expect(assignments.viewer).toContain(TRAVEL_FARE_PERMISSIONS.backofficeRead);
  });

  it("keeps all four new business models on the common audit columns", () => {
    for (const name of [
      "ShopTravelFarePolicyVersion",
      "ShopTravelFareBand",
      "RouteEstimate",
      "BookingTravelFareSnapshot"
    ]) {
      const model = modelBody(name);
      expect(model).toMatch(/id\s+Int\s+@id/);
      expect(model).toContain("createdAt");
      expect(model).toContain("updatedAt");
      expect(model).toContain("deletedAt");
    }
  });
});
