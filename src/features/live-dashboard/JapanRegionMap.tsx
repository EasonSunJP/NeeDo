import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { LiveDashboardScope, LiveDashboardSnapshot } from "../../api/liveDashboard";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { translateTextForContext } from "../../i18n/translations";
import { RegionNavigator } from "./RegionNavigator";
import { layoutMapLabels } from "./mapLabelLayout";
import { IDENTITY_VIEWPORT, mapViewportTransform, panMapViewport, zoomMapViewport } from "./mapViewport";

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
  onSelectRegion: (scope: LiveDashboardScope) => void;
}

const macroRegionColors: Record<string, string> = {
  hokkaido: "#7774cf",
  tohoku: "#4f93df",
  kanto: "#36a05b",
  chubu: "#83b92e",
  kansai: "#d5b31c",
  chugoku: "#eb8b13",
  shikoku: "#d94f3f",
  "kyushu-okinawa": "#ee6672"
};

const prefectureMacroRegion = (code: string): string => {
  const value = Number.parseInt(code.slice(0, 2), 10);
  if (value === 1) return "hokkaido";
  if (value <= 7) return "tohoku";
  if (value <= 14) return "kanto";
  if (value <= 23) return "chubu";
  if (value <= 30) return "kansai";
  if (value <= 35) return "chugoku";
  if (value <= 39) return "shikoku";
  return "kyushu-okinawa";
};

export function mapAssetUrl(scope: LiveDashboardScope): string {
  return scope.admin1
    ? `/maps/jp/2026/prefectures/${scope.admin1}.json`
    : "/maps/jp/2026/country.json";
}

