export type ServerImageUploadPurpose =
  | "avatar"
  | "im"
  | "social"
  | "carousel"
  | "shop-presentation"
  | "service-cover"
  | "official-notice"
  | "identity-original"
  | "identity-preview";

export type ServerImageUploadProfile = {
  maxBytes: number;
  maxDimension: number;
  maxFrames: number;
  maxPixels: number;
};

export const SERVER_IMAGE_UPLOAD_PROFILES = {
  avatar: { maxBytes: 675_000, maxDimension: 1200, maxFrames: 1, maxPixels: 1_440_000 },
  im: { maxBytes: 2_000_000, maxDimension: 2048, maxFrames: 1, maxPixels: 4_194_304 },
  social: { maxBytes: 3_000_000, maxDimension: 2560, maxFrames: 1, maxPixels: 6_553_600 },
  carousel: { maxBytes: 3_000_000, maxDimension: 2560, maxFrames: 1, maxPixels: 6_553_600 },
  "shop-presentation": { maxBytes: 3_000_000, maxDimension: 2560, maxFrames: 1, maxPixels: 6_553_600 },
  "service-cover": { maxBytes: 3_000_000, maxDimension: 2560, maxFrames: 1, maxPixels: 6_553_600 },
  "official-notice": { maxBytes: 3_000_000, maxDimension: 2560, maxFrames: 1, maxPixels: 6_553_600 },
  "identity-original": { maxBytes: 8 * 1024 * 1024, maxDimension: 8192, maxFrames: 1, maxPixels: 25_000_000 },
  "identity-preview": { maxBytes: 2_000_000, maxDimension: 2560, maxFrames: 1, maxPixels: 6_553_600 }
} as const satisfies Record<ServerImageUploadPurpose, ServerImageUploadProfile>;
