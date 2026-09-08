import type { TokenPairPayload } from "../api/auth";
import type { IdentityAvailability } from "../features/identity-applications/model";
import type {
  AuthIdentityPayload,
  AuthMePayload,
  UserPolicyComplianceRequirement
} from "./rbac";

export const formalAccessTokenTtlSeconds = 900;

const needoPublicIdPattern = /^(?:u|needo)\d{10}$/;
const identityPublicIdPattern = /^(?:u|s|b|o|needo)\d{10}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const merchantAccountIdentityTypes = new Set([
  "merchant_organization",
  "merchant_owner",
  "o",
  "owner"
]);
const identityKinds = new Set<IdentityAvailability["kind"]>([
  "customer",
  "technician",
  "merchant",
  "affiliate"
]);
const identityAvailabilityStates = new Set<IdentityAvailability["state"]>([
  "active",
  "available_to_apply",
  "draft",
  "pending",
  "rejected"
]);
const authMeKeys = [
  "id",
  "needoId",
  "primaryPublicId",
  "activeIdentityId",
  "activePublicId",
  "email",
  "emailVerifiedAt",
  "hasPassword",
  "username",
  "avatarUrl",
  "profileDisplayName",
  "isActive",
  "isTestAccount",
  "currentIdentity",
  "identities",
  "roles",
  "permissions",
  "menus",
  "identityAvailability"
] as const;
const authMeComplianceKeys = [
  "complianceRequirements",
  "compliancePolicyVersionPublicId",
  "complianceEffectiveAt",
  "compliancePermittedNextRoutes"
] as const;
const complianceRequirements = new Set<UserPolicyComplianceRequirement>([
  "phone_binding_required",
  "email_binding_required",
  "ekyc_required"
]);
const identityKeys = ["id", "publicId", "scopeId", "scopeType", "type", "displayName"] as const;
const identityAvailabilityKeys = [
  "kind",
  "state",
  "identityId",
  "applicationId",
  "rejectionReason"
] as const;
const tokenPairKeys = ["accessToken", "refreshToken", "expiresIn"] as const;

