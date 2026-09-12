import { createBrowserImageCodec } from "./browser-codec";
import {
  IMAGE_UPLOAD_PROFILES,
  IMAGE_UPLOAD_QUALITIES,
  MAX_IMAGE_UPLOAD_SOURCE_BYTES
} from "./profiles";
import type {
  ImageUploadCodec,
  ImageUploadPurpose,
  OptimizedImageUpload,
  OptimizeImageUploadOptions
} from "./types";

function abortIfRequested(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  throw new DOMException("Image processing was aborted", "AbortError");
}

function validateSource(source: File) {
  if (!source.size || source.size > MAX_IMAGE_UPLOAD_SOURCE_BYTES || source.type === "image/svg+xml") {
    throw new Error("error.image_upload.invalid");
  }
}

async function yieldToBrowser() {
  if (typeof requestAnimationFrame === "undefined") {
    await Promise.resolve();
    return;
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function optimizedFileName(name: string, mimeType: string) {
  const extension = mimeType === "image/webp" ? "webp" : "jpg";
  const base = name.replace(/\.[^.]+$/u, "").replace(/[^\p{L}\p{N}._-]+/gu, "-") || "image";
  return `${base}.${extension}`;
}

export async function optimizeImageUploadWithCodec(
  source: File,
  purpose: ImageUploadPurpose,
  codec: ImageUploadCodec,
  options: OptimizeImageUploadOptions = {}
): Promise<OptimizedImageUpload> {
  abortIfRequested(options.signal);
  validateSource(source);
  const profile = IMAGE_UPLOAD_PROFILES[purpose];
  options.onStage?.("decoding");
  const decoded = await codec.decode(source, profile, options.signal);
  try {
    abortIfRequested(options.signal);
    const mimeType = decoded.hasAlpha ? "image/webp" : "image/jpeg";
    const preserveAlpha = decoded.hasAlpha;
    let accepted:
      | { bytes: Uint8Array<ArrayBuffer>; height: number; mimeType: string; ssim: number; width: number }
      | undefined;
    for (const quality of IMAGE_UPLOAD_QUALITIES) {
      await yieldToBrowser();
      abortIfRequested(options.signal);
      options.onStage?.("compressing");
      const candidate = await codec.encode(
        decoded,
        { mimeType, preserveAlpha, quality },
        options.signal
      );
      await yieldToBrowser();
      abortIfRequested(options.signal);
      options.onStage?.("verifying");
      const ssim = await codec.compare(decoded, candidate, options.signal);
      if (ssim < profile.minSsim || candidate.bytes.byteLength > profile.maxBytes) continue;
      if (!accepted || candidate.bytes.byteLength < accepted.bytes.byteLength) {
        accepted = { ...candidate, ssim };
      }
    }
    if (!accepted) throw new Error("error.image_upload.quality_failed");
    const file = new File([accepted.bytes], optimizedFileName(source.name, accepted.mimeType), {
      lastModified: source.lastModified,
      type: accepted.mimeType
    });
    return {
      file,
      height: accepted.height,
      mimeType: accepted.mimeType,
      resultBytes: file.size,
      sourceBytes: source.size,
      ssim: accepted.ssim,
      status: file.size < source.size ? "optimized" : "reencoded",
      width: accepted.width
    };
  } finally {
    codec.dispose?.(decoded);
  }
}

type WorkerResult = Omit<OptimizedImageUpload, "file"> & {
  bytes: ArrayBuffer;
  fileName: string;
  kind: "result";
};

async function optimizeWithWorker(
  source: File,
  purpose: ImageUploadPurpose,
  options: OptimizeImageUploadOptions
) {
  abortIfRequested(options.signal);
  const worker = new Worker(new URL("./image-upload.worker.ts", import.meta.url), { type: "module" });
  const sourceBytes = await source.arrayBuffer();
  return new Promise<OptimizedImageUpload>((resolve, reject) => {
    const cleanup = () => {
      options.signal?.removeEventListener("abort", onAbort);
      worker.terminate();
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Image processing was aborted", "AbortError"));
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });
    worker.onerror = () => {
      cleanup();
      reject(new Error("error.image_upload.unsupported"));
    };
    worker.onmessage = (event: MessageEvent<WorkerResult | { kind: "error"; message: string } | { kind: "stage"; stage: Parameters<NonNullable<OptimizeImageUploadOptions["onStage"]>>[0] }>) => {
      if (event.data.kind === "stage") {
        options.onStage?.(event.data.stage);
        return;
      }
      cleanup();
      if (event.data.kind === "error") {
        reject(new Error(event.data.message));
        return;
      }
      const { bytes, fileName, kind: _kind, ...result } = event.data;
      resolve({
        ...result,
        file: new File([bytes], fileName, { lastModified: source.lastModified, type: result.mimeType })
      });
    };
    worker.postMessage({
      bytes: sourceBytes,
      lastModified: source.lastModified,
      name: source.name,
      purpose,
      type: source.type
    }, [sourceBytes]);
  });
}

export async function optimizeImageUpload(
  source: File,
  purpose: ImageUploadPurpose,
  options: OptimizeImageUploadOptions = {}
) {
  abortIfRequested(options.signal);
  validateSource(source);
  if (
    typeof Worker !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    typeof createImageBitmap !== "undefined"
  ) {
    try {
      return await optimizeWithWorker(source, purpose, options);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      if (error instanceof Error && error.message !== "error.image_upload.unsupported") throw error;
    }
  }
  return optimizeImageUploadWithCodec(source, purpose, createBrowserImageCodec(), options);
}
