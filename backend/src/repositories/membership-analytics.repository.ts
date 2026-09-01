import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  MemberAcquisitionSource,
  MemberAnalyticsListItem,
  MemberAnalyticsListPayload,
  MembershipAnalyticsListInput,
  MembershipAnalyticsRepositoryInput,
  MembershipTrendSeries
} from "../domain/membership-analytics";
import {
  MAX_MEMBERSHIP_ANALYTICS_PAGE,
  MembershipAnalyticsIncompleteHistoryError
} from "../domain/membership-analytics";
import { maskMembershipCardNumber } from "../utils/membership-card-mask";

type MembershipAnalyticsQueryClient = Pick<PrismaClient, "$queryRaw">;
type NumericValue = bigint | number | string | { toString: () => string } | null | undefined;

interface HistoryValidationRow { anomalyCount?: NumericValue; anomaly_count?: NumericValue }
interface TrendRow {
  bucketIndex?: NumericValue;
  bucket_index?: NumericValue;
  bucketKey?: unknown;
  bucket_key?: unknown;
  bucketLabel?: unknown;
  bucket_label?: unknown;
  addedCount?: NumericValue;
  added_count?: NumericValue;
  removedCount?: NumericValue;
  removed_count?: NumericValue;
}
interface CountRow { total?: NumericValue }
interface AddedMemberRow {
  userNeedoId?: unknown;
  user_needo_id?: unknown;
  nickname?: unknown;
  city?: unknown;
  shopPublicId?: unknown;
  shop_public_id?: unknown;
  shopName?: unknown;
  shop_name?: unknown;
  membershipPublicId?: unknown;
  membership_public_id?: unknown;
  planName?: unknown;
  plan_name?: unknown;
  cardPublicId?: unknown;
  card_public_id?: unknown;
  cardNo?: unknown;
  card_no?: unknown;
  acquisitionSource?: unknown;
  acquisition_source?: unknown;
  addedAt?: unknown;
  added_at?: unknown;
  firstPaidAt?: unknown;
  first_paid_at?: unknown;
  memberStatus?: unknown;
  member_status?: unknown;
  cardStatus?: unknown;
  card_status?: unknown;
  expiresAt?: unknown;
  expires_at?: unknown;
  cardId?: NumericValue;
  card_id?: NumericValue;
}

export interface MembershipAnalyticsRepositoryPort {
  getTrend(input: MembershipAnalyticsRepositoryInput): Promise<MembershipTrendSeries>;
  listAddedMembers(input: MembershipAnalyticsListInput): Promise<MemberAnalyticsListPayload>;
}

const acquisitionSources: ReadonlySet<MemberAcquisitionSource> = new Set([
  "offline_paid", "online_paid", "gift", "trial", "renewal",
  "historical_replacement", "manual_grant"
]);
const cardStatuses = new Set(["active", "expired", "frozen", "void"]);
const memberStatuses = new Set(["active", "inactive"]);

export class MembershipAnalyticsRepository implements MembershipAnalyticsRepositoryPort {
  public constructor(private readonly client: MembershipAnalyticsQueryClient) {}

  public async getTrend(input: MembershipAnalyticsRepositoryInput): Promise<MembershipTrendSeries> {
    await this.assertCompleteHistory(input);
    const rows = await this.queryTrend(input);
    if (rows.length !== input.window.buckets.length) this.incomplete();

    const added = input.window.buckets.map((bucket, index) => {
      const row = rows[index];
      if (!row || this.toSafeCount(row.bucketIndex ?? row.bucket_index) !== index) this.incomplete();
      const key = this.string(row.bucketKey ?? row.bucket_key);
      const label = this.string(row.bucketLabel ?? row.bucket_label);
      if (key !== bucket.key || label !== bucket.label) this.incomplete();
      return { key, label, value: this.toSafeCount(row.addedCount ?? row.added_count) };
    });
    const removed = input.window.buckets.map((bucket, index) => {
      const row = rows[index];
      if (!row) this.incomplete();
      return {
        key: bucket.key,
        label: bucket.label,
        value: this.toSafeCount(row.removedCount ?? row.removed_count)
      };
    });

    return [
      { seriesKey: "added", label: "Added members", unit: "people", points: added },
      { seriesKey: "removed", label: "Removed members", unit: "people", points: removed },
      {
        seriesKey: "net",
        label: "Net members",
        unit: "people",
        points: added.map((point, index) => ({
          ...point,
          value: point.value - (removed[index]?.value ?? this.incomplete())
        }))
      }
    ];
  }

