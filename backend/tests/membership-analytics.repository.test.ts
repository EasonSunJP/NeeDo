import type { PrismaClient } from "@prisma/client";
import { resolveDashboardWindow } from "../src/domain/dashboard-period";
import {
  MembershipAnalyticsIncompleteHistoryError,
  type MembershipAnalyticsRepositoryInput,
  type MembershipAnalyticsListInput
} from "../src/domain/membership-analytics";
import { MembershipAnalyticsRepository } from "../src/repositories/membership-analytics.repository";

type SqlQuery = { sql?: string; strings?: readonly string[]; values?: unknown[] };
const queryText = (query: SqlQuery): string => query.sql ?? query.strings?.join(" ? ") ?? "";

const evaluatedAt = new Date("2026-09-01T05:30:00.000Z");
const window = resolveDashboardWindow({ period: "last7days" }, evaluatedAt);
const baseInput: MembershipAnalyticsRepositoryInput = {
  scope: { kind: "platform" },
  city: "东京",
  window,
  evaluatedAt
};

const trendRows = window.buckets.map((bucket, index) => ({
  bucketIndex: BigInt(index),
  bucketKey: bucket.key,
  bucketLabel: bucket.label,
  addedCount: BigInt(index === 1 ? 2 : 0),
  removedCount: String(index === 2 ? 1 : 0)
}));

const listRow = {
  userNeedoId: "u0000000041",
  nickname: "美咲",
  city: "东京",
  shopPublicId: "shop0000000071",
  shopName: "青山护理店",
  membershipPublicId: "00000000-0000-4000-8000-000000000031",
  planName: "月度会员",
  cardPublicId: "00000000-0000-4000-8000-000000000481",
  cardNo: "NMC-00112233445566778899AABB",
  acquisitionSource: "offline_paid",
  addedAt: new Date("2026-08-30T03:00:00.000Z"),
  firstPaidAt: new Date("2026-05-01T03:00:00.000Z"),
  memberStatus: "active",
  cardStatus: "active",
  expiresAt: new Date("2026-09-30T03:00:00.000Z"),
  cardId: 481
};

const createRepository = (responses: unknown[][]) => {
  const queryRaw = jest.fn<Promise<unknown[]>, [SqlQuery]>(async () => responses.shift() ?? []);
  return {
    repository: new MembershipAnalyticsRepository({ $queryRaw: queryRaw } as unknown as PrismaClient),
    queryRaw
  };
};

