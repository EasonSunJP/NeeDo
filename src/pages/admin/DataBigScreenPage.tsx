import { useMemo, useState, useEffect, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { AvatarImage } from "../../components/ui/AvatarImage";
import { CloseIconButton } from "../../components/ui/CloseIconButton";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import { services, stores, technicians } from "../../data/mock";
import { yen } from "../../lib/utils";
import { detectSystemAdminTheme, isDarkAdminTheme, normalizeAdminTheme, platformAdminThemeOptions, type AdminTheme } from "../../theme/AdminTheme";

type WardMetric = {
  name: string;
  orders: number;
  revenue: number;
  activeTechnicians: number;
};

type PrefectureMetric = {
  name: string;
  orders: number;
  revenue: number;
  activeTechnicians: number;
  risk: number;
  x: number;
  y: number;
  wards: WardMetric[];
};

type JapanRegion = {
  id: string;
  name: string;
  path: string;
  labelX: number;
  labelY: number;
  color: string;
  prefectures: PrefectureMetric[];
};

type MapHotspot = {
  id: string;
  regionId: JapanRegion["id"];
  label: string;
  left: number;
  top: number;
  strength: "high" | "medium" | "low";
};

const adminThemeStorageKey = "needo.admin.theme";
const adminThemePreferenceModeStorageKey = "needo.admin.theme.mode";

const japanRegions: JapanRegion[] = [
  {
    id: "hokkaido",
    name: "北海道",
    path: "M365 32 L472 58 L456 120 L356 116 L326 76 Z",
    labelX: 398,
    labelY: 82,
    color: "#13d8ff",
    prefectures: [
      { name: "北海道", orders: 326, revenue: 4280000, activeTechnicians: 86, risk: 12, x: 412, y: 82, wards: [
        { name: "札幌市中央区", orders: 82, revenue: 1180000, activeTechnicians: 24 },
        { name: "函館市", orders: 46, revenue: 620000, activeTechnicians: 13 },
        { name: "旭川市", orders: 39, revenue: 540000, activeTechnicians: 11 }
      ] }
    ]
  },
  {
    id: "tohoku",
    name: "東北",
    path: "M315 118 L390 142 L374 246 L310 230 L292 160 Z",
    labelX: 338,
    labelY: 176,
    color: "#20a8ff",
    prefectures: [
      { name: "青森県", orders: 118, revenue: 1360000, activeTechnicians: 31, risk: 8, x: 342, y: 142, wards: [
        { name: "青森市", orders: 36, revenue: 420000, activeTechnicians: 9 },
        { name: "八戸市", orders: 31, revenue: 360000, activeTechnicians: 8 }
      ] },
      { name: "宮城県", orders: 284, revenue: 3820000, activeTechnicians: 64, risk: 14, x: 336, y: 198, wards: [
        { name: "仙台市青葉区", orders: 86, revenue: 1210000, activeTechnicians: 20 },
        { name: "仙台市宮城野区", orders: 58, revenue: 760000, activeTechnicians: 13 }
      ] },
      { name: "福島県", orders: 176, revenue: 2180000, activeTechnicians: 42, risk: 11, x: 330, y: 226, wards: [
        { name: "福島市", orders: 48, revenue: 580000, activeTechnicians: 11 },
        { name: "郡山市", orders: 52, revenue: 640000, activeTechnicians: 12 }
      ] }
    ]
  },
  {
    id: "kanto",
    name: "関東",
    path: "M276 238 L374 252 L384 336 L304 356 L250 304 Z",
    labelX: 314,
    labelY: 296,
    color: "#00e5d4",
    prefectures: [
      { name: "東京都", orders: 1820, revenue: 28600000, activeTechnicians: 438, risk: 21, x: 322, y: 306, wards: [
        { name: "新宿区", orders: 328, revenue: 5260000, activeTechnicians: 72 },
        { name: "港区", orders: 286, revenue: 4820000, activeTechnicians: 66 },
        { name: "渋谷区", orders: 264, revenue: 4380000, activeTechnicians: 61 },
        { name: "中央区", orders: 194, revenue: 3290000, activeTechnicians: 44 }
      ] },
      { name: "神奈川県", orders: 728, revenue: 10400000, activeTechnicians: 186, risk: 16, x: 306, y: 332, wards: [
        { name: "横浜市西区", orders: 148, revenue: 2180000, activeTechnicians: 38 },
        { name: "川崎市中原区", orders: 116, revenue: 1620000, activeTechnicians: 29 }
      ] },
      { name: "埼玉県", orders: 486, revenue: 6120000, activeTechnicians: 121, risk: 13, x: 308, y: 270, wards: [
        { name: "さいたま市大宮区", orders: 108, revenue: 1360000, activeTechnicians: 25 },
        { name: "川口市", orders: 86, revenue: 1040000, activeTechnicians: 20 }
      ] },
      { name: "千葉県", orders: 392, revenue: 5240000, activeTechnicians: 96, risk: 10, x: 354, y: 318, wards: [
        { name: "千葉市中央区", orders: 92, revenue: 1210000, activeTechnicians: 22 },
        { name: "船橋市", orders: 84, revenue: 1080000, activeTechnicians: 19 }
      ] }
    ]
  },
  {
    id: "chubu",
    name: "中部",
    path: "M188 238 L278 236 L250 332 L178 370 L142 316 Z",
    labelX: 206,
    labelY: 302,
    color: "#58ffb5",
    prefectures: [
      { name: "愛知県", orders: 618, revenue: 8460000, activeTechnicians: 152, risk: 12, x: 206, y: 342, wards: [
        { name: "名古屋市中区", orders: 156, revenue: 2260000, activeTechnicians: 38 },
        { name: "豊田市", orders: 74, revenue: 920000, activeTechnicians: 18 }
      ] },
      { name: "静岡県", orders: 318, revenue: 3920000, activeTechnicians: 82, risk: 9, x: 246, y: 338, wards: [
        { name: "静岡市葵区", orders: 78, revenue: 940000, activeTechnicians: 18 },
        { name: "浜松市中央区", orders: 66, revenue: 820000, activeTechnicians: 16 }
      ] },
      { name: "長野県", orders: 192, revenue: 2380000, activeTechnicians: 49, risk: 7, x: 222, y: 268, wards: [
        { name: "長野市", orders: 52, revenue: 640000, activeTechnicians: 13 },
        { name: "松本市", orders: 48, revenue: 580000, activeTechnicians: 12 }
      ] }
    ]
  },
  {
    id: "kansai",
    name: "関西",
    path: "M126 332 L182 368 L170 430 L110 422 L82 374 Z",
    labelX: 134,
    labelY: 384,
    color: "#f8cf5a",
    prefectures: [
      { name: "大阪府", orders: 936, revenue: 13200000, activeTechnicians: 224, risk: 18, x: 132, y: 386, wards: [
        { name: "大阪市北区", orders: 206, revenue: 3120000, activeTechnicians: 52 },
        { name: "大阪市中央区", orders: 188, revenue: 2860000, activeTechnicians: 46 },
        { name: "堺市堺区", orders: 88, revenue: 1180000, activeTechnicians: 21 }
      ] },
      { name: "京都府", orders: 394, revenue: 5620000, activeTechnicians: 98, risk: 11, x: 146, y: 356, wards: [
        { name: "京都市中京区", orders: 96, revenue: 1380000, activeTechnicians: 23 },
        { name: "京都市下京区", orders: 82, revenue: 1120000, activeTechnicians: 19 }
      ] },
      { name: "兵庫県", orders: 428, revenue: 6040000, activeTechnicians: 106, risk: 13, x: 106, y: 376, wards: [
        { name: "神戸市中央区", orders: 112, revenue: 1580000, activeTechnicians: 27 },
        { name: "西宮市", orders: 74, revenue: 980000, activeTechnicians: 18 }
      ] }
    ]
  },
  {
    id: "chugoku",
    name: "中国",
    path: "M54 344 L124 334 L82 410 L22 402 Z",
    labelX: 68,
    labelY: 374,
    color: "#ff9a3d",
    prefectures: [
      { name: "広島県", orders: 284, revenue: 3620000, activeTechnicians: 72, risk: 9, x: 66, y: 374, wards: [
        { name: "広島市中区", orders: 76, revenue: 960000, activeTechnicians: 18 },
        { name: "福山市", orders: 46, revenue: 580000, activeTechnicians: 12 }
      ] },
      { name: "岡山県", orders: 218, revenue: 2860000, activeTechnicians: 54, risk: 8, x: 100, y: 360, wards: [
        { name: "岡山市北区", orders: 62, revenue: 790000, activeTechnicians: 15 },
        { name: "倉敷市", orders: 52, revenue: 660000, activeTechnicians: 13 }
      ] }
    ]
  },
  {
    id: "shikoku",
    name: "四国",
    path: "M66 432 L136 424 L120 472 L50 468 Z",
    labelX: 86,
    labelY: 450,
    color: "#ff66d8",
    prefectures: [
      { name: "愛媛県", orders: 126, revenue: 1480000, activeTechnicians: 31, risk: 7, x: 76, y: 448, wards: [
        { name: "松山市", orders: 44, revenue: 520000, activeTechnicians: 11 },
        { name: "今治市", orders: 24, revenue: 290000, activeTechnicians: 6 }
      ] },
      { name: "香川県", orders: 112, revenue: 1320000, activeTechnicians: 28, risk: 6, x: 116, y: 438, wards: [
        { name: "高松市", orders: 48, revenue: 580000, activeTechnicians: 12 },
        { name: "丸亀市", orders: 22, revenue: 260000, activeTechnicians: 6 }
      ] }
    ]
  },
  {
    id: "kyushu",
    name: "九州・沖縄",
    path: "M48 452 L112 486 L82 568 L24 546 L18 492 Z M132 578 L162 588 L144 610 L118 600 Z",
    labelX: 64,
    labelY: 520,
    color: "#8b7cff",
    prefectures: [
      { name: "福岡県", orders: 562, revenue: 7420000, activeTechnicians: 136, risk: 13, x: 62, y: 486, wards: [
        { name: "福岡市中央区", orders: 146, revenue: 1980000, activeTechnicians: 35 },
        { name: "博多区", orders: 128, revenue: 1740000, activeTechnicians: 31 }
      ] },
      { name: "熊本県", orders: 186, revenue: 2240000, activeTechnicians: 46, risk: 8, x: 64, y: 534, wards: [
        { name: "熊本市中央区", orders: 62, revenue: 760000, activeTechnicians: 15 },
        { name: "八代市", orders: 24, revenue: 280000, activeTechnicians: 6 }
      ] },
      { name: "沖縄県", orders: 148, revenue: 1920000, activeTechnicians: 38, risk: 10, x: 140, y: 594, wards: [
        { name: "那覇市", orders: 74, revenue: 980000, activeTechnicians: 18 },
        { name: "沖縄市", orders: 28, revenue: 340000, activeTechnicians: 7 }
      ] }
    ]
  }
];

const mapHotspots: MapHotspot[] = [
  { id: "sapporo", regionId: "hokkaido", label: "札幌", left: 74, top: 16, strength: "medium" },
  { id: "sendai", regionId: "tohoku", label: "仙台", left: 67, top: 38, strength: "medium" },
  { id: "tokyo", regionId: "kanto", label: "東京", left: 64, top: 55, strength: "high" },
  { id: "nagoya", regionId: "chubu", label: "名古屋", left: 51, top: 61, strength: "high" },
  { id: "osaka", regionId: "kansai", label: "大阪", left: 43, top: 66, strength: "high" },
  { id: "hiroshima", regionId: "chugoku", label: "広島", left: 32, top: 70, strength: "medium" },
  { id: "matsuyama", regionId: "shikoku", label: "松山", left: 39, top: 75, strength: "low" },
  { id: "fukuoka", regionId: "kyushu", label: "福岡", left: 22, top: 77, strength: "high" },
  { id: "naha", regionId: "kyushu", label: "那覇", left: 13, top: 31, strength: "low" }
];

function getInitialAdminTheme(): AdminTheme {
  if (typeof window === "undefined") {
    return "pink-purple-black";
  }

  const stored = window.localStorage.getItem(adminThemeStorageKey);
  const preferenceMode = window.localStorage.getItem(adminThemePreferenceModeStorageKey);

  if (preferenceMode === "manual") {
    return normalizeAdminTheme(stored, "pink-purple-black", platformAdminThemeOptions, "blue-black");
  }

  return detectSystemAdminTheme("pink-purple-black", "blue-black", platformAdminThemeOptions);
}

function getRegionTotals(region: JapanRegion) {
  return {
    orders: region.prefectures.reduce((sum, item) => sum + item.orders, 0),
    revenue: region.prefectures.reduce((sum, item) => sum + item.revenue, 0),
    technicians: region.prefectures.reduce((sum, item) => sum + item.activeTechnicians, 0),
    risks: region.prefectures.reduce((sum, item) => sum + item.risk, 0)
  };
}

function formatDateTime(date: Date) {
  const datePart = date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  });
  const timePart = date.toLocaleTimeString("zh-CN", { hour12: false });

  return `${datePart} ${timePart}`;
}

