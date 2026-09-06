import { Prisma, type PrismaClient } from "@prisma/client";
import type { DashboardAggregateInput } from "../domain/dashboard";
import { formalConfirmedPaymentEvidence } from "./formal-confirmed-payment-evidence";

type NumericValue = bigint | number | string | { toString: () => string } | null | undefined;
type DashboardQueryClient = Pick<PrismaClient, "$queryRaw">;

interface OperationsFinanceRow {
  periodKey?: string;
  period_key?: string;
  grossRevenueJpy?: NumericValue;
  gross_revenue_jpy?: NumericValue;
  discountAmountJpy?: NumericValue;
  discount_amount_jpy?: NumericValue;
  travelFareJpy?: NumericValue;
  travel_fare_jpy?: NumericValue;
}

interface TravelFareDetailDatabaseRow {
  orderNo: string;
  shopId: NumericValue;
  shopName: string;
  completedAt: Date;
  distanceMeters: NumericValue;
  policyVersionPublicId: string;
  policyVersion: NumericValue;
  bandMaximumDistanceMeters: NumericValue;
  fareAmountJpy: NumericValue;
  paymentEvidence: TravelFareDetailRow["paymentEvidence"];
}

export interface TravelFareDetailRow {
  orderNo: string;
  shopId: number;
  shopName: string;
  completedAt: string;
  distanceMeters: number;
  policyVersionPublicId: string;
  policyVersion: number;
  bandMaximumDistanceMeters: number;
  fareAmountJpy: number;
  paymentEvidence: "ndp_ledger" | "technician_receipt_confirmation" | "operations_receipt_override";
  reversalState: "none";
}

export interface OperationsFinanceFacts {
  grossRevenue: { current: number; previous: number; dataStatus: "ready" };
  travelFare: { current: number; previous: number; dataStatus: "ready" };
  discountAmount: { current: number; previous: number; dataStatus: "ready" };
  consumablesSales: { current: null; previous: null; dataStatus: "not_connected" };
}

export interface DashboardOperationsFinanceReader {
  getOperationsFinance(input: DashboardAggregateInput): Promise<OperationsFinanceFacts>;
  getTravelFareDetails?(input: DashboardAggregateInput): Promise<TravelFareDetailRow[]>;
}

const aggregateError = "Dashboard operations finance aggregate must be a non-negative safe integer";

export class DashboardOperationsFinanceRepository implements DashboardOperationsFinanceReader {
  public constructor(private readonly client: DashboardQueryClient) {}

  public async getOperationsFinance(
    input: DashboardAggregateInput
  ): Promise<OperationsFinanceFacts> {
    const rows = await this.queryOperationsFinance(input);
    const periods = new Map<
      "current" | "previous",
      {
        grossRevenue: number;
        discountAmount: number;
        travelFare: number;
      }
    >();

    for (const row of rows) {
      const key = row.periodKey ?? row.period_key;
      if ((key !== "current" && key !== "previous") || periods.has(key)) {
        throw new RangeError(aggregateError);
      }
      periods.set(key, {
        grossRevenue: this.toSafeAggregate(row.grossRevenueJpy ?? row.gross_revenue_jpy),
        discountAmount: this.toSafeAggregate(row.discountAmountJpy ?? row.discount_amount_jpy),
        travelFare: this.toSafeAggregate(row.travelFareJpy ?? row.travel_fare_jpy)
      });
    }

    const current = periods.get("current") ?? { grossRevenue: 0, discountAmount: 0, travelFare: 0 };
    const previous = periods.get("previous") ?? { grossRevenue: 0, discountAmount: 0, travelFare: 0 };

    return {
      grossRevenue: {
        current: current.grossRevenue,
        previous: previous.grossRevenue,
        dataStatus: "ready"
      },
      travelFare: { current: current.travelFare, previous: previous.travelFare, dataStatus: "ready" },
      discountAmount: {
        current: current.discountAmount,
        previous: previous.discountAmount,
        dataStatus: "ready"
      },
      consumablesSales: { current: null, previous: null, dataStatus: "not_connected" }
    };
  }

