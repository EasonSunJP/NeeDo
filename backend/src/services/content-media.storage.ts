import { createHash, randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

const JPEG_START_OF_FRAME_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf
]);

const matchesJpeg = (bytes: Buffer): boolean => {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return false;
  }

  let offset = 2;
  let inScan = false;
  let sawFrame = false;
  let sawScan = false;

  while (offset < bytes.length) {
    if (inScan && bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    if (bytes[offset] !== 0xff) {
      return false;
    }

    const markerStart = offset;
    while (offset < bytes.length && bytes[offset] === 0xff) {
      offset += 1;
    }
    if (offset >= bytes.length) {
      return false;
    }

    const marker = bytes[offset]!;
    offset += 1;
    if (inScan) {
      if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) {
        continue;
      }
      inScan = false;
      offset = markerStart;
      continue;
    }

    if (marker === 0xd9) {
      return sawFrame && sawScan && offset === bytes.length;
    }
    if (
      marker === 0x00 ||
      marker === 0xd8 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      return false;
    }
    if (offset + 2 > bytes.length) {
      return false;
    }

    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      return false;
    }
    if (JPEG_START_OF_FRAME_MARKERS.has(marker)) {
      if (
        segmentLength < 8 ||
        bytes.readUInt16BE(offset + 3) === 0 ||
        bytes.readUInt16BE(offset + 5) === 0
      ) {
        return false;
      }
      sawFrame = true;
    }
    if (marker === 0xda) {
      if (!sawFrame || segmentLength < 6) {
        return false;
      }
      sawScan = true;
      inScan = true;
    }
    offset += segmentLength;
  }

  return false;
};

const crc32 = (bytes: Buffer, start: number, end: number): number => {
  let crc = 0xffffffff;
  for (let index = start; index < end; index += 1) {
    crc ^= bytes[index]!;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const validPngHeader = (bytes: Buffer, dataOffset: number): boolean => {
  const width = bytes.readUInt32BE(dataOffset);
  const height = bytes.readUInt32BE(dataOffset + 4);
  const bitDepth = bytes[dataOffset + 8]!;
  const colorType = bytes[dataOffset + 9]!;
  const validDepths: Record<number, readonly number[]> = {
    0: [1, 2, 4, 8, 16],
    2: [8, 16],
    3: [1, 2, 4, 8],
    4: [8, 16],
    6: [8, 16]
  };

  return (
    width > 0 &&
    height > 0 &&
    validDepths[colorType]?.includes(bitDepth) === true &&
    bytes[dataOffset + 10] === 0 &&
    bytes[dataOffset + 11] === 0 &&
    (bytes[dataOffset + 12] === 0 || bytes[dataOffset + 12] === 1)
  );
};

const matchesPng = (bytes: Buffer): boolean => {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 8 || !bytes.subarray(0, 8).equals(signature)) {
    return false;
  }

  let offset = 8;
  let chunkIndex = 0;
  let sawImageData = false;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) {
      return false;
    }
    const dataLength = bytes.readUInt32BE(offset);
    const typeOffset = offset + 4;
    const dataOffset = typeOffset + 4;
    const crcOffset = dataOffset + dataLength;
    const nextOffset = crcOffset + 4;
    if (nextOffset > bytes.length) {
      return false;
    }

    const type = bytes.subarray(typeOffset, dataOffset).toString("ascii");
    if (!/^[A-Za-z]{4}$/u.test(type) || (bytes[typeOffset + 2]! & 0x20) !== 0) {
      return false;
    }
    if (bytes.readUInt32BE(crcOffset) !== crc32(bytes, typeOffset, crcOffset)) {
      return false;
    }
    if (chunkIndex === 0 && (type !== "IHDR" || dataLength !== 13)) {
      return false;
    }
    if (type === "IHDR" && (chunkIndex !== 0 || !validPngHeader(bytes, dataOffset))) {
      return false;
    }
    if (type === "IDAT") {
      sawImageData = true;
    }
    if (type === "IEND") {
      return dataLength === 0 && sawImageData && nextOffset === bytes.length;
    }

    chunkIndex += 1;
    offset = nextOffset;
  }

  return false;
};

const matchesWebp = (bytes: Buffer): boolean => {
  if (
    bytes.length < 20 ||
    bytes.subarray(0, 4).toString("ascii") !== "RIFF" ||
    bytes.subarray(8, 12).toString("ascii") !== "WEBP" ||
    bytes.readUInt32LE(4) !== bytes.length - 8
  ) {
    return false;
  }

  let offset = 12;
  let sawImageData = false;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) {
      return false;
    }
    const type = bytes.subarray(offset, offset + 4).toString("ascii");
    const dataLength = bytes.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    const dataEnd = dataOffset + dataLength;
    const nextOffset = dataEnd + (dataLength & 1);
    if (dataEnd > bytes.length || nextOffset > bytes.length) {
      return false;
    }

    if (type === "VP8 ") {
      if (
        dataLength < 10 ||
        !bytes.subarray(dataOffset + 3, dataOffset + 6).equals(Buffer.from([0x9d, 0x01, 0x2a])) ||
        (bytes.readUInt16LE(dataOffset + 6) & 0x3fff) === 0 ||
        (bytes.readUInt16LE(dataOffset + 8) & 0x3fff) === 0
      ) {
        return false;
      }
      sawImageData = true;
    } else if (type === "VP8L") {
      if (dataLength < 5 || bytes[dataOffset] !== 0x2f || (bytes[dataOffset + 4]! & 0xe0) !== 0) {
        return false;
      }
      sawImageData = true;
    } else if (type === "VP8X") {
      if (dataLength !== 10) {
        return false;
      }
    } else if (type === "ANMF") {
      if (dataLength < 16) {
        return false;
      }
      sawImageData = true;
    }

    offset = nextOffset;
  }

  return offset === bytes.length && sawImageData;
};

const imageMetadata = {
  "image/jpeg": {
    extension: "jpg",
    matches: matchesJpeg
  },
  "image/png": {
    extension: "png",
    matches: matchesPng
  },
  "image/webp": {
    extension: "webp",
    matches: matchesWebp
  }
} as const;

export type ContentMediaMimeType = keyof typeof imageMetadata;

export interface PreparedContentMedia {
  fileKey: string;
  checksumSha256: string;
  mimeType: ContentMediaMimeType;
}

export interface StoredContentMedia extends PreparedContentMedia {
  created: boolean;
}

export interface ContentMediaStoragePort {
  prepare(input: { bytes: Buffer; mimeType: ContentMediaMimeType }): PreparedContentMedia;
  save(input: { bytes: Buffer; mimeType: ContentMediaMimeType }): Promise<StoredContentMedia>;
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

  public prepare(input: { bytes: Buffer; mimeType: ContentMediaMimeType }): PreparedContentMedia {
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
    const checksumSha256 = createHash("sha256").update(input.bytes).digest("hex");
    return {
      checksumSha256,
      fileKey: `${checksumSha256}.${metadata.extension}`,
      mimeType: input.mimeType
    };
  }

  public async save(input: {
    bytes: Buffer;
    mimeType: ContentMediaMimeType;
  }): Promise<StoredContentMedia> {
    const prepared = this.prepare(input);
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
