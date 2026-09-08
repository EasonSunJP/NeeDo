import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { basename, join, resolve, sep } from "node:path";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const metadata = {
  "image/jpeg": {
    extension: "jpg",
    matches: (bytes: Buffer) => bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
  },
  "image/png": {
    extension: "png",
    matches: (bytes: Buffer) => bytes.subarray(0, 8).equals(PNG_SIGNATURE)
  },
  "image/webp": {
    extension: "webp",
    matches: (bytes: Buffer) =>
      bytes.subarray(0, 4).equals(Buffer.from("RIFF")) &&
      bytes.subarray(8, 12).equals(Buffer.from("WEBP"))
  },
  "video/mp4": {
    extension: "mp4",
    matches: (bytes: Buffer) => bytes.length >= 12 && bytes.subarray(4, 8).equals(Buffer.from("ftyp"))
  },
  "video/webm": {
    extension: "webm",
    matches: (bytes: Buffer) => bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
  },
  "application/pdf": {
    extension: "pdf",
    matches: (bytes: Buffer) => bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))
  },
  "text/plain": {
    extension: "txt",
    matches: (bytes: Buffer) => {
      if (bytes.includes(0)) return false;
      try {
        new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        return true;
      } catch {
        return false;
      }
    }
  }
} as const;

export type OfficialNoticeMediaMimeType = keyof typeof metadata;

export const OFFICIAL_NOTICE_MEDIA_MIME_TYPES = Object.freeze(
  Object.keys(metadata) as OfficialNoticeMediaMimeType[]
);

export interface OfficialNoticeMediaStorageInput {
  bytes: Buffer;
  mimeType: OfficialNoticeMediaMimeType;
}

export interface PreparedOfficialNoticeMedia {
  fileKey: string;
  checksumSha256: string;
  mimeType: OfficialNoticeMediaMimeType;
}

export interface StoredOfficialNoticeMedia extends PreparedOfficialNoticeMedia {
  created: boolean;
}

export interface OfficialNoticeMediaStoragePort {
  prepare(input: OfficialNoticeMediaStorageInput): Promise<PreparedOfficialNoticeMedia>;
  save(input: OfficialNoticeMediaStorageInput): Promise<StoredOfficialNoticeMedia>;
  read(fileKey: string): Promise<Buffer>;
  delete(fileKey: string): Promise<void>;
}

export class OfficialNoticeMediaFileStorage implements OfficialNoticeMediaStoragePort {
  public constructor(
    private readonly directory: string,
    private readonly maxBytes = DEFAULT_MAX_BYTES
  ) {}

  public async prepare(input: OfficialNoticeMediaStorageInput): Promise<PreparedOfficialNoticeMedia> {
    if (input.bytes.length === 0 || input.bytes.length > this.maxBytes) {
      throw input.bytes.length > this.maxBytes ? this.tooLarge() : this.invalid();
    }
    const format = metadata[input.mimeType];
    if (!format || !format.matches(input.bytes)) throw this.invalid();
    const checksumSha256 = createHash("sha256").update(input.bytes).digest("hex");
    return {
      checksumSha256,
      fileKey: `${checksumSha256}.${format.extension}`,
      mimeType: input.mimeType
    };
  }

  public async save(input: OfficialNoticeMediaStorageInput): Promise<StoredOfficialNoticeMedia> {
    const prepared = await this.prepare(input);
    const canonicalPath = this.pathFor(prepared.fileKey);
    await mkdir(this.directory, { recursive: true });
    try {
      const existing = await readFile(canonicalPath);
      if (createHash("sha256").update(existing).digest("hex") === prepared.checksumSha256) {
        return { ...prepared, created: false };
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException | undefined)?.code !== "ENOENT") throw error;
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
      const directoryHandle = await open(this.directory, "r");
      try {
        await directoryHandle.sync();
      } finally {
        await directoryHandle.close();
      }
      return { ...prepared, created: true };
    } catch (error) {
      if (handle) await handle.close().catch(() => undefined);
      await unlink(tempPath).catch(() => undefined);
      throw error;
    }
  }

  public read(fileKey: string): Promise<Buffer> {
    return readFile(this.pathFor(fileKey));
  }

  public async delete(fileKey: string): Promise<void> {
    try {
      await unlink(this.pathFor(fileKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException | undefined)?.code !== "ENOENT") throw error;
    }
  }

  private pathFor(fileKey: string): string {
    if (!/^[a-f0-9]{64}\.(?:jpg|png|webp|mp4|webm|pdf|txt)$/u.test(fileKey) || basename(fileKey) !== fileKey) {
      throw this.invalid();
    }
    const directory = resolve(this.directory);
    const path = resolve(join(directory, fileKey));
    if (!path.startsWith(`${directory}${sep}`)) throw this.invalid();
    return path;
  }

  private invalid(): AppError {
    return new AppError({
      code: ERROR_CODES.VALIDATION,
      message: "error.official_notice.media_invalid",
      statusCode: 400
    });
  }

  private tooLarge(): AppError {
    return new AppError({
      code: ERROR_CODES.VALIDATION,
      message: "error.official_notice.media_too_large",
      statusCode: 413
    });
  }
}
