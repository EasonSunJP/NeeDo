export type PlatformMedia = {
  publicId: string;
  url: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  altText: string | null;
};

export type PublicPlatformSettings = {
  version: number;
  siteEnabled: boolean;
  selfRegistrationEnabled: boolean;
  loginMethods: {
    password: true;
    google: boolean;
  };
  loginLogo: PlatformMedia | null;
  requestButton: PlatformMedia | null;
  paymentMethods: Array<"cash" | "ndp">;
  membershipCardFollowUiTheme: boolean;
};

export const safePublicPlatformSettings: PublicPlatformSettings = {
  version: 0,
  siteEnabled: true,
  selfRegistrationEnabled: false,
  loginMethods: { password: true, google: false },
  loginLogo: null,
  requestButton: null,
  paymentMethods: [],
  membershipCardFollowUiTheme: true
};
