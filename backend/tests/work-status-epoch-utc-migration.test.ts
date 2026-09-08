import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const migrationPath = resolve(
  __dirname,
  "../prisma/migrations/20260906210000_work_status_epoch_utc_bootstrap/migration.sql"
);
const now = "2026-09-06 12:00:00.123";
const future = "2026-09-06 21:00:00.123";
const historyTables = [
  "technician_work_states",
  "technician_work_events",
  "technician_attendance_incidents"
] as const;

// Execute the migration's actual UPDATE without rewriting its predicates. This
// checks the portable SQL behavior; MySQL timezone/DDL acceptance is separate.
function withDatabase(run: (database: DatabaseSync, migration: string) => void) {
  expect(existsSync(migrationPath)).toBe(true);
  const migration = readFileSync(migrationPath, "utf8");
  const database = new DatabaseSync(":memory:");
  database.function("UTC_TIMESTAMP", (precision) => {
    expect(precision).toBe(3);
    return now;
  });
  database.exec(`CREATE TABLE technician_attendance_epochs (
    id INTEGER PRIMARY KEY, activated_at TEXT, created_at TEXT,
    updated_at TEXT, deleted_at TEXT
  )`);
  for (const table of historyTables) {
    database.exec(`CREATE TABLE ${table} (id INTEGER PRIMARY KEY, deleted_at TEXT)`);
  }
  try {
    run(database, migration);
  } finally {
    database.close();
  }
}

function insertEpoch(database: DatabaseSync, activatedAt = future, id = 1, deletedAt: string | null = null) {
  database.prepare("INSERT INTO technician_attendance_epochs VALUES (?, ?, ?, ?, ?)")
    .run(id, activatedAt, future, future, deletedAt);
}

function epochs(database: DatabaseSync) {
  return database.prepare("SELECT * FROM technician_attendance_epochs ORDER BY id").all();
}

describe("work-status UTC bootstrap corrective migration", () => {
  it("corrects a fresh future bootstrap to UTC and is idempotent", () => {
    withDatabase((database, migration) => {
      insertEpoch(database);
      database.exec(migration);
      expect(epochs(database)).toEqual([{
        id: 1, activated_at: now, created_at: future, updated_at: now, deleted_at: null
      }]);
      const corrected = epochs(database);
      database.exec(migration);
      expect(epochs(database)).toEqual(corrected);
    });
  });

  it.each(["2026-09-06 11:59:59.999", now])("preserves an already valid epoch at %s", (activatedAt) => {
    withDatabase((database, migration) => {
      insertEpoch(database, activatedAt);
      const before = epochs(database);
      database.exec(migration);
      expect(epochs(database)).toEqual(before);
    });
  });

  it.each(historyTables.flatMap((table) => [
    { table, deletedAt: null },
    { table, deletedAt: now }
  ]))("preserves a future epoch when $table has a row with deleted_at=$deletedAt", ({ table, deletedAt }) => {
    withDatabase((database, migration) => {
      insertEpoch(database);
      database.prepare(`INSERT INTO ${table} VALUES (1, ?)`).run(deletedAt);
      const before = epochs(database);
      database.exec(migration);
      expect(epochs(database)).toEqual(before);
      expect(database.prepare(`SELECT * FROM ${table}`).all()).toEqual([{ id: 1, deleted_at: deletedAt }]);
    });
  });

  it("preserves other and soft-deleted epochs", () => {
    withDatabase((database, migration) => {
      insertEpoch(database, future, 1, now);
      insertEpoch(database, future, 2);
      const before = epochs(database);
      database.exec(migration);
      expect(epochs(database)).toEqual(before);
    });
  });

  it("does not create a missing bootstrap", () => {
    withDatabase((database, migration) => {
      database.exec(migration);
      expect(epochs(database)).toEqual([]);
    });
  });
});
