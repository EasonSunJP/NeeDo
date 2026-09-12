import { MAX_IMAGE_UPLOAD_SOURCE_PIXELS } from "./profiles";
import { computeRgbaSsim } from "./ssim";
import type {
  DecodedUploadImage,
  EncodedUploadCandidate,
  ImageUploadCodec,
  ImageUploadEncodeOptions,
  ImageUploadProfile
} from "./types";

type BrowserDecodedUploadImage = DecodedUploadImage & {
  handle: ImageBitmap;
  pixels: Uint8ClampedArray;
};

type CanvasSurface = HTMLCanvasElement | OffscreenCanvas;
type CanvasContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function abortIfRequested(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  throw new DOMException("Image processing was aborted", "AbortError");
}

function createCanvas(width: number, height: number): CanvasSurface {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  if (typeof document === "undefined") throw new Error("error.image_upload.unsupported");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function contextFor(canvas: CanvasSurface): CanvasContext {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("error.image_upload.unsupported");
  return context;
}

async function canvasToBlob(canvas: CanvasSurface, mimeType: string, quality: number) {
  if (typeof OffscreenCanvas !== "undefined" && canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ quality, type: mimeType });
  }
  const htmlCanvas = canvas as HTMLCanvasElement;
  const blob = await new Promise<Blob | null>((resolve) =>
    htmlCanvas.toBlob(resolve, mimeType, quality)
  );
  if (!blob) throw new Error("error.image_upload.unsupported");
  return blob;
}

function readPixels(context: CanvasContext, width: number, height: number) {
  return context.getImageData(0, 0, width, height).data;
}

function hasAlpha(pixels: Uint8ClampedArray) {
  for (let offset = 3; offset < pixels.length; offset += 4) {
    if (pixels[offset] !== 255) return true;
  }
  return false;
}

export function createBrowserImageCodec(): ImageUploadCodec {
  if (typeof createImageBitmap === "undefined") throw new Error("error.image_upload.unsupported");

  return {
    async decode(source: File, profile: ImageUploadProfile, signal?: AbortSignal) {
      abortIfRequested(signal);
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(source);
      } catch {
        throw new Error("error.image_upload.unsupported");
      }
      abortIfRequested(signal);
      if (
        bitmap.width <= 0 ||
        bitmap.height <= 0 ||
        bitmap.width * bitmap.height > MAX_IMAGE_UPLOAD_SOURCE_PIXELS
      ) {
        bitmap.close();
        throw new Error("error.image_upload.invalid");
      }
      const scale = Math.min(1, profile.maxDimension / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = createCanvas(width, height);
      const context = contextFor(canvas);
      context.drawImage(bitmap, 0, 0, width, height);
      const pixels = readPixels(context, width, height);
      return { handle: bitmap, hasAlpha: hasAlpha(pixels), height, pixels, width };
    },

    async encode(
      source: DecodedUploadImage,
      options: ImageUploadEncodeOptions,
      signal?: AbortSignal
    ) {
      abortIfRequested(signal);
      const decoded = source as BrowserDecodedUploadImage;
      const canvas = createCanvas(decoded.width, decoded.height);
      contextFor(canvas).drawImage(decoded.handle, 0, 0, decoded.width, decoded.height);
      const blob = await canvasToBlob(canvas, options.mimeType, options.quality);
      abortIfRequested(signal);
      if (!blob.size || blob.type !== options.mimeType) {
        throw new Error("error.image_upload.unsupported");
      }
      return {
        bytes: new Uint8Array(await blob.arrayBuffer()),
        height: decoded.height,
        mimeType: blob.type,
        width: decoded.width
      };
    },

    async compare(
      source: DecodedUploadImage,
      candidate: EncodedUploadCandidate,
      signal?: AbortSignal
    ) {
      abortIfRequested(signal);
      const decoded = source as BrowserDecodedUploadImage;
      let candidateBitmap: ImageBitmap;
      try {
        candidateBitmap = await createImageBitmap(
          new Blob([candidate.bytes], { type: candidate.mimeType })
        );
      } catch {
        throw new Error("error.image_upload.quality_failed");
      }
      try {
        if (candidateBitmap.width !== decoded.width || candidateBitmap.height !== decoded.height) {
          throw new Error("error.image_upload.quality_failed");
        }
        const canvas = createCanvas(decoded.width, decoded.height);
        const context = contextFor(canvas);
        context.drawImage(candidateBitmap, 0, 0, decoded.width, decoded.height);
        const candidatePixels = readPixels(context, decoded.width, decoded.height);
        abortIfRequested(signal);
        return computeRgbaSsim(decoded.pixels, candidatePixels, decoded.width, decoded.height);
      } finally {
        candidateBitmap.close();
      }
    },

    dispose(source: DecodedUploadImage) {
      (source.handle as ImageBitmap).close?.();
    }
  };
}
