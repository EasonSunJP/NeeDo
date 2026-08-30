import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, stat, unlink, writeFile } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
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
  }
} as const;

export type ChatRecordMediaMimeType = keyof typeof mediaMetadata;

export interface ChatRecordMediaClone {
  created: boolean;
  fileKey: string;
  mimeType: string;
  size: number;
  checksumSha256: string;
  url: string;
}

export interface ImChatRecordMediaStoragePort {
  clone(sourceUrl: string, mimeType: string): Promise<ChatRecordMediaClone>;
  delete(fileKey: string): Promise<void>;
}

export interface ImChatRecordMediaSourceRoot {
  directory: string;
  publicBaseUrl: string;
}

export interface ImChatRecordMediaFileStorageOptions {
  directory?: string;
  publicBaseUrl?: string;
  sourceRoots: ImChatRecordMediaSourceRoot[];
  maxBytes?: number;
}

type ParsedPublicBase = {
  directory: string;
  origin: string | null;
  pathname: string;
};

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/u, "");

export class ImChatRecordMediaFileStorage implements ImChatRecordMediaStoragePort {
  private readonly directory: string;
  private readonly publicBaseUrl: string;
  private readonly sourceRoots: ParsedPublicBase[];
  private readonly maxBytes: number;

  public constructor(options: ImChatRecordMediaFileStorageOptions) {
    this.directory = options.directory ?? "runtime/im-chat-record-media";
    this.publicBaseUrl = trimTrailingSlash(options.publicBaseUrl ?? "/media/im-chat-record");
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
      const fileKey = `${checksumSha256}.${metadata.extension}`;
      const targetPath = this.targetPath(fileKey);
      await mkdir(this.directory, { recursive: true });

      let created = true;
      try {
        await writeFile(targetPath, bytes, { flag: "wx", mode: 0o600 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException | undefined)?.code !== "EEXIST") throw error;
        const existing = await readFile(targetPath);
        if (createHash("sha256").update(existing).digest("hex") !== checksumSha256) {
          throw this.unavailable();
        }
        created = false;
      }

      return {
        created,
        fileKey,
        mimeType,
        size: bytes.length,
        checksumSha256,
        url: `${this.publicBaseUrl}/${fileKey}`
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw this.unavailable(error);
    }
  }

  public async delete(fileKey: string): Promise<void> {
    try {
      await unlink(this.targetPath(fileKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException | undefined)?.code !== "ENOENT") throw error;
    }
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
      !/^[a-f0-9]{64}\.(?:jpg|png|webp|webm|mp4|ogg)$/u.test(fileKey) ||
      basename(fileKey) !== fileKey
    ) {
      throw this.unavailable();
    }
    const directory = resolve(this.directory);
    const path = resolve(join(directory, fileKey));
    if (!path.startsWith(`${directory}${sep}`)) throw this.unavailable();
    return path;
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
