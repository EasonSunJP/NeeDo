import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import catalog from "../prisma/reference/jp-administrative-regions-2026.json";

const levelOrder = { COUNTRY: 0, ADMIN1: 1, ADMIN2: 2 } as const;
type CatalogLevel = keyof typeof levelOrder;

it("contains the complete unique JP hierarchy in deterministic parent-first order", () => {
  expect(catalog.version).toBe("N03-20260101");
  expect(catalog.regions.filter((row) => row.level === "COUNTRY")).toHaveLength(1);
  expect(catalog.regions.filter((row) => row.level === "ADMIN1")).toHaveLength(47);
  expect(catalog.regions.filter((row) => row.level === "ADMIN2")).toHaveLength(1_918);

  const keys = catalog.regions.map((row) => `${row.countryCode}:${row.officialCode}`);
  expect(new Set(keys).size).toBe(catalog.regions.length);

  const regionByCode = new Map(catalog.regions.map((row) => [row.officialCode, row]));
  for (const row of catalog.regions) {
    if (row.level === "COUNTRY") {
      expect(row).toMatchObject({ officialCode: "JP", parentOfficialCode: null });
      continue;
    }

    const parent = regionByCode.get(row.parentOfficialCode ?? "");
    expect(parent).toBeDefined();
    expect(parent?.level).toBe(row.level === "ADMIN1" ? "COUNTRY" : "ADMIN1");
    if (row.level === "ADMIN2") {
      expect(row.officialCode.startsWith(row.parentOfficialCode ?? "missing-parent")).toBe(true);
    }
  }

  const sorted = [...catalog.regions].sort(
    (left, right) =>
      levelOrder[left.level as CatalogLevel] - levelOrder[right.level as CatalogLevel] ||
      left.officialCode.localeCompare(right.officialCode),
  );
  expect(catalog.regions).toEqual(sorted);
});

it("contains Tokyo and all 23 special wards", () => {
  expect(catalog.regions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ officialCode: "13", nameJa: "東京都", level: "ADMIN1" }),
      expect.objectContaining({ officialCode: "13104", nameJa: "新宿区", parentOfficialCode: "13" }),
    ]),
  );
  expect(
    catalog.regions.filter((row) => /^131(?:0[1-9]|1[0-9]|2[0-3])$/.test(row.officialCode)),
  ).toHaveLength(23);
});

it("pins the official source checksum and verifies the committed output checksum", () => {
  expect(catalog.sourceSha256).toBe(
    "3095bfbbafa89d791e19bed3488cbe31d048d227b7fea9e185aa208444337751",
  );
  expect(catalog.outputSha256).toBe(
    "7abf5ac67b1878ec3929d0faca307b3e0c14aac288ba5df5473d6557fb64625b",
  );

  const catalogPath = path.join(
    process.cwd(),
    "prisma/reference/jp-administrative-regions-2026.json",
  );
  const committed = JSON.parse(fs.readFileSync(catalogPath, "utf8")) as typeof catalog;
  const payload = `${JSON.stringify({ version: committed.version, regions: committed.regions }, null, 2)}\n`;
  expect(createHash("sha256").update(payload).digest("hex")).toBe(committed.outputSha256);
});
