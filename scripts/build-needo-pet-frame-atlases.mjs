import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { inspectPngAnimation } from "./production-images-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetDirectory = path.join(root, "public/images/needo-pet");
const atlasColumns = 10;
const fallbackBySourceAsset = new Map([
  ["xiao-bai-idle-question-cheer.png", "xiao-bai-idle.png"],
  ["xiao-bai-run-dash.png", "xiao-bai-running.png"],
]);
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

function runFfmpeg(args) {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...args], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `ffmpeg exited with ${result.status}`);
  }
}

async function buildAtlas(asset) {
  const sourcePath = path.join(assetDirectory, asset);
  const source = await readFile(sourcePath);
  const animation = inspectPngAnimation(source);
  if (!animation || animation.partialFrameCount !== 0) {
    throw new Error(`${asset} must be a normalized full-frame APNG`);
  }

  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "needo-pet-atlas-"));
  try {
    runFfmpeg(["-i", sourcePath, "-vsync", "0", path.join(temporaryDirectory, "frame-%04d.png")]);
    const framePaths = (await readdir(temporaryDirectory))
      .filter((entry) => entry.startsWith("frame-") && entry.endsWith(".png"))
      .sort()
      .map((entry) => path.join(temporaryDirectory, entry));
    if (framePaths.length !== animation.frameCount) {
      throw new Error(`${asset} decoded ${framePaths.length} frames, expected ${animation.frameCount}`);
    }

    const rows = Math.ceil(framePaths.length / atlasColumns);
    const frameRaws = await Promise.all(framePaths.map((framePath) => sharp(framePath).ensureAlpha().raw().toBuffer()));
    const atlasWidth = atlasColumns * animation.width;
    const atlasHeight = rows * animation.height;
    const atlasRaw = Buffer.alloc(atlasWidth * atlasHeight * 4);
    frameRaws.forEach((frame, index) => {
      const cellX = (index % atlasColumns) * animation.width;
      const cellY = Math.floor(index / atlasColumns) * animation.height;
      for (let row = 0; row < animation.height; row += 1) {
        const sourceOffset = row * animation.width * 4;
        const destinationOffset = ((cellY + row) * atlasWidth + cellX) * 4;
        frame.copy(atlasRaw, destinationOffset, sourceOffset, sourceOffset + animation.width * 4);
      }
    });
    const atlas = await sharp(atlasRaw, {
      raw: { channels: 4, height: atlasHeight, width: atlasWidth },
    })
      .png({ adaptiveFiltering: true, compressionLevel: 9, palette: false })
      .toBuffer();
    const fallback = await sharp(frameRaws[0], {
      raw: { channels: 4, height: animation.height, width: animation.width },
    })
      .png({ adaptiveFiltering: true, compressionLevel: 9, palette: false })
      .toBuffer();

    for (let index = 0; index < frameRaws.length; index += 1) {
      const expected = frameRaws[index];
      const actual = await sharp(atlas)
        .extract({
          height: animation.height,
          left: (index % atlasColumns) * animation.width,
          top: Math.floor(index / atlasColumns) * animation.height,
          width: animation.width,
        })
        .ensureAlpha()
        .raw()
        .toBuffer();
      if (!actual.equals(expected)) {
        throw new Error(`${asset} atlas frame ${index} changed decoded pixels`);
      }
    }

    return {
      asset: asset.replace(/\.png$/u, "-atlas.png"),
      bytes: atlas,
      columns: atlasColumns,
      fallback,
      frameCount: animation.frameCount,
      frameHeight: animation.height,
      frameWidth: animation.width,
      rows,
      sourceAsset: asset,
    };
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}

const results = [];
for (const asset of animatedAssets) {
  results.push(await buildAtlas(asset));
}

for (const result of results) {
  const destination = path.join(assetDirectory, result.asset);
  const temporaryPath = `${destination}.tmp`;
  await writeFile(temporaryPath, result.bytes);
  await rename(temporaryPath, destination);
  const fallbackAsset = fallbackBySourceAsset.get(result.sourceAsset);
  if (fallbackAsset) {
    const fallbackDestination = path.join(assetDirectory, fallbackAsset);
    const fallbackTemporaryPath = `${fallbackDestination}.tmp`;
    await writeFile(fallbackTemporaryPath, result.fallback);
    await rename(fallbackTemporaryPath, fallbackDestination);
  }
}

process.stdout.write(`${JSON.stringify({
  atlases: results.map(({ bytes, fallback, ...result }) => ({
    ...result,
    fallbackAsset: fallbackBySourceAsset.get(result.sourceAsset) ?? null,
    fallbackBytes: fallback.length,
    resultBytes: bytes.length,
  })),
  status: "built",
})}\n`);
