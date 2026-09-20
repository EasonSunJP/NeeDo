import type {
  ServicePrepaymentRecord,
  ServicePrepaymentRepositoryPort,
  ServicePrepaymentSubject
} from "../src/repositories/service-prepayment.repository";
import { ServicePrepaymentService } from "../src/services/service-prepayment.service";

const now = new Date("2026-09-20T00:00:00.000Z");

function record(overrides: Partial<ServicePrepaymentRecord> = {}): ServicePrepaymentRecord {
  return {
    id: 1,
    subject: { type: "booking", id: 71 },
    baseAmountJpy: 10_000,
    percent: 30,
    amountJpy: 3_000,
    confirmedAmountJpy: 3_000,
    paymentMethod: "ndp",
    status: "confirmed",
    walletHoldId: 19,
    externalReference: null,
    idempotencyKey: "booking:71:prepayment",
    requestFingerprint: "a".repeat(64),
    createdByIdentityId: 5,
    confirmedAt: now,
    capturedAt: null,
    releasedAt: null,
    refundPendingAt: null,
    refundedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function fixture(existing: ServicePrepaymentRecord | null = null) {
  let stored = existing;
  const repository = {
    runInTransaction: jest.fn(async (handler) => handler(repository, { transaction: true })),
    findByIdempotencyKeyForUpdate: jest.fn(async (key) => stored?.idempotencyKey === key ? stored : null),
    findBySubjectForUpdate: jest.fn(async (subject: ServicePrepaymentSubject) =>
      stored?.subject.type === subject.type && stored.subject.id === subject.id ? stored : null),
    subjectBelongsToIdentity: jest.fn(async (_subject: ServicePrepaymentSubject, _identityId: number) => true),
    create: jest.fn(async (input) => {
      stored = record({
        subject: input.subject,
        baseAmountJpy: input.baseAmountJpy,
        percent: input.percent,
        amountJpy: input.amountJpy,
        confirmedAmountJpy: input.confirmedAmountJpy,
        paymentMethod: input.paymentMethod,
        status: input.status,
        walletHoldId: input.walletHoldId,
        externalReference: input.externalReference ?? null,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: input.requestFingerprint,
        createdByIdentityId: input.createdByIdentityId,
        confirmedAt: input.confirmedAt
      });
      return stored;
    }),
    transition: jest.fn(async (input) => {
      stored = record({
        ...stored,
        status: input.status,
        ...(input.confirmedAmountJpy !== undefined ? { confirmedAmountJpy: input.confirmedAmountJpy } : {}),
        ...(input.externalReference !== undefined ? { externalReference: input.externalReference } : {})
      });
      return stored;
    }),
    createAudit: jest.fn(async (_input: { actorUserId: number; action: string; targetId: number; metadata: unknown }) => undefined)
  } as unknown as jest.Mocked<ServicePrepaymentRepositoryPort>;
  const ledger = {
    freezeServicePrepayment: jest.fn(async () => ({ id: 19 })),
    releaseServicePrepayment: jest.fn(async () => ({ id: 19 }))
  };
  const exchangeRates = {
    resolveEffectiveRate: jest.fn(async () => ({
      ruleId: 7,
      publicId: "rate-7",
      version: 3,
      ndpUnits: 3,
      jpyUnits: 2,
      effectiveFrom: now
    }))
  };
  return {
    repository,
    ledger,
    service: new ServicePrepaymentService(repository, ledger as never, exchangeRates, () => now)
  };
}

const validInput = {
  subject: { type: "booking", id: 71 } as const,
  actorUserId: 4,
  actorIdentityId: 5,
  baseAmountJpy: 10_000,
  percent: 30,
  method: "ndp" as const,
  walletOwnerType: "user" as const,
  walletOwnerId: 4,
  idempotencyKey: "booking:71:prepayment",
  requestFingerprint: "a".repeat(64)
};

describe("ServicePrepaymentService", () => {
  it("calculates the server amount and freezes its exact NDP equivalent", async () => {
    const { service, ledger, repository } = fixture();
    await expect(service.confirm(validInput)).resolves.toMatchObject({
      amountJpy: 3_000,
      confirmedAmountJpy: 3_000,
      status: "confirmed"
    });
    expect(ledger.freezeServicePrepayment).toHaveBeenCalledWith(
      expect.objectContaining({ amountJpy: 3_000, amountNdp: 4_500, percent: 30 }),
      expect.objectContaining({ transactionClient: { transaction: true } })
    );
    expect(repository.createAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: "payment.service_prepayment.created"
    }));
  });

  it("returns an exact replay and rejects a mismatched fingerprint", async () => {
    const saved = record();
    const { service, ledger } = fixture(saved);
    await expect(service.confirm(validInput)).resolves.toBe(saved);
    expect(ledger.freezeServicePrepayment).not.toHaveBeenCalled();
    await expect(service.confirm({ ...validInput, requestFingerprint: "b".repeat(64) }))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it("keeps external payment pending until server confirmation", async () => {
    const { service } = fixture();
    const pending = await service.confirm({
      ...validInput,
      method: "bank_transfer",
      walletOwnerType: undefined,
      walletOwnerId: undefined
    });
    expect(pending).toMatchObject({ status: "pending", confirmedAmountJpy: 0 });
    await expect(service.getEvidence(validInput.subject)).resolves.toMatchObject({ confirmed: false, confirmedAmountJpy: 0 });
    await expect(service.confirmExternal({
      subject: validInput.subject,
      actorUserId: 4,
      actorIdentityId: 5,
      idempotencyKey: "booking:71:external-confirm",
      externalReference: "bank-confirmation-1"
    })).resolves.toMatchObject({ status: "confirmed", confirmedAmountJpy: 3_000 });
  });

  it("releases confirmed evidence and the linked wallet hold atomically", async () => {
    const { service, ledger } = fixture(record());
    await expect(service.release({
      subject: validInput.subject,
      actorUserId: 4,
      actorIdentityId: 5,
      idempotencyKey: "booking:71:release"
    })).resolves.toMatchObject({ status: "released", confirmedAmountJpy: 0 });
    expect(ledger.releaseServicePrepayment).toHaveBeenCalledWith(
      expect.objectContaining({ walletHoldId: 19 }),
      expect.objectContaining({ transactionClient: { transaction: true } })
    );
    await expect(service.getEvidence(validInput.subject)).resolves.toMatchObject({ confirmed: false, confirmedAmountJpy: 0 });
  });

  it("rejects a subject that is not owned by the actor identity", async () => {
    const { service, repository } = fixture();
    repository.subjectBelongsToIdentity.mockResolvedValue(false);
    await expect(service.confirm(validInput)).rejects.toMatchObject({ statusCode: 403 });
  });
});
