import { clearMerchantAdminPreview } from "./merchantAdminPreview";

export type AuthTransitionCredentials = {
  accessToken: string | null;
  refreshToken: string;
};

export type AuthTransitionPhase = "preflight" | "server_rotated" | "client_committed";

export type AuthCredentialSnapshot = {
  accessToken: string | null;
  authCredentialEpoch: number;
  credentialVersion: number;
  expectedAuthUserId: number | null;
  generation: number;
  operationId: number;
  phase: AuthTransitionPhase;
  refreshToken: string | null;
};

export type AuthOperation = {
  generation: number;
  id: number;
  kind: string;
  mode: "latest" | "rotation";
  phase: AuthTransitionPhase;
  serverCredentials: AuthTransitionCredentials | null;
};

type RotatedCommitInput = {
  expectedUserId: number | null;
  persistClient: () => boolean;
};

type Revoker = (credentials: AuthTransitionCredentials) => void | Promise<void>;

const listeners = new Set<() => void>();
let accessToken: string | null = null;
let refreshToken: string | null = null;
let expectedAuthUserId: number | null = null;
let credentialVersion = 0;
let generation = 0;
let operationSequence = 0;
let activeLatestOperationId: number | null = null;
let activeRotationOperationId: number | null = null;
let activeServerCredentials: AuthTransitionCredentials | null = null;
let phase: AuthTransitionPhase = "client_committed";
let rotationTail = Promise.resolve();
let revoker: Revoker | null = null;

function publish() {
  listeners.forEach((listener) => listener());
}

function revoke(credentials: AuthTransitionCredentials | null) {
  if (credentials && revoker) {
    void Promise.resolve(revoker(credentials)).catch(() => undefined);
  }
}

function operationIsCurrent(operation: AuthOperation) {
  if (operation.generation !== generation) return false;
  return operation.mode === "latest"
    ? activeLatestOperationId === operation.id
    : activeRotationOperationId === operation.id;
}

function failClosed() {
  revoke(activeServerCredentials);
  activeServerCredentials = null;
  generation += 1;
  credentialVersion += 1;
  operationSequence += 1;
  activeLatestOperationId = null;
  activeRotationOperationId = null;
  rotationTail = Promise.resolve();
  accessToken = null;
  refreshToken = null;
  expectedAuthUserId = null;
  phase = "client_committed";
  clearMerchantAdminPreview();
  publish();
}

export function hydrateAuthCredentialCoordinator(input: {
  credentialVersion: number;
  expectedUserId: number | null;
  refreshToken: string | null;
}) {
  generation += 1;
  operationSequence += 1;
  activeLatestOperationId = null;
  activeRotationOperationId = null;
  activeServerCredentials = null;
  rotationTail = Promise.resolve();
  accessToken = null;
  refreshToken = input.refreshToken;
  expectedAuthUserId = input.expectedUserId;
  credentialVersion = Number.isSafeInteger(input.credentialVersion)
    ? Math.max(credentialVersion, input.credentialVersion)
    : credentialVersion;
  phase = "client_committed";
  publish();
}

export function getAuthCredentialSnapshot(): AuthCredentialSnapshot {
  return {
    accessToken,
    authCredentialEpoch: credentialVersion,
    credentialVersion,
    expectedAuthUserId,
    generation,
    operationId: operationSequence,
    phase,
    refreshToken
  };
}

