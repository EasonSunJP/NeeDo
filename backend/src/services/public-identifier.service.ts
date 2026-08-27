import { randomInt } from "node:crypto";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import {
  identifierNumberPartSchema,
  publicIdentifierSchema,
  type PublicIdentifierKind
} from "../validators/public-identifier.validator";

export type PersonIdentifierKind = "U" | "NEEDO" | "S" | "B" | "O";
export type PersonAliasIdentifierKind = "S" | "B" | "O";
export type PublicIdentifierStatus = "ACTIVE" | "DISABLED" | "TOMBSTONED";

export interface PublicIdentifierRecord {
  id: number;
  publicId: string;
  numberPart: string;
  kind: PublicIdentifierKind;
  loginAllowed: boolean;
  searchable: boolean;
  status: PublicIdentifierStatus;
  userIdentityId: number | null;
  shopId: number | null;
  merchantAccountId: number | null;
  customerSupportAccountId: number | null;
}

export type PublicIdentifierTarget =
  | { kind: "U" | "NEEDO"; userIdentityId: number }
  | { kind: "OWNER"; merchantAccountId: number };

export interface PublicIdentifierCreateInput {
  publicId: string;
  numberPart: string;
  kind: PublicIdentifierKind;
  loginAllowed: boolean;
  searchable: boolean;
  userIdentityId?: number;
  shopId?: number;
  merchantAccountId?: number;
  customerSupportAccountId?: number;
}

export interface ShopSupportPairCreateInput {
  numberPart: string;
  shopPublicId: string;
  customerSupportPublicId: string;
  shopId: number;
  customerSupportAccountId: number;
}

export interface ShopSupportPairRecord {
  shopIdentifier: PublicIdentifierRecord;
  customerSupportIdentifier: PublicIdentifierRecord;
}

export interface PublicIdentifierRepositoryPort {
  findActiveByPublicId(publicId: string): Promise<PublicIdentifierRecord | null>;
  findAccountNumberByIdentityId(userIdentityId: number): Promise<string | null>;
  isVanityNumberReserved(numberPart: string): Promise<boolean>;
  createIdentifier(input: PublicIdentifierCreateInput): Promise<PublicIdentifierRecord>;
  createShopSupportPair(input: ShopSupportPairCreateInput): Promise<ShopSupportPairRecord>;
  isRetryableIdentifierCollision(error: unknown): boolean;
}

const PERSON_PREFIXES: Record<PersonIdentifierKind, string> = {
  U: "u",
  NEEDO: "needo",
  S: "s",
  B: "b",
  O: "o"
};

const IDENTIFIER_PREFIXES: Record<PublicIdentifierKind, string> = {
  ...PERSON_PREFIXES,
  SHOP: "shop",
  OWNER: "owner",
  CUSTOMER_SUPPORT: "cs"
};

const MAX_ALLOCATION_ATTEMPTS = 8;

export const formatPersonId = (kind: PersonIdentifierKind, numberPart: string): string =>
  `${PERSON_PREFIXES[kind]}${identifierNumberPartSchema.parse(numberPart)}`;

const hasLongMonotonicSequence = (numberPart: string): boolean => {
  let ascendingLength = 1;
  let descendingLength = 1;

  for (let index = 1; index < numberPart.length; index += 1) {
    const difference = Number(numberPart[index]) - Number(numberPart[index - 1]);
    ascendingLength = difference === 1 ? ascendingLength + 1 : 1;
    descendingLength = difference === -1 ? descendingLength + 1 : 1;
    if (ascendingLength >= 6 || descendingLength >= 6) return true;
  }

  return false;
};

const hasRepeatedBlock = (numberPart: string): boolean => {
  for (let blockLength = 2; blockLength <= 5; blockLength += 1) {
    const block = numberPart.slice(0, blockLength);
    if (Array.from(numberPart).every((digit, index) => digit === block[index % blockLength])) {
      return true;
    }
  }
  return false;
};

export const isReservedVanityNumber = (numberPart: string): boolean => {
  if (!identifierNumberPartSchema.safeParse(numberPart).success) return false;
  return (
    /(\d)\1{5,}/.test(numberPart) ||
    hasLongMonotonicSequence(numberPart) ||
    hasRepeatedBlock(numberPart)
  );
};

export class PublicIdentifierAllocationUnavailableError extends AppError {
  public readonly attempts = MAX_ALLOCATION_ATTEMPTS;

  public constructor(cause?: unknown) {
    super({
      code: ERROR_CODES.PUBLIC_IDENTIFIER_ALLOCATION_UNAVAILABLE,
      message: "error.identifier.allocation_busy",
      statusCode: 503,
      cause
    });
    this.name = "PublicIdentifierAllocationUnavailableError";
  }
}