  public async listAddedMembers(
    input: MembershipAnalyticsListInput
  ): Promise<MemberAnalyticsListPayload> {
    this.assertPagination(input.page, input.pageSize);
    await this.assertCompleteHistory(input);
    const countRows = await this.queryAddedMemberCount(input);
    if (countRows.length !== 1) this.incomplete();
    const total = this.toSafeCount(countRows[0]?.total);
    if (total === 0) return { list: [], total, page: input.page, page_size: input.pageSize };

    const rows = await this.queryAddedMemberPage(input);
    const offset = (input.page - 1) * input.pageSize;
    const expectedRows = Math.max(0, Math.min(input.pageSize, total - offset));
    if (rows.length !== expectedRows) this.incomplete();
    const list = rows.map((row) => this.mapListItem(row));
    const identities = new Set(list.map((item) => `${item.shopPublicId}\u0000${item.userNeedoId}`));
    if (identities.size !== list.length) this.incomplete();
    return {
      list,
      total,
      page: input.page,
      page_size: input.pageSize
    };
  }

  private async assertCompleteHistory(input: MembershipAnalyticsRepositoryInput): Promise<void> {
    const rows = await this.client.$queryRaw<HistoryValidationRow[]>(Prisma.sql`
      /* membership_analytics_history_validation */
      WITH ${this.lifecycleCtes(input)}
      SELECT
        (
          (SELECT COUNT(*) FROM card_authority
            WHERE initial_authority_count <> 1
               OR invalid_card_shape = 1
               OR invalid_membership_shape = 1
               OR invalid_membership_status_timing = 1
               OR post_membership_end_event_count <> 0
               OR invalid_membership_end_authority = 1
               OR invalid_persisted_status = 1)
          + (SELECT COUNT(*) FROM event_evaluated WHERE invalid_event = 1)
          + (SELECT COUNT(*) FROM member_state
              WHERE before_count < 0 OR after_count < 0)
        ) AS anomalyCount,
        (SELECT COALESCE(SUM(duplicate_event_key_count > 1), 0) FROM event_evaluated)
          AS duplicate_event_key_count,
        (SELECT COALESCE(SUM(simultaneous_event_count > 1), 0) FROM event_evaluated)
          AS simultaneous_event_count,
        (SELECT COALESCE(SUM(before_count < 0 OR after_count < 0), 0) FROM member_state)
          AS negative_member_state_count
    `);
    if (rows.length !== 1 || this.toSafeCount(rows[0]?.anomalyCount ?? rows[0]?.anomaly_count) !== 0) {
      this.incomplete();
    }
  }

  private queryTrend(input: MembershipAnalyticsRepositoryInput): Promise<TrendRow[]> {
    const bucketRows = Prisma.join(
      input.window.buckets.map((bucket, index) => Prisma.sql`
        SELECT ${index} AS bucket_index, ${bucket.key} AS bucket_key,
               ${bucket.label} AS bucket_label, ${bucket.fromInclusive} AS from_inclusive,
               ${bucket.toExclusive} AS to_exclusive
      `),
      " UNION ALL "
    );
    return this.client.$queryRaw<TrendRow[]>(Prisma.sql`
      /* membership_analytics_trend */
      WITH ${this.lifecycleCtes(input)},
      fixed_buckets AS (${bucketRows})
      SELECT
        bucket.bucket_index AS bucketIndex,
        bucket.bucket_key AS bucketKey,
        bucket.bucket_label AS bucketLabel,
        COALESCE(SUM(transition.transition_kind = ${"added"}), 0) AS addedCount,
        COALESCE(SUM(transition.transition_kind = ${"removed"}), 0) AS removedCount
      FROM fixed_buckets AS bucket
      LEFT JOIN member_transitions AS transition
        ON transition.occurred_at >= bucket.from_inclusive
       AND transition.occurred_at < bucket.to_exclusive
       AND transition.occurred_at >= ${input.window.fromInclusive}
       AND transition.occurred_at < ${input.window.toExclusive}
       AND transition.occurred_at <= ${input.evaluatedAt}
      GROUP BY bucket.bucket_index, bucket.bucket_key, bucket.bucket_label
      ORDER BY bucket.bucket_index ASC
    `);
  }

