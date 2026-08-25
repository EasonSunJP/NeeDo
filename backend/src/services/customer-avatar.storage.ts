import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";

const MAX_AVATAR_BYTES = 675_000;

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

type CustomerAvatarMimeType = keyof typeof imageMetadata;

export interface StoredCustomerAvatar {
  absolutePath: string;
  mimeType: CustomerAvatarMimeType;
  url: string;
}

export interface CustomerAvatarStoragePort {
  save(dataUrl: string): Promise<StoredCustomerAvatar>;
}

export class CustomerAvatarFileStorage implements CustomerAvatarStoragePort {
  public constructor(
    private readonly directory: string,
    private readonly publicBaseUrl: string
  ) {}

  public async save(dataUrl: string): Promise<StoredCustomerAvatar> {
    const { bytes, mimeType } = this.decode(dataUrl);
    const metadata = imageMetadata[mimeType];

    if (bytes.length > MAX_AVATAR_BYTES || !metadata.matches(bytes)) {
      throw this.invalidAvatar();
    }

    const filename = `${createHash("sha256").update(bytes).digest("hex")}.${metadata.extension}`;
    const absolutePath = join(this.directory, filename);

    await mkdir(this.directory, { recursive: true });

    try {
      await writeFile(absolutePath, bytes, { flag: "wx" });
    } catch (error) {
      if (!(error instanceof Error) || (error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }

    return {
      absolutePath,
      mimeType,
      url: `${this.publicBaseUrl.replace(/\/$/, "")}/${filename}`
    };
  }

  private decode(dataUrl: string): { bytes: Buffer; mimeType: CustomerAvatarMimeType } {
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);

    if (!match || match[2].length % 4 !== 0) {
      throw this.invalidAvatar();
    }

    return { bytes: Buffer.from(match[2], "base64"), mimeType: match[1] as CustomerAvatarMimeType };
  }

  private invalidAvatar(): AppError {
    return new AppError({
      code: ERROR_CODES.VALIDATION,
      message: "error.customer_profile.avatar_invalid",
      statusCode: 400
    });
  }
}
