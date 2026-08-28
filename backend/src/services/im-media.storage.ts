import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

const imageMetadata = {
  "image/jpeg": {
    extension: "jpg",
    matches: (bytes: Buffer) => bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
  },
  "image/png": {
    extension: "png",
    matches: (bytes: Buffer) =>
      bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  },
  "image/webp": {
    extension: "webp",
    matches: (bytes: Buffer) =>
      bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP"
  }
} as const;

export type ImMediaMimeType = keyof typeof imageMetadata;

export interface StoredImMedia {
  fileKey: string;
  mimeType: ImMediaMimeType;
  size: number;
}

export interface ImMediaStoragePort {
  save: (bytes: Buffer, mimeType: ImMediaMimeType) => Promise<StoredImMedia>;
}

export class ImMediaFileStorage implements ImMediaStoragePort {
  public constructor(
    private readonly directory: string,
    private readonly maxBytes: number = DEFAULT_MAX_BYTES
  ) {}

  public async save(bytes: Buffer, mimeType: ImMediaMimeType): Promise<StoredImMedia> {
    const metadata = imageMetadata[mimeType];
    if (bytes.length === 0 || bytes.length > this.maxBytes || !metadata.matches(bytes)) {
      throw this.invalid();
    }

    const fileKey = `${randomBytes(32).toString("hex")}.${metadata.extension}`;
    await mkdir(this.directory, { recursive: true });
    await writeFile(this.pathFor(fileKey), bytes, { flag: "wx" });
    return { fileKey, mimeType, size: bytes.length };
  }

  private pathFor(fileKey: string): string {
    if (!/^[a-f0-9]{64}\.(?:jpg|png|webp)$/u.test(fileKey) || basename(fileKey) !== fileKey) {
      throw this.invalid();
    }
    const directory = resolve(this.directory);
    const path = resolve(join(directory, fileKey));
    if (!path.startsWith(`${directory}/`)) {
      throw this.invalid();
    }
    return path;
  }

  private invalid(): AppError {
    return new AppError({
      code: ERROR_CODES.VALIDATION,
      message: "error.im.media_invalid",
      statusCode: 400
    });
  }
}