function RingMetric({ label, value, tone }: { label: string; value: string | number; tone: string }) {
  return (
    <div className="grid place-items-center gap-2">
      <div
        className="grid h-24 w-24 place-items-center rounded-full text-2xl font-black"
        style={{ background: `conic-gradient(${tone} 0 76%, color-mix(in srgb, var(--admin-line) 82%, transparent) 76% 100%)`, color: tone }}
      >
        <span className="grid h-[74px] w-[74px] place-items-center rounded-full bg-[var(--admin-surface)] text-[var(--admin-text)]">{value}</span>
      </div>
      <p className="text-xs font-black text-[var(--admin-muted)]">{label}</p>
    </div>
  );
}

function DataPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="big-screen-panel">
      <h2 className="big-screen-panel-title">{title}</h2>
      {children}
    </section>
  );
}

function JapanMap({
  selectedRegion,
  onSelect
}: {
  selectedRegion: JapanRegion | null;
  onSelect: (region: JapanRegion) => void;
}) {
  const selectedRegionId = selectedRegion?.id;

  return (
    <div className="big-screen-map-card relative min-h-[620px] overflow-hidden rounded-lg">
      <div className="absolute left-4 top-4 z-10 rounded-full border border-[var(--admin-line)] bg-[var(--admin-surface)] px-4 py-2 text-xs font-black text-[var(--admin-muted)] shadow-panel">
        真实都道府县地图 · 点击城市热点放大
      </div>

      <img
        alt="日本都道府县真实地图"
        className="big-screen-real-map absolute inset-0 h-full w-full object-contain p-8"
        src="/images/japan-prefectures.svg"
      />

      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
        <path className="big-screen-flow flow-one" d="M18 78 C34 68 44 64 64 55" />
        <path className="big-screen-flow flow-two" d="M23 77 C41 72 51 67 74 18" />
        <path className="big-screen-flow flow-three" d="M42 66 C52 63 59 59 67 38" />
      </svg>

      {mapHotspots.map((hotspot) => {
        const region = japanRegions.find((item) => item.id === hotspot.regionId);

        if (!region) {
          return null;
        }

        const totals = getRegionTotals(region);
        const isSelected = selectedRegionId === hotspot.regionId;

        return (
          <button
            aria-label={`${hotspot.label} ${region.name} 运营数据`}
            className={`big-screen-hotspot is-${hotspot.strength} ${isSelected ? "is-active" : ""}`}
            key={hotspot.id}
            onClick={() => onSelect(region)}
            style={{ left: `${hotspot.left}%`, top: `${hotspot.top}%` }}
            type="button"
          >
            <span className="big-screen-hotspot-pulse" />
            <span className="big-screen-hotspot-dot" />
            <span className="big-screen-hotspot-card">
              <strong>{hotspot.label}</strong>
              <span>{region.name} · {totals.orders.toLocaleString("ja-JP")} 单</span>
            </span>
          </button>
        );
      })}

      <div className="absolute bottom-4 left-4 right-4 z-10 grid gap-3 rounded-lg border border-[var(--admin-line)] bg-[var(--admin-surface)] p-4 shadow-panel md:grid-cols-3">
        {[
          ["覆盖区域", "47 都道府县"],
          ["重点城市", `${mapHotspots.length} 个实时热点`],
          ["放大层级", "区域 → 都道府县 → 区 / 市"]
        ].map(([label, value]) => (
          <div key={label}>
            <p className="text-xs font-bold text-[var(--admin-muted)]">{label}</p>
            <strong className="mt-1 block text-lg text-[var(--admin-text)]">{value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function RegionDrilldown({
  region,
  onClose
}: {
  region: JapanRegion;
  onClose: () => void;
}) {
  const [selectedPrefecture, setSelectedPrefecture] = useState(region.prefectures[0]);
  const maxWardOrders = Math.max(...selectedPrefecture.wards.map((ward) => ward.orders), 1);

  useEffect(() => {
    setSelectedPrefecture(region.prefectures[0]);
  }, [region]);

  return (
    <div className="fixed inset-0 z-50 bg-black/55 p-4 text-[var(--admin-text)] backdrop-blur-sm">
      <div className="mx-auto flex h-full max-w-[1480px] flex-col overflow-hidden rounded-lg border border-[var(--admin-line)] bg-[var(--admin-surface)] shadow-[var(--admin-card-shadow-strong)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--admin-line)] px-5 py-4">
          <div>
            <p className="text-xs font-black tracking-[0.24em] text-[var(--admin-accent)]">日本区域深挖</p>
            <h2 className="mt-1 text-3xl font-black text-[var(--admin-text)]">{region.name} 放大视图</h2>
          </div>
          <CloseIconButton label="关闭区域放大视图" onClick={onClose} />
        </header>
        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 lg:grid-cols-[1fr,420px]">
          <section className="rounded-lg border border-[var(--admin-line)] bg-[var(--admin-muted-surface)] p-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {region.prefectures.map((prefecture) => (
                <button
                  className={`rounded-lg border p-4 text-left transition ${selectedPrefecture.name === prefecture.name ? "border-[var(--admin-accent)] bg-[var(--admin-surface)] shadow-panel" : "border-[var(--admin-line)] bg-[var(--admin-surface)] hover:border-[var(--admin-accent)]"}`}
                  key={prefecture.name}
                  onClick={() => setSelectedPrefecture(prefecture)}
                  type="button"
                >
                  <p className="text-xs font-black text-[var(--admin-accent)]">都道府县</p>
                  <h3 className="mt-1 text-xl font-black text-[var(--admin-text)]">{prefecture.name}</h3>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                    <span className="text-[var(--admin-muted)]">订单 <strong className="block text-[var(--admin-text)]">{prefecture.orders}</strong></span>
                    <span className="text-[var(--admin-muted)]">技师 <strong className="block text-[var(--admin-text)]">{prefecture.activeTechnicians}</strong></span>
                    <span className="text-[var(--admin-muted)]">风险 <strong className="block text-[var(--admin-danger)]">{prefecture.risk}</strong></span>
                  </div>
                </button>
              ))}
            </div>
          </section>
          <aside className="space-y-4">
            <DataPanel title={`${selectedPrefecture.name} 实时概况`}>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["今日订单", selectedPrefecture.orders],
                  ["今日流水", yen(selectedPrefecture.revenue)],
                  ["在线技师", selectedPrefecture.activeTechnicians],
                  ["风险提醒", selectedPrefecture.risk]
                ].map(([label, value]) => (
                  <div className="rounded-lg bg-[var(--admin-muted-surface)] p-3" key={label}>
                    <p className="text-xs text-[var(--admin-muted)]">{label}</p>
                    <strong className="mt-1 block text-lg text-[var(--admin-text)]">{value}</strong>
                  </div>
                ))}
              </div>
            </DataPanel>
            <DataPanel title="区 / 市 数据">
              <div className="space-y-3">
                {selectedPrefecture.wards.map((ward) => (
                  <article className="rounded-lg bg-[var(--admin-muted-surface)] p-3" key={ward.name}>
                    <div className="flex items-center justify-between gap-3">
                      <strong className="text-[var(--admin-text)]">{ward.name}</strong>
                      <span className="text-xs font-bold text-[var(--admin-accent)]">{yen(ward.revenue)}</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--admin-line)]">
                      <span className="block h-full rounded-full bg-[var(--admin-accent)]" style={{ width: `${Math.max(8, (ward.orders / maxWardOrders) * 100)}%` }} />
                    </div>
                    <p className="mt-2 text-xs text-[var(--admin-muted)]">{ward.orders} 单 · {ward.activeTechnicians} 名在线技师</p>
                  </article>
                ))}
              </div>
            </DataPanel>
          </aside>
        </div>
      </div>
    </div>
  );
}

