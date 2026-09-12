import { createHash, randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import { ImageUploadValidator } from "./image-upload-validator.service";
import type { ServerImageUploadPurpose } from "./image-upload-profiles";

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
export const CONTENT_MEDIA_MAX_DECODED_PIXELS = 25_000_000;
export const CONTENT_MEDIA_VALIDATION_PROFILES = {
  signature: "signature",
  decodedSingleFrame: "decoded-single-frame"
} as const;
const MAX_CONTAINER_HEADER_ENTRIES = 4_096;
const MAX_JPEG_MARKER_PADDING_BYTES = 16;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_ANIMATION_CHUNKS = new Set(
  ["acTL", "fcTL", "fdAT"].map((chunkType) => Buffer.from(chunkType).readUInt32BE(0))
);
const PNG_END_CHUNK = Buffer.from("IEND").readUInt32BE(0);

const hasUnsupportedPngAnimation = (bytes: Buffer): boolean => {
  if (bytes.length < PNG_SIGNATURE.length || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return false;
  }

  let offset = 8;
  for (let chunkCount = 0; chunkCount < MAX_CONTAINER_HEADER_ENTRIES; chunkCount += 1) {
    if (offset + 12 > bytes.length) {
      return false;
    }
    const dataLength = bytes.readUInt32BE(offset);
    const chunkType = bytes.readUInt32BE(offset + 4);
    const nextOffset = offset + 12 + dataLength;
    if (nextOffset > bytes.length) {
      return false;
    }
    if (PNG_ANIMATION_CHUNKS.has(chunkType)) {
      return true;
    }
    if (chunkType === PNG_END_CHUNK) {
      return false;
    }
    offset = nextOffset;
  }

  return true;
};

const hasUnsupportedJpegMultiPicture = (bytes: Buffer): boolean => {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return false;
  }

  let offset = 2;
  for (let segmentCount = 0; segmentCount < MAX_CONTAINER_HEADER_ENTRIES; segmentCount += 1) {
    if (offset + 1 >= bytes.length || bytes[offset] !== 0xff) {
      return false;
    }
    offset += 1;
    let paddingBytes = 0;
    while (offset < bytes.length && bytes[offset] === 0xff) {
      paddingBytes += 1;
      if (paddingBytes > MAX_JPEG_MARKER_PADDING_BYTES) {
        return true;
      }
      offset += 1;
    }
    if (offset >= bytes.length) {
      return false;
    }

    const marker = bytes[offset]!;
    offset += 1;
    if (marker === 0xda || marker === 0xd9) {
      return false;
    }
    if (marker === 0x01 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (marker === 0x00 || offset + 2 > bytes.length) {
      return false;
    }

    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      return false;
    }
    if (marker === 0xe2 && segmentLength >= 6 && bytes.readUInt32BE(offset + 2) === 0x4d504600) {
      return true;
    }
    offset += segmentLength;
  }

  return true;
};

const imageMetadata = {
  "image/jpeg": {
    extension: "jpg",
    decodedFormat: "jpeg",
    matches: (bytes: Buffer) => bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
  },
  "image/png": {
    extension: "png",
    decodedFormat: "png",
    matches: (bytes: Buffer) => bytes.subarray(0, 8).equals(PNG_SIGNATURE)
  },
  "image/webp": {
    extension: "webp",
    decodedFormat: "webp",
    matches: (bytes: Buffer) =>
      bytes.subarray(0, 4).equals(Buffer.from("RIFF")) &&
      bytes.subarray(8, 12).equals(Buffer.from("WEBP"))
  }
} as const;

export type ContentMediaMimeType = keyof typeof imageMetadata;
export type ContentMediaValidationProfile =
  (typeof CONTENT_MEDIA_VALIDATION_PROFILES)[keyof typeof CONTENT_MEDIA_VALIDATION_PROFILES];

export interface ContentMediaStorageInput {
  bytes: Buffer;
  mimeType: ContentMediaMimeType;
  purpose?: Extract<ServerImageUploadPurpose, "carousel" | "shop-presentation" | "service-cover" | "social">;
  validationProfile?: ContentMediaValidationProfile;
}

export interface PreparedContentMedia {
  fileKey: string;
  checksumSha256: string;
  hasAlpha?: boolean;
  height?: number;
  mimeType: ContentMediaMimeType;
  pages?: number;
  width?: number;
}

export interface StoredContentMedia extends PreparedContentMedia {
  created: boolean;
}

export interface ContentMediaStoragePort {
  prepare(input: ContentMediaStorageInput): Promise<PreparedContentMedia>;
  save(input: ContentMediaStorageInput): Promise<StoredContentMedia>;
  read(fileKey: string): Promise<Buffer>;
  delete(fileKey: string): Promise<void>;
}

export interface ContentMediaFileStorageOptions {
  maxBytes?: number;
  identityStorageDirectory?: string;
}

const overlapMessage =
  "CONTENT_MEDIA_STORAGE_DIR must not overlap IDENTITY_APPLICATION_MEDIA_STORAGE_DIR";

const pathsOverlap = (first: string, second: string): boolean =>
  first === second || first.startsWith(`${second}${sep}`) || second.startsWith(`${first}${sep}`);

