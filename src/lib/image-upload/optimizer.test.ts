import { describe, expect, it, vi } from "vitest";
import { IMAGE_UPLOAD_PROFILES } from "./profiles";
import type {
  DecodedUploadImage,
  EncodedUploadCandidate,
  ImageUploadCodec
} from "./types";
import { optimizeImageUploadWithCodec } from "./optimizer";

type FakeCodecOptions = {
  candidateSsim?: number;
  encodeSupported?: boolean;
  hasAlpha?: boolean;
  resultBytes?: number;
};

function createFakeCodec(options: FakeCodecOptions = {}) {
  const decoded: DecodedUploadImage = {
    handle: {},
    hasAlpha: options.hasAlpha ?? false,
    height: 600,
    width: 800
  };
  const lastEncodeOptions: Array<{ mimeType: string; preserveAlpha: boolean; quality: number }> = [];
  const codec: ImageUploadCodec = {
    compare: vi.fn(async () => options.candidateSsim ?? 0.999),
    decode: vi.fn(async () => decoded),
    dispose: vi.fn(),
    encode: vi.fn(async (_source, encodeOptions): Promise<EncodedUploadCandidate> => {
      lastEncodeOptions.push(encodeOptions);
      if (options.encodeSupported === false) throw new Error("error.image_upload.unsupported");
      return {
        bytes: new Uint8Array(options.resultBytes ?? 500_000),
        height: 600,
        mimeType: encodeOptions.mimeType,
        width: 800
      };
    })
  };
  return { codec, lastEncodeOptions };
}

const photo = new File([new Uint8Array(2_000_000)], "photo.jpg", { type: "image/jpeg" });
const alphaPng = new File([new Uint8Array(2_000_000)], "avatar.png", { type: "image/png" });

describe("client image upload optimizer", () => {
  it("locks a bounded profile for every upload purpose", () => {
    expect(IMAGE_UPLOAD_PROFILES.avatar).toEqual({
      maxBytes: 675_000,
      maxDimension: 1200,
      minSsim: 0.99
    });
    expect(Object.keys(IMAGE_UPLOAD_PROFILES)).toEqual([
      "avatar",
      "im",
      "social",
      "carousel",
      "shop-presentation",
      "service-cover",
      "official-notice",
      "identity-preview"
    ]);
  });

  it("never returns a candidate below the purpose SSIM floor", async () => {
    const { codec } = createFakeCodec({ candidateSsim: 0.97 });

    await expect(optimizeImageUploadWithCodec(photo, "social", codec)).rejects.toThrow(
      "error.image_upload.quality_failed"
    );
  });

  it("preserves Alpha and the decoded visual dimensions", async () => {
    const { codec, lastEncodeOptions } = createFakeCodec({ hasAlpha: true });

    const result = await optimizeImageUploadWithCodec(alphaPng, "avatar", codec);

    expect(result).toMatchObject({ height: 600, ssim: 0.999, width: 800 });
    expect(result.mimeType).toBe("image/webp");
    expect(lastEncodeOptions.every((options) => options.preserveAlpha)).toBe(true);
  });

  it("does not return an original when browser encoding is unavailable", async () => {
    const { codec } = createFakeCodec({ encodeSupported: false });

    await expect(optimizeImageUploadWithCodec(photo, "im", codec)).rejects.toThrow(
      "error.image_upload.unsupported"
    );
  });

  it("aborts before decoding or uploading bytes", async () => {
    const controller = new AbortController();
    controller.abort();
    const { codec } = createFakeCodec();

    await expect(
      optimizeImageUploadWithCodec(photo, "social", codec, { signal: controller.signal })
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(codec.decode).not.toHaveBeenCalled();
  });

  it("rejects every candidate when the size cap cannot be met at the SSIM floor", async () => {
    const { codec } = createFakeCodec({ resultBytes: 3_000_001 });

    await expect(optimizeImageUploadWithCodec(photo, "social", codec)).rejects.toThrow(
      "error.image_upload.quality_failed"
    );
  });
});
