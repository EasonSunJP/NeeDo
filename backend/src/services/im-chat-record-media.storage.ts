import { createHash, randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  realpath,
  rmdir,
  stat,
  unlink,
  writeFile
} from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

const mediaMetadata = {
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
  },
  "audio/webm": {
    extension: "webm",
    matches: (bytes: Buffer) => bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
  },
  "audio/mp4": {
    extension: "mp4",
    matches: (bytes: Buffer) =>
      bytes.length >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp"
  },
  "audio/ogg": {
    extension: "ogg",
    matches: (bytes: Buffer) => bytes.subarray(0, 4).toString("ascii") === "OggS"
  },
  "video/mp4": {
    extension: "mp4",
    matches: (bytes: Buffer) =>
      bytes.length >= 12 && bytes.subarray(4, 8).toString("ascii") === "ftyp"
  },
  "video/webm": {
    extension: "webm",
    matches: (bytes: Buffer) => bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
  },
  "application/pdf": {
    extension: "pdf",
    matches: (bytes: Buffer) => bytes.subarray(0, 5).toString("ascii") === "%PDF-"
  }
} as const;

export type ChatRecordMediaMimeType = keyof typeof mediaMetadata;

export interface ChatRecordMediaClone {
  created: boolean;
  fileKey: string;
  mimeType: string;
  size: number;
  checksumSha256: string;
}

export interface ChatRecordMediaRead {
  bytes: Buffer;
  mimeType: string;
  size: number;
  checksumSha256: string;
}

export interface ImChatRecordMediaStoragePort {
  clone(sourceUrl: string, mimeType: string): Promise<ChatRecordMediaClone>;
  delete(fileKey: string): Promise<void>;
  read(checksumSha256: string, mimeType: string): Promise<ChatRecordMediaRead>;
}

export interface ImChatRecordMediaSourceRoot {
  directory: string;
  publicBaseUrl: string;
}

export interface ImChatRecordMediaFileStorageOptions {
  directory?: string;
  sourceRoots: ImChatRecordMediaSourceRoot[];
  maxBytes?: number;
}

type ParsedPublicBase = {
  directory: string;
  origin: string | null;
  pathname: string;
};

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/u, "");

export const resolveImChatRecordMediaDirectory = (imMediaDirectory: string): string =>
  resolve(join(dirname(resolve(imMediaDirectory)), "im-chat-record-media"));

export class ImChatRecordMediaFileStorage implements ImChatRecordMediaStoragePort {
  private readonly directory: string;
  private readonly sourceRoots: ParsedPublicBase[];
  private readonly maxBytes: number;

  public constructor(options: ImChatRecordMediaFileStorageOptions) {
    this.directory = options.directory ?? "runtime/im-chat-record-media";
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.sourceRoots = options.sourceRoots.map((root) => this.parsePublicBase(root));
  }

  public async clone(sourceUrl: string, mimeType: string): Promise<ChatRecordMediaClone> {
    const metadata = mediaMetadata[mimeType as ChatRecordMediaMimeType];
    if (!metadata) throw this.unavailable();

    try {
      const sourcePath = await this.resolveSourcePath(sourceUrl);
      const sourceStat = await stat(sourcePath);
      if (!sourceStat.isFile() || sourceStat.size === 0 || sourceStat.size > this.maxBytes) {
        throw this.unavailable();
      }
      const bytes = await readFile(sourcePath);
      if (bytes.length !== sourceStat.size || !metadata.matches(bytes)) {
        throw this.unavailable();
      }

      const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
      const fileKey = `${checksumSha256}/${randomUUID()}/${checksumSha256}.${metadata.extension}`;
      const targetPath = this.targetPath(fileKey);
      await mkdir(dirname(targetPath), { recursive: true, mode: 0o700 });
      await writeFile(targetPath, bytes, { flag: "wx", mode: 0o600 });

      return {
        created: true,
        fileKey,
        mimeType,
        size: bytes.length,
        checksumSha256
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw this.unavailable(error);
    }
  }

  public async delete(fileKey: string): Promise<void> {
    const targetPath = this.targetPath(fileKey);
    try {
      await unlink(targetPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException | undefined)?.code !== "ENOENT") throw error;
    }
    await this.removeEmptyDirectory(dirname(targetPath));
    await this.removeEmptyDirectory(dirname(dirname(targetPath)));
  }

  public async read(checksumSha256: string, mimeType: string): Promise<ChatRecordMediaRead> {
    const metadata = mediaMetadata[mimeType as ChatRecordMediaMimeType];
    if (!metadata || !/^[a-f0-9]{64}$/u.test(checksumSha256)) throw this.unavailable();
    try {
      const checksumDirectory = resolve(join(this.directory, checksumSha256));
      let attempts: Dirent[];
      try {
        attempts = await readdir(checksumDirectory, { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException | undefined)?.code !== "ENOENT") throw error;
        attempts = [];
      }
      for (const attempt of attempts.sort((left, right) => left.name.localeCompare(right.name))) {
        if (!attempt.isDirectory() || !/^[0-9a-f-]{36}$/u.test(attempt.name)) continue;
        const fileKey = `${checksumSha256}/${attempt.name}/${checksumSha256}.${metadata.extension}`;
        let bytes: Buffer;
        try {
          bytes = await readFile(this.targetPath(fileKey));
        } catch (error) {
          if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") continue;
          throw error;
        }
        if (this.matchesDescriptor(bytes, checksumSha256, metadata.matches)) {
          return { bytes, checksumSha256, mimeType, size: bytes.length };
        }
      }

      const restored = await this.restoreFromSource(
        checksumSha256,
        mimeType,
        metadata.extension,
        metadata.matches
      );
      if (restored) return restored;
      throw this.unavailable();
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw this.unavailable(error);
    }
  }

