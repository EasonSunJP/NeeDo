import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultPolicyPath = path.resolve(moduleDirectory, "../config/production-images.json");
const supportedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const decoderOptions = {
  animated: true,
  failOn: "warning",
  limitInputPixels: 25_000_000,
  sequentialRead: true
};
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const defaultClassification = Object.freeze({
  criticalPatterns: [
    "public/apple-touch-icon.png",
    "public/images/needo-pet/",
    "icon",
    "logo",
    "carousel",
    "login",
    "error_bg",
    "chat_bg",
    "timeline",
    "rank",
    "badge",
    "qr"
  ],
  criticalMinSsim: 0.998,
  photoMinSsim: 0.995
});

export async function loadProductionImagePolicy(policyPath = defaultPolicyPath) {
  const policy = JSON.parse(await readFile(policyPath, "utf8"));
  if (
    policy?.formatVersion !== 1 ||
    !Array.isArray(policy.roots) ||
    !Array.isArray(policy.extensions) ||
    !Array.isArray(policy.criticalPatterns) ||
    typeof policy.photoMinSsim !== "number" ||
    typeof policy.criticalMinSsim !== "number"
  ) {
    throw new Error("Production image policy is invalid");
  }
  return Object.freeze(policy);
}

export function classifyProductionImage(relativePath, policy = defaultClassification) {
  const normalized = relativePath.replaceAll(path.sep, "/").toLowerCase();
  const critical = policy.criticalPatterns.some((pattern) =>
    normalized.includes(String(pattern).toLowerCase())
  );
  return critical
    ? { category: "critical", minSsim: policy.criticalMinSsim }
    : { category: "photo", minSsim: policy.photoMinSsim };
}

function channelValue(pixels, offset, channel) {
  const alpha = pixels[offset + 3] / 255;
  if (channel === 3) return pixels[offset + 3];
  return pixels[offset + channel] * alpha + 255 * (1 - alpha);
}

function computeChannelBlockSsim(left, right, width, xStart, yStart, blockWidth, blockHeight, channel) {
  const count = blockWidth * blockHeight;
  let leftSum = 0;
  let rightSum = 0;
  for (let y = yStart; y < yStart + blockHeight; y += 1) {
    for (let x = xStart; x < xStart + blockWidth; x += 1) {
      const offset = (y * width + x) * 4;
      leftSum += channelValue(left, offset, channel);
      rightSum += channelValue(right, offset, channel);
    }
  }
  const leftMean = leftSum / count;
  const rightMean = rightSum / count;
  let leftVariance = 0;
  let rightVariance = 0;
  let covariance = 0;
  for (let y = yStart; y < yStart + blockHeight; y += 1) {
    for (let x = xStart; x < xStart + blockWidth; x += 1) {
      const offset = (y * width + x) * 4;
      const leftDelta = channelValue(left, offset, channel) - leftMean;
      const rightDelta = channelValue(right, offset, channel) - rightMean;
      leftVariance += leftDelta * leftDelta;
      rightVariance += rightDelta * rightDelta;
      covariance += leftDelta * rightDelta;
    }
  }
  const divisor = Math.max(1, count - 1);
  leftVariance /= divisor;
  rightVariance /= divisor;
  covariance /= divisor;
  const c1 = (0.01 * 255) ** 2;
  const c2 = (0.03 * 255) ** 2;
  return (
    ((2 * leftMean * rightMean + c1) * (2 * covariance + c2)) /
    ((leftMean ** 2 + rightMean ** 2 + c1) * (leftVariance + rightVariance + c2))
  );
}

export function computeImageSsim(left, right, width, height) {
  const expectedLength = width * height * 4;
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    left.length !== expectedLength ||
    right.length !== expectedLength
  ) {
    throw new Error("SSIM inputs are invalid");
  }
  if (Buffer.from(left).equals(Buffer.from(right))) return 1;
  const weights = [0.3, 0.59, 0.11, 0.25];
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  let total = 0;
  let blocks = 0;
  for (let y = 0; y < height; y += 8) {
    for (let x = 0; x < width; x += 8) {
      const blockWidth = Math.min(8, width - x);
      const blockHeight = Math.min(8, height - y);
      let weighted = 0;
      for (let channel = 0; channel < 4; channel += 1) {
        weighted += weights[channel] * computeChannelBlockSsim(
          left,
          right,
          width,
          x,
          y,
          blockWidth,
          blockHeight,
          channel
        );
      }
      total += weighted / weightTotal;
      blocks += 1;
    }
  }
  return Math.max(-1, Math.min(1, total / blocks));
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function inspectPngAnimation(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 33 || !bytes.subarray(0, 8).equals(pngSignature)) {
    return null;
  }

  let width = null;
  let height = null;
  let frameCount = null;
  let durationSeconds = 0;
  let partialFrameCount = 0;
  const blendOps = new Set();
  const disposeOps = new Set();
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const chunkLength = bytes.readUInt32BE(offset);
    const chunkEnd = offset + 12 + chunkLength;
    if (chunkEnd > bytes.length) return null;

    const chunkType = bytes.toString("ascii", offset + 4, offset + 8);
    if (chunkType === "IHDR" && chunkLength === 13) {
      width = bytes.readUInt32BE(offset + 8);
      height = bytes.readUInt32BE(offset + 12);
    } else if (chunkType === "acTL" && chunkLength === 8) {
      frameCount = bytes.readUInt32BE(offset + 8);
    } else if (chunkType === "fcTL" && chunkLength === 26) {
      const frameWidth = bytes.readUInt32BE(offset + 12);
      const frameHeight = bytes.readUInt32BE(offset + 16);
      const frameX = bytes.readUInt32BE(offset + 20);
      const frameY = bytes.readUInt32BE(offset + 24);
      const delayNumerator = bytes.readUInt16BE(offset + 28);
      const delayDenominator = bytes.readUInt16BE(offset + 30) || 100;
      disposeOps.add(bytes[offset + 32]);
      blendOps.add(bytes[offset + 33]);
      if (
        frameWidth !== width ||
        frameHeight !== height ||
        frameX !== 0 ||
        frameY !== 0
      ) {
        partialFrameCount += 1;
      }
      durationSeconds += delayNumerator / delayDenominator;
    }

    offset = chunkEnd;
  }

  return frameCount && frameCount > 1 && width && height
    ? {
        durationMs: Math.round(durationSeconds * 1_000),
        blendOps: [...blendOps].sort((left, right) => left - right),
        disposeOps: [...disposeOps].sort((left, right) => left - right),
        frameCount,
        frameRate: durationSeconds > 0
          ? Number((frameCount / durationSeconds).toFixed(3))
          : null,
        height,
        partialFrameCount,
        width
      }
    : null;
}

