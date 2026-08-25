import { randomUUID } from "node:crypto";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import type { ContractCatalogPort, ContractDefinition } from "./contract-acceptance.service";

export interface MerchantContractAcceptanceProjection {
  id: number;
  applicationId: number;
  applicationVersion: number;
  contractType: "merchant";
  contractVersion: string;
  contentHash: string;
  acceptedAt: Date;
  receiptId: string;
}

export interface AcceptAndBindMerchantContractRepositoryInput {
  userId: number;
  applicationId: number;
  expectedVersion: number;
  sessionId: string;
  acceptedAt: Date;
  receiptId: string;
  contract: ContractDefinition;
}

export interface MerchantContractAcceptanceRepositoryPort {
  acceptAndBindInTransaction: (
    input: AcceptAndBindMerchantContractRepositoryInput
  ) => Promise<MerchantContractAcceptanceProjection>;
}

export interface AcceptMerchantContractInput {
  userId: number;
  applicationId: number;
  expectedVersion: number;
  contractVersion: string;
  contentHash: string;
  language: string;
  sessionId: string;
  hasRead: boolean;
  hasAgreed: boolean;
  acceptedAt: Date;
}

export class MerchantContractAcceptanceService {
  public constructor(
    private readonly catalog: ContractCatalogPort,
    private readonly repository: MerchantContractAcceptanceRepositoryPort,
    private readonly createReceiptId: () => string = randomUUID
  ) {}

  public async accept(
    input: AcceptMerchantContractInput
  ): Promise<MerchantContractAcceptanceProjection> {
    if (!input.hasRead || !input.hasAgreed) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.contract.acknowledgements_required",
        statusCode: 400
      });
    }
    const contract = await this.catalog.getCurrent("merchant", input.language);
    if (
      contract.type !== "merchant" ||
      contract.version !== input.contractVersion ||
      contract.contentHash !== input.contentHash
    ) {
      throw new AppError({
        code: ERROR_CODES.SAAS_BILLING_CONFLICT,
        message: "error.contract.version_conflict",
        statusCode: 409
      });
    }
    return this.repository.acceptAndBindInTransaction({
      userId: input.userId,
      applicationId: input.applicationId,
      expectedVersion: input.expectedVersion,
      sessionId: input.sessionId,
      acceptedAt: input.acceptedAt,
      receiptId: this.createReceiptId(),
      contract
    });
  }
}
