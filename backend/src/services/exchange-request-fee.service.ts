import { ERROR_CODES } from "../constants/error-codes";
import type { AuditLogCreateInput } from "../repositories/audit-log.repository";
import { AppError } from "../utils/app-error";
import type { PaginatedResponse, PaginationInput } from "../utils/pagination";

export const EXCHANGE_REQUEST_FEE_FAMILY = "exchange_request_publication";
export const EXCHANGE_REQUEST_FEE_TYPE = "exchange_request_publication_fee";
export const EXCHANGE_REQUEST_ORDER_TYPE = "exchange_request";
export const EXCHANGE_REQUEST_FEE_MAX_NDP = 1_000_000_000;

export interface ExchangeRequestFeeSnapshot {
  ruleSetId: number;
  ruleSetVersion: number;
  ruleId: number;
  amountNdp: number;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
}

export interface ExchangeRequestFeeVersionCreateInput {
  actorUserId: number;
  amountNdp: number;
  effectiveFrom: Date;
  expectedCurrentVersion: number;
  audit: AuditLogCreateInput;
}

export interface ExchangeRequestPublicationCalculationInput {
  exchangePostId: number;
  payerType: "user" | "shop";
  payerId: number;
  fee: ExchangeRequestFeeSnapshot;
  calculatedAt: Date;
}

export type ExchangeRequestFeeVersionCreateResult =
  | { kind: "success"; value: ExchangeRequestFeeSnapshot }
  | { kind: "conflict" };

export interface ExchangeRequestFeeRepositoryPort {
  withTransactionClient(transactionClient: unknown): ExchangeRequestFeeRepositoryPort;
  findCurrent(at: Date): Promise<ExchangeRequestFeeSnapshot | null>;
  listVersions(input: PaginationInput): Promise<PaginatedResponse<ExchangeRequestFeeSnapshot>>;
  createVersion(
    input: ExchangeRequestFeeVersionCreateInput
  ): Promise<ExchangeRequestFeeVersionCreateResult>;
  recordPublicationCalculation(input: ExchangeRequestPublicationCalculationInput): Promise<number>;
}

export class ExchangeRequestFeeConfigurationError extends Error {
  public constructor() {
    super("Exchange Request fee configuration is invalid");
    this.name = "ExchangeRequestFeeConfigurationError";
  }
}

export class ExchangeRequestFeeService {
  public constructor(private readonly repository: ExchangeRequestFeeRepositoryPort) {}

  public withTransactionClient(transactionClient: unknown): ExchangeRequestFeeService {
    return new ExchangeRequestFeeService(this.repository.withTransactionClient(transactionClient));
  }

  public async resolveCurrent(at: Date): Promise<ExchangeRequestFeeSnapshot> {
    if (!this.validDate(at)) throw this.validationError();
    const fee = await this.repository.findCurrent(at);
    if (!fee || !this.validSnapshot(fee)) throw this.unavailableError();
    return fee;
  }

  public async listVersions(
    input: PaginationInput
  ): Promise<PaginatedResponse<ExchangeRequestFeeSnapshot>> {
    try {
      const page = await this.repository.listVersions(input);
      if (page.list.some((fee) => !this.validSnapshot(fee))) {
        throw this.unavailableError();
      }
      return page;
    } catch (error) {
      if (error instanceof ExchangeRequestFeeConfigurationError) {
        throw this.unavailableError();
      }
      throw error;
    }
  }

  public async createVersion(
    input: ExchangeRequestFeeVersionCreateInput
  ): Promise<ExchangeRequestFeeSnapshot> {
    if (
      !this.positiveInteger(input.actorUserId) ||
      !this.nonNegativeAmount(input.amountNdp) ||
      !this.validDate(input.effectiveFrom) ||
      !this.positiveInteger(input.expectedCurrentVersion)
    ) {
      throw this.validationError();
    }

    const result = await this.repository.createVersion(input);
    if (result.kind === "success") {
      if (!this.validSnapshot(result.value)) throw this.unavailableError();
      return result.value;
    }
    throw new AppError({
      code: ERROR_CODES.EXCHANGE_REQUEST_FEE_VERSION_CONFLICT,
      message: "error.exchange.request_fee_version_conflict",
      statusCode: 409
    });
  }

  public async recordPublicationCalculation(
    input: ExchangeRequestPublicationCalculationInput
  ): Promise<number> {
    if (
      !this.positiveInteger(input.exchangePostId) ||
      !this.positiveInteger(input.payerId) ||
      !this.validDate(input.calculatedAt)
    ) {
      throw this.validationError();
    }
    if (!this.validSnapshot(input.fee)) throw this.unavailableError();
    return this.repository.recordPublicationCalculation(input);
  }

  private validSnapshot(fee: ExchangeRequestFeeSnapshot): boolean {
    return (
      this.positiveInteger(fee.ruleSetId) &&
      this.positiveInteger(fee.ruleSetVersion) &&
      this.positiveInteger(fee.ruleId) &&
      this.nonNegativeAmount(fee.amountNdp) &&
      (fee.effectiveFrom === null || this.validDate(fee.effectiveFrom)) &&
      (fee.effectiveTo === null || this.validDate(fee.effectiveTo)) &&
      (fee.effectiveFrom === null ||
        fee.effectiveTo === null ||
        fee.effectiveFrom < fee.effectiveTo)
    );
  }

  private nonNegativeAmount(value: number): boolean {
    return Number.isSafeInteger(value) && value >= 0 && value <= EXCHANGE_REQUEST_FEE_MAX_NDP;
  }

  private positiveInteger(value: number): boolean {
    return Number.isSafeInteger(value) && value > 0;
  }

  private validDate(value: Date): boolean {
    return value instanceof Date && Number.isFinite(value.getTime());
  }

  private validationError(): AppError {
    return new AppError({
      code: ERROR_CODES.VALIDATION,
      message: "error.validation",
      statusCode: 400
    });
  }

  private unavailableError(): AppError {
    return new AppError({
      code: ERROR_CODES.EXCHANGE_REQUEST_FEE_UNAVAILABLE,
      message: "error.exchange.request_fee_unavailable",
      statusCode: 503
    });
  }
}
