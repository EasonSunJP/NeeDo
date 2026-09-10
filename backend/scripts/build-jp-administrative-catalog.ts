import { createHash } from "node:crypto";
import { createReadStream, existsSync, promises as fs } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import {
  japanCityRecords,
  type JapanCityRecord,
} from "../../src/data/japanCityData";
import type {
  AdministrativeRegionCatalog,
  AdministrativeRegionRef,
} from "../src/domain/administrative-region";

const SOURCE = "MLIT N03" as const;
const SOURCE_VERSION = "N03-20260101" as const;
const SOURCE_PATH = path.resolve(process.cwd(), "../.data/n03/N03-20260101.geojson");
const OUTPUT_PATH = path.resolve(
  process.cwd(),
  "prisma/reference/jp-administrative-regions-2026.json",
);
const OFFICIAL_CODE_PATTERN = /^\d{5}$/;

interface N03Properties {
  N03_001: string;
  N03_004: string;
  N03_005: string | null;
  N03_007: string;
}

interface N03Region {
  officialCode: string;
  prefectureName: string;
  municipalityName: string;
  nameJa: string;
}

const sha256 = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex");

const extractProperties = (line: string): unknown => {
  const propertiesMarker = '"properties":';
  const propertiesMarkerIndex = line.indexOf(propertiesMarker);
  const geometryMarkerIndex = line.indexOf(', "geometry"', propertiesMarkerIndex);

  if (propertiesMarkerIndex < 0 || geometryMarkerIndex < 0) {
    throw new Error("Invalid N03 feature: properties or geometry marker is missing.");
  }

  const propertiesStart = line.indexOf("{", propertiesMarkerIndex + propertiesMarker.length);
  if (propertiesStart < 0 || propertiesStart >= geometryMarkerIndex) {
    throw new Error("Invalid N03 feature: properties object is missing.");
  }

  return JSON.parse(line.slice(propertiesStart, geometryMarkerIndex));
};

const requireNullableString = (
  value: unknown,
  field: keyof N03Properties,
  officialCode?: string,
): string | null => {
  if (value === null || typeof value === "string") {
    return value;
  }

  throw new Error(
    `Invalid N03 ${field}${officialCode ? ` for ${officialCode}` : ""}: expected string or null.`,
  );
};

const parseN03Properties = (value: unknown): N03Properties => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid N03 feature properties.");
  }

  const properties = value as Record<string, unknown>;
  const officialCode = requireNullableString(properties.N03_007, "N03_007");
  if (!officialCode || !OFFICIAL_CODE_PATTERN.test(officialCode)) {
    throw new Error(`Invalid N03_007 official code: ${String(officialCode)}.`);
  }

  const prefectureName = requireNullableString(properties.N03_001, "N03_001", officialCode);
  const municipalityName = requireNullableString(properties.N03_004, "N03_004", officialCode);
  const wardName = requireNullableString(properties.N03_005, "N03_005", officialCode);
  if (!prefectureName || !municipalityName) {
    throw new Error(`Invalid N03 names for ${officialCode}.`);
  }

  return {
    N03_001: prefectureName,
    N03_004: municipalityName,
    N03_005: wardName,
    N03_007: officialCode,
  };
};

const addN03Region = (regions: Map<string, N03Region>, properties: N03Properties): void => {
  const region: N03Region = {
    officialCode: properties.N03_007,
    prefectureName: properties.N03_001,
    municipalityName: properties.N03_004,
    nameJa: properties.N03_005
      ? `${properties.N03_004}${properties.N03_005}`
      : properties.N03_004,
  };
  const existing = regions.get(region.officialCode);

  if (existing && JSON.stringify(existing) !== JSON.stringify(region)) {
    throw new Error(`Conflicting N03 properties for ${region.officialCode}.`);
  }

  regions.set(region.officialCode, region);
};

const readN03Regions = async (): Promise<{
  regions: Map<string, N03Region>;
  sourceSha256: string;
}> => {
  if (!existsSync(SOURCE_PATH)) {
    throw new Error(`N03 source does not exist: ${SOURCE_PATH}`);
  }

  const sourceHash = createHash("sha256");
  const sourceStream = createReadStream(SOURCE_PATH);
  sourceStream.on("data", (chunk) => sourceHash.update(chunk));
  const lines = readline.createInterface({ input: sourceStream, crlfDelay: Infinity });
  const regions = new Map<string, N03Region>();
  let hasExpectedCollectionName = false;
  let featureCount = 0;

  for await (const line of lines) {
    if (line.includes(`"name": "${SOURCE_VERSION}"`)) {
      hasExpectedCollectionName = true;
    }
    if (!line.includes('"N03_007"')) {
      continue;
    }

    featureCount += 1;
    addN03Region(regions, parseN03Properties(extractProperties(line)));
  }

  if (!hasExpectedCollectionName || featureCount === 0) {
    throw new Error(`Invalid N03 source collection for ${SOURCE_VERSION}.`);
  }

  return { regions, sourceSha256: sourceHash.digest("hex") };
};

