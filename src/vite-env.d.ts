/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_AUTH_GOOGLE_ENABLED?: string;
  readonly VITE_MERCHANT_API_BASE_URL?: string;
  readonly VITE_OPS_API_BASE_URL?: string;
}


type GoogleIdentityCredentialResponse = {
  credential?: string;
};

type GoogleIdentityIdConfiguration = {
  client_id: string;
  nonce: string;
  callback: (response: GoogleIdentityCredentialResponse) => void;
};

type GoogleIdentityButtonConfiguration = {
  type: "standard";
  theme: "outline";
  size: "large";
  text: "continue_with";
  shape: "rectangular";
};

type GoogleIdentityIdApi = {
  initialize: (configuration: GoogleIdentityIdConfiguration) => void;
  renderButton: (
    container: HTMLElement,
    configuration: GoogleIdentityButtonConfiguration,
  ) => void;
};

type GoogleIdentityServicesGlobal = {
  accounts?: {
    id?: GoogleIdentityIdApi;
  };
};

declare var google: GoogleIdentityServicesGlobal | undefined;