  private queryAddedMemberCount(input: MembershipAnalyticsListInput): Promise<CountRow[]> {
    return this.client.$queryRaw<CountRow[]>(Prisma.sql`
      /* membership_analytics_added_members_count */
      WITH ${this.lifecycleCtes(input)}, ${this.addedMemberCtes(input)}
      SELECT COUNT(*) AS total
      FROM filtered_added_members
    `);
  }

  private queryAddedMemberPage(input: MembershipAnalyticsListInput): Promise<AddedMemberRow[]> {
    const offset = (input.page - 1) * input.pageSize;
    return this.client.$queryRaw<AddedMemberRow[]>(Prisma.sql`
      /* membership_analytics_added_members_page */
      WITH ${this.lifecycleCtes(input)}, ${this.addedMemberCtes(input)}
      SELECT
        user_needo_id AS userNeedoId,
        nickname,
        city,
        shop_public_id AS shopPublicId,
        shop_name AS shopName,
        membership_public_id AS membershipPublicId,
        plan_name AS planName,
        card_public_id AS cardPublicId,
        card_no AS cardNo,
        acquisition_source AS acquisitionSource,
        added_at AS addedAt,
        first_paid_at AS firstPaidAt,
        member_status AS memberStatus,
        card_status AS cardStatus,
        expires_at AS expiresAt,
        card_id AS cardId
      FROM filtered_added_members
      ORDER BY added_at DESC, BINARY shop_public_id ASC, user_needo_id ASC, card_id ASC
      LIMIT ${input.pageSize}
      OFFSET ${offset}
    `);
  }

