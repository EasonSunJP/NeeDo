import { createHash, randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  classifyProductionImage,
  loadProductionImagePolicy,
  optimizeProductionImage
} from "./production-images-lib.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function collectFiles(root, relativeDirectory, extensions, result) {
  const absoluteDirectory = path.join(root, relativeDirectory);
  let entries;
  try {
    entries = await readdir(absoluteDirectory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
    const child = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(root, child, extensions, result);
    } else if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) {
      result.push(child.split(path.sep).join("/"));
    } else if (entry.isSymbolicLink()) {
      throw new Error(`Production image roots cannot contain symlinks: ${child}`);
    }
  }
}

export async function collectProductionImagePaths(root, policy) {
  const result = [];
  const extensions = new Set(policy.extensions.map((extension) => extension.toLowerCase()));
  for (const policyRoot of policy.roots) {
    await collectFiles(root, policyRoot, extensions, result);
  }
  return result.sort((left, right) => left.localeCompare(right, "en"));
}

async function atomicWrite(filePath, bytes, mode = 0o644) {
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${randomUUID()}.tmp`
  );
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(temporaryPath, bytes, { flag: "wx", mode: 0o600 });
  await chmod(temporaryPath, mode);
  await rename(temporaryPath, filePath);
}

function manifestItem(relativePath, result) {
  return {
    path: relativePath,
    status: result.status,
    sourceSha256: result.sourceSha256,
    resultSha256: result.resultSha256,
    sourceBytes: result.sourceBytes,
    resultBytes: result.resultBytes,
    width: result.width,
    height: result.height,
    format: result.format,
    hasAlpha: result.hasAlpha,
    pages: result.pages,
    codec: result.codec,
    ssim: Number(result.ssim.toFixed(6)),
    exceptionReason: result.exceptionReason
  };
}

function htmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function writeEvidence(evidenceDirectory, records) {
  const selected = [...new Map([
    ...records.toSorted((left, right) => right.sourceBytes - left.sourceBytes).slice(0, 20),
    ...records.toSorted((left, right) =>
      (right.sourceBytes - right.resultBytes) / right.sourceBytes -
      (left.sourceBytes - left.resultBytes) / left.sourceBytes
    ).slice(0, 20),
    ...records.filter((record) => record.category === "critical")
  ].map((record) => [record.path, record])).values()];
  const rows = [];
  for (const record of selected) {
    const encodedName = record.path.split("/").map(encodeURIComponent).join("/");
    await atomicWrite(path.join(evidenceDirectory, "before", record.path), record.source, 0o600);
    await atomicWrite(path.join(evidenceDirectory, "after", record.path), record.result, 0o600);
    rows.push(`<article><h2>${htmlEscape(record.path)}</h2><p>${record.sourceBytes} → ${record.resultBytes} bytes · SSIM ${record.ssim.toFixed(6)} · ${record.status}</p><div><figure><figcaption>Before</figcaption><img src="before/${encodedName}"></figure><figure><figcaption>After</figcaption><img src="after/${encodedName}"></figure></div></article>`);
  }
  const html = `<!doctype html><meta charset="utf-8"><title>NeeDo image compression evidence</title><style>body{font:14px system-ui;background:#111827;color:#f9fafb;margin:24px}article{margin:0 0 40px;padding:20px;background:#1f2937;border-radius:16px}article>div{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0}img{display:block;max-width:100%;max-height:560px;object-fit:contain;background:repeating-conic-gradient(#ddd 0 25%,#fff 0 50%) 0/20px 20px}figcaption{margin-bottom:8px;font-weight:700}</style>${rows.join("")}`;
  await atomicWrite(path.join(evidenceDirectory, "index.html"), Buffer.from(html), 0o600);
}

export async function optimizeProductionImages({
  root,
  policyPath = path.join(root, "config/production-images.json"),
  manifestPath = path.join(root, "config/production-images.manifest.json"),
  evidenceDirectory
}) {
  const policyBytes = await readFile(policyPath);
  const policy = await loadProductionImagePolicy(policyPath);
  const imagePaths = await collectProductionImagePaths(root, policy);
  const images = [];
  const evidence = [];
  for (const relativePath of imagePaths) {
    const absolutePath = path.join(root, relativePath);
    const source = await readFile(absolutePath);
    const sourceStat = await stat(absolutePath);
    const result = await optimizeProductionImage({ bytes: source, relativePath, policy });
    if (!result.bytes.equals(source)) {
      await atomicWrite(absolutePath, result.bytes, sourceStat.mode & 0o777);
    }
    const item = manifestItem(relativePath, result);
    images.push(item);
    evidence.push({
      ...item,
      category: classifyProductionImage(relativePath, policy).category,
      result: result.bytes,
      source
    });
  }
  const manifest = {
    formatVersion: 1,
    policySha256: sha256(policyBytes),
    images
  };
  await atomicWrite(manifestPath, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));
  if (evidenceDirectory) await writeEvidence(evidenceDirectory, evidence);
  return summarizeManifest(manifest);
}

