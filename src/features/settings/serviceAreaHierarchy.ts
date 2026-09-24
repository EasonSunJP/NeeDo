import { japanCityRecords, type JapanCityRecord } from "../../data/japanCityData";

const streetsByDistrictId: Record<string, string[]> = {
  "jp-municipality-13102": ["銀座", "東京駅"],
  "jp-municipality-13103": ["麻布十番", "六本木", "赤坂"],
  "jp-municipality-13104": ["新宿", "西新宿"],
  "jp-municipality-13109": ["品川"],
  "jp-municipality-13110": ["目黒", "中目黒"],
  "jp-municipality-13113": ["渋谷", "恵比寿"],
  "jp-municipality-13116": ["池袋"],
  "jp-ward-14104": ["山下町", "横浜"],
  "jp-ward-27127": ["梅田"],
  "jp-ward-27128": ["難波", "心斎橋"]
};

const existingStreetAliases: Record<string, string> = {
  银座: "銀座",
  涩谷: "渋谷",
  惠比寿: "恵比寿",
  目黑: "目黒",
  东京站: "東京駅",
  横滨: "横浜"
};

export type ServiceAreaPath = {
  prefecture: JapanCityRecord;
  district: JapanCityRecord;
  street: string;
};

export function getServiceAreaPrefectures() {
  return japanCityRecords.filter((item) => item.level === "prefecture");
}

export function getServiceAreaDistricts(prefectureId: string) {
  const prefecture = japanCityRecords.find((item) => item.id === prefectureId && item.level === "prefecture");
  if (!prefecture) return [];

  const parentIdsWithWards = new Set(japanCityRecords.filter((item) => item.level === "ward").map((item) => item.parentId));
  return japanCityRecords.filter((item) =>
    item.prefecture === prefecture.name
    && (item.level === "ward" || (item.level === "municipality" && !parentIdsWithWards.has(item.id)))
  );
}

export function getServiceAreaStreets(districtId: string) {
  return streetsByDistrictId[districtId] ?? [];
}

export function normalizeServiceStreet(value: string) {
  return existingStreetAliases[value.trim()] ?? value.trim();
}

export function findServiceAreaPath(savedArea: string): ServiceAreaPath | null {
  const value = savedArea.trim();
  const street = normalizeServiceStreet(value);
  if (!street) return null;

  const parts = value.split(/\s*[/／]\s*/u);
  if (parts.length === 3) {
    const prefecture = getServiceAreaPrefectures().find((item) => item.name === parts[0]);
    const district = prefecture && getServiceAreaDistricts(prefecture.id).find((item) => item.name === parts[1]);
    if (prefecture && district && parts[2]) return { prefecture, district, street: parts[2] };
  }

  const district = japanCityRecords.find((item) =>
    getServiceAreaStreets(item.id).includes(street) || (item.level !== "prefecture" && (item.name === value || item.displayName === value))
  );
  if (!district) return null;

  const prefecture = getServiceAreaPrefectures().find((item) => item.name === district.prefecture);
  return prefecture ? { prefecture, district, street: district.name === value ? "" : value } : null;
}
