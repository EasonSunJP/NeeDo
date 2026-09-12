import { createHash } from "node:crypto";
import sharp from "sharp";
import { ERROR_CODES } from "../constants/error-codes";
import { AppError } from "../utils/app-error";
import {
  SERVER_IMAGE_UPLOAD_PROFILES,
  type ServerImageUploadPurpose
} from "./image-upload-profiles";

const supportedFormats = {
  jpeg: { extension: "jpg", mimeType: "image/jpeg" },
  png: { extension: "png", mimeType: "image/png" },
  webp: { extension: "webp", mimeType: "image/webp" }
} as const;

export type ValidatedImageUpload = {
  bytes: Buffer;
  checksumSha256: string;
  extension: "jpg" | "png" | "webp";
  hasAlpha: boolean;
  height: number;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  pages: number;
  width: number;
};

export class ImageUploadValidator {
  public async validate(input: {
    bytes: Buffer;
    declaredMimeType: string;
    purpose: ServerImageUploadPurpose;
  }): Promise<ValidatedImageUpload> {
    const profile = SERVER_IMAGE_UPLOAD_PROFILES[input.purpose];
    if (!profile || input.bytes.length === 0) throw this.invalid();
    if (input.bytes.length > profile.maxBytes) throw this.error("error.image_upload.too_large", 413);

    try {
      const decoder = sharp(input.bytes, {
        animated: true,
        failOn: "warning",
        limitInputPixels: profile.maxPixels,
        sequentialRead: true
      });
      const metadata = await decoder.metadata();
      const format = metadata.format as keyof typeof supportedFormats | undefined;
      const expected = format ? supportedFormats[format] : undefined;
      const width = metadata.autoOrient?.width ?? metadata.width;
      const height = metadata.autoOrient?.height ?? metadata.height;
      const pages = metadata.pages ?? 1;
      if (!expected || expected.mimeType !== input.declaredMimeType || !width || !height) {
        throw this.invalid();
      }
      if (
        width > profile.maxDimension ||
        height > profile.maxDimension ||
        width * height > profile.maxPixels
      ) {
        throw this.error("error.image_upload.dimensions_exceeded", 413);
      }
      if (pages > profile.maxFrames) throw this.error("error.image_upload.frames_exceeded", 400);
      await decoder.clone().stats();
      return {
        bytes: input.bytes,
        checksumSha256: createHash("sha256").update(input.bytes).digest("hex"),
        extension: expected.extension,
        hasAlpha: Boolean(metadata.hasAlpha),
        height,
        mimeType: expected.mimeType,
        pages,
        width
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw this.invalid();
    }
  }

  private invalid() {
    return this.error("error.image_upload.invalid", 400);
  }

  private error(message: string, statusCode: number) {
    return new AppError({ code: ERROR_CODES.VALIDATION, message, statusCode });
  }
}