  private lifecycleCtes(input: MembershipAnalyticsRepositoryInput): Prisma.Sql {
    const scope = input.scope.kind === "shop"
      ? Prisma.sql`AND shop.id = ${input.scope.shopId}`
      : Prisma.empty;
    const city = input.city === null ? Prisma.empty : Prisma.sql`AND TRIM(shop.city) = ${input.city}`;
    return Prisma.sql`
      scoped_cards AS (
        SELECT
          card.id AS card_id,
          card.public_id AS card_public_id,
          card.card_no,
          card.membership_id,
          card.plan_version_id,
          card.issued_by_id,
          card.status AS persisted_status,
          card.issuance_source,
          card.issued_at,
          card.expires_at,
          membership.public_id AS membership_public_id,
          membership.status AS membership_status,
          membership.started_at AS membership_started_at,
          membership.ended_at AS membership_ended_at,
          shop.id AS shop_id,
          shop.shop_no AS shop_public_id,
          shop.name AS shop_name,
          shop.city,
          customer.user_id,
          customer.display_name AS nickname,
          user.needo_id AS user_needo_id
        FROM shop_membership_cards AS card
        INNER JOIN shop_customer_memberships AS membership
          ON membership.id = card.membership_id
         AND membership.deleted_at IS NULL
        INNER JOIN customer_profiles AS customer
          ON customer.id = membership.customer_profile_id
         AND customer.deleted_at IS NULL
        INNER JOIN users AS user
          ON user.id = customer.user_id
         AND user.deleted_at IS NULL
         AND user.is_active = ${true}
         AND user.is_test_account = ${false}
        INNER JOIN shops AS shop
          ON shop.id = membership.shop_id
         AND shop.deleted_at IS NULL
        WHERE card.deleted_at IS NULL
          ${scope}
          ${city}
      ),
      event_ordered AS (
        SELECT
          event.id AS event_id,
          event.event_key,
          event.card_id,
          event.from_status,
          event.to_status,
          event.source,
          event.occurred_at,
          event.reason_code,
          event.actor_user_id,
          event.metadata,
          card.card_public_id,
          card.issued_by_id,
          card.issuance_source,
          card.issued_at,
          card.expires_at,
          card.membership_ended_at,
          ROW_NUMBER() OVER (
            PARTITION BY event.card_id ORDER BY event.occurred_at ASC, event.id ASC
          ) AS sequence_no,
          LAG(event.to_status) OVER (
            PARTITION BY event.card_id ORDER BY event.occurred_at ASC, event.id ASC
          ) AS previous_to_status,
          COUNT(*) OVER (PARTITION BY event.event_key) AS duplicate_event_key_count,
          COUNT(*) OVER (PARTITION BY event.card_id, event.occurred_at)
            AS simultaneous_event_count
        FROM shop_membership_card_status_events AS event
        INNER JOIN scoped_cards AS card ON card.card_id = event.card_id
        WHERE event.deleted_at IS NULL
      ),
      event_evaluated AS (
        SELECT event.*,
          CASE
            WHEN event.occurred_at < event.issued_at THEN 1
            WHEN event.membership_ended_at IS NOT NULL
              AND event.occurred_at > event.membership_ended_at THEN 1
            WHEN event.expires_at IS NOT NULL AND event.occurred_at >= event.expires_at
              AND event.sequence_no > 1 THEN 1
            WHEN event.duplicate_event_key_count > 1 OR event.simultaneous_event_count > 1 THEN 1
            WHEN event.sequence_no = 1 AND NOT (
              event.from_status IS NULL
              AND event.to_status = ${"active"}
              AND event.occurred_at = event.issued_at
              AND (
                (
                  event.source = ${"issuance"}
                  AND event.event_key = CONCAT(${"membership-card:"}, event.card_public_id, ${":issued"})
                  AND event.reason_code = ${"card_issued"}
                  AND event.actor_user_id = event.issued_by_id
                  AND event.issued_by_id IS NOT NULL
                )
                OR (
                  event.source = ${"migration_backfill"}
                  AND event.event_key = CONCAT(${"membership-card:"}, event.card_public_id, ${":backfill-issued"})
                  AND event.reason_code = ${"historical_card_issued"}
                  AND event.actor_user_id IS NULL
                )
              )
              AND JSON_TYPE(event.metadata) = ${"OBJECT"}
              AND JSON_LENGTH(event.metadata) = 1
              AND JSON_CONTAINS_PATH(event.metadata, ${"one"}, ${"$.issuanceSource"}) = 1
              AND JSON_UNQUOTE(JSON_EXTRACT(event.metadata, ${"$.issuanceSource"})) = event.issuance_source
            ) THEN 1
            WHEN event.sequence_no > 1 AND NOT (
              event.source = ${"status_transition"}
              AND event.from_status = event.previous_to_status
              AND (
                (event.from_status = ${"active"} AND event.to_status IN (${"frozen"}, ${"void"}))
                OR (event.from_status = ${"frozen"} AND event.to_status IN (${"active"}, ${"void"}))
              )
            ) THEN 1
            ELSE 0
          END AS invalid_event
        FROM event_ordered AS event
      ),
      card_authority AS (
        SELECT
          card.card_id,
          SUM(CASE WHEN event.sequence_no = 1
                    AND event.from_status IS NULL
                    AND event.to_status = ${"active"}
                    AND event.occurred_at = card.issued_at
                    AND event.invalid_event = 0
                   THEN 1 ELSE 0 END) AS initial_authority_count,
          CASE WHEN card.expires_at IS NOT NULL AND card.expires_at <= card.issued_at
                 OR card.issuance_source IS NULL
               THEN 1 ELSE 0 END AS invalid_card_shape,
          CASE WHEN card.membership_started_at > card.issued_at
                 OR (card.membership_ended_at IS NOT NULL AND (
                   card.membership_ended_at <= card.membership_started_at
                   OR card.issued_at >= card.membership_ended_at
                 ))
               THEN 1 ELSE 0 END AS invalid_membership_shape,
          CASE WHEN (
                   card.membership_status = ${"ended"}
                   AND (card.membership_ended_at IS NULL
                     OR card.membership_ended_at > ${input.evaluatedAt})
                 ) OR (
                   card.membership_status = ${"active"}
                   AND card.membership_ended_at IS NOT NULL
                   AND card.membership_ended_at <= ${input.evaluatedAt}
                 )
               THEN 1 ELSE 0 END AS invalid_membership_status_timing,
          SUM(CASE WHEN card.membership_ended_at IS NOT NULL
                     AND event.occurred_at > card.membership_ended_at
                   THEN 1 ELSE 0 END) AS post_membership_end_event_count,
          CASE WHEN card.membership_ended_at IS NOT NULL
                 AND card.membership_ended_at <= ${input.evaluatedAt}
                 AND (card.expires_at IS NULL OR card.expires_at > card.membership_ended_at)
                 AND COALESCE((
                   SELECT ended.to_status
                   FROM event_evaluated AS ended
                   WHERE ended.card_id = card.card_id
                     AND ended.occurred_at <= card.membership_ended_at
                   ORDER BY ended.occurred_at DESC, ended.event_id DESC
                   LIMIT 1
                 ), ${"missing"}) NOT IN (${"frozen"}, ${"void"})
               THEN 1 ELSE 0 END AS invalid_membership_end_authority,
          CASE
            WHEN card.persisted_status IN (${"frozen"}, ${"void"})
              AND COALESCE((
                SELECT latest.to_status
                FROM event_evaluated AS latest
                WHERE latest.card_id = card.card_id
                  AND latest.occurred_at <= ${input.evaluatedAt}
                ORDER BY latest.occurred_at DESC, latest.event_id DESC
                LIMIT 1
              ), ${"missing"}) <> card.persisted_status THEN 1
            WHEN card.persisted_status = ${"expired"}
              AND (card.expires_at IS NULL OR card.expires_at > ${input.evaluatedAt}) THEN 1
            ELSE 0
          END AS invalid_persisted_status,
          (
            SELECT latest.to_status
            FROM event_evaluated AS latest
            WHERE latest.card_id = card.card_id
              AND latest.occurred_at <= ${input.evaluatedAt}
            ORDER BY latest.occurred_at DESC, latest.event_id DESC
            LIMIT 1
          ) AS latest_authoritative_status
        FROM scoped_cards AS card
        LEFT JOIN event_evaluated AS event ON event.card_id = card.card_id
        GROUP BY card.card_id, card.issued_at, card.expires_at, card.issuance_source,
                 card.persisted_status, card.membership_status, card.membership_started_at,
                 card.membership_ended_at
      ),
      event_deltas AS (
        SELECT
          card.shop_id,
          card.user_id,
          event.card_id,
          event.occurred_at,
          CASE
            WHEN event.sequence_no = 1 THEN 1
            WHEN event.from_status = ${"active"} AND event.to_status IN (${"frozen"}, ${"void"}) THEN -1
            WHEN event.from_status = ${"frozen"} AND event.to_status = ${"active"} THEN 1
            ELSE 0
          END AS delta
        FROM event_evaluated AS event
        INNER JOIN scoped_cards AS card ON card.card_id = event.card_id
      ),
      expiry_deltas AS (
        SELECT card.shop_id, card.user_id, card.card_id, card.expires_at AS occurred_at, -1 AS delta
        FROM scoped_cards AS card
        WHERE card.expires_at IS NOT NULL
          AND (card.membership_ended_at IS NULL
            OR card.expires_at <= card.membership_ended_at)
          AND (
            SELECT latest.to_status
            FROM event_evaluated AS latest
            WHERE latest.card_id = card.card_id
              AND latest.occurred_at < card.expires_at
            ORDER BY latest.occurred_at DESC, latest.event_id DESC
            LIMIT 1
          ) = ${"active"}
      ),
      card_deltas AS (
        SELECT shop_id, user_id, card_id, occurred_at, delta FROM event_deltas
        UNION ALL
        SELECT shop_id, user_id, card_id, occurred_at, delta FROM expiry_deltas
      ),
      grouped_member_deltas AS (
        SELECT shop_id, user_id, occurred_at, SUM(delta) AS group_delta
        FROM card_deltas
        GROUP BY shop_id, user_id, occurred_at
      ),
      member_state AS (
        SELECT state.*,
          SUM(group_delta) OVER (
            PARTITION BY shop_id, user_id ORDER BY occurred_at ASC ROWS UNBOUNDED PRECEDING
          ) AS after_count,
          SUM(group_delta) OVER (
            PARTITION BY shop_id, user_id ORDER BY occurred_at ASC ROWS UNBOUNDED PRECEDING
          ) - group_delta AS before_count
        FROM grouped_member_deltas AS state
      ),
      member_transitions AS (
        SELECT state.*,
          CASE
            WHEN before_count = 0 AND after_count > 0 THEN ${"added"}
            WHEN before_count > 0 AND after_count = 0 THEN ${"removed"}
            ELSE NULL
          END AS transition_kind
        FROM member_state AS state
        WHERE (before_count = 0 AND after_count > 0)
           OR (before_count > 0 AND after_count = 0)
      )
    `;
  }

