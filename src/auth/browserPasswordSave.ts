import { readBrowserStorage, writeBrowserStorage } from "../lib/browserStorage";

export type BrowserPasswordSaveScope =
  | "backend:admin"
  | "backend:merchant-admin"
  | "backend:afirieito-admin"
  | "frontend:admin"
  | "frontend:business"
  | "frontend:merchant"
  | "frontend:technician"
  | "frontend:user";

const preferencePrefix = "needo.auth.browser-password-save.";

type PasswordCredentialConstructor = new (data: {
  id: string;
  name?: string;
  password: string;
}) => Credential;

export function readBrowserPasswordSavePreference(scope: BrowserPasswordSaveScope) {
  return readBrowserStorage(`${preferencePrefix}${scope}`, { silent: true }) === "true";
}

export function writeBrowserPasswordSavePreference(
  scope: BrowserPasswordSaveScope,
  enabled: boolean
) {
  return writeBrowserStorage(`${preferencePrefix}${scope}`, String(enabled), {
    silent: true
  });
}

export async function requestBrowserPasswordSave(input: {
  id: string;
  name?: string;
  password: string;
}) {
  const PasswordCredentialType = (
    globalThis as typeof globalThis & {
      PasswordCredential?: PasswordCredentialConstructor;
    }
  ).PasswordCredential;

  if (
    !input.id ||
    !input.password ||
    !PasswordCredentialType ||
    typeof navigator === "undefined" ||
    !navigator.credentials?.store
  ) {
    return;
  }

  try {
    await navigator.credentials.store(new PasswordCredentialType(input));
  } catch {
    // Browser policy, cancellation, or unsupported storage must not block login.
  }
}
