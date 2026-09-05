import { assertTravelFareSchema } from "../scripts/check-shop-travel-fare-flow";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const completeEvidence = {
  migrations: [
    "20260905150000_shop_travel_fare_routing",
    "20260905160000_route_estimate_schedule_slot_binding",
    "20260905170000_order_checkout_travel_fare_total"
  ],
  tables: ["shop_travel_fare_policy_versions", "shop_travel_fare_bands", "route_estimates", "booking_travel_fare_snapshots"],
  columns: ["order_checkouts.travel_fare_amount_jpy", "booking_orders.fulfillment_address_snapshot", "route_estimates.schedule_slot_id", "route_estimates.consumed_by_booking_order_id"],
  constraints: ["route_estimates.route_estimates_consumption_check", "route_estimates.route_estimates_schedule_slot_fkey", "order_checkouts.order_checkouts_travel_fare_amount_check", "order_checkouts.order_checkouts_total_chk"],
  constraintDefinitions: {
    "order_checkouts.order_checkouts_total_chk": "checkout_amount_jpy = base_amount_jpy + add_on_amount_jpy + travel_fare_amount_jpy - discount_amount_jpy"
  },
  indexes: ["route_estimates.route_estimates_consumed_booking_key", "route_estimates.route_estimates_schedule_slot_idx", "booking_travel_fare_snapshots.booking_travel_fare_snapshots_booking_key"],
  permissions: ["merchant-admin:travel-fare-policy:read", "merchant-admin:travel-fare-policy:write", "backoffice:travel-fare:read", "booking:travel-estimate:create"]
};

describe("shop travel-fare formal checker", () => {
  it("accepts the complete additive migration contract", () => {
    expect(() => assertTravelFareSchema(completeEvidence)).not.toThrow();
  });

  it("fails closed when a physical constraint or permission is absent", () => {
    expect(() => assertTravelFareSchema({ ...completeEvidence, constraints: [] })).toThrow("order_checkouts.order_checkouts_travel_fare_amount_check");
    expect(() => assertTravelFareSchema({ ...completeEvidence, permissions: completeEvidence.permissions.slice(1) })).toThrow("merchant-admin:travel-fare-policy:read");
    expect(() => assertTravelFareSchema({ ...completeEvidence, constraintDefinitions: { "order_checkouts.order_checkouts_total_chk": "checkout_amount_jpy = base_amount_jpy + add_on_amount_jpy - discount_amount_jpy" } })).toThrow("order_checkouts_total_chk formula");
  });

  it("keeps the formal lifecycle on BookingService with real ledger settlement", () => {
    const source = readFileSync(
      resolve(__dirname, "../scripts/check-shop-travel-fare-flow.ts"),
      "utf8"
    );

    expect(source).toContain("new LedgerService(");
    expect(source).toContain("new TravelOperationsRepository(tx)");
    expect(source).toContain("operations policy visibility did not read the persisted policy");
    expect(source).toContain("bookingService.transitionOrder(");
    expect(source).toContain("bookingService.confirmCheckoutReceipt(");
    expect(source).toContain("bookingService.refundManualPayment(");
    expect(source).not.toContain("settle: async () => undefined");
    expect(source).toContain("runConcurrentConsumptionCheck(prisma)");
    expect(source).toContain("const settled = await Promise.allSettled([");
    expect(source).toContain("concurrent estimate loser did not receive the consumed result");
    expect(source).toContain("const fixtureOrders = await transaction.bookingOrder.findMany(");
  });
});
