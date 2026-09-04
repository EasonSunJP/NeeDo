import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useAuth } from "../../auth/AuthProvider";
import {
  serviceSearchAnalyticsApi,
  type SearchAnalyticsFilter,
  type SearchKeywordAlias,
  type SearchKeywordTopPayload,
  type SearchKeywordTrendPayload,
  type ServiceTaxonomyCategory,
  type ServiceTaxonomyKeyword,
  type TaxonomyLocale
} from "../../api/serviceSearchAnalytics";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { AdminToggleSwitch } from "../../components/admin/AdminToggleSwitch";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { cn } from "../../lib/utils";

type PeriodPreset = "today" | "last7days" | "last30days" | "month" | "year" | "custom";
type LocaleInput = "zh-CN" | "zh-TW" | "ja" | "en" | "ko";
type LocalizedDraft = Record<LocaleInput, string>;
type TaxonomyDraft = {
  code: string;
  sortOrder: string;
  isActive: boolean;
  translations: LocalizedDraft;
  reason: string;
};
type AliasDraft = { alias: string; isActive: boolean; reason: string };

const inputClass =
  "h-10 w-full rounded-xl border border-line bg-white px-3 text-sm font-semibold text-ink outline-none transition focus:border-[#4f87ff] focus:ring-2 focus:ring-[#4f87ff]/15";
const panelClass = "rounded-[22px] border border-line bg-white p-5 shadow-sm";
const trendColors = ["#4f87ff", "#39d6b4", "#f4bd4f", "#b775ff", "#ff7383"];
const localeFields: Array<{ key: LocaleInput; label: string }> = [
  { key: "ja", label: "日语名称" },
  { key: "zh-CN", label: "简体中文名称" },
  { key: "zh-TW", label: "繁体中文名称" },
  { key: "en", label: "英语名称" },
  { key: "ko", label: "韩语名称" }
];
const apiLocaleToFormLocale: Record<TaxonomyLocale, LocaleInput> = {
  JA: "ja",
  ZH_CN: "zh-CN",
  ZH_TW: "zh-TW",
  EN: "en",
  KO: "ko"
};

const emptyTranslations = (): LocalizedDraft => ({ "zh-CN": "", "zh-TW": "", ja: "", en: "", ko: "" });
const emptyTaxonomyDraft = (): TaxonomyDraft => ({
  code: "",
  sortOrder: "0",
  isActive: true,
  translations: emptyTranslations(),
  reason: ""
});
const emptyAliasDraft = (): AliasDraft => ({ alias: "", isActive: true, reason: "" });
const errorMessage = (error: unknown) => error instanceof Error && error.message ? error.message : "请求失败，请稍后重试";

function dateKeyInTokyo(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value);
  const read = (type: "year" | "month" | "day") => parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

function shiftDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

function startOfTokyoDay(dateKey: string) {
  return new Date(`${dateKey}T00:00:00+09:00`).toISOString();
}

export function buildSearchAnalyticsFilter(
  preset: PeriodPreset,
  options: { now?: Date; customStart?: string; customEnd?: string; city?: string; categoryId?: number } = {}
): SearchAnalyticsFilter {
  const today = dateKeyInTokyo(options.now ?? new Date());
  let start = today;
  let endExclusive = shiftDateKey(today, 1);
  if (preset === "last7days") start = shiftDateKey(today, -6);
  if (preset === "last30days") start = shiftDateKey(today, -29);
  if (preset === "month") start = `${today.slice(0, 8)}01`;
  if (preset === "year") start = `${today.slice(0, 4)}-01-01`;
  if (preset === "custom") {
    if (!options.customStart || !options.customEnd || options.customStart > options.customEnd) {
      throw new TypeError("自定义时间范围无效");
    }
    start = options.customStart;
    endExclusive = shiftDateKey(options.customEnd, 1);
  }
  return {
    startAt: startOfTokyoDay(start),
    endAt: startOfTokyoDay(endExclusive),
    ...(options.city?.trim() ? { city: options.city.trim() } : {}),
    ...(options.categoryId ? { categoryId: options.categoryId } : {})
  };
}