function hasExactKeys(value: object, keys: readonly string[], optional: readonly string[] = []) {
  const actual = Object.keys(value);
  return (
    keys.every((key) => Object.hasOwn(value, key)) &&
    actual.every((key) => keys.includes(key) || optional.includes(key))
  );
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNullablePositiveInteger(value: unknown): value is number | null {
  return value === null || isPositiveInteger(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isRfc3339DateTimeOrNull(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string") return false;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(
      value
    );
  if (!match) return false;
  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    offsetHourText,
    offsetMinuteText
  ] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const offsetHour = offsetHourText === undefined ? 0 : Number(offsetHourText);
  const offsetMinute = offsetMinuteText === undefined ? 0 : Number(offsetMinuteText);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return (
    year >= 1 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 23 &&
    offsetMinute <= 59
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function isFormalAuthIdentityPayload(value: unknown): value is AuthIdentityPayload {
  if (!value || typeof value !== "object" || !hasExactKeys(value, identityKeys)) {
    return false;
  }

  const identity = value as Partial<AuthIdentityPayload>;

  return (
    isPositiveInteger(identity.id) &&
    (identity.publicId === null ||
      (typeof identity.publicId === "string" && identityPublicIdPattern.test(identity.publicId))) &&
    (identity.scopeType === null ||
      (typeof identity.scopeType === "string" && identity.scopeType.length > 0)) &&
    isNullablePositiveInteger(identity.scopeId) &&
    typeof identity.type === "string" &&
    identity.type.length > 0 &&
    isNullableString(identity.displayName)
  );
}

function isFormalIdentityAvailability(value: unknown): value is IdentityAvailability {
  if (!value || typeof value !== "object" || !hasExactKeys(value, identityAvailabilityKeys)) {
    return false;
  }

  const availability = value as Partial<IdentityAvailability>;

  return (
    identityKinds.has(availability.kind as IdentityAvailability["kind"]) &&
    identityAvailabilityStates.has(availability.state as IdentityAvailability["state"]) &&
    isNullablePositiveInteger(availability.identityId) &&
    isNullablePositiveInteger(availability.applicationId) &&
    isNullableString(availability.rejectionReason)
  );
}

export function isFormalAuthMePayload(value: unknown): value is AuthMePayload {
  if (!value || typeof value !== "object" || !hasExactKeys(value, authMeKeys, authMeComplianceKeys)) {
    return false;
  }

  const me = value as Partial<AuthMePayload>;

  const complianceFields = authMeComplianceKeys.filter((key) => Object.hasOwn(me, key));
  const complianceValid =
    complianceFields.length === 0 ||
    (complianceFields.length === authMeComplianceKeys.length &&
      Array.isArray(me.complianceRequirements) &&
      me.complianceRequirements.every((item) => complianceRequirements.has(item)) &&
      typeof me.compliancePolicyVersionPublicId === "string" &&
      me.compliancePolicyVersionPublicId.length > 0 &&
      typeof me.complianceEffectiveAt === "string" &&
      isRfc3339DateTimeOrNull(me.complianceEffectiveAt) &&
      isStringArray(me.compliancePermittedNextRoutes));

  return (
    isPositiveInteger(me.id) &&
    typeof me.needoId === "string" &&
    needoPublicIdPattern.test(me.needoId) &&
    typeof me.primaryPublicId === "string" &&
    needoPublicIdPattern.test(me.primaryPublicId) &&
    isPositiveInteger(me.activeIdentityId) &&
    (me.activePublicId === null ||
      (typeof me.activePublicId === "string" && identityPublicIdPattern.test(me.activePublicId))) &&
    typeof me.email === "string" &&
    emailPattern.test(me.email) &&
    isRfc3339DateTimeOrNull(me.emailVerifiedAt) &&
    typeof me.hasPassword === "boolean" &&
    typeof me.username === "string" &&
    me.username.length > 0 &&
    isNullableString(me.avatarUrl) &&
    isNullableString(me.profileDisplayName) &&
    typeof me.isActive === "boolean" &&
    typeof me.isTestAccount === "boolean" &&
    isFormalAuthIdentityPayload(me.currentIdentity) &&
    Array.isArray(me.identities) &&
    me.identities.length > 0 &&
    me.identities.every(isFormalAuthIdentityPayload) &&
    new Set(me.identities.map((identity) => identity.id)).size === me.identities.length &&
    me.identities.filter((identity) => identity.id === me.currentIdentity?.id).length === 1 &&
    me.identities.some(
      (identity) =>
        identity.id === me.currentIdentity?.id &&
        identity.publicId === me.currentIdentity.publicId &&
        identity.type === me.currentIdentity.type &&
        identity.scopeType === me.currentIdentity.scopeType &&
        identity.scopeId === me.currentIdentity.scopeId &&
        identity.displayName === me.currentIdentity.displayName
    ) &&
    me.activeIdentityId === me.currentIdentity?.id &&
    me.activePublicId === me.currentIdentity?.publicId &&
    Array.isArray(me.identityAvailability) &&
    me.identityAvailability.every(isFormalIdentityAvailability) &&
    isStringArray(me.roles) &&
    isStringArray(me.permissions) &&
    isStringArray(me.menus) &&
    complianceValid
  );
}

export function requireFormalAuthMePayload(value: unknown, errorKey = "error.api"): AuthMePayload {
  if (!isFormalAuthMePayload(value)) {
    throw new Error(errorKey);
  }

  return value;
}

export function isFormalTokenPair(value: unknown): value is TokenPairPayload {
  if (!value || typeof value !== "object" || !hasExactKeys(value, tokenPairKeys)) {
    return false;
  }

  const tokens = value as Partial<TokenPairPayload>;

  return (
    typeof tokens.accessToken === "string" &&
    tokens.accessToken.length > 0 &&
    typeof tokens.refreshToken === "string" &&
    tokens.refreshToken.length > 0 &&
    tokens.expiresIn === formalAccessTokenTtlSeconds
  );
}

export function requireFormalTokenPair<TPayload extends TokenPairPayload>(
  value: unknown,
  exactKeys: readonly string[] = tokenPairKeys
): TPayload {
  if (!value || typeof value !== "object" || !hasExactKeys(value, exactKeys)) {
    throw new Error("error.api");
  }
  const tokens = value as Partial<TokenPairPayload>;
  if (
    typeof tokens.accessToken !== "string" ||
    tokens.accessToken.length === 0 ||
    typeof tokens.refreshToken !== "string" ||
    tokens.refreshToken.length === 0 ||
    tokens.expiresIn !== formalAccessTokenTtlSeconds
  ) {
    throw new Error("error.api");
  }

  return value as TPayload;
}

export function requireFormalRefreshPayload(value: unknown): {
  accessToken: string;
  expiresIn: number;
} {
  if (!value || typeof value !== "object" || !hasExactKeys(value, ["accessToken", "expiresIn"])) {
    throw new Error("error.api");
  }

  const payload = value as { accessToken?: unknown; expiresIn?: unknown };
  if (
    typeof payload.accessToken !== "string" ||
    payload.accessToken.length === 0 ||
    payload.expiresIn !== formalAccessTokenTtlSeconds
  ) {
    throw new Error("error.api");
  }

  return payload as { accessToken: string; expiresIn: number };
}

export type AuthTransitionValidationContext = {
  expectedIdentityId: number;
  expectedUserId: number;
};

export function requireFormalSwitchIdentityPayload<
  TPayload extends TokenPairPayload & { me: AuthMePayload }
>(value: unknown, context: AuthTransitionValidationContext): TPayload {
  if (!value || typeof value !== "object" || !hasExactKeys(value, [...tokenPairKeys, "me"])) {
    throw new Error("error.api");
  }

  const payload = value as Partial<TPayload>;
  requireFormalTokenPair(value, [...tokenPairKeys, "me"]);
  const me = requireFormalAuthMePayload(payload.me);
  if (me.id !== context.expectedUserId || me.currentIdentity.id !== context.expectedIdentityId) {
    throw new Error("error.api");
  }

  return value as TPayload;
}

export function requireFormalSwitchMerchantShopPayload<
  TPayload extends TokenPairPayload & {
    me: AuthMePayload;
    shopPublicId: string;
  }
>(
  value: unknown,
  requestedShopPublicId: string,
  context: AuthTransitionValidationContext
): TPayload {
  if (
    !value ||
    typeof value !== "object" ||
    !hasExactKeys(value, [...tokenPairKeys, "me", "shopPublicId"])
  ) {
    throw new Error("error.api");
  }
  const candidate = value as Record<string, unknown>;
  const payload = requireFormalSwitchIdentityPayload<TPayload>(
    Object.fromEntries(Object.entries(candidate).filter(([key]) => key !== "shopPublicId")),
    context
  );
  const shopPublicId = candidate.shopPublicId;
  if (
    typeof shopPublicId !== "string" ||
    !/^shop\d{10}$/.test(shopPublicId) ||
    shopPublicId !== requestedShopPublicId ||
    payload.me.currentIdentity.scopeType !== "merchant_account" ||
    !merchantAccountIdentityTypes.has(payload.me.currentIdentity.type)
  ) {
    throw new Error("error.api");
  }

  return value as TPayload;
}