  public async getTravelFareDetails(
    input: DashboardAggregateInput
  ): Promise<TravelFareDetailRow[]> {
    const scope = this.shopScope(input);
    const rows = await this.client.$queryRaw<TravelFareDetailDatabaseRow[]>(Prisma.sql`
      /* dashboard_travel_fare_details */
      SELECT
        booking.order_no AS orderNo,
        shop.id AS shopId,
        shop.name AS shopName,
        booking.payment_confirmed_at AS completedAt,
        snapshot.distance_meters AS distanceMeters,
        snapshot.policy_version_public_id AS policyVersionPublicId,
        policy.version AS policyVersion,
        snapshot.band_maximum_distance_meters AS bandMaximumDistanceMeters,
        checkout.travel_fare_amount_jpy AS fareAmountJpy,
        CASE
          WHEN checkout.ledger_transaction_id IS NOT NULL THEN ${"ndp_ledger"}
          WHEN booking.payment_reference = CONCAT(${"checkout:"}, checkout.id, ${":operations-receipt"})
            THEN ${"operations_receipt_override"}
          ELSE ${"technician_receipt_confirmation"}
        END AS paymentEvidence
      FROM booking_orders AS booking
      INNER JOIN shops AS shop ON booking.shop_id = shop.id
      INNER JOIN order_checkouts AS checkout
        ON checkout.booking_order_id = booking.id AND checkout.deleted_at IS NULL
      INNER JOIN booking_travel_fare_snapshots AS snapshot
        ON snapshot.booking_order_id = booking.id AND snapshot.deleted_at IS NULL
      INNER JOIN shop_travel_fare_policy_versions AS policy
        ON policy.id = snapshot.policy_version_id AND policy.deleted_at IS NULL
      LEFT JOIN ledger_transactions AS ledger ON ledger.id = checkout.ledger_transaction_id
      WHERE ${scope}
        AND booking.payment_confirmed_at >= ${input.window.fromInclusive}
        AND booking.payment_confirmed_at < ${input.window.toExclusive}
        AND booking.deleted_at IS NULL
        AND booking.status = ${"completed"}
        AND booking.payment_status = ${"confirmed"}
        AND booking.payment_confirmed_by_id IS NOT NULL
        AND booking.payment_refunded_at IS NULL
        AND booking.payment_refunded_by_id IS NULL
        AND booking.payment_refund_reference IS NULL
        AND booking.payment_refund_reason IS NULL
        AND booking.payment_amount_jpy = checkout.checkout_amount_jpy
        AND checkout.base_amount_jpy >= 0
        AND checkout.add_on_amount_jpy >= 0
        AND checkout.travel_fare_amount_jpy >= 0
        AND checkout.discount_amount_jpy >= 0
        AND checkout.checkout_amount_jpy >= 0
        AND checkout.payable_ndp >= 0
        AND checkout.travel_fare_amount_jpy = snapshot.fare_amount_jpy
        AND checkout.travel_fare_amount_jpy > 0
        AND checkout.base_amount_jpy + checkout.add_on_amount_jpy
          + checkout.travel_fare_amount_jpy - checkout.discount_amount_jpy
          = checkout.checkout_amount_jpy
        AND checkout.payment_method = booking.payment_method
        AND checkout.payment_selected_at IS NOT NULL
        AND checkout.payment_selected_at <= booking.payment_confirmed_at
        AND (
          (checkout.payment_method = ${"ndp"}
            AND checkout.ledger_transaction_id IS NOT NULL
            AND ledger.status = ${"applied"}
            AND ledger.type = ${"booking_complete_settlement"}
            AND ledger.reference_type = ${"order_checkout_payment"}
            AND ledger.reference_id = checkout.id
            AND ledger.amount = checkout.payable_ndp
            AND ledger.actor_user_id = booking.payment_confirmed_by_id
            AND ledger.deleted_at IS NULL
            AND checkout.payment_selected_at <= ledger.created_at
            AND ledger.created_at <= booking.payment_confirmed_at
            AND booking.payment_reference = CONCAT(
              ${"checkout:"}, checkout.id, ${":ledger:"}, ledger.id
            )
            AND booking.payment_note IS NULL
            AND checkout.receipt_confirmed_by_id IS NULL
            AND checkout.receipt_confirmed_at IS NULL
            AND checkout.receipt_confirmation_reason IS NULL)
          OR
          (checkout.payment_method IN (${"cash"}, ${"other"})
            AND checkout.ledger_transaction_id IS NULL
            AND ledger.id IS NULL
            AND checkout.receipt_confirmed_by_id IS NOT NULL
            AND checkout.receipt_confirmed_at IS NOT NULL
            AND checkout.payment_selected_at <= checkout.receipt_confirmed_at
            AND checkout.receipt_confirmed_at <= booking.payment_confirmed_at
            AND checkout.receipt_confirmation_reason IS NOT NULL
            AND TRIM(checkout.receipt_confirmation_reason) <> ${""}
            AND booking.payment_confirmed_by_id = checkout.receipt_confirmed_by_id
            AND booking.payment_note = checkout.receipt_confirmation_reason
            AND booking.payment_reference IN (
              CONCAT(${"checkout:"}, checkout.id, ${":technician-receipt"}),
              CONCAT(${"checkout:"}, checkout.id, ${":operations-receipt"})
            )
            AND (
              (checkout.payment_method = ${"cash"}
                AND checkout.other_method_code IS NULL
                AND checkout.other_method_label IS NULL)
              OR
              (checkout.payment_method = ${"other"}
                AND checkout.other_method_code IS NOT NULL
                AND TRIM(checkout.other_method_code) <> ${""}
                AND checkout.other_method_label IS NOT NULL
                AND TRIM(checkout.other_method_label) <> ${""})
            ))
        )
      ORDER BY booking.payment_confirmed_at DESC, booking.id DESC
      LIMIT 100
    `);
    return rows.map((row) => ({
      orderNo: row.orderNo,
      shopId: this.toSafeAggregate(row.shopId),
      shopName: row.shopName,
      completedAt: row.completedAt.toISOString(),
      distanceMeters: this.toSafeAggregate(row.distanceMeters),
      policyVersionPublicId: row.policyVersionPublicId,
      policyVersion: this.toSafeAggregate(row.policyVersion),
      bandMaximumDistanceMeters: this.toSafeAggregate(row.bandMaximumDistanceMeters),
      fareAmountJpy: this.toSafeAggregate(row.fareAmountJpy),
      paymentEvidence: row.paymentEvidence,
      reversalState: "none"
    }));
  }

