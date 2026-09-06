import type { PrismaClient } from "@prisma/client";
import { resolveDashboardWindow } from "../src/domain/dashboard-period";
import { DashboardRepository } from "../src/repositories/dashboard.repository";
import {
  DashboardOperationsFinanceRepository,
  type DashboardOperationsFinanceReader,
  type OperationsFinanceFacts
} from "../src/repositories/dashboard-operations-finance.repository";
import { formalConfirmedPaymentEvidence } from "../src/repositories/formal-confirmed-payment-evidence";

type SqlQuery = {
  sql?: string;
  strings?: readonly string[];
  values?: unknown[];
};

const queryText = (query: SqlQuery): string => query.sql ?? query.strings?.join(" ") ?? "";

const window = resolveDashboardWindow(
  { period: "last7days" },
  new Date("2026-08-31T03:00:00.000Z")
);

const platformInput = {
  scope: { kind: "platform" } as const,
  city: "Tokyo",
  window
};

const createReader = (rows: unknown[]) => {
  const queryRaw = jest.fn(async (query: SqlQuery) => {
    void query;
    return rows;
  });
  const client = { $queryRaw: queryRaw } as unknown as PrismaClient;
  return {
    reader: new DashboardOperationsFinanceRepository(client),
    queryRaw
  };
};

