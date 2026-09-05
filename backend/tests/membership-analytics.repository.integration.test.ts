import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { Prisma } from "@prisma/client";
import { parse as parseDotenv } from "dotenv";
import { describe, expect, it } from "@jest/globals";
import { resolveDashboardWindow } from "../src/domain/dashboard-period";
import { MembershipAnalyticsIncompleteHistoryError } from "../src/domain/membership-analytics";
import {
  assertMembershipAnalyticsIntegrationSchema,
  requireMembershipAnalyticsIntegrationAuthority
} from "./membership-analytics-integration-safety";

const enabled = process.env.RUN_MEMBERSHIP_ANALYTICS_MYSQL_INTEGRATION === "true";
const describeIntegration = enabled ? describe : describe.skip;
const rollback = new Error("membership analytics integration rollback");

function requireSafeDatabaseUrl(): URL {
  const envFile = process.env.FORMAL_BACKEND_ENV_FILE?.trim();
  if (!envFile) {
    throw new Error("Membership analytics MySQL integration requires FORMAL_BACKEND_ENV_FILE");
  }
  const parsed = parseDotenv(readFileSync(envFile));
  return new URL(
    requireMembershipAnalyticsIntegrationAuthority({
      enabled: process.env.RUN_MEMBERSHIP_ANALYTICS_MYSQL_INTEGRATION,
      envFile,
      parsed,
      runtime: process.env
    })
  );
}

