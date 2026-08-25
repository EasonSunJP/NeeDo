import { randomUUID } from "node:crypto";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";

export type ContractType = "merchant" | "affiliate";

export interface ContractDefinition {
  type: ContractType;
  version: string;
  effectiveAt: Date;
  language: string;
  text: string;
  contentHash: string;
}

export interface ContractAcceptanceRecord {
  id: number;
  acceptedByUserId: number;
  identityApplicationId: number | null;
  contractType: ContractType;
  contractVersion: string;
  effectiveAt: Date;
  acceptedTextSnapshot: string;
  contentHash: string;
  acceptedAt: Date;
  language: string;
  sessionId: string;
  receiptId: string;
  acceptanceKey: string;
}

export type CreateContractAcceptanceInput = Omit<ContractAcceptanceRecord, "id">;

export interface ContractCatalogPort {
  getCurrent: (type: ContractType, language: string) => Promise<ContractDefinition>;
}

export interface ContractAcceptanceRepositoryPort {
  findByAcceptanceKey: (acceptanceKey: string) => Promise<ContractAcceptanceRecord | null>;
  create: (input: CreateContractAcceptanceInput) => Promise<ContractAcceptanceRecord>;
}

export interface AcceptContractInput {
  userId: number;
  identityApplicationId?: number | null;
  contractType: ContractType;
  contractVersion: string;
  contentHash: string;
  language: string;
  sessionId: string;
  acceptedAt: Date;
  hasRead: boolean;
  hasAgreed: boolean;
}

export class ContractAcceptanceService {
  public constructor(
    private readonly catalog: ContractCatalogPort,
    private readonly repository: ContractAcceptanceRepositoryPort,
    private readonly createReceiptId: () => string = randomUUID
  ) {}

  public getCurrent(type: ContractType, language: string): Promise<ContractDefinition> {
    return this.catalog.getCurrent(type, language);
  }

  public async accept(input: AcceptContractInput): Promise<ContractAcceptanceRecord> {
    if (!input.hasRead || !input.hasAgreed) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.contract.acknowledgements_required",
        statusCode: 400
      });
    }

    const current = await this.catalog.getCurrent(input.contractType, input.language);
    if (
      current.version !== input.contractVersion ||
      current.contentHash !== input.contentHash ||
      current.type !== input.contractType
    ) {
      throw new AppError({
        code: ERROR_CODES.SAAS_BILLING_CONFLICT,
        message: "error.contract.version_conflict",
        statusCode: 409
      });
    }

    const identityApplicationId = input.identityApplicationId ?? null;
    const acceptanceKey = [
      input.userId,
      input.contractType,
      current.version,
      ...(identityApplicationId === null ? [] : ["application", identityApplicationId])
    ].join(":");
    const existing = await this.repository.findByAcceptanceKey(acceptanceKey);
    if (existing) {
      return existing;
    }

    return this.repository.create({
      acceptedByUserId: input.userId,
      identityApplicationId,
      contractType: input.contractType,
      contractVersion: current.version,
      effectiveAt: current.effectiveAt,
      acceptedTextSnapshot: current.text,
      contentHash: current.contentHash,
      acceptedAt: input.acceptedAt,
      language: current.language,
      sessionId: input.sessionId,
      receiptId: this.createReceiptId(),
      acceptanceKey
    });
  }
}
