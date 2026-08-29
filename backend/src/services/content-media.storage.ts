import { createHash, randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
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
