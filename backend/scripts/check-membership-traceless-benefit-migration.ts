import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import mariadb from "mariadb";
import {
  resolveExchangeCancellationSchemaEnvironment,
  verifyExchangeCancellationSchemaSocketAdmin
} from "./check-exchange-cancellation-schema";

const migrationPath = (name: string) =>
  join(__dirname, "../prisma/migrations", name, "migration.sql");

const applySql = async (
  connection: { query(sql: string): Promise<unknown> },
  sql: string
) => {
  for (const statement of sql
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)) {
    await connection.query(statement);
  }
};

async function main(): Promise<void> {
  assert.equal(
    process.env.ALLOW_MEMBERSHIP_TRACELESS_MIGRATION_CHECK,
    "true",
    "explicit membership migration-check opt-in required"
  );
  const { connectionOptions, socketPath } = resolveExchangeCancellationSchemaEnvironment({
    ...process.env,
    ALLOW_EXCHANGE_CANCELLATION_SCHEMA_CHECK: "true"
  });
  const database = `needo_membership_traceless_${randomBytes(12).toString("hex")}`;
  assert(/^needo_membership_traceless_[a-f0-9]{24}$/u.test(database));

  const foundation = readFileSync(
    migrationPath("20260901180000_platform_membership_foundation"),
    "utf8"
  );
  const localization = readFileSync(
    migrationPath("20260901220000_platform_membership_benefit_localization"),
    "utf8"
  );
  const traceless = readFileSync(
    migrationPath("20260906100000_platform_membership_traceless_recall"),
    "utf8"
  );

  const connection = await mariadb.createConnection(connectionOptions);
  await verifyExchangeCancellationSchemaSocketAdmin(connection, socketPath);
  let created = false;
  let cleanupVerified = false;
  let passed = 0;
  let stage = "scratch_setup";

  try {
    await connection.query(
      `CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    created = true;
    await connection.query(`USE \`${database}\``);
    await connection.query("SET SESSION default_storage_engine = 'InnoDB'");
    await connection.query("CREATE TABLE users (id INTEGER PRIMARY KEY) ENGINE=InnoDB");
    stage = "baseline_migrations";
    await applySql(connection, foundation);
    await applySql(connection, localization);

    const cloneVersion = async (
      tierCode: "silver" | "gold" | "black_diamond",
      status: "draft" | "archived",
      deleted: boolean
    ) => {
      await connection.query(
        `INSERT INTO platform_membership_tier_versions (
          public_id, tier_id, version, status, duration_days, monthly_value_ndp,
          annual_billing_months, experience_multiplier, detail_accent_color,
          detail_surface_color, detail_item_surface_color, detail_outer_border_color,
          detail_item_border_color, detail_avatar_border_color, simple_top_color,
          simple_bottom_color, description, effective_from, effective_to, published_at,
          created_by_id, published_by_id, lock_version, created_at, updated_at, deleted_at
        )
        SELECT UUID(), version.tier_id, 2, ?, version.duration_days, version.monthly_value_ndp,
          version.annual_billing_months, version.experience_multiplier,
          version.detail_accent_color, version.detail_surface_color,
          version.detail_item_surface_color, version.detail_outer_border_color,
          version.detail_item_border_color, version.detail_avatar_border_color,
          version.simple_top_color, version.simple_bottom_color, version.description,
          version.effective_from, version.effective_to,
          CASE WHEN ? = 'archived' THEN version.published_at ELSE NULL END,
          NULL, NULL, 1, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3),
          CASE WHEN ? THEN CURRENT_TIMESTAMP(3) ELSE NULL END
        FROM platform_membership_tier_versions AS version
        INNER JOIN platform_membership_tiers AS tier ON tier.id = version.tier_id
        WHERE tier.code = ? AND version.version = 1`,
        [status, status, deleted, tierCode]
      );
    };
    await cloneVersion("gold", "draft", false);
    await cloneVersion("black_diamond", "archived", false);
    await cloneVersion("silver", "draft", true);

    stage = "first_traceless_migration";
    await applySql(connection, traceless);

    stage = "catalog_assertions";
    const catalogRows = await connection.query(`
      SELECT code,
        JSON_UNQUOTE(JSON_EXTRACT(name_translations, '$.zh')) AS zh_name,
        JSON_UNQUOTE(JSON_EXTRACT(description_translations, '$.ja')) AS ja_description
      FROM platform_membership_benefits
      WHERE code = 'traceless_recall' AND deleted_at IS NULL
    `);
    assert.equal(catalogRows.length, 1);
    assert.equal(catalogRows[0].zh_name, "聊天无痕撤回");
    assert.match(catalogRows[0].ja_description, /取り消しました/u);
    passed += 3;

    stage = "coverage_assertions";
    const coverage = await connection.query(`
      SELECT COUNT(*) AS active_versions,
        SUM(relation.id IS NOT NULL) AS covered_versions,
        SUM(tier.code = 'free' AND relation.is_enabled = FALSE) AS free_disabled,
        SUM(tier.code <> 'free' AND relation.is_enabled = TRUE) AS paid_enabled
      FROM platform_membership_tier_versions AS version
      INNER JOIN platform_membership_tiers AS tier ON tier.id = version.tier_id
      LEFT JOIN platform_membership_benefits AS benefit
        ON benefit.code = 'traceless_recall' AND benefit.deleted_at IS NULL
      LEFT JOIN platform_membership_tier_benefits AS relation
        ON relation.tier_version_id = version.id
        AND relation.benefit_id = benefit.id
        AND relation.deleted_at IS NULL
      WHERE version.deleted_at IS NULL
    `);
    assert.equal(Number(coverage[0].covered_versions), Number(coverage[0].active_versions));
    assert.equal(Number(coverage[0].free_disabled), 1);
    assert.equal(
      Number(coverage[0].paid_enabled),
      Number(coverage[0].active_versions) - 1
    );
    passed += 3;

    const deletedVersionRows = await connection.query(`
      SELECT COUNT(*) AS total
      FROM platform_membership_tier_versions AS version
      INNER JOIN platform_membership_tiers AS tier ON tier.id = version.tier_id
      INNER JOIN platform_membership_tier_benefits AS relation ON relation.tier_version_id = version.id
      INNER JOIN platform_membership_benefits AS benefit ON benefit.id = relation.benefit_id
      WHERE tier.code = 'silver' AND version.version = 2
        AND benefit.code = 'traceless_recall'
    `);
    assert.equal(Number(deletedVersionRows[0].total), 0);
    passed += 1;

    stage = "replay_fixture";
    await connection.query(`
      UPDATE platform_membership_tier_benefits AS relation
      INNER JOIN platform_membership_tier_versions AS version ON version.id = relation.tier_version_id
      INNER JOIN platform_membership_tiers AS tier ON tier.id = version.tier_id
      INNER JOIN platform_membership_benefits AS benefit ON benefit.id = relation.benefit_id
      SET relation.is_enabled = FALSE,
          relation.configuration_json = JSON_OBJECT('retained', 'yes'),
          relation.deleted_at = CURRENT_TIMESTAMP(3)
      WHERE tier.code = 'gold' AND version.version = 2
        AND benefit.code = 'traceless_recall'
    `);
    stage = "replay_migration";
    await applySql(connection, traceless);

    stage = "replay_assertions";
    const replayRows = await connection.query(`
      SELECT relation.is_enabled, relation.configuration_json, relation.deleted_at
      FROM platform_membership_tier_benefits AS relation
      INNER JOIN platform_membership_tier_versions AS version ON version.id = relation.tier_version_id
      INNER JOIN platform_membership_tiers AS tier ON tier.id = version.tier_id
      INNER JOIN platform_membership_benefits AS benefit ON benefit.id = relation.benefit_id
      WHERE tier.code = 'gold' AND version.version = 2
        AND benefit.code = 'traceless_recall'
    `);
    assert.equal(replayRows.length, 1);
    assert.equal(Number(replayRows[0].is_enabled), 0);
    const retainedConfiguration =
      typeof replayRows[0].configuration_json === "string"
        ? JSON.parse(replayRows[0].configuration_json)
        : replayRows[0].configuration_json;
    assert.deepEqual(retainedConfiguration, { retained: "yes" });
    assert.equal(replayRows[0].deleted_at, null);
    passed += 4;
  } finally {
    try {
      if (created) {
        await connection.query(`DROP DATABASE \`${database}\``);
        const schemas = await connection.query(
          "SELECT COUNT(*) AS total FROM information_schema.schemata WHERE schema_name=?",
          [database]
        );
        assert.equal(Number(schemas[0].total), 0, "scratch database cleanup failed");
        cleanupVerified = true;
      }
    } finally {
      await connection.end();
      console.log(
        JSON.stringify({
          check: "membership-traceless-benefit-migration",
          stage,
          passed,
          cleanupVerified,
          existingDatabaseModified: false
        })
      );
    }
  }
}

if (process.env.JEST_WORKER_ID === undefined && require.main === module) {
  void main().catch((error: unknown) => {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "CHECK_FAILED";
    const message = error instanceof assert.AssertionError ? error.message : undefined;
    console.error(JSON.stringify({ code, ...(message ? { message } : {}) }));
    process.exitCode = 1;
  });
}