  private addedMemberCtes(input: MembershipAnalyticsListInput): Prisma.Sql {
    const needoFilter = input.needoId
      ? Prisma.sql`AND addition.user_needo_id = ${input.needoId}`
      : Prisma.empty;
    const nicknameFilter = input.nickname
      ? Prisma.sql`AND addition.nickname LIKE ${`%${this.escapeLike(input.nickname)}%`} ESCAPE ${"\\"}`
      : Prisma.empty;
    return Prisma.sql`
      first_addition_in_window AS (
        SELECT transition.*,
          ROW_NUMBER() OVER (
            PARTITION BY transition.shop_id, transition.user_id
            ORDER BY transition.occurred_at ASC
          ) AS addition_rank
        FROM member_transitions AS transition
        WHERE transition.transition_kind = ${"added"}
          AND transition.occurred_at >= ${input.window.fromInclusive}
          AND transition.occurred_at < ${input.window.toExclusive}
          AND transition.occurred_at <= ${input.evaluatedAt}
      ),
      representative_addition_card AS (
        SELECT addition.shop_id, addition.user_id, addition.occurred_at AS added_at,
               MIN(delta.card_id) AS card_id
        FROM first_addition_in_window AS addition
        INNER JOIN card_deltas AS delta
          ON delta.shop_id = addition.shop_id
         AND delta.user_id = addition.user_id
         AND delta.occurred_at = addition.occurred_at
         AND delta.delta > 0
        WHERE addition.addition_rank = 1
        GROUP BY addition.shop_id, addition.user_id, addition.occurred_at
      ),
      added_member_projection AS (
        SELECT
          card.user_needo_id,
          card.nickname,
          card.city,
          card.shop_public_id,
          card.shop_name,
          card.membership_public_id,
          plan_version.name AS plan_name,
          card.card_public_id,
          card.card_no,
          card.issuance_source AS acquisition_source,
          representative.added_at,
          (
            SELECT paid.issued_at
            FROM shop_membership_cards AS paid
            INNER JOIN shop_customer_memberships AS paid_membership
              ON paid_membership.id = paid.membership_id
            INNER JOIN customer_profiles AS paid_customer
              ON paid_customer.id = paid_membership.customer_profile_id
            WHERE paid_customer.user_id = card.user_id
              AND paid.issuance_source IN (${"offline_paid"}, ${"online_paid"})
            ORDER BY paid.issued_at ASC, paid.id ASC
            LIMIT 1
          ) AS first_paid_at,
          CASE WHEN COALESCE((
            SELECT latest.after_count
            FROM member_state AS latest
            WHERE latest.shop_id = card.shop_id
              AND latest.user_id = card.user_id
              AND latest.occurred_at <= ${input.evaluatedAt}
            ORDER BY latest.occurred_at DESC
            LIMIT 1
          ), 0) > 0
          AND EXISTS (
            SELECT 1
            FROM scoped_cards AS current_card
            WHERE current_card.shop_id = card.shop_id
              AND current_card.user_id = card.user_id
              AND current_card.membership_status = ${"active"}
              AND current_card.membership_started_at <= ${input.evaluatedAt}
              AND (current_card.membership_ended_at IS NULL
                OR current_card.membership_ended_at > ${input.evaluatedAt})
          ) THEN ${"active"} ELSE ${"inactive"} END AS member_status,
          CASE
            WHEN authority.latest_authoritative_status IN (${"frozen"}, ${"void"})
              THEN authority.latest_authoritative_status
            WHEN card.expires_at IS NOT NULL AND card.expires_at <= ${input.evaluatedAt}
              THEN ${"expired"}
            ELSE ${"active"}
          END AS card_status,
          card.expires_at,
          card.card_id
        FROM representative_addition_card AS representative
        INNER JOIN scoped_cards AS card ON card.card_id = representative.card_id
        INNER JOIN card_authority AS authority ON authority.card_id = card.card_id
        LEFT JOIN shop_membership_card_plan_versions AS plan_version
          ON plan_version.id = card.plan_version_id
      ),
      filtered_added_members AS (
        SELECT addition.*
        FROM added_member_projection AS addition
        WHERE 1 = 1
          ${needoFilter}
          ${nicknameFilter}
      )
    `;
  }

