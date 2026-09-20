import { ERROR_CODES } from "../constants/error-codes";
import { calculateRequiredPrepaymentJpy } from "../domain/service-prepayment";
import type { EffectiveNdpExchangeRate } from "../repositories/ndp-exchange-rate.repository";
import type {
  ServicePrepaymentMethod,
  ServicePrepaymentRecord,
  ServicePrepaymentRepositoryPort,
  ServicePrepaymentSubject
} from "../repositories/service-prepayment.repository";
import { AppError } from "../utils/app-error";
import type {
  LedgerService,
  LedgerTransactionClient,
  WalletOwnerType
} from "./ledger.service";

export interface ServicePrepaymentEvidence {
  baseAmountJpy: number;
  confirmedAmountJpy: number;
  confirmed: boolean;
  percent: number;
  status: ServicePrepaymentRecord["status"];
}

export interface ServicePrepaymentConfirmInput {
  subject: ServicePrepaymentSubject;
  actorUserId: number;
  actorIdentityId: number;
  baseAmountJpy: number;
  percent: number;
  method: ServicePrepaymentMethod;
  walletOwnerType?: Extract<WalletOwnerType, "user" | "shop">;
  walletOwnerId?: number;
  externalReference?: string | null;
  idempotencyKey: string;
  requestFingerprint: string;
}

export interface ServicePrepaymentTransitionInput {
  subject: ServicePrepaymentSubject;
  actorUserId: number;
  actorIdentityId: number;
  idempotencyKey: string;
}

interface ExchangeRateAuthority {
  resolveEffectiveRate(at: Date): Promise<EffectiveNdpExchangeRate>;
}

