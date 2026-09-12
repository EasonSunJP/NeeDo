export type ImageUploadPurpose =
  | "avatar"
  | "im"
  | "social"
  | "carousel"
  | "shop-presentation"
  | "service-cover"
  | "official-notice"
  | "identity-preview";

export type ImageUploadStage = "decoding" | "compressing" | "verifying";

export type ImageUploadProfile = {
  maxBytes: number;
  maxDimension: number;
  minSsim: number;
};

export type OptimizeImageUploadOptions = {
  onStage?: (stage: ImageUploadStage) => void;
  signal?: AbortSignal;
};

export type OptimizedImageUpload = {
  file: File;
  height: number;
  mimeType: string;
  resultBytes: number;
  sourceBytes: number;
  ssim: number;
  status: "optimized" | "reencoded";
  width: number;
};

export type DecodedUploadImage = {
  handle: unknown;
  hasAlpha: boolean;
  height: number;
  width: number;
};

export type EncodedUploadCandidate = {
  bytes: Uint8Array<ArrayBuffer>;
  height: number;
  mimeType: string;
  width: number;
};

export type ImageUploadEncodeOptions = {
  mimeType: string;
  preserveAlpha: boolean;
  quality: number;
};

export interface ImageUploadCodec {
  compare(
    source: DecodedUploadImage,
    candidate: EncodedUploadCandidate,
    signal?: AbortSignal
  ): Promise<number>;
  decode(
    source: File,
    profile: ImageUploadProfile,
    signal?: AbortSignal
  ): Promise<DecodedUploadImage>;
  dispose?(source: DecodedUploadImage): void;
  encode(
    source: DecodedUploadImage,
    options: ImageUploadEncodeOptions,
    signal?: AbortSignal
  ): Promise<EncodedUploadCandidate>;
}
