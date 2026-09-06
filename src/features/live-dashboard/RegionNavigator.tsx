import { useEffect, useId, useMemo, useState } from "react";
import type { LiveDashboardScope, LiveDashboardSnapshot } from "../../api/liveDashboard";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { translateTextForContext } from "../../i18n/translations";
import { loadRegionSearchIndex, scopeForRegion, searchRegions, type RegionSearchEntry, type RegionSearchIndex } from "./regionSearch";

interface RegionNavigatorProps {
  scope: LiveDashboardScope;
  breadcrumbs: LiveDashboardSnapshot["scope"]["breadcrumbs"];
  onSelectRegion: (scope: LiveDashboardScope) => void;
}

function sameScope(left: LiveDashboardScope, right: LiveDashboardScope): boolean {
  return left.country === right.country
    && left.admin1 === right.admin1
    && left.admin2 === right.admin2
    && left.period === right.period;
}

function breadcrumbFor(scope: LiveDashboardScope, breadcrumbs: RegionNavigatorProps["breadcrumbs"]): string[] {
  const names = breadcrumbs.map((item) => item.name);
  if (names.length) return names;
  return ["日本", ...(scope.admin1 ? [scope.admin1] : []), ...(scope.admin2 ? [scope.admin2] : [])];
}

function currentEntry(scope: LiveDashboardScope, breadcrumbs: RegionNavigatorProps["breadcrumbs"], level: RegionSearchEntry["level"]): RegionSearchEntry | null {
  const code = level === "admin1" ? scope.admin1 : scope.admin2;
  if (!code) return null;
  const name = breadcrumbs.find((item) => item.level === level)?.name ?? code;
  const admin1Name = breadcrumbs.find((item) => item.level === "admin1")?.name;
  return {
    code,
    level,
    parentCode: level === "admin1" ? "JP" : scope.admin1!,
    nameJa: name,
    breadcrumbJa: level === "admin1" ? ["日本", name] : ["日本", admin1Name ?? scope.admin1!, name]
  };
}

export function RegionNavigator({ breadcrumbs, onSelectRegion, scope }: RegionNavigatorProps) {
  const { language } = useOptionalI18n();
  const t = (source: string) => translateTextForContext(source, language, { portal: "admin" });
  const resultListId = useId();
  const [index, setIndex] = useState<RegionSearchIndex | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoadFailed(false);
    void loadRegionSearchIndex(controller.signal)
      .then((loaded) => {
        if (!controller.signal.aborted) setIndex(loaded);
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadFailed(true);
      });
    return () => controller.abort();
  }, []);

  const results = useMemo(() => index ? searchRegions(index, query) : [], [index, query]);
  const prefectures = useMemo(() => {
    const loaded = index?.regions.filter((entry) => entry.level === "admin1") ?? [];
    const current = currentEntry(scope, breadcrumbs, "admin1");
    return current && !loaded.some((entry) => entry.code === current.code) ? [...loaded, current] : loaded;
  }, [breadcrumbs, index, scope]);
  const municipalities = useMemo(() => {
    const loaded = index?.regions.filter((entry) => entry.level === "admin2" && entry.parentCode === scope.admin1) ?? [];
    const current = currentEntry(scope, breadcrumbs, "admin2");
    return current && !loaded.some((entry) => entry.code === current.code) ? [...loaded, current] : loaded;
  }, [breadcrumbs, index, scope]);

  useEffect(() => setActiveIndex(-1), [query]);

  const selectScope = (next: LiveDashboardScope) => {
    if (!sameScope(scope, next)) onSelectRegion(next);
    setQuery("");
    setOpen(false);
    setActiveIndex(-1);
  };
  const selectEntry = (entry: RegionSearchEntry) => selectScope(scopeForRegion(entry, scope.period));
  const activeResultId = activeIndex >= 0 ? `${resultListId}-option-${results[activeIndex]?.code}` : undefined;

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (!results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => current >= results.length - 1 ? 0 : current + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => current <= 0 ? results.length - 1 : current - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      selectEntry(results[activeIndex >= 0 ? activeIndex : 0]);
    }
  };

  return (
    <section className="live-dashboard-region-navigator" aria-label={t("行政区域层级")}>
      <nav aria-label={t("行政区域层级")}>{breadcrumbFor(scope, breadcrumbs).join(" / ")}</nav>
      <label>
        <span>{t("国家")}</span>
        <select aria-label={t("国家")} disabled value="JP"><option value="JP">{t("日本")}</option></select>
      </label>
      <label>
        <span>{t("全国地区搜索")}</span>
        <input
          aria-activedescendant={activeResultId}
          aria-autocomplete="list"
          aria-controls={resultListId}
          aria-expanded={open && results.length > 0}
          aria-label={t("全国地区搜索")}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onSearchKeyDown}
          role="combobox"
          value={query}
        />
      </label>
      {open && query && (results.length ? (
        <ul id={resultListId} role="listbox">
          {results.map((entry, resultIndex) => (
            <li
              aria-selected={resultIndex === activeIndex}
              id={`${resultListId}-option-${entry.code}`}
              key={entry.code}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectEntry(entry)}
              role="option"
            >{entry.breadcrumbJa.join(" / ")}</li>
          ))}
        </ul>
      ) : <p role="status">{t("没有匹配结果")}</p>)}
      <label>
        <span>{t("都道府县")}</span>
        <select
          aria-label={t("都道府县")}
          onChange={(event) => {
            const entry = prefectures.find((candidate) => candidate.code === event.target.value);
            selectScope(entry ? scopeForRegion(entry, scope.period) : { country: "JP", period: scope.period });
          }}
          value={scope.admin1 ?? ""}
        >
          <option value="">{t("日本")}</option>
          {prefectures.map((entry) => <option key={entry.code} value={entry.code}>{entry.nameJa}</option>)}
        </select>
      </label>
      <label>
        <span>{t("市区町村")}</span>
        <select
          aria-label={t("市区町村")}
          disabled={!scope.admin1}
          onChange={(event) => {
            const entry = municipalities.find((candidate) => candidate.code === event.target.value);
            selectScope(entry ? scopeForRegion(entry, scope.period) : { country: "JP", admin1: scope.admin1!, period: scope.period });
          }}
          value={scope.admin2 ?? ""}
        >
          <option value="">{t("请选择市区町村")}</option>
          {municipalities.map((entry) => <option key={entry.code} value={entry.code}>{entry.nameJa}</option>)}
        </select>
      </label>
      {loadFailed ? <p role="status">{t("实时数据暂不可用")}</p> : null}
    </section>
  );
}