export function subscribeAuthCredentialSnapshot(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setAuthCredentialRevoker(nextRevoker: Revoker | null) {
  revoker = nextRevoker;
}

export function beginLatestAuthOperation(kind: string): AuthOperation {
  revoke(activeServerCredentials);
  activeServerCredentials = null;
  generation += 1;
  operationSequence += 1;
  activeLatestOperationId = operationSequence;
  activeRotationOperationId = null;
  rotationTail = Promise.resolve();
  phase = "preflight";
  publish();
  return {
    generation,
    id: operationSequence,
    kind,
    mode: "latest",
    phase,
    serverCredentials: null
  };
}

export function isAuthOperationCurrent(operation: AuthOperation) {
  return operationIsCurrent(operation);
}

export function markAuthOperationServerRotated(
  operation: AuthOperation,
  credentials: AuthTransitionCredentials
) {
  operation.phase = "server_rotated";
  operation.serverCredentials = credentials;
  if (!operationIsCurrent(operation)) {
    revoke(credentials);
    return false;
  }
  phase = "server_rotated";
  activeServerCredentials = credentials;
  publish();
  return true;
}

export function commitRotatedAuthOperation(operation: AuthOperation, input: RotatedCommitInput) {
  const credentials = operation.serverCredentials;
  if (!credentials || !operationIsCurrent(operation)) {
    revoke(credentials);
    return false;
  }

  const persisted = input.persistClient();
  if (!persisted) {
    revoke(credentials);
    activeServerCredentials = null;
    failClosed();
    return false;
  }

  accessToken = credentials.accessToken;
  refreshToken = credentials.refreshToken;
  expectedAuthUserId = input.expectedUserId;
  activeServerCredentials = null;
  credentialVersion += 1;
  operation.phase = "client_committed";
  phase = "client_committed";
  if (operation.mode === "latest") activeLatestOperationId = null;
  if (operation.mode === "rotation") activeRotationOperationId = null;
  publish();
  return true;
}

export function rejectAuthOperationAfterServerRotation(operation: AuthOperation) {
  if (!operationIsCurrent(operation)) {
    return false;
  }

  revoke(operation.serverCredentials);
  activeServerCredentials = null;
  failClosed();
  return true;
}

export function abandonAuthOperation(operation: AuthOperation) {
  if (!operationIsCurrent(operation) || operation.phase !== "preflight") return false;
  if (operation.mode === "latest") activeLatestOperationId = null;
  if (operation.mode === "rotation") activeRotationOperationId = null;
  operation.phase = "client_committed";
  phase = "client_committed";
  publish();
  return true;
}

export function commitExistingAuthOperation(
  operation: AuthOperation,
  expectedUserIdValue: number,
  persistClient: () => boolean
) {
  if (!operationIsCurrent(operation) || !persistClient()) return false;
  expectedAuthUserId = expectedUserIdValue;
  credentialVersion += 1;
  operation.phase = "client_committed";
  phase = "client_committed";
  if (operation.mode === "latest") activeLatestOperationId = null;
  if (operation.mode === "rotation") activeRotationOperationId = null;
  publish();
  return true;
}

export async function enqueueAuthRotation<TResult>(
  kind: string,
  run: (operation: AuthOperation, credentials: AuthTransitionCredentials) => Promise<TResult>
): Promise<TResult> {
  if (activeLatestOperationId !== null) {
    throw new Error("error.auth.operation_superseded");
  }
  const requestedGeneration = generation;
  const execute = rotationTail.then(async () => {
    if (requestedGeneration !== generation || activeLatestOperationId !== null) {
      throw new Error("error.auth.operation_superseded");
    }
    const snapshot = getAuthCredentialSnapshot();
    if (!snapshot.refreshToken) {
      throw new Error("error.auth.refresh_missing");
    }
    operationSequence += 1;
    const operation: AuthOperation = {
      generation,
      id: operationSequence,
      kind,
      mode: "rotation",
      phase: "preflight",
      serverCredentials: null
    };
    activeRotationOperationId = operation.id;
    phase = "preflight";
    publish();
    try {
      return await run(operation, {
        accessToken: snapshot.accessToken,
        refreshToken: snapshot.refreshToken
      });
    } catch (error) {
      if (requestedGeneration !== generation) {
        throw new Error("error.auth.operation_superseded");
      }
      throw error;
    } finally {
      abandonAuthOperation(operation);
    }
  });
  rotationTail = execute.then(
    () => undefined,
    () => undefined
  );
  return execute;
}

export function terminateAuthImmediately() {
  const snapshot = getAuthCredentialSnapshot();
  const credentials = snapshot.refreshToken
    ? {
        accessToken: snapshot.accessToken,
        refreshToken: snapshot.refreshToken
      }
    : null;
  failClosed();
  return credentials;
}

export function installServerAuthCredentials(
  credentials: AuthTransitionCredentials,
  expectedUserIdValue: number | null = expectedAuthUserId
) {
  const operation = beginLatestAuthOperation("direct-server-credentials");
  markAuthOperationServerRotated(operation, credentials);
  return commitRotatedAuthOperation(operation, {
    expectedUserId: expectedUserIdValue,
    persistClient: () => true
  });
}

export function setCoordinatorAccessToken(nextAccessToken: string | null) {
  accessToken = nextAccessToken;
  credentialVersion += 1;
  publish();
  return true;
}

export function setCoordinatorRefreshToken(nextRefreshToken: string | null) {
  credentialVersion += 1;
  refreshToken = nextRefreshToken;
  publish();
  return true;
}

export function setCoordinatorExpectedUserId(userId: number | null) {
  expectedAuthUserId = Number.isInteger(userId) && (userId ?? 0) > 0 ? userId : null;
  publish();
}

export function commitAutoRefreshedAccessToken(
  capturedVersion: number,
  capturedGeneration: number,
  nextAccessToken: string
) {
  if (
    capturedVersion !== credentialVersion ||
    capturedGeneration !== generation ||
    phase !== "client_committed" ||
    !refreshToken
  )
    return false;
  accessToken = nextAccessToken;
  credentialVersion += 1;
  phase = "client_committed";
  publish();
  return true;
}
