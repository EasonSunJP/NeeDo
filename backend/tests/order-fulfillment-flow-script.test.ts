import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  RollbackCompleted,
  assertDeepSnapshotEqual,
  assertFormalFulfillmentChain,
  assertNoCashDebit,
  assertFormalDatabaseSchema,
  captureCashNoDebitEvidence,
  captureOrderMutationState,
  createTransactionBoundPrismaFacade,
  loadAndValidateFormalEnvironment,
  resolveFixtureLedgerCurrency,
  runExpectedFailureRollbackTransaction,
  runRollbackOnlyTransaction,
  type FormalDatabaseSchemaEvidence
} from "../scripts/check-order-fulfillment-checkout-flow";
import { LedgerRepository } from "../src/repositories/ledger.repository";
import { LedgerService } from "../src/services/ledger.service";

const backendRoot = resolve(__dirname, "..");
const scriptPath = resolve(backendRoot, "scripts/check-order-fulfillment-checkout-flow.ts");
const concurrencyScriptPath = resolve(backendRoot, "scripts/check-order-checkout-concurrency.ts");

describe("rollback-only formal order fulfillment flow checker", () => {
  it("is wired as the explicit package command", () => {
    const packageJson = JSON.parse(readFileSync(resolve(backendRoot, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(existsSync(scriptPath)).toBe(true);
    expect(packageJson.scripts["check:order-fulfillment-checkout"]).toBe(
      "tsx scripts/check-order-fulfillment-checkout-flow.ts && " +
        "tsx scripts/check-order-checkout-concurrency.ts"
    );
  });

  it("runs the customer checkout as a Test NDP account with a valid NeeDo identifier", () => {
    const source = readFileSync(scriptPath, "utf8");

    expect(source).toContain("isTestAccount: true");
    expect(source).toContain('assert(currency === "TEST_NDP"');
    expect(source).toContain("reconciliation === null");
    expect(source).toContain('activeKey: "ndp_exchange_rate"');
    expect(source).toContain("runInsufficientBalanceRollbackFlow");
    expect(source.match(/runExpectedFailureRollbackTransaction\(/g)).toHaveLength(1);
    expect(source).not.toContain("needoId: `${marker}-customer`");
    expect(source).not.toContain("needoId: `${marker}-technician`");
  });

  it("covers the real Test NDP platform-fee and compensation settlement chain", () => {
    const source = readFileSync(scriptPath, "utf8");

    expect(source).not.toContain("platformFeeEnabledSnapshot: false");
    expect(source).toContain("freezeBookingAcceptance");
    expect(source).toContain("bPlatformFeeHoldNdp === 500");
    expect(source).toContain("bPlatformFeeActualNdp === 500");
    expect(source).toContain('event.type === "technician_income_estimated"');
    expect(source).toContain("shopEstimatedGrossProfitJpy");
  });

  it("keeps timing bypass isolated to rollback fixture rows instead of the shared platform setting", () => {
    const source = readFileSync(scriptPath, "utf8");

    expect(source).not.toContain("anytimeServiceTestEnabled: true");
    expect(source).not.toContain("tx.platformSettingVersion.updateMany");
    expect(source).toContain(
      "const startsAt = new Date(now.getTime() - sequence * 3_600_000);"
    );
    expect(source).toContain("async function withServiceSessionReadyToEnd<TResult>(");
    expect(source).toContain("bookingOrderId: orderId, deletedAt: null");
    expect(source).toContain("expectedEndsAt: new Date(now.getTime() - 1_000)");
    expect(source).toContain(
      "startedAt: new Date(now.getTime() - durationMs - 1_000)"
    );
    expect(source.match(/await withServiceSessionReadyToEnd\(/g)).toHaveLength(4);
  });

  it("tracks and removes technician work events created by the concurrency fixture", () => {
    const source = readFileSync(concurrencyScriptPath, "utf8");

    expect(source).toContain('"technician_work_events"');
    expect(source).toContain('"technician_work_states"');
    expect(source).toContain("tx.technicianWorkEvent.deleteMany");
    expect(source).toContain("tx.technicianWorkState.deleteMany");
  });

  it("keeps technician review fixtures inside the formal special-tag plus one-custom-tag contract", () => {
    const source = readFileSync(scriptPath, "utf8");

    expect(source).not.toContain('tags: ["ＳＰＡ", "ı", "i"]');
    expect(source).toContain('tags: ["服务精神", "ＳＰＡ"]');
    expect(source).toContain('tags: ["服务精神"]');
    expect(source.match(/orderReviewCreateBodySchema\.parse\(/g)).toHaveLength(2);
    expect(source).toContain('JSON.stringify(["SPA", "服务max"].sort())');
    expect(source).toContain('const expectedTechnicianHighlights = ["服务max", "SPA"];');
  });

  it("requires one explicit existing FORMAL_BACKEND_ENV_FILE and validates its database target", () => {
    const envFile = "/tmp/needo-order-flow.env";
    const fileSystem = {
      resolve: (value: string) => value,
      existsSync: (value: string) => value === envFile,
      readFileSync: () =>
        [
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
    expect(() =>
      loadAndValidateFormalEnvironment(
        {
          FORMAL_BACKEND_ENV_FILE: "/tmp/missing.env"
        },
        fileSystem
      )
    ).toThrow("does not exist");

    expect(
      loadAndValidateFormalEnvironment(
        {
          FORMAL_BACKEND_ENV_FILE: envFile
        },
        fileSystem
      )
    ).toMatchObject({
      envFilePath: envFile,
      databaseName: "needo_order_flow_test",
      databaseHost: "127.0.0.1"
    });
  });

  it("takes the database target only from the explicit file and lets file safety values override runtime", () => {
    const envFile = "/tmp/authoritative-order-flow.env";
    const makeFileSystem = (contents: string) => ({
      resolve: (value: string) => value,
      existsSync: () => true,
      readFileSync: () => contents
    });

    expect(() =>
      loadAndValidateFormalEnvironment(
        {
          FORMAL_BACKEND_ENV_FILE: envFile,
          DATABASE_URL: "mysql://needo@127.0.0.1/runtime_test"
        },
        makeFileSystem("NODE_ENV=test\nDEPLOY_ENV=local")
      )
    ).toThrow("DATABASE_URL is required in FORMAL_BACKEND_ENV_FILE");

    expect(
      loadAndValidateFormalEnvironment(
        {
          FORMAL_BACKEND_ENV_FILE: envFile,
          NODE_ENV: "production",
          DEPLOY_ENV: "staging",
          DATABASE_URL: "mysql://needo@remote.example/runtime_prod"
        },
        makeFileSystem(
          [
            "NODE_ENV=test",
            "DEPLOY_ENV=local",
            "DATABASE_URL=mysql://needo@127.0.0.1/authoritative_order_test"
          ].join("\n")
        )
      )
    ).toMatchObject({
      databaseHost: "127.0.0.1",
      databaseName: "authoritative_order_test"
    });
  });

  it.each([
    ["NODE_ENV=production", "production environment"],
    ["DEPLOY_ENV=staging", "production environment"],
    ["DATABASE_URL=postgresql://needo@127.0.0.1/needo_test", "MySQL"],
    ["DATABASE_URL=mysql://needo@db.example.com/needo_test", "loopback"],
    ["DATABASE_URL=mysql://needo@localhost/needo", "test, dev, or local"],
    ["DATABASE_URL=mysql://needo@localhost/needo_prod_test", "production-looking"],
    ["DATABASE_URL=mysql://needo@localhost/needo_productiontest", "production-looking"],
    ["DATABASE_URL=mysql://needo@localhost/needo_proddev", "production-looking"]
  ])("rejects unsafe formal environment file value %s", (line, message) => {
    const envFile = "/tmp/unsafe-order-flow.env";
    const fileSystem = {
      resolve: (value: string) => value,
      existsSync: () => true,
      readFileSync: () =>
        [
          "NODE_ENV=test",
          "DEPLOY_ENV=local",
          "DATABASE_URL=mysql://needo@localhost/needo_order_flow_test",
          line
        ].join("\n")
    };
    expect(() =>
      loadAndValidateFormalEnvironment(
        {
          FORMAL_BACKEND_ENV_FILE: envFile
        },
        fileSystem
      )
    ).toThrow(message);
  });

  it("requires applied migrations plus physical columns, constraints and indexes", () => {
    const ready: FormalDatabaseSchemaEvidence = {
      appliedMigrations: [
        "20260901090000_order_fulfillment_checkout",
        "20260901101500_order_review_idempotency",
        "20260902090000_order_status_history_fulfillment_statuses"
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
        "wallet_holds",
        "ledger_transactions",
        "wallet_ledgers",
        "fee_calculation_logs",
        "finance_reconciliations",
        "audit_logs",
        "review_summaries",
        "ndp_exchange_rate_rules",
        "order_service_sessions",
        "order_service_events",
        "order_add_ons",
        "order_checkouts",
        "order_reviews",
        "order_review_tags",
        "technician_compensation_profiles"
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
    for (const field of [
      "appliedMigrations",
      "tables",
      "columns",
      "constraints",
      "indexes"
    ] as const) {
      expect(() =>
        assertFormalDatabaseSchema({ ...ready, [field]: ready[field].slice(1) })
      ).toThrow("Formal order schema preflight failed");
    }
    expect(() =>
      assertFormalDatabaseSchema({
        ...ready,
        columnCollations: { "order_review_tags.label": "utf8mb4_unicode_ci" }
      })
    ).toThrow("utf8mb4_bin");
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

  it("resolves the fixture currency through the transaction facade and formal ledger services", async () => {
    const createdAt = new Date("2026-09-01T00:00:00.000Z");
    const transaction = {
      user: {
        findFirst: jest.fn(async () => ({ isTestAccount: true }))
      },
      wallet: {
        findFirst: jest.fn(async ({ where }: { where: { currency: string } }) => ({
          id: 91,
          ownerType: "USER",
          ownerId: 501,
          currency: where.currency,
          availableBalance: 400,
          frozenBalance: 0,
          createdAt,
          updatedAt: createdAt,
          deletedAt: null
        }))
      }
    };
    const facade = createTransactionBoundPrismaFacade(transaction);
    const repository = new LedgerRepository(facade as never);
    const ledger = new LedgerService(repository);

    await expect(resolveFixtureLedgerCurrency(transaction as never, 501)).resolves.toBe("TEST_NDP");
    await expect(
      ledger.getMyWallet({
        userId: 501,
        email: "fixture@example.invalid",
        accessTokenJti: "fixture-currency-test",
        accessTokenExpiresAt: 2_000_000_000,
        roles: ["customer"],
        permissions: [],
        currentIdentityType: "customer",
        currentIdentityScopeType: "customer_profile",
        currentIdentityScopeId: 701
      })
    ).resolves.toMatchObject({ currency: "TEST_NDP", availableBalance: 400 });
    expect(transaction.wallet.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ currency: "TEST_NDP" })
      })
    );
  });

  it("captures checkout-specific cash evidence, permits settlement rewards, and rejects debits", async () => {
    const transaction = {
      orderCheckout: {
        findUnique: jest.fn(async () => ({ id: 77 }))
      },
      wallet: {
        findUnique: jest.fn(async () => ({ availableBalance: 900, frozenBalance: 10 }))
      },
      ledgerTransaction: { count: jest.fn(async () => 2) },
      walletLedger: { count: jest.fn(async () => 1) },
      financeReconciliation: { count: jest.fn(async () => 1) }
    };

    const before = await captureCashNoDebitEvidence(transaction as never, 41, 501, "TEST_NDP");
    expect(before).toEqual({
      checkoutId: 77,
      walletAvailableBalance: 900,
      walletFrozenBalance: 10,
      ledgerTransactionCount: 2,
      walletLedgerCount: 1,
      reconciliationCount: 1
    });
    expect(transaction.ledgerTransaction.count).toHaveBeenCalledWith({
      where: { referenceType: "order_checkout_payment", referenceId: 77, currency: "TEST_NDP" }
    });
    expect(() => assertNoCashDebit(before, before)).not.toThrow();
    expect(() =>
      assertNoCashDebit(
        before,
        Object.fromEntries(Object.entries(before).reverse()) as typeof before
      )
    ).not.toThrow();
    expect(() =>
      assertNoCashDebit(before, { ...before, walletAvailableBalance: 1_000 })
    ).not.toThrow();
    expect(() =>
      assertNoCashDebit(before, { ...before, walletAvailableBalance: 899 })
    ).toThrow("cash payment changed wallet or checkout ledger evidence");
    expect(() => assertNoCashDebit(before, { ...before, ledgerTransactionCount: 3 })).toThrow(
      "cash payment changed wallet or checkout ledger evidence"
    );
  });

  it("deep-compares reconciliation and settlement evidence in failed-command snapshots", () => {
    const before = {
      financial: { settlementStatus: "pending", platformFeeActual: 0 },
      reconciliations: [{ id: 9, expectedAmount: 20, actualAmount: 20, differenceAmount: 0 }]
    };
    expect(() => assertDeepSnapshotEqual(before, structuredClone(before), "failure")).not.toThrow();
    expect(() =>
      assertDeepSnapshotEqual(
        before,
        {
          ...before,
          reconciliations: [{ ...before.reconciliations[0]!, actualAmount: 19 }]
        },
        "failure"
      )
    ).toThrow("failure left partial writes");
  });

  it("canonicalizes recursive JSON object keys but preserves array order", () => {
    const first = {
      metadata: {
        zeta: 3,
        nested: { beta: 2, alpha: 1 },
        entries: [{ right: "r", left: "l" }, { value: 2 }],
        nullable: null,
        sequence: 7n,
        occurredAt: new Date("2026-09-01T01:00:00.000Z")
      }
    };
    const sameMeaningDifferentKeyOrder = {
      metadata: {
        occurredAt: new Date("2026-09-01T01:00:00.000Z"),
        sequence: 7n,
        nullable: null,
        entries: [{ left: "l", right: "r" }, { value: 2 }],
        nested: { alpha: 1, beta: 2 },
        zeta: 3
      }
    };
    expect(() =>
      assertDeepSnapshotEqual(first, sameMeaningDifferentKeyOrder, "canonical JSON")
    ).not.toThrow();
    expect(() =>
      assertDeepSnapshotEqual(
        first,
        {
          metadata: {
            ...sameMeaningDifferentKeyOrder.metadata,
            entries: [...sameMeaningDifferentKeyOrder.metadata.entries].reverse()
          }
        },
        "ordered JSON array"
      )
    ).toThrow("ordered JSON array left partial writes");
  });

  it("captures every mutable order, session, add-on and checkout field in failure snapshots", async () => {
    const state = {
      order: {
        id: 41,
        customerUserId: 501,
        technicianProfileId: 601,
        paymentConfirmedById: null as number | null,
        paymentConfirmedAt: null as Date | null,
        paymentReference: null as string | null,
        paymentNote: null as string | null
      },
      session: {
        id: 51,
        bookingOrderId: 41,
        verificationHash: "hash-a",
        startedAt: null,
        endedAt: null
      },
      addOn: {
        id: 61,
        bookingOrderId: 41,
        status: "PROPOSED",
        acceptedAt: null as Date | null,
        resolutionReason: null as string | null
      },
      checkout: {
        id: 71,
        bookingOrderId: 41,
        paymentSelectedAt: null as Date | null,
        receiptConfirmationReason: null as string | null
      },
      financial: {
        id: 81,
        bookingOrderId: 41,
        ndpCurrency: "TEST_NDP",
        settlementStatus: "pending"
      },
      wallet: {
        id: 91,
        ownerType: "USER",
        ownerId: 501,
        currency: "TEST_NDP",
        availableBalance: 10
      }
    };
    const transaction = {
      bookingOrder: { findUnique: jest.fn(async () => structuredClone(state.order)) },
      orderServiceSession: { findUnique: jest.fn(async () => structuredClone(state.session)) },
      orderAddOn: { findMany: jest.fn(async () => [structuredClone(state.addOn)]) },
      orderServiceEvent: { findMany: jest.fn(async () => []) },
      orderStatusHistory: { findMany: jest.fn(async () => []) },
      orderCheckout: { findUnique: jest.fn(async () => structuredClone(state.checkout)) },
      ledgerTransaction: { findMany: jest.fn(async () => []) },
      financeReconciliation: { findMany: jest.fn(async () => []) },
      affiliateReward: { findMany: jest.fn(async () => []) },
      affiliateRewardTransaction: { findMany: jest.fn(async () => []) },
      walletHold: { findMany: jest.fn(async () => []) },
      orderReview: { findMany: jest.fn(async () => []) },
      reviewSummary: { findMany: jest.fn(async () => []) },
      auditLog: { findMany: jest.fn(async () => []) },
      orderFinancial: { findUnique: jest.fn(async () => structuredClone(state.financial)) },
      wallet: { findMany: jest.fn(async () => [structuredClone(state.wallet)]) }
    };
    const mutations: Array<() => void> = [
      () => {
        state.order.paymentConfirmedById = 501;
      },
      () => {
        state.order.paymentConfirmedAt = new Date("2026-09-01T01:00:00.000Z");
      },
      () => {
        state.order.paymentReference = "receipt:71";
      },
      () => {
        state.order.paymentNote = "cash received";
      },
      () => {
        state.checkout.paymentSelectedAt = new Date("2026-09-01T01:01:00.000Z");
      },
      () => {
        state.checkout.receiptConfirmationReason = "cash received";
      },
      () => {
        state.session.verificationHash = "hash-b";
      },
      () => {
        state.addOn.acceptedAt = new Date("2026-09-01T01:02:00.000Z");
      },
      () => {
        state.addOn.resolutionReason = "changed";
      }
    ];

    for (const mutate of mutations) {
      const before = await captureOrderMutationState(transaction as never, 41);
      mutate();
      const after = await captureOrderMutationState(transaction as never, 41);
      expect(() => assertDeepSnapshotEqual(before, after, "omitted mutable field")).toThrow(
        "omitted mutable field left partial writes"
      );
    }
  });

  it("requires an exact ordered fulfillment history, event chain, add-on lifecycle and receipt", () => {
    const occurredAt = new Date("2026-09-01T01:00:00.000Z");
    const evidence = {
      order: {
        status: "COMPLETED",
        paymentMethod: "CASH",
        paymentStatus: "CONFIRMED",
        paymentConfirmedById: 502,
        paymentConfirmedAt: occurredAt,
        paymentReference: "checkout:71:technician-receipt",
        paymentNote: "cash received"
      },
      session: {
        id: 51,
        startedByUserId: 502,
        startedAt: occurredAt,
        endedByUserId: 502,
        endedAt: occurredAt
      },
      checkout: {
        id: 71,
        paymentMethod: "CASH",
        paymentSelectedAt: occurredAt,
        receiptConfirmedById: 502,
        receiptConfirmedAt: occurredAt,
        receiptConfirmationReason: "cash received"
      },
      addOn: {
        id: 61,
        serviceId: 31,
        status: "ACCEPTED",
        proposedByUserId: 502,
        proposedAt: occurredAt,
        acceptedByUserId: 501,
        acceptedAt: occurredAt,
        rejectedByUserId: null,
        rejectedAt: null,
        resolutionReason: null
      },
      histories: [
        { fromStatus: "PENDING", toStatus: "CONFIRMED", actorUserId: 502, reason: "fixture" },
        {
          fromStatus: "CONFIRMED",
          toStatus: "IN_SERVICE",
          actorUserId: 502,
          reason: "service_started"
        }
      ],
      events: [
        {
          eventType: "SERVICE_STARTED",
          actorUserId: 502,
          idempotencyKey: "start-key",
          reason: null,
          orderAddOnId: null,
          orderCheckoutId: null,
          metadata: { actor: "technician", requestIp: "127.0.0.1" },
          occurredAt
        },
        {
          eventType: "RECEIPT_CONFIRMED",
          actorUserId: 502,
          idempotencyKey: "receipt-key",
          reason: "cash received",
          orderAddOnId: null,
          orderCheckoutId: 71,
          metadata: {
            paymentEvidence: "technician_receipt_confirmation",
            reason: "cash received"
          },
          occurredAt
        }
      ]
    };
    const expected = {
      order: evidence.order,
      session: evidence.session,
      checkout: evidence.checkout,
      addOn: evidence.addOn,
      histories: evidence.histories,
      events: evidence.events
    };

    expect(() => assertFormalFulfillmentChain(evidence, expected, "cash")).not.toThrow();
    expect(() =>
      assertFormalFulfillmentChain(
        {
          ...evidence,
          events: evidence.events.map((event) => ({
            ...event,
            metadata: Object.fromEntries(Object.entries(event.metadata).reverse())
          }))
        },
        expected,
        "cash"
      )
    ).not.toThrow();
    expect(() =>
      assertFormalFulfillmentChain(
        { ...evidence, histories: [...evidence.histories].reverse() },
        expected,
        "cash"
      )
    ).toThrow("cash history chain mismatch");
    expect(() =>
      assertFormalFulfillmentChain(
        { ...evidence, histories: [...evidence.histories, evidence.histories[1]!] },
        expected,
        "cash"
      )
    ).toThrow("cash history chain mismatch");
    expect(() =>
      assertFormalFulfillmentChain(
        {
          ...evidence,
          events: evidence.events.map((event, index) =>
            index === 0 ? { ...event, actorUserId: 501 } : event
          )
        },
        expected,
        "cash"
      )
    ).toThrow("cash event chain mismatch");
    expect(() =>
      assertFormalFulfillmentChain(
        {
          ...evidence,
          events: evidence.events.map((event, index) =>
            index === 1 ? { ...event, idempotencyKey: "wrong-key" } : event
          )
        },
        expected,
        "cash"
      )
    ).toThrow("cash event chain mismatch");
    expect(() =>
      assertFormalFulfillmentChain(
        { ...evidence, events: [...evidence.events, evidence.events[1]!] },
        expected,
        "cash"
      )
    ).toThrow("cash event chain mismatch");
    expect(() =>
      assertFormalFulfillmentChain(
        {
          ...evidence,
          events: evidence.events.map((event, index) =>
            index === 1 ? { ...event, metadata: { ...event.metadata, reason: "wrong" } } : event
          )
        },
        expected,
        "cash"
      )
    ).toThrow("cash event chain mismatch");
    expect(() =>
      assertFormalFulfillmentChain(
        { ...evidence, addOn: { ...evidence.addOn, acceptedByUserId: 502 } },
        expected,
        "cash"
      )
    ).toThrow("cash add-on lifecycle mismatch");
    expect(() =>
      assertFormalFulfillmentChain(
        {
          ...evidence,
          checkout: { ...evidence.checkout, receiptConfirmationReason: "wrong" }
        },
        expected,
        "cash"
      )
    ).toThrow("cash checkout evidence mismatch");
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

    await expect(
      runRollbackOnlyTransaction(
        client,
        captureBaseline,
        async (transaction: { state: typeof state }) => {
          transaction.state.rows += 5;
        }
      )
    ).resolves.toBeUndefined();
    expect(state.rows).toBe(7);
    expect(captureBaseline).toHaveBeenCalledTimes(2);

    await expect(
      runRollbackOnlyTransaction(client, captureBaseline, async () => {
        throw new Error("unexpected flow failure");
      })
    ).rejects.toThrow("unexpected flow failure");
    expect(new RollbackCompleted()).toBeInstanceOf(Error);
  });

  it("verifies an expected command failure only after the database transaction rolls back", async () => {
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

    await expect(
      runExpectedFailureRollbackTransaction(
        client,
        captureBaseline,
        async (transaction: { state: typeof state }) => {
          transaction.state.rows += 5;
          throw new Error("error.wallet.insufficient_available");
        },
        "error.wallet.insufficient_available"
      )
    ).resolves.toBeUndefined();
    expect(state.rows).toBe(7);
    expect(captureBaseline).toHaveBeenCalledTimes(2);
  });

  it("treats external baseline object key order as non-semantic", async () => {
    const client = {
      $transaction: async (callback: (transaction: Record<string, never>) => Promise<void>) => {
        await callback({});
      }
    };
    const captureBaseline = jest
      .fn()
      .mockResolvedValueOnce({ marker: 7, nested: { beta: 2, alpha: 1 } })
      .mockResolvedValueOnce({ nested: { alpha: 1, beta: 2 }, marker: 7 });

    await expect(
      runRollbackOnlyTransaction(client, captureBaseline, async () => undefined)
    ).resolves.toBeUndefined();
    expect(captureBaseline).toHaveBeenCalledTimes(2);
  });

  it("keeps preflight before dynamic Prisma imports and connects every required formal flow assertion", () => {
    const source = readFileSync(scriptPath, "utf8");
    const guard = source.indexOf("loadAndValidateFormalEnvironment(process.env");
    const prismaImport = source.indexOf('await import("../src/prisma/client")');
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(prismaImport).toBeGreaterThan(guard);
    expect(source).not.toMatch(/deleteMany|\$executeRawUnsafe\([^)]*(DELETE|COMMIT)/i);
    expect(source.match(/assertFormalFulfillmentChain\(/g)).toHaveLength(3);

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
    ])
      expect(source).toContain(marker);
  });
});
