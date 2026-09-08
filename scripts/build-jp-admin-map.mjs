import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { geoCentroid, geoMercator, geoPath } from "d3-geo";
import { chain } from "stream-chain";
import { parser } from "stream-json";
import { pick } from "stream-json/filters/pick.js";
import { streamArray } from "stream-json/streamers/stream-array.js";
import { feature as topologyFeature, merge as topologyMerge } from "topojson-client";
import { presimplify, simplify } from "topojson-simplify";
import { topology } from "topojson-server";

const SOURCE_VERSION = "N03-20260101";
const SOURCE_FILE = path.resolve(".data/n03/N03-20260101.geojson");
const CATALOG_FILE = path.resolve("backend/prisma/reference/jp-administrative-regions-2026.json");
const OUTPUT_DIR = path.resolve("public/maps/jp/2026");
const CACHE_DIR = path.resolve(".data/n03/map-build-cache-v1");
const VIEW_BOX = [0, 0, 1000, 800];
const COUNTRY_VIEW_BOX = [0, 0, 1000, 1200];
const QUANTIZATION = 1_000_000;
const SIMPLIFICATION_WEIGHT = 2.5e-7;
const GENERATOR_VERSION = "1.4.0";
const PREFECTURE_CACHE_VERSION = "1.3.0";
const GENERATED_AT = "2026-09-06T00:00:00.000Z";

const sha256 = async (file) => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
};
const stableJson = (value) => `${JSON.stringify(value)}\n`;
const asMultiPolygonCoordinates = (geometry) => {
  if (geometry?.type === "Polygon") return [geometry.coordinates];
  if (geometry?.type === "MultiPolygon") return geometry.coordinates;
  throw new Error(`Unsupported N03 geometry: ${geometry?.type ?? "missing"}`);
};
const makeFeature = (code, nameJa, polygons) => ({
  type: "Feature",
  properties: { code, nameJa },
  geometry: { type: "MultiPolygon", coordinates: polygons }
});
const simplifyFeatures = (features) => {
  const data = topology({ regions: { type: "FeatureCollection", features } }, QUANTIZATION);
  return simplify(presimplify(data), SIMPLIFICATION_WEIGHT);
};

