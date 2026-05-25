import { parseBrowserStorageJson, removeBrowserStorage, writeBrowserStorage } from "../lib/browserStorage";

export type RememberedCredentials = {
  account: string;
  enabled: boolean;
  password: string;
};

const storagePrefix = "needo.auth.remember-credentials.";

function storageKey(scope: string) {
  return `${storagePrefix}${scope}`;
}

function normalizeRememberedCredentials(value: RememberedCredentials): RememberedCredentials {
  return {
    account: typeof value.account === "string" ? value.account : "",
    enabled: value.enabled === true,
    password: typeof value.password === "string" ? value.password : ""
  };
}

export function readRememberedCredentials(scope: string): RememberedCredentials {
  return normalizeRememberedCredentials(
    parseBrowserStorageJson<RememberedCredentials>(
      storageKey(scope),
      {
        account: "",
        enabled: false,
        password: ""
      },
      { removeOnError: true, silent: true }
    )
  );
}

export function writeRememberedCredentials(scope: string, account: string, password: string) {
  writeBrowserStorage(
    storageKey(scope),
    JSON.stringify({
      account,
      enabled: true,
      password
    } satisfies RememberedCredentials),
    { silent: true }
  );
}

export function clearRememberedCredentials(scope: string) {
  removeBrowserStorage(storageKey(scope), { silent: true });
}