describe("DashboardOperationsFinanceRepository", () => {
  it("exports the shared payment authority without requiring optional OrderFinancial", async () => {
    const fixture = createReader([
      { periodKey: "current", grossRevenueJpy: 12_000n, discountAmountJpy: 1_500n, travelFareJpy: 0n }
    ]);

    await fixture.reader.getOperationsFinance(platformInput);

    const query = fixture.queryRaw.mock.calls[0]?.[0] as SqlQuery;
    const sql = queryText(query);
    const authoritySql = queryText(formalConfirmedPaymentEvidence() as SqlQuery);
    expect(sql).toContain(authoritySql);
    expect(sql).toContain("formal_confirmed_payment_evidence");
    expect(authoritySql).not.toContain("order_financials");
    expect(authoritySql).not.toContain("financial.");
    expect(query.values).toEqual(
      expect.arrayContaining([
        "ndp",
        "cash",
        "other",
        "booking_complete_settlement",
        "applied",
        ":technician-receipt",
        ":operations-receipt"
      ])
    );
  });

  it("aggregates current and previous immutable checkout totals in one bounded query", async () => {
    const fixture = createReader([
      { periodKey: "current", grossRevenueJpy: 12_000n, discountAmountJpy: "1500", travelFareJpy: 700 },
      {
        period_key: "previous",
        gross_revenue_jpy: { toString: () => "8000" },
        discount_amount_jpy: 500,
        travel_fare_jpy: 300
      }
    ]);

    await expect(fixture.reader.getOperationsFinance(platformInput)).resolves.toEqual({
      grossRevenue: { current: 12_000, previous: 8_000, dataStatus: "ready" },
      travelFare: { current: 700, previous: 300, dataStatus: "ready" },
      discountAmount: { current: 1_500, previous: 500, dataStatus: "ready" },
      consumablesSales: { current: null, previous: null, dataStatus: "not_connected" }
    });
    expect(fixture.queryRaw).toHaveBeenCalledTimes(1);

    const query = fixture.queryRaw.mock.calls[0]?.[0] as SqlQuery;
    const sql = queryText(query);
    expect(sql).toContain("dashboard_operations_finance");
    expect(sql).toContain("WITH periods AS");
    expect(sql).toContain("payment_confirmed_at >= period.from_inclusive");
    expect(sql).toContain("payment_confirmed_at < period.to_exclusive");
    expect(sql).not.toContain("booking.starts_at >= period.from_inclusive");
    expect(sql).not.toContain("checkout.created_at >= period.from_inclusive");
    expect(sql).not.toContain("booking.updated_at >= period.from_inclusive");
    expect(sql).toContain("booking.shop_id = shop.id");
    expect(sql).toContain("booking.status =");
    expect(sql).toContain("booking.payment_status =");
    expect(sql).toContain("booking.payment_confirmed_by_id IS NOT NULL");
    expect(sql).toContain("booking.payment_refunded_at IS NULL");
    expect(sql).toContain("booking.payment_refunded_by_id IS NULL");
    expect(sql).toContain("booking.payment_refund_reference IS NULL");
    expect(sql).toContain("booking.payment_refund_reason IS NULL");
    expect(sql).toContain("booking.payment_amount_jpy = checkout.checkout_amount_jpy");
    expect(sql).toContain(
      "checkout.base_amount_jpy + checkout.add_on_amount_jpy"
    );
    expect(sql).toContain("checkout.checkout_amount_jpy");
    expect(sql).toContain("checkout.payment_selected_at <= booking.payment_confirmed_at");
    expect(sql).toContain("checkout.payment_method = booking.payment_method");
    expect(sql).toContain("ledger.reference_type =");
    expect(sql).toContain("ledger.reference_id = checkout.id");
    expect(sql).toContain("ledger.amount = checkout.payable_ndp");
    expect(sql).toContain("ledger.actor_user_id = booking.payment_confirmed_by_id");
    expect(sql).toContain("ledger.deleted_at IS NULL");
    expect(sql).toContain("checkout.payment_selected_at <= ledger.created_at");
    expect(sql).toContain("booking.payment_reference = CONCAT(");
    expect(sql).toContain("checkout.receipt_confirmed_at IS NULL");
    expect(sql).toContain("checkout.payment_selected_at <= checkout.receipt_confirmed_at");
    expect(sql).toContain("checkout.receipt_confirmed_at <= booking.payment_confirmed_at");
    expect(sql).toContain("checkout.ledger_transaction_id IS NULL");
    expect(sql).toContain("TRIM(shop.city) =");
    expect(query.values).toEqual(
      expect.arrayContaining([
        "current",
        "previous",
        "completed",
        "confirmed",
        "ndp",
        "cash",
        "other",
        "applied",
        "booking_complete_settlement",
        "order_checkout_payment",
        "Tokyo"
      ])
    );
  });

  it("uses the authoritative booking shop for merchant scope and never substitutes a city", async () => {
    const fixture = createReader([]);

    await fixture.reader.getOperationsFinance({
      scope: { kind: "shop", shopId: 91 },
      city: null,
      window
    });

    const query = fixture.queryRaw.mock.calls[0]?.[0] as SqlQuery;
    const sql = queryText(query);
    expect(sql).toContain("booking.shop_id = shop.id");
    expect(sql).toContain("booking.shop_id =");
    expect(sql).not.toContain("TRIM(shop.city) =");
    expect(query.values).toContain(91);
  });

  it("returns redacted payment-evidenced travel-fare details without customer addresses", async () => {
    const fixture = createReader([{
      orderNo: "46493", shopId: 11, shopName: "NeeDo Shinjuku",
      completedAt: new Date("2026-08-30T03:00:00.000Z"), distanceMeters: 7_500,
      policyVersionPublicId: "00000000-0000-4000-8000-000000000031",
      policyVersion: 2, bandMaximumDistanceMeters: 10_000, fareAmountJpy: 500,
      paymentEvidence: "ndp_ledger"
    }]);

    await expect(fixture.reader.getTravelFareDetails(platformInput)).resolves.toEqual([{
      orderNo: "46493", shopId: 11, shopName: "NeeDo Shinjuku",
      completedAt: "2026-08-30T03:00:00.000Z", distanceMeters: 7_500,
      policyVersionPublicId: "00000000-0000-4000-8000-000000000031",
      policyVersion: 2, bandMaximumDistanceMeters: 10_000, fareAmountJpy: 500,
      paymentEvidence: "ndp_ledger", reversalState: "none"
    }]);
    const sql = queryText(fixture.queryRaw.mock.calls[0]?.[0] as SqlQuery);
    expect(sql).toContain("dashboard_travel_fare_details");
    expect(sql).toContain("booking_travel_fare_snapshots");
    expect(sql).toContain("booking.payment_amount_jpy = checkout.checkout_amount_jpy");
    expect(sql).toContain("ledger.actor_user_id = booking.payment_confirmed_by_id");
    expect(sql).toContain("booking.payment_note = checkout.receipt_confirmation_reason");
    expect(sql).toContain("checkout.receipt_confirmation_reason IS NULL");
    expect(sql).not.toContain("fulfillment_address_json");
  });

  it("maps an absent period row to a ready zero without inventing unavailable metrics", async () => {
    const fixture = createReader([
      { periodKey: "current", grossRevenueJpy: 0n, discountAmountJpy: 0n, travelFareJpy: 0n }
    ]);

    const result = await fixture.reader.getOperationsFinance(platformInput);

    expect(result.grossRevenue).toEqual({ current: 0, previous: 0, dataStatus: "ready" });
    expect(result.discountAmount).toEqual({ current: 0, previous: 0, dataStatus: "ready" });
    expect(result.travelFare).toEqual({ current: 0, previous: 0, dataStatus: "ready" });
    expect(result.consumablesSales).toEqual({
      current: null,
      previous: null,
      dataStatus: "not_connected"
    });
  });

  it.each([
    ["negative", -1],
    ["fractional", 1.5],
    ["unsafe", Number.MAX_SAFE_INTEGER + 1],
    ["non-finite", Number.POSITIVE_INFINITY],
    ["malformed", "12.5"],
    ["non-numeric", "invalid"]
  ])("fails closed for a %s aggregate", async (_label, value) => {
    const fixture = createReader([
      { periodKey: "current", grossRevenueJpy: value, discountAmountJpy: 0, travelFareJpy: 0 }
    ]);

    await expect(fixture.reader.getOperationsFinance(platformInput)).rejects.toThrow(
      "Dashboard operations finance aggregate must be a non-negative safe integer"
    );
  });

  it("delegates through DashboardRepository without duplicating the reader policy", async () => {
    const facts = {
      grossRevenue: { current: 100, previous: 80, dataStatus: "ready" },
      travelFare: { current: 0, previous: 0, dataStatus: "ready" },
      discountAmount: { current: 10, previous: 4, dataStatus: "ready" },
      consumablesSales: { current: null, previous: null, dataStatus: "not_connected" }
    } satisfies OperationsFinanceFacts;
    const operationsFinanceReader = {
      getOperationsFinance: jest.fn(async () => facts)
    } satisfies DashboardOperationsFinanceReader;
    const repository = new DashboardRepository(
      {} as PrismaClient,
      { getFinanceFacts: jest.fn() },
      { getMerchantFacts: jest.fn() },
      operationsFinanceReader
    );

    await expect(repository.getOperationsFinance(platformInput)).resolves.toBe(facts);
    expect(operationsFinanceReader.getOperationsFinance).toHaveBeenCalledWith(platformInput);
  });
});