const squaredDistanceToSegment = (point, start, end) => {
  let x = start[0];
  let y = start[1];
  let dx = end[0] - x;
  let dy = end[1] - y;
  if (dx !== 0 || dy !== 0) {
    const ratio = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
    if (ratio > 1) {
      x = end[0];
      y = end[1];
    } else if (ratio > 0) {
      x += dx * ratio;
      y += dy * ratio;
    }
  }
  dx = point[0] - x;
  dy = point[1] - y;
  return dx * dx + dy * dy;
};
const simplifyProjectedRing = (points, tolerance) => {
  const last = points.at(-1);
  const open = points.length > 1 && points[0][0] === last[0] && points[0][1] === last[1]
    ? points.slice(0, -1)
    : points;
  if (open.length <= 3) return open;
  const keep = new Uint8Array(open.length);
  keep[0] = 1;
  keep[open.length - 1] = 1;
  const stack = [[0, open.length - 1]];
  const threshold = tolerance * tolerance;
  while (stack.length > 0) {
    const [start, end] = stack.pop();
    let greatest = threshold;
    let index = -1;
    for (let cursor = start + 1; cursor < end; cursor += 1) {
      const distance = squaredDistanceToSegment(open[cursor], open[start], open[end]);
      if (distance > greatest) {
        greatest = distance;
        index = cursor;
      }
    }
    if (index !== -1) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  const simplified = open.filter((_, index) => keep[index]);
  return simplified.length >= 3 ? simplified : open.slice(0, 3);
};
const ringArea = (ring) => Math.abs(ring.reduce((sum, point, index) => {
  const next = ring[(index + 1) % ring.length];
  return sum + point[0] * next[1] - next[0] * point[1];
}, 0) / 2);
const compactProjectedPath = (
  geometry,
  projection,
  tolerance,
  { maxPolygons = 24, minimumArea = 0.35, minimumHoleArea = 0.1 } = {}
) => {
  const projectedPolygons = asMultiPolygonCoordinates(geometry).map((polygon) => {
    const rings = polygon.map((ring) => simplifyProjectedRing(ring.map((point) => projection(point)).filter(Boolean), tolerance));
    return { rings, area: rings[0]?.length >= 3 ? ringArea(rings[0]) : 0 };
  });
  const retained = projectedPolygons
    .sort((left, right) => right.area - left.area)
    .filter((polygon, index) => index < maxPolygons || polygon.area >= minimumArea);
  const format = (value) => Number(value.toFixed(2));
  return retained.flatMap(({ rings }) => rings
    .filter((ring, index) => ring.length >= 3 && (index === 0 || ringArea(ring) >= minimumHoleArea))
    .map((ring) => `M${ring.map(([x, y]) => `${format(x)},${format(y)}`).join("L")}Z`))
    .join("");
};

const macroRegionFor = (code) => {
  const value = Number(code);
  if (value === 1) return "hokkaido";
  if (value <= 7) return "tohoku";
  if (value <= 14) return "kanto";
  if (value <= 23) return "chubu";
  if (value <= 30) return "kansai";
  if (value <= 35) return "chugoku";
  if (value <= 39) return "shikoku";
  return "kyushu-okinawa";
};

const projectJapanRegions = (features) => {
  const mainRegions = features.filter(({ properties }) => properties.code !== "47");
  const okinawa = features.find(({ properties }) => properties.code === "47");
  if (!okinawa) throw new Error("Japan map requires Okinawa prefecture geometry");
  const fitRegions = mainRegions.map((region) => ({
    ...region,
    geometry: {
      type: "MultiPolygon",
      coordinates: asMultiPolygonCoordinates(region.geometry).filter((polygon) =>
        polygon[0]?.some(([, latitude]) => latitude >= 30)
      )
    }
  }));
  const mainProjection = geoMercator().fitExtent(
    [[35, 20], [965, 1165]],
    { type: "FeatureCollection", features: fitRegions }
  );
  const okinawaProjection = geoMercator().fitExtent(
    [[720, 955], [940, 1140]],
    okinawa
  );
  const render = (region, projection) => {
    const svgPath = compactProjectedPath(region.geometry, projection, 0.45, {
      maxPolygons: 64,
      minimumArea: 0.02,
      minimumHoleArea: 0.02
    });
    const point = projection(geoCentroid(region));
    return {
      code: region.properties.code,
      parentCode: "JP",
      nameJa: region.properties.nameJa,
      macroRegion: macroRegionFor(region.properties.code),
      path: svgPath,
      labelPoint: point ? [Number(point[0].toFixed(2)), Number(point[1].toFixed(2))] : null
    };
  };
  return {
    countryCode: "JP",
    sourceVersion: SOURCE_VERSION,
    level: "admin1",
    parentCode: "JP",
    viewBox: COUNTRY_VIEW_BOX,
    insets: [{ name: "Okinawa", bounds: [700, 930, 260, 230] }],
    regions: [
      ...mainRegions.map((region) => render(region, mainProjection)),
      render(okinawa, okinawaProjection)
    ].sort((left, right) => left.code.localeCompare(right.code))
  };
};

const projectRegions = ({ features, level, parentCode, viewBox, compactTolerance = null }) => {
  const collection = { type: "FeatureCollection", features };
  const [, , width, height] = viewBox;
  const projection = geoMercator().fitExtent([[20, 20], [width - 20, height - 20]], collection);
  const renderPath = geoPath(projection).digits(2);
  return {
    countryCode: "JP",
    sourceVersion: SOURCE_VERSION,
    level,
    parentCode,
    viewBox,
    regions: features.map((region) => {
      const svgPath = compactTolerance
        ? compactProjectedPath(region.geometry, projection, compactTolerance)
        : renderPath(region);
      if (!svgPath?.startsWith("M")) throw new Error(`Invalid projected path for ${region.properties.code}`);
      const point = projection(geoCentroid(region));
      return {
        code: region.properties.code,
        parentCode,
        nameJa: region.properties.nameJa,
        path: svgPath,
        labelPoint: point ? [Number(point[0].toFixed(2)), Number(point[1].toFixed(2))] : null
      };
    }).sort((left, right) => left.code.localeCompare(right.code))
  };
};

const projectTokyoRegions = (features) => {
  const mainland = features.filter(({ properties }) => /^13[12]/u.test(properties.code));
  const islands = features.filter(({ properties }) => /^13[34]/u.test(properties.code));
  if (mainland.length === 0 || islands.length === 0) throw new Error("Tokyo inset requires mainland and island regions");
  const makeProjection = (subset, extent) =>
    geoMercator().fitExtent(extent, { type: "FeatureCollection", features: subset });
  const mainlandProjection = makeProjection(mainland, [[20, 20], [980, 590]]);
  const islandProjection = makeProjection(islands, [[180, 630], [820, 780]]);
  const render = (region, projection) => {
    const svgPath = compactProjectedPath(region.geometry, projection, 0.5);
    if (!svgPath.startsWith("M")) throw new Error(`Invalid projected path for ${region.properties.code}`);
    const point = projection(geoCentroid(region));
    return {
      code: region.properties.code,
      parentCode: "13",
      nameJa: region.properties.nameJa,
      path: svgPath,
      labelPoint: point ? [Number(point[0].toFixed(2)), Number(point[1].toFixed(2))] : null
    };
  };
  return {
    countryCode: "JP",
    sourceVersion: SOURCE_VERSION,
    level: "admin2",
    parentCode: "13",
    viewBox: VIEW_BOX,
    insets: [{ name: "Tokyo islands", bounds: [180, 630, 640, 150] }],
    regions: [
      ...mainland.map((region) => render(region, mainlandProjection)),
      ...islands.map((region) => render(region, islandProjection))
    ].sort((left, right) => left.code.localeCompare(right.code))
  };
};

const processPrefecture = async ({ admin1Code, grouped, catalogByCode, countryFeatures, sourceHash }) => {
  const prefectureFile = path.join(OUTPUT_DIR, "prefectures", `${admin1Code}.json`);
  const cacheFile = path.join(CACHE_DIR, `${admin1Code}.json`);
  const cacheKey = `${sourceHash}:${QUANTIZATION}:${SIMPLIFICATION_WEIGHT}:${PREFECTURE_CACHE_VERSION}`;
  try {
    const cached = JSON.parse(await fs.readFile(cacheFile, "utf8"));
    await fs.access(prefectureFile);
    if (cached.cacheKey === cacheKey && cached.countryFeature?.properties?.code === admin1Code) {
      countryFeatures.push(cached.countryFeature);
      return prefectureFile;
    }
  } catch {}

  const municipalityFeatures = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([code, polygons]) => {
    const catalog = catalogByCode.get(code);
    if (!catalog) throw new Error(`N03 code ${code} is absent from the formal catalog`);
    return makeFeature(code, catalog.nameJa, polygons);
  });
  const expectedCodes = [...catalogByCode.values()]
    .filter((region) => region.level === "ADMIN2" && region.parentOfficialCode === admin1Code)
    .map((region) => region.officialCode).sort();
  const actualCodes = municipalityFeatures.map((item) => item.properties.code);
  const actualCodeSet = new Set(actualCodes);
  const isAggregateDesignatedCity = (code) => {
    const aggregate = catalogByCode.get(code);
    const prefix = code.replace(/0+$/u, "");
    return prefix.length >= 3 && actualCodes.some((actual) => {
      const child = catalogByCode.get(actual);
      return actual !== code && actual.startsWith(prefix) && child?.nameJa.startsWith(aggregate?.nameJa ?? "\0") && child.nameJa !== aggregate.nameJa;
    });
  };
  const missingCodes = expectedCodes.filter((code) => !actualCodeSet.has(code) && !isAggregateDesignatedCity(code));
  if (missingCodes.length > 0) throw new Error(`Missing N03 codes for ${admin1Code}: ${missingCodes.join(",")}`);

  const simplified = simplifyFeatures(municipalityFeatures);
  const simplifiedCollection = topologyFeature(simplified, simplified.objects.regions);
  const aggregateFeatures = expectedCodes
    .filter((code) => !actualCodeSet.has(code) && isAggregateDesignatedCity(code))
    .map((code) => {
      const aggregate = catalogByCode.get(code);
      const prefix = code.replace(/0+$/u, "");
      const children = simplified.objects.regions.geometries.filter((geometry) => {
        const childCode = geometry.properties?.code;
        const child = catalogByCode.get(childCode);
        return childCode?.startsWith(prefix) && child?.nameJa.startsWith(aggregate.nameJa) && child.nameJa !== aggregate.nameJa;
      });
      if (children.length === 0) throw new Error(`Designated-city union ${code} has no child geometry`);
      return { type: "Feature", properties: { code, nameJa: aggregate.nameJa }, geometry: topologyMerge(simplified, children) };
    });
  const projectedFeatures = [...simplifiedCollection.features, ...aggregateFeatures];
  const projected = admin1Code === "13"
    ? projectTokyoRegions(projectedFeatures)
    : projectRegions({
        features: projectedFeatures,
        level: "admin2",
        parentCode: admin1Code,
        viewBox: VIEW_BOX,
        compactTolerance: 0.5
      });
  await fs.writeFile(prefectureFile, stableJson(projected));
  const admin1 = catalogByCode.get(admin1Code);
  const countryFeature = {
    type: "Feature",
    properties: { code: admin1Code, nameJa: admin1.nameJa },
    geometry: topologyMerge(simplified, simplified.objects.regions.geometries)
  };
  countryFeatures.push(countryFeature);
  await fs.writeFile(cacheFile, stableJson({ cacheKey, countryFeature }));
  return prefectureFile;
};