describeIntegration("MembershipAnalyticsRepository against guarded local MySQL", () => {
  it("executes issuance, post-window void/expiry, in-window removal, provenance rejection, and rollback", async () => {
    const url = requireSafeDatabaseUrl();
    const [{ PrismaClient }, { PrismaMariaDb }, repositoryModule, growthModule] = await Promise.all(
      [
        import("@prisma/client"),
        import("@prisma/adapter-mariadb"),
        import("../src/repositories/membership-analytics.repository"),
        import("../src/repositories/dashboard-growth.repository")
      ]
    );
    const adapter = new PrismaMariaDb(
      {
        host: url.hostname,
        port: url.port ? Number(url.port) : undefined,
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        database: "needo_test",
        charset: "utf8mb4",
        collation: "utf8mb4_unicode_ci",
        connectionLimit: 3,
        acquireTimeout: 10_000,
        idleTimeout: 30_000,
        connectTimeout: 5_000,
        allowPublicKeyRetrieval: false
      },
      { database: "needo_test" }
    );
    const client = new PrismaClient({ adapter });
    const marker = `meman-${randomUUID().replaceAll("-", "").slice(0, 8)}`;
    const numeric = String(Date.now() % 1_000_000).padStart(6, "0");
    const needoId = (index: number) => `u900${numeric}${index}`;
    const evaluatedAt = new Date("2026-08-22T03:00:00.000Z");
    const window = resolveDashboardWindow(
      { period: "custom", from: "2026-08-20", to: "2026-08-20" },
      evaluatedAt
    );
    const inside = new Date("2026-08-20T03:00:00.000Z");
    const before = new Date("2026-08-19T03:00:00.000Z");
    const after = new Date("2026-08-21T03:00:00.000Z");

    try {
      const [columns, indexes, migrations] = await Promise.all([
        client.$queryRaw<Array<{ tableName: string; columnName: string }>>`
          SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName
          FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME IN (
              'users', 'shops', 'customer_profiles', 'shop_customer_memberships',
              'shop_membership_cards', 'shop_membership_card_status_events',
              'shop_membership_card_plan_versions'
            )
        `,
        client.$queryRaw<
          Array<{
            tableName: string;
            indexName: string;
            columnName: string;
            seqInIndex: number | bigint;
            nonUnique: number | bigint;
          }>
        >`
          SELECT TABLE_NAME AS tableName, INDEX_NAME AS indexName,
                 COLUMN_NAME AS columnName, SEQ_IN_INDEX AS seqInIndex,
                 NON_UNIQUE AS nonUnique
          FROM information_schema.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME IN ('shop_membership_cards', 'shop_membership_card_status_events')
        `,
        client.$queryRaw<Array<{ migrationName: string }>>`
          SELECT migration_name AS migrationName
          FROM _prisma_migrations
          WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
        `
      ]);
      assertMembershipAnalyticsIntegrationSchema(
        columns,
        indexes,
        migrations.map((row) => row.migrationName)
      );

      const readBaseline = () => client.$queryRaw<
        Array<{
          userCount: bigint;
          shopCount: bigint;
          membershipCount: bigint;
          cardCount: bigint;
          eventCount: bigint;
        }>
      >`
        SELECT
          (SELECT COUNT(*) FROM users WHERE email LIKE ${`${marker}%`}) AS userCount,
          (SELECT COUNT(*) FROM shops WHERE name = ${marker}) AS shopCount,
          (SELECT COUNT(*) FROM shop_customer_memberships AS membership
            INNER JOIN shops AS shop ON shop.id = membership.shop_id
            WHERE shop.name = ${marker}) AS membershipCount,
          (SELECT COUNT(*) FROM shop_membership_cards WHERE card_no LIKE ${`${marker}%`}) AS cardCount,
          (SELECT COUNT(*) FROM shop_membership_card_status_events AS event
            INNER JOIN shop_membership_cards AS card ON card.id = event.card_id
            WHERE card.card_no LIKE ${`${marker}%`}) AS eventCount
      `;
      const baseline = await readBaseline();
      expect(baseline).toEqual([
        {
          userCount: 0n,
          shopCount: 0n,
          membershipCount: 0n,
          cardCount: 0n,
          eventCount: 0n
        }
      ]);

      await expect(
        client.$transaction(
          async (tx) => {
            const actor = await tx.user.create({
              data: { needoId: needoId(0), email: `${marker}-actor@needo.local`, username: marker }
            });
            const shop = await tx.shop.create({
              data: {
                shopNo: `90${numeric}00`,
                name: marker,
                city: marker,
                address: "Tokyo"
              }
            });
            const repository = new repositoryModule.MembershipAnalyticsRepository(tx);

            const createCard = async (input: {
              index: number;
              issuedAt: Date;
              endedAt?: Date;
              expiresAt?: Date;
              frozenAt?: Date;
              authority?: "issuance" | "migration_backfill";
              issuanceSource?: "OFFLINE_PAID" | "GIFT" | "TRIAL" | "RENEWAL";
            }) => {
              const issuanceSource = input.issuanceSource ?? "OFFLINE_PAID";
              const issuanceSourceMetadata = issuanceSource.toLowerCase();
              const user = await tx.user.create({
                data: {
                  needoId: needoId(input.index),
                  email: `${marker}-${input.index}@needo.local`,
                  username: `${marker}-${input.index}`
                }
              });
              const customer = await tx.customerProfile.create({
                data: { userId: user.id, displayName: `member-${input.index}`, city: marker }
              });
              const membership = await tx.shopCustomerMembership.create({
                data: {
                  shopId: shop.id,
                  customerProfileId: customer.id,
                  status: input.endedAt ? "ENDED" : "ACTIVE",
                  startedAt: new Date(input.issuedAt.getTime() - 24 * 60 * 60 * 1_000),
                  endedAt: input.endedAt
                }
              });
              const card = await tx.shopMembershipCard.create({
                data: {
                  membershipId: membership.id,
                  issuedById: actor.id,
                  cardNo: `${marker}-card-${input.index}`,
                  name: `card-${input.index}`,
                  type: "BENEFIT",
                  status: input.frozenAt
                    ? "FROZEN"
                    : input.expiresAt && input.expiresAt <= evaluatedAt
                      ? "EXPIRED"
                      : "ACTIVE",
                  issuanceSource,
                  issuedAt: input.issuedAt,
                  expiresAt: input.expiresAt,
                  frozenAt: input.frozenAt
                }
              });
              const initial = await tx.shopMembershipCardStatusEvent.create({
                data: {
                  cardId: card.id,
                  fromStatus: null,
                  toStatus: "ACTIVE",
                  source:
                    input.authority === "migration_backfill" ? "MIGRATION_BACKFILL" : "ISSUANCE",
                  occurredAt: input.issuedAt,
                  reasonCode:
                    input.authority === "migration_backfill"
                      ? "historical_card_issued"
                      : "card_issued",
                  actorUserId: input.authority === "migration_backfill" ? null : actor.id,
                  metadata: { issuanceSource: issuanceSourceMetadata },
                  eventKey:
                    input.authority === "migration_backfill"
                      ? `membership-card:${card.publicId}:backfill-issued`
                      : `membership-card:${card.publicId}:issued`
                }
              });
              const frozen = input.frozenAt
                ? await tx.shopMembershipCardStatusEvent.create({
                    data: {
                      cardId: card.id,
                      fromStatus: "ACTIVE",
                      toStatus: "FROZEN",
                      source: "STATUS_TRANSITION",
                      occurredAt: input.frozenAt,
                      reasonCode: "historical_card_frozen",
                      actorUserId: null,
                      metadata: undefined,
                      eventKey: `membership-card:${card.publicId}:backfill-frozen`
                    }
                  })
                : null;
              return { card, initial, frozen };
            };

            const postWindowFrozen = await createCard({
              index: 1,
              issuedAt: inside,
              endedAt: after,
              frozenAt: after,
              authority: "migration_backfill"
            });
            await createCard({ index: 2, issuedAt: inside, endedAt: after, expiresAt: after });
            const issuedCard = await createCard({ index: 3, issuedAt: inside });
            await createCard({ index: 6, issuedAt: inside, issuanceSource: "GIFT" });
            await createCard({ index: 7, issuedAt: inside, issuanceSource: "TRIAL" });
            await createCard({ index: 8, issuedAt: inside, issuanceSource: "RENEWAL" });
            await createCard({
              index: 4,
              issuedAt: before,
              endedAt: inside,
              frozenAt: inside,
              authority: "migration_backfill"
            });
            const migrationBackfill = await createCard({
              index: 5,
              issuedAt: new Date("2026-08-17T03:00:00.000Z"),
              endedAt: new Date("2026-08-18T03:00:00.000Z"),
              expiresAt: new Date("2026-08-18T03:00:00.000Z"),
              authority: "migration_backfill"
            });

            await expect(
              repository.getTrend({
                scope: { kind: "platform" },
                city: marker,
                window,
                evaluatedAt
              })
            ).resolves.toMatchObject([
              { seriesKey: "added", points: [{ value: 6 }] },
              { seriesKey: "removed", points: [{ value: 1 }] },
              { seriesKey: "net", points: [{ value: 5 }] }
            ]);
            const list = await repository.listAddedMembers({
              scope: { kind: "platform" },
              city: marker,
              window,
              evaluatedAt,
              page: 1,
              pageSize: 20
            });
            expect(list.total).toBe(6);
            expect(list.list.map((item) => item.memberStatus).sort()).toEqual([
              "active",
              "active",
              "active",
              "active",
              "inactive",
              "inactive"
            ]);
            for (const source of ["gift", "trial", "renewal"] as const) {
              expect(
                list.list.find((item) => item.acquisitionSource === source)?.firstPaidAt
              ).toBeNull();
            }
            const growth = await new growthModule.DashboardGrowthRepository(tx).getGrowthFacts({
              scope: { kind: "platform" },
              city: marker,
              window
            });
            expect(growth.newPaidMembers).toEqual({
              current: 3,
              previous: 1,
              dataStatus: "ready"
            });

            await tx.shopMembershipCardStatusEvent.update({
              where: { id: postWindowFrozen.initial.id },
              data: { metadata: { issuanceSource: "gift" } }
            });
            await expect(
              repository.getTrend({
                scope: { kind: "platform" },
                city: marker,
                window,
                evaluatedAt
              })
            ).rejects.toBeInstanceOf(MembershipAnalyticsIncompleteHistoryError);
            await tx.shopMembershipCardStatusEvent.update({
              where: { id: postWindowFrozen.initial.id },
              data: { metadata: { issuanceSource: "offline_paid" } }
            });

            const assertCorruptionRejected = async (
              corrupt: () => Promise<unknown>,
              restore: () => Promise<unknown>
            ) => {
              await corrupt();
              await expect(
                repository.getTrend({
                  scope: { kind: "platform" },
                  city: marker,
                  window,
                  evaluatedAt
                })
              ).rejects.toBeInstanceOf(MembershipAnalyticsIncompleteHistoryError);
              await restore();
            };
            const issuanceId = issuedCard.initial.id;
            await assertCorruptionRejected(
              () =>
                tx.shopMembershipCardStatusEvent.update({
                  where: { id: issuanceId },
                  data: { reasonCode: "wrong_reason" }
                }),
              () =>
                tx.shopMembershipCardStatusEvent.update({
                  where: { id: issuanceId },
                  data: { reasonCode: "card_issued" }
                })
            );
            await assertCorruptionRejected(
              () =>
                tx.shopMembershipCardStatusEvent.update({
                  where: { id: issuanceId },
                  data: { actorUserId: null }
                }),
              () =>
                tx.shopMembershipCardStatusEvent.update({
                  where: { id: issuanceId },
                  data: { actorUserId: actor.id }
                })
            );
            await assertCorruptionRejected(
              () =>
                tx.shopMembershipCardStatusEvent.update({
                  where: { id: issuanceId },
                  data: { eventKey: `${marker}-wrong-issued` }
                }),
              () =>
                tx.shopMembershipCardStatusEvent.update({
                  where: { id: issuanceId },
                  data: { eventKey: `membership-card:${issuedCard.card.publicId}:issued` }
                })
            );
            await assertCorruptionRejected(
              () =>
                tx.shopMembershipCardStatusEvent.update({
                  where: { id: issuanceId },
                  data: { source: "MIGRATION_BACKFILL" }
                }),
              () =>
                tx.shopMembershipCardStatusEvent.update({
                  where: { id: issuanceId },
                  data: { source: "ISSUANCE" }
                })
            );
            await assertCorruptionRejected(
              () =>
                tx.shopMembershipCard.update({
                  where: { id: issuedCard.card.id },
                  data: { issuanceSource: "GIFT" }
                }),
              () =>
                tx.shopMembershipCard.update({
                  where: { id: issuedCard.card.id },
                  data: { issuanceSource: "OFFLINE_PAID" }
                })
            );
            await assertCorruptionRejected(
              () =>
                tx.shopMembershipCardStatusEvent.update({
                  where: { id: migrationBackfill.initial.id },
                  data: { actorUserId: actor.id }
                }),
              () =>
                tx.shopMembershipCardStatusEvent.update({
                  where: { id: migrationBackfill.initial.id },
                  data: { actorUserId: null }
                })
            );
            await assertCorruptionRejected(
              () =>
                tx.shopMembershipCardStatusEvent.update({
                  where: { id: migrationBackfill.initial.id },
                  data: { reasonCode: "card_issued" }
                }),
              () =>
                tx.shopMembershipCardStatusEvent.update({
                  where: { id: migrationBackfill.initial.id },
                  data: { reasonCode: "historical_card_issued" }
                })
            );
            await assertCorruptionRejected(
              () =>
                tx.shopMembershipCardStatusEvent.update({
                  where: { id: migrationBackfill.initial.id },
                  data: { source: "ISSUANCE" }
                }),
              () =>
                tx.shopMembershipCardStatusEvent.update({
                  where: { id: migrationBackfill.initial.id },
                  data: { source: "MIGRATION_BACKFILL" }
                })
            );
            await assertCorruptionRejected(
              () =>
                tx.shopMembershipCardStatusEvent.update({
                  where: { id: migrationBackfill.initial.id },
                  data: { metadata: { issuanceSource: "offline_paid", extra: true } }
                }),
              () =>
                tx.shopMembershipCardStatusEvent.update({
                  where: { id: migrationBackfill.initial.id },
                  data: { metadata: { issuanceSource: "offline_paid" } }
                })
            );
            await assertCorruptionRejected(
              () =>
                tx.shopMembershipCardStatusEvent.update({
                  where: { id: migrationBackfill.initial.id },
                  data: { eventKey: `${marker}-wrong-backfill` }
                }),
              () =>
                tx.shopMembershipCardStatusEvent.update({
                  where: { id: migrationBackfill.initial.id },
                  data: {
                    eventKey: `membership-card:${migrationBackfill.card.publicId}:backfill-issued`
                  }
                })
            );

            const frozenEvent = postWindowFrozen.frozen!;
            const exactFrozenEvent = {
              fromStatus: "ACTIVE" as const,
              toStatus: "FROZEN" as const,
              source: "STATUS_TRANSITION" as const,
              occurredAt: after,
              reasonCode: "historical_card_frozen",
              actorUserId: null,
              metadata: Prisma.DbNull,
              eventKey: `membership-card:${postWindowFrozen.card.publicId}:backfill-frozen`
            };
            const frozenEventCorruptions = [
              {
                corrupt: { toStatus: "VOID" as const },
                restore: { toStatus: exactFrozenEvent.toStatus }
              },
              {
                corrupt: { source: "ISSUANCE" as const },
                restore: { source: exactFrozenEvent.source }
              },
              {
                corrupt: { occurredAt: new Date(after.getTime() + 1) },
                restore: { occurredAt: exactFrozenEvent.occurredAt }
              },
              {
                corrupt: { reasonCode: "wrong_frozen_reason" },
                restore: { reasonCode: exactFrozenEvent.reasonCode }
              },
              {
                corrupt: { actorUserId: actor.id },
                restore: { actorUserId: exactFrozenEvent.actorUserId }
              },
              {
                corrupt: { metadata: { unsupported: true } },
                restore: { metadata: exactFrozenEvent.metadata }
              },
              {
                corrupt: { eventKey: `${marker}-wrong-frozen` },
                restore: { eventKey: exactFrozenEvent.eventKey }
              }
            ];
            await expect(
              tx.shopMembershipCardStatusEvent.update({
                where: { id: frozenEvent.id },
                data: { fromStatus: "FROZEN" }
              })
            ).rejects.toThrow("shop_membership_card_status_events_transition_distinct");
            for (const mutation of frozenEventCorruptions) {
              await assertCorruptionRejected(
                () =>
                  tx.shopMembershipCardStatusEvent.update({
                    where: { id: frozenEvent.id },
                    data: mutation.corrupt
                  }),
                () =>
                  tx.shopMembershipCardStatusEvent.update({
                    where: { id: frozenEvent.id },
                    data: mutation.restore
                  })
              );
            }
            await assertCorruptionRejected(
              () =>
                tx.shopMembershipCard.update({
                  where: { id: postWindowFrozen.card.id },
                  data: { frozenAt: new Date(after.getTime() - 1) }
                }),
              () =>
                tx.shopMembershipCard.update({
                  where: { id: postWindowFrozen.card.id },
                  data: { frozenAt: after }
                })
            );

            throw rollback;
          },
          { timeout: 30_000 }
        )
      ).rejects.toBe(rollback);

      await expect(readBaseline()).resolves.toEqual(baseline);
    } finally {
      await client.$disconnect();
    }
  }, 45_000);
});