function requireMapAsset(value: unknown, scope: LiveDashboardScope): ProjectedMapAsset {
  if (!value || typeof value !== "object") throw new Error("error.dashboard.invalid_map_asset");
  const asset = value as Partial<ProjectedMapAsset>;
  const expectedLevel = scope.admin1 ? "admin2" : "admin1";
  const expectedParent = scope.admin1 ?? "JP";
  if (
    asset.countryCode !== "JP"
    || asset.sourceVersion !== "N03-20260101"
    || asset.level !== expectedLevel
    || asset.parentCode !== expectedParent
    || !Array.isArray(asset.viewBox)
    || asset.viewBox.length !== 4
    || !asset.viewBox.every((item) => typeof item === "number" && Number.isFinite(item))
    || !Array.isArray(asset.regions)
  ) throw new Error("error.dashboard.invalid_map_asset");
  const codes = new Set<string>();
  for (const region of asset.regions) {
    const validCode = expectedLevel === "admin1" ? /^\d{2}$/u.test(region.code) : /^\d{5}$/u.test(region.code);
    if (
      !validCode
      || codes.has(region.code)
      || region.parentCode !== expectedParent
      || typeof region.nameJa !== "string"
      || !region.nameJa
      || typeof region.path !== "string"
      || !region.path.startsWith("M")
      || (region.labelPoint !== null && (!Array.isArray(region.labelPoint) || region.labelPoint.length !== 2))
    ) throw new Error("error.dashboard.invalid_map_asset");
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

const formatJpy = (value: number, locale: string) => new Intl.NumberFormat(locale, {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0
}).format(value);

export function JapanRegionMap({ breadcrumbs = [], children, onSelectRegion, scope }: JapanRegionMapProps) {
  const { language } = useOptionalI18n();
  const t = (source: string) => translateTextForContext(source, language, { portal: "admin" });
  const [asset, setAsset] = useState<ProjectedMapAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeCode, setActiveCode] = useState<string | null>(scope.admin2 ?? null);
  const [viewport, setViewport] = useState(IDENTITY_VIEWPORT);
  const drag = useRef<{ id: number; x: number; y: number; moved: boolean; target: SVGSVGElement } | null>(null);
  const suppressClick = useRef(false);
  const locale = language === "ja" ? "ja-JP" : language === "ko" ? "ko-KR" : language === "en" ? "en-US" : "zh-CN";

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setAsset(null);
    void loadMapAsset(scope, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setAsset(next);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "error.dashboard.map_unavailable");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [scope.admin1]);

  useEffect(() => setActiveCode(scope.admin2 ?? null), [scope.admin2]);
  useEffect(() => {
    setViewport(IDENTITY_VIEWPORT);
    const current = drag.current;
    if (current?.target.hasPointerCapture?.(current.id)) current.target.releasePointerCapture(current.id);
    drag.current = null;
  }, [asset?.parentCode, asset?.level, scope.admin1, scope.admin2]);

  const childByCode = useMemo(() => new Map(children.map((item) => [item.code, item])), [children]);
  const maximumOrders = Math.max(1, ...children.map((item) => item.orderCount));
  const activeRegion = asset?.regions.find((region) => region.code === activeCode) ?? null;
  const activeData = activeCode ? childByCode.get(activeCode) : null;
  const placements = useMemo(() => asset ? layoutMapLabels({
    regions: asset.regions, viewBox: asset.viewBox, viewport, selectedCode: activeCode,
    orderCountByCode: Object.fromEntries(children.map((item) => [item.code, item.orderCount]))
  }) : [], [asset, viewport, activeCode, children]);
  const nameByCode = useMemo(() => new Map(asset?.regions.map((item) => [item.code, item.nameJa])), [asset]);
  const zoom = (direction: "in" | "out") => {
    if (!asset) return;
    const point = asset.regions.find((item) => item.code === scope.admin2)?.labelPoint;
    const center: [number, number] = point ? [point[0] * viewport.scale + viewport.x, point[1] * viewport.scale + viewport.y]
      : [asset.viewBox[0] + asset.viewBox[2] / 2, asset.viewBox[1] + asset.viewBox[3] / 2];
    setViewport((current) => zoomMapViewport(current, direction, center, asset.viewBox));
  };
  const endDrag = (event: PointerEvent<SVGSVGElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    suppressClick.current = drag.current.moved;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = null;
  };

  const selectRegion = (code: string) => {
    if (scope.admin2 === code) return;
    setActiveCode(code);
    onSelectRegion(scope.admin1
      ? { country: "JP", admin1: scope.admin1, admin2: code, period: scope.period }
      : { country: "JP", admin1: code, period: scope.period });
  };

  const goCountry = () => onSelectRegion({ country: "JP", period: scope.period });
  const goPrefecture = () => scope.admin1 && onSelectRegion({ country: "JP", admin1: scope.admin1, period: scope.period });

  return (
    <section className="live-dashboard-map-card" aria-label={t("日本运营地图")}>
      <RegionNavigator breadcrumbs={breadcrumbs} fallbackChildren={children} onSelectRegion={onSelectRegion} scope={scope} />
      <div className="live-dashboard-map-graphic">
      <div className="live-dashboard-map-toolbar">
        <nav aria-label={t("行政区域层级")} className="live-dashboard-map-breadcrumbs">
          <button disabled={!scope.admin1} onClick={goCountry} type="button">日本</button>
          {scope.admin1 ? <><span>/</span><button disabled={!scope.admin2} onClick={goPrefecture} type="button">{breadcrumbs.find((item) => item.level === "admin1")?.name ?? (scope.admin1 === "13" ? "東京都" : scope.admin1)}</button></> : null}
          {scope.admin2 ? <><span>/</span><strong>{activeRegion?.nameJa ?? scope.admin2}</strong></> : null}
        </nav>
        <span className="live-dashboard-map-source">N03 2026</span>
        <div className="live-dashboard-map-viewport-controls">
          <button aria-label={t("放大地图")} disabled={!asset || viewport.scale >= 4} onClick={() => zoom("in")} type="button">＋</button>
          <button aria-label={t("缩小地图")} disabled={!asset || viewport.scale <= 1} onClick={() => zoom("out")} type="button">−</button>
          <button aria-label={t("还原地图")} disabled={!asset || viewport.scale === 1} onClick={() => setViewport(IDENTITY_VIEWPORT)} type="button">{t("还原")}</button>
        </div>
      </div>
      <div className="live-dashboard-map-tooltip" role="tooltip">
        <strong>{activeRegion?.nameJa ?? t("选择地图中的行政区域")}</strong>
        {activeData ? <span>{t("订单")} {activeData.orderCount} · {formatJpy(activeData.confirmedPayments.jpy, locale)}</span> : null}
      </div>
      <div className="live-dashboard-map-stage" data-loading={loading ? "true" : "false"}>
        {asset ? (
          <svg
            aria-label={t(scope.admin1 ? "市区町村运营分布图" : "日本都道府县运营分布图")}
            className="live-dashboard-map-svg"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            data-zoomed={viewport.scale > 1}
            onPointerDown={(event) => {
              suppressClick.current = false;
              if (viewport.scale <= 1 || event.button !== 0 || drag.current) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, target: event.currentTarget };
            }}
            onPointerMove={(event) => {
              const current = drag.current;
              if (!current || current.id !== event.pointerId) return;
              const rect = event.currentTarget.getBoundingClientRect();
              const ratio = Math.min(rect.width / asset.viewBox[2], rect.height / asset.viewBox[3]);
              if (!(ratio > 0)) return;
              const dx = event.clientX - current.x; const dy = event.clientY - current.y;
              if (!current.moved && Math.hypot(dx, dy) < 4) return;
              current.moved = true;
              current.x = event.clientX; current.y = event.clientY;
              setViewport((previous) => panMapViewport(previous, [dx / ratio, dy / ratio], asset.viewBox));
            }}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onLostPointerCapture={endDrag}
            onClickCapture={(event) => {
              if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; }
            }}
            viewBox={asset.viewBox.join(" ")}
          >
            <g data-map-geometry transform={mapViewportTransform(viewport)}>
            {asset.insets?.map((inset) => (
              <rect
                aria-hidden="true"
                className="live-dashboard-map-inset"
                height={inset.bounds[3]}
                key={inset.name}
                pointerEvents="none"
                rx="10"
                width={inset.bounds[2]}
                x={inset.bounds[0]}
                y={inset.bounds[1]}
              />
            ))}
            <g className="live-dashboard-map-regions">
              {asset.regions.map((region) => {
                const data = childByCode.get(region.code);
                const intensity = data ? Math.ceil((data.orderCount / maximumOrders) * 4) : 0;
                const macroRegion = region.macroRegion ?? prefectureMacroRegion(scope.admin1 ?? region.code);
                const selected = region.code === scope.admin2;
                const label = `${region.nameJa} ${t(scope.admin1 ? "市区町村" : "都道府县")} · ${t("订单")} ${data?.orderCount ?? 0} · ${formatJpy(data?.confirmedPayments.jpy ?? 0, locale)}`;
                return (
                  <path
                    aria-label={label}
                    aria-pressed={selected}
                    className="live-dashboard-map-region"
                    data-intensity={intensity}
                    data-map-region
                    data-region-code={region.code}
                    d={region.path}
                    key={region.code}
                    onBlur={() => setActiveCode(scope.admin2 ?? null)}
                    onClick={() => selectRegion(region.code)}
                    onFocus={() => setActiveCode(region.code)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectRegion(region.code);
                      }
                    }}
                    onMouseEnter={() => setActiveCode(region.code)}
                    onMouseLeave={() => setActiveCode(scope.admin2 ?? null)}
                    role="button"
                    style={{ fill: macroRegionColors[macroRegion] ?? macroRegionColors.kanto }}
                    tabIndex={0}
                    vectorEffect="non-scaling-stroke"
                  />
                );
              })}
            </g>
            {asset.insets?.map((inset) => (
              <text aria-hidden="true" className="live-dashboard-map-inset-label" key={`${inset.name}-label`} pointerEvents="none" x={inset.bounds[0] + 16} y={inset.bounds[1] + 28}>
                {inset.name === "Okinawa" ? "沖縄" : "東京都島しょ部"}
              </text>
            ))}
            </g>
            <g aria-hidden="true" className="live-dashboard-map-leaders" pointerEvents="none">
              {placements.filter((item) => item.external).map((item) => <polyline data-map-leader={item.code} key={item.code} points={item.leader.map((point) => point.join(",")).join(" ")} />)}
            </g>
            <g aria-hidden="true" className="live-dashboard-map-labels" pointerEvents="none">
              {placements.map((item) => (
                <text
                  data-map-label={item.code}
                  key={item.code}
                  textAnchor="middle"
                  dominantBaseline="central"
                  x={item.label[0]}
                  y={item.label[1]}
                >{nameByCode.get(item.code)}</text>
              ))}
            </g>
          </svg>
        ) : error ? <div className="live-dashboard-map-fallback" role="status"><strong>{t("地图暂时无法显示")}</strong><p>{t("请使用行政区域选择器继续查看正式数据")}</p></div> : <div className="live-dashboard-map-loading">{t("正在加载行政地图")}</div>}
      </div>
      </div>
    </section>
  );
}
