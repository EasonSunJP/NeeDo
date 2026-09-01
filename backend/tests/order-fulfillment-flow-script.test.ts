import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  RollbackCompleted,
  assertFormalDatabaseSchema,
  createTransactionBoundPrismaFacade,
  loadAndValidateFormalEnvironment,
  runRollbackOnlyTransaction,
  type FormalDatabaseSchemaEvidence
} from "../scripts/check-order-fulfillment-checkout-flow";

const backendRoot = resolve(__dirname, "..");
const scriptPath = resolve(backendRoot, "scripts/check-order-fulfillment-checkout-flow.ts");

describe("rollback-only formal order fulfillment flow checker", () => {
  it("is wired as the explicit package command", () => {
    const packageJson = JSON.parse(readFileSync(resolve(backendRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(existsSync(scriptPath)).toBe(true);
    expect(packageJson.scripts["check:order-fulfillment-checkout"]).toBe(
      "tsx scripts/check-order-fulfillment-checkout-flow.ts"
    );
  });

  it("requires one explicit existing FORMAL_BACKEND_ENV_FILE and validates its database target", () => {
    const envFile = "/tmp/needo-order-flow.env";
    const fileSystem = {
      resolve: (value: string) => value,
      existsSync: (value: string) => value === envFile,
      readFileSync: () => [
        "NODE_ENV=test",
        "DEPLOY_ENV=local",
        "DATABASE_URL=mysql://needo:secret@127.0.0.1:3306/needo_order_flow_test"
      ].join("\n")
    };

    expect(() => loadAndValidateFormalEnvironment({}, fileSystem)).toThrow(
      "FORMAL_BACKEND_ENV_FILE is required"
    );
    expect(() => loadAndValidateFormalEnvironment({ ENV_FILE: envFile }, fileSystem)).toThrow(
      "FORMAL_BACKEND_ENV_FILE is required"
    );
    expect(() => loadAndValidateFormalEnvironment({
      FORMAL_BACKEND_ENV_FILE: "/tmp/missing.env"
    }, fileSystem)).toThrow("does not exist");

    expect(loadAndValidateFormalEnvironment({
      FORMAL_BACKEND_ENV_FILE: envFile
    }, fileSystem)).toMatchObject({
      envFilePath: envFile,
      databaseName: "needo_order_flow_test",
      databaseHost: "127.0.0.1"
    });
  });

  it.each([
    ["NODE_ENV=production", "production environment"],
    ["DEPLOY_ENV=staging", "production environment"],
    ["DATABASE_URL=postgresql://needo@127.0.0.1/needo_test", "MySQL"],
    ["DATABASE_URL=mysql://needo@db.example.com/needo_test", "loopback"],
    ["DATABASE_URL=mysql://needo@localhost/needo", "test, dev, or local"],
    ["DATABASE_URL=mysql://needo@localhost/needo_prod_test", "production-looking"]
  ])("rejects unsafe formal environment file value %s", (line, message) => {
    const envFile = "/tmp/unsafe-order-flow.env";
    const fileSystem = {
      resolve: (value: string) => value,
      existsSync: () => true,
      readFileSync: () => [
        "NODE_ENV=test",
        "DEPLOY_ENV=local",
        "DATABASE_URL=mysql://needo@localhost/needo_order_flow_test",
        line
      ].join("\n")
    };
    expect(() => loadAndValidateFormalEnvironment({
      FORMAL_BACKEND_ENV_FILE: envFile
    }, fileSystem)).toThrow(message);
  });

  it("requires applied migrations plus physical columns, constraints and indexes", () => {
    const ready: FormalDatabaseSchemaEvidence = {
      appliedMigrations: [
        "20260901090000_order_fulfillment_checkout",
        "20260901101500_order_review_idempotency"
      ],
      tables: [
        "users",
        "customer_profiles",
        "shops",
        "technician_profiles",
        "categories",
        "services",
        "schedule_slots",
        "booking_orders",
        "order_status_histories",
        "order_financials",
        "wallets",
        "ledger_transactions",
        "wallet_ledgers",
        "finance_reconciliations",
        "audit_logs",
        "review_summaries",
        "ndp_exchange_rate_rules",
        "order_service_sessions",
        "order_service_events",
        "order_add_ons",
        "order_checkouts",
        "order_reviews",
        "order_review_tags"
      ],
      columns: [
        "order_service_sessions.verification_hash",
        "order_service_events.idempotency_key",
        "order_add_ons.service_snapshot_json",
        "order_checkouts.calculation_snapshot_json",
        "order_checkouts.rate_snapshot_json",
        "order_checkouts.ledger_transaction_id",
        "order_reviews.idempotency_key",
        "order_reviews.request_fingerprint"
      ],
      constraints: [
        "order_service_events.order_service_events_shape_chk",
        "order_checkouts.order_checkouts_total_chk",
        "order_checkouts.order_checkouts_receipt_evidence_chk"
      ],
      indexes: [
        "order_service_events.order_service_events_idempotency_key",
        "order_checkouts.order_checkouts_booking_order_key",
        "order_reviews.order_reviews_idempotency_key_key",
        "order_review_tags.order_review_tags_order_review_id_label_key"
      ],
      columnCollations: {
        "order_review_tags.label": "utf8mb4_bin"
      }
    };

    expect(() => assertFormalDatabaseSchema(ready)).not.toThrow();
    for (const field of ["appliedMigrations", "tables", "columns", "constraints", "indexes"] as const) {
      expect(() => assertFormalDatabaseSchema({ ...ready, [field]: ready[field].slice(1) })).toThrow(
        "Formal order schema preflight failed"
      );
    }
    expect(() => assertFormalDatabaseSchema({
      ...ready,
      columnCollations: { "order_review_tags.label": "utf8mb4_unicode_ci" }
    })).toThrow("utf8mb4_bin");
  });

  it("reuses the supplied outer transaction for every nested repository callback", async () => {
    const globalTransaction = jest.fn();
    const transaction = {
      marker: "outer-transaction",
      bookingOrder: { count: jest.fn(async () => 2) }
    };
    const facade = createTransactionBoundPrismaFacade(transaction);
    const callback = jest.fn(async (nested: typeof transaction) => {
      expect(nested).toBe(transaction);
      return nested.bookingOrder.count();
    });

    await expect(facade.$transaction(callback)).resolves.toBe(2);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(globalTransaction).not.toHaveBeenCalled();
    expect(facade.bookingOrder).toBe(transaction.bookingOrder);
    await expect(facade.$transaction([] as never)).rejects.toThrow("callback transaction");
  });

  it("recognizes only its rollback sentinel and verifies the external baseline after rollback", async () => {
    const state = { rows: 7 };
    const client = {
      $transaction: async (callback: (transaction: { state: typeof state }) => Promise<void>) => {
        const snapshot = structuredClone(state);
        try {
          await callback({ state });
        } catch (error) {
          Object.assign(state, snapshot);
          throw error;
        }
      }
    };
    const captureBaseline = jest.fn(async () => ({ ...state }));

    await expect(runRollbackOnlyTransaction(
      client,
      captureBaseline,
      async (transaction) => {
        transaction.state.rows += 5;
      }
    )).resolves.toBeUndefined();
    expect(state.rows).toBe(7);
    expect(captureBaseline).toHaveBeenCalledTimes(2);

    await expect(runRollbackOnlyTransaction(
      client,
      captureBaseline,
      async () => {
        throw new Error("unexpected flow failure");
      }
    )).rejects.toThrow("unexpected flow failure");
    expect(new RollbackCompleted()).toBeInstanceOf(Error);
  });

  it("keeps preflight before dynamic Prisma imports and connects every required formal flow assertion", () => {
    const source = readFileSync(scriptPath, "utf8");
    const guard = source.indexOf("loadAndValidateFormalEnvironment(process.env");
    const prismaImport = source.indexOf('await import("../src/prisma/client")');
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(prismaImport).toBeGreaterThan(guard);
    expect(source).not.toMatch(/deleteMany|\$executeRawUnsafe\([^)]*(DELETE|COMMIT)/i);

    for (const marker of [
      "startService",
      "createOrderAddOn",
      "acceptOrderAddOn",
      "endService",
      "getCheckout",
      "selectCheckoutPaymentMethod",
      "payCheckoutWithNdp",
      "confirmCheckoutReceipt",
      "createOrderReview",
      "awaitingPaymentConfirmation",
      "paymentEvidence",
      "error.wallet.insufficient_available",
      "error.order.verification_code_invalid",
      "error.order.invalid_transition"
    ]) expect(source).toContain(marker);
  });
});
