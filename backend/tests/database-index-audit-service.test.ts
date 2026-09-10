import { auditDatabaseIndexes } from "../src/services/database-index-audit.service";

describe("database index audit", () => {
  it("finds missing primary keys and unindexed foreign-key leading columns", () => {
    const result = auditDatabaseIndexes({
      tables: [{ tableName: "orders" }, { tableName: "order_events" }],
      foreignKeys: [
        { tableName: "orders", columnName: "customer_id", constraintName: "orders_customer_fk" },
        {
          tableName: "order_events",
          columnName: "order_id",
          constraintName: "order_events_order_fk"
        }
      ],
      indexes: [
        {
          tableName: "orders",
          indexName: "PRIMARY",
          columnName: "id",
          sequenceInIndex: 1,
          nonUnique: 0
        },
        {
          tableName: "orders",
          indexName: "orders_customer_created_idx",
          columnName: "customer_id",
          sequenceInIndex: 1,
          nonUnique: 1
        },
        {
          tableName: "orders",
          indexName: "orders_customer_created_idx",
          columnName: "created_at",
          sequenceInIndex: 2,
          nonUnique: 1
        }
      ],
      softDeleteTables: [{ tableName: "orders" }]
    });

    expect(result.missingPrimaryKeys).toEqual(["order_events"]);
    expect(result.unindexedForeignKeys).toEqual(["order_events.order_id (order_events_order_fk)"]);
    expect(result.softDeleteIndexWarnings).toEqual(["orders.deleted_at"]);
  });

  it("reports duplicate index definitions as warnings", () => {
    const result = auditDatabaseIndexes({
      tables: [{ tableName: "orders" }],
      foreignKeys: [],
      softDeleteTables: [],
      indexes: [
        {
          tableName: "orders",
          indexName: "PRIMARY",
          columnName: "id",
          sequenceInIndex: 1,
          nonUnique: 0
        },
        {
          tableName: "orders",
          indexName: "orders_status_a",
          columnName: "status",
          sequenceInIndex: 1,
          nonUnique: 1
        },
        {
          tableName: "orders",
          indexName: "orders_status_b",
          columnName: "status",
          sequenceInIndex: 1,
          nonUnique: 1
        }
      ]
    });

    expect(result.duplicateIndexes).toEqual([
      "orders: orders_status_a and orders_status_b both index (status)"
    ]);
  });
});
