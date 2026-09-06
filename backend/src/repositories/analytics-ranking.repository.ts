import { Prisma, type PrismaClient } from "@prisma/client";
import {
  AnalyticsRankingIncompleteEvidenceError,
  MAX_ANALYTICS_RANKING_PAGE,
  type AnalyticsRankingInput,
  type AnalyticsRankingDataComposition,
  type AnalyticsRankingItem,
  type AnalyticsRankingPage,
  type RankingEntityType
} from "../domain/analytics-ranking";

type AnalyticsRankingQueryClient = Pick<PrismaClient, "$queryRaw" | "category">;
type AnalyticsRankingClient = AnalyticsRankingQueryClient &
  Partial<Pick<PrismaClient, "$transaction">>;
type NumericValue = bigint | number | string | { toString(): string } | null | undefined;
interface AnomalyRow {
  anomalyCount?: NumericValue;
  anomaly_count?: NumericValue;
}
interface CountRow {
  total?: NumericValue;
}
interface RankingRow {
  rank?: NumericValue;
  rankingPosition?: NumericValue;
  ranking_position?: NumericValue;
  entityType?: unknown;
  entity_type?: unknown;
  entityPublicId?: unknown;
  entity_public_id?: unknown;
  entityNumericId?: NumericValue;
  entity_numeric_id?: NumericValue;
  displayName?: unknown;
  display_name?: unknown;
  avatarUrl?: unknown;
  avatar_url?: unknown;
  categoryId?: NumericValue;
  category_id?: NumericValue;
  gmvJpy?: NumericValue;
  gmv_jpy?: NumericValue;
  completedCount?: NumericValue;
  completed_count?: NumericValue;
  testGmvJpy?: NumericValue;
  test_gmv_jpy?: NumericValue;
  testCompletedCount?: NumericValue;
  test_completed_count?: NumericValue;
  dataComposition?: unknown;
  data_composition?: unknown;
  registeredAt?: unknown;
  registered_at?: unknown;
}

export interface AnalyticsRankingRepositoryPort {
  findActiveCategoryById(categoryId: number): Promise<{ id: number } | null>;
  listRankings(input: AnalyticsRankingInput): Promise<AnalyticsRankingPage>;
}

export interface AnalyticsRankingEvidenceScope {
  candidateJoins: Prisma.Sql;
  candidatePredicate: Prisma.Sql;
  entityPredicate?: Prisma.Sql;
}

const entityTypes = new Set<RankingEntityType>([
  "service",
  "technician_service",
  "technician",
  "customer"
]);
const dataCompositions = new Set<AnalyticsRankingDataComposition>(["formal", "test", "mixed"]);

export class AnalyticsRankingRepository implements AnalyticsRankingRepositoryPort {
  public constructor(private readonly client: AnalyticsRankingClient) {}

  public findActiveCategoryById(categoryId: number): Promise<{ id: number } | null> {
    return this.client.category.findFirst({
      where: { id: categoryId, isActive: true, deletedAt: null },
      select: { id: true }
    });
  }

