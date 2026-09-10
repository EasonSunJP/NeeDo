import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import type { LiveDashboardScope, LiveDashboardSnapshot } from "../../api/liveDashboard";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { translateTextForContext } from "../../i18n/translations";
import { RegionNavigator } from "./RegionNavigator";
import { buildMapHeatScale, mapHeatColor, previousJstDate } from "./mapHeatScale";
import { labelLimitForZoom, layoutMapLabels, PRIMARY_ADMIN1_LABEL_CODES } from "./mapLabelLayout";
import { IDENTITY_VIEWPORT, MAP_MAX_SCALE, mapViewportTransform, panMapGesture, scaleMapViewport, type MapViewport } from "./mapViewport";

type MapRegion = {
  code: string;
  parentCode: string;
  nameJa: string;
  macroRegion?: string;
  path: string;
  labelPoint: [number, number] | null;
};

export interface ProjectedMapAsset {
  countryCode: "JP";
  sourceVersion: "N03-20260101";
  level: "admin1" | "admin2";
  parentCode: "JP" | string;
  viewBox: [number, number, number, number];
  insets?: Array<{ name: string; bounds: [number, number, number, number] }>;
  regions: MapRegion[];
}

interface JapanRegionMapProps {
  scope: LiveDashboardScope;
  children: LiveDashboardSnapshot["children"];
  breadcrumbs?: LiveDashboardSnapshot["scope"]["breadcrumbs"];
  evaluatedAt: string;
  onSelectRegion: (scope: LiveDashboardScope) => void;
}

export function mapAssetUrl(scope: LiveDashboardScope): string {
  return scope.admin1 ? `/maps/jp/2026/prefectures/${scope.admin1}.json` : "/maps/jp/2026/country.json";
}

function requireMapAsset(value: unknown, scope: LiveDashboardScope): ProjectedMapAsset {
  if (!value || typeof value !== "object") throw new Error("error.dashboard.invalid_map_asset");
  const asset = value as Partial<ProjectedMapAsset>;
  const expectedLevel = scope.admin1 ? "admin2" : "admin1";
  const expectedParent = scope.admin1 ?? "JP";
  if (asset.countryCode !== "JP" || asset.sourceVersion !== "N03-20260101" || asset.level !== expectedLevel
    || asset.parentCode !== expectedParent || !Array.isArray(asset.viewBox) || asset.viewBox.length !== 4
    || !asset.viewBox.every((item) => typeof item === "number" && Number.isFinite(item)) || !Array.isArray(asset.regions)) {
    throw new Error("error.dashboard.invalid_map_asset");
  }
  const codes = new Set<string>();
  for (const region of asset.regions) {
    const validCode = expectedLevel === "admin1" ? /^\d{2}$/u.test(region.code) : /^\d{5}$/u.test(region.code);
    if (!validCode || codes.has(region.code) || region.parentCode !== expectedParent || !region.nameJa
      || typeof region.path !== "string" || !region.path.startsWith("M")
      || (region.labelPoint !== null && (!Array.isArray(region.labelPoint) || region.labelPoint.length !== 2))) {
      throw new Error("error.dashboard.invalid_map_asset");
    }
    codes.add(region.code);
  }
  if (expectedLevel === "admin1" && asset.regions.length !== 47) throw new Error("error.dashboard.invalid_map_asset");
  return asset as ProjectedMapAsset;
}

export async function loadMapAsset(scope: LiveDashboardScope, signal: AbortSignal): Promise<ProjectedMapAsset> {
  const response = await fetch(mapAssetUrl(scope), { signal });
  if (!response.ok) throw new Error("error.dashboard.map_unavailable");
  return requireMapAsset(await response.json(), scope);
}