export class IdentifierAllocator {
  public constructor(
    private readonly repository: PublicIdentifierRepositoryPort,
    private readonly nextCandidate: () => string = () =>
      randomInt(0, 10_000_000_000).toString().padStart(10, "0")
  ) {}

  public async allocate(target: PublicIdentifierTarget): Promise<PublicIdentifierRecord> {
    let lastCollision: unknown;

    for (let attempt = 0; attempt < MAX_ALLOCATION_ATTEMPTS; attempt += 1) {
      const numberPart = identifierNumberPartSchema.parse(this.nextCandidate());
      if (await this.isReserved(numberPart)) continue;

      try {
        return await this.repository.createIdentifier(
          this.createIdentifierInput(target, numberPart)
        );
      } catch (error) {
        if (!this.repository.isRetryableIdentifierCollision(error)) throw error;
        lastCollision = error;
      }
    }

    throw new PublicIdentifierAllocationUnavailableError(lastCollision);
  }

  public async registerPersonAlias(input: {
    kind: PersonAliasIdentifierKind;
    userIdentityId: number;
  }): Promise<PublicIdentifierRecord> {
    const accountNo = await this.repository.findAccountNumberByIdentityId(input.userIdentityId);
    if (!accountNo) {
      throw new AppError({
        code: ERROR_CODES.IDENTITY_NOT_FOUND,
        message: "error.identifier.account_number_unavailable",
        statusCode: 404
      });
    }
    const numberPart = identifierNumberPartSchema.parse(accountNo);
    return this.repository.createIdentifier({
      publicId: formatPersonId(input.kind, numberPart),
      numberPart,
      kind: input.kind,
      userIdentityId: input.userIdentityId,
      loginAllowed: true,
      searchable: true
    });
  }

  public async allocateShopSupportPair(input: {
    shopId: number;
    customerSupportAccountId: number;
  }): Promise<ShopSupportPairRecord> {
    let lastCollision: unknown;

    for (let attempt = 0; attempt < MAX_ALLOCATION_ATTEMPTS; attempt += 1) {
      const numberPart = identifierNumberPartSchema.parse(this.nextCandidate());
      if (await this.isReserved(numberPart)) continue;

      try {
        return await this.repository.createShopSupportPair({
          numberPart,
          shopPublicId: this.formatPublicIdentifier("SHOP", numberPart),
          customerSupportPublicId: this.formatPublicIdentifier("CUSTOMER_SUPPORT", numberPart),
          shopId: input.shopId,
          customerSupportAccountId: input.customerSupportAccountId
        });
      } catch (error) {
        if (!this.repository.isRetryableIdentifierCollision(error)) throw error;
        lastCollision = error;
      }
    }

    throw new PublicIdentifierAllocationUnavailableError(lastCollision);
  }

  public async resolve(publicId: string): Promise<PublicIdentifierRecord | null> {
    const parsed = publicIdentifierSchema.safeParse(publicId);
    if (!parsed.success) {
      throw new AppError({
        code: ERROR_CODES.VALIDATION,
        message: "error.identifier.invalid",
        statusCode: 400
      });
    }
    return this.repository.findActiveByPublicId(parsed.data.publicId);
  }

  private async isReserved(numberPart: string): Promise<boolean> {
    return (
      isReservedVanityNumber(numberPart) ||
      (await this.repository.isVanityNumberReserved(numberPart))
    );
  }

  private createIdentifierInput(
    target: PublicIdentifierTarget,
    numberPart: string
  ): PublicIdentifierCreateInput {
    const base = {
      publicId: this.formatPublicIdentifier(target.kind, numberPart),
      numberPart,
      kind: target.kind,
      ...this.capabilitiesFor(target.kind)
    };

    switch (target.kind) {
      case "U":
      case "NEEDO":
        return { ...base, userIdentityId: target.userIdentityId };
      case "OWNER":
        return { ...base, merchantAccountId: target.merchantAccountId };
    }
  }

  private capabilitiesFor(kind: PublicIdentifierKind): {
    loginAllowed: boolean;
    searchable: boolean;
  } {
    switch (kind) {
      case "U":
      case "NEEDO":
      case "S":
      case "B":
      case "O":
        return { loginAllowed: true, searchable: true };
      case "SHOP":
      case "CUSTOMER_SUPPORT":
        return { loginAllowed: false, searchable: true };
      case "OWNER":
        return { loginAllowed: false, searchable: false };
    }
  }

  private formatPublicIdentifier(kind: PublicIdentifierKind, numberPart: string): string {
    return `${IDENTIFIER_PREFIXES[kind]}${identifierNumberPartSchema.parse(numberPart)}`;
  }
}