  public async listRankings(input: AnalyticsRankingInput): Promise<AnalyticsRankingPage> {
    const offset = this.assertPagination(input.page, input.pageSize);
    if (typeof this.client.$transaction === "function") {
      return this.client.$transaction(
        (transaction) => this.listRankingsInSnapshot(transaction, input, offset),
        { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
      );
    }
    return this.listRankingsInSnapshot(this.client, input, offset);
  }

  private async listRankingsInSnapshot(
    client: AnalyticsRankingQueryClient,
    input: AnalyticsRankingInput,
    offset: number
  ): Promise<AnalyticsRankingPage> {
    const anomalyRows = await client.$queryRaw<AnomalyRow[]>(Prisma.sql`
      /* analytics_ranking_evidence_validation */
      WITH ${AnalyticsRankingRepository.formalRankingCtes(input)}
      SELECT COALESCE(SUM(incomplete_evidence), 0) AS anomalyCount
      FROM formal_order_evidence
      WHERE entity_eligible = 1
    `);
    if (
      anomalyRows.length !== 1 ||
      this.safeInteger(anomalyRows[0]?.anomalyCount ?? anomalyRows[0]?.anomaly_count) !== 0
    )
      this.incomplete();

    const countRows = await client.$queryRaw<CountRow[]>(Prisma.sql`
      /* analytics_ranking_count */
      WITH ${AnalyticsRankingRepository.formalRankingCtes(input)}, ${AnalyticsRankingRepository.rankingCtes(input)}
      SELECT COUNT(*) AS total FROM ranked_entities
    `);
    if (countRows.length !== 1) this.incomplete();
    const total = this.safeInteger(countRows[0]?.total);
    if (total === 0) return { list: [], total, page: input.page, page_size: input.pageSize };

    const rows = await client.$queryRaw<RankingRow[]>(Prisma.sql`
      /* analytics_ranking_page */
      WITH ${AnalyticsRankingRepository.formalRankingCtes(input)}, ${AnalyticsRankingRepository.rankingCtes(input)}
      SELECT ranking_position AS rankingPosition,
             entity_type AS entityType, entity_public_id AS entityPublicId,
             entity_numeric_id AS entityNumericId, display_name AS displayName,
             avatar_url AS avatarUrl, category_id AS categoryId, gmv_jpy AS gmvJpy,
             completed_count AS completedCount, test_gmv_jpy AS testGmvJpy,
             test_completed_count AS testCompletedCount,
             data_composition AS dataComposition, registered_at AS registeredAt
      FROM ranked_entities
      WHERE ranking_position > ${offset} AND ranking_position <= ${offset + input.pageSize}
      ORDER BY ranking_position ASC
    `);
    const expected = Math.max(0, Math.min(input.pageSize, total - offset));
    if (rows.length !== expected) this.incomplete();
    const list = rows.map((row) => this.mapRow(row));
    const keys = new Set(list.map((item) => `${item.entityType}\u0000${item.entityNumericId}`));
    if (keys.size !== list.length) this.incomplete();
    return { list, total, page: input.page, page_size: input.pageSize };
  }

  public static formalRankingCtes(
    input: AnalyticsRankingInput,
    evidenceScope?: AnalyticsRankingEvidenceScope
  ): Prisma.Sql {
    const city =
      input.city === null ? Prisma.sql`TRUE` : Prisma.sql`BINARY shop.city = BINARY ${input.city}`;
    const catalogRequired = input.kind === "service" || input.categoryId !== null;
    return Prisma.sql`
      ranking_request AS (
        SELECT ${input.kind} AS ranking_kind, ${input.metric} AS selected_metric,
               ${input.categoryId} AS requested_category_id, ${input.evaluatedAt} AS evaluated_at
      ),
      ranking_candidate_orders AS (
        SELECT booking.*, shop.city AS current_shop_city,
               checkout.id AS checkout_id, checkout.base_amount_jpy,
               checkout.add_on_amount_jpy, checkout.discount_amount_jpy,
               checkout.checkout_amount_jpy, checkout.payable_ndp,
               checkout.payment_method AS checkout_payment_method,
               checkout.payment_selected_at, checkout.other_method_code,
               checkout.other_method_label, checkout.other_payment_reference,
               checkout.ledger_transaction_id, checkout.receipt_confirmed_by_id,
               checkout.receipt_confirmed_at, checkout.receipt_confirmation_reason,
               checkout.calculation_snapshot_json, session.id AS session_id,
               session.ended_at AS session_ended_at,
               customer.id AS resolved_customer_id, customer.needo_id AS customer_needo_id,
               customer.username AS customer_username, customer.avatar_url AS customer_avatar_url,
               customer.created_at AS customer_created_at,
               customer.is_active AS customer_is_active,
               customer.is_test_account AS customer_is_test,
               customer.deleted_at AS customer_deleted_at,
               customer_profile.display_name AS customer_display_name,
               customer_profile.deleted_at AS customer_profile_deleted_at,
               technician.id AS resolved_technician_id,
               technician.user_id AS technician_user_id,
               technician.display_name AS technician_display_name,
               technician.created_at AS technician_created_at,
               technician.deleted_at AS technician_deleted_at,
               technician_user.id AS resolved_technician_user_id,
               technician_user.needo_id AS technician_needo_id,
               technician_user.avatar_url AS technician_avatar_url,
               technician_user.is_active AS technician_user_is_active,
               technician_user.is_test_account AS technician_user_is_test,
               technician_user.deleted_at AS technician_user_deleted_at
        FROM booking_orders AS booking
        LEFT JOIN shops AS shop ON shop.id = booking.shop_id AND shop.deleted_at IS NULL
        ${evidenceScope?.candidateJoins ?? Prisma.empty}
        LEFT JOIN order_checkouts AS checkout
          ON checkout.booking_order_id = booking.id AND checkout.deleted_at IS NULL
        LEFT JOIN order_service_sessions AS session
          ON session.booking_order_id = booking.id AND session.deleted_at IS NULL
        LEFT JOIN users AS customer ON customer.id = booking.customer_user_id
        LEFT JOIN customer_profiles AS customer_profile
          ON customer_profile.user_id = customer.id AND customer_profile.deleted_at IS NULL
        LEFT JOIN technician_profiles AS technician
          ON technician.id = booking.technician_profile_id
        LEFT JOIN users AS technician_user ON technician_user.id = technician.user_id
        WHERE booking.status = ${"completed"}
          AND booking.payment_status = ${"confirmed"}
          AND booking.deleted_at IS NULL
          AND booking.payment_confirmed_at >= ${input.window.fromInclusive}
          AND booking.payment_confirmed_at < ${input.window.toExclusive}
          AND booking.payment_confirmed_at <= ${input.evaluatedAt}
          AND ${city}
          ${evidenceScope ? Prisma.sql`AND ${evidenceScope.candidatePredicate}` : Prisma.empty}
      ),
      accepted_add_on_projection AS (
        SELECT add_on.booking_order_id,
               COUNT(*) AS accepted_count,
               COALESCE(SUM(add_on.price_amount_jpy), 0) AS accepted_amount,
               CONCAT('[', GROUP_CONCAT(add_on.id ORDER BY add_on.proposed_at ASC, add_on.id ASC), ']') AS accepted_ids_json,
               SUM(add_on.price_amount_jpy < 0) AS negative_amount_count,
               SUM(BINARY add_on.currency <> BINARY ${"JPY"}) AS non_jpy_count,
               SUM(service.id IS NULL) AS missing_service_count,
               SUM(COALESCE(NOT (
                 JSON_TYPE(add_on.service_snapshot_json) = ${"OBJECT"}
                 AND add_on.service_name_snapshot = TRIM(add_on.service_name_snapshot)
                 AND CHAR_LENGTH(add_on.service_name_snapshot) > 0
                 AND JSON_UNQUOTE(JSON_EXTRACT(add_on.service_snapshot_json, ${"$.entityType"})) = ${"service"}
                 AND JSON_TYPE(JSON_EXTRACT(add_on.service_snapshot_json, ${"$.entityNumericId"})) = ${"INTEGER"}
                 AND CAST(JSON_UNQUOTE(JSON_EXTRACT(add_on.service_snapshot_json, ${"$.entityNumericId"})) AS UNSIGNED) = add_on.service_id
                 AND JSON_TYPE(JSON_EXTRACT(add_on.service_snapshot_json, ${"$.publicId"})) = ${"STRING"}
                 AND JSON_UNQUOTE(JSON_EXTRACT(add_on.service_snapshot_json, ${"$.publicId"})) = service.public_id
                 AND JSON_TYPE(JSON_EXTRACT(add_on.service_snapshot_json, ${"$.categoryId"})) = ${"INTEGER"}
                 AND CAST(JSON_UNQUOTE(JSON_EXTRACT(add_on.service_snapshot_json, ${"$.categoryId"})) AS UNSIGNED) > 0
               ), TRUE)) AS invalid_snapshot_count
        FROM order_add_ons AS add_on
        JOIN ranking_candidate_orders AS candidate_add_on
          ON candidate_add_on.id = add_on.booking_order_id
        LEFT JOIN services AS service ON service.id = add_on.service_id
        WHERE add_on.status = ${"accepted"} AND add_on.deleted_at IS NULL
        GROUP BY add_on.booking_order_id
      ),
      formal_order_evidence AS (
        SELECT candidate.*,
          CASE WHEN COALESCE((
            candidate.checkout_id IS NULL OR candidate.session_id IS NULL
            OR candidate.session_ended_at IS NULL
            OR candidate.session_ended_at > candidate.payment_confirmed_at
            OR candidate.payment_confirmed_by_id IS NULL OR candidate.payment_confirmed_at IS NULL
            OR candidate.payment_refunded_at IS NOT NULL
            OR candidate.payment_refunded_by_id IS NOT NULL
            OR candidate.payment_refund_reference IS NOT NULL
            OR candidate.payment_refund_reason IS NOT NULL
            OR candidate.shop_id IS NULL OR candidate.current_shop_city IS NULL
            OR candidate.resolved_customer_id IS NULL
            OR candidate.resolved_technician_id IS NULL
            OR candidate.resolved_technician_user_id IS NULL
            OR candidate.technician_user_id <> candidate.resolved_technician_user_id
            OR candidate.base_amount_jpy < 0 OR candidate.add_on_amount_jpy < 0
            OR candidate.discount_amount_jpy < 0 OR candidate.checkout_amount_jpy < 0
            OR candidate.payable_ndp < 0
            OR candidate.base_amount_jpy < candidate.discount_amount_jpy
            OR candidate.base_amount_jpy + candidate.add_on_amount_jpy - candidate.discount_amount_jpy
                 <> candidate.checkout_amount_jpy
            OR candidate.checkout_amount_jpy <> candidate.payment_amount_jpy
            OR (candidate.service_id IS NULL) = (candidate.technician_service_id IS NULL)
            OR candidate.service_name_snapshot IS NULL
            OR candidate.service_name_snapshot <> TRIM(candidate.service_name_snapshot)
            OR CHAR_LENGTH(candidate.service_name_snapshot) = 0
            OR JSON_TYPE(candidate.service_snapshot_json) <> ${"OBJECT"}
            OR JSON_TYPE(JSON_EXTRACT(candidate.service_snapshot_json, ${"$.entityNumericId"})) <> ${"INTEGER"}
            OR CAST(JSON_UNQUOTE(JSON_EXTRACT(candidate.service_snapshot_json, ${"$.entityNumericId"})) AS UNSIGNED)
                 <> COALESCE(candidate.service_id, candidate.technician_service_id)
            OR JSON_TYPE(JSON_EXTRACT(candidate.service_snapshot_json, ${"$.publicId"})) <> ${"STRING"}
            OR JSON_TYPE(JSON_EXTRACT(candidate.service_snapshot_json, ${"$.categoryId"})) <> ${"INTEGER"}
            OR CAST(JSON_UNQUOTE(JSON_EXTRACT(candidate.service_snapshot_json, ${"$.categoryId"})) AS UNSIGNED) <= 0
            OR (candidate.service_id IS NOT NULL AND (
                 JSON_UNQUOTE(JSON_EXTRACT(candidate.service_snapshot_json, ${"$.entityType"})) <> ${"service"}
                 OR JSON_UNQUOTE(JSON_EXTRACT(candidate.service_snapshot_json, ${"$.publicId"})) <>
                    (SELECT base_service.public_id FROM services AS base_service
                     WHERE base_service.id = candidate.service_id)
               ))
            OR (candidate.technician_service_id IS NOT NULL AND (
                 JSON_UNQUOTE(JSON_EXTRACT(candidate.service_snapshot_json, ${"$.entityType"})) <> ${"technician_service"}
                 OR JSON_UNQUOTE(JSON_EXTRACT(candidate.service_snapshot_json, ${"$.publicId"})) <>
                    (SELECT base_service.public_id FROM technician_services AS base_service
                     WHERE base_service.id = candidate.technician_service_id)
               ))
            OR BINARY candidate.currency <> BINARY ${"JPY"}
            OR candidate.payment_method <> candidate.checkout_payment_method
            OR candidate.checkout_payment_method IS NULL OR candidate.payment_selected_at IS NULL
            OR candidate.payment_selected_at > candidate.payment_confirmed_at
            OR JSON_EXTRACT(candidate.calculation_snapshot_json, ${"$.formula"}) IS NULL
            OR JSON_EXTRACT(candidate.calculation_snapshot_json, ${"$.baseAmountJpy"}) IS NULL
            OR JSON_EXTRACT(candidate.calculation_snapshot_json, ${"$.addOnAmountJpy"}) IS NULL
            OR JSON_EXTRACT(candidate.calculation_snapshot_json, ${"$.discountAmountJpy"}) IS NULL
            OR JSON_EXTRACT(candidate.calculation_snapshot_json, ${"$.checkoutAmountJpy"}) IS NULL
            OR JSON_TYPE(JSON_EXTRACT(candidate.calculation_snapshot_json, ${"$.baseAmountJpy"})) <> ${"INTEGER"}
            OR JSON_TYPE(JSON_EXTRACT(candidate.calculation_snapshot_json, ${"$.addOnAmountJpy"})) <> ${"INTEGER"}
            OR JSON_TYPE(JSON_EXTRACT(candidate.calculation_snapshot_json, ${"$.discountAmountJpy"})) <> ${"INTEGER"}
            OR JSON_TYPE(JSON_EXTRACT(candidate.calculation_snapshot_json, ${"$.checkoutAmountJpy"})) <> ${"INTEGER"}
            OR JSON_EXTRACT(candidate.calculation_snapshot_json, ${"$.acceptedAddOnIds"}) IS NULL
            OR JSON_TYPE(JSON_EXTRACT(candidate.calculation_snapshot_json, ${"$.acceptedAddOnIds"})) <> ${"ARRAY"}
            OR JSON_UNQUOTE(JSON_EXTRACT(candidate.calculation_snapshot_json, ${"$.formula"}))
                 <> ${"base_plus_accepted_add_ons_minus_discount"}
            OR CAST(JSON_UNQUOTE(JSON_EXTRACT(candidate.calculation_snapshot_json, ${"$.baseAmountJpy"})) AS SIGNED)
                 <> candidate.base_amount_jpy
            OR CAST(JSON_UNQUOTE(JSON_EXTRACT(candidate.calculation_snapshot_json, ${"$.addOnAmountJpy"})) AS SIGNED)
                 <> candidate.add_on_amount_jpy
            OR CAST(JSON_UNQUOTE(JSON_EXTRACT(candidate.calculation_snapshot_json, ${"$.discountAmountJpy"})) AS SIGNED)
                 <> candidate.discount_amount_jpy
            OR CAST(JSON_UNQUOTE(JSON_EXTRACT(candidate.calculation_snapshot_json, ${"$.checkoutAmountJpy"})) AS SIGNED)
                 <> candidate.checkout_amount_jpy
            OR COALESCE(add_ons.accepted_amount, 0) <> candidate.add_on_amount_jpy
            OR COALESCE(add_ons.negative_amount_count, 0) <> 0
            OR COALESCE(add_ons.non_jpy_count, 0) <> 0
            OR JSON_EXTRACT(candidate.calculation_snapshot_json, ${"$.acceptedAddOnIds"})
                 <> CAST(COALESCE(add_ons.accepted_ids_json, '[]') AS JSON)
            OR (${catalogRequired} AND COALESCE(add_ons.missing_service_count, 0) <> 0)
            OR COALESCE(add_ons.invalid_snapshot_count, 0) <> 0
            OR (${catalogRequired} AND candidate.service_id IS NOT NULL
                AND (SELECT COUNT(*) FROM services AS base_service
                     WHERE base_service.id = candidate.service_id) <> 1)
            OR (${catalogRequired} AND candidate.technician_service_id IS NOT NULL
                AND (SELECT COUNT(*) FROM technician_services AS base_service
                     WHERE base_service.id = candidate.technician_service_id) <> 1)
            OR (${catalogRequired} AND candidate.service_id IS NOT NULL
                AND (SELECT COUNT(*) FROM services AS base_service
                     JOIN categories AS base_category ON base_category.id = base_service.category_id
                     WHERE base_service.id = candidate.service_id) <> 1)
            OR (${catalogRequired} AND candidate.technician_service_id IS NOT NULL
                AND (SELECT COUNT(*) FROM technician_services AS base_service
                     JOIN categories AS base_category ON base_category.id = base_service.category_id
                     WHERE base_service.id = candidate.technician_service_id) <> 1)
            OR COALESCE(NOT (${AnalyticsRankingRepository.paymentEvidencePredicate()}), TRUE)
          ), TRUE)
          THEN 1 ELSE 0 END AS incomplete_evidence,
          CASE WHEN candidate.customer_is_active = TRUE
                     AND candidate.customer_deleted_at IS NULL
                     AND candidate.technician_deleted_at IS NULL
                     AND candidate.technician_user_is_active = TRUE
                     AND candidate.technician_user_deleted_at IS NULL
                     AND (${evidenceScope?.entityPredicate ?? Prisma.sql`TRUE`})
               THEN 1 ELSE 0 END AS entity_eligible,
          CASE WHEN candidate.customer_is_test = TRUE OR candidate.technician_user_is_test = TRUE
               THEN 1 ELSE 0 END AS is_test_order
        FROM ranking_candidate_orders AS candidate
        LEFT JOIN accepted_add_on_projection AS add_ons
          ON add_ons.booking_order_id = candidate.id
      )
    `;
  }

  private static paymentEvidencePredicate(): Prisma.Sql {
    const selectionLink = Prisma.sql`
      event.booking_order_id = candidate.id
      AND event.service_session_id = candidate.session_id
      AND event.order_checkout_id = candidate.checkout_id
      AND event.order_add_on_id IS NULL
      AND event.actor_user_id = candidate.customer_user_id
      AND event.reason IS NULL
      AND event.occurred_at = candidate.payment_selected_at
      AND event.occurred_at <= candidate.payment_confirmed_at
      AND event.deleted_at IS NULL
    `;
    return Prisma.sql`
      (
        candidate.checkout_payment_method = ${"ndp"}
        AND candidate.other_method_code IS NULL AND candidate.other_method_label IS NULL
        AND candidate.other_payment_reference IS NULL
        AND candidate.receipt_confirmed_by_id IS NULL AND candidate.receipt_confirmed_at IS NULL
        AND candidate.receipt_confirmation_reason IS NULL AND candidate.payment_note IS NULL
        AND (SELECT COUNT(*) FROM ledger_transactions AS ledger
             WHERE ledger.id = candidate.ledger_transaction_id
               AND ledger.type = ${"booking_complete_settlement"}
               AND ledger.status = ${"applied"}
               AND BINARY ledger.currency = BINARY CASE
                 WHEN candidate.customer_is_test = TRUE OR candidate.technician_user_is_test = TRUE
                 THEN ${"TEST_NDP"} ELSE ${"NDP"}
               END
               AND ledger.reference_type = ${"order_checkout_payment"}
               AND ledger.reference_id = candidate.checkout_id
               AND ledger.amount = candidate.payable_ndp
               AND ledger.actor_user_id = candidate.payment_confirmed_by_id
               AND ledger.created_at >= CASE
                 WHEN candidate.payment_selected_at = candidate.payment_confirmed_at
                   AND (SELECT COUNT(*) FROM order_service_events AS direct_event
                        WHERE direct_event.event_type = ${"payment_method_selected"}
                          AND direct_event.booking_order_id = candidate.id
                          AND direct_event.deleted_at IS NULL) = 0
                 THEN candidate.session_ended_at
                 ELSE candidate.payment_selected_at
               END
               AND ledger.created_at <= candidate.payment_confirmed_at
               AND ledger.deleted_at IS NULL) = 1
        AND candidate.payment_reference = CONCAT('checkout:', candidate.checkout_id,
             ':ledger:', candidate.ledger_transaction_id)
        AND (
          ((SELECT COUNT(*) FROM order_service_events AS event
            WHERE event.event_type = ${"payment_method_selected"} AND ${selectionLink}
              AND JSON_LENGTH(event.metadata) = 1
              AND JSON_UNQUOTE(JSON_EXTRACT(event.metadata, ${"$.method"})) = ${"ndp"}) = 1
           AND (SELECT COUNT(*) FROM order_service_events AS event
                WHERE event.event_type = ${"payment_method_selected"}
                  AND event.booking_order_id = candidate.id AND event.deleted_at IS NULL) = 1)
          OR
          (candidate.payment_selected_at = candidate.payment_confirmed_at
           AND (SELECT COUNT(*) FROM order_service_events AS event
                WHERE event.event_type = ${"payment_method_selected"} AND ${selectionLink}
                  AND JSON_LENGTH(event.metadata) = 1
                  AND JSON_UNQUOTE(JSON_EXTRACT(event.metadata, ${"$.method"})) = ${"ndp"}) = 0
           AND (SELECT COUNT(*) FROM order_service_events AS event
                WHERE event.event_type = ${"payment_method_selected"}
                  AND event.booking_order_id = candidate.id AND event.deleted_at IS NULL) = 0)
        )
        AND (SELECT COUNT(*) FROM order_service_events AS event
             WHERE event.event_type = ${"ndp_payment_applied"}
               AND event.booking_order_id = candidate.id
               AND event.service_session_id = candidate.session_id
               AND event.order_checkout_id = candidate.checkout_id
               AND event.order_add_on_id IS NULL
               AND event.actor_user_id = candidate.payment_confirmed_by_id
               AND event.reason = ${"checkout_ndp_payment_applied"}
               AND event.occurred_at >= candidate.payment_selected_at
               AND event.occurred_at <= candidate.payment_confirmed_at
               AND event.deleted_at IS NULL
               AND JSON_LENGTH(event.metadata) = 2
               AND JSON_TYPE(JSON_EXTRACT(event.metadata, ${"$.ledgerTransactionId"})) = ${"INTEGER"}
               AND JSON_UNQUOTE(JSON_EXTRACT(event.metadata, ${"$.paymentEvidence"})) = ${"ndp_ledger"}
               AND CAST(JSON_UNQUOTE(JSON_EXTRACT(event.metadata, ${"$.ledgerTransactionId"})) AS UNSIGNED)
                   = candidate.ledger_transaction_id) = 1
        AND (SELECT COUNT(*) FROM order_service_events AS event
             WHERE event.event_type = ${"ndp_payment_applied"}
               AND event.booking_order_id = candidate.id AND event.deleted_at IS NULL) = 1
        AND (SELECT COUNT(*) FROM ledger_transactions AS ledger
             WHERE ledger.reference_type = ${"order_checkout_payment"}
               AND ledger.reference_id = candidate.checkout_id
               AND ledger.deleted_at IS NULL) = 1
      ) OR (
        candidate.checkout_payment_method IN (${"cash"}, ${"other"})
        AND candidate.ledger_transaction_id IS NULL
        AND candidate.receipt_confirmed_by_id IS NOT NULL
        AND candidate.receipt_confirmed_at >= candidate.payment_selected_at
        AND candidate.receipt_confirmed_at <= candidate.payment_confirmed_at
        AND CHAR_LENGTH(TRIM(candidate.receipt_confirmation_reason)) > 0
        AND candidate.receipt_confirmation_reason = TRIM(candidate.receipt_confirmation_reason)
        AND candidate.payment_confirmed_by_id = candidate.receipt_confirmed_by_id
        AND candidate.payment_note = candidate.receipt_confirmation_reason
        AND candidate.other_payment_reference IS NULL
        AND ((candidate.checkout_payment_method = ${"cash"}
              AND candidate.other_method_code IS NULL AND candidate.other_method_label IS NULL)
             OR (candidate.checkout_payment_method = ${"other"}
              AND CHAR_LENGTH(TRIM(candidate.other_method_code)) BETWEEN 1 AND 40
              AND candidate.other_method_code = TRIM(candidate.other_method_code)
              AND CHAR_LENGTH(TRIM(candidate.other_method_label)) BETWEEN 1 AND 80
              AND candidate.other_method_label = TRIM(candidate.other_method_label)))
        AND (SELECT COUNT(*) FROM order_service_events AS event
             WHERE event.event_type = ${"payment_method_selected"} AND ${selectionLink}
               AND ((candidate.checkout_payment_method = ${"cash"}
                    AND JSON_LENGTH(event.metadata) = 1
                    AND JSON_UNQUOTE(JSON_EXTRACT(event.metadata, ${"$.method"})) = ${"cash"})
                 OR (candidate.checkout_payment_method = ${"other"}
                    AND JSON_LENGTH(event.metadata) = 3
                    AND JSON_UNQUOTE(JSON_EXTRACT(event.metadata, ${"$.method"})) = ${"other"}
                    AND JSON_UNQUOTE(JSON_EXTRACT(event.metadata, ${"$.otherMethodCode"})) = candidate.other_method_code
                        AND JSON_UNQUOTE(JSON_EXTRACT(event.metadata, ${"$.otherMethodLabel"})) = candidate.other_method_label))) = 1
        AND (SELECT COUNT(*) FROM order_service_events AS event
             WHERE event.event_type = ${"payment_method_selected"}
               AND event.booking_order_id = candidate.id AND event.deleted_at IS NULL) = 1
        AND (SELECT COUNT(*) FROM order_service_events AS event
             WHERE event.event_type = ${"receipt_confirmed"}
               AND event.booking_order_id = candidate.id
               AND event.service_session_id = candidate.session_id
               AND event.order_checkout_id = candidate.checkout_id
               AND event.order_add_on_id IS NULL
               AND event.actor_user_id = candidate.receipt_confirmed_by_id
               AND event.reason = candidate.receipt_confirmation_reason
               AND event.occurred_at >= candidate.payment_selected_at
               AND event.occurred_at <= candidate.payment_confirmed_at
               AND event.deleted_at IS NULL
               AND JSON_LENGTH(event.metadata) = 2
               AND JSON_UNQUOTE(JSON_EXTRACT(event.metadata, ${"$.reason"})) = candidate.receipt_confirmation_reason
               AND ((candidate.payment_reference = CONCAT('checkout:', candidate.checkout_id, ':technician-receipt')
                     AND JSON_UNQUOTE(JSON_EXTRACT(event.metadata, ${"$.paymentEvidence"})) = ${"technician_receipt_confirmation"})
                 OR (candidate.payment_reference = CONCAT('checkout:', candidate.checkout_id, ':operations-receipt')
                     AND JSON_UNQUOTE(JSON_EXTRACT(event.metadata, ${"$.paymentEvidence"})) = ${"operations_receipt_override"}))) = 1
        AND (SELECT COUNT(*) FROM order_service_events AS event
             WHERE event.event_type = ${"receipt_confirmed"}
               AND event.booking_order_id = candidate.id AND event.deleted_at IS NULL) = 1
        AND (SELECT COUNT(*) FROM ledger_transactions AS ledger
             WHERE ledger.reference_type = ${"order_checkout_payment"}
               AND ledger.reference_id = candidate.checkout_id
               AND ledger.deleted_at IS NULL) = 0
        AND (
          (candidate.payment_reference = CONCAT('checkout:', candidate.checkout_id, ':technician-receipt')
           AND candidate.receipt_confirmed_by_id = candidate.technician_user_id)
          OR
          (candidate.payment_reference = CONCAT('checkout:', candidate.checkout_id, ':operations-receipt')
           AND (SELECT COUNT(*) FROM audit_logs AS audit
                WHERE audit.actor_id = candidate.receipt_confirmed_by_id
                  AND audit.action = ${"backoffice.order.checkout.receipt_override"}
                  AND audit.target_type = ${"BookingOrder"}
                  AND audit.target_id = candidate.id AND audit.deleted_at IS NULL
                  AND JSON_LENGTH(audit.metadata) = 5
                  AND JSON_TYPE(JSON_EXTRACT(audit.metadata, ${"$.orderId"})) = ${"INTEGER"}
                  AND JSON_TYPE(JSON_EXTRACT(audit.metadata, ${"$.checkoutId"})) = ${"INTEGER"}
                  AND JSON_TYPE(JSON_EXTRACT(audit.metadata, ${"$.checkoutAmountJpy"})) = ${"INTEGER"}
                  AND CAST(JSON_UNQUOTE(JSON_EXTRACT(audit.metadata, ${"$.orderId"})) AS UNSIGNED) = candidate.id
                  AND CAST(JSON_UNQUOTE(JSON_EXTRACT(audit.metadata, ${"$.checkoutId"})) AS UNSIGNED) = candidate.checkout_id
                  AND JSON_UNQUOTE(JSON_EXTRACT(audit.metadata, ${"$.selectedMethod"})) = candidate.checkout_payment_method
                  AND CAST(JSON_UNQUOTE(JSON_EXTRACT(audit.metadata, ${"$.checkoutAmountJpy"})) AS SIGNED) = candidate.checkout_amount_jpy
                  AND JSON_UNQUOTE(JSON_EXTRACT(audit.metadata, ${"$.reason"})) = candidate.receipt_confirmation_reason) = 1)
        )
      )
    `;
  }

  public static rankingCtes(input: AnalyticsRankingInput): Prisma.Sql {
    const categoryFilter =
      input.categoryId === null
        ? Prisma.sql`TRUE`
        : Prisma.sql`line.category_id = ${input.categoryId}`;
    const entityRows =
      input.kind === "service"
        ? Prisma.sql`
          SELECT line.entity_type, line.entity_public_id, line.entity_numeric_id,
                 MIN(line.display_name) AS display_name, MIN(line.avatar_url) AS avatar_url,
                 ${
                   input.categoryId === null
                     ? Prisma.sql`CASE WHEN COUNT(DISTINCT line.category_id) = 1 THEN MIN(line.category_id) ELSE NULL END`
                     : Prisma.sql`${input.categoryId}`
                 } AS category_id,
                 MIN(line.registered_at) AS registered_at,
                 SUM(line.line_gmv_jpy) AS gmv_jpy, COUNT(*) AS completed_count,
                 SUM(CASE WHEN line.is_test_order = 1 THEN line.line_gmv_jpy ELSE 0 END)
                   AS test_gmv_jpy,
                 SUM(CASE WHEN line.is_test_order = 1 THEN 1 ELSE 0 END)
                   AS test_completed_count,
                 CASE
                   WHEN SUM(CASE WHEN line.is_test_order = 1 THEN 1 ELSE 0 END) = 0
                     THEN ${"formal"}
                   WHEN SUM(CASE WHEN line.is_test_order = 0 THEN 1 ELSE 0 END) = 0
                     THEN ${"test"}
                   ELSE ${"mixed"}
                 END AS data_composition
          FROM eligible_lines AS line WHERE ${categoryFilter}
          GROUP BY line.entity_type, line.entity_public_id, line.entity_numeric_id
        `
        : input.kind === "technician"
          ? Prisma.sql`
          SELECT ${"technician"} AS entity_type, evidence.technician_needo_id AS entity_public_id,
                 evidence.resolved_technician_id AS entity_numeric_id,
                 evidence.technician_display_name AS display_name,
                 evidence.technician_avatar_url AS avatar_url,
                 ${input.categoryId} AS category_id, evidence.technician_created_at AS registered_at,
                 ${input.categoryId === null ? Prisma.sql`SUM(evidence.checkout_amount_jpy)` : Prisma.sql`SUM(line.line_gmv_jpy)`} AS gmv_jpy,
                 COUNT(DISTINCT evidence.id) AS completed_count,
                 ${
                   input.categoryId === null
                     ? Prisma.sql`SUM(CASE WHEN evidence.is_test_order = 1 THEN evidence.checkout_amount_jpy ELSE 0 END)`
                     : Prisma.sql`SUM(CASE WHEN evidence.is_test_order = 1 THEN line.line_gmv_jpy ELSE 0 END)`
                 } AS test_gmv_jpy,
                 COUNT(DISTINCT CASE WHEN evidence.is_test_order = 1 THEN evidence.id END)
                   AS test_completed_count,
                 CASE
                   WHEN COUNT(DISTINCT CASE WHEN evidence.is_test_order = 1 THEN evidence.id END) = 0
                     THEN ${"formal"}
                   WHEN COUNT(DISTINCT CASE WHEN evidence.is_test_order = 0 THEN evidence.id END) = 0
                     THEN ${"test"}
                   ELSE ${"mixed"}
                 END AS data_composition
          FROM formal_order_evidence AS evidence
          ${input.categoryId === null ? Prisma.empty : Prisma.sql`JOIN eligible_lines AS line ON line.booking_order_id = evidence.id AND ${categoryFilter}`}
          WHERE evidence.incomplete_evidence = 0 AND evidence.entity_eligible = 1
          GROUP BY evidence.technician_needo_id, evidence.resolved_technician_id,
                   evidence.technician_display_name, evidence.technician_avatar_url,
                   evidence.technician_created_at
        `
          : Prisma.sql`
          SELECT ${"customer"} AS entity_type, evidence.customer_needo_id AS entity_public_id,
                 evidence.resolved_customer_id AS entity_numeric_id,
                 COALESCE(evidence.customer_display_name, evidence.customer_username) AS display_name,
                 evidence.customer_avatar_url AS avatar_url,
                 ${input.categoryId} AS category_id, evidence.customer_created_at AS registered_at,
                 ${input.categoryId === null ? Prisma.sql`SUM(evidence.checkout_amount_jpy)` : Prisma.sql`SUM(line.line_gmv_jpy)`} AS gmv_jpy,
                 COUNT(DISTINCT evidence.id) AS completed_count,
                 ${
                   input.categoryId === null
                     ? Prisma.sql`SUM(CASE WHEN evidence.is_test_order = 1 THEN evidence.checkout_amount_jpy ELSE 0 END)`
                     : Prisma.sql`SUM(CASE WHEN evidence.is_test_order = 1 THEN line.line_gmv_jpy ELSE 0 END)`
                 } AS test_gmv_jpy,
                 COUNT(DISTINCT CASE WHEN evidence.is_test_order = 1 THEN evidence.id END)
                   AS test_completed_count,
                 CASE
                   WHEN COUNT(DISTINCT CASE WHEN evidence.is_test_order = 1 THEN evidence.id END) = 0
                     THEN ${"formal"}
                   WHEN COUNT(DISTINCT CASE WHEN evidence.is_test_order = 0 THEN evidence.id END) = 0
                     THEN ${"test"}
                   ELSE ${"mixed"}
                 END AS data_composition
          FROM formal_order_evidence AS evidence
          ${input.categoryId === null ? Prisma.empty : Prisma.sql`JOIN eligible_lines AS line ON line.booking_order_id = evidence.id AND ${categoryFilter}`}
          WHERE evidence.incomplete_evidence = 0 AND evidence.entity_eligible = 1
          GROUP BY evidence.customer_needo_id, evidence.resolved_customer_id,
                   COALESCE(evidence.customer_display_name, evidence.customer_username),
                   evidence.customer_avatar_url, evidence.customer_created_at
        `;
    const ordering =
      input.metric === "gmv"
        ? Prisma.sql`gmv_jpy DESC, completed_count DESC, registered_at ASC,
                   entity_numeric_id ASC, BINARY entity_type ASC`
        : Prisma.sql`completed_count DESC, gmv_jpy DESC, registered_at ASC,
                   entity_numeric_id ASC, BINARY entity_type ASC`;
    return Prisma.sql`
      ranking_lines AS (
        SELECT evidence.id AS booking_order_id,
               evidence.is_test_order,
               CASE WHEN evidence.service_id IS NOT NULL THEN ${"service"}
                    ELSE ${"technician_service"} END AS entity_type,
               COALESCE(
                 NULLIF(JSON_UNQUOTE(JSON_EXTRACT(evidence.service_snapshot_json, ${"$.publicId"})), ${"null"}),
                 service.public_id, technician_service.public_id
               ) AS entity_public_id,
               COALESCE(evidence.service_id, evidence.technician_service_id) AS entity_numeric_id,
               COALESCE(NULLIF(evidence.service_name_snapshot, ${""}), service.name, technician_service.name) AS display_name,
               CASE WHEN service.id IS NOT NULL THEN
                 (SELECT media.url FROM media_assets AS media
                  WHERE media.entity_type = ${"service"} AND media.entity_id = service.id
                    AND media.usage_type = ${"cover"} AND media.is_active = TRUE
                    AND media.deleted_at IS NULL ORDER BY media.sort_order ASC, media.id ASC LIMIT 1)
                 ELSE technician_service.cover_image_url END AS avatar_url,
               COALESCE(
                 CAST(JSON_UNQUOTE(JSON_EXTRACT(evidence.service_snapshot_json, ${"$.categoryId"})) AS UNSIGNED),
                 service.category_id, technician_service.category_id
               ) AS category_id,
               COALESCE(service.created_at, technician_service.created_at) AS registered_at,
               evidence.base_amount_jpy - evidence.discount_amount_jpy AS line_gmv_jpy
        FROM formal_order_evidence AS evidence
        LEFT JOIN services AS service ON service.id = evidence.service_id
        LEFT JOIN technician_services AS technician_service
          ON technician_service.id = evidence.technician_service_id
        WHERE evidence.incomplete_evidence = 0 AND evidence.entity_eligible = 1
        UNION ALL
        SELECT evidence.id, evidence.is_test_order, ${"service"},
               COALESCE(
                 NULLIF(JSON_UNQUOTE(JSON_EXTRACT(add_on.service_snapshot_json, ${"$.publicId"})), ${"null"}),
                 service.public_id
               ),
               add_on.service_id, COALESCE(NULLIF(add_on.service_name_snapshot, ${""}), service.name),
               (SELECT media.url FROM media_assets AS media
                WHERE media.entity_type = ${"service"} AND media.entity_id = service.id
                  AND media.usage_type = ${"cover"} AND media.is_active = TRUE
                  AND media.deleted_at IS NULL ORDER BY media.sort_order ASC, media.id ASC LIMIT 1),
               COALESCE(
                 CAST(JSON_UNQUOTE(JSON_EXTRACT(add_on.service_snapshot_json, ${"$.categoryId"})) AS UNSIGNED),
                 service.category_id
               ),
               service.created_at, add_on.price_amount_jpy
        FROM formal_order_evidence AS evidence
        JOIN order_add_ons AS add_on ON add_on.booking_order_id = evidence.id
          AND add_on.status = ${"accepted"} AND add_on.deleted_at IS NULL
        LEFT JOIN services AS service ON service.id = add_on.service_id
        WHERE evidence.incomplete_evidence = 0 AND evidence.entity_eligible = 1
      ),
      eligible_lines AS (
        SELECT line.* FROM ranking_lines AS line
        WHERE line.entity_public_id IS NOT NULL AND line.entity_numeric_id IS NOT NULL
          AND line.display_name IS NOT NULL AND line.category_id IS NOT NULL
          AND line.registered_at IS NOT NULL
      ),
      entity_aggregates AS (${entityRows}),
      ranked_entities AS (
        SELECT ROW_NUMBER() OVER (ORDER BY ${ordering}) AS ranking_position, aggregate.*
        FROM entity_aggregates AS aggregate
      )
    `;
  }

  private mapRow(row: RankingRow): AnalyticsRankingItem {
    const entityType = this.string(row.entityType ?? row.entity_type);
    if (!entityTypes.has(entityType as RankingEntityType)) this.incomplete();
    const entityPublicId = this.string(row.entityPublicId ?? row.entity_public_id);
    const displayName = this.string(row.displayName ?? row.display_name);
    const avatar = row.avatarUrl ?? row.avatar_url;
    if (avatar !== null && avatar !== undefined && typeof avatar !== "string") this.incomplete();
    const registered = row.registeredAt ?? row.registered_at;
    const registeredAt =
      registered instanceof Date
        ? registered
        : typeof registered === "string"
          ? new Date(registered)
          : null;
    if (!registeredAt || Number.isNaN(registeredAt.getTime())) this.incomplete();
    const category = row.categoryId ?? row.category_id;
    const gmvJpy = this.safeInteger(row.gmvJpy ?? row.gmv_jpy);
    const completedCount = this.safeInteger(row.completedCount ?? row.completed_count);
    const testGmvJpy = this.safeInteger(row.testGmvJpy ?? row.test_gmv_jpy);
    const testCompletedCount = this.safeInteger(
      row.testCompletedCount ?? row.test_completed_count
    );
    const dataComposition = this.string(row.dataComposition ?? row.data_composition);
    if (
      testGmvJpy > gmvJpy ||
      testCompletedCount > completedCount ||
      !dataCompositions.has(dataComposition as AnalyticsRankingDataComposition)
    )
      this.incomplete();
    const expectedComposition: AnalyticsRankingDataComposition =
      testCompletedCount === 0
        ? "formal"
        : testCompletedCount === completedCount
          ? "test"
          : "mixed";
    if (dataComposition !== expectedComposition) this.incomplete();
    return {
      rank: this.safeInteger(row.rankingPosition ?? row.ranking_position ?? row.rank),
      entityType: entityType as RankingEntityType,
      entityPublicId,
      entityNumericId: this.safeInteger(row.entityNumericId ?? row.entity_numeric_id),
      displayName,
      avatarUrl: (avatar ?? null) as string | null,
      categoryId: category === null || category === undefined ? null : this.safeInteger(category),
      gmvJpy,
      completedCount,
      testGmvJpy,
      testCompletedCount,
      dataComposition: dataComposition as AnalyticsRankingDataComposition,
      registeredAt: registeredAt.toISOString()
    };
  }

  private assertPagination(page: number, pageSize: number): number {
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > MAX_ANALYTICS_RANKING_PAGE ||
      !Number.isSafeInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 10
    )
      this.incomplete();
    const offset = (page - 1) * pageSize;
    if (!Number.isSafeInteger(offset) || offset < 0) this.incomplete();
    return offset;
  }

  private safeInteger(value: NumericValue): number {
    const serialized =
      typeof value === "bigint"
        ? value.toString()
        : typeof value === "number"
          ? String(value)
          : typeof value === "string"
            ? value
            : value && typeof value.toString === "function"
              ? value.toString()
              : "";
    if (!/^(?:0|[1-9]\d*)$/u.test(serialized)) this.incomplete();
    const parsed = Number(serialized);
    if (!Number.isSafeInteger(parsed) || parsed < 0) this.incomplete();
    return parsed;
  }

  private string(value: unknown): string {
    if (typeof value !== "string" || value.length === 0) this.incomplete();
    return value;
  }

  private incomplete(): never {
    throw new AnalyticsRankingIncompleteEvidenceError();
  }
}