export const assertContentMediaStorageIsolationSync = (
  contentDirectory: string,
  identityDirectory: string
): void => {
  if (
    pathsOverlap(
      canonicalizeStorageDirectorySync(contentDirectory),
      canonicalizeStorageDirectorySync(identityDirectory)
    )
  ) {
    throw new Error(overlapMessage);
  }
};

const canonicalizeStorageDirectorySync = (directory: string): string => {
  const unresolvedSegments: string[] = [];
  let cursor = resolve(directory);
  while (true) {
    try {
      return resolve(realpathSync.native(cursor), ...unresolvedSegments);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      const parent = dirname(cursor);
      if ((code !== "ENOENT" && code !== "ENOTDIR") || parent === cursor) {
        throw error;
      }
      unresolvedSegments.unshift(basename(cursor));
      cursor = parent;
    }
  }
};

export class ContentMediaFileStorage implements ContentMediaStoragePort {
  private readonly maxBytes: number;
  private readonly validator = new ImageUploadValidator();

  public constructor(
    private readonly directory: string,
    options: number | ContentMediaFileStorageOptions = {}
  ) {
    const normalizedOptions = typeof options === "number" ? { maxBytes: options } : options;
    this.maxBytes = normalizedOptions.maxBytes ?? DEFAULT_MAX_BYTES;
    if (normalizedOptions.identityStorageDirectory) {
      assertContentMediaStorageIsolationSync(directory, normalizedOptions.identityStorageDirectory);
    }
  }

  public async prepare(input: ContentMediaStorageInput): Promise<PreparedContentMedia> {
    if (input.bytes.length === 0) {
      throw this.invalid();
    }
    if (input.bytes.length > this.maxBytes) {
      throw this.tooLarge();
    }
    const metadata = imageMetadata[input.mimeType];
    if (!metadata || !metadata.matches(input.bytes)) {
      throw this.invalid();
    }
    void input.validationProfile;
    if (
      (input.mimeType === "image/png" && hasUnsupportedPngAnimation(input.bytes)) ||
      (input.mimeType === "image/jpeg" && hasUnsupportedJpegMultiPicture(input.bytes))
    ) {
      throw this.invalid();
    }
    let validated;
    try {
      validated = await this.validator.validate({
        bytes: input.bytes,
        declaredMimeType: input.mimeType,
        purpose: input.purpose ?? "social"
      });
    } catch (error) {
      if (error instanceof AppError && error.message === "error.image_upload.too_large") {
        throw this.tooLarge();
      }
      throw this.invalid();
    }
    return {
      checksumSha256: validated.checksumSha256,
      fileKey: `${validated.checksumSha256}.${metadata.extension}`,
      hasAlpha: validated.hasAlpha,
      height: validated.height,
      mimeType: validated.mimeType,
      pages: validated.pages,
      width: validated.width
    };
  }

  public async save(input: ContentMediaStorageInput): Promise<StoredContentMedia> {
    const prepared = await this.prepare(input);
    const canonicalPath = this.pathFor(prepared.fileKey);
    await mkdir(this.directory, { recursive: true });

    let canonicalExisted = false;
    try {
      const existingBytes = await readFile(canonicalPath);
      canonicalExisted = true;
      if (createHash("sha256").update(existingBytes).digest("hex") === prepared.checksumSha256) {
        return { ...prepared, created: false };
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException | undefined)?.code !== "ENOENT") {
        throw error;
      }
    }

    const tempPath = join(this.directory, `.${prepared.checksumSha256}.${randomUUID()}.tmp`);
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(tempPath, "wx", 0o600);
      await handle.writeFile(input.bytes);
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(tempPath, canonicalPath);
      await this.syncDirectory();
      return { ...prepared, created: !canonicalExisted };
    } catch (primaryError) {
      if (handle) {
        await handle.close().catch(() => undefined);
      }
      await unlink(tempPath).catch(() => undefined);
      throw primaryError;
    }
  }

  public async read(fileKey: string): Promise<Buffer> {
    return readFile(this.pathFor(fileKey));
  }

  public async delete(fileKey: string): Promise<void> {
    try {
      await unlink(this.pathFor(fileKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException | undefined)?.code !== "ENOENT") {
        throw error;
      }
    }
  }

  private async syncDirectory(): Promise<void> {
    const handle = await open(this.directory, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  private pathFor(fileKey: string): string {
    if (!/^[a-f0-9]{64}\.(?:jpg|png|webp)$/u.test(fileKey) || basename(fileKey) !== fileKey) {
      throw this.invalid();
    }
    const directory = resolve(this.directory);
    const path = resolve(join(directory, fileKey));
    if (!path.startsWith(`${directory}${sep}`)) {
      throw this.invalid();
    }
    return path;
  }

  private invalid(): AppError {
    return new AppError({
      code: ERROR_CODES.VALIDATION,
      message: "error.content.media_invalid",
      statusCode: 400
    });
  }

  private tooLarge(): AppError {
    return new AppError({
      code: ERROR_CODES.VALIDATION,
      message: "error.content.media_too_large",
      statusCode: 413
    });
  }
}