  private async restoreFromSource(
    checksumSha256: string,
    mimeType: string,
    extension: string,
    matchesMime: (bytes: Buffer) => boolean
  ): Promise<ChatRecordMediaRead | null> {
    const sourceName = `${checksumSha256}.${extension}`;
    for (const root of this.sourceRoots) {
      let canonicalRoot: string;
      let candidate: string;
      try {
        canonicalRoot = await realpath(resolve(root.directory));
        candidate = await realpath(resolve(join(canonicalRoot, sourceName)));
      } catch (error) {
        if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") continue;
        throw error;
      }
      if (!candidate.startsWith(`${canonicalRoot}${sep}`)) continue;
      const bytes = await readFile(candidate);
      if (!this.matchesDescriptor(bytes, checksumSha256, matchesMime)) continue;

      const fileKey = `${checksumSha256}/${randomUUID()}/${sourceName}`;
      const targetPath = this.targetPath(fileKey);
      await mkdir(dirname(targetPath), { recursive: true, mode: 0o700 });
      await writeFile(targetPath, bytes, { flag: "wx", mode: 0o600 });
      return { bytes, checksumSha256, mimeType, size: bytes.length };
    }
    return null;
  }

  private matchesDescriptor(
    bytes: Buffer,
    checksumSha256: string,
    matchesMime: (bytes: Buffer) => boolean
  ): boolean {
    return (
      bytes.length > 0 &&
      bytes.length <= this.maxBytes &&
      createHash("sha256").update(bytes).digest("hex") === checksumSha256 &&
      matchesMime(bytes)
    );
  }

  private parsePublicBase(root: ImChatRecordMediaSourceRoot): ParsedPublicBase {
    try {
      const parsed = new URL(root.publicBaseUrl);
      return {
        directory: root.directory,
        origin: parsed.origin,
        pathname: trimTrailingSlash(parsed.pathname)
      };
    } catch {
      if (!root.publicBaseUrl.startsWith("/")) throw this.unavailable();
      return {
        directory: root.directory,
        origin: null,
        pathname: trimTrailingSlash(root.publicBaseUrl)
      };
    }
  }

  private async resolveSourcePath(sourceUrl: string): Promise<string> {
    let sourceOrigin: string | null = null;
    let pathname: string;
    try {
      const parsed = new URL(sourceUrl);
      sourceOrigin = parsed.origin;
      pathname = parsed.pathname;
    } catch {
      if (!sourceUrl.startsWith("/") || sourceUrl.startsWith("//")) throw this.unavailable();
      const parsed = new URL(sourceUrl, "http://needo.invalid");
      pathname = parsed.pathname;
    }

    for (const root of this.sourceRoots) {
      if (sourceOrigin !== root.origin || !pathname.startsWith(`${root.pathname}/`)) continue;
      const encodedRelative = pathname.slice(root.pathname.length + 1);
      let relative: string;
      try {
        relative = decodeURIComponent(encodedRelative);
      } catch {
        throw this.unavailable();
      }
      if (
        relative.length === 0 ||
        relative.includes("\\") ||
        relative.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
      ) {
        throw this.unavailable();
      }

      const canonicalRoot = await realpath(resolve(root.directory));
      const candidate = await realpath(resolve(join(canonicalRoot, relative)));
      if (!candidate.startsWith(`${canonicalRoot}${sep}`)) throw this.unavailable();
      return candidate;
    }
    throw this.unavailable();
  }

  private targetPath(fileKey: string): string {
    if (
      !/^[a-f0-9]{64}\/[0-9a-f-]{36}\/[a-f0-9]{64}\.(?:jpg|png|webp|webm|mp4|ogg|pdf)$/u.test(
        fileKey
      ) ||
      basename(fileKey) !== fileKey.split("/").at(-1)
    ) {
      throw this.unavailable();
    }
    const directory = resolve(this.directory);
    const path = resolve(join(directory, fileKey));
    if (!path.startsWith(`${directory}${sep}`)) throw this.unavailable();
    return path;
  }

  private async removeEmptyDirectory(path: string): Promise<void> {
    try {
      await rmdir(path);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code !== "ENOENT" && code !== "ENOTEMPTY") throw error;
    }
  }

  private unavailable(cause?: unknown): AppError {
    return new AppError({
      code: ERROR_CODES.NOT_FOUND,
      message: "error.im.chat_record_media_unavailable",
      statusCode: 404,
      cause
    });
  }
}
