import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import mariadb from "mariadb";
import {
  resolveExchangeCancellationSchemaEnvironment,
  verifyExchangeCancellationSchemaSocketAdmin
} from "./check-exchange-cancellation-schema";

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

const errno = (error: unknown): number | undefined =>
  error && typeof error === "object" && "errno" in error ? Number(error.errno) : undefined;

async function main(): Promise<void> {
  assert.equal(
    process.env.ALLOW_MEMBERSHIP_GRADIENT_MIGRATION_CHECK,
    "true",
    "explicit membership gradient migration-check opt-in required"
  );
  const { connectionOptions, socketPath } = resolveExchangeCancellationSchemaEnvironment({
    ...process.env,
    ALLOW_EXCHANGE_CANCELLATION_SCHEMA_CHECK: "true"
  });
  const database = `needo_membership_gradient_${randomBytes(12).toString("hex")}`;
  assert(/^needo_membership_gradient_[a-f0-9]{24}$/u.test(database));
  const migration = readFileSync(
    join(
      __dirname,
      "../prisma/migrations/20260906130000_platform_membership_three_color_detail_surface/migration.sql"
    ),
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
    await connection.query(`
      CREATE TABLE platform_membership_tier_versions (
        id INTEGER NOT NULL AUTO_INCREMENT PRIMARY KEY,
        detail_accent_color CHAR(7) NOT NULL,
        detail_surface_color CHAR(7) NOT NULL,
        detail_item_surface_color CHAR(7) NOT NULL,
        detail_outer_border_color CHAR(7) NOT NULL,
        detail_item_border_color CHAR(7) NOT NULL,
        detail_avatar_border_color CHAR(7) NOT NULL,
        simple_top_color CHAR(7) NOT NULL,
        simple_bottom_color CHAR(7) NOT NULL,
        CONSTRAINT platform_membership_tier_versions_colors_chk CHECK (
          detail_accent_color REGEXP '^#[0-9A-Fa-f]{6}$'
          AND detail_surface_color REGEXP '^#[0-9A-Fa-f]{6}$'
          AND detail_item_surface_color REGEXP '^#[0-9A-Fa-f]{6}$'
          AND detail_outer_border_color REGEXP '^#[0-9A-Fa-f]{6}$'
          AND detail_item_border_color REGEXP '^#[0-9A-Fa-f]{6}$'
          AND detail_avatar_border_color REGEXP '^#[0-9A-Fa-f]{6}$'
          AND simple_top_color REGEXP '^#[0-9A-Fa-f]{6}$'
          AND simple_bottom_color REGEXP '^#[0-9A-Fa-f]{6}$'
        )
      ) ENGINE=InnoDB
    `);
    await connection.query(`
      INSERT INTO platform_membership_tier_versions (
        detail_accent_color, detail_surface_color, detail_item_surface_color,
        detail_outer_border_color, detail_item_border_color,
        detail_avatar_border_color, simple_top_color, simple_bottom_color
      ) VALUES
        ('#A7FF1E', '#10242D', '#09161D', '#5D8B35', '#29424D', '#79A84B', '#0D2F27', '#132630'),
        ('#F4C967', '#302818', '#201A10', '#A98645', '#66552F', '#D0A857', '#382C13', '#241E12')
    `);

    stage = "migration";
    await applySql(connection, migration);

    stage = "backfill_assertions";
    const rows = await connection.query(`
      SELECT detail_surface_color, detail_surface_middle_color, detail_surface_bottom_color
      FROM platform_membership_tier_versions ORDER BY id ASC
    `);
    assert.deepEqual(
      rows.map((row: Record<string, unknown>) => [
        row.detail_surface_color,
        row.detail_surface_middle_color,
        row.detail_surface_bottom_color
      ]),
      [
        ["#10242D", "#10242D", "#10242D"],
        ["#302818", "#302818", "#302818"]
      ]
    );
    passed += 2;

    const columns = await connection.query(
      `SELECT column_name AS columnName, is_nullable AS isNullable
       FROM information_schema.columns
       WHERE table_schema = ? AND table_name = 'platform_membership_tier_versions'
         AND column_name IN ('detail_surface_middle_color', 'detail_surface_bottom_color')
       ORDER BY column_name`,
      [database]
    );
    assert.equal(columns.length, 2);
    assert(
      columns.every((row: Record<string, unknown>) => row.isNullable === "NO"),
      "gradient columns must be non-nullable"
    );
    passed += 2;

    stage = "constraint_assertion";
    let rejected: unknown;
    try {
      await connection.query(
        "UPDATE platform_membership_tier_versions SET detail_surface_middle_color = '#12ZZ99' WHERE id = 1"
      );
    } catch (error) {
      rejected = error;
    }
    assert(
      [3819, 4025].includes(errno(rejected) ?? 0),
      `expected invalid gradient color rejection, received ${errno(rejected) ?? "no database error"}`
    );
    passed += 1;
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
          check: "membership-gradient-migration",
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
