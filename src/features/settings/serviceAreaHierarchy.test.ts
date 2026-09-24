import { describe, expect, it } from "vitest";
import {
  findServiceAreaPath,
  getServiceAreaDistricts,
  getServiceAreaPrefectures,
  getServiceAreaStreets
} from "./serviceAreaHierarchy";

describe("service area hierarchy", () => {
  it("offers all prefectures and keeps wards under their own prefecture", () => {
    expect(getServiceAreaPrefectures()).toHaveLength(47);
    const tokyo = getServiceAreaPrefectures().find((item) => item.name === "東京都")!;
    const osaka = getServiceAreaPrefectures().find((item) => item.name === "大阪府")!;
    expect(getServiceAreaDistricts(tokyo.id).map((item) => item.name)).toContain("港区");
    expect(getServiceAreaDistricts(tokyo.id).map((item) => item.name)).toContain("新宿区");
    expect(getServiceAreaDistricts(osaka.id).map((item) => item.name)).toContain("大阪市北区");
    expect(getServiceAreaDistricts(osaka.id).map((item) => item.name)).not.toContain("港区");
  });

  it("resolves existing location values to a street without changing their saved value", () => {
    const path = findServiceAreaPath("六本木");
    expect(path?.prefecture.name).toBe("東京都");
    expect(path?.district.name).toBe("港区");
    expect(path?.street).toBe("六本木");
    expect(getServiceAreaStreets(path!.district.id)).toContain("麻布十番");
    expect(findServiceAreaPath("新宿")?.district.name).toBe("新宿区");
  });

  it("restores a custom street from a fully qualified saved value", () => {
    const path = findServiceAreaPath("大阪府 / 大阪市北区 / 中之島");
    expect(path?.prefecture.name).toBe("大阪府");
    expect(path?.district.name).toBe("大阪市北区");
    expect(path?.street).toBe("中之島");
  });
});