function localizedName(item: { code: string; translations: Array<{ locale: TaxonomyLocale; value: string }> }) {
  return item.translations.find((translation) => translation.locale === "ZH_CN")?.value
    ?? item.translations.find((translation) => translation.locale === "JA")?.value
    ?? item.translations[0]?.value
    ?? item.code;
}

function toDraft(item: ServiceTaxonomyCategory | ServiceTaxonomyKeyword): TaxonomyDraft {
  const translations = emptyTranslations();
  item.translations.forEach((translation) => {
    translations[apiLocaleToFormLocale[translation.locale]] = translation.value;
  });
  return {
    code: item.code,
    sortOrder: String(item.sortOrder),
    isActive: item.isActive,
    translations,
    reason: ""
  };
}

function taxonomyBody(draft: TaxonomyDraft) {
  const sortOrder = Number(draft.sortOrder);
  const translations = localeFields
    .map(({ key }) => ({ locale: key, value: draft.translations[key].trim() }))
    .filter((translation) => translation.value);
  if (!/^[a-z0-9][a-z0-9._-]*$/u.test(draft.code.trim())) throw new TypeError("配置代码格式无效");
  if (!Number.isSafeInteger(sortOrder) || sortOrder < 0) throw new TypeError("排序必须是非负整数");
  if (!translations.length || !draft.reason.trim()) throw new TypeError("至少填写一个名称，并填写设置理由");
  return {
    code: draft.code.trim(),
    sortOrder,
    isActive: draft.isActive,
    translations,
    reason: draft.reason.trim()
  };
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-xs font-black text-ink/60">
      <span>{label}</span>
      {children}
    </label>
  );
}

