import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const previewDir = path.join(root, "outputs/needo-roadshow-2026-08-23/previews");
const output = path.join(root, "outputs/needo-roadshow-2026-08-23/contact-sheet.png");
const files = fs.readdirSync(previewDir)
  .filter((file) => /^slide-\d+\.png$/.test(file))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

const cols = 4;
const thumbW = 480;
const thumbH = 270;
const gap = 24;
const labelH = 32;
const rows = Math.ceil(files.length / cols);
const width = cols * thumbW + (cols + 1) * gap;
const height = rows * (thumbH + labelH) + (rows + 1) * gap;
const composites = [];

for (let i = 0; i < files.length; i += 1) {
  const col = i % cols;
  const row = Math.floor(i / cols);
  const left = gap + col * (thumbW + gap);
  const top = gap + row * (thumbH + labelH + gap);
  const image = await sharp(path.join(previewDir, files[i])).resize(thumbW, thumbH, { fit: "fill" }).png().toBuffer();
  composites.push({ input: image, left, top });
  const labelSvg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${thumbW}" height="${labelH}"><rect width="100%" height="100%" fill="#FFFFFF"/><text x="10" y="22" font-family="Arial" font-size="17" font-weight="700" fill="#2F5F4A">${String(i + 1).padStart(2, "0")}</text></svg>`);
  composites.push({ input: labelSvg, left, top: top + thumbH });
}

await sharp({ create: { width, height, channels: 3, background: "#EDF5F1" } }).composite(composites).png().toFile(output);
console.log(output);
