import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const read = (file: string) =>
  JSON.parse(fs.readFileSync(path.join(process.cwd(), file), "utf8")) as {
    insets?: Array<{ name: string; bounds: number[] }>;
    regions: Array<{ code: string; path: string }>;
  };

describe("Japan administrative map assets", () => {
  it("applies the returned simplified topology rather than discarding it", () => {
    const source = fs.readFileSync("scripts/build-jp-admin-map.mjs", "utf8");
    expect(source).toContain("return simplify(presimplify(data), SIMPLIFICATION_WEIGHT)");
  });

  it("represents every formal code, including designated-city unions, with stable hashes", () => {
    const catalog = JSON.parse(fs.readFileSync("backend/prisma/reference/jp-administrative-regions-2026.json", "utf8"));
    const manifest = JSON.parse(fs.readFileSync("public/maps/jp/2026/manifest.json", "utf8"));
    const codes: string[] = [];
    for (let index = 1; index <= 47; index++) {
      const asset = read(`public/maps/jp/2026/prefectures/${String(index).padStart(2, "0")}.json`);
      codes.push(...asset.regions.map(region => region.code));
    }
    expect(codes).toEqual(catalog.regions.filter((region: {level: string}) => region.level === "ADMIN2").map((region: {officialCode: string}) => region.officialCode).sort());
    expect(codes).toHaveLength(1918);
    expect(manifest.assets).toHaveLength(48);
    for (const asset of manifest.assets) {
      const bytes = fs.readFileSync(path.join("public", asset.url));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.sha256);
      expect(gzipSync(bytes).byteLength).toBe(asset.gzipBytes);
    }
    expect(execFileSync(process.execPath, ["scripts/check-jp-admin-map.mjs"], { encoding: "utf8" })).toContain("1918");
  });

  it("publishes 47 prefectures and Tokyo's 23 special wards", () => {
    const country = read("public/maps/jp/2026/country.json");
    const tokyo = read("public/maps/jp/2026/prefectures/13.json");

    expect(country.regions).toHaveLength(47);
    expect(
      tokyo.regions.filter(({ code }) => /^131(?:0[1-9]|1[0-9]|2[0-3])$/.test(code))
    ).toHaveLength(23);
    expect(country.regions.every(({ path: svgPath }) => svgPath.startsWith("M"))).toBe(true);
  });

  it("keeps Tokyo's 23 wards large enough for direct interaction while retaining islands", () => {
    const tokyo = read("public/maps/jp/2026/prefectures/13.json");
    const wardCoordinates = tokyo.regions
      .filter(({ code }) => /^131(?:0[1-9]|1[0-9]|2[0-3])$/.test(code))
      .flatMap(({ path: svgPath }) =>
        [...svgPath.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]))
      );
    const x = wardCoordinates.filter((_, index) => index % 2 === 0);
    const y = wardCoordinates.filter((_, index) => index % 2 === 1);

    expect(Math.max(...x) - Math.min(...x)).toBeGreaterThan(300);
    expect(Math.max(...y) - Math.min(...y)).toBeGreaterThan(200);
    expect(tokyo.regions.some(({ code }) => code.startsWith("133") || code.startsWith("134"))).toBe(true);
  });

  it("keeps a refined national coastline and a dedicated Okinawa inset", () => {
    const country = read("public/maps/jp/2026/country.json");
    const hokkaido = country.regions.find(({ code }) => code === "01");

    expect(country.insets).toContainEqual({ name: "Okinawa", bounds: [700, 930, 260, 230] });
    expect(hokkaido).toBeDefined();
    expect((hokkaido?.path.match(/[ML]/g) ?? []).length).toBeGreaterThan(180);
  });

  it("keeps generated assets inside approved gzip budgets", () => {
    const country = fs.readFileSync("public/maps/jp/2026/country.json");
    expect(gzipSync(country).byteLength).toBeLessThanOrEqual(600 * 1024);

    for (let code = 1; code <= 47; code += 1) {
      const file = fs.readFileSync(
        `public/maps/jp/2026/prefectures/${String(code).padStart(2, "0")}.json`
      );
      expect(gzipSync(file).byteLength).toBeLessThanOrEqual(500 * 1024);
    }
  });
});
