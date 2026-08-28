import { createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
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
      bytes.subarray(0, 4).equals(Buffer.from("RIFF")) &&
      bytes.subarray(8, 12).equals(Buffer.from("WEBP"))
  }
} as const;

export type ContentMediaMimeType = keyof typeof imageMetadata;

export interface StoredContentMedia {
  fileKey: string;
  checksumSha256: string;
  mimeType: ContentMediaMimeType;
  created: boolean;
}

export interface ContentMediaStoragePort {
  save(input: { bytes: Buffer; mimeType: ContentMediaMimeType }): Promise<StoredContentMedia>;
  read(fileKey: string): Promise<Buffer>;
  delete(fileKey: string): Promise<void>;
}

export class ContentMediaFileStorage implements ContentMediaStoragePort {
  public constructor(
    private readonly directory: string,
    private readonly maxBytes: number = DEFAULT_MAX_BYTES
  ) {}

  public async save(input: {
    bytes: Buffer;
    mimeType: ContentMediaMimeType;
  }): Promise<StoredContentMedia> {
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
    const fileKey = `${checksumSha256}.${metadata.extension}`;
    const absolutePath = this.pathFor(fileKey);
    await mkdir(this.directory, { recursive: true });

    let created = true;
    try {
      await writeFile(absolutePath, input.bytes, { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException | undefined)?.code !== "EEXIST") {
        throw error;
      }
      created = false;
    }

    return { fileKey, checksumSha256, mimeType: input.mimeType, created };
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
