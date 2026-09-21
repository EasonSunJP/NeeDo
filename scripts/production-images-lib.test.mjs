import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";
import {
  classifyProductionImage,
  computeImageSsim,
  inspectPngAnimation,
  optimizeProductionImage
} from "./production-images-lib.mjs";

test("classifies critical UI paths at the stricter threshold", () => {
  assert.deepEqual(
    classifyProductionImage("public/images/needo-pet/xiao-bai-revive.png"),
    { category: "critical", minSsim: 0.998 }
  );
  assert.deepEqual(
    classifyProductionImage("public/images/generated/profile-customer-aya.jpg"),
    { category: "photo", minSsim: 0.995 }
  );
  assert.deepEqual(
    classifyProductionImage("public/images/carousel/needo-welcome-v1.png"),
    { category: "critical", minSsim: 0.998 }
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

test("keeps PNG decoded pixels lossless to avoid gradients and text banding", async () => {
  const width = 320;
  const height = 180;
  const raw = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const distance = Math.hypot(x - width * 0.75, y - height * 0.33);
      const glow = Math.max(0, 1 - distance / (width * 0.55));
      raw[index] = Math.round(5 + 35 * glow);
      raw[index + 1] = Math.round(22 + 80 * glow);
      raw[index + 2] = Math.round(30 + 22 * glow);
      raw[index + 3] = 255;
    }
  }
  const source = await sharp(raw, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 0, palette: false })
    .toBuffer();

  const result = await optimizeProductionImage({
    bytes: source,
    relativePath: "public/images/carousel/gradient-with-text.png",
    policy: {
      criticalPatterns: [],
      criticalMinSsim: 0.998,
      photoMinSsim: 0.9,
      minimumSavingsRatio: 0,
      minimumSavingsBytes: 0,
      jpegQualities: [88],
      webpQualities: [88],
      pngQualities: [95]
    }
  });
  const reference = await sharp(source).ensureAlpha().raw().toBuffer();
  const candidate = await sharp(result.bytes).ensureAlpha().raw().toBuffer();

  assert.deepEqual(candidate, reference);
  assert.equal(result.ssim, 1);
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

test("retains every APNG frame even when the image decoder reports one page", async () => {
  const animatedPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAABAAAAAQBPJcTWAAAACGFjVEwAAAACAAAAAPONk3AAAAAaZmNUTAAAAAAAAAACAAAAAgAAAAAAAAAAAAEAAgAA5keNuAAAABBJREFUeJxj/MMAAixgkgEADQQBAr9QFbMAAAAaZmNUTAAAAAEAAAABAAAAAQAAAAAAAAAAAAEAAgAAzx+LvAAAABBmZEFUAAAAAnicY/zDwAAAAvwA/uU1kAgAAAAASUVORK5CYII=",
    "base64"
  );

  const result = await optimizeProductionImage({
    bytes: animatedPng,
    relativePath: "public/images/needo-pet/two-frame.png"
  });

  assert.equal(result.status, "kept-original");
  assert.equal(result.exceptionReason, "multi-frame-preserved");
  assert.equal(result.pages, 2);
  assert.deepEqual(result.bytes, animatedPng);
});

test("keeps Xiaobai APNG source clips normalized for atlas generation", async () => {
  const animatedAssets = [
    "xiao-bai-death.png",
    "xiao-bai-enter.png",
    "xiao-bai-exit.png",
    "xiao-bai-idle-angry.png",
    "xiao-bai-idle-excited.png",
    "xiao-bai-idle-heart-thanks.png",
    "xiao-bai-idle-question-cheer.png",
    "xiao-bai-idle-sad.png",
    "xiao-bai-idle-sleepy.png",
    "xiao-bai-idle-sparkle.png",
    "xiao-bai-idle-thinking.png",
    "xiao-bai-revive.png",
    "xiao-bai-run-dash.png",
    "xiao-bai-run-sprint.png"
  ];
  let totalBytes = 0;

  for (const asset of animatedAssets) {
    const bytes = await readFile(new URL(`../public/images/needo-pet/${asset}`, import.meta.url));
    const animation = inspectPngAnimation(bytes);
    totalBytes += bytes.length;

    assert.ok(animation, `${asset} must remain animated`);
    assert.equal(animation.frameRate, 6, `${asset} must play at 6 fps`);
    assert.ok(animation.width <= 138 && animation.height <= 162, `${asset} exceeds the existing Xiaobai canvas`);
    assert.equal(
      animation.partialFrameCount,
      0,
      `${asset} must use self-contained full-canvas frames for reliable WebKit playback`
    );
    assert.deepEqual(
      animation.disposeOps,
      [0],
      `${asset} must not depend on APNG disposal history`
    );
    assert.deepEqual(
      animation.blendOps,
      [0],
      `${asset} must replace the full canvas on every frame`
    );
  }

  assert.ok(totalBytes <= 5 * 1024 * 1024, `Xiaobai motion clips exceed 5 MiB: ${totalBytes}`);
});

test("uses complete composited atlas frames for Xiaobai motion fallbacks", async () => {
  const fallbacks = [
    ["xiao-bai-idle.png", "xiao-bai-idle-question-cheer-atlas.png"],
    ["xiao-bai-running.png", "xiao-bai-run-dash-atlas.png"]
  ];

  for (const [fallbackAsset, atlasAsset] of fallbacks) {
    const fallbackBytes = await readFile(new URL(`../public/images/needo-pet/${fallbackAsset}`, import.meta.url));
    const atlasBytes = await readFile(new URL(`../public/images/needo-pet/${atlasAsset}`, import.meta.url));
    const fallback = await sharp(fallbackBytes)
      .ensureAlpha()
      .raw()
      .toBuffer();
    const atlasFrame = await sharp(atlasBytes)
      .extract({ height: 143, left: 0, top: 0, width: 132 })
      .ensureAlpha()
      .raw()
      .toBuffer();

    assert.equal(fallback.equals(atlasFrame), true, `${fallbackAsset} must not contain an uncomposited partial frame`);
  }
});
