import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";

export type IdentityActivationKind = "technician" | "merchant" | "affiliate";

export interface ActivatedIdentityRecord {
  identityId: number;
  userId: number;
  identityType: string;
  roleCode: string;
  scopeType: string;
  scopeId: number | null;
}

export interface ActivateIdentityTransactionInput {
  userId: number;
  actorUserId: number;
  identityType: string;
  roleCode: string;
  scopeType: string;
  scopeId: number | null;
  displayName: string;
  applicationId: number | null;
  contractAcceptanceId: number | null;
  activatedAt: Date;
  notificationPayload: Record<string, unknown>;
  auditMetadata: Record<string, unknown>;
  idempotencyKey: string;
}

export interface IdentityActivationRepositoryPort {
  findActiveIdentity: (
    userId: number,
    identityType: string
  ) => Promise<ActivatedIdentityRecord | null>;
  activateInTransaction: (
    input: ActivateIdentityTransactionInput
  ) => Promise<ActivatedIdentityRecord>;
}

export interface ActivateIdentityInput {
  kind: IdentityActivationKind;
  userId: number;
  actorUserId: number;
  displayName: string;
  scopeId: number | null;
  applicationId: number | null;
  contractAcceptanceId: number | null;
  activatedAt: Date;
}

const activationMapping: Readonly<
  Record<IdentityActivationKind, { identityType: string; roleCode: string; scopeType: string }>
> = {
  technician: {
    identityType: "technician",
    roleCode: "technician",
    scopeType: "technician_profile"
  },
  merchant: {
    identityType: "merchant_owner",
    roleCode: "merchant_owner",
    scopeType: "shop"
  },
  affiliate: {
    identityType: "scout",
    roleCode: "scout",
    scopeType: "global"
  }
};

export const buildIdentityActivationTransactionInput = (
  input: ActivateIdentityInput
): ActivateIdentityTransactionInput => {
  const mapping = activationMapping[input.kind];
  if (input.kind !== "affiliate" && input.scopeId === null) {
    throw new AppError({
      code: ERROR_CODES.VALIDATION,
      message: "error.identity_activation.scope_required",
      statusCode: 400
    });
  }

  const idempotencySource =
    input.applicationId === null
      ? `contract:${input.contractAcceptanceId ?? "missing"}`
      : `application:${input.applicationId}`;
  return {
    userId: input.userId,
    actorUserId: input.actorUserId,
    identityType: mapping.identityType,
    roleCode: mapping.roleCode,
    scopeType: mapping.scopeType,
    scopeId: input.kind === "affiliate" ? null : input.scopeId,
    displayName: input.displayName.trim(),
    applicationId: input.applicationId,
    contractAcceptanceId: input.contractAcceptanceId,
    activatedAt: input.activatedAt,
    notificationPayload: {
      identityKind: input.kind,
      activatedAt: input.activatedAt.toISOString(),
      applicationId: input.applicationId
    },
    auditMetadata: {
      identityKind: input.kind,
      applicationId: input.applicationId,
      contractAcceptanceId: input.contractAcceptanceId,
      scopeType: mapping.scopeType,
      scopeId: input.kind === "affiliate" ? null : input.scopeId
    },
    idempotencyKey: `identity-activation:${input.userId}:${mapping.identityType}:${idempotencySource}`
  };
};

export class IdentityActivationService {
  public constructor(private readonly repository: IdentityActivationRepositoryPort) {}

  public async activate(input: ActivateIdentityInput): Promise<ActivatedIdentityRecord> {
    const transactionInput = buildIdentityActivationTransactionInput(input);

    const existing = await this.repository.findActiveIdentity(
      input.userId,
      transactionInput.identityType
    );
    if (existing) {
      return existing;
    }

    return this.repository.activateInTransaction(transactionInput);
  }
}
