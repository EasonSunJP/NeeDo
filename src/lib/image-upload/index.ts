export { optimizeImageUpload, optimizeImageUploadWithCodec } from "./optimizer";
export { IMAGE_UPLOAD_PROFILES } from "./profiles";
export type {
  ImageUploadPurpose,
  ImageUploadStage,
  OptimizedImageUpload,
  OptimizeImageUploadOptions
} from "./types";

const optimizableImageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

export function isOptimizableImageFile(file: Pick<File, "type">) {
  return optimizableImageMimeTypes.has(file.type.toLowerCase());
}
