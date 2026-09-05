import fs from "node:fs";
import path from "node:path";

const backendRoot = path.resolve(__dirname, "..");
const schema = fs.readFileSync(path.join(backendRoot, "prisma/schema.prisma"), "utf8");
const migrationPath = path.join(
  backendRoot,
  "prisma/migrations/20260901020000_entity_engagement_nearby_ranking/migration.sql"
);

describe("Entity engagement and nearby-ranking schema", () => {
  it("models account-owned favorites, append-only share events, and private technician coordinates", () => {
    expect(schema).toContain("enum EntityShareChannel");
    expect(schema).toContain("NEEDO_MESSAGE");
    expect(schema).toContain("SYSTEM_SHARE");

    const favorite = schema.match(/model EntityFavorite \{([\s\S]*?)\n\}/u)?.[1];
    expect(favorite).toBeDefined();
    expect(favorite).toMatch(/userId\s+Int\s+@map\("user_id"\)/u);
    expect(favorite).toMatch(/shopId\s+Int\?\s+@map\("shop_id"\)/u);
    expect(favorite).toMatch(/technicianProfileId\s+Int\?\s+@map\("technician_profile_id"\)/u);
    expect(favorite).toMatch(
      /activeKey\s+String\?\s+@unique.*@map\("active_key"\).*@db\.VarChar\(191\)/u
    );
    expect(favorite).toContain('@@map("entity_favorites")');

    const share = schema.match(/model EntityShareEvent \{([\s\S]*?)\n\}/u)?.[1];
    expect(share).toBeDefined();
    expect(share).toMatch(/actorUserId\s+Int\s+@map\("actor_user_id"\)/u);
    expect(share).toMatch(/actorIdentityId\s+Int\s+@map\("actor_identity_id"\)/u);
    expect(share).toMatch(/channel\s+EntityShareChannel/u);
    expect(share).toMatch(
      /messageId\s+Int\?\s+@unique(?:\(map: "entity_share_events_message_id_key"\))? @map\("message_id"\)/u
    );
    expect(share).toMatch(
      /idempotencyKey\s+String\s+@map\("idempotency_key"\) @db\.VarChar\(160\)/u
    );
    expect(share).toMatch(
      /requestFingerprint\s+String\s+@map\("request_fingerprint"\) @db\.Char\(64\)/u
    );
    expect(share).toContain(
      '@@unique([actorUserId, idempotencyKey], map: "entity_share_actor_idempotency_key")'
    );
    expect(share).toContain('@@map("entity_share_events")');

    for (const model of [favorite, share]) {
      expect(model).toMatch(/createdAt\s+DateTime\s+@default\(now\(\)\) @map\("created_at"\)/u);
      expect(model).toMatch(/updatedAt\s+DateTime\s+@updatedAt @map\("updated_at"\)/u);
      expect(model).toMatch(/deletedAt\s+DateTime\?\s+@map\("deleted_at"\)/u);
    }

    const technician = schema.match(/model TechnicianProfile \{([\s\S]*?)\n\}/u)?.[1];
    expect(technician).toMatch(
      /baseLatitude\s+Decimal\?\s+@map\("base_latitude"\) @db\.Decimal\(10, 7\)/u
    );
    expect(technician).toMatch(
      /baseLongitude\s+Decimal\?\s+@map\("base_longitude"\) @db\.Decimal\(10, 7\)/u
    );
    expect(technician).toContain(
      '@@index([baseLatitude, baseLongitude], map: "technician_profiles_base_coordinates_idx")'
    );

    const shop = schema.match(/model Shop \{([\s\S]*?)\n\}/u)?.[1];
    expect(shop).toContain('@@index([latitude, longitude], map: "shops_coordinates_idx")');
  });

  it("ships exact-target, active uniqueness, channel, coordinate-pair, foreign-key, and lookup guards", () => {
    expect(fs.existsSync(migrationPath)).toBe(true);
    const migration = fs.readFileSync(migrationPath, "utf8");

    expect(migration).toContain("CREATE TABLE `entity_favorites`");
    expect(migration).toContain("CREATE TABLE `entity_share_events`");
    expect(migration).toContain("entity_favorites_exactly_one_target_chk");
    expect(migration).toContain("entity_share_events_exactly_one_target_chk");
    expect(migration).toContain("entity_share_events_channel_payload_chk");
    expect(migration).toContain("technician_profiles_base_coordinate_pair_chk");
    expect(migration).toContain(
      "(`shop_id` IS NOT NULL) + (`technician_profile_id` IS NOT NULL) = 1"
    );
    expect(migration).toContain("(`base_latitude` IS NULL) = (`base_longitude` IS NULL)");

    expect(migration).toContain("UNIQUE INDEX `entity_favorites_active_key_key` (`active_key`)");
    expect(migration).toContain("UNIQUE INDEX `entity_share_events_message_id_key` (`message_id`)");
    expect(migration).toContain(
      "UNIQUE INDEX `entity_share_actor_idempotency_key` (`actor_user_id`, `idempotency_key`)"
    );
    expect(migration).toContain(
      "INDEX `entity_favorites_user_deleted_idx` (`user_id`, `deleted_at`)"
    );
    expect(migration).toContain(
      "INDEX `entity_favorites_shop_deleted_idx` (`shop_id`, `deleted_at`)"
    );
    expect(migration).toContain(
      "INDEX `entity_favorites_technician_deleted_idx` (`technician_profile_id`, `deleted_at`)"
    );
    expect(migration).toContain(
      "INDEX `entity_share_events_shop_created_idx` (`shop_id`, `created_at`)"
    );
    expect(migration).toContain(
      "INDEX `entity_share_events_technician_created_idx` (`technician_profile_id`, `created_at`)"
    );
    expect(migration).toMatch(
      /CREATE INDEX `technician_profiles_base_coordinates_idx`\s+ON `technician_profiles` \(`base_latitude`, `base_longitude`\)/u
    );
    expect(migration).toMatch(
      /CREATE INDEX `shops_coordinates_idx`\s+ON `shops` \(`latitude`, `longitude`\)/u
    );

    for (const foreignKey of [
      "entity_favorites_user_id_fkey",
      "entity_favorites_shop_id_fkey",
      "entity_favorites_technician_profile_id_fkey",
      "entity_share_events_actor_user_id_fkey",
      "entity_share_events_actor_identity_id_fkey",
      "entity_share_events_recipient_user_id_fkey",
      "entity_share_events_recipient_identity_id_fkey",
      "entity_share_events_shop_id_fkey",
      "entity_share_events_technician_profile_id_fkey",
      "entity_share_events_conversation_id_fkey",
      "entity_share_events_message_id_fkey"
    ]) {
      expect(migration).toContain(foreignKey);
    }

    const overlongMySqlIdentifiers = [...migration.matchAll(/`([^`]+)`/gu)]
      .map((match) => match[1])
      .filter((identifier) => identifier.length > 64);
    expect(overlongMySqlIdentifiers).toEqual([]);
  });
});
