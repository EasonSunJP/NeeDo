import { randomUUID } from "node:crypto";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import type { ContractCatalogPort, ContractDefinition } from "./contract-acceptance.service";

export interface AffiliateContractAcceptanceProjection {
  id: number;
  contractType: "affiliate";
  contractVersion: string;
  contentHash: string;
  acceptedAt: Date;
  receiptId: string;
}

export interface AffiliateIdentityActivationResult {
  contractAcceptance: AffiliateContractAcceptanceProjection;
  affiliate: {
    affiliateStatus: "active" | "suspended" | "closed";
    needoId: string;
    profileId: number;
  };
}

export interface ActivateAffiliateWithContractRepositoryInput {
  userId: number;
  sessionId: string;
  acceptedAt: Date;
  receiptId: string;
  contract: ContractDefinition;
}

export interface AffiliateIdentityActivationRepositoryPort {
  activateWithContractInTransaction: (
    input: ActivateAffiliateWithContractRepositoryInput
  ) => Promise<AffiliateIdentityActivationResult>;
}

export interface ActivateAffiliateIdentityInput {
  userId: number;
  contractVersion: string;
  contentHash: string;
  language: string;
  sessionId: string;
  hasRead: boolean;
  hasAgreed: boolean;
  acceptedAt: Date;
}

export class AffiliateIdentityActivationService {
  public constructor(
    private readonly catalog: ContractCatalogPort,
    private readonly repository: AffiliateIdentityActivationRepositoryPort,
    private readonly createReceiptId: () => string = randomUUID
  ) {}

  public getCurrentContract(language: string): Promise<ContractDefinition> {
    return this.catalog.getCurrent("affiliate", language);
  }

  public async activate(
    input: ActivateAffiliateIdentityInput
  ): Promise<AffiliateIdentityActivationResult> {
    if (!input.hasRead || !input.hasAgreed) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.contract.acknowledgements_required",
        statusCode: 400
      });
    }
    const contract = await this.catalog.getCurrent("affiliate", input.language);
    if (
      contract.type !== "affiliate" ||
      contract.version !== input.contractVersion ||
      contract.contentHash !== input.contentHash
    ) {
      throw new AppError({
        code: ERROR_CODES.SAAS_BILLING_CONFLICT,
        message: "error.contract.version_conflict",
        statusCode: 409
      });
    }

    return this.repository.activateWithContractInTransaction({
      userId: input.userId,
      sessionId: input.sessionId,
      acceptedAt: input.acceptedAt,
      receiptId: this.createReceiptId(),
      contract
    });
  }
}