const buildCoordinateIndex = (): Map<string, JapanCityRecord> => {
  const index = new Map<string, JapanCityRecord>();

  for (const record of japanCityRecords) {
    if (index.has(record.jisCode)) {
      throw new Error(`Duplicate centroid record for ${record.jisCode}.`);
    }
    index.set(record.jisCode, record);
  }

  return index;
};

const toRegionRef = (
  record: JapanCityRecord,
  level: "ADMIN1" | "ADMIN2",
  officialCode: string,
  parentOfficialCode: string,
  nameJa: string,
): AdministrativeRegionRef => ({
  countryCode: "JP",
  officialCode,
  level,
  parentOfficialCode,
  nameJa,
  centroidLat: record.latitude,
  centroidLng: record.longitude,
  source: SOURCE,
  sourceVersion: SOURCE_VERSION,
});

const resolveAdministrativeRegions = (
  n03Regions: Map<string, N03Region>,
): AdministrativeRegionRef[] => {
  const coordinateIndex = buildCoordinateIndex();
  const prefectureNames = new Map<string, string>();

  for (const region of n03Regions.values()) {
    const prefectureCode = region.officialCode.slice(0, 2);
    const existingName = prefectureNames.get(prefectureCode);
    if (existingName && existingName !== region.prefectureName) {
      throw new Error(`Conflicting prefecture names for ${prefectureCode}.`);
    }
    prefectureNames.set(prefectureCode, region.prefectureName);
  }

  const prefectures = japanCityRecords.filter((record) => record.level === "prefecture");
  const admin2Records = japanCityRecords.filter((record) => record.level !== "prefecture");
  if (prefectures.length !== 47 || admin2Records.length !== 1_918) {
    throw new Error("Centroid catalogue must contain 47 prefectures and 1918 ADMIN2 regions.");
  }

  const regions: AdministrativeRegionRef[] = [
    {
      countryCode: "JP",
      officialCode: "JP",
      level: "COUNTRY",
      parentOfficialCode: null,
      nameJa: "日本",
      centroidLat: null,
      centroidLng: null,
      source: SOURCE,
      sourceVersion: SOURCE_VERSION,
    },
  ];

  for (const prefecture of prefectures) {
    const officialCode = prefecture.jisCode.slice(0, 2);
    const n03Name = prefectureNames.get(officialCode);
    if (!n03Name || n03Name !== prefecture.name) {
      throw new Error(`N03 prefecture does not match centroid record ${officialCode}.`);
    }
    regions.push(toRegionRef(prefecture, "ADMIN1", officialCode, "JP", n03Name));
  }

  for (const record of admin2Records) {
    const n03Region = n03Regions.get(record.jisCode);
    if (n03Region) {
      if (n03Region.prefectureName !== record.prefecture) {
        throw new Error(`N03 region does not match centroid record ${record.jisCode}.`);
      }
    } else {
      const hasN03Ward = [...n03Regions.values()].some(
        (region) =>
          region.prefectureName === record.prefecture &&
          region.municipalityName === record.name &&
          region.nameJa !== region.municipalityName,
      );
      if (record.level !== "municipality" || !hasN03Ward) {
        throw new Error(`N03 region is missing for centroid record ${record.jisCode}.`);
      }
    }

    regions.push(
      toRegionRef(
        record,
        "ADMIN2",
        record.jisCode,
        record.jisCode.slice(0, 2),
        n03Region?.nameJa ?? record.name,
      ),
    );
  }

  for (const n03Region of n03Regions.values()) {
    if (coordinateIndex.has(n03Region.officialCode)) {
      continue;
    }
    if (n03Region.municipalityName !== "所属未定地") {
      throw new Error(`N03 region has no approved centroid record: ${n03Region.officialCode}.`);
    }
  }

  const levelOrder = { COUNTRY: 0, ADMIN1: 1, ADMIN2: 2 } as const;
  return regions.sort(
    (left, right) =>
      levelOrder[left.level] - levelOrder[right.level] ||
      left.officialCode.localeCompare(right.officialCode),
  );
};

const serializeCatalog = (sourceSha256: string, regions: AdministrativeRegionRef[]): string => {
  const outputPayload = `${JSON.stringify({ version: SOURCE_VERSION, regions }, null, 2)}\n`;
  const catalog: AdministrativeRegionCatalog = {
    version: SOURCE_VERSION,
    sourceSha256,
    outputSha256: sha256(outputPayload),
    regions,
  };
  return `${JSON.stringify(catalog, null, 2)}\n`;
};

const buildCatalog = async (): Promise<string> => {
  const { regions: n03Regions, sourceSha256 } = await readN03Regions();
  return serializeCatalog(sourceSha256, resolveAdministrativeRegions(n03Regions));
};

const run = async (): Promise<void> => {
  const expected = await buildCatalog();
  const verify = process.argv.includes("--verify");

  if (verify) {
    const actual = await fs.readFile(OUTPUT_PATH, "utf8");
    if (actual !== expected) {
      throw new Error(`Administrative catalogue is stale: ${OUTPUT_PATH}`);
    }
  } else {
    await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await fs.writeFile(OUTPUT_PATH, expected, "utf8");
  }

  console.log(
    `Administrative catalogue verified: JP, 47 ADMIN1 regions, 1918 ADMIN2 regions, ${SOURCE_VERSION}`,
  );
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
