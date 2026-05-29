type ImageDataUrlOptions = {
  maxDimension?: number;
  maxStoredBytes?: number;
  mimeType?: string;
  quality?: number;
};

const imageUploadFileNamePattern = /\.(avif|gif|heic|heif|jpe?g|png|webp)$/i;

const defaultImageDataUrlOptions: Required<ImageDataUrlOptions> = {
  maxDimension: 1280,
  maxStoredBytes: 420_000,
  mimeType: "image/jpeg",
  quality: 0.78
};

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

function estimateDataUrlBytes(dataUrl: string) {
  const base64 = dataUrl.split(",", 2)[1] ?? "";
  return Math.ceil((base64.length * 3) / 4);
}

function canvasToDataUrl(canvas: HTMLCanvasElement, mimeType: string, quality: number) {
  return canvas.toDataURL(mimeType, quality);
}

async function compressImageFileAsDataUrl(file: File, options?: ImageDataUrlOptions) {
  const normalizedOptions = { ...defaultImageDataUrlOptions, ...options };

  if (
    typeof document === "undefined" ||
    typeof createImageBitmap === "undefined" ||
    file.type === "image/svg+xml"
  ) {
    return readFileAsDataUrl(file);
  }

  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    bitmap.close?.();
    return readFileAsDataUrl(file);
  }

  const longestSide = Math.max(bitmap.width, bitmap.height);
  const scale = Math.min(1, normalizedOptions.maxDimension / Math.max(1, longestSide));
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  const attempts = [
    { quality: normalizedOptions.quality, scale: 1 },
    { quality: 0.68, scale: 0.9 },
    { quality: 0.58, scale: 0.78 },
    { quality: 0.5, scale: 0.66 }
  ];
  let bestDataUrl = canvasToDataUrl(canvas, normalizedOptions.mimeType, normalizedOptions.quality);

  for (const attempt of attempts) {
    const targetWidth = Math.max(1, Math.round(canvas.width * attempt.scale));
    const targetHeight = Math.max(1, Math.round(canvas.height * attempt.scale));
    let targetCanvas = canvas;

    if (attempt.scale < 1) {
      targetCanvas = document.createElement("canvas");
      targetCanvas.width = targetWidth;
      targetCanvas.height = targetHeight;
      targetCanvas.getContext("2d")?.drawImage(canvas, 0, 0, targetWidth, targetHeight);
    }

    const dataUrl = canvasToDataUrl(targetCanvas, normalizedOptions.mimeType, attempt.quality);
    bestDataUrl = dataUrl;

    if (estimateDataUrlBytes(dataUrl) <= normalizedOptions.maxStoredBytes) {
      break;
    }
  }

  return bestDataUrl;
}

export async function readImageFileAsDataUrl(file: File, options?: ImageDataUrlOptions) {
  try {
    return await compressImageFileAsDataUrl(file, options);
  } catch {
    return readFileAsDataUrl(file);
  }
}

export async function readImageFilesAsDataUrls(fileList: FileList | null, limit = Number.POSITIVE_INFINITY, options?: ImageDataUrlOptions) {
  const files = Array.from(fileList ?? [])
    .filter(isReadableImageUploadFile)
    .slice(0, limit);

  return Promise.all(files.map((file) => readImageFileAsDataUrl(file, options)));
}
