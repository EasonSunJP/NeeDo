import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CATALOG_FILE = path.resolve("backend/prisma/reference/jp-administrative-regions-2026.json");
const OUTPUT_FILE = path.resolve("public/maps/jp/2026/search-index.json");

export function buildRegionSearchIndex(catalog) {
  if (catalog.version !== "N03-20260101") throw new Error("Unexpected N03 catalog version");
  const byCode = new Map(catalog.regions.map((item) => [item.officialCode, item]));
  const country = byCode.get("JP");
  if (!country) throw new Error("Japan catalog entry is missing");
  const regions = catalog.regions
    .filter((item) => item.level === "ADMIN1" || item.level === "ADMIN2")
    .map((item) => {
      const parent = item.level === "ADMIN2" ? byCode.get(item.parentOfficialCode) : null;
      if (item.level === "ADMIN2" && !parent) throw new Error(`Missing parent for ${item.officialCode}`);
      return {
        code: item.officialCode,
        level: item.level === "ADMIN1" ? "admin1" : "admin2",
        parentCode: item.parentOfficialCode,
        nameJa: item.nameJa,
        breadcrumbJa: [country.nameJa, ...(parent ? [parent.nameJa] : []), item.nameJa]
      };
    })
    .sort((left, right) => left.code.localeCompare(right.code));
  return { countryCode: "JP", sourceVersion: catalog.version, regions };
}

async function main() {
  const catalog = JSON.parse(await fs.readFile(CATALOG_FILE, "utf8"));
  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(buildRegionSearchIndex(catalog))}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
