const googleIdentityScriptUrl = "https://accounts.google.com/gsi/client";
const defaultCredentialTimeoutMs = 120_000;

export const googleIdentityErrorKeys = {
  apiUnavailable: "error.auth.google_api_unavailable",
  credentialCancelled: "error.auth.google_credential_cancelled",
  credentialTimeout: "error.auth.google_credential_timeout",
  requestInProgress: "error.auth.google_request_in_progress",
  scriptLoadFailed: "error.auth.google_script_load_failed",
} as const;

export type GoogleCredentialRequest = {
  clientId: string;
  nonce: string;
  container: HTMLElement;
  timeoutMs?: number;
};

let scriptLoadPromise: Promise<void> | null = null;
let credentialRequestActive = false;

function getGoogleIdentityApi() {
  return globalThis.google?.accounts?.id;
}

function findExistingScript() {
  return (
    Array.from(document.scripts).find(
      (script) => script.src === googleIdentityScriptUrl,
    ) ?? null
  );
}

function createScript() {
  const script = document.createElement("script");
  script.src = googleIdentityScriptUrl;
  script.async = true;
  script.defer = true;
  script.dataset.needoGoogleIdentity = "true";

  return script;
}

function loadGoogleIdentityScript(timeoutMs: number) {
  if (getGoogleIdentityApi()) {
    return Promise.resolve();
  }

  if (scriptLoadPromise) {
    return scriptLoadPromise;
  }

  scriptLoadPromise = new Promise<void>((resolve, reject) => {
    const existingScript = findExistingScript();
    const script = existingScript ?? createScript();
    let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;

    const cleanup = () => {
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);
      if (timeoutId !== undefined) {
        globalThis.clearTimeout(timeoutId);
      }
    };
    const fail = (errorKey: string) => {
      cleanup();
      script.remove();
      reject(new Error(errorKey));
    };
    const handleLoad = () => {
      cleanup();
      if (!getGoogleIdentityApi()) {
        fail(googleIdentityErrorKeys.apiUnavailable);
        return;
      }

      script.dataset.needoGoogleIdentityLoaded = "true";
      resolve();
    };
    const handleError = () => {
      fail(googleIdentityErrorKeys.scriptLoadFailed);
    };

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
    timeoutId = globalThis.setTimeout(() => {
      fail(googleIdentityErrorKeys.credentialTimeout);
    }, timeoutMs);

    if (!existingScript) {
      document.head.append(script);
    }
  }).catch((error: unknown) => {
    scriptLoadPromise = null;
    throw error;
  });

  return scriptLoadPromise;
}

function receiveGoogleCredential(
  api: GoogleIdentityIdApi,
  request: GoogleCredentialRequest,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (result: { credential: string } | { errorKey: string }) => {
      if (settled) {
        return;
      }

      settled = true;
      globalThis.clearTimeout(timeoutId);

      if ("errorKey" in result) {
        reject(new Error(result.errorKey));
        return;
      }

      resolve(result.credential);
    };
    const timeoutMs = request.timeoutMs ?? defaultCredentialTimeoutMs;
    const timeoutId = globalThis.setTimeout(() => {
      finish({ errorKey: googleIdentityErrorKeys.credentialTimeout });
    }, timeoutMs);

    try {
      api.initialize({
        callback: (response) => {
          const credential = response.credential?.trim();
          if (!credential) {
            finish({ errorKey: googleIdentityErrorKeys.credentialCancelled });
            return;
          }

          finish({ credential });
        },
        client_id: request.clientId,
        nonce: request.nonce,
      });
      api.renderButton(request.container, {
        shape: "rectangular",
        size: "large",
        text: "continue_with",
        theme: "outline",
        type: "standard",
      });
    } catch {
      finish({ errorKey: googleIdentityErrorKeys.apiUnavailable });
    }
  });
}

export async function requestGoogleCredential(
  request: GoogleCredentialRequest,
): Promise<string> {
  if (credentialRequestActive) {
    throw new Error(googleIdentityErrorKeys.requestInProgress);
  }

  credentialRequestActive = true;

  try {
    const timeoutMs = request.timeoutMs ?? defaultCredentialTimeoutMs;
    const deadline = Date.now() + timeoutMs;
    await loadGoogleIdentityScript(timeoutMs);
    const api = getGoogleIdentityApi();
    if (!api) {
      throw new Error(googleIdentityErrorKeys.apiUnavailable);
    }

    return await receiveGoogleCredential(api, {
      ...request,
      timeoutMs: Math.max(1, deadline - Date.now()),
    });
  } finally {
    credentialRequestActive = false;
  }
}