function summarizeManifest(manifest) {
  const sourceBytes = manifest.images.reduce((sum, image) => sum + image.sourceBytes, 0);
  const resultBytes = manifest.images.reduce((sum, image) => sum + image.resultBytes, 0);
  return {
    failures: [],
    imageCount: manifest.images.length,
    resultBytes,
    savingsBytes: sourceBytes - resultBytes,
    savingsRatio: sourceBytes === 0 ? 0 : (sourceBytes - resultBytes) / sourceBytes,
    sourceBytes,
    statuses: Object.fromEntries(["optimized", "lossless", "kept-original"].map((status) => [
      status,
      manifest.images.filter((image) => image.status === status).length
    ]))
  };
}

export async function verifyProductionImages({
  root,
  policyPath = path.join(root, "config/production-images.json"),
  manifestPath = path.join(root, "config/production-images.manifest.json")
}) {
  const policyBytes = await readFile(policyPath);
  const policy = await loadProductionImagePolicy(policyPath);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest?.formatVersion !== 1 || !Array.isArray(manifest.images)) {
    throw new Error("Production image manifest is invalid");
  }
  if (manifest.policySha256 && manifest.policySha256 !== sha256(policyBytes)) {
    throw new Error("Production image policy SHA-256 mismatch");
  }
  const paths = await collectProductionImagePaths(root, policy);
  const manifestByPath = new Map(manifest.images.map((image) => [image.path, image]));
  for (const relativePath of paths) {
    if (!manifestByPath.has(relativePath)) {
      throw new Error(`not registered: ${relativePath}`);
    }
  }
  for (const image of manifest.images) {
    if (!paths.includes(image.path)) throw new Error(`manifest path is missing: ${image.path}`);
    const bytes = await readFile(path.join(root, image.path));
    if (sha256(bytes) !== image.resultSha256) {
      throw new Error(`result SHA-256 mismatch: ${image.path}`);
    }
    const metadata = await sharp(bytes, {
      animated: true,
      failOn: "warning",
      limitInputPixels: 25_000_000,
      sequentialRead: true
    }).metadata();
    const width = metadata.autoOrient?.width ?? metadata.width;
    const height = metadata.autoOrient?.height ?? metadata.height;
    if (
      width !== image.width ||
      height !== image.height ||
      (metadata.pages ?? 1) !== image.pages ||
      metadata.format !== image.format ||
      Boolean(metadata.hasAlpha) !== image.hasAlpha
    ) {
      throw new Error(`decoded metadata mismatch: ${image.path}`);
    }
    const classification = classifyProductionImage(image.path, policy);
    if (
      !["optimized", "lossless", "kept-original"].includes(image.status) ||
      (image.status === "kept-original" && !image.exceptionReason) ||
      (image.status !== "kept-original" && image.ssim < classification.minSsim)
    ) {
      throw new Error(`quality record is invalid: ${image.path}`);
    }
  }
  return summarizeManifest(manifest);
}

export function markdownReport(summary, manifestSha256) {
  return `# NeeDo production image compression evidence\n\n` +
    `- Images: ${summary.imageCount}\n` +
    `- Source bytes: ${summary.sourceBytes}\n` +
    `- Result bytes: ${summary.resultBytes}\n` +
    `- Saved bytes: ${summary.savingsBytes}\n` +
    `- Savings ratio: ${(summary.savingsRatio * 100).toFixed(2)}%\n` +
    `- Optimized: ${summary.statuses.optimized}\n` +
    `- Lossless: ${summary.statuses.lossless}\n` +
    `- Kept original: ${summary.statuses["kept-original"]}\n` +
    `- Threshold failures: 0\n` +
    `- Manifest SHA-256: ${manifestSha256}\n`;
}
