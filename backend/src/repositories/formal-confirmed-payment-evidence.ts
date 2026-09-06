import { Prisma } from "@prisma/client";

/**
 * Authoritative formal evidence that a checkout payment was confirmed.
 *
 * Callers own time, geography, and currency projection. This predicate deliberately
 * does not depend on OrderFinancial because that projection is optional for manual
 * cash/other receipts.
 */
export const formalConfirmedPaymentEvidence = (): Prisma.Sql => Prisma.sql`
  /* formal_confirmed_payment_evidence */
  booking.status = ${"completed"}
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
  AND checkout.base_amount_jpy + checkout.add_on_amount_jpy
    + checkout.travel_fare_amount_jpy - checkout.discount_amount_jpy
    = checkout.checkout_amount_jpy
  AND checkout.payment_method = booking.payment_method
  AND checkout.payment_selected_at IS NOT NULL
  AND checkout.payment_selected_at <= booking.payment_confirmed_at
  AND (
    (
      checkout.payment_method = ${"ndp"}
      AND checkout.ledger_transaction_id IS NOT NULL
      AND ledger.id = checkout.ledger_transaction_id
      AND ledger.type = ${"booking_complete_settlement"}
      AND ledger.status = ${"applied"}
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
`;
