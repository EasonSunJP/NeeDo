import catalog from "../prisma/reference/jp-administrative-regions-2026.json";

it("contains one JP country, 47 prefectures, Tokyo, and all 23 special wards", () => {
  expect(catalog.version).toBe("N03-20260101");
  expect(catalog.regions.filter((row) => row.level === "ADMIN1")).toHaveLength(47);
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