function TaxonomyForm({
  draft,
  editingLabel,
  saving,
  onChange,
  onCancel,
  onSubmit
}: {
  draft: TaxonomyDraft;
  editingLabel?: string;
  saving: boolean;
  onChange: (draft: TaxonomyDraft) => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <form className="mt-4 grid gap-3 rounded-2xl bg-paper p-4" onSubmit={onSubmit}>
      <div className="flex items-center justify-between gap-3">
        <strong className="text-sm">{editingLabel ?? "新建"}</strong>
        {editingLabel ? <Button onClick={onCancel} size="sm" variant="ghost">取消编辑</Button> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="配置代码">
          <input className={inputClass} onChange={(event) => onChange({ ...draft, code: event.target.value })} value={draft.code} />
        </Field>
        <Field label="排序">
          <input className={inputClass} min="0" onChange={(event) => onChange({ ...draft, sortOrder: event.target.value })} type="number" value={draft.sortOrder} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {localeFields.map((field) => (
          <Field key={field.key} label={field.label}>
            <input
              className={inputClass}
              onChange={(event) => onChange({ ...draft, translations: { ...draft.translations, [field.key]: event.target.value } })}
              value={draft.translations[field.key]}
            />
          </Field>
        ))}
      </div>
      <Field label="设置理由">
        <textarea className="min-h-20 rounded-xl border border-line bg-white p-3 text-sm outline-none focus:border-[#4f87ff]" onChange={(event) => onChange({ ...draft, reason: event.target.value })} value={draft.reason} />
      </Field>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-black text-ink/60">
          <AdminToggleSwitch ariaLabel="启用" checked={draft.isActive} onChange={(isActive) => onChange({ ...draft, isActive })} />
          启用
        </div>
        <Button disabled={saving} size="sm" type="submit">保存更改</Button>
      </div>
    </form>
  );
}

function TaxonomyListItem({
  active,
  badge,
  code,
  enabled,
  label,
  onEdit,
  onSelect
}: {
  active: boolean;
  badge: string;
  code: string;
  enabled: boolean;
  label: string;
  onEdit: () => void;
  onSelect: () => void;
}) {
  return (
    <div className={cn("group flex items-center gap-3 rounded-2xl border p-3 transition", active ? "border-[#4f87ff] bg-[#4f87ff]/8" : "border-line hover:border-[#4f87ff]/40")}>
      <button className="min-w-0 flex-1 text-left" onClick={onSelect} type="button">
        <span className="block truncate text-sm font-black">{label}</span>
        <span className="mt-1 block truncate font-mono text-[11px] text-ink/45" data-no-i18n="true">{code}</span>
      </button>
      <Badge tone={enabled ? "green" : "neutral"}>{enabled ? "启用" : "停用"}</Badge>
      <button className="rounded-lg px-2 py-1 text-xs font-black text-[#4f87ff] hover:bg-[#4f87ff]/10" onClick={onEdit} type="button">编辑</button>
      <span className="min-w-8 text-right text-xs font-black text-ink/45" data-no-i18n="true">{badge}</span>
    </div>
  );
}

function TrendChart({ data, visible }: { data: SearchKeywordTrendPayload; visible: Set<string> }) {
  const dates = [...new Set(data.series.flatMap((series) => series.points.map((point) => point.date)))].sort();
  const width = 1040;
  const height = 310;
  const left = 48;
  const right = 20;
  const top = 18;
  const bottom = 46;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const x = (index: number) => left + (dates.length <= 1 ? chartWidth / 2 : index * chartWidth / (dates.length - 1));
  const y = (value: number) => top + chartHeight - Math.max(0, Math.min(100, value)) * chartHeight / 100;
  const activeSeries = data.series.filter((series) => visible.has(series.keyword));

  if (!dates.length || !activeSeries.length) {
    return <div className="grid h-64 place-items-center rounded-2xl border border-dashed border-line text-sm font-bold text-ink/45">至少选择一个图例以显示图表</div>;
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-[#101629] p-3 text-white">
      <svg aria-label="关键词趋势图" className="min-w-[760px]" role="img" viewBox={`0 0 ${width} ${height}`}>
        {[0, 25, 50, 75, 100].map((tick) => (
          <g key={tick}>
            <line stroke="#ffffff1b" strokeDasharray="5 6" x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} />
            <text fill="#9ea9bf" fontSize="11" textAnchor="end" x={left - 9} y={y(tick) + 4}>{tick}</text>
          </g>
        ))}
        {dates.map((date, index) => (
          <text fill="#9ea9bf" fontSize="10" key={date} textAnchor="middle" x={x(index)} y={height - 14}>{date.slice(5)}</text>
        ))}
        {activeSeries.map((series) => {
          const color = trendColors[data.series.findIndex((item) => item.keyword === series.keyword) % trendColors.length];
          const pointsByDate = new Map(series.points.map((point) => [point.date, point]));
          const points = dates.map((date, index) => ({ date, index, point: pointsByDate.get(date) })).filter((item) => item.point);
          const path = points.map((item, index) => `${index ? "L" : "M"}${x(item.index)},${y(item.point?.normalizedIndex ?? 0)}`).join(" ");
          return (
            <g key={series.keyword}>
              <path d={path} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
              {points.map((item) => (
                <circle cx={x(item.index)} cy={y(item.point?.normalizedIndex ?? 0)} fill={color} key={item.date} r="4">
                  <title>{`${series.keyword} · ${item.date} · 原始搜索次数 ${item.point?.rawCount ?? 0} · 归一化指数 ${item.point?.normalizedIndex ?? 0}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function ServiceSearchAnalyticsPage() {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission("backoffice:service-taxonomy:write");
  const [categories, setCategories] = useState<ServiceTaxonomyCategory[]>([]);
  const [keywords, setKeywords] = useState<ServiceTaxonomyKeyword[]>([]);
  const [aliases, setAliases] = useState<SearchKeywordAlias[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number>();
  const [selectedKeywordId, setSelectedKeywordId] = useState<number>();
  const [categoryDraft, setCategoryDraft] = useState<TaxonomyDraft>(emptyTaxonomyDraft);
  const [keywordDraft, setKeywordDraft] = useState<TaxonomyDraft>(emptyTaxonomyDraft);
  const [aliasDraft, setAliasDraft] = useState<AliasDraft>(emptyAliasDraft);
  const [editingCategory, setEditingCategory] = useState<ServiceTaxonomyCategory>();
  const [editingKeyword, setEditingKeyword] = useState<ServiceTaxonomyKeyword>();
  const [editingAlias, setEditingAlias] = useState<SearchKeywordAlias>();
  const [loadingTaxonomy, setLoadingTaxonomy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [period, setPeriod] = useState<PeriodPreset>("last7days");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [city, setCity] = useState("");
  const [analyticsCategoryId, setAnalyticsCategoryId] = useState<number>();
  const [topKeywords, setTopKeywords] = useState<SearchKeywordTopPayload>();
  const [trend, setTrend] = useState<SearchKeywordTrendPayload>();
  const [compareKeywords, setCompareKeywords] = useState<string[]>([]);
  const [compareInput, setCompareInput] = useState("");
  const [visibleSeries, setVisibleSeries] = useState<Set<string>>(new Set());
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);
  const [analyticsError, setAnalyticsError] = useState("");

  const loadCategories = useCallback(async () => {
    setLoadingTaxonomy(true);
    setError("");
    try {
      const result = await serviceSearchAnalyticsApi.listCategories({ page: 1, pageSize: 100 });
      setCategories(result.list);
      setSelectedCategoryId((current) => current && result.list.some((item) => item.id === current) ? current : result.list[0]?.id);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoadingTaxonomy(false);
    }
  }, []);

  useEffect(() => { void loadCategories(); }, [loadCategories]);
  useEffect(() => {
    if (!selectedCategoryId) {
      setKeywords([]);
      setSelectedKeywordId(undefined);
      return;
    }
    let current = true;
    void serviceSearchAnalyticsApi.listKeywords(selectedCategoryId, { page: 1, pageSize: 100 })
      .then((result) => {
        if (!current) return;
        setKeywords(result.list);
        setSelectedKeywordId((selected) => selected && result.list.some((item) => item.id === selected) ? selected : result.list[0]?.id);
      })
      .catch((loadError) => current && setError(errorMessage(loadError)));
    return () => { current = false; };
  }, [selectedCategoryId]);
  useEffect(() => {
    if (!selectedKeywordId) {
      setAliases([]);
      return;
    }
    let current = true;
    void serviceSearchAnalyticsApi.listAliases(selectedKeywordId, { page: 1, pageSize: 100 })
      .then((result) => current && setAliases(result.list))
      .catch((loadError) => current && setError(errorMessage(loadError)));
    return () => { current = false; };
  }, [selectedKeywordId]);

  const reloadSelected = useCallback(async () => {
    const result = await serviceSearchAnalyticsApi.listCategories({ page: 1, pageSize: 100 });
    setCategories(result.list);
    if (!selectedCategoryId) return;
    const keywordResult = await serviceSearchAnalyticsApi.listKeywords(selectedCategoryId, { page: 1, pageSize: 100 });
    setKeywords(keywordResult.list);
    if (!selectedKeywordId) return;
    const aliasResult = await serviceSearchAnalyticsApi.listAliases(selectedKeywordId, { page: 1, pageSize: 100 });
    setAliases(aliasResult.list);
  }, [selectedCategoryId, selectedKeywordId]);

  const mutate = async (action: () => Promise<unknown>, success: string) => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await action();
      await reloadSelected();
      setNotice(success);
      return true;
    } catch (mutationError) {
      setError(errorMessage(mutationError));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const submitCategory = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const body = taxonomyBody(categoryDraft);
      const ok = await mutate(
        () => editingCategory
          ? serviceSearchAnalyticsApi.updateCategory(editingCategory.id, { ...body, expectedVersion: editingCategory.configurationVersion })
          : serviceSearchAnalyticsApi.createCategory(body),
        editingCategory ? "服务类型已更新" : "服务类型已创建"
      );
      if (ok) { setCategoryDraft(emptyTaxonomyDraft()); setEditingCategory(undefined); }
    } catch (validationError) { setError(errorMessage(validationError)); }
  };

  const submitKeyword = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedCategoryId) { setError("请先选择服务类型"); return; }
    try {
      const body = { ...taxonomyBody(keywordDraft), categoryId: selectedCategoryId };
      const ok = await mutate(
        () => editingKeyword
          ? serviceSearchAnalyticsApi.updateKeyword(editingKeyword.id, { ...body, expectedVersion: editingKeyword.configurationVersion })
          : serviceSearchAnalyticsApi.createKeyword(body),
        editingKeyword ? "搜索标签已更新" : "搜索标签已创建"
      );
      if (ok) { setKeywordDraft(emptyTaxonomyDraft()); setEditingKeyword(undefined); }
    } catch (validationError) { setError(errorMessage(validationError)); }
  };

  const submitAlias = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedCategoryId || !selectedKeywordId) { setError("请先选择搜索标签"); return; }
    if (!aliasDraft.alias.trim() || !aliasDraft.reason.trim()) { setError("同义词和设置理由不能为空"); return; }
    const body = {
      categoryId: selectedCategoryId,
      businessKeywordId: selectedKeywordId,
      alias: aliasDraft.alias.trim(),
      isActive: aliasDraft.isActive,
      reason: aliasDraft.reason.trim()
    };
    const ok = await mutate(
      () => editingAlias
        ? serviceSearchAnalyticsApi.updateAlias(editingAlias.id, { ...body, expectedVersion: editingAlias.configurationVersion })
        : serviceSearchAnalyticsApi.createAlias(body),
      editingAlias ? "同义词已更新" : "同义词已创建"
    );
    if (ok) { setAliasDraft(emptyAliasDraft()); setEditingAlias(undefined); }
  };

  const currentFilter = useCallback(() => buildSearchAnalyticsFilter(period, {
    customStart,
    customEnd,
    city,
    categoryId: analyticsCategoryId
  }), [analyticsCategoryId, city, customEnd, customStart, period]);

  const loadAnalytics = useCallback(async () => {
    setLoadingAnalytics(true);
    setAnalyticsError("");
    try {
      const filter = currentFilter();
      const top = await serviceSearchAnalyticsApi.topKeywords(filter);
      setTopKeywords(top);
      setCompareKeywords((current) => current.length ? current : top.list.slice(0, 3).map((item) => item.normalizedKeyword));
    } catch (loadError) {
      setTopKeywords(undefined);
      setAnalyticsError(errorMessage(loadError));
    } finally {
      setLoadingAnalytics(false);
    }
  }, [currentFilter]);

  useEffect(() => { void loadAnalytics(); }, [loadAnalytics]);
  useEffect(() => {
    if (!compareKeywords.length) { setTrend(undefined); return; }
    let current = true;
    let filter: SearchAnalyticsFilter;
    try {
      filter = currentFilter();
    } catch (filterError) {
      setAnalyticsError(errorMessage(filterError));
      setTrend(undefined);
      setLoadingAnalytics(false);
      return;
    }
    setLoadingAnalytics(true);
    void serviceSearchAnalyticsApi.keywordTrend(filter, compareKeywords)
      .then((result) => {
        if (!current) return;
        setTrend(result);
        setVisibleSeries((visible) => {
          const retained = new Set([...visible].filter((keyword) => compareKeywords.includes(keyword)));
          compareKeywords.forEach((keyword) => retained.add(keyword));
          return retained;
        });
      })
      .catch((loadError) => current && setAnalyticsError(errorMessage(loadError)))
      .finally(() => current && setLoadingAnalytics(false));
    return () => { current = false; };
  }, [compareKeywords, currentFilter]);

  const addComparison = (rawKeyword: string) => {
    const keyword = rawKeyword.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/gu, " ");
    if (!keyword) return;
    setCompareKeywords((current) => current.includes(keyword) ? current : current.length < 5 ? [...current, keyword] : current);
    setCompareInput("");
  };
  const maxSearchCount = Math.max(1, ...(topKeywords?.list.map((item) => item.searchCount) ?? [1]));
  const selectedCategory = categories.find((item) => item.id === selectedCategoryId);
  const selectedKeyword = keywords.find((item) => item.id === selectedKeywordId);

  return (
    <AdminLayout>
      <div className="mx-auto max-w-[1680px] px-4 py-5 lg:px-6">
        <ModuleShell title="运营服务类型设置" description="管理正式服务类型、搜索标签和同义词，并查看真实搜索关键词趋势。">
          {error ? <div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm font-black text-red-700">{error}</div> : null}
          {notice ? <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-sm font-black text-emerald-800">{notice}</div> : null}

          <section className="grid gap-4 xl:grid-cols-3">
            <div className={panelClass}>
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#4f87ff]">Formal taxonomy</p><h2 className="mt-1 text-lg font-black">服务类型</h2></div>
                <Badge tone="blue">{categories.length}</Badge>
              </div>
              <div className="mt-4 grid max-h-[350px] gap-2 overflow-y-auto pr-1">
                {loadingTaxonomy ? <p className="py-6 text-center text-sm text-ink/45">正在加载…</p> : null}
                {categories.map((item) => (
                  <TaxonomyListItem active={item.id === selectedCategoryId} badge={`${item.keywordCount} 标签`} code={item.code} enabled={item.isActive} key={item.id} label={localizedName(item)} onEdit={() => { setEditingCategory(item); setCategoryDraft(toDraft(item)); }} onSelect={() => { setSelectedCategoryId(item.id); setSelectedKeywordId(undefined); setEditingKeyword(undefined); setKeywordDraft(emptyTaxonomyDraft()); setEditingAlias(undefined); setAliasDraft(emptyAliasDraft()); }} />
                ))}
                {!loadingTaxonomy && !categories.length ? <p className="rounded-2xl border border-dashed border-line p-5 text-center text-sm text-ink/45">暂无正式服务类型</p> : null}
              </div>
              {canWrite ? <TaxonomyForm draft={categoryDraft} editingLabel={editingCategory ? `编辑服务类型 · ${editingCategory.code}` : undefined} onCancel={() => { setEditingCategory(undefined); setCategoryDraft(emptyTaxonomyDraft()); }} onChange={setCategoryDraft} onSubmit={(event) => { void submitCategory(event); }} saving={saving} /> : null}
            </div>

            <div className={panelClass}>
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#39a990]" data-no-i18n="true">{selectedCategory?.code ?? "NO_CATEGORY"}</p><h2 className="mt-1 text-lg font-black">搜索标签</h2></div>
                <Badge tone="green">{keywords.length}</Badge>
              </div>
              <div className="mt-4 grid max-h-[350px] gap-2 overflow-y-auto pr-1">
                {keywords.map((item) => (
                  <TaxonomyListItem active={item.id === selectedKeywordId} badge={`${item.aliasCount} 同义词`} code={item.code} enabled={item.isActive} key={item.id} label={localizedName(item)} onEdit={() => { setEditingKeyword(item); setKeywordDraft(toDraft(item)); }} onSelect={() => { setSelectedKeywordId(item.id); setEditingAlias(undefined); setAliasDraft(emptyAliasDraft()); }} />
                ))}
                {!selectedCategoryId ? <p className="rounded-2xl border border-dashed border-line p-5 text-center text-sm text-ink/45">请先选择服务类型</p> : null}
                {selectedCategoryId && !keywords.length ? <p className="rounded-2xl border border-dashed border-line p-5 text-center text-sm text-ink/45">当前服务类型暂无搜索标签</p> : null}
              </div>
              {canWrite && selectedCategoryId ? <TaxonomyForm draft={keywordDraft} editingLabel={editingKeyword ? `编辑搜索标签 · ${editingKeyword.code}` : undefined} onCancel={() => { setEditingKeyword(undefined); setKeywordDraft(emptyTaxonomyDraft()); }} onChange={setKeywordDraft} onSubmit={(event) => { void submitKeyword(event); }} saving={saving} /> : null}
            </div>

            <div className={panelClass}>
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-xs font-black uppercase tracking-[0.18em] text-[#b775ff]" data-no-i18n="true">{selectedKeyword?.code ?? "NO_KEYWORD"}</p><h2 className="mt-1 text-lg font-black">同义词</h2></div>
                <Badge tone="neutral">{aliases.length}</Badge>
              </div>
              <div className="mt-4 grid max-h-[350px] gap-2 overflow-y-auto pr-1">
                {aliases.map((item) => (
                  <div className="flex items-center gap-3 rounded-2xl border border-line p-3" key={item.id}>
                    <div className="min-w-0 flex-1"><strong className="block truncate text-sm" data-no-i18n="true">{item.alias}</strong><span className="block truncate text-[11px] text-ink/45" data-no-i18n="true">{item.normalizedAlias}</span></div>
                    <Badge tone={item.isActive ? "green" : "neutral"}>{item.isActive ? "启用" : "停用"}</Badge>
                    {canWrite ? <button className="rounded-lg px-2 py-1 text-xs font-black text-[#4f87ff] hover:bg-[#4f87ff]/10" onClick={() => { setEditingAlias(item); setAliasDraft({ alias: item.alias, isActive: item.isActive, reason: "" }); }} type="button">编辑</button> : null}
                  </div>
                ))}
                {!selectedKeywordId ? <p className="rounded-2xl border border-dashed border-line p-5 text-center text-sm text-ink/45">请先选择搜索标签</p> : null}
                {selectedKeywordId && !aliases.length ? <p className="rounded-2xl border border-dashed border-line p-5 text-center text-sm text-ink/45">当前搜索标签暂无同义词</p> : null}
              </div>
              {canWrite && selectedCategoryId && selectedKeywordId ? (
                <form className="mt-4 grid gap-3 rounded-2xl bg-paper p-4" onSubmit={(event) => { void submitAlias(event); }}>
                  <div className="flex items-center justify-between"><strong className="text-sm">{editingAlias ? `编辑同义词 · #${editingAlias.id}` : "新建同义词"}</strong>{editingAlias ? <Button onClick={() => { setEditingAlias(undefined); setAliasDraft(emptyAliasDraft()); }} size="sm" variant="ghost">取消编辑</Button> : null}</div>
                  <Field label="同义词"><input className={inputClass} onChange={(event) => setAliasDraft((value) => ({ ...value, alias: event.target.value }))} value={aliasDraft.alias} /></Field>
                  <Field label="设置理由"><textarea className="min-h-20 rounded-xl border border-line bg-white p-3 text-sm" onChange={(event) => setAliasDraft((value) => ({ ...value, reason: event.target.value }))} value={aliasDraft.reason} /></Field>
                  <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-xs font-black text-ink/60"><AdminToggleSwitch ariaLabel="启用同义词" checked={aliasDraft.isActive} onChange={(isActive) => setAliasDraft((value) => ({ ...value, isActive }))} />启用</div><Button disabled={saving} size="sm" type="submit">保存更改</Button></div>
                </form>
              ) : null}
            </div>
          </section>

          <section className={cn(panelClass, "relative overflow-hidden")}>
            <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#4f87ff]/10 blur-3xl" />
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div><p className="text-xs font-black uppercase tracking-[0.2em] text-[#4f87ff]">Search intelligence</p><h2 className="mt-1 text-2xl font-black">搜索关键词趋势</h2><p className="mt-1 text-sm text-ink/55">基于成功提交并完成检索的真实搜索事件；按东京自然日统计。</p></div>
              <Badge tone="blue">Asia/Tokyo</Badge>
            </div>
            <form className="relative mt-5 grid gap-3 rounded-2xl border border-line bg-paper p-4 md:grid-cols-2 xl:grid-cols-[180px_1fr_230px_auto]" onSubmit={(event) => { event.preventDefault(); void loadAnalytics(); }}>
              <Field label="时间范围"><select className={inputClass} onChange={(event) => setPeriod(event.target.value as PeriodPreset)} value={period}><option value="today">今日</option><option value="last7days">近7天</option><option value="last30days">近30天</option><option value="month">本月</option><option value="year">今年</option><option value="custom">自定义</option></select></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                {period === "custom" ? <><Field label="开始日期"><input className={inputClass} onChange={(event) => setCustomStart(event.target.value)} type="date" value={customStart} /></Field><Field label="结束日期"><input className={inputClass} onChange={(event) => setCustomEnd(event.target.value)} type="date" value={customEnd} /></Field></> : <><Field label="城市（留空为全部）"><input className={inputClass} onChange={(event) => setCity(event.target.value)} placeholder="例如：東京都" value={city} /></Field><Field label="服务类型"><select className={inputClass} onChange={(event) => setAnalyticsCategoryId(event.target.value ? Number(event.target.value) : undefined)} value={analyticsCategoryId ?? ""}><option value="">全部服务类型</option>{categories.map((item) => <option key={item.id} value={item.id}>{localizedName(item)}</option>)}</select></Field></>}
              </div>
              {period === "custom" ? <div className="grid gap-3 sm:grid-cols-2"><Field label="城市（留空为全部）"><input className={inputClass} onChange={(event) => setCity(event.target.value)} value={city} /></Field><Field label="服务类型"><select className={inputClass} onChange={(event) => setAnalyticsCategoryId(event.target.value ? Number(event.target.value) : undefined)} value={analyticsCategoryId ?? ""}><option value="">全部服务类型</option>{categories.map((item) => <option key={item.id} value={item.id}>{localizedName(item)}</option>)}</select></Field></div> : <div className="hidden xl:block" />}
              <div className="flex items-end"><Button className="w-full" disabled={loadingAnalytics} type="submit">检索</Button></div>
            </form>
            {analyticsError ? <div className="mt-4 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm font-black text-red-700">{analyticsError}</div> : null}

            <div className="relative mt-5 grid gap-5 xl:grid-cols-[380px_1fr]">
              <div className="rounded-2xl border border-line bg-paper p-4">
                <div className="flex items-center justify-between"><h3 className="font-black">搜索关键词 TOP10</h3><span className="text-xs font-black text-ink/45">点击加入对比</span></div>
                <div className="mt-4 grid gap-2">
                  {topKeywords?.list.map((item, index) => (
                    <button className="group relative overflow-hidden rounded-xl border border-line bg-white p-3 text-left" key={`${item.normalizedKeyword}-${item.firstEventId}`} onClick={() => addComparison(item.normalizedKeyword)} type="button">
                      <span aria-hidden="true" className="absolute inset-y-0 left-0 bg-[#4f87ff]/10 transition group-hover:bg-[#4f87ff]/20" style={{ width: `${item.searchCount / maxSearchCount * 100}%` }} />
                      <span className="relative flex items-center gap-3"><strong className="w-6 text-lg text-[#4f87ff]">{index + 1}</strong><span className="min-w-0 flex-1 truncate font-black" data-no-i18n="true">{item.normalizedKeyword}</span><span className="text-right text-xs font-black"><b className="block text-sm">{item.searchCount.toLocaleString()}</b><small className="text-ink/45">搜索次数</small></span></span>
                    </button>
                  ))}
                  {!loadingAnalytics && !topKeywords?.list.length ? <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink/45">当前范围暂无真实搜索数据</p> : null}
                </div>
              </div>

              <div className="min-w-0 rounded-2xl border border-line bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-black">关键词趋势对比</h3><p className="mt-1 text-xs text-ink/50">纵轴：归一化趋势指数（0–100）；悬停数据点查看原始搜索次数。</p></div><Badge tone="neutral">最多对比 5 个关键词</Badge></div>
                <form className="mt-4 flex gap-2" onSubmit={(event) => { event.preventDefault(); addComparison(compareInput); }}><input aria-label="输入对比关键词" className={inputClass} onChange={(event) => setCompareInput(event.target.value)} placeholder="输入关键词后添加" value={compareInput} /><Button disabled={compareKeywords.length >= 5} size="sm" type="submit">添加</Button></form>
                <div className="my-4 flex flex-wrap gap-2">
                  {compareKeywords.map((keyword, index) => {
                    const shown = visibleSeries.has(keyword);
                    return <button aria-pressed={shown} className={cn("flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-black transition", shown ? "border-transparent bg-[#101629] text-white" : "border-line bg-white text-ink/45")} key={keyword} onClick={() => setVisibleSeries((current) => { const next = new Set(current); if (next.has(keyword)) next.delete(keyword); else next.add(keyword); return next; })} type="button"><span className="h-2.5 w-2.5 rounded-full" style={{ background: trendColors[index % trendColors.length] }} /><span data-no-i18n="true">{keyword}</span><span aria-label="从对比中移除" className="ml-1 rounded-full px-1 hover:bg-white/15" onClick={(event) => { event.stopPropagation(); setCompareKeywords((current) => current.filter((item) => item !== keyword)); }}>×</span></button>;
                  })}
                </div>
                {trend ? <TrendChart data={trend} visible={visibleSeries} /> : <div className="grid h-64 place-items-center rounded-2xl border border-dashed border-line text-sm font-bold text-ink/45">选择关键词后显示趋势</div>}
                {trend?.series.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{trend.series.map((series, index) => <article className="rounded-2xl border border-line p-3" key={series.keyword}><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: trendColors[index % trendColors.length] }} /><strong className="truncate text-sm" data-no-i18n="true">{series.keyword}</strong></div><p className="mt-3 text-2xl font-black">{series.totalCount.toLocaleString()}</p><p className="text-xs text-ink/45">原始搜索次数</p></article>)}</div> : null}
              </div>
            </div>
          </section>
        </ModuleShell>
      </div>
    </AdminLayout>
  );
}
