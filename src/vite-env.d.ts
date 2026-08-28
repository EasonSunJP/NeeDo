/// <reference types="vite/client" />


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
