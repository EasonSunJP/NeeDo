import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "dotenv";
import mariadb, { type Connection, type ConnectionConfig } from "mariadb";

// Constraint acceptance only: parent-key fixtures are not a formal business-flow seed.
// No existing table/data is copied, updated or migrated.
async function main(): Promise<void> {
  assert.equal(
    process.env.ALLOW_EXCHANGE_CANCELLATION_SCHEMA_CHECK,
    "true",
    "explicit schema-check opt-in required"
  );
  assert(process.env.ENV_FILE, "ENV_FILE is required");
  const fileEnv = parse(readFileSync(process.env.ENV_FILE));
  assert(fileEnv.DATABASE_URL, "local DATABASE_URL is required in ENV_FILE");
  const url = new URL(fileEnv.DATABASE_URL);
  assert.equal(url.protocol, "mysql:", "MySQL URL required");
  assert(
    ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname),
    "only loopback MySQL is allowed"
  );
  const connectionOptions: ConnectionConfig = {
    host: url.hostname === "[::1]" ? "::1" : url.hostname,
    ...(url.port ? { port: Number(url.port) } : {}),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    ...(fileEnv.MYSQL_SOCKET_PATH ? { socketPath: fileEnv.MYSQL_SOCKET_PATH } : {}),
    connectTimeout: 5000,
    timezone: "Z"
  };
  const database = `needo_cancel_check_${randomBytes(12).toString("hex")}`;
  assert(/^needo_cancel_check_[a-f0-9]{24}$/.test(database));
  const sql = readFileSync(
    join(
      __dirname,
      "../prisma/migrations/20260905120000_exchange_bilateral_cancellation/migration.sql"
    ),
    "utf8"
  );
  const connection = await mariadb.createConnection(connectionOptions);
  const extraConnections: Connection[] = [];
  let created = false;
  let passed = 0;
  let cleanupVerified = false;
  const errno = (error: unknown): number | undefined =>
    error && typeof error === "object" && "errno" in error ? Number(error.errno) : undefined;
  const reject = async (operation: () => Promise<unknown>, expected: number[], label: string) => {
    let error: unknown;
    try {
      await operation();
    } catch (caught) {
      error = caught;
    }
    assert(
      expected.includes(errno(error) ?? 0),
      `${label}: expected constraint rejection, received ${errno(error) ?? "no database error"}`
    );
    passed += 1;
  };
  const checkFailure = [3819, 4025]; // MySQL and MariaDB CHECK violation codes.
  const now = "2026-09-05 00:00:00.000";
  const insertRequest = async (orderId: number, requestedVersion = 1, client = connection) => {
    const result = await client.query(
      `INSERT INTO exchange_booking_cancellations
      (booking_order_id, active_order_id, initiated_by_user_id, initiated_by_identity_id,
       initiator_party, reason, requested_version, version, created_at, updated_at)
      VALUES (?, ?, 1, 11, 'customer', '时间冲突', ?, ?, ?, ?)`,
      [orderId, orderId, requestedVersion, requestedVersion, now, now]
    );
    return Number(result.insertId);
  };
  const resolveRequest = (
    id: number,
    status: string,
    userId: number,
    identityId: number,
    party: string
  ) =>
    connection.query(
      `UPDATE exchange_booking_cancellations SET status=?, active_order_id=NULL,
      version=requested_version+1, resolved_by_user_id=?, resolved_by_identity_id=?,
      resolver_party=?, resolved_at=?, updated_at=? WHERE id=?`,
      [status, userId, identityId, party, now, now, id]
    );
  const insertEvent = (
    cancellationId: number,
    orderId: number,
    before: number,
    after: number,
    key: string,
    type = "requested"
  ) =>
    connection.query(
      `INSERT INTO exchange_booking_cancellation_events
      (cancellation_id, booking_order_id, type, actor_user_id, actor_identity_id, actor_party,
       version_before, version_after, idempotency_key, payload_fingerprint, result_snapshot, updated_at)
      VALUES (?, ?, ?, 1, 11, 'customer', ?, ?, ?, ?, ?, ?)`,
      [
        cancellationId,
        orderId,
        type,
        before,
        after,
        key,
        "a".repeat(64),
        JSON.stringify({ orderId, version: after }),
        now
      ]
    );

  try {
    const server = await connection.query("SELECT VERSION() AS version");
    console.log(
      JSON.stringify({
        check: "exchange-cancellation-schema",
        database,
        serverVersion: server[0].version
      })
    );
    await connection.query(
      `CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    created = true;
    await connection.query(`USE \`${database}\``);
    await connection.query("SET SESSION default_storage_engine = 'InnoDB'");
    await connection.query("CREATE TABLE users (id INTEGER PRIMARY KEY) ENGINE=InnoDB");
    await connection.query("CREATE TABLE user_identities (id INTEGER PRIMARY KEY) ENGINE=InnoDB");
    await connection.query(
      "CREATE TABLE exchange_match_participants (id INTEGER PRIMARY KEY, booking_order_id INTEGER NULL UNIQUE) ENGINE=InnoDB"
    );
    await connection.query("INSERT INTO users VALUES (1), (2), (3)");
    await connection.query("INSERT INTO user_identities VALUES (11), (22), (33)");
    await connection.query(
      "INSERT INTO exchange_match_participants VALUES (1,1001), (2,1002), (3,1003), (4,1004), (5,NULL)"
    );
    for (const statement of sql
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)) {
      await connection.query(statement);
    }

    const first = await insertRequest(1001);
    const second = await insertRequest(1002);
    passed += 2;
    await reject(() => insertRequest(1001, 3), [1062], "one pending request per order");
    await reject(() => insertRequest(9999), [1452], "must reference a booked participant");
    await reject(
      () =>
        connection.query(
          "UPDATE exchange_booking_cancellations SET active_order_id=NULL WHERE id=?",
          [first]
        ),
      checkFailure,
      "pending cannot omit active key"
    );
    await reject(
      () =>
        connection.query(
          "UPDATE exchange_booking_cancellations SET active_order_id=9000 WHERE id=?",
          [first]
        ),
      checkFailure,
      "active key must equal order"
    );
    await reject(
      () =>
        connection.query("UPDATE exchange_booking_cancellations SET deleted_at=? WHERE id=?", [
          now,
          first
        ]),
      checkFailure,
      "pending cannot be hidden by soft delete"
    );
    await reject(
      () =>
        connection.query(
          "UPDATE exchange_booking_cancellations SET initiated_by_user_id=999 WHERE id=?",
          [first]
        ),
      [1452],
      "initiating user FK"
    );
    await reject(
      () =>
        connection.query(
          "UPDATE exchange_booking_cancellations SET initiated_by_identity_id=999 WHERE id=?",
          [first]
        ),
      [1452],
      "initiating identity FK"
    );
    await reject(
      () =>
        connection.query("UPDATE exchange_booking_cancellations SET version=2 WHERE id=?", [first]),
      checkFailure,
      "pending version must equal request version"
    );
    await reject(
      () =>
        connection.query(
          "UPDATE exchange_booking_cancellations SET requested_version=0, version=0 WHERE id=?",
          [first]
        ),
      checkFailure,
      "positive request version"
    );
    await reject(
      () =>
        connection.query(
          "UPDATE exchange_booking_cancellations SET requested_version=2147483647, version=2147483647 WHERE id=?",
          [first]
        ),
      checkFailure,
      "reserve response version"
    );
    await reject(
      () =>
        connection.query("UPDATE exchange_booking_cancellations SET reason='   ' WHERE id=?", [
          first
        ]),
      checkFailure,
      "nonblank reason"
    );
    await reject(
      () =>
        connection.query(
          "UPDATE exchange_booking_cancellations SET resolved_by_user_id=2 WHERE id=?",
          [first]
        ),
      checkFailure,
      "pending has no partial decision"
    );
    await reject(
      () =>
        connection.query(
          "UPDATE exchange_booking_cancellations SET status='accepted', active_order_id=NULL, version=2 WHERE id=?",
          [first]
        ),
      checkFailure,
      "terminal requires complete decision"
    );
    await reject(
      () => resolveRequest(first, "accepted", 2, 22, "customer"),
      checkFailure,
      "same-party approval"
    );
    await reject(
      () => resolveRequest(first, "accepted", 1, 22, "provider"),
      checkFailure,
      "same-account approval"
    );
    await reject(
      () => resolveRequest(first, "accepted", 2, 11, "provider"),
      checkFailure,
      "same-identity approval"
    );
    await reject(
      () => resolveRequest(first, "withdrawn", 2, 22, "provider"),
      checkFailure,
      "foreign withdrawal"
    );
    await reject(
      () => resolveRequest(first, "rejected", 2, 22, "customer"),
      checkFailure,
      "same-party rejection"
    );

    await insertEvent(first, 1001, 0, 1, "schema-request-1001");
    await reject(
      () => insertEvent(first, 1001, 0, 1, "different-key"),
      [1062],
      "one event per order version"
    );
    await reject(
      () => insertEvent(second, 1002, 0, 1, "schema-request-1001"),
      [1062],
      "global command idempotency"
    );
    await reject(
      () => insertEvent(first, 1002, 0, 1, "wrong-order-key"),
      [1452],
      "event must reference exact request order"
    );
    await reject(
      () => insertEvent(second, 1002, 0, 2, "skipped-version"),
      checkFailure,
      "event increments version exactly once"
    );
    await reject(() => insertEvent(second, 1002, 0, 1, " "), checkFailure, "nonblank command key");
    await reject(
      () =>
        connection.query(
          "UPDATE exchange_booking_cancellation_events SET payload_fingerprint='invalid' WHERE cancellation_id=?",
          [first]
        ),
      checkFailure,
      "SHA256 fingerprint shape"
    );
    await reject(
      () => connection.query("DELETE FROM exchange_booking_cancellations WHERE id=?", [first]),
      [1451],
      "events retain request parent"
    );
    await reject(
      () =>
        connection.query("UPDATE exchange_match_participants SET booking_order_id=9000 WHERE id=1"),
      [1451],
      "participant booking link cannot drift"
    );

    await resolveRequest(first, "rejected", 2, 22, "provider");
    await insertEvent(first, 1001, 1, 2, "schema-reject-1001", "rejected");
    const next = await insertRequest(1001, 3);
    const history = await connection.query(
      "SELECT status, version FROM exchange_booking_cancellations WHERE booking_order_id=1001 ORDER BY requested_version"
    );
    assert.deepEqual(
      history.map((row: { status: string; version: number }) => ({ ...row })),
      [
        { status: "rejected", version: 2 },
        { status: "pending", version: 3 }
      ]
    );
    await resolveRequest(next, "accepted", 2, 22, "provider");
    await resolveRequest(second, "withdrawn", 1, 11, "customer");
    passed += 4;

    await connection.beginTransaction();
    await insertRequest(1004);
    await connection.rollback();
    const rolledBack = await connection.query(
      "SELECT COUNT(*) AS total FROM exchange_booking_cancellations WHERE booking_order_id=1004"
    );
    assert.equal(Number(rolledBack[0].total), 0);
    passed += 1;

    for (let index = 0; index < 2; index += 1) {
      extraConnections.push(await mariadb.createConnection({ ...connectionOptions, database }));
    }
    const concurrent = await Promise.allSettled(
      extraConnections.map((client, index) => insertRequest(1003, 1 + index * 2, client))
    );
    assert.equal(concurrent.filter((result) => result.status === "fulfilled").length, 1);
    const loser = concurrent.find((result) => result.status === "rejected");
    assert(
      loser?.status === "rejected" && errno(loser.reason) === 1062,
      "competing active insert must fail uniquely"
    );
    passed += 1;
  } finally {
    try {
      // A failed close must not prevent dropping the database created by this run.
      const closed = await Promise.allSettled(extraConnections.map((client) => client.end()));
      if (created) {
        await connection.rollback();
        await connection.query(`DROP DATABASE \`${database}\``);
        const schemas = await connection.query(
          "SELECT COUNT(*) AS total FROM information_schema.schemata WHERE schema_name=?",
          [database]
        );
        assert.equal(Number(schemas[0].total), 0, "scratch database cleanup failed");
        cleanupVerified = true;
      }
      assert(
        closed.every((result) => result.status === "fulfilled"),
        "scratch connection close failed"
      );
    } finally {
      await connection.end();
      console.log(JSON.stringify({ passed, cleanupVerified, existingDatabaseModified: false }));
    }
  }
}

void main().catch((error: unknown) => {
  // Driver errors can contain SQL/connection details; report only code, not the object.
  const code =
    error && typeof error === "object" && "code" in error ? String(error.code) : "CHECK_FAILED";
  const message = error instanceof assert.AssertionError ? error.message : undefined;
  console.error(JSON.stringify({ code, ...(message ? { message } : {}) }));
  process.exitCode = 1;
});
