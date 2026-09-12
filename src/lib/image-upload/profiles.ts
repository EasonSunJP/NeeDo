import type { ImageUploadProfile, ImageUploadPurpose } from "./types";

export const IMAGE_UPLOAD_PROFILES = {
  avatar: { maxDimension: 1200, maxBytes: 675_000, minSsim: 0.99 },
  im: { maxDimension: 2048, maxBytes: 2_000_000, minSsim: 0.99 },
  social: { maxDimension: 2560, maxBytes: 3_000_000, minSsim: 0.99 },
  carousel: { maxDimension: 2560, maxBytes: 3_000_000, minSsim: 0.995 },
  "shop-presentation": { maxDimension: 2560, maxBytes: 3_000_000, minSsim: 0.99 },
  "service-cover": { maxDimension: 2560, maxBytes: 3_000_000, minSsim: 0.99 },
  "official-notice": { maxDimension: 2560, maxBytes: 3_000_000, minSsim: 0.995 },
  "identity-preview": { maxDimension: 2560, maxBytes: 2_000_000, minSsim: 0.995 }
} as const satisfies Record<ImageUploadPurpose, ImageUploadProfile>;

export const IMAGE_UPLOAD_QUALITIES = [0.86, 0.88, 0.9, 0.92, 0.94, 0.96, 0.98] as const;

export const MAX_IMAGE_UPLOAD_SOURCE_BYTES = 32 * 1024 * 1024;
export const MAX_IMAGE_UPLOAD_SOURCE_PIXELS = 40_000_000;
