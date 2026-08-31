import type { TokenPairPayload } from "../api/auth";
import type { IdentityAvailability } from "../features/identity-applications/model";
import type { AuthIdentityPayload, AuthMePayload } from "./rbac";

export const formalAccessTokenMaxTtlSeconds = 15 * 60;

const needoPublicIdPattern = /^(?:u|needo)\d{10}$/;
const identityPublicIdPattern = /^(?:u|s|b|o|needo)\d{10}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const merchantAccountIdentityTypes = new Set([
  "merchant_organization",
  "merchant_owner",
  "o",
  "owner",
]);
const identityKinds = new Set<IdentityAvailability["kind"]>([
  "customer",
  "technician",
  "merchant",
  "affiliate",
]);
const identityAvailabilityStates = new Set<IdentityAvailability["state"]>([
  "active",
  "available_to_apply",
  "draft",
  "pending",
  "rejected",
]);

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNullablePositiveInteger(value: unknown): value is number | null {
  return value === null || isPositiveInteger(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isIsoDateTimeOrNull(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" &&
      value.length > 0 &&
      Number.isFinite(Date.parse(value)))
  );
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

export function isFormalAuthIdentityPayload(
  value: unknown,
): value is AuthIdentityPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const identity = value as Partial<AuthIdentityPayload>;

  return (
    isPositiveInteger(identity.id) &&
    (identity.publicId === null ||
      (typeof identity.publicId === "string" &&
        identityPublicIdPattern.test(identity.publicId))) &&
    (identity.scopeType === null ||
      (typeof identity.scopeType === "string" &&
        identity.scopeType.length > 0)) &&
    isNullablePositiveInteger(identity.scopeId) &&
    typeof identity.type === "string" &&
    identity.type.length > 0
  );
}

function isFormalIdentityAvailability(
  value: unknown,
): value is IdentityAvailability {
  if (!value || typeof value !== "object") {
    return false;
  }

  const availability = value as Partial<IdentityAvailability>;

  return (
    identityKinds.has(availability.kind as IdentityAvailability["kind"]) &&
    identityAvailabilityStates.has(
      availability.state as IdentityAvailability["state"],
    ) &&
    isNullablePositiveInteger(availability.identityId) &&
    isNullablePositiveInteger(availability.applicationId) &&
    isNullableString(availability.rejectionReason)
  );
}

export function isFormalAuthMePayload(value: unknown): value is AuthMePayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const me = value as Partial<AuthMePayload>;

  return (
    isPositiveInteger(me.id) &&
    typeof me.needoId === "string" &&
    needoPublicIdPattern.test(me.needoId) &&
    typeof me.primaryPublicId === "string" &&
    needoPublicIdPattern.test(me.primaryPublicId) &&
    isPositiveInteger(me.activeIdentityId) &&
    (me.activePublicId === null ||
      (typeof me.activePublicId === "string" &&
        identityPublicIdPattern.test(me.activePublicId))) &&
    typeof me.email === "string" &&
    emailPattern.test(me.email) &&
    isIsoDateTimeOrNull(me.emailVerifiedAt) &&
    typeof me.hasPassword === "boolean" &&
    typeof me.username === "string" &&
    me.username.length > 0 &&
    isNullableString(me.avatarUrl) &&
    typeof me.isActive === "boolean" &&
    typeof me.isTestAccount === "boolean" &&
    isFormalAuthIdentityPayload(me.currentIdentity) &&
    Array.isArray(me.identities) &&
    me.identities.length > 0 &&
    me.identities.every(isFormalAuthIdentityPayload) &&
    me.identities.some((identity) => identity.id === me.currentIdentity?.id) &&
    me.activeIdentityId === me.currentIdentity?.id &&
    me.activePublicId === me.currentIdentity?.publicId &&
    Array.isArray(me.identityAvailability) &&
    me.identityAvailability.every(isFormalIdentityAvailability) &&
    isStringArray(me.roles) &&
    isStringArray(me.permissions) &&
    isStringArray(me.menus)
  );
}

export function requireFormalAuthMePayload(
  value: unknown,
  errorKey = "error.api",
): AuthMePayload {
  if (!isFormalAuthMePayload(value)) {
    throw new Error(errorKey);
  }

  return value;
}

export function isFormalTokenPair(value: unknown): value is TokenPairPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const tokens = value as Partial<TokenPairPayload>;

  return (
    typeof tokens.accessToken === "string" &&
    tokens.accessToken.length > 0 &&
    typeof tokens.refreshToken === "string" &&
    tokens.refreshToken.length > 0 &&
    isPositiveInteger(tokens.expiresIn) &&
    tokens.expiresIn <= formalAccessTokenMaxTtlSeconds
  );
}

export function requireFormalTokenPair<TPayload extends TokenPairPayload>(
  value: unknown,
): TPayload {
  if (!isFormalTokenPair(value)) {
    throw new Error("error.api");
  }

  return value as TPayload;
}

export function requireFormalRefreshPayload(value: unknown): {
  accessToken: string;
  expiresIn: number;
} {
  if (!value || typeof value !== "object") {
    throw new Error("error.api");
  }

  const payload = value as { accessToken?: unknown; expiresIn?: unknown };
  if (
    typeof payload.accessToken !== "string" ||
    payload.accessToken.length === 0 ||
    !isPositiveInteger(payload.expiresIn) ||
    payload.expiresIn > formalAccessTokenMaxTtlSeconds
  ) {
    throw new Error("error.api");
  }

  return payload as { accessToken: string; expiresIn: number };
}

export type AuthTransitionValidationContext = {
  expectedIdentityId?: number;
  expectedUserId?: number;
};

export function requireFormalSwitchIdentityPayload<
  TPayload extends TokenPairPayload & { me: AuthMePayload },
>(value: unknown, context: AuthTransitionValidationContext = {}): TPayload {
  if (!isFormalTokenPair(value) || !("me" in value)) {
    throw new Error("error.api");
  }

  const payload = value as Partial<TPayload>;
  const me = requireFormalAuthMePayload(payload.me);
  if (
    (context.expectedUserId !== undefined &&
      me.id !== context.expectedUserId) ||
    (context.expectedIdentityId !== undefined &&
      me.currentIdentity.id !== context.expectedIdentityId)
  ) {
    throw new Error("error.api");
  }

  return value as TPayload;
}

export function requireFormalSwitchMerchantShopPayload<
  TPayload extends TokenPairPayload & {
    me: AuthMePayload;
    shopPublicId: string;
  },
>(
  value: unknown,
  requestedShopPublicId: string,
  context: Required<AuthTransitionValidationContext>,
): TPayload {
  const payload = requireFormalSwitchIdentityPayload<TPayload>(value, context);
  if (
    !/^shop\d{10}$/.test(payload.shopPublicId) ||
    payload.shopPublicId !== requestedShopPublicId ||
    payload.me.currentIdentity.scopeType !== "merchant_account" ||
    !merchantAccountIdentityTypes.has(payload.me.currentIdentity.type)
  ) {
    throw new Error("error.api");
  }

  return payload;
}