export function DataBigScreenPage({
  backLabel = "返回分析中心",
  backTo = "/admin/analytics"
}: {
  backLabel?: string;
  backTo?: string;
} = {}) {
  const [now, setNow] = useState(() => new Date());
  const [selectedRegion, setSelectedRegion] = useState<JapanRegion | null>(null);
  const [theme] = useState<AdminTheme>(getInitialAdminTheme);
  const totals = useMemo(() => {
    const prefectures = japanRegions.flatMap((region) => region.prefectures);

    return {
      orders: prefectures.reduce((sum, item) => sum + item.orders, 0),
      revenue: prefectures.reduce((sum, item) => sum + item.revenue, 0),
      technicians: prefectures.reduce((sum, item) => sum + item.activeTechnicians, 0),
      risks: prefectures.reduce((sum, item) => sum + item.risk, 0)
    };
  }, []);
  const topServices = services.slice(0, 6);
  const topTechnicians = technicians.slice(0, 6);
  const topStores = stores.slice(0, 5);
  const sevenDaySales = [42, 48, 46, 62, 58, 96, 72];
  const latestOrders = [
    { time: "03:28:12", item: "上门肩颈舒缓按摩", person: "佐藤 美咲", amount: 12800, status: "已接单" },
    { time: "03:21:46", item: "空调分解清洗", person: "田中 翔太", amount: 16800, status: "待派单" },
    { time: "03:14:03", item: "两小时家庭日常保洁", person: "王 静", amount: 6800, status: "服务中" }
  ];

  function handleEnterFullScreen() {
    void document.documentElement.requestFullscreen?.();
  }

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className={`admin-shell admin-big-screen admin-theme-${theme} min-h-screen overflow-y-auto text-[var(--admin-text)]`}>
      <header className="sticky top-0 z-30 border-b border-[var(--admin-line)] bg-[var(--admin-topbar)] px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black tracking-[0.22em] text-[var(--admin-accent)]">NeeDo 实时运营</p>
            <TitleWithInfo
              as="h1"
              className="mt-1"
              info="真实日本都道府县地图，支持区域、都道府县、区 / 市数据逐级查看。"
              label="数据大屏说明"
              title="数据大屏"
              titleClassName="text-3xl font-black tracking-tight text-[var(--admin-text)]"
              variant={isDarkAdminTheme(theme) ? "dark" : "paper"}
            />
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <span className="rounded-full border border-[var(--admin-line)] bg-[var(--admin-surface)] px-4 py-2 text-sm font-black text-[var(--admin-text)] shadow-panel">
              {formatDateTime(now)}
            </span>
            <NavLink className="rounded-full border border-[var(--admin-line)] bg-[var(--admin-surface)] px-4 py-2 text-sm font-black text-[var(--admin-text)] hover:border-[var(--admin-accent)] hover:text-[var(--admin-accent)]" to={backTo}>
              {backLabel}
            </NavLink>
            <button className="rounded-full bg-[var(--admin-accent)] px-4 py-2 text-sm font-black text-white shadow-panel" onClick={handleEnterFullScreen} type="button">
              进入全屏
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1800px] gap-4 p-4 2xl:grid-cols-[320px,minmax(620px,1fr),360px]">
        <aside className="grid content-start gap-4">
          <DataPanel title="今日数据">
            <div className="grid grid-cols-2 gap-5">
              <RingMetric label="新增订单量" value={latestOrders.length + 8} tone="var(--admin-warning)" />
              <RingMetric label="成交订单量" value={`${(totals.orders / 1000).toFixed(1)}k`} tone="var(--admin-accent)" />
              <RingMetric label="新增会员数" value="186" tone="var(--admin-danger)" />
              <RingMetric label="入驻技师" value={totals.technicians} tone="var(--admin-success)" />
            </div>
          </DataPanel>

          <DataPanel title="实时订单">
            <div className="space-y-3">
              {latestOrders.map((order) => (
                <article className="border-b border-[var(--admin-line)] pb-3 text-sm last:border-b-0 last:pb-0" key={`${order.time}-${order.item}`}>
                  <div className="flex justify-between gap-3 text-[var(--admin-muted)]">
                    <span>{order.time}</span>
                    <span className="font-bold text-[var(--admin-accent)]">{order.status}</span>
                  </div>
                  <p className="mt-2 font-black text-[var(--admin-text)]">{order.item}</p>
                  <p className="mt-1 text-[var(--admin-muted)]">{order.person} · {yen(order.amount)}</p>
                </article>
              ))}
            </div>
          </DataPanel>

          <DataPanel title="求救信息">
            <div className="grid h-32 place-items-center rounded-lg bg-[var(--admin-muted-surface)] text-sm font-bold text-[var(--admin-muted)]">没有新的求救信息</div>
          </DataPanel>
        </aside>

        <section className="grid gap-4">
          <DataPanel title="今日订单支付金额">
            <div className="grid items-center gap-4 lg:grid-cols-[1fr,320px]">
              <div>
                <p className="text-sm font-bold text-[var(--admin-muted)]">含订单金额、车费、预约预付金</p>
                <strong className="mt-2 block text-4xl font-black tracking-tight text-[var(--admin-text)] sm:text-5xl">{yen(totals.revenue)}</strong>
                <p className="mt-2 text-sm text-[var(--admin-muted)]">环比昨日 +12.4%，晚高峰预计继续上升。</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="rounded-lg bg-[var(--admin-muted-surface)] p-3">成交额 <strong className="block text-lg text-[var(--admin-text)]">{yen(totals.revenue)}</strong></span>
                <span className="rounded-lg bg-[var(--admin-muted-surface)] p-3">风险提醒 <strong className="block text-lg text-[var(--admin-danger)]">{totals.risks}</strong></span>
              </div>
            </div>
          </DataPanel>

          <DataPanel title="日本实时运营地图">
            <div className="relative">
              <JapanMap selectedRegion={selectedRegion} onSelect={setSelectedRegion} />
            </div>
          </DataPanel>

          <DataPanel title="近 7 天销售统计">
            <div className="flex h-44 items-end gap-4 px-2 pt-3 sm:px-6">
              {sevenDaySales.map((value, index) => (
                <div className="flex flex-1 flex-col items-center gap-2" key={index}>
                  <span className="w-full rounded-t bg-[var(--admin-accent)] opacity-85" style={{ height: `${value}%` }} />
                  <span className="text-xs text-[var(--admin-muted)]">4月{8 + index}日</span>
                </div>
              ))}
            </div>
          </DataPanel>
        </section>

        <aside className="grid content-start gap-4">
          <DataPanel title="订单总览">
            <div className="grid grid-cols-2 gap-3">
              {[
                ["成交量", totals.orders],
                ["成交额", yen(totals.revenue)],
                ["代理利润", yen(Math.round(totals.revenue * 0.08))],
                ["平台利润", yen(Math.round(totals.revenue * 0.16))]
              ].map(([label, value]) => (
                <div className="rounded-lg bg-[var(--admin-muted-surface)] p-3" key={label}>
                  <p className="text-xs text-[var(--admin-muted)]">{label}</p>
                  <strong className="mt-1 block text-lg text-[var(--admin-text)]">{value}</strong>
                </div>
              ))}
            </div>
          </DataPanel>

          <DataPanel title="服务项目排行">
            <div className="space-y-3">
              {topServices.map((service, index) => (
                <div className="grid grid-cols-[30px,1fr,70px] items-center gap-3 text-sm" key={service.id}>
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--admin-muted-surface)] text-xs font-black text-[var(--admin-accent)]">{index + 1}</span>
                  <span className="truncate font-bold text-[var(--admin-text)]">{service.name}</span>
                  <span className="text-right font-bold text-[var(--admin-accent)]">{service.sales}</span>
                </div>
              ))}
            </div>
          </DataPanel>

          <DataPanel title="技师业绩排行">
            <div className="space-y-3">
              {topTechnicians.map((technician, index) => (
                <div className="grid grid-cols-[30px,34px,1fr,70px] items-center gap-3 text-sm" key={technician.id}>
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--admin-muted-surface)] text-xs font-black text-[var(--admin-accent)]">{index + 1}</span>
                  <AvatarImage alt={technician.name} className="h-8 w-8" src={technician.avatar} />
                  <span className="truncate font-bold text-[var(--admin-text)]">{technician.name}</span>
                  <span className="text-right font-bold text-[var(--admin-accent)]">{yen(technician.income)}</span>
                </div>
              ))}
            </div>
          </DataPanel>

          <DataPanel title="商家健康度">
            <div className="space-y-3">
              {topStores.map((store, index) => (
                <div className="rounded-lg bg-[var(--admin-muted-surface)] p-3" key={store.id}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <strong className="truncate text-[var(--admin-text)]">{store.name}</strong>
                    <span className="font-black text-[var(--admin-success)]">{96 - index * 4}%</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--admin-line)]">
                    <span className="block h-full rounded-full bg-[var(--admin-success)]" style={{ width: `${96 - index * 4}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-[var(--admin-muted)]">{store.area} · 今日可预约稳定</p>
                </div>
              ))}
            </div>
          </DataPanel>
        </aside>
      </main>

      {selectedRegion && <RegionDrilldown region={selectedRegion} onClose={() => setSelectedRegion(null)} />}
    </div>
  );
}