const main = async () => {
  const catalog = JSON.parse(await fs.readFile(CATALOG_FILE, "utf8"));
  if (catalog.version !== SOURCE_VERSION) throw new Error(`Catalog version ${catalog.version} does not match ${SOURCE_VERSION}`);
  const sourceHash = await sha256(SOURCE_FILE);
  if (sourceHash !== catalog.sourceSha256) throw new Error(`Source SHA-256 mismatch: expected ${catalog.sourceSha256}, received ${sourceHash}`);
  const catalogByCode = new Map(catalog.regions.map((region) => [region.officialCode, region]));
  const expectedAdmin1 = catalog.regions.filter((region) => region.level === "ADMIN1");
  if (expectedAdmin1.length !== 47) throw new Error(`Expected 47 prefectures, received ${expectedAdmin1.length}`);
  await fs.mkdir(path.join(OUTPUT_DIR, "prefectures"), { recursive: true });
  await fs.mkdir(CACHE_DIR, { recursive: true });

  const cacheKey = `${sourceHash}:${QUANTIZATION}:${SIMPLIFICATION_WEIGHT}:${PREFECTURE_CACHE_VERSION}`;
  const cachedAdmin1Codes = new Set();
  for (const region of expectedAdmin1) {
    try {
      const code = region.officialCode;
      const cached = JSON.parse(await fs.readFile(path.join(CACHE_DIR, `${code}.json`), "utf8"));
      await fs.access(path.join(OUTPUT_DIR, "prefectures", `${code}.json`));
      if (cached.cacheKey === cacheKey && cached.countryFeature?.properties?.code === code) cachedAdmin1Codes.add(code);
    } catch {}
  }

  const countryFeatures = [];
  const prefectureFiles = [];
  let sourceFeatureCount = 0;
  if (process.argv.includes("--country-only")) {
    if (cachedAdmin1Codes.size !== 47) throw new Error("Country-only generation requires all 47 verified cache entries");
    for (const region of expectedAdmin1) {
      const code = region.officialCode;
      const cached = JSON.parse(await fs.readFile(path.join(CACHE_DIR, `${code}.json`), "utf8"));
      countryFeatures.push(cached.countryFeature);
      prefectureFiles.push(path.join(OUTPUT_DIR, "prefectures", `${code}.json`));
    }
    try {
      sourceFeatureCount = (JSON.parse(await fs.readFile(path.join(OUTPUT_DIR, "manifest.json"), "utf8"))).sourceFeatureCount;
    } catch {
      throw new Error("Country-only generation requires the prior verified manifest feature count");
    }
  } else {
    let currentAdmin1 = null;
    let grouped = new Map();
    let lastAdmin1 = "00";
    const input = chain([createReadStream(SOURCE_FILE), parser(), pick({ filter: "features" }), streamArray()]);
    for await (const { value } of input) {
      sourceFeatureCount += 1;
      const code = value?.properties?.N03_007;
      if (typeof code !== "string" || !/^\d{5}$/.test(code)) continue;
      if (!catalogByCode.has(code)) {
        if (value?.properties?.N03_004 === "所属未定地") continue;
        throw new Error(`N03 code ${code} is absent from the formal catalog`);
      }
      const admin1Code = code.slice(0, 2);
      if (admin1Code < lastAdmin1) throw new Error("N03 features are not ordered by prefecture code");
      if (currentAdmin1 && admin1Code !== currentAdmin1) {
        prefectureFiles.push(await processPrefecture({ admin1Code: currentAdmin1, grouped, catalogByCode, countryFeatures, sourceHash }));
        grouped = new Map();
      }
      currentAdmin1 = admin1Code;
      lastAdmin1 = admin1Code;
      if (!cachedAdmin1Codes.has(admin1Code)) {
        const polygons = grouped.get(code) ?? [];
        polygons.push(...asMultiPolygonCoordinates(value.geometry));
        grouped.set(code, polygons);
      }
    }
    if (currentAdmin1) prefectureFiles.push(await processPrefecture({ admin1Code: currentAdmin1, grouped, catalogByCode, countryFeatures, sourceHash }));
  }
  if (countryFeatures.length !== 47) throw new Error(`Expected 47 generated prefectures, received ${countryFeatures.length}`);

  const countryAsset = projectJapanRegions(countryFeatures);
  const countryFile = path.join(OUTPUT_DIR, "country.json");
  await fs.writeFile(countryFile, stableJson(countryAsset));
  const outputFiles = [countryFile, ...prefectureFiles].sort();
  const assets = [];
  for (const file of outputFiles) {
    const bytes = await fs.readFile(file);
    assets.push({
      url: `/${path.relative(path.resolve("public"), file).split(path.sep).join("/")}`,
      sha256: await sha256(file),
      bytes: bytes.length,
      gzipBytes: gzipSync(bytes).byteLength
    });
  }
  await fs.writeFile(path.join(OUTPUT_DIR, "manifest.json"), stableJson({
    countryCode: "JP", source: "MLIT N03", sourceVersion: SOURCE_VERSION,
    sourceUrl: "https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N03-2026.html",
    sourceSha256: sourceHash, generatorVersion: GENERATOR_VERSION, generatedAt: GENERATED_AT,
    projection: { type: "geoMercator.fitExtent", countryViewBox: COUNTRY_VIEW_BOX, prefectureViewBox: VIEW_BOX, countryPathTolerancePx: 0.45, prefecturePathTolerancePx: 0.5, insets: ["Okinawa", "Tokyo islands"] },
    topology: { quantization: QUANTIZATION, simplificationWeight: SIMPLIFICATION_WEIGHT },
    sourceFeatureCount, assets
  }));
  console.log(`Generated ${countryFeatures.length} prefectures and ${prefectureFiles.length} municipality assets from ${sourceFeatureCount} N03 features.`);
};

await main();