export class ServicePrepaymentService {
  public constructor(
    private readonly repository: ServicePrepaymentRepositoryPort,
    private readonly ledger: Pick<LedgerService, "freezeServicePrepayment" | "releaseServicePrepayment">,
    private readonly exchangeRates: ExchangeRateAuthority,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async confirm(input: ServicePrepaymentConfirmInput): Promise<ServicePrepaymentRecord> {
    this.assertInput(input);
    const amountJpy = calculateRequiredPrepaymentJpy(input.baseAmountJpy, input.percent);
    const rate = input.method === "ndp" ? await this.exchangeRates.resolveEffectiveRate(this.now()) : null;
    const amountNdp = rate ? this.convertJpyToNdp(amountJpy, rate) : 0;

    return this.repository.runInTransaction(async (repository, transactionClient) => {
      const replay = await repository.findByIdempotencyKeyForUpdate(input.idempotencyKey);
      if (replay) {
        this.assertReplay(replay, input, amountJpy);
        return replay;
      }
      if (!await repository.subjectBelongsToIdentity(input.subject, input.actorIdentityId)) {
        throw new AppError({ code: ERROR_CODES.FORBIDDEN, message: "error.auth.permission_forbidden", statusCode: 403 });
      }
      if (await repository.findBySubjectForUpdate(input.subject)) throw this.conflict();

      let walletHoldId: number | null = null;
      if (input.method === "ndp") {
        if (!rate || !input.walletOwnerType || !input.walletOwnerId) throw this.invalidState();
        const hold = await this.ledger.freezeServicePrepayment({
          subject: input.subject,
          actorUserId: input.actorUserId,
          walletOwnerType: input.walletOwnerType,
          walletOwnerId: input.walletOwnerId,
          amountNdp,
          amountJpy,
          baseAmountJpy: input.baseAmountJpy,
          percent: input.percent,
          idempotencyKey: `${input.idempotencyKey}:hold`,
          exchangeRate: {
            ruleId: rate.ruleId,
            version: rate.version,
            ndpUnits: rate.ndpUnits,
            jpyUnits: rate.jpyUnits
          }
        }, { transactionClient: transactionClient as LedgerTransactionClient });
        walletHoldId = hold.id;
      }

      const confirmed = input.method === "ndp";
      const created = await repository.create({
        subject: input.subject,
        baseAmountJpy: input.baseAmountJpy,
        percent: input.percent,
        amountJpy,
        confirmedAmountJpy: confirmed ? amountJpy : 0,
        paymentMethod: input.method,
        status: confirmed ? "confirmed" : "pending",
        walletHoldId,
        externalReference: input.externalReference ?? null,
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: input.requestFingerprint,
        createdByIdentityId: input.actorIdentityId,
        confirmedAt: confirmed ? this.now() : null
      });
      await repository.createAudit({
        actorUserId: input.actorUserId,
        action: "payment.service_prepayment.created",
        targetId: created.id,
        metadata: {
          subject: input.subject,
          baseAmountJpy: input.baseAmountJpy,
          percent: input.percent,
          amountJpy,
          amountNdp,
          paymentMethod: input.method,
          status: created.status
        }
      });
      return created;
    });
  }

  public async confirmExternal(
    input: ServicePrepaymentTransitionInput & { externalReference: string }
  ): Promise<ServicePrepaymentRecord> {
    return this.repository.runInTransaction(async (repository) => {
      const prepayment = await this.requireOwnedSubject(repository, input);
      if (prepayment.status === "confirmed") return prepayment;
      if (prepayment.status !== "pending" || prepayment.paymentMethod === "ndp") throw this.invalidState();
      const updated = await repository.transition({
        id: prepayment.id,
        status: "confirmed",
        confirmedAmountJpy: prepayment.amountJpy,
        externalReference: input.externalReference,
        occurredAt: this.now()
      });
      await repository.createAudit({
        actorUserId: input.actorUserId,
        action: "payment.service_prepayment.confirmed",
        targetId: updated.id,
        metadata: { subject: input.subject, externalReference: input.externalReference }
      });
      return updated;
    });
  }

  public async release(input: ServicePrepaymentTransitionInput): Promise<ServicePrepaymentRecord> {
    return this.repository.runInTransaction(async (repository, transactionClient) => {
      const prepayment = await this.requireOwnedSubject(repository, input);
      if (prepayment.status === "released" || prepayment.status === "refunded") return prepayment;
      if (prepayment.status !== "pending" && prepayment.status !== "confirmed") throw this.invalidState();
      if (prepayment.walletHoldId !== null) {
        await this.ledger.releaseServicePrepayment({
          walletHoldId: prepayment.walletHoldId,
          actorUserId: input.actorUserId,
          idempotencyKey: input.idempotencyKey
        }, { transactionClient: transactionClient as LedgerTransactionClient });
      }
      const updated = await repository.transition({
        id: prepayment.id,
        status: "released",
        confirmedAmountJpy: 0,
        occurredAt: this.now()
      });
      await repository.createAudit({
        actorUserId: input.actorUserId,
        action: "payment.service_prepayment.released",
        targetId: updated.id,
        metadata: { subject: input.subject, previousStatus: prepayment.status }
      });
      return updated;
    });
  }

  public async refund(input: ServicePrepaymentTransitionInput): Promise<ServicePrepaymentRecord> {
    return this.repository.runInTransaction(async (repository, transactionClient) => {
      const prepayment = await this.requireOwnedSubject(repository, input);
      if (prepayment.status === "refunded") return prepayment;
      if (prepayment.status !== "confirmed" && prepayment.status !== "captured" && prepayment.status !== "refund_pending") {
        throw this.invalidState();
      }
      if (prepayment.walletHoldId !== null && prepayment.status === "confirmed") {
        await this.ledger.releaseServicePrepayment({
          walletHoldId: prepayment.walletHoldId,
          actorUserId: input.actorUserId,
          idempotencyKey: input.idempotencyKey
        }, { transactionClient: transactionClient as LedgerTransactionClient });
      }
      const updated = await repository.transition({
        id: prepayment.id,
        status: "refunded",
        confirmedAmountJpy: 0,
        occurredAt: this.now()
      });
      await repository.createAudit({
        actorUserId: input.actorUserId,
        action: "payment.service_prepayment.refunded",
        targetId: updated.id,
        metadata: { subject: input.subject, previousStatus: prepayment.status }
      });
      return updated;
    });
  }

  public getEvidence(subject: ServicePrepaymentSubject): Promise<ServicePrepaymentEvidence | null> {
    return this.repository.runInTransaction(async (repository) => {
      const record = await repository.findBySubjectForUpdate(subject);
      if (!record) return null;
      const confirmed = record.status === "confirmed" || record.status === "captured";
      return {
        baseAmountJpy: record.baseAmountJpy,
        confirmedAmountJpy: confirmed ? record.confirmedAmountJpy : 0,
        confirmed,
        percent: record.percent,
        status: record.status
      };
    });
  }

  private async requireOwnedSubject(
    repository: ServicePrepaymentRepositoryPort,
    input: ServicePrepaymentTransitionInput
  ): Promise<ServicePrepaymentRecord> {
    if (!await repository.subjectBelongsToIdentity(input.subject, input.actorIdentityId)) {
      throw new AppError({ code: ERROR_CODES.FORBIDDEN, message: "error.auth.permission_forbidden", statusCode: 403 });
    }
    const prepayment = await repository.findBySubjectForUpdate(input.subject);
    if (!prepayment) throw this.invalidState();
    return prepayment;
  }

  private assertInput(input: ServicePrepaymentConfirmInput): void {
    if (
      !Number.isSafeInteger(input.subject.id) || input.subject.id <= 0 ||
      !Number.isSafeInteger(input.actorUserId) || input.actorUserId <= 0 ||
      !Number.isSafeInteger(input.actorIdentityId) || input.actorIdentityId <= 0 ||
      !/^[A-Za-z0-9:_-]{8,191}$/.test(input.idempotencyKey) ||
      !/^[a-f0-9]{64}$/i.test(input.requestFingerprint)
    ) throw this.invalidState();
    calculateRequiredPrepaymentJpy(input.baseAmountJpy, input.percent);
    if (input.method === "ndp" && (!input.walletOwnerType || !Number.isSafeInteger(input.walletOwnerId) || input.walletOwnerId! <= 0)) {
      throw this.invalidState();
    }
  }

  private assertReplay(record: ServicePrepaymentRecord, input: ServicePrepaymentConfirmInput, amountJpy: number): void {
    if (
      record.requestFingerprint !== input.requestFingerprint ||
      record.subject.type !== input.subject.type || record.subject.id !== input.subject.id ||
      record.baseAmountJpy !== input.baseAmountJpy || record.percent !== input.percent ||
      record.amountJpy !== amountJpy || record.paymentMethod !== input.method ||
      record.createdByIdentityId !== input.actorIdentityId
    ) throw this.conflict();
  }

  private convertJpyToNdp(amountJpy: number, rate: EffectiveNdpExchangeRate): number {
    const result = (BigInt(amountJpy) * BigInt(rate.ndpUnits) + BigInt(rate.jpyUnits) - 1n) / BigInt(rate.jpyUnits);
    const value = Number(result);
    if (!Number.isSafeInteger(value)) throw this.invalidState();
    return value;
  }

  private conflict(): AppError {
    return new AppError({ code: ERROR_CODES.IDEMPOTENCY_KEY_REUSED, message: "error.idempotency_key_reused", statusCode: 409 });
  }

  private invalidState(): AppError {
    return new AppError({ code: ERROR_CODES.PAYMENT_INVALID_STATE, message: "error.payment.invalid_state", statusCode: 409 });
  }
}
