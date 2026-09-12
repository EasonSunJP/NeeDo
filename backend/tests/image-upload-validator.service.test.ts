import sharp from "sharp";
import { ImageUploadValidator } from "../src/services/image-upload-validator.service";

describe("ImageUploadValidator", () => {
  const validator = new ImageUploadValidator();

  async function image(
    format: "jpeg" | "png" | "webp",
    width = 640,
    height = 480
  ) {
    return sharp({ create: { width, height, channels: 4, background: "#86efac" } })
      .toFormat(format)
      .toBuffer();
  }

  it("rejects a PNG body declared as JPEG", async () => {
    await expect(validator.validate({
      bytes: await image("png"),
      declaredMimeType: "image/jpeg",
      purpose: "social"
    })).rejects.toMatchObject({ message: "error.image_upload.invalid" });
  });

  it("rejects corrupt bytes with a plausible content type", async () => {
    await expect(validator.validate({
      bytes: Buffer.from([0xff, 0xd8, 0xff]),
      declaredMimeType: "image/jpeg",
      purpose: "im"
    })).rejects.toMatchObject({ message: "error.image_upload.invalid" });
  });

  it("rejects decoded dimensions above the purpose contract", async () => {
    await expect(validator.validate({
      bytes: await image("png", 1201, 20),
      declaredMimeType: "image/png",
      purpose: "avatar"
    })).rejects.toMatchObject({ message: "error.image_upload.dimensions_exceeded" });
  });

  it("rejects accepted-format bytes above the purpose size cap before decoding", async () => {
    await expect(validator.validate({
      bytes: Buffer.alloc(675_001, 0),
      declaredMimeType: "image/png",
      purpose: "avatar"
    })).rejects.toMatchObject({ message: "error.image_upload.too_large" });
  });

  it("returns exact accepted bytes and server-derived metadata without encoding", async () => {
    const bytes = await image("jpeg");
    const result = await validator.validate({
      bytes,
      declaredMimeType: "image/jpeg",
      purpose: "im"
    });

    expect(result.bytes).toBe(bytes);
    expect(result).toMatchObject({
      extension: "jpg",
      height: 480,
      mimeType: "image/jpeg",
      pages: 1,
      width: 640
    });
    expect(result.checksumSha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("rejects an animated unsupported upload container", async () => {
    const animated = Buffer.from(
      "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
      "base64"
    );

    await expect(validator.validate({
      bytes: animated,
      declaredMimeType: "image/gif",
      purpose: "social"
    })).rejects.toMatchObject({ message: "error.image_upload.invalid" });
  });
});
