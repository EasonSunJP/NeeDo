import { Prisma, type PrismaClient } from "@prisma/client";
import type { DashboardAggregateInput, DashboardMembershipFacts } from "../domain/dashboard";

type DashboardQueryClient = Pick<PrismaClient, "$queryRaw">;
type NumericValue = bigint | number | string | { toString: () => string } | null | undefined;

interface MembershipAggregateRow {
  memberCount?: NumericValue;
  member_count?: NumericValue;
  completedCustomerCount?: NumericValue;
  completed_customer_count?: NumericValue;
}

export interface DashboardMembershipReader {
  getMembershipFacts(input: DashboardAggregateInput): Promise<DashboardMembershipFacts>;
}

const aggregateError = "Dashboard membership aggregate must be a non-negative safe integer";

export class DashboardMembershipRepository implements DashboardMembershipReader {
  public constructor(private readonly client: DashboardQueryClient) {}

  public async getMembershipFacts(
    input: DashboardAggregateInput
  ): Promise<DashboardMembershipFacts> {
    if (input.scope.kind !== "shop") throw new RangeError(aggregateError);
    const evaluatedAt = input.evaluatedAt ?? new Date();
    const rows = await this.queryMembershipFacts(input, input.scope.shopId, evaluatedAt);
    if (rows.length !== 1) throw new RangeError(aggregateError);
    const row = rows[0];
    return {
      memberCount: this.toSafeAggregate(row?.memberCount ?? row?.member_count),
      completedCustomerCount: this.toSafeAggregate(
        row?.completedCustomerCount ?? row?.completed_customer_count
      )
    };
  }

  private queryMembershipFacts(
    input: DashboardAggregateInput,
    shopId: number,
    evaluatedAt: Date
  ): Promise<MembershipAggregateRow[]> {
    return this.client.$queryRaw<MembershipAggregateRow[]>(Prisma.sql`
      /* dashboard_membership_facts */
      SELECT
        (
          SELECT COUNT(DISTINCT customer.user_id)
          FROM shop_customer_memberships AS membership
          INNER JOIN shops AS membership_shop
            ON membership.shop_id = membership_shop.id
            AND membership_shop.deleted_at IS NULL
          INNER JOIN customer_profiles AS customer
            ON membership.customer_profile_id = customer.id
            AND customer.deleted_at IS NULL
          INNER JOIN users AS user
            ON customer.user_id = user.id
            AND user.deleted_at IS NULL
            AND user.is_active = ${true}
            AND user.is_test_account = ${false}
          INNER JOIN shop_membership_cards AS card
            ON card.membership_id = membership.id
            AND card.deleted_at IS NULL
            AND card.status = ${"active"}
            AND card.issued_at <= ${evaluatedAt}
            AND (card.expires_at IS NULL OR card.expires_at > ${evaluatedAt})
          WHERE membership.shop_id = ${shopId}
            AND membership.deleted_at IS NULL
            AND membership.status = ${"active"}
            AND membership.started_at <= ${evaluatedAt}
            AND (membership.ended_at IS NULL OR membership.ended_at > ${evaluatedAt})
        ) AS memberCount,
        (
          SELECT COUNT(DISTINCT booking.customer_user_id)
          FROM booking_orders AS booking
          INNER JOIN users AS utilizer
            ON booking.customer_user_id = utilizer.id
            AND utilizer.deleted_at IS NULL
            AND utilizer.is_active = ${true}
            AND utilizer.is_test_account = ${false}
          INNER JOIN shops AS shop
            ON booking.shop_id = shop.id
            AND shop.deleted_at IS NULL
          INNER JOIN order_checkouts AS checkout
            ON checkout.booking_order_id = booking.id
            AND checkout.deleted_at IS NULL
          LEFT JOIN ledger_transactions AS ledger
            ON ledger.id = checkout.ledger_transaction_id
          WHERE booking.shop_id = ${shopId}
            AND booking.deleted_at IS NULL
            AND booking.status = ${"completed"}
            AND booking.payment_status = ${"confirmed"}
            AND booking.payment_confirmed_by_id IS NOT NULL
            AND booking.payment_confirmed_at >= ${input.window.fromInclusive}
            AND booking.payment_confirmed_at < ${input.window.toExclusive}
            AND booking.payment_refunded_at IS NULL
            AND booking.payment_refunded_by_id IS NULL
            AND booking.payment_refund_reference IS NULL
            AND booking.payment_refund_reason IS NULL
            AND booking.payment_amount_jpy = checkout.checkout_amount_jpy
            AND checkout.base_amount_jpy >= 0
            AND checkout.add_on_amount_jpy >= 0
            AND checkout.discount_amount_jpy >= 0
            AND checkout.checkout_amount_jpy >= 0
            AND checkout.payable_ndp >= 0
            AND checkout.base_amount_jpy + checkout.add_on_amount_jpy - checkout.discount_amount_jpy
              = checkout.checkout_amount_jpy
            AND checkout.payment_method = booking.payment_method
            AND checkout.payment_selected_at IS NOT NULL
            AND checkout.payment_selected_at <= booking.payment_confirmed_at
            AND (
              (
                checkout.payment_method = ${"ndp"}
                AND checkout.ledger_transaction_id IS NOT NULL
                AND ledger.id = checkout.ledger_transaction_id
                AND ledger.status = ${"applied"}
                AND ledger.type = ${"booking_complete_settlement"}
                AND ledger.currency = ${"NDP"}
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
                AND checkout.receipt_confirmation_reason IS NULL
              )
              OR
              (
                checkout.payment_method IN (${"cash"}, ${"other"})
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
                  CONCAT(${"checkout:"}, checkout.id, ${":merchant-receipt"}),
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
                )
              )
            )
        ) AS completedCustomerCount
    `);
  }

  private toSafeAggregate(value: NumericValue): number {
    if (value === null || value === undefined) throw new RangeError(aggregateError);
    if (typeof value === "bigint") {
      if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER))
        throw new RangeError(aggregateError);
      return Number(value);
    }
    if (typeof value === "number") {
      if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(aggregateError);
      return value;
    }
    const serialized = typeof value === "string" ? value : value.toString();
    if (!/^(0|[1-9]\d*)$/u.test(serialized)) throw new RangeError(aggregateError);
    const parsed = Number(serialized);
    if (!Number.isSafeInteger(parsed)) throw new RangeError(aggregateError);
    return parsed;
  }
}
