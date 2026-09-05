import { randomBytes } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const voiceMetadata = {
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

export type ImVoiceMimeType = keyof typeof voiceMetadata;
export type StoredImVoice = { fileKey: string; mimeType: ImVoiceMimeType; size: number };
export interface ImVoiceStoragePort {
  save(bytes: Buffer, mimeType: ImVoiceMimeType): Promise<StoredImVoice>;
  remove(fileKey: string): Promise<void>;
}

export class ImVoiceFileStorage implements ImVoiceStoragePort {
  public constructor(
    private readonly directory: string,
    private readonly maxBytes = DEFAULT_MAX_BYTES
  ) {}

  public async save(bytes: Buffer, mimeType: ImVoiceMimeType): Promise<StoredImVoice> {
    const metadata = voiceMetadata[mimeType];
    if (
      !metadata ||
      bytes.length === 0 ||
      bytes.length > this.maxBytes ||
      !metadata.matches(bytes)
    ) {
      throw this.invalid();
    }
    const fileKey = `${randomBytes(32).toString("hex")}.${metadata.extension}`;
    await mkdir(this.directory, { recursive: true });
    await writeFile(this.pathFor(fileKey), bytes, { flag: "wx" });
    return { fileKey, mimeType, size: bytes.length };
  }

  public async remove(fileKey: string): Promise<void> {
    try {
      await unlink(this.pathFor(fileKey));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  private pathFor(fileKey: string): string {
    if (!/^[a-f0-9]{64}\.(?:webm|mp4|ogg)$/u.test(fileKey) || basename(fileKey) !== fileKey) {
      throw this.invalid();
    }
    const directory = resolve(this.directory);
    const path = resolve(join(directory, fileKey));
    if (!path.startsWith(`${directory}/`)) throw this.invalid();
    return path;
  }

  private invalid() {
    return new AppError({
      code: ERROR_CODES.VALIDATION,
      message: "error.im.voice_invalid",
      statusCode: 400
    });
  }
}