describe("MembershipAnalyticsRepository", () => {
  it("maps fixed added/removed/net buckets and binds the platform city scope", async () => {
    const fixture = createRepository([[{ anomalyCount: 0n }], trendRows]);

    await expect(fixture.repository.getTrend(baseInput)).resolves.toEqual([
      {
        seriesKey: "added",
        label: "Added members",
        unit: "people",
        points: window.buckets.map((bucket, index) => ({
          key: bucket.key,
          label: bucket.label,
          value: index === 1 ? 2 : 0
        }))
      },
      {
        seriesKey: "removed",
        label: "Removed members",
        unit: "people",
        points: window.buckets.map((bucket, index) => ({
          key: bucket.key,
          label: bucket.label,
          value: index === 2 ? 1 : 0
        }))
      },
      {
        seriesKey: "net",
        label: "Net members",
        unit: "people",
        points: window.buckets.map((bucket, index) => ({
          key: bucket.key,
          label: bucket.label,
          value: (index === 1 ? 2 : 0) - (index === 2 ? 1 : 0)
        }))
      }
    ]);

    expect(fixture.queryRaw).toHaveBeenCalledTimes(2);
    const validation = fixture.queryRaw.mock.calls[0]?.[0] as SqlQuery;
    const trend = fixture.queryRaw.mock.calls[1]?.[0] as SqlQuery;
    expect(validation.values).toEqual(expect.arrayContaining([
      "东京", evaluatedAt, "issuance", "migration_backfill", "status_transition",
      "active", "frozen", "void"
    ]));
    expect(trend.values).toEqual(expect.arrayContaining([
      "东京", window.fromInclusive, window.toExclusive, evaluatedAt
    ]));
  });

  it("generates fail-closed lifecycle SQL for grouped card deltas rather than mutable timestamps", async () => {
    const fixture = createRepository([[{ anomalyCount: 0 }], trendRows]);
    await fixture.repository.getTrend(baseInput);
    const validationSql = queryText(fixture.queryRaw.mock.calls[0]?.[0] as SqlQuery);
    const trendSql = queryText(fixture.queryRaw.mock.calls[1]?.[0] as SqlQuery);

    for (const fragment of [
      "membership_analytics_history_validation",
      "initial_authority_count",
      "duplicate_event_key_count",
      "simultaneous_event_count",
      "event.occurred_at < event.issued_at",
      "previous_to_status",
      "persisted_status",
      "latest_authoritative_status",
      "negative_member_state_count"
    ]) expect(validationSql).toContain(fragment);
    expect(validationSql.match(/LEFT JOIN event_evaluated AS event ON event\.card_id = card\.card_id/gu))
      .toHaveLength(1);

    for (const fragment of [
      "membership_analytics_trend",
      "card_deltas",
      "expiry_deltas",
      "GROUP BY shop_id, user_id, occurred_at",
      "SUM(group_delta) OVER",
      "before_count",
      "after_count",
      "transition_kind",
      "LEFT JOIN member_transitions"
    ]) expect(trendSql).toContain(fragment);
    expect(`${validationSql} ${trendSql}`).not.toContain("card.updated_at");
    expect(`${validationSql} ${trendSql}`).not.toContain("membership.updated_at");
  });

  it("keeps historical cards after membership end while deriving only current member status", async () => {
    const fixture = createRepository([[{ anomalyCount: 0 }], trendRows]);
    await fixture.repository.getTrend(baseInput);
    const sql = queryText(fixture.queryRaw.mock.calls[0]?.[0] as SqlQuery);

    expect(sql).toContain("membership_started_at");
    expect(sql).toContain("membership_ended_at");
    expect(sql).toContain("invalid_membership_shape");
    expect(sql).toContain("invalid_membership_end_authority");
    expect(sql).not.toContain("membership.status = ?\n         AND membership.started_at <= ?");
  });

  it("fails closed on membership status/end incoherence and every lifecycle event after end", async () => {
    const fixture = createRepository([[{ anomalyCount: 0 }], trendRows]);
    await fixture.repository.getTrend(baseInput);
    const sql = queryText(fixture.queryRaw.mock.calls[0]?.[0] as SqlQuery);

    expect(sql).toContain("invalid_membership_status_timing");
    expect(sql).toContain("post_membership_end_event_count");
    expect(sql).toContain("event.occurred_at > card.membership_ended_at");
    expect(sql).toContain("ended.occurred_at <= card.membership_ended_at");
    expect(sql).toContain("card.expires_at > card.membership_ended_at");
    expect(sql).not.toContain("card.membership_ended_at,\n          membership.public_id");
  });

  it("requires exact Task2A issuance and migration-backfill provenance", async () => {
    const fixture = createRepository([[{ anomalyCount: 0 }], trendRows]);
    await fixture.repository.getTrend(baseInput);
    const validation = fixture.queryRaw.mock.calls[0]?.[0] as SqlQuery;
    const sql = queryText(validation);

    for (const fragment of [
      "reason_code",
      "actor_user_id",
      "metadata",
      "card_public_id",
      "issued_by_id",
      "JSON_LENGTH",
      "JSON_EXTRACT",
      "CONCAT"
    ]) expect(sql).toContain(fragment);
    expect(validation.values).toEqual(expect.arrayContaining([
      "issuance", "migration_backfill", "card_issued", "historical_card_issued",
      ":issued", ":backfill-issued", "$.issuanceSource"
    ]));
  });

  it("groups same-time replacement and overlapping-card deltas before emitting member transitions", async () => {
    const fixture = createRepository([[{ anomalyCount: 0 }], trendRows]);
    await fixture.repository.getTrend(baseInput);
    const sql = queryText(fixture.queryRaw.mock.calls[1]?.[0] as SqlQuery);
    expect(sql.indexOf("GROUP BY shop_id, user_id, occurred_at")).toBeLessThan(sql.indexOf("transition_kind"));
    expect(sql).toContain("before_count = 0 AND after_count > 0");
    expect(sql).toContain("before_count > 0 AND after_count = 0");
  });

  it.each([
    ["missing initial authority", 1],
    ["ambiguous chain", "2"],
    ["legacy frozen row without evidence", 3n]
  ])("rejects the whole request for %s", async (_label, anomalyCount) => {
    const fixture = createRepository([[{ anomalyCount }]]);
    await expect(fixture.repository.getTrend(baseInput)).rejects.toBeInstanceOf(
      MembershipAnalyticsIncompleteHistoryError
    );
    expect(fixture.queryRaw).toHaveBeenCalledTimes(1);
  });

  it("returns one distinct added member, a canonical mask and database-backed pagination", async () => {
    const input: MembershipAnalyticsListInput = {
      ...baseInput,
      needoId: "u0000000041",
      nickname: "50%_VIP",
      page: 2,
      pageSize: 20
    };
    const fixture = createRepository([[{ anomalyCount: 0 }], [{ total: 21n }], [listRow]]);

    const result = await fixture.repository.listAddedMembers(input);
    expect(result).toEqual({
      list: [{
        userNeedoId: "u0000000041",
        nickname: "美咲",
        city: "东京",
        shopPublicId: "shop0000000071",
        shopName: "青山护理店",
        membershipPublicId: listRow.membershipPublicId,
        planName: "月度会员",
        cardPublicId: listRow.cardPublicId,
        cardNoMasked: "•••• •••• •••• AABB",
        acquisitionSource: "offline_paid",
        addedAt: "2026-08-30T03:00:00.000Z",
        firstPaidAt: "2026-05-01T03:00:00.000Z",
        memberStatus: "active",
        cardStatus: "active",
        expiresAt: "2026-09-30T03:00:00.000Z"
      }],
      total: 21,
      page: 2,
      page_size: 20
    });

    const countQuery = fixture.queryRaw.mock.calls[1]?.[0] as SqlQuery;
    const pageQuery = fixture.queryRaw.mock.calls[2]?.[0] as SqlQuery;
    const pageSql = queryText(pageQuery);
    expect(countQuery.values).toEqual(expect.arrayContaining(["u0000000041", "%50\\%\\_VIP%"]));
    expect(pageQuery.values).toEqual(expect.arrayContaining([20, 20]));
    for (const fragment of [
      "membership_analytics_added_members_page",
      "first_addition_in_window",
      "ROW_NUMBER() OVER",
      "first_paid_at",
      "LIKE",
      "ESCAPE",
      "ORDER BY added_at DESC, BINARY shop_public_id ASC, user_needo_id ASC, card_id ASC",
      "LIMIT",
      "OFFSET"
    ]) expect(pageSql).toContain(fragment);
    expect(JSON.stringify(result)).not.toContain(listRow.cardNo);
  });

  it("returns an exact empty page without running the page query", async () => {
    const fixture = createRepository([[{ anomalyCount: 0 }], [{ total: 0 }]]);
    await expect(fixture.repository.listAddedMembers({ ...baseInput, page: 1, pageSize: 20 }))
      .resolves.toEqual({ list: [], total: 0, page: 1, page_size: 20 });
    expect(fixture.queryRaw).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["unsafe page", Number.MAX_SAFE_INTEGER, 100],
    ["unsafe page size", 1, Number.MAX_SAFE_INTEGER],
    ["zero page", 0, 20]
  ])("rejects %s before issuing any repository query", async (_label, page, pageSize) => {
    const fixture = createRepository([]);
    await expect(fixture.repository.listAddedMembers({ ...baseInput, page, pageSize }))
      .rejects.toBeInstanceOf(MembershipAnalyticsIncompleteHistoryError);
    expect(fixture.queryRaw).not.toHaveBeenCalled();
  });

  it.each([
    ["missing page rows", [[{ anomalyCount: 0 }], [{ total: 2 }], [listRow]]],
    ["duplicate shop-user identity", [[{ anomalyCount: 0 }], [{ total: 2 }], [listRow, { ...listRow, cardId: 482, cardPublicId: "00000000-0000-4000-8000-000000000482" }]]]
  ])("fails closed for malformed page cardinality: %s", async (_label, responses) => {
    const fixture = createRepository(responses as unknown[][]);
    await expect(fixture.repository.listAddedMembers({ ...baseInput, page: 1, pageSize: 20 }))
      .rejects.toBeInstanceOf(MembershipAnalyticsIncompleteHistoryError);
  });

  it.each([
    ["duplicate validation row", [[{ anomalyCount: 0 }, { anomalyCount: 0 }]]],
    ["negative total", [[{ anomalyCount: 0 }], [{ total: -1 }]]],
    ["unsafe trend count", [[{ anomalyCount: 0 }], trendRows.map((row, index) => index === 0 ? { ...row, addedCount: Number.MAX_SAFE_INTEGER + 1 } : row)]]
  ])("rejects malformed canonical rows: %s", async (_label, responses) => {
    const fixture = createRepository(responses as unknown[][]);
    const operation = _label === "negative total"
      ? fixture.repository.listAddedMembers({ ...baseInput, page: 1, pageSize: 20 })
      : fixture.repository.getTrend(baseInput);
    await expect(operation).rejects.toBeInstanceOf(MembershipAnalyticsIncompleteHistoryError);
  });

  it("uses explicit selected-shop scope and no city override for merchant reads", async () => {
    const fixture = createRepository([[{ anomalyCount: 0 }], trendRows]);
    await fixture.repository.getTrend({
      ...baseInput,
      scope: { kind: "shop", shopId: 71 },
      city: null
    });
    const bindings = fixture.queryRaw.mock.calls.flatMap((call) => (call[0] as SqlQuery).values ?? []);
    expect(bindings).toContain(71);
    expect(bindings).not.toContain("东京");
  });
});
