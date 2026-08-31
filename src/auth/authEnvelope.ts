import { readBrowserStorage, writeBrowserStorage } from "../lib/browserStorage";
import { isPortalScope, type PortalScope } from "./portal";
import {
  authSessionVersion,
  isLoginMethod,
  type AuthIdentityPayload,
  type AuthSession
} from "./rbac";

export const persistedAuthEnvelopeStorageKey = "needo.auth.envelope.v8";
const persistedAuthEnvelopeLockName = "needo-auth-envelope-v8";

export type AuthEnvelopeLockAdapter = {
  request<TResult>(
    name: string,
    options: { mode: "exclusive" },
    callback: () => Promise<TResult> | TResult
  ): Promise<TResult>;
};

let authEnvelopeLockAdapterOverride: AuthEnvelopeLockAdapter | null | undefined;

export function setAuthEnvelopeLockAdapter(
  adapter: AuthEnvelopeLockAdapter | null | undefined
) {
  authEnvelopeLockAdapterOverride = adapter;
}

function getAuthEnvelopeLockAdapter(): AuthEnvelopeLockAdapter | null {
  if (authEnvelopeLockAdapterOverride !== undefined) {
    return authEnvelopeLockAdapterOverride;
  }
  if (typeof navigator === "undefined" || !navigator.locks) return null;
  return {
    request: async (name, options, callback) =>
      await navigator.locks.request(name, options, async () => await callback())
  };
}

export function createAuthInstanceId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    bytes.forEach((_value, index) => {
      bytes[index] = Math.floor(Math.random() * 256);
    });
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

type RememberedPortalAuthorizationV8 = {
  refreshToken: string;
  session: AuthSession;
};

export type RememberedByPortalV8 = Partial<Record<PortalScope, RememberedPortalAuthorizationV8>>;

type AuthEnvelopeBaseV8 = {
  authInstanceId: string;
  credentialVersion: number;
  schemaVersion: 8;
};

export type CommittedAuthEnvelopeV8 = AuthEnvelopeBaseV8 & {
  refreshToken: string;
  rememberedByPortal: RememberedByPortalV8;
  session: AuthSession;
  state: "committed";
};

export type AnonymousAuthEnvelopeV8 = AuthEnvelopeBaseV8 & {
  refreshToken: null;
  rememberedByPortal: Record<string, never>;
  session: null;
  state: "anonymous";
};

export type PersistedAuthEnvelopeV8 = CommittedAuthEnvelopeV8 | AnonymousAuthEnvelopeV8;

const envelopeKeys = [
  "schemaVersion",
  "state",
  "authInstanceId",
  "credentialVersion",
  "refreshToken",
  "session",
  "rememberedByPortal"
] as const;
const sessionRequiredKeys = [
  "authVersion",
  "id",
  "needoId",
  "primaryPublicId",
  "activeIdentityId",
  "activePublicId",
  "username",
  "email",
  "emailVerifiedAt",
  "hasPassword",
  "avatarUrl",
  "portal",
  "allowedPortals",
  "loginMethod",
  "loggedInAt",
  "linkedCustomerId",
  "linkedTechnicianId",
  "linkedStoreId",
  "roles",
  "permissions",
  "menus",
  "currentIdentity",
  "identities",
  "identityAvailability"
] as const;
const identityKeys = ["id", "publicId", "scopeId", "scopeType", "type"] as const;
const availabilityKeys = [
  "kind",
  "state",
  "identityId",
  "applicationId",
  "rejectionReason"
] as const;
const rememberedKeys = ["refreshToken", "session"] as const;
const needoPublicIdPattern = /^(?:u|needo)\d{10}$/;
const identityPublicIdPattern = /^(?:u|s|b|o|needo)\d{10}$/;
const shopPublicIdPattern = /^shop\d{10}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const availabilityKinds = new Set(["customer", "technician", "merchant", "affiliate"]);
const availabilityStates = new Set([
  "active",
  "available_to_apply",
  "draft",
  "pending",
  "rejected"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = []
) {
  const keys = Object.keys(value);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key))
  );
}

function isSafePositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isNullableSafePositiveInteger(value: unknown): value is number | null {
  return value === null || isSafePositiveInteger(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isRfc3339(value: unknown): value is string {
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
    offsetHour,
    offsetMinute
  ] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  return (
    year >= 1 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= new Date(Date.UTC(year, month, 0)).getUTCDate() &&
    Number(hourText) <= 23 &&
    Number(minuteText) <= 59 &&
    Number(secondText) <= 59 &&
    (offsetHour === undefined || Number(offsetHour) <= 23) &&
    (offsetMinute === undefined || Number(offsetMinute) <= 59)
  );
}

function isIdentity(value: unknown): value is AuthIdentityPayload {
  if (!isRecord(value) || !hasExactKeys(value, identityKeys)) return false;
  return (
    isSafePositiveInteger(value.id) &&
    (value.publicId === null ||
      (typeof value.publicId === "string" && identityPublicIdPattern.test(value.publicId))) &&
    isNullableSafePositiveInteger(value.scopeId) &&
    (value.scopeType === null ||
      (typeof value.scopeType === "string" && value.scopeType.length > 0)) &&
    typeof value.type === "string" &&
    value.type.length > 0
  );
}

function isAvailability(value: unknown) {
  if (!isRecord(value) || !hasExactKeys(value, availabilityKeys)) return false;
  return (
    typeof value.kind === "string" &&
    availabilityKinds.has(value.kind) &&
    typeof value.state === "string" &&
    availabilityStates.has(value.state) &&
    isNullableSafePositiveInteger(value.identityId) &&
    isNullableSafePositiveInteger(value.applicationId) &&
    (value.rejectionReason === null || typeof value.rejectionReason === "string")
  );
}

export function isStrictAuthSession(value: unknown): value is AuthSession {
  if (!isRecord(value) || !hasExactKeys(value, sessionRequiredKeys, ["merchantShopPublicId"])) {
    return false;
  }
  const identities = value.identities;
  const currentIdentity = value.currentIdentity;
  const availability = value.identityAvailability;
  if (
    !Array.isArray(identities) ||
    identities.length === 0 ||
    !identities.every(isIdentity) ||
    !isIdentity(currentIdentity) ||
    new Set(identities.map((identity) => identity.id)).size !== identities.length ||
    identities.filter(
      (identity) =>
        identity.id === currentIdentity.id &&
        identity.publicId === currentIdentity.publicId &&
        identity.scopeId === currentIdentity.scopeId &&
        identity.scopeType === currentIdentity.scopeType &&
        identity.type === currentIdentity.type
    ).length !== 1 ||
    !Array.isArray(availability) ||
    !availability.every(isAvailability)
  ) {
    return false;
  }
  return (
    value.authVersion === authSessionVersion &&
    isSafePositiveInteger(value.id) &&
    typeof value.needoId === "string" &&
    needoPublicIdPattern.test(value.needoId) &&
    typeof value.primaryPublicId === "string" &&
    needoPublicIdPattern.test(value.primaryPublicId) &&
    isSafePositiveInteger(value.activeIdentityId) &&
    value.activeIdentityId === currentIdentity.id &&
    value.activePublicId === currentIdentity.publicId &&
    typeof value.username === "string" &&
    value.username.length > 0 &&
    typeof value.email === "string" &&
    emailPattern.test(value.email) &&
    (value.emailVerifiedAt === null || isRfc3339(value.emailVerifiedAt)) &&
    typeof value.hasPassword === "boolean" &&
    (value.avatarUrl === null || typeof value.avatarUrl === "string") &&
    typeof value.portal === "string" &&
    isPortalScope(value.portal) &&
    Array.isArray(value.allowedPortals) &&
    value.allowedPortals.length > 0 &&
    value.allowedPortals.every(isPortalScope) &&
    value.allowedPortals.includes(value.portal) &&
    typeof value.loginMethod === "string" &&
    isLoginMethod(value.loginMethod) &&
    isRfc3339(value.loggedInAt) &&
    typeof value.linkedCustomerId === "string" &&
    typeof value.linkedTechnicianId === "string" &&
    typeof value.linkedStoreId === "string" &&
    isStringArray(value.roles) &&
    isStringArray(value.permissions) &&
    isStringArray(value.menus) &&
    (value.merchantShopPublicId === undefined ||
      (value.portal === "merchant" &&
        typeof value.merchantShopPublicId === "string" &&
        shopPublicIdPattern.test(value.merchantShopPublicId)))
  );
}

function isRememberedByPortal(
  value: unknown,
  expectedUserId: number
): value is RememberedByPortalV8 {
  if (!isRecord(value)) return false;
  return Object.entries(value).every(([portal, remembered]) => {
    if (
      !isPortalScope(portal) ||
      !isRecord(remembered) ||
      !hasExactKeys(remembered, rememberedKeys)
    ) {
      return false;
    }
    return (
      typeof remembered.refreshToken === "string" &&
      remembered.refreshToken.length > 0 &&
      isStrictAuthSession(remembered.session) &&
      remembered.session.id === expectedUserId &&
      remembered.session.portal === portal
    );
  });
}

export function isPersistedAuthEnvelopeV8(value: unknown): value is PersistedAuthEnvelopeV8 {
  if (!isRecord(value) || !hasExactKeys(value, envelopeKeys)) return false;
  if (
    value.schemaVersion !== 8 ||
    typeof value.authInstanceId !== "string" ||
    !uuidPattern.test(value.authInstanceId) ||
    !Number.isSafeInteger(value.credentialVersion) ||
    Number(value.credentialVersion) < 0
  ) {
    return false;
  }
  if (value.state === "anonymous") {
    return (
      value.refreshToken === null &&
      value.session === null &&
      isRecord(value.rememberedByPortal) &&
      Object.keys(value.rememberedByPortal).length === 0
    );
  }
  if (value.state !== "committed" || !isStrictAuthSession(value.session)) return false;
  return (
    typeof value.refreshToken === "string" &&
    value.refreshToken.length > 0 &&
    isRememberedByPortal(value.rememberedByPortal, value.session.id)
  );
}

export function createCommittedAuthEnvelope(input: {
  authInstanceId: string;
  credentialVersion: number;
  refreshToken: string;
  rememberedByPortal?: RememberedByPortalV8;
  session: AuthSession;
}): CommittedAuthEnvelopeV8 {
  return {
    schemaVersion: 8,
    state: "committed",
    authInstanceId: input.authInstanceId,
    credentialVersion: input.credentialVersion,
    refreshToken: input.refreshToken,
    session: input.session,
    rememberedByPortal: input.rememberedByPortal ?? {}
  };
}

export function createAnonymousAuthEnvelope(input: {
  authInstanceId: string;
  credentialVersion: number;
}): AnonymousAuthEnvelopeV8 {
  return {
    schemaVersion: 8,
    state: "anonymous",
    authInstanceId: input.authInstanceId,
    credentialVersion: input.credentialVersion,
    refreshToken: null,
    session: null,
    rememberedByPortal: {}
  };
}

export function parsePersistedAuthEnvelopeRaw(raw: string | null) {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isPersistedAuthEnvelopeV8(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function readPersistedAuthEnvelopeSnapshot() {
  const raw = readBrowserStorage(persistedAuthEnvelopeStorageKey, { silent: true });
  const envelope = parsePersistedAuthEnvelopeRaw(raw);
  return envelope ? { envelope, raw: raw as string } : null;
}

export function readPersistedAuthEnvelope(): PersistedAuthEnvelopeV8 | null {
  return readPersistedAuthEnvelopeSnapshot()?.envelope ?? null;
}

type PersistedAuthEnvelopeWriteOptions =
  | {
      canWrite?: () => boolean;
      expectedRaw: string | null;
      terminalAuthInstanceId?: never;
    }
  | { expectedRaw?: never; terminalAuthInstanceId: string };

export async function writePersistedAuthEnvelope(
  envelope: PersistedAuthEnvelopeV8,
  options: PersistedAuthEnvelopeWriteOptions
) {
  if (!isPersistedAuthEnvelopeV8(envelope)) return false;
  const lockAdapter = getAuthEnvelopeLockAdapter();
  if (!lockAdapter) return false;
  try {
    return await lockAdapter.request(
      persistedAuthEnvelopeLockName,
      { mode: "exclusive" },
      async () => {
        const currentRaw = readBrowserStorage(persistedAuthEnvelopeStorageKey, {
          silent: true
        });
        let nextEnvelope = envelope;
        if ("terminalAuthInstanceId" in options) {
          const currentEnvelope = parsePersistedAuthEnvelopeRaw(currentRaw);
          if (
            !currentEnvelope ||
            currentEnvelope.authInstanceId !== options.terminalAuthInstanceId
          ) {
            return false;
          }
          nextEnvelope = createAnonymousAuthEnvelope({
            authInstanceId: options.terminalAuthInstanceId,
            credentialVersion: Math.max(
              envelope.credentialVersion,
              currentEnvelope.credentialVersion +
                (currentEnvelope.state === "committed" ? 1 : 0)
            )
          });
        } else if (currentRaw !== options.expectedRaw) {
          return false;
        }
        if ("canWrite" in options && options.canWrite && !options.canWrite()) return false;
        return writeBrowserStorage(
          persistedAuthEnvelopeStorageKey,
          JSON.stringify(nextEnvelope),
          { silent: true }
        );
      }
    );
  } catch {
    return false;
  }
}
