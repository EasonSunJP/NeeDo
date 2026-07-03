import { useDeferredValue, useEffect, useMemo, useState, type UIEvent } from "react";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { HorizontalScrollArea } from "../../components/ui/HorizontalScrollArea";
import { PageHeader } from "../../components/ui/PageHeader";
import { japanCityRecords, japanCitySummary, type JapanCityLevel, type JapanCityRecord } from "../../data/japanCityData";
import { downloadJapanCityExcel } from "../../lib/japanCityExcelExport";
import { cn } from "../../lib/utils";

type CityFilterLevel = "all" | JapanCityLevel;

type VisibleCityRow = {
  record: JapanCityRecord;
  depth: number;
};

const levelOptions: Array<{ label: string; value: CityFilterLevel }> = [
  { label: "全部类型", value: "all" },
  { label: "都道府县", value: "prefecture" },
  { label: "市区町村", value: "municipality" },
  { label: "政令市行政区", value: "ward" }
];

const coordinateFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 6,
  minimumFractionDigits: 6
});
const cityTableColumnCount = 7;
const cityRowHeight = 58;
const cityRowOverscan = 8;
const cityTableDefaultViewportHeight = 520;

function buildChildrenMap(records: JapanCityRecord[]) {
  const next = new Map<string | null, JapanCityRecord[]>();

  records.forEach((record) => {
    const parentId = record.parentId;
    const children = next.get(parentId) ?? [];

    children.push(record);
    next.set(parentId, children);
  });

  return next;
}

const childrenByParent = buildChildrenMap(japanCityRecords);
const recordById = new Map(japanCityRecords.map((record) => [record.id, record]));
const expandableCityIds = japanCityRecords.filter((record) => (childrenByParent.get(record.id)?.length ?? 0) > 0).map((record) => record.id);

function getInitialExpandedIds() {
  return new Set(expandableCityIds);
}

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase();
}

function formatCoordinate(value: number | null) {
  return value === null ? "-" : coordinateFormatter.format(value);
}

function formatParentCode(record: JapanCityRecord) {
  return record.parentId ? (recordById.get(record.parentId)?.code ?? "-") : "-";
}

function getBadgeTone(record: JapanCityRecord) {
  if (record.level === "prefecture") {
    return "dark";
  }

  if (record.level === "ward") {
    return "blue";
  }

  if (record.type === "市") {
    return "green";
  }

  if (record.type === "特別区") {
    return "yellow";
  }

  return "neutral";
}

function getVisibleSet({
  level,
  prefecture,
  query
}: {
  level: CityFilterLevel;
  prefecture: string;
  query: string;
}) {
  const visibleIds = new Set<string>();
  const normalizedQuery = normalizeSearchText(query);
  const hasFilter = Boolean(normalizedQuery) || level !== "all" || prefecture !== "all";

  if (!hasFilter) {
    return { hasFilter, visibleIds };
  }

  const addRecordAndAncestors = (record: JapanCityRecord) => {
    let current: JapanCityRecord | undefined = record;

    while (current) {
      visibleIds.add(current.id);
      current = current.parentId ? recordById.get(current.parentId) : undefined;
    }
  };

  japanCityRecords.forEach((record) => {
    if (level !== "all" && record.level !== level) {
      return;
    }

    if (prefecture !== "all" && record.prefecture !== prefecture) {
      return;
    }

    if (normalizedQuery) {
      const searchable = [
        record.code,
        record.jisCode,
        record.prefecture,
        record.name,
        record.displayName,
        record.kana,
        record.building,
        record.address
      ]
        .join(" ")
        .toLowerCase();

      if (!searchable.includes(normalizedQuery)) {
        return;
      }
    }

    addRecordAndAncestors(record);
  });

  return { hasFilter, visibleIds };
}

function flattenRows({
  expandedIds,
  hasFilter,
  visibleIds
}: {
  expandedIds: Set<string>;
  hasFilter: boolean;
  visibleIds: Set<string>;
}) {
  const rows: VisibleCityRow[] = [];

  const visit = (parentId: string | null, depth: number) => {
    const children = childrenByParent.get(parentId) ?? [];

    children.forEach((record) => {
      if (hasFilter && !visibleIds.has(record.id)) {
        return;
      }

      rows.push({ record, depth });

      if ((hasFilter || expandedIds.has(record.id)) && (childrenByParent.get(record.id)?.length ?? 0) > 0) {
        visit(record.id, depth + 1);
      }
    });
  };

  visit(null, 0);

  return rows;
}