const formatJpy = (value: number, locale: string) => new Intl.NumberFormat(locale, { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(value);
const distance = (points: { x: number; y: number }[]) => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
const midpoint = (points: { x: number; y: number }[]) => ({ x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 });
const primaryCityNames: Readonly<Record<string, string>> = Object.freeze({
  "01": "札幌", "04": "仙台", "11": "さいたま", "12": "千葉", "13": "東京", "14": "横浜",
  "23": "名古屋", "26": "京都", "27": "大阪", "28": "神戸", "34": "広島", "40": "福岡", "47": "那覇"
});

export function JapanRegionMap({ breadcrumbs = [], children, evaluatedAt, onSelectRegion, scope }: JapanRegionMapProps) {
  const { language } = useOptionalI18n();
  const t = (source: string) => translateTextForContext(source, language, { portal: "admin" });
  const [asset, setAsset] = useState<ProjectedMapAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeCode, setActiveCode] = useState<string | null>(scope.admin2 ?? null);
  const [viewport, setViewport] = useState<MapViewport>(IDENTITY_VIEWPORT);
  const [labelViewport, setLabelViewport] = useState<MapViewport>(IDENTITY_VIEWPORT);
  const [interacting, setInteracting] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState<{ width: number; height: number } | null>(null);
  const viewportRef = useRef<MapViewport>(IDENTITY_VIEWPORT);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pan = useRef<{ last: { x: number; y: number }; intent: MapViewport } | null>(null);
  const pinch = useRef<{ distance: number; viewport: MapViewport } | null>(null);
  const gestureMoved = useRef(false);
  const suppressClick = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const locale = language === "ja" ? "ja-JP" : language === "ko" ? "ko-KR" : language === "en" ? "en-US" : "zh-CN";

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setAsset(null);
    void loadMapAsset(scope, controller.signal)
      .then((next) => { if (!controller.signal.aborted) setAsset(next); })
      .catch((caught: unknown) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "error.dashboard.map_unavailable"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [scope.admin1]);

  useEffect(() => setActiveCode(scope.admin2 ?? null), [scope.admin2]);
  useEffect(() => {
    if (!stageRef.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setStageSize((current) => current?.width === width && current.height === height ? current : { width, height });
    });
    observer.observe(stageRef.current);
    return () => observer.disconnect();
  }, []);

  const cancelSettlement = () => { if (settleTimer.current) clearTimeout(settleTimer.current); settleTimer.current = null; };
  const settle = (next = viewportRef.current) => {
    cancelSettlement();
    settleTimer.current = setTimeout(() => {
      setLabelViewport(next);
      setInteracting(false);
      settleTimer.current = null;
    }, 250);
  };
  const updateViewport = (next: MapViewport) => {
    cancelSettlement();
    viewportRef.current = next;
    setViewport(next);
    setInteracting(true);
  };
  const resetViewport = () => {
    cancelSettlement(); pointers.current.clear(); pan.current = null; pinch.current = null;
    viewportRef.current = IDENTITY_VIEWPORT;
    setViewport(IDENTITY_VIEWPORT); setLabelViewport(IDENTITY_VIEWPORT); setInteracting(false);
  };

  useEffect(() => {
    resetViewport();
    return () => cancelSettlement();
  }, [asset?.parentCode, asset?.level, scope.admin1, scope.admin2]);

  const childByCode = useMemo(() => new Map(children.map((item) => [item.code, item])), [children]);
  const heatScale = useMemo(() => buildMapHeatScale(children), [children]);
  const contentPoints = useMemo(() => asset?.regions.flatMap((region) => region.labelPoint ? [region.labelPoint] : []) ?? [], [asset]);
  const activeRegion = asset?.regions.find((region) => region.code === activeCode) ?? null;
  const activeData = activeCode ? childByCode.get(activeCode) : null;
  const labelRegions = useMemo(() => asset?.regions.map((region) => ({
    ...region,
    nameJa: asset.level === "admin1" ? primaryCityNames[region.code] ?? region.nameJa : region.nameJa
  })) ?? [], [asset]);
  const projection = useMemo<MapViewport>(() => {
    if (!asset || !stageSize) return IDENTITY_VIEWPORT;
    const scale = Math.min(stageSize.width / asset.viewBox[2], stageSize.height / asset.viewBox[3]);
    return { scale, x: (stageSize.width - asset.viewBox[2] * scale) / 2 - asset.viewBox[0] * scale, y: (stageSize.height - asset.viewBox[3] * scale) / 2 - asset.viewBox[1] * scale };
  }, [asset, stageSize]);
  const placements = useMemo(() => asset ? layoutMapLabels({
    regions: labelRegions,
    viewBox: stageSize ? [0, 0, stageSize.width, stageSize.height] : asset.viewBox,
    viewport: { scale: labelViewport.scale * projection.scale, x: labelViewport.x * projection.scale + projection.x, y: labelViewport.y * projection.scale + projection.y },
    selectedCode: scope.admin2,
    focusedCode: activeCode,
    orderCountByCode: Object.fromEntries(children.map((item) => [item.code, item.currentDayOrderCount])),
    priorityCodes: asset.level === "admin1" ? PRIMARY_ADMIN1_LABEL_CODES : [],
    maximumLabels: labelLimitForZoom(asset.level, labelViewport.scale, asset.regions.length),
    fontSize: stageSize ? 11 : undefined,
    capacity: "partial"
  }) : [], [activeCode, asset, children, labelRegions, labelViewport, projection, scope.admin2, stageSize]);
  const nameByCode = useMemo(() => new Map(labelRegions.map((item) => [item.code, item.nameJa])), [labelRegions]);

  const toAssetPoint = (clientX: number, clientY: number, svg: SVGSVGElement): [number, number] => {
    if (!asset) return [0, 0];
    const rect = svg.getBoundingClientRect();
    const width = stageSize?.width ?? asset.viewBox[2];
    const height = stageSize?.height ?? asset.viewBox[3];
    const svgX = (clientX - rect.left) * width / Math.max(1, rect.width);
    const svgY = (clientY - rect.top) * height / Math.max(1, rect.height);
    return [(svgX - projection.x) / projection.scale, (svgY - projection.y) / projection.scale];
  };
  const visibleCenter = (): [number, number] => asset
    ? [asset.viewBox[0] + asset.viewBox[2] / 2, asset.viewBox[1] + asset.viewBox[3] / 2]
    : [0, 0];

  const endPointer = (event: ReactPointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (pointers.current.size === 1) {
      const remaining = [...pointers.current.values()][0];
      pan.current = { last: remaining, intent: viewportRef.current };
      pinch.current = null;
    } else if (pointers.current.size === 0) {
      suppressClick.current = gestureMoved.current;
      pan.current = null; pinch.current = null;
      if (gestureMoved.current) settle();
      gestureMoved.current = false;
    }
  };

  const selectRegion = (code: string) => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (scope.admin2 === code) return;
    setActiveCode(code);
    onSelectRegion(scope.admin1
      ? { country: "JP", admin1: scope.admin1, admin2: code, period: scope.period }
      : { country: "JP", admin1: code, period: scope.period });
  };

  return (
    <section className="live-dashboard-map-card" aria-label={t("日本运营地图")}>
      <RegionNavigator breadcrumbs={breadcrumbs} fallbackChildren={children} onSelectRegion={onSelectRegion} scope={scope} />
      <div className="live-dashboard-map-graphic">
        <div className="live-dashboard-map-toolbar">
          <nav aria-label={t("行政区域层级")} className="live-dashboard-map-breadcrumbs">
            <button disabled={!scope.admin1} onClick={() => onSelectRegion({ country: "JP", period: scope.period })} type="button">日本</button>
            {scope.admin1 ? <><span>/</span><strong>{breadcrumbs.find((item) => item.level === "admin1")?.name ?? scope.admin1}</strong></> : null}
          </nav>
          <span className="live-dashboard-map-source">N03 2026</span>
          <div className="live-dashboard-map-viewport-controls">
            <label><span>{t("地图缩放")}</span><input aria-label={t("地图缩放")} aria-valuetext={`${viewport.scale.toFixed(1)}×`} disabled={!asset} max="100" min="0" onChange={(event) => {
              if (!asset) return;
              const nextScale = 1 + Number(event.currentTarget.value) / 100 * (MAP_MAX_SCALE - 1);
              const next = scaleMapViewport(viewportRef.current, nextScale, visibleCenter(), asset.viewBox, contentPoints);
              updateViewport(next); settle(next);
            }} onPointerDown={() => setInteracting(true)} onPointerUp={() => settle()} type="range" value={Math.round((viewport.scale - 1) / (MAP_MAX_SCALE - 1) * 100)} /></label>
            <output>{viewport.scale.toFixed(1)}×</output>
            <button aria-label={t("还原地图")} disabled={!asset || viewport.scale === 1} onClick={resetViewport} type="button">{t("还原")}</button>
          </div>
        </div>
        <div className="live-dashboard-map-tooltip" role="tooltip">
          <strong>{activeRegion?.nameJa ?? t("将鼠标移到地图上查看地区")}</strong>
          {activeData ? <span>{t("今日订单")} {activeData.currentDayOrderCount} · {t("昨日订单")} {activeData.previousDayOrderCount} · {formatJpy(activeData.confirmedPayments.jpy, locale)}</span> : null}
        </div>
        <div ref={stageRef} className="live-dashboard-map-stage" data-loading={loading ? "true" : "false"}>
          {asset ? <svg
            aria-label={t(scope.admin1 ? "市区町村运营分布图" : "日本都道府县运营分布图")}
            className="live-dashboard-map-svg"
            data-zoomed={viewport.scale > 1}
            onClickCapture={(event) => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}
            onPointerDown={(event) => {
              if (event.pointerType === "mouse" && event.button !== 0) return;
              pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
              gestureMoved.current = false;
              const points = [...pointers.current.values()];
              if (points.length === 2) {
                for (const pointerId of pointers.current.keys()) event.currentTarget.setPointerCapture?.(pointerId);
                pinch.current = { distance: Math.max(1, distance(points)), viewport: viewportRef.current };
                pan.current = null; setInteracting(true);
              } else if (points.length === 1 && viewportRef.current.scale > 1) {
                pan.current = { last: points[0], intent: viewportRef.current };
              }
            }}
            onPointerMove={(event) => {
              if (!asset || !pointers.current.has(event.pointerId)) return;
              const previous = pointers.current.get(event.pointerId)!;
              pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
              const points = [...pointers.current.values()];
              if (points.length >= 2 && pinch.current) {
                const center = midpoint(points);
                const next = scaleMapViewport(pinch.current.viewport, pinch.current.viewport.scale * distance(points) / pinch.current.distance, toAssetPoint(center.x, center.y, event.currentTarget), asset.viewBox, contentPoints);
                gestureMoved.current = true; updateViewport(next); return;
              }
              if (points.length === 1 && pan.current && Math.hypot(event.clientX - previous.x, event.clientY - previous.y) >= 2) {
                event.currentTarget.setPointerCapture?.(event.pointerId);
                const rect = event.currentTarget.getBoundingClientRect();
                const renderedScale = Math.min(rect.width / (stageSize?.width ?? asset.viewBox[2]), rect.height / (stageSize?.height ?? asset.viewBox[3])) * projection.scale;
                const dx = (event.clientX - pan.current.last.x) / Math.max(renderedScale, 0.0001);
                const dy = (event.clientY - pan.current.last.y) / Math.max(renderedScale, 0.0001);
                const next = panMapGesture(pan.current.intent, [dx, dy], asset.viewBox, contentPoints);
                pan.current = { last: { x: event.clientX, y: event.clientY }, intent: next.intent };
                gestureMoved.current = true; updateViewport(next.viewport);
              }
            }}
            onPointerUp={endPointer}
            onPointerCancel={endPointer}
            onWheel={(event: ReactWheelEvent<SVGSVGElement>) => {
              event.preventDefault();
              const next = scaleMapViewport(viewportRef.current, viewportRef.current.scale * Math.exp(-event.deltaY * 0.002), toAssetPoint(event.clientX, event.clientY, event.currentTarget), asset.viewBox, contentPoints);
              updateViewport(next); settle(next);
            }}
            preserveAspectRatio="xMidYMid meet"
            role="img"
            viewBox={stageSize ? `0 0 ${stageSize.width} ${stageSize.height}` : asset.viewBox.join(" ")}
          >
            <g data-map-projection transform={mapViewportTransform(projection)}>
              <g data-map-geometry transform={mapViewportTransform(viewport)}>
                {asset.insets?.map((inset) => <rect aria-hidden="true" className="live-dashboard-map-inset" height={inset.bounds[3]} key={inset.name} pointerEvents="none" rx="10" width={inset.bounds[2]} x={inset.bounds[0]} y={inset.bounds[1]} />)}
                <g className="live-dashboard-map-regions">
                  {asset.regions.map((region) => {
                    const data = childByCode.get(region.code);
                    const selected = region.code === scope.admin2;
                    const label = `${region.nameJa} · ${t("今日订单")} ${data?.currentDayOrderCount ?? 0} · ${t("昨日订单")} ${data?.previousDayOrderCount ?? 0}`;
                    return <path aria-label={label} aria-pressed={selected} className="live-dashboard-map-region" data-map-region data-region-code={region.code} d={region.path} key={region.code}
                      onBlur={() => setActiveCode(scope.admin2 ?? null)} onClick={() => selectRegion(region.code)} onFocus={() => setActiveCode(region.code)}
                      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectRegion(region.code); } }}
                      onMouseEnter={() => { if (!interacting) setActiveCode(region.code); }} onMouseLeave={() => { if (!interacting) setActiveCode(scope.admin2 ?? null); }}
                      role="button" style={{ fill: mapHeatColor(data?.currentDayOrderCount ?? 0, heatScale) }} tabIndex={0} vectorEffect="non-scaling-stroke" />;
                  })}
                </g>
              </g>
            </g>
            <g aria-hidden="true" className="live-dashboard-map-labels" data-hidden={interacting ? "true" : "false"} pointerEvents="none" style={stageSize ? { fontSize: 11, strokeWidth: 2 } : undefined}>
              {placements.map((item) => <text data-map-label={item.code} dominantBaseline="central" key={item.code} textAnchor="middle" x={item.label[0]} y={item.label[1]}>{nameByCode.get(item.code)}</text>)}
            </g>
          </svg> : error ? <div className="live-dashboard-map-fallback" role="status"><strong>{t("地图暂时无法显示")}</strong><p>{t("请使用行政区域选择器继续查看正式数据")}</p></div> : <div className="live-dashboard-map-loading">{t("正在加载行政地图")}</div>}
        </div>
        <div className="live-dashboard-map-heat-legend" aria-label={t("订单热度图例")}>
          <span>{t("昨日最低")} {heatScale.minimum}</span><i aria-hidden="true" /><span>{t("昨日最高")} {heatScale.maximum}</span><small>{previousJstDate(evaluatedAt)} · JST</small>
        </div>
      </div>
    </section>
  );
}
