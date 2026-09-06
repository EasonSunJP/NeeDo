import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const ROOT = path.resolve("public/maps/jp/2026");
const sha256 = async (file) => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
};
const readJson = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
const manifest = await readJson(path.join(ROOT, "manifest.json"));
if (manifest.sourceVersion !== "N03-20260101") throw new Error("Unexpected map source version");
if (manifest.assets.length !== 48) throw new Error(`Expected 48 map assets, received ${manifest.assets.length}`);
for (const asset of manifest.assets) {
  const file = path.resolve("public", asset.url.replace(/^\//, ""));
  const bytes = await fs.readFile(file);
  if ((await sha256(file)) !== asset.sha256) throw new Error(`Checksum mismatch: ${asset.url}`);
  const budget = asset.url.endsWith("country.json") ? 600 * 1024 : 500 * 1024;
  const gzipBytes = gzipSync(bytes).byteLength;
  if (gzipBytes !== asset.gzipBytes) throw new Error(`Gzip manifest mismatch: ${asset.url}`);
  if (gzipBytes > budget) throw new Error(`Gzip budget exceeded: ${asset.url}`);
}
const country = await readJson(path.join(ROOT, "country.json"));
if (country.level !== "admin1" || country.parentCode !== "JP" || country.regions.length !== 47) throw new Error("Country asset must contain 47 prefectures");
if (new Set(country.regions.map((region) => region.code)).size !== 47) throw new Error("Country asset contains duplicate prefecture codes");
if (country.regions.some((region) => !region.path.startsWith("M"))) throw new Error("Invalid country SVG path");
let municipalityCount = 0;
for (let index = 1; index <= 47; index += 1) {
  const admin1Code = String(index).padStart(2, "0");
  const asset = await readJson(path.join(ROOT, "prefectures", `${admin1Code}.json`));
  if (asset.level !== "admin2" || asset.parentCode !== admin1Code) throw new Error(`Invalid ${admin1Code} asset`);
  const regionCodes = asset.regions.map((region) => region.code);
  if (new Set(regionCodes).size !== regionCodes.length) throw new Error(`Duplicate codes in ${admin1Code}`);
  if (asset.regions.some((region) => !region.path.startsWith("M"))) throw new Error(`Invalid path in ${admin1Code}`);
  municipalityCount += regionCodes.length;
}
const tokyo = await readJson(path.join(ROOT, "prefectures", "13.json"));
const wardCount = tokyo.regions.filter(({ code }) => /^131(?:0[1-9]|1[0-9]|2[0-3])$/.test(code)).length;
if (wardCount !== 23) throw new Error(`Expected Tokyo's 23 special wards, received ${wardCount}`);
console.log(`Japan map verified: 47 prefectures, ${municipalityCount} municipalities, Tokyo 23 special wards, checksums and gzip budgets valid.`);
