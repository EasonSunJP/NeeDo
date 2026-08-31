import {
  createAuthInstanceId,
  createCommittedAuthEnvelope,
  readPersistedAuthEnvelope,
  writePersistedAuthEnvelope,
  type RememberedByPortalV8
} from "./authEnvelope";
import type { PortalScope } from "./portal";
import type { AuthSession } from "./rbac";

export function buildRememberedByPortal(
  previous: RememberedByPortalV8,
  session: AuthSession,
  refreshToken: string
): RememberedByPortalV8 {
  return {
    ...previous,
    [session.portal]: { refreshToken, session }
  };
}

export function readRememberedPortalSession(portal: PortalScope) {
  return readRememberedPortalAuthorization(portal)?.session ?? null;
}

export function readRememberedPortalRefreshToken(portal: PortalScope) {
  return readRememberedPortalAuthorization(portal)?.refreshToken ?? null;
}

export function readRememberedPortalAuthorization(portal: PortalScope) {
  const envelope = readPersistedAuthEnvelope();
  return envelope?.state === "committed" ? (envelope.rememberedByPortal[portal] ?? null) : null;
}

export function hasRememberedPortalAuthorization(portal: PortalScope) {
  const envelope = readPersistedAuthEnvelope();
  return Boolean(envelope?.state === "committed" && envelope.rememberedByPortal[portal]);
}

export function rememberPortalAuthorization(
  session: AuthSession,
  refreshToken: string | null | undefined
) {
  if (!refreshToken) return false;
  const existing = readPersistedAuthEnvelope();
  const sameUser = existing?.state === "committed" && existing.session.id === session.id;
  const previous = sameUser ? existing.rememberedByPortal : {};
  return writePersistedAuthEnvelope(
    createCommittedAuthEnvelope({
      authInstanceId: sameUser ? existing.authInstanceId : createAuthInstanceId(),
      credentialVersion: (existing?.credentialVersion ?? 0) + 1,
      refreshToken,
      session,
      rememberedByPortal: buildRememberedByPortal(previous, session, refreshToken)
    })
  );
}

export function forgetRememberedPortalAuthorization(portal: PortalScope) {
  const existing = readPersistedAuthEnvelope();
  if (!existing || existing.state !== "committed") return true;
  const rememberedByPortal = { ...existing.rememberedByPortal };
  delete rememberedByPortal[portal];
  return writePersistedAuthEnvelope({
    ...existing,
    credentialVersion: existing.credentialVersion + 1,
    rememberedByPortal
  });
}

export function forgetAllRememberedPortalAuthorizations() {
  const existing = readPersistedAuthEnvelope();
  if (!existing || existing.state !== "committed") return true;
  return writePersistedAuthEnvelope({
    ...existing,
    credentialVersion: existing.credentialVersion + 1,
    rememberedByPortal: {}
  });
}
