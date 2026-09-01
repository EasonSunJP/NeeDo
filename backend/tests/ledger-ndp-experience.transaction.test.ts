import type {
  LedgerRepositoryPort,
  LedgerTransactionPayload
} from "../src/services/ledger.service";
import { LedgerService } from "../src/services/ledger.service";

const transactionClient = { transaction: "same-wallet-transaction" };

const appliedTransaction = (
  overrides: Partial<LedgerTransactionPayload> = {}
): LedgerTransactionPayload => ({
  id: 71,
  transactionNo: "TX-NDP-71",
  idempotencyKey: "booking:501:complete:settlement",
  type: "booking_complete_settlement",
  status: "applied",
  referenceType: "booking_order",
  referenceId: 501,
  actorUserId: 9,
  amount: 12_345,
  currency: "NDP",
  metadata: { experienceConsumptionKind: "service" },
  createdAt: new Date("2026-09-01T03:00:00.000Z"),
  updatedAt: new Date("2026-09-01T03:00:00.000Z"),
  entries: [
    {
      id: 81,
      transactionId: 71,
      walletId: 91,
      walletOwnerType: "user",
      walletOwnerId: 41,
      walletCurrency: "NDP",
      direction: "frozen_debit",
      amount: 12_345,
      availableDelta: 0,
      frozenDelta: -12_345,
      availableBalanceAfter: 100,
      frozenBalanceAfter: 0,
      reason: "booking_service_customer_debit",
      createdAt: new Date("2026-09-01T03:00:00.000Z")
    }
  ],
  ...overrides
});

describe("Ledger NDP experience transaction bridge", () => {
  it("passes the same wallet transaction client to one qualifying award", async () => {
    const recorder = {
      recordNdpConsumption: jest.fn(async () => ({ status: "awarded" as const }))
    };
    const service = new LedgerService(
      {} as LedgerRepositoryPort,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      recorder
    );

    await service.recordNdpExperienceForAppliedTransaction(
      appliedTransaction(),
      transactionClient
    );

    expect(recorder.recordNdpConsumption).toHaveBeenCalledTimes(1);
    expect(recorder.recordNdpConsumption).toHaveBeenCalledWith(
      {
        kind: "qualifying_consumption",
        userId: 41,
        settledNdp: 12_345,
        ledgerTransactionId: 71,
        transactionNo: "TX-NDP-71",
        occurredAt: new Date("2026-09-01T03:00:00.000Z")
      },
      { transactionClient }
    );
  });

  it("propagates an account conflict so the surrounding wallet transaction rolls back", async () => {
    const conflict = new Error("experience account conflict");
    const recorder = { recordNdpConsumption: jest.fn(async () => Promise.reject(conflict)) };
    const service = new LedgerService(
      {} as LedgerRepositoryPort,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      recorder
    );
    await expect(
      service.recordNdpExperienceForAppliedTransaction(
        appliedTransaction(),
        transactionClient
      )
    ).rejects.toBe(conflict);
  });

  it.each([
    appliedTransaction({ currency: "TEST_NDP" }),
    appliedTransaction({ metadata: null }),
    appliedTransaction({
      type: "manual_topup_approved",
      entries: [
        {
          ...appliedTransaction().entries[0],
          direction: "available_credit",
          availableDelta: 12_345,
          frozenDelta: 0
        }
      ]
    })
  ])("does not call the recorder for a nonqualifying wallet fact", async (fact) => {
    const recorder = { recordNdpConsumption: jest.fn() };
    const service = new LedgerService(
      {} as LedgerRepositoryPort,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      recorder
    );
    await service.recordNdpExperienceForAppliedTransaction(fact, transactionClient);
    expect(recorder.recordNdpConsumption).not.toHaveBeenCalled();
  });

  it("defers membership-purchase rows to entitlement handling", async () => {
    const recorder = { recordNdpConsumption: jest.fn() };
    const service = new LedgerService(
      {} as LedgerRepositoryPort,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      recorder
    );
    await service.recordNdpExperienceForAppliedTransaction(
      appliedTransaction({
        type: "platform_membership_purchase" as LedgerTransactionPayload["type"],
        referenceType: "platform_membership_entitlement",
        metadata: { entitlementPublicId: "00000000-0000-4000-8000-000000000123" }
      }),
      transactionClient
    );
    expect(recorder.recordNdpConsumption).not.toHaveBeenCalled();
  });

  it("passes a validated refund reversal through the same wallet transaction", async () => {
    const recorder = {
      recordNdpConsumption: jest.fn(),
      recordNdpReversal: jest.fn(async () => ({ status: "awarded" as const }))
    };
    const service = new LedgerService(
      {} as LedgerRepositoryPort,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      recorder
    );
    await service.recordNdpExperienceForAppliedTransaction(
      appliedTransaction({
        type: "booking_consumption_refund" as LedgerTransactionPayload["type"],
        referenceType: "booking_order_refund",
        metadata: { originalLedgerTransactionNo: "TX-NDP-ORIGINAL" },
        entries: [
          {
            ...appliedTransaction().entries[0],
            direction: "available_credit",
            amount: 4_000,
            availableDelta: 4_000,
            frozenDelta: 0
          }
        ]
      }),
      transactionClient
    );
    expect(recorder.recordNdpConsumption).not.toHaveBeenCalled();
    expect(recorder.recordNdpReversal).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "reversal",
        reversedNdp: 4_000,
        originalLedgerTransactionNo: "TX-NDP-ORIGINAL"
      }),
      { transactionClient }
    );
  });
});