  private periodTable(input: DashboardAggregateInput): Prisma.Sql {
    return Prisma.join(
      [
        {
          key: "current",
          fromInclusive: input.window.fromInclusive,
          toExclusive: input.window.toExclusive
        },
        {
          key: "previous",
          fromInclusive: input.window.previousFromInclusive,
          toExclusive: input.window.previousToExclusive
        }
      ].map(
        (period) => Prisma.sql`SELECT ${period.key} AS period_key,
          ${period.fromInclusive} AS from_inclusive,
          ${period.toExclusive} AS to_exclusive`
      ),
      " UNION ALL "
    );
  }

  private shopScope(input: DashboardAggregateInput): Prisma.Sql {
    const filters: Prisma.Sql[] = [Prisma.sql`shop.deleted_at IS NULL`];
    if (input.scope.kind === "shop") {
      filters.push(Prisma.sql`booking.shop_id = ${input.scope.shopId}`);
    } else if (input.city) {
      filters.push(Prisma.sql`TRIM(shop.city) = ${input.city}`);
    }
    return Prisma.join(filters, " AND ");
  }

  private queryOperationsFinance(input: DashboardAggregateInput): Promise<OperationsFinanceRow[]> {
    const periods = this.periodTable(input);
    const scope = this.shopScope(input);
    return this.client.$queryRaw<OperationsFinanceRow[]>(Prisma.sql`
      /* dashboard_operations_finance */
      WITH periods AS (${periods}),
      eligible_checkout AS (
        SELECT
          period.period_key,
          checkout.checkout_amount_jpy,
          checkout.discount_amount_jpy,
          CASE
            WHEN snapshot.id IS NOT NULL
              AND snapshot.fare_amount_jpy = checkout.travel_fare_amount_jpy
              THEN checkout.travel_fare_amount_jpy
            ELSE 0
          END AS travel_fare_amount_jpy
        FROM periods AS period
        INNER JOIN booking_orders AS booking
          ON booking.payment_confirmed_at >= period.from_inclusive
          AND booking.payment_confirmed_at < period.to_exclusive
          AND booking.deleted_at IS NULL
        INNER JOIN shops AS shop
          ON booking.shop_id = shop.id
        INNER JOIN order_checkouts AS checkout
          ON checkout.booking_order_id = booking.id
          AND checkout.deleted_at IS NULL
        LEFT JOIN booking_travel_fare_snapshots AS snapshot
          ON snapshot.booking_order_id = booking.id
          AND snapshot.deleted_at IS NULL
        LEFT JOIN ledger_transactions AS ledger
          ON ledger.id = checkout.ledger_transaction_id
        WHERE ${scope}
          AND ${formalConfirmedPaymentEvidence()}
      )
      SELECT
        period.period_key AS periodKey,
        COALESCE(SUM(CAST(eligible.checkout_amount_jpy AS DECIMAL(65, 0))), 0)
          AS grossRevenueJpy,
        COALESCE(SUM(CAST(eligible.discount_amount_jpy AS DECIMAL(65, 0))), 0)
          AS discountAmountJpy,
        COALESCE(SUM(CAST(eligible.travel_fare_amount_jpy AS DECIMAL(65, 0))), 0)
          AS travelFareJpy
      FROM periods AS period
      LEFT JOIN eligible_checkout AS eligible
        ON eligible.period_key = period.period_key
      GROUP BY period.period_key
    `);
  }

  private toSafeAggregate(value: NumericValue): number {
    if (value === null || value === undefined) throw new RangeError(aggregateError);
    if (typeof value === "bigint") {
      if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new RangeError(aggregateError);
      }
      return Number(value);
    }
    if (typeof value === "number") {
      if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(aggregateError);
      return value;
    }

    const serialized = typeof value === "string" ? value : value.toString();
    if (!/^(0|[1-9]\d*)$/u.test(serialized)) throw new RangeError(aggregateError);
    const parsed = Number(serialized);
    if (!Number.isSafeInteger(parsed) || parsed < 0) throw new RangeError(aggregateError);
    return parsed;
  }
}
