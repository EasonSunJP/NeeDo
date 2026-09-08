export type AdministrativeRegionLevel = "COUNTRY" | "ADMIN1" | "ADMIN2";

export interface AdministrativeRegionRef {
  countryCode: "JP";
  officialCode: string;
  level: AdministrativeRegionLevel;
  parentOfficialCode: string | null;
  nameJa: string;
  centroidLat: number | null;
  centroidLng: number | null;
  source: "MLIT N03";
  sourceVersion: "N03-20260101";
}

export interface AdministrativeRegionCatalog {
  version: "N03-20260101";
  sourceSha256: string;
  outputSha256: string;
  regions: AdministrativeRegionRef[];
}
