import { ERROR_CODES } from "../constants/error-codes";
import type { AuthIdentityRecord, AuthRepositoryPort } from "../repositories/auth.repository";
import { AppError } from "../utils/app-error";

export interface PersonalIdentityActor {
  userId: number;
  currentIdentityId?: number;
  currentIdentityType?: string;
}

export interface PersonalIdentityScope {
  identityId: number;
  userId: number;
  identityType: string;
  scopeType: string | null;
  scopeId: number | null;
}

const CUSTOMER_IDENTITY_TYPES = new Set(["customer", "user", "u"]);
const AFFILIATE_IDENTITY_TYPES = new Set(["scout", "affiliate", "alliance_marketing"]);

const isAvailableIdentity = (identity: AuthIdentityRecord) =>
  identity.isActive && identity.deletedAt === null;

export class PersonalIdentityScopeService {
  public constructor(private readonly authRepository: Pick<AuthRepositoryPort, "findUserById">) {}

  public async resolve(actor: PersonalIdentityActor): Promise<PersonalIdentityScope> {
    if (!actor.currentIdentityId || !actor.currentIdentityType) {
      throw this.identityNotFound();
    }

    const user = await this.authRepository.findUserById(actor.userId);
    if (!user || !user.isActive || user.deletedAt !== null) {
      throw this.identityNotFound();
    }

    const currentIdentity = user.identities.find(
      (identity) =>
        identity.id === actor.currentIdentityId &&
        identity.userId === actor.userId &&
        identity.type === actor.currentIdentityType &&
        isAvailableIdentity(identity)
    );

    if (!currentIdentity) {
      throw this.identityNotFound();
    }

    if (!AFFILIATE_IDENTITY_TYPES.has(currentIdentity.type)) {
      return this.toScope(currentIdentity);
    }

    const customerIdentity = user.identities
      .filter(
        (identity) =>
          identity.userId === actor.userId &&
          CUSTOMER_IDENTITY_TYPES.has(identity.type) &&
          isAvailableIdentity(identity)
      )
      .sort((left, right) => Number(right.isDefault) - Number(left.isDefault) || left.id - right.id)[0];

    if (!customerIdentity) {
      throw this.identityNotFound();
    }

    return this.toScope(customerIdentity);
  }

  private toScope(identity: AuthIdentityRecord): PersonalIdentityScope {
    return {
      identityId: identity.id,
      userId: identity.userId,
      identityType: identity.type,
      scopeType: identity.scopeType,
      scopeId: identity.scopeId
    };
  }

  private identityNotFound(): AppError {
    return new AppError({
      code: ERROR_CODES.IDENTITY_NOT_FOUND,
      message: "error.auth.identity_not_found",
      statusCode: 403
    });
  }
}