function retainedResult({ bytes, relativePath, reason, metadata = {} }) {
  const digest = sha256(bytes);
  return {
    bytes,
    codec: "original",
    exceptionReason: reason,
    format: metadata.format ?? path.extname(relativePath).slice(1).toLowerCase(),
    hasAlpha: Boolean(metadata.hasAlpha),
    height: metadata.height ?? null,
    pages: metadata.pages ?? 1,
    resultBytes: bytes.length,
    resultSha256: digest,
    sourceBytes: bytes.length,
    sourceSha256: digest,
    ssim: 1,
    status: "kept-original",
    width: metadata.width ?? null
  };
}

async function decodedPixels(bytes) {
  return sharp(bytes, decoderOptions)
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

async function encodeCandidate(bytes, extension, classification, quality) {
  const pipeline = sharp(bytes, decoderOptions).rotate();
  if (extension === ".jpg" || extension === ".jpeg") {
    return pipeline.jpeg({ chromaSubsampling: "4:4:4", mozjpeg: true, quality }).toBuffer();
  }
  if (extension === ".webp") {
    return pipeline.webp({ effort: 6, quality }).toBuffer();
  }
  return pipeline.png({ adaptiveFiltering: true, compressionLevel: 9, palette: false }).toBuffer();
}

export async function optimizeProductionImage({ bytes, relativePath, policy: suppliedPolicy }) {
  const extension = path.extname(relativePath).toLowerCase();
  if (!supportedExtensions.has(extension)) {
    return retainedResult({ bytes, relativePath, reason: "unsupported-extension" });
  }
  const policy = suppliedPolicy ?? await loadProductionImagePolicy();
  const metadata = await sharp(bytes, decoderOptions).metadata();
  const pngAnimation = extension === ".png" ? inspectPngAnimation(bytes) : null;
  const visualMetadata = {
    format: metadata.format,
    hasAlpha: metadata.hasAlpha,
    height: metadata.autoOrient?.height ?? metadata.height,
    pages: pngAnimation?.frameCount ?? metadata.pages ?? 1,
    width: metadata.autoOrient?.width ?? metadata.width
  };
  if (!visualMetadata.width || !visualMetadata.height) {
    throw new Error(`Image dimensions are unavailable: ${relativePath}`);
  }
  if (visualMetadata.pages > 1) {
    return retainedResult({
      bytes,
      metadata: visualMetadata,
      relativePath,
      reason: "multi-frame-preserved"
    });
  }
  const classification = classifyProductionImage(relativePath, policy);
  const reference = await decodedPixels(bytes);
  const qualities = extension === ".png"
    ? [100]
    : extension === ".webp"
      ? policy.webpQualities
      : policy.jpegQualities;
  for (const quality of qualities) {
    const candidate = await encodeCandidate(bytes, extension, classification, quality);
    const decoded = await decodedPixels(candidate);
    if (
      decoded.info.width !== reference.info.width ||
      decoded.info.height !== reference.info.height
    ) {
      continue;
    }
    const ssim = computeImageSsim(
      reference.data,
      decoded.data,
      reference.info.width,
      reference.info.height
    );
    const bytesSaved = bytes.length - candidate.length;
    const savingsRatio = bytesSaved / bytes.length;
    const pixelsEqual = reference.data.equals(decoded.data);
    const qualityPass = extension === ".png"
      ? pixelsEqual
      : ssim >= classification.minSsim;
    const savingsPass =
      bytesSaved > 0 &&
      (bytesSaved >= policy.minimumSavingsBytes || savingsRatio >= policy.minimumSavingsRatio);
    if (!qualityPass || !savingsPass) continue;
    return {
      bytes: candidate,
      codec: `${extension.slice(1)}-q${quality}`,
      exceptionReason: null,
      format: metadata.format,
      hasAlpha: Boolean(metadata.hasAlpha),
      height: reference.info.height,
      pages: 1,
      resultBytes: candidate.length,
      resultSha256: sha256(candidate),
      sourceBytes: bytes.length,
      sourceSha256: sha256(bytes),
      ssim,
      status: pixelsEqual ? "lossless" : "optimized",
      width: reference.info.width
    };
  }
  return retainedResult({
    bytes,
    metadata: visualMetadata,
    relativePath,
    reason: "quality-or-savings-gate"
  });
}
