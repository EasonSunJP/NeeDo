export type Coordinates = {
  lat: number;
  lng: number;
};

export type LocationAreaOption = {
  id: string;
  label: string;
  city: string;
  area: string;
  district?: string;
  coordinates?: Coordinates;
};

const BROAD_AREA_HINTS = new Set(["东京", "东京都", "东京23区", "东京 23 区", "日本", "日本东京"].map(normalizeAreaHint));

export const AREA_COORDINATES: Record<string, Coordinates> = {
  银座: { lat: 35.6717, lng: 139.765 },
  有乐町: { lat: 35.6751, lng: 139.7637 },
  筑地: { lat: 35.6655, lng: 139.7708 },
  东京站: { lat: 35.6812, lng: 139.7671 },
  日本桥: { lat: 35.6828, lng: 139.7741 },
  丸之内: { lat: 35.6817, lng: 139.7649 },
  六本木: { lat: 35.6628, lng: 139.731 },
  赤坂: { lat: 35.6712, lng: 139.7365 },
  麻布十番: { lat: 35.6555, lng: 139.7367 },
  港区: { lat: 35.6581, lng: 139.7516 },
  东京塔: { lat: 35.6586, lng: 139.7454 },
  涩谷: { lat: 35.6598, lng: 139.7006 },
  涩谷区: { lat: 35.6618, lng: 139.7041 },
  原宿: { lat: 35.6702, lng: 139.7027 },
  表参道: { lat: 35.665, lng: 139.7123 },
  三轩茶屋: { lat: 35.6439, lng: 139.6684 },
  下北泽: { lat: 35.6618, lng: 139.6684 },
  新宿: { lat: 35.6938, lng: 139.7034 },
  新宿区: { lat: 35.6938, lng: 139.7034 },
  西新宿: { lat: 35.6896, lng: 139.6917 },
  新大久保: { lat: 35.7013, lng: 139.7004 },
  歌舞伎町: { lat: 35.694, lng: 139.7036 },
  四谷: { lat: 35.6861, lng: 139.7302 },
  中野: { lat: 35.7074, lng: 139.6638 },
  杉并: { lat: 35.6995, lng: 139.6364 },
  池袋: { lat: 35.7295, lng: 139.7109 },
  高田马场: { lat: 35.7127, lng: 139.7038 },
  早稻田: { lat: 35.7086, lng: 139.7213 },
  上野: { lat: 35.7138, lng: 139.7773 },
  文京: { lat: 35.708, lng: 139.7526 },
  惠比寿: { lat: 35.6467, lng: 139.7101 },
  代官山: { lat: 35.648, lng: 139.7033 },
  广尾: { lat: 35.652, lng: 139.7229 },
  目黑: { lat: 35.6339, lng: 139.7157 },
  目黑区: { lat: 35.6415, lng: 139.6982 },
  中目黑: { lat: 35.6443, lng: 139.699 },
  白金台: { lat: 35.6375, lng: 139.7268 },
  品川: { lat: 35.6285, lng: 139.7387 },
  大崎: { lat: 35.6197, lng: 139.7286 },
  丰洲: { lat: 35.6547, lng: 139.7955 },
  台场: { lat: 35.6272, lng: 139.7768 },
  月岛: { lat: 35.6644, lng: 139.7847 },
  吉祥寺: { lat: 35.7033, lng: 139.5796 },
  三鹰: { lat: 35.7027, lng: 139.5606 },
  荻窪: { lat: 35.7045, lng: 139.6201 },
  横滨: { lat: 35.4437, lng: 139.638 },
  中区: { lat: 35.4442, lng: 139.642 },
  山下町: { lat: 35.4431, lng: 139.6501 },
  川崎: { lat: 35.5308, lng: 139.7036 },
  武藏小杉: { lat: 35.5764, lng: 139.6597 },
  大阪市: { lat: 34.6937, lng: 135.5023 },
  梅田: { lat: 34.7055, lng: 135.4983 },
  难波: { lat: 34.667, lng: 135.5001 }
};

const normalizedAreaCoordinates = new Map(
  Object.entries(AREA_COORDINATES).map(([area, coords]) => [normalizeAreaHint(area), coords])
);

export function normalizeAreaHint(value: string) {
  return value.replace(/\s+/g, "").toLowerCase();
}

export function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}

export function extractAreaHints(value?: string) {
  if (!value) {
    return [];
  }

  return uniqueStrings(
    value
      .split(/[·/、，,｜|]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .filter((item) => !BROAD_AREA_HINTS.has(normalizeAreaHint(item)))
  );
}

export function getLocationAreaHints(location?: LocationAreaOption) {
  if (!location) {
    return [];
  }

  return uniqueStrings([location.district, location.area, location.city, location.label].flatMap((value) => extractAreaHints(value)));
}

export function resolveAreaCoordinates(areaHint: string) {
  return normalizedAreaCoordinates.get(normalizeAreaHint(areaHint));
}

export function distanceInKm(left: Coordinates, right: Coordinates) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(right.lat - left.lat);
  const dLng = toRadians(right.lng - left.lng);
  const lat1 = toRadians(left.lat);
  const lat2 = toRadians(right.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function doAreaHintsMatch(left: string, right: string) {
  const normalizedLeft = normalizeAreaHint(left);
  const normalizedRight = normalizeAreaHint(right);

  return normalizedLeft === normalizedRight || normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft);
}

export function getNearestLocationOptionId(locations: LocationAreaOption[], coords: Coordinates) {
  const scored = locations
    .map((location) => {
      const locationCoords =
        location.coordinates ??
        getLocationAreaHints(location)
          .map(resolveAreaCoordinates)
          .find(Boolean);

      return locationCoords
        ? {
            id: location.id,
            distance: distanceInKm(coords, locationCoords)
          }
        : null;
    })
    .filter((item): item is { id: string; distance: number } => Boolean(item))
    .sort((left, right) => left.distance - right.distance);

  return scored[0]?.id;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}
