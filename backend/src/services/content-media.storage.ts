import { createHash, randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { mkdir, readFile, rename, stat, unlink, utimes, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const DEFAULT_LOCK_TIMEOUT_MS = 30_000;
const DEFAULT_LOCK_RETRY_MS = 25;
const DEFAULT_STALE_LOCK_MS = 120_000;

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
  withChecksumLock<T>(
    input: { bytes: Buffer; mimeType: ContentMediaMimeType },
    operation: (stored: StoredContentMedia) => Promise<T>
  ): Promise<T>;
  read(fileKey: string): Promise<Buffer>;
  delete(fileKey: string): Promise<void>;
}

export interface ContentMediaFileStorageOptions {
  maxBytes?: number;
  lockTimeoutMs?: number;
  lockRetryMs?: number;
  staleLockMs?: number;
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
  private readonly lockTimeoutMs: number;
  private readonly lockRetryMs: number;
  private readonly staleLockMs: number;

  public constructor(
    private readonly directory: string,
    options: number | ContentMediaFileStorageOptions = {}
  ) {
    const normalizedOptions = typeof options === "number" ? { maxBytes: options } : options;
    this.maxBytes = normalizedOptions.maxBytes ?? DEFAULT_MAX_BYTES;
    this.lockTimeoutMs = normalizedOptions.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
    this.lockRetryMs = normalizedOptions.lockRetryMs ?? DEFAULT_LOCK_RETRY_MS;
    this.staleLockMs = normalizedOptions.staleLockMs ?? DEFAULT_STALE_LOCK_MS;
    if (normalizedOptions.identityStorageDirectory) {
      assertContentMediaStorageIsolationSync(directory, normalizedOptions.identityStorageDirectory);
    }
  }

  public async save(input: {
    bytes: Buffer;
    mimeType: ContentMediaMimeType;
  }): Promise<StoredContentMedia> {
    return this.savePrepared(this.prepare(input));
  }

  public async withChecksumLock<T>(
    input: { bytes: Buffer; mimeType: ContentMediaMimeType },
    operation: (stored: StoredContentMedia) => Promise<T>
  ): Promise<T> {
    const prepared = this.prepare(input);
    const release = await this.acquireChecksumLock(prepared.checksumSha256);
    try {
      return await operation(await this.savePrepared(prepared));
    } finally {
      await release();
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

  private prepare(input: { bytes: Buffer; mimeType: ContentMediaMimeType }): {
    bytes: Buffer;
    fileKey: string;
    checksumSha256: string;
    mimeType: ContentMediaMimeType;
  } {
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
      ...input,
      checksumSha256,
      fileKey: `${checksumSha256}.${metadata.extension}`
    };
  }

  private async savePrepared(input: {
    bytes: Buffer;
    fileKey: string;
    checksumSha256: string;
    mimeType: ContentMediaMimeType;
  }): Promise<StoredContentMedia> {
    const absolutePath = this.pathFor(input.fileKey);
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
    return {
      fileKey: input.fileKey,
      checksumSha256: input.checksumSha256,
      mimeType: input.mimeType,
      created
    };
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

  private async acquireChecksumLock(checksumSha256: string): Promise<() => Promise<void>> {
    const lockDirectory = join(this.directory, ".locks");
    const lockPath = join(lockDirectory, `${checksumSha256}.lock`);
    const token = randomUUID();
    const deadline = Date.now() + this.lockTimeoutMs;
    await mkdir(lockDirectory, { recursive: true });

    while (true) {
      try {
        await writeFile(lockPath, token, { encoding: "utf8", flag: "wx", mode: 0o600 });
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException | undefined)?.code !== "EEXIST") {
          throw error;
        }
        await this.reclaimStaleLock(lockPath);
        if (Date.now() >= deadline) {
          throw new AppError({
            code: ERROR_CODES.SAAS_BILLING_CONFLICT,
            message: "error.content.lock_conflict",
            statusCode: 409
          });
        }
        await new Promise<void>((resolveWait) => setTimeout(resolveWait, this.lockRetryMs));
      }
    }

    const heartbeatMs = Math.max(100, Math.floor(this.staleLockMs / 3));
    const heartbeat = setInterval(() => {
      const heartbeatAt = new Date();
      void utimes(lockPath, heartbeatAt, heartbeatAt).catch(() => undefined);
    }, heartbeatMs);
    heartbeat.unref();

    return async () => {
      clearInterval(heartbeat);
      try {
        if ((await readFile(lockPath, "utf8")) === token) {
          await unlink(lockPath);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException | undefined)?.code !== "ENOENT") {
          throw error;
        }
      }
    };
  }

  private async reclaimStaleLock(lockPath: string): Promise<void> {
    try {
      if (Date.now() - (await stat(lockPath)).mtimeMs <= this.staleLockMs) {
        return;
      }
      const stalePath = `${lockPath}.${randomUUID()}.stale`;
      await rename(lockPath, stalePath);
      await unlink(stalePath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code !== "ENOENT" && code !== "EEXIST") {
        throw error;
      }
    }
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
