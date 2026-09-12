import { optimizeImageUpload } from "./image-upload";

type ImageDataUrlOptions = {
  maxDimension?: number;
  maxStoredBytes?: number;
  mimeType?: string;
  quality?: number;
};

const imageUploadFileNamePattern = /\.(avif|gif|heic|heif|jpe?g|png|webp)$/i;

export function isReadableImageUploadFile(file: Pick<File, "name" | "type">) {
  const normalizedType = file.type.toLowerCase();

  return normalizedType.startsWith("image/") || imageUploadFileNamePattern.test(file.name);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(reader.error ?? new Error("Unable to read image file."));
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }

      reject(new Error("Unable to read image file."));
    };

    reader.readAsDataURL(file);
  });
}

export async function readImageFileAsDataUrl(file: File, options?: ImageDataUrlOptions) {
  void options;
  const optimized = await optimizeImageUpload(file, "avatar");
  return readFileAsDataUrl(optimized.file);
}

export async function readImageFilesAsDataUrls(fileList: FileList | null, limit = Number.POSITIVE_INFINITY, options?: ImageDataUrlOptions) {
  const files = Array.from(fileList ?? [])
    .filter(isReadableImageUploadFile)
    .slice(0, limit);

  return Promise.all(files.map((file) => readImageFileAsDataUrl(file, options)));
}
