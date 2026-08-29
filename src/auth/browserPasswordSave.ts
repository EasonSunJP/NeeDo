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

type PasswordCredentialInput = {
  id: string;
  name?: string;
  password: string;
};

type PasswordCredentialsContainer = CredentialsContainer & {
  create(options: { password: PasswordCredentialInput }): Promise<Credential | null>;
};

export function readBrowserPasswordSavePreference(scope: BrowserPasswordSaveScope) {
  return readBrowserStorage(`${preferencePrefix}${scope}`, { silent: true }) !== "false";
}

export function writeBrowserPasswordSavePreference(
  scope: BrowserPasswordSaveScope,
  enabled: boolean
) {
  return writeBrowserStorage(`${preferencePrefix}${scope}`, String(enabled), {
    silent: true
  });
}

export async function requestBrowserPasswordSave(input: PasswordCredentialInput) {
  const PasswordCredentialType = (
    globalThis as typeof globalThis & {
      PasswordCredential?: PasswordCredentialConstructor;
    }
  ).PasswordCredential;

  if (
    !input.id ||
    !input.password ||
    typeof navigator === "undefined" ||
    !navigator.credentials?.store
  ) {
    return;
  }

  try {
    const credential = PasswordCredentialType
      ? new PasswordCredentialType(input)
      : await (
          navigator.credentials as PasswordCredentialsContainer
        ).create?.({ password: input });

    if (credential) {
      await navigator.credentials.store(credential);
    }
  } catch {
    // Browser policy, cancellation, or unsupported storage must not block login.
  }
}
