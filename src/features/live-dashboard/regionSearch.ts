import type { LiveDashboardPeriod, LiveDashboardScope } from "../../api/liveDashboard";

export type RegionSearchLevel = "admin1" | "admin2";

export interface RegionSearchEntry {
  code: string;
  level: RegionSearchLevel;
  parentCode: string;
  nameJa: string;
  breadcrumbJa: string[];
}

export interface RegionSearchIndex {
  countryCode: "JP";
  sourceVersion: "N03-20260101";
  regions: RegionSearchEntry[];
}

const INDEX_URL = "/maps/jp/2026/search-index.json";
const TOP_LEVEL_KEYS = ["countryCode", "sourceVersion", "regions"];
const ENTRY_KEYS = ["breadcrumbJa", "code", "level", "nameJa", "parentCode"];

function hasExactKeys(value: object, keys: string[]): boolean {
  return Object.keys(value).sort().join("\u0000") === [...keys].sort().join("\u0000");
}

function invalidIndex(): never {
  throw new Error("invalid_region_index");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRegionSearchIndex(value: unknown): RegionSearchIndex {
  if (!isRecord(value) || !hasExactKeys(value, TOP_LEVEL_KEYS) || value.countryCode !== "JP" || value.sourceVersion !== "N03-20260101" || !Array.isArray(value.regions)) {
    return invalidIndex();
  }

  if (value.regions.length !== 1965) return invalidIndex();
  const codes = new Set<string>();
  const admin1Codes = new Set<string>();
  let admin1Count = 0;
  let admin2Count = 0;
  const regions: RegionSearchEntry[] = [];

  for (const valueEntry of value.regions) {
    if (!isRecord(valueEntry) || !hasExactKeys(valueEntry, ENTRY_KEYS)) return invalidIndex();
    const { breadcrumbJa, code, level, nameJa, parentCode } = valueEntry;
    if ((level !== "admin1" && level !== "admin2") || typeof code !== "string" || typeof nameJa !== "string" || !nameJa) return invalidIndex();
    const validCode = level === "admin1" ? /^\d{2}$/u.test(code) : /^\d{5}$/u.test(code);
    const validParent = level === "admin1"
      ? parentCode === "JP"
      : typeof parentCode === "string" && /^\d{2}$/u.test(parentCode) && code.startsWith(parentCode);
    const expectedBreadcrumbLength = level === "admin1" ? 2 : 3;
    const validBreadcrumb = Array.isArray(breadcrumbJa)
      && breadcrumbJa.length === expectedBreadcrumbLength
      && breadcrumbJa.every((item) => typeof item === "string" && item.length > 0)
      && breadcrumbJa[0] === "日本"
      && breadcrumbJa.at(-1) === nameJa;
    if (!validCode || !validParent || !validBreadcrumb || codes.has(code)) return invalidIndex();

    if (level === "admin1") {
      admin1Count += 1;
      admin1Codes.add(code);
    } else {
      admin2Count += 1;
    }
    codes.add(code);
    regions.push({ code, level, parentCode: parentCode as string, nameJa, breadcrumbJa: [...breadcrumbJa] as string[] });
  }

  if (admin1Count !== 47 || admin2Count !== 1918) return invalidIndex();
  for (const region of regions) {
    if (region.level === "admin2" && !admin1Codes.has(region.parentCode)) return invalidIndex();
    if (region.level === "admin1" && region.breadcrumbJa[1] !== region.nameJa) return invalidIndex();
    if (region.level === "admin2") {
      const parent = regions.find((candidate) => candidate.code === region.parentCode);
      if (!parent || region.breadcrumbJa[1] !== parent.nameJa) return invalidIndex();
    }
  }
  return { countryCode: "JP", sourceVersion: "N03-20260101", regions };
}

export async function loadRegionSearchIndex(signal: AbortSignal): Promise<RegionSearchIndex> {
  const response = await fetch(INDEX_URL, { signal });
  if (!response.ok) throw new Error("error.dashboard.region_search_unavailable");
  return requireRegionSearchIndex(await response.json());
}

function normalize(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, "").toLowerCase();
}

function searchRank(entry: RegionSearchEntry, query: string): number | null {
  const name = normalize(entry.nameJa);
  const code = normalize(entry.code);
  if (name === query || code === query) return 0;
  if (name.startsWith(query) || code.startsWith(query)) return 1;
  if (name.includes(query) || code.includes(query)) return 2;
  return null;
}

export function searchRegions(index: RegionSearchIndex, query: string, limit = 12): RegionSearchEntry[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];
  const cappedLimit = Math.min(12, Math.max(0, Math.floor(limit)));
  return index.regions
    .map((entry) => ({ entry, rank: searchRank(entry, normalizedQuery) }))
    .filter((candidate): candidate is { entry: RegionSearchEntry; rank: number } => candidate.rank !== null)
    .sort((left, right) => left.rank - right.rank || (left.entry.level === right.entry.level ? 0 : left.entry.level === "admin1" ? -1 : 1) || left.entry.code.localeCompare(right.entry.code, "ja"))
    .slice(0, cappedLimit)
    .map(({ entry }) => entry);
}

export function scopeForRegion(entry: RegionSearchEntry, period: LiveDashboardPeriod): LiveDashboardScope {
  return entry.level === "admin1"
    ? { country: "JP", admin1: entry.code, period }
    : { country: "JP", admin1: entry.parentCode, admin2: entry.code, period };
}
