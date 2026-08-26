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
  }
} as const;

export type IdentityApplicationMediaMimeType = keyof typeof imageMetadata;

export interface SaveIdentityApplicationMediaInput {
  applicationId: number;
  bytes: Buffer;
  mimeType: IdentityApplicationMediaMimeType;
}

export interface StoredIdentityApplicationMedia {
  absolutePath: string;
  fileKey: string;
  mimeType: IdentityApplicationMediaMimeType;
  checksumSha256: string;
}

export interface IdentityApplicationMediaStoragePort {
  save: (input: SaveIdentityApplicationMediaInput) => Promise<StoredIdentityApplicationMedia>;
  read: (fileKey: string) => Promise<Buffer>;
  delete: (fileKey: string) => Promise<void>;
}

export class IdentityApplicationMediaFileStorage
  implements IdentityApplicationMediaStoragePort
{
  public constructor(
    private readonly directory: string,
    private readonly maxBytes: number = DEFAULT_MAX_BYTES
  ) {}

  public async save(
    input: SaveIdentityApplicationMediaInput
  ): Promise<StoredIdentityApplicationMedia> {
    const metadata = imageMetadata[input.mimeType];
    if (
      !Number.isInteger(input.applicationId) ||
      input.applicationId <= 0 ||
      input.bytes.length === 0 ||
      input.bytes.length > this.maxBytes ||
      !metadata.matches(input.bytes)
    ) {
      throw this.invalid();
    }
    const checksumSha256 = createHash("sha256").update(input.bytes).digest("hex");
    const storageHash = createHash("sha256")
      .update(String(input.applicationId))
      .update("\0")
      .update(input.bytes)
      .digest("hex");
    const fileKey = `${storageHash}.${metadata.extension}`;
    const absolutePath = this.pathFor(fileKey);
    await mkdir(this.directory, { recursive: true });
    try {
      await writeFile(absolutePath, input.bytes, { flag: "wx" });
    } catch (error) {
      if (!(error instanceof Error) || (error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }
    return { absolutePath, fileKey, mimeType: input.mimeType, checksumSha256 };
  }

  public read(fileKey: string): Promise<Buffer> {
    return readFile(this.pathFor(fileKey));
  }

  public async delete(fileKey: string): Promise<void> {
    try {
      await unlink(this.pathFor(fileKey));
    } catch (error) {
      if (!(error instanceof Error) || (error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  private pathFor(fileKey: string): string {
    if (!/^[a-f0-9]{64}\.(?:jpg|png)$/u.test(fileKey) || basename(fileKey) !== fileKey) {
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
      message: "error.identity_application.media_invalid",
      statusCode: 400
    });
  }
}
