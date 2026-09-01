import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("formal membership acquisition source schema", () => {
  const schema = read("prisma/schema.prisma");
  const migration = read("prisma/migrations/20260901103000_membership_acquisition_sources/migration.sql");

  it("declares every acquisition source without a lossy fallback", () => {
    for (const source of [
      "OFFLINE_PAID", "ONLINE_PAID", "GIFT", "TRIAL", "RENEWAL",
      "HISTORICAL_REPLACEMENT", "MANUAL_GRANT"
    ]) expect(schema).toContain(source);
    expect(migration).toContain("ENUM('offline_paid', 'online_paid', 'gift', 'trial', 'renewal', 'historical_replacement', 'manual_grant')");
  });

  it("creates and backfills immutable initial lifecycle evidence at issued_at", () => {
    expect(schema).toContain("model ShopMembershipCardStatusEvent");
    expect(schema).toContain("eventKey");
    expect(schema).toContain("@@index([cardId, occurredAt, id, deletedAt], map: \"shop_membership_card_status_events_card_time_idx\")");
    expect(migration).toContain("CREATE TABLE `shop_membership_card_status_events`");
    expect(migration).toContain("CONCAT('membership-card:', `card`.`public_id`, ':backfill-issued')");
    expect(migration).toContain("`card`.`issued_at`");
    expect(migration).not.toContain("`card`.`updated_at`");
    expect(migration).toContain("'active'");
    expect(migration).toContain("'migration_backfill'");
    expect(migration).toContain("'historical_card_issued'");
    expect(migration).toContain("`actor_user_id` INTEGER NULL");
    expect(migration).toContain("`event_key` VARCHAR(160) NOT NULL");
    expect(migration).toContain("shop_membership_card_status_events_event_key");
    expect(migration).toContain("CHECK (CHAR_LENGTH(TRIM(`reason_code`)) > 0)");
    expect(migration).toContain("CHECK (`deleted_at` IS NULL)");
    expect(migration).not.toContain(":expires");
    expect(schema).toContain("0->1 additions, 1->0 removals");
    expect(schema).toContain("Overlapping");
    expect(schema).toContain("Tokyo half-open buckets");
  });

  it("adds acquisition history, lifecycle and future overlap lookup indexes", () => {
    const compact = migration.replace(/\s+/gu, " ");
    expect(compact).toContain("CREATE INDEX `shop_membership_cards_source_issued_id_idx` ON `shop_membership_cards`(`issuance_source`, `issued_at`, `id`)");
    expect(compact).toContain("CREATE INDEX `shop_membership_cards_membership_source_issued_id_idx` ON `shop_membership_cards`(`membership_id`, `issuance_source`, `issued_at`, `id`)");
    expect(compact).toContain("CREATE INDEX `shop_membership_cards_status_issued_expiry_idx` ON `shop_membership_cards`(`status`, `issued_at`, `expires_at`, `deleted_at`, `membership_id`)");
    expect(compact).toContain("INDEX `shop_membership_card_status_events_card_time_idx` (`card_id`, `occurred_at`, `id`, `deleted_at`)");
    expect(compact).toContain("INDEX `shop_membership_card_status_events_status_time_idx` (`to_status`, `occurred_at`, `id`, `deleted_at`)");
  });

  it("deploys backoffice analytics permission only to platform admin and operator", () => {
    expect(migration).toContain("'backoffice.member.analytics.view'");
    expect(migration).toContain("`roles`.`code` IN ('admin', 'operator')");
    expect(migration).not.toContain("`roles`.`code` IN ('admin', 'operator', 'merchant_owner')");
  });
});
