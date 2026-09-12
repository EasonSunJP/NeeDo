import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import {
  optimizeProductionImages,
  verifyProductionImages
} from "./production-images-cli-lib.mjs";

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "needo-production-images-"));
  await mkdir(path.join(root, "public"), { recursive: true });
  await mkdir(path.join(root, "src/assets/runtime"), { recursive: true });
  await mkdir(path.join(root, "config"), { recursive: true });
  const policyPath = path.join(root, "config/production-images.json");
  const manifestPath = path.join(root, "config/production-images.manifest.json");
  await writeFile(policyPath, JSON.stringify({
    formatVersion: 1,
    roots: ["public", "src/assets/runtime"],
    extensions: [".jpg", ".jpeg", ".png", ".webp"],
    criticalPatterns: ["icon"],
    photoMinSsim: 0.99,
    criticalMinSsim: 0.995,
    minimumSavingsRatio: 0.1,
    minimumSavingsBytes: 32768,
    jpegQualities: [88, 92, 96],
    webpQualities: [88, 92, 96],
    pngQualities: [95, 99, 100]
  }));
  const source = await sharp({
    create: { width: 512, height: 320, channels: 3, background: "#8b5cf6" }
  }).jpeg({ quality: 100 }).toBuffer();
  await writeFile(path.join(root, "public/hero.jpg"), source);
  return { manifestPath, policyPath, root };
}

test("verification rejects an unregistered runtime raster", async () => {
  const fixture = await createFixture();
  await writeFile(fixture.manifestPath, JSON.stringify({ formatVersion: 1, images: [] }));

  await assert.rejects(
    () => verifyProductionImages(fixture),
    /not registered: public\/hero\.jpg/
  );
});

test("optimization writes a manifest that passes read-only verification", async () => {
  const fixture = await createFixture();

  const optimized = await optimizeProductionImages(fixture);
  const verified = await verifyProductionImages(fixture);

  assert.equal(optimized.imageCount, 1);
  assert.equal(verified.imageCount, 1);
  assert.equal(verified.failures.length, 0);
});

test("verification rejects a changed result hash", async () => {
  const fixture = await createFixture();
  await optimizeProductionImages(fixture);
  await writeFile(path.join(fixture.root, "public/hero.jpg"), Buffer.from("changed"));

  await assert.rejects(
    () => verifyProductionImages(fixture),
    /result SHA-256 mismatch: public\/hero\.jpg/
  );
});

test("production and staging package scripts include the read-only image gate", async () => {
  const repositoryRoot = path.resolve(import.meta.dirname, "..");
  const packageJson = JSON.parse(await readFile(path.join(repositoryRoot, "package.json"), "utf8"));
  const packager = await readFile(
    path.join(repositoryRoot, "scripts/aws-staging-package-application.mjs"),
    "utf8"
  );

  assert.match(packageJson.scripts["verify:production-build"], /verify:production-images/u);
  assert.match(packager, /"verify:production-build"/u);
  assert.doesNotMatch(packager, /\["run", "build", "--", "--mode", "formal"\]/u);
});
