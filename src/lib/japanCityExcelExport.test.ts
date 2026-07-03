import { describe, expect, it, vi } from "vitest";
import { japanCityRecords, japanCitySummary } from "../data/japanCityData";
import {
  buildJapanCityDatabaseImportRows,
  buildJapanCityExcelPayload,
  buildJapanCityExcelRows,
  downloadJapanCityExcel,
  japanCityDatabaseImportColumns,
  japanCityExcelColumns
} from "./japanCityExcelExport";

describe("japanCityExcelExport", () => {
  it("builds all Japan city rows with an explicit hierarchy path and requested columns", () => {
    const rows = buildJapanCityExcelRows(japanCityRecords);

    expect(japanCityExcelColumns).toEqual(["城市", "行政代码", "上级代码", "经度", "纬度", "更新时间"]);
    expect(rows).toHaveLength(japanCitySummary.totalRows);
    expect(rows[0]).toEqual({
      城市: "北海道",
      行政代码: "010006",
      上级代码: "",
      经度: "141.346878",
      纬度: "43.064325",
      更新时间: "2026-01-15"
    });

    const sapporoIndex = rows.findIndex((row) => row.城市 === "北海道 > 札幌市");
    const kiyotaRow = rows.find((row) => row.城市 === "北海道 > 札幌市 > 清田区");

    expect(sapporoIndex).toBeGreaterThan(0);
    expect(rows[sapporoIndex]).toMatchObject({
      城市: "北海道 > 札幌市",
      行政代码: "011002",
      上级代码: "010006"
    });
    expect(rows[sapporoIndex + 1]).toMatchObject({
      城市: "北海道 > 札幌市 > 中央区",
      行政代码: "011011",
      上级代码: "011002",
      经度: "141.341097",
      纬度: "43.055451"
    });
    expect(kiyotaRow).toMatchObject({
      行政代码: "011100",
      上级代码: "011002"
    });
    expect(rows.some((row) => row.城市 === "東京都 > 新宿区" && row.行政代码 === "131041")).toBe(true);
  });

  it("creates an Excel workbook payload that preserves leading-zero administrative codes", () => {
    const payload = buildJapanCityExcelPayload(japanCityRecords);

    expect(payload.filename).toBe("needo-japan-cities-2026-01-15.xls");
    expect(payload.contentType).toBe("application/vnd.ms-excel;charset=utf-8");
    expect(payload.content).toContain("<?mso-application progid=\"Excel.Sheet\"?>");
    expect(payload.content).toContain("<Data ss:Type=\"String\">行政代码</Data>");
    expect(payload.content.indexOf("<Data ss:Type=\"String\">行政代码</Data>")).toBeLessThan(
      payload.content.indexOf("<Data ss:Type=\"String\">上级代码</Data>")
    );
    expect(payload.content.indexOf("<Data ss:Type=\"String\">上级代码</Data>")).toBeLessThan(
      payload.content.indexOf("<Data ss:Type=\"String\">经度</Data>")
    );
    expect(payload.content).toContain("<Data ss:Type=\"String\">010006</Data>");
    expect(payload.content).toContain("<Data ss:Type=\"String\">011002</Data>");
    expect(payload.content).toContain("<Data ss:Type=\"String\">北海道 &gt; 札幌市 &gt; 中央区</Data>");
    expect(payload.content).toContain("<Worksheet ss:Name=\"城市管理\">");
    expect(payload.content).toContain("<Worksheet ss:Name=\"database_import\">");
    expect(payload.content).toContain("<Data ss:Type=\"String\">parent_admin_code</Data>");
  });

  it("builds a database import sheet with stable snake_case columns and parent codes", () => {
    const rows = buildJapanCityDatabaseImportRows(japanCityRecords);
    const sapporoRow = rows.find((row) => row.admin_code === "011002");
    const kiyotaRow = rows.find((row) => row.admin_code === "011100");

    expect(japanCityDatabaseImportColumns).toEqual([
      "id",
      "admin_code",
      "jis_code",
      "parent_admin_code",
      "city_name",
      "display_name",
      "city_path",
      "prefecture_name",
      "level",
      "type",
      "longitude",
      "latitude",
      "updated_at"
    ]);
    expect(rows).toHaveLength(japanCitySummary.totalRows);
    expect(rows[0]).toMatchObject({
      id: "jp-prefecture-01000",
      admin_code: "010006",
      parent_admin_code: "",
      city_name: "北海道",
      city_path: "北海道"
    });
    expect(sapporoRow).toMatchObject({
      parent_admin_code: "010006",
      city_name: "札幌市",
      city_path: "北海道 > 札幌市"
    });
    expect(kiyotaRow).toMatchObject({
      parent_admin_code: "011002",
      city_name: "清田区",
      city_path: "北海道 > 札幌市 > 清田区"
    });
  });

  it("downloads the Excel workbook in browser environments", () => {
    const createdBlobs: Array<{ parts: BlobPart[]; options?: BlobPropertyBag }> = [];
    const anchor = {
      click: vi.fn(),
      download: "",
      href: "",
      remove: vi.fn(),
      style: {} as CSSStyleDeclaration
    } as unknown as HTMLAnchorElement;
    const documentStub = {
      body: {
        appendChild: vi.fn()
      },
      createElement: vi.fn(() => anchor)
    } as unknown as Document;
    class FakeBlob {
      public constructor(parts: BlobPart[], options?: BlobPropertyBag) {
        createdBlobs.push({ parts, options });
      }
    }
    const url = {
      createObjectURL: vi.fn(() => "blob:japan-cities"),
      revokeObjectURL: vi.fn()
    };

    const downloaded = downloadJapanCityExcel(japanCityRecords, {
      BlobCtor: FakeBlob as unknown as typeof Blob,
      document: documentStub,
      url
    });

    expect(downloaded).toBe(true);
    expect(createdBlobs[0]?.options).toEqual({ type: "application/vnd.ms-excel;charset=utf-8" });
    expect(anchor.download).toBe("needo-japan-cities-2026-01-15.xls");
    expect(anchor.href).toBe("blob:japan-cities");
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(url.revokeObjectURL).toHaveBeenCalledWith("blob:japan-cities");
  });
});