export function CitySettingsPage() {
  const [expandedIds, setExpandedIds] = useState(getInitialExpandedIds);
  const [query, setQuery] = useState("");
  const [prefecture, setPrefecture] = useState("all");
  const [level, setLevel] = useState<CityFilterLevel>("all");
  const [tableScrollMetrics, setTableScrollMetrics] = useState({
    height: cityTableDefaultViewportHeight,
    top: 0
  });
  const deferredQuery = useDeferredValue(query);
  const allExpanded = expandedIds.size === expandableCityIds.length;
  const filterKey = `${deferredQuery}::${prefecture}::${level}`;
  const prefectureOptions = useMemo(
    () => japanCityRecords.filter((record) => record.level === "prefecture").map((record) => record.name),
    []
  );
  const { hasFilter, visibleIds } = useMemo(
    () => getVisibleSet({ level, prefecture, query: deferredQuery }),
    [deferredQuery, level, prefecture]
  );
  const visibleRows = useMemo(
    () => flattenRows({ expandedIds, hasFilter, visibleIds }),
    [expandedIds, hasFilter, visibleIds]
  );
  const virtualRows = useMemo(() => {
    const visibleCount = Math.ceil(tableScrollMetrics.height / cityRowHeight) + cityRowOverscan * 2;
    const maxStartIndex = Math.max(0, visibleRows.length - visibleCount);
    const startIndex = Math.min(
      maxStartIndex,
      Math.max(0, Math.floor(tableScrollMetrics.top / cityRowHeight) - cityRowOverscan)
    );
    const endIndex = Math.min(visibleRows.length, startIndex + visibleCount);

    return {
      bottomSpacerHeight: Math.max(0, (visibleRows.length - endIndex) * cityRowHeight),
      rows: visibleRows.slice(startIndex, endIndex),
      topSpacerHeight: startIndex * cityRowHeight
    };
  }, [tableScrollMetrics.height, tableScrollMetrics.top, visibleRows]);

  useEffect(() => {
    setTableScrollMetrics((current) => ({ ...current, top: 0 }));
  }, [filterKey]);

  const toggleExpanded = (recordId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);

      if (next.has(recordId)) {
        next.delete(recordId);
      } else {
        next.add(recordId);
      }

      return next;
    });
  };

  const toggleAll = () => {
    setExpandedIds(allExpanded ? new Set() : getInitialExpandedIds());
  };

  const handleExportExcel = () => {
    downloadJapanCityExcel(japanCityRecords);
  };

  const handleTableScroll = (event: UIEvent<HTMLDivElement>) => {
    const { clientHeight, scrollTop } = event.currentTarget;

    setTableScrollMetrics((current) => {
      if (Math.abs(current.top - scrollTop) < 2 && Math.abs(current.height - clientHeight) < 2) {
        return current;
      }

      return {
        height: clientHeight || cityTableDefaultViewportHeight,
        top: scrollTop
      };
    });
  };

  return (
    <AdminLayout>
      <div className="space-y-4">
        <section className="city-settings-sticky-header -mx-4 px-4 pb-3 pt-1 md:-mx-5 md:px-5 2xl:-mx-6 2xl:px-6">
          <PageHeader
            title="城市管理"
            description="日本全量都道府县、市区町村和政令指定都市行政区，按官方行政代码与役所坐标统一维护。"
          >
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button variant="secondary" onClick={handleExportExcel}>导出 Excel</Button>
              <Button>添加城市</Button>
              <Button variant="secondary">更新城市缓存</Button>
              <Button variant="secondary" onClick={toggleAll}>{allExpanded ? "全部关闭" : "全部展开"}</Button>
            </div>
          </PageHeader>

          <div className="mt-3 grid gap-2 md:grid-cols-4">
            {[
              ["都道府县", japanCitySummary.prefectures, "47 个行政一级单位"],
              ["市区町村", japanCitySummary.municipalities, "市、特別区、町、村"],
              ["政令市行政区", japanCitySummary.designatedCityWards, "20 个政令市下属行政区"],
              ["坐标覆盖", `${japanCitySummary.coordinateRows}/${japanCitySummary.totalRows}`, `${japanCitySummary.missingCoordinateRows} 个官方代码无坐标源`]
            ].map(([label, value, caption]) => (
              <article className="rounded-lg border border-line bg-white px-4 py-3" key={label}>
                <p className="text-xs font-bold text-ink/50">{label}</p>
                <strong className="mt-1 block text-2xl">{value}</strong>
                <p className="mt-1 text-xs text-ink/55">{caption}</p>
              </article>
            ))}
          </div>

          <div className="mt-3 rounded-lg border border-line bg-white p-3">
            <div className="grid gap-3 lg:grid-cols-[1.15fr_0.8fr_0.8fr_auto]">
              <label className="flex h-11 min-w-0 items-center gap-2 rounded-lg border border-line bg-paper px-3 text-sm">
                <span className="text-ink/45">⌕</span>
                <input
                  className="min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-ink/35"
                  placeholder="搜索城市、都道府县、行政代码"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <select className="h-11 rounded-lg border border-line bg-paper px-3 text-sm font-bold text-ink outline-none" value={prefecture} onChange={(event) => setPrefecture(event.target.value)}>
                <option value="all">全部都道府县</option>
                {prefectureOptions.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
              <select className="h-11 rounded-lg border border-line bg-paper px-3 text-sm font-bold text-ink outline-none" value={level} onChange={(event) => setLevel(event.target.value as CityFilterLevel)}>
                {levelOptions.map((item) => (
                  <option key={item.value} value={item.value}>{item.label}</option>
                ))}
              </select>
              <Button
                className="h-11"
                variant="secondary"
                onClick={() => {
                  setQuery("");
                  setPrefecture("all");
                  setLevel("all");
                }}
              >
                重置筛选
              </Button>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-line bg-white shadow-panel">
          <HorizontalScrollArea
            ariaLabel="日本城市管理表横向滚动区域"
            className="city-settings-table-scroll"
            key={filterKey}
            onScroll={handleTableScroll}
          >
            <table className="w-full min-w-[1220px] border-separate border-spacing-0 text-left text-sm">
              <thead className="sticky top-0 z-20 bg-paper text-xs font-semibold uppercase text-ink/55 shadow-[0_1px_0_var(--admin-line)]">
                <tr>
                  <th className="border-b border-line bg-paper px-4 py-3">城市</th>
                  <th className="border-b border-line bg-paper px-4 py-3">行政代码</th>
                  <th className="border-b border-line bg-paper px-4 py-3">上级代码</th>
                  <th className="border-b border-line bg-paper px-4 py-3">经度</th>
                  <th className="border-b border-line bg-paper px-4 py-3">纬度</th>
                  <th className="border-b border-line bg-paper px-4 py-3">更新时间</th>
                  <th className="border-b border-line bg-paper px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                {virtualRows.topSpacerHeight > 0 ? (
                  <tr aria-hidden="true">
                    <td colSpan={cityTableColumnCount} style={{ height: virtualRows.topSpacerHeight, padding: 0 }} />
                  </tr>
                ) : null}
                {virtualRows.rows.map(({ record, depth }) => {
                  const hasChildren = (childrenByParent.get(record.id)?.length ?? 0) > 0;
                  const expanded = expandedIds.has(record.id);

                  return (
                    <tr className="h-[58px] border-b border-line hover:bg-paper/70" key={record.id}>
                      <td className="h-[58px] min-w-[360px] border-b border-line px-4 py-2 text-ink/85">
                        <div className="flex items-center gap-2" style={{ paddingLeft: depth * 22 }}>
                          {hasChildren ? (
                            <button
                              aria-label={expanded ? "折叠城市层级" : "展开城市层级"}
                              className="focus-ring grid h-6 w-6 shrink-0 place-items-center rounded-md border border-line bg-white text-xs font-black text-ink/60"
                              onClick={() => toggleExpanded(record.id)}
                              type="button"
                            >
                              {expanded ? "⌄" : "›"}
                            </button>
                          ) : (
                            <span className="h-6 w-6 shrink-0" />
                          )}
                          <span className={cn("min-w-0", record.level === "prefecture" && "font-black")}>
                            <span className="block truncate">{record.displayName}</span>
                            {record.name !== record.displayName ? <span className="mt-0.5 block truncate text-xs font-semibold text-ink/45">{record.name}</span> : null}
                          </span>
                          <Badge className="shrink-0" tone={getBadgeTone(record)}>{record.type}</Badge>
                        </div>
                      </td>
                      <td className="h-[58px] whitespace-nowrap border-b border-line px-4 py-2 font-mono text-xs text-ink/65">{record.code}</td>
                      <td className="h-[58px] whitespace-nowrap border-b border-line px-4 py-2 font-mono text-xs text-ink/55">{formatParentCode(record)}</td>
                      <td className="h-[58px] whitespace-nowrap border-b border-line px-4 py-2 text-ink/70">{formatCoordinate(record.longitude)}</td>
                      <td className="h-[58px] whitespace-nowrap border-b border-line px-4 py-2 text-ink/70">{formatCoordinate(record.latitude)}</td>
                      <td className="h-[58px] whitespace-nowrap border-b border-line px-4 py-2 text-ink/60">{record.updatedAt}</td>
                      <td className="h-[58px] whitespace-nowrap border-b border-line px-4 py-2">
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="ghost">编辑</Button>
                          <Button size="sm" variant="danger">删除</Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {virtualRows.bottomSpacerHeight > 0 ? (
                  <tr aria-hidden="true">
                    <td colSpan={cityTableColumnCount} style={{ height: virtualRows.bottomSpacerHeight, padding: 0 }} />
                  </tr>
                ) : null}
              </tbody>
            </table>
          </HorizontalScrollArea>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-paper px-4 py-3 text-xs font-semibold text-ink/55">
            <span>当前显示 {visibleRows.length} 条，共 {japanCitySummary.totalRows} 条</span>
            <span>数据源：总务省行政代码 / ASTI 役所坐标</span>
          </div>
        </section>
      </div>
    </AdminLayout>
  );
}
