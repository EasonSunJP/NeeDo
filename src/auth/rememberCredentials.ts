import { clearBrowserStorageByPrefix } from "../lib/browserStorage";

const storagePrefix = "needo.auth.remember-credentials.";

export function purgeLegacyRememberedCredentials() {
  clearBrowserStorageByPrefix(storagePrefix, { silent: true });
}