  private mapListItem(row: AddedMemberRow): MemberAnalyticsListItem {
    const acquisitionSource = this.string(row.acquisitionSource ?? row.acquisition_source);
    const memberStatus = this.string(row.memberStatus ?? row.member_status);
    const cardStatus = this.string(row.cardStatus ?? row.card_status);
    if (!acquisitionSources.has(acquisitionSource as MemberAcquisitionSource)) this.incomplete();
    if (!memberStatuses.has(memberStatus) || !cardStatuses.has(cardStatus)) this.incomplete();
    this.toSafePositiveInteger(row.cardId ?? row.card_id);
    const cardNo = this.string(row.cardNo ?? row.card_no);
    return {
      userNeedoId: this.string(row.userNeedoId ?? row.user_needo_id),
      nickname: this.string(row.nickname),
      city: this.string(row.city),
      shopPublicId: this.string(row.shopPublicId ?? row.shop_public_id),
      shopName: this.string(row.shopName ?? row.shop_name),
      membershipPublicId: this.string(row.membershipPublicId ?? row.membership_public_id),
      planName: this.nullableString(row.planName ?? row.plan_name),
      cardPublicId: this.string(row.cardPublicId ?? row.card_public_id),
      cardNoMasked: maskMembershipCardNumber(cardNo),
      acquisitionSource: acquisitionSource as MemberAcquisitionSource,
      addedAt: this.date(row.addedAt ?? row.added_at).toISOString(),
      firstPaidAt: this.nullableDate(row.firstPaidAt ?? row.first_paid_at),
      memberStatus: memberStatus as "active" | "inactive",
      cardStatus: cardStatus as "active" | "expired" | "frozen" | "void",
      expiresAt: this.nullableDate(row.expiresAt ?? row.expires_at)
    };
  }

