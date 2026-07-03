import type { JapanCityRecord } from "../data/japanCityData";

export const japanCityExcelColumns = ["城市", "行政代码", "上级代码", "经度", "纬度", "更新时间"] as const;
export const japanCityDatabaseImportColumns = [
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
] as const;

export type JapanCityExcelColumn = (typeof japanCityExcelColumns)[number];
export type JapanCityExcelRow = Record<JapanCityExcelColumn, string>;
export type JapanCityDatabaseImportColumn = (typeof japanCityDatabaseImportColumns)[number];
export type JapanCityDatabaseImportRow = Record<JapanCityDatabaseImportColumn, string>;

export interface JapanCityExcelPayload {
  filename: string;
  contentType: "application/vnd.ms-excel;charset=utf-8";
  content: string;
}

type ExcelDownloadEnvironment = {
  BlobCtor?: typeof Blob;
  document?: Document;
  url?: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;
};

const excelContentType = "application/vnd.ms-excel;charset=utf-8" as const;

function buildChildrenMap(records: JapanCityRecord[]) {
  const childrenByParent = new Map<string | null, JapanCityRecord[]>();

  records.forEach((record) => {
    const children = childrenByParent.get(record.parentId) ?? [];

    children.push(record);
    childrenByParent.set(record.parentId, children);
  });

  return childrenByParent;
}

function sortByHierarchy(records: JapanCityRecord[]) {
  const childrenByParent = buildChildrenMap(records);
  const sorted: JapanCityRecord[] = [];
  const seenIds = new Set<string>();

  const visit = (parentId: string | null) => {
    const children = childrenByParent.get(parentId) ?? [];

    children.forEach((record) => {
      if (seenIds.has(record.id)) {
        return;
      }

      seenIds.add(record.id);
      sorted.push(record);
      visit(record.id);
    });
  };

  visit(null);

  records.forEach((record) => {
    if (!seenIds.has(record.id)) {
      sorted.push(record);
    }
  });

  return sorted;
}

function buildCityPath(record: JapanCityRecord, recordsById: Map<string, JapanCityRecord>) {
  const path: string[] = [];
  let current: JapanCityRecord | undefined = record;
  let guard = 0;

  while (current && guard <= recordsById.size) {
    path.unshift(current.displayName || current.name);
    current = current.parentId ? recordsById.get(current.parentId) : undefined;
    guard += 1;
  }

  return path.join(" > ");
}

function getParentCode(record: JapanCityRecord, recordsById: Map<string, JapanCityRecord>) {
  return record.parentId ? (recordsById.get(record.parentId)?.code ?? "") : "";
}

function formatCoordinate(value: number | null) {
  return value === null ? "" : value.toFixed(6);
}

function getLatestUpdatedAt(records: JapanCityRecord[]) {
  return records.reduce((latest, record) => (record.updatedAt > latest ? record.updatedAt : latest), "");
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildExcelCell(value: string) {
  return `<Cell><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
}

function buildExcelRow(cells: string[]) {
  return `<Row>${cells.map(buildExcelCell).join("")}</Row>`;
}

function buildWorksheet(name: string, widths: number[], rows: string[][]) {
  return [
    `<Worksheet ss:Name="${escapeXml(name)}">`,
    "<Table>",
    ...widths.map((width) => `<Column ss:Width="${width}"/>`),
    ...rows.map(buildExcelRow),
    "</Table>",
    "</Worksheet>"
  ].join("\n");
}

export function buildJapanCityExcelRows(records: JapanCityRecord[]): JapanCityExcelRow[] {
  const recordsById = new Map(records.map((record) => [record.id, record]));

  return sortByHierarchy(records).map((record) => ({
    城市: buildCityPath(record, recordsById),
    行政代码: record.code,
    上级代码: getParentCode(record, recordsById),
    经度: formatCoordinate(record.longitude),
    纬度: formatCoordinate(record.latitude),
    更新时间: record.updatedAt
  }));
}

export function buildJapanCityDatabaseImportRows(records: JapanCityRecord[]): JapanCityDatabaseImportRow[] {
  const recordsById = new Map(records.map((record) => [record.id, record]));

  return sortByHierarchy(records).map((record) => ({
    id: record.id,
    admin_code: record.code,
    jis_code: record.jisCode,
    parent_admin_code: getParentCode(record, recordsById),
    city_name: record.displayName || record.name,
    display_name: record.displayName,
    city_path: buildCityPath(record, recordsById),
    prefecture_name: record.prefecture,
    level: record.level,
    type: record.type,
    longitude: formatCoordinate(record.longitude),
    latitude: formatCoordinate(record.latitude),
    updated_at: record.updatedAt
  }));
}

export function buildJapanCityExcelPayload(records: JapanCityRecord[]): JapanCityExcelPayload {
  const rows = buildJapanCityExcelRows(records);
  const importRows = buildJapanCityDatabaseImportRows(records);
  const latestUpdatedAt = getLatestUpdatedAt(records) || "unknown";
  const readableWorksheet = buildWorksheet(
    "城市管理",
    [280, 90, 90, 90, 90, 100],
    [[...japanCityExcelColumns], ...rows.map((row) => japanCityExcelColumns.map((column) => row[column]))]
  );
  const databaseImportWorksheet = buildWorksheet(
    "database_import",
    [180, 90, 80, 110, 120, 120, 280, 120, 90, 110, 90, 90, 100],
    [
      [...japanCityDatabaseImportColumns],
      ...importRows.map((row) => japanCityDatabaseImportColumns.map((column) => row[column]))
    ]
  );

  return {
    filename: `needo-japan-cities-${latestUpdatedAt}.xls`,
    contentType: excelContentType,
    content: [
      "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
      "<?mso-application progid=\"Excel.Sheet\"?>",
      "<Workbook xmlns=\"urn:schemas-microsoft-com:office:spreadsheet\"",
      " xmlns:o=\"urn:schemas-microsoft-com:office:office\"",
      " xmlns:x=\"urn:schemas-microsoft-com:office:excel\"",
      " xmlns:ss=\"urn:schemas-microsoft-com:office:spreadsheet\">",
      readableWorksheet,
      databaseImportWorksheet,
      "</Workbook>"
    ].join("\n")
  };
}

export function downloadJapanCityExcel(
  records: JapanCityRecord[],
  environment: ExcelDownloadEnvironment = {}
) {
  const documentRef = environment.document ?? (typeof document === "undefined" ? undefined : document);
  const urlRef = environment.url ?? (typeof URL === "undefined" ? undefined : URL);
  const BlobCtor = environment.BlobCtor ?? (typeof Blob === "undefined" ? undefined : Blob);

  if (!documentRef || !urlRef || !BlobCtor) {
    return false;
  }

  const payload = buildJapanCityExcelPayload(records);
  const blob = new BlobCtor([payload.content], { type: payload.contentType });
  const objectUrl = urlRef.createObjectURL(blob);
  const anchor = documentRef.createElement("a");

  anchor.href = objectUrl;
  anchor.download = payload.filename;
  anchor.style.display = "none";
  documentRef.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  urlRef.revokeObjectURL(objectUrl);
  return true;
}
