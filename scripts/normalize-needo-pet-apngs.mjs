import { spawnSync } from "node:child_process";
import {
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { inspectPngAnimation } from "./production-images-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetDirectory = path.join(root, "public/images/needo-pet");
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
  "xiao-bai-run-sprint.png",
];
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBytes = Buffer.from(type, "ascii");
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  typeBytes.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(
    crc32(Buffer.concat([typeBytes, data])),
    data.length + 8,
  );
  return result;
}

function parsePngChunks(bytes) {
  if (!bytes.subarray(0, 8).equals(pngSignature)) {
    throw new Error("Invalid PNG signature");
  }
  const chunks = [];
  for (let offset = 8; offset + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new Error("Truncated PNG chunk");
    chunks.push({
      data: bytes.subarray(offset + 8, offset + 8 + length),
      type: bytes.toString("ascii", offset + 4, offset + 8),
    });
    offset = end;
  }
  return chunks;
}

function parseAnimationControl(bytes) {
  const chunks = parsePngChunks(bytes);
  const header = chunks.find((chunk) => chunk.type === "IHDR")?.data;
  const animation = chunks.find((chunk) => chunk.type === "acTL")?.data;
  const controls = chunks.filter((chunk) => chunk.type === "fcTL");
  if (!header || !animation || controls.length === 0) {
    throw new Error("Expected an animated PNG");
  }
  return {
    frameCount: animation.readUInt32BE(0),
    height: header.readUInt32BE(4),
    plays: animation.readUInt32BE(4),
    timings: controls.map((chunk) => ({
      denominator: chunk.data.readUInt16BE(22) || 100,
      numerator: chunk.data.readUInt16BE(20),
    })),
    width: header.readUInt32BE(0),
  };
}

function runFfmpeg(args) {
  const result = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", ...args],
    {
      encoding: "utf8",
    },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || `ffmpeg exited with ${result.status}`);
  }
  return result.stdout;
}

function frameHashes(filePath) {
  return runFfmpeg([
    "-i",
    filePath,
    "-map",
    "0:v:0",
    "-pix_fmt",
    "rgba",
    "-f",
    "framemd5",
    "-",
  ])
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split(",").at(-1)?.trim());
}

async function normalizedFramePng(filePath) {
  return sharp(filePath)
    .ensureAlpha()
    .png({ adaptiveFiltering: true, compressionLevel: 9, palette: false })
    .toBuffer();
}

function assembleFullFrameApng(framePngs, control) {
  const parsedFrames = framePngs.map(parsePngChunks);
  const firstHeader = parsedFrames[0]?.find(
    (chunk) => chunk.type === "IHDR",
  )?.data;
  if (!firstHeader || framePngs.length !== control.frameCount) {
    throw new Error("Decoded frame count does not match acTL");
  }

  const chunks = [pngSignature, pngChunk("IHDR", firstHeader)];
  const animation = Buffer.alloc(8);
  animation.writeUInt32BE(control.frameCount, 0);
  animation.writeUInt32BE(control.plays, 4);
  chunks.push(pngChunk("acTL", animation));

  let sequence = 0;
  parsedFrames.forEach((frameChunks, frameIndex) => {
    const frameHeader = frameChunks.find(
      (chunk) => chunk.type === "IHDR",
    )?.data;
    const imageData = frameChunks.filter((chunk) => chunk.type === "IDAT");
    if (
      !frameHeader ||
      frameHeader.readUInt32BE(0) !== control.width ||
      frameHeader.readUInt32BE(4) !== control.height ||
      imageData.length === 0
    ) {
      throw new Error(`Decoded frame ${frameIndex} is not a full canvas`);
    }

    const frameControl = Buffer.alloc(26);
    frameControl.writeUInt32BE(sequence, 0);
    sequence += 1;
    frameControl.writeUInt32BE(control.width, 4);
    frameControl.writeUInt32BE(control.height, 8);
    frameControl.writeUInt32BE(0, 12);
    frameControl.writeUInt32BE(0, 16);
    frameControl.writeUInt16BE(control.timings[frameIndex].numerator, 20);
    frameControl.writeUInt16BE(control.timings[frameIndex].denominator, 22);
    frameControl[24] = 0;
    frameControl[25] = 0;
    chunks.push(pngChunk("fcTL", frameControl));

    for (const dataChunk of imageData) {
      if (frameIndex === 0) {
        chunks.push(pngChunk("IDAT", dataChunk.data));
      } else {
        const frameData = Buffer.alloc(dataChunk.data.length + 4);
        frameData.writeUInt32BE(sequence, 0);
        sequence += 1;
        dataChunk.data.copy(frameData, 4);
        chunks.push(pngChunk("fdAT", frameData));
      }
    }
  });
  chunks.push(pngChunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(chunks);
}

async function normalizeAsset(asset) {
  const sourcePath = path.join(assetDirectory, asset);
  const source = await readFile(sourcePath);
  const control = parseAnimationControl(source);
  const temporaryDirectory = await mkdtemp(
    path.join(os.tmpdir(), "needo-pet-apng-"),
  );
  try {
    runFfmpeg([
      "-i",
      sourcePath,
      "-vsync",
      "0",
      path.join(temporaryDirectory, "frame-%04d.png"),
    ]);
    const framePaths = (await readdir(temporaryDirectory))
      .filter((entry) => entry.endsWith(".png"))
      .sort()
      .map((entry) => path.join(temporaryDirectory, entry));
    const frames = [];
    for (const framePath of framePaths) {
      frames.push(await normalizedFramePng(framePath));
    }
    const output = assembleFullFrameApng(frames, control);
    const outputPath = path.join(temporaryDirectory, asset);
    await writeFile(outputPath, output);

    const inspected = inspectPngAnimation(output);
    if (
      !inspected ||
      inspected.frameCount !== control.frameCount ||
      inspected.partialFrameCount !== 0 ||
      inspected.disposeOps.join(",") !== "0" ||
      inspected.blendOps.join(",") !== "0"
    ) {
      throw new Error(`${asset} failed full-frame APNG validation`);
    }
    const sourceHashes = frameHashes(sourcePath);
    const outputHashes = frameHashes(outputPath);
    if (
      sourceHashes.length !== outputHashes.length ||
      sourceHashes.some((hash, index) => hash !== outputHashes[index])
    ) {
      throw new Error(`${asset} changed decoded animation pixels`);
    }
    return {
      asset,
      bytes: output,
      sourceBytes: source.length,
    };
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}

const results = [];
for (const asset of animatedAssets) {
  results.push(await normalizeAsset(asset));
}
for (const result of results) {
  const destination = path.join(assetDirectory, result.asset);
  const temporaryPath = `${destination}.full-frame.tmp`;
  await writeFile(temporaryPath, result.bytes);
  await rename(temporaryPath, destination);
}

process.stdout.write(
  `${JSON.stringify({
    assets: results.length,
    sourceBytes: results.reduce((sum, result) => sum + result.sourceBytes, 0),
    resultBytes: results.reduce((sum, result) => sum + result.bytes.length, 0),
    status: "normalized",
  })}\n`,
);