  private escapeLike(value: string): string {
    return value.replace(/[\\%_]/gu, (character) => `\\${character}`);
  }

  private assertPagination(page: number, pageSize: number): void {
    if (!Number.isSafeInteger(page) || page < 1 || page > MAX_MEMBERSHIP_ANALYTICS_PAGE) {
      this.incomplete();
    }
    if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) this.incomplete();
    const offset = (page - 1) * pageSize;
    if (!Number.isSafeInteger(offset) || offset < 0) this.incomplete();
  }

  private toSafeCount(value: NumericValue): number {
    const parsed = this.numeric(value);
    if (!Number.isSafeInteger(parsed) || parsed < 0) this.incomplete();
    return parsed;
  }

  private toSafePositiveInteger(value: NumericValue): number {
    const parsed = this.numeric(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) this.incomplete();
    return parsed;
  }

  private numeric(value: NumericValue): number {
    if (value === null || value === undefined || typeof value === "boolean") this.incomplete();
    if (typeof value === "bigint") {
      if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) this.incomplete();
      return Number(value);
    }
    if (typeof value === "number") return value;
    const serialized = typeof value === "string" ? value : value.toString();
    if (!/^-?(?:0|[1-9]\d*)$/u.test(serialized)) this.incomplete();
    return Number(serialized);
  }

  private string(value: unknown): string {
    if (typeof value !== "string" || value.length === 0) this.incomplete();
    return value;
  }

  private nullableString(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    return this.string(value);
  }

  private date(value: unknown): Date {
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) this.incomplete();
    return value;
  }

  private nullableDate(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    return this.date(value).toISOString();
  }

  private incomplete(): never {
    throw new MembershipAnalyticsIncompleteHistoryError();
  }
}
