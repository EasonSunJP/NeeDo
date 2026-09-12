import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  classifyProductionImage,
  computeImageSsim,
  optimizeProductionImage
} from "./production-images-lib.mjs";

test("classifies critical UI paths at the stricter threshold", () => {
  assert.deepEqual(
    classifyProductionImage("public/images/needo-pet/xiao-bai-revive.png"),
    { category: "critical", minSsim: 0.995 }
  );
  assert.deepEqual(
    classifyProductionImage("public/images/generated/profile-customer-aya.jpg"),
    { category: "photo", minSsim: 0.99 }
  );
});

test("returns SSIM 1 for identical RGBA pixels", () => {
  const pixels = Uint8Array.from([
    20, 40, 60, 255,
    90, 110, 130, 255,
    160, 180, 200, 255,
    220, 230, 240, 255
  ]);

  assert.equal(computeImageSsim(pixels, pixels, 2, 2), 1);
});

test("detects a visible decoded-pixel change", () => {
  const black = new Uint8Array(8 * 8 * 4);
  for (let offset = 3; offset < black.length; offset += 4) black[offset] = 255;
  const white = new Uint8Array(8 * 8 * 4).fill(255);

  assert.ok(computeImageSsim(black, white, 8, 8) < 0.25);
});

test("keeps dimensions and never accepts a result below the path threshold", async () => {
  const width = 256;
  const height = 160;
  const raw = Buffer.alloc(width * height * 3);
  for (let index = 0; index < raw.length; index += 3) {
    const pixel = index / 3;
    raw[index] = pixel % width;
    raw[index + 1] = Math.floor(pixel / width) % 256;
    raw[index + 2] = (pixel * 17) % 256;
  }
  const source = await sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 100, chromaSubsampling: "4:4:4" })
    .toBuffer();

  const result = await optimizeProductionImage({
    bytes: source,
    relativePath: "public/images/generated/gradient.jpg"
  });

  assert.equal(result.width, width);
  assert.equal(result.height, height);
  assert.ok(result.ssim >= 0.99);
  if (result.status !== "kept-original") {
    assert.ok(result.resultBytes < result.sourceBytes);
  }
});

test("retains a multi-frame image when animation cannot be safely rewritten", async () => {
  const animatedGif = Buffer.from(
    "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
    "base64"
  );
  const result = await optimizeProductionImage({
    bytes: animatedGif,
    relativePath: "public/images/animated.gif"
  });

  assert.equal(result.status, "kept-original");
  assert.equal(result.exceptionReason, "unsupported-extension");
  assert.deepEqual(result.bytes, animatedGif);
});
