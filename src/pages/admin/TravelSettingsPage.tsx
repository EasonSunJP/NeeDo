import { useState } from "react";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { DetailGrid } from "../../components/admin/DetailGrid";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable, type Column } from "../../components/ui/DataTable";
import { Drawer } from "../../components/ui/Drawer";
import { FilterBar } from "../../components/ui/FilterBar";
import { Tabs } from "../../components/ui/Tabs";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import {
  areaTravelFareRules,
  buildDistanceFarePreview,
  estimateBusFare,
  estimateTaxiFare,
  estimateTrainFare,
  type AreaTravelFareRule
} from "../../lib/travelFare";
import { yen } from "../../lib/utils";

type TravelTab = "交通方式" | "城市车费" | "移动规则";
type TravelModeType = "打车" | "电车" | "公交" | "步行/骑行";

type TravelMode = {
  id: string;
  name: string;
  type: TravelModeType;
  scene: string;
  reimbursement: string;
  maxAmount: number;
  enabled: boolean;
};

const tabs: TravelTab[] = ["交通方式", "城市车费", "移动规则"];
const previewDistancesKm = [3, 8, 15];

const travelModes: TravelMode[] = [
  {
    id: "travel-taxi",
    name: "出租车 / 网约车",
    type: "打车",
    scene: "深夜、雨天、大件工具、上门距离较远",
    reimbursement: "按地区起步价、加算距离和 22:00-5:00 深夜加成估算",
    maxAmount: 9000,
    enabled: true
  },
  {
    id: "travel-train",
    name: "电车 / 地铁",
    type: "电车",
    scene: "白天常规上门、跨站移动、3km 以上优先低成本派单",
    reimbursement: "按地区短距分段票价估算，跨线或特急按实际票价确认",
    maxAmount: 1800,
    enabled: true
  },
  {
    id: "travel-bus",
    name: "公交",
    type: "公交",
    scene: "区域内短距离移动、车站覆盖不足、非高峰时段",
    reimbursement: "大都市按均一单程，地方城市按距离阶梯补贴",
    maxAmount: 900,
    enabled: true
  },
  {
    id: "travel-bike",
    name: "步行 / 骑行",
    type: "步行/骑行",
    scene: "1.5km 内短距离上门，适合轻工具服务",
    reimbursement: "不报销交通费，可计入移动时间",
    maxAmount: 0,
    enabled: false
  }
];

const movementRules = [
  ["派单缓冲", "上一单结束后默认预留 30 分钟移动时间"],
  ["深夜规则", "22:00-5:00 打车按地区规则自动加 20%，超出上限需运营确认"],
  ["工具规则", "携带大型清洗设备时自动禁用步行 / 骑行"],
  ["跨区规则", "跨区移动超过 45 分钟时提示客服确认用户时间"],
  ["费用展示", "用户下单页展示预计交通费，后台保留打车、电车、公交的详细试算记录"]
];

const enabledFareRules = areaTravelFareRules.filter((rule) => rule.enabled);
const averageTrainFare8Km = Math.round(enabledFareRules.reduce((sum, rule) => sum + estimateTrainFare(rule, 8), 0) / enabledFareRules.length);
const averageBusFare5Km = Math.round(enabledFareRules.reduce((sum, rule) => sum + estimateBusFare(rule, 5), 0) / enabledFareRules.length);

function formatKm(value: number) {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}km`;
}

function formatTaxiRule(rule: AreaTravelFareRule) {
  return `${yen(rule.taxi.initialFare)} / ${formatKm(rule.taxi.initialDistanceKm)} 后每 ${Math.round(rule.taxi.incrementDistanceKm * 1000)}m +${yen(rule.taxi.incrementFare)}`;
}

function formatBusRule(rule: AreaTravelFareRule) {
  if (rule.bus.additionalFarePerBlock <= 0) {
    return `${yen(rule.bus.flatFare)} 均一`;
  }

  return `${yen(rule.bus.flatFare)} 起，${formatKm(rule.bus.flatDistanceKm)} 后每 ${formatKm(rule.bus.additionalBlockKm)} +${yen(rule.bus.additionalFarePerBlock)}`;
}

function getModeTone(type: TravelModeType) {
  if (type === "打车") {
    return "yellow";
  }

  if (type === "电车") {
    return "blue";
  }

  if (type === "公交") {
    return "green";
  }

  return "neutral";
}

function FareStack({ items }: { items: Array<[string, number]> }) {
  return (
    <div className="space-y-1">
      {items.map(([label, amount]) => (
        <div className="flex items-center justify-between gap-3" key={label}>
          <span className="text-xs font-semibold text-ink/45">{label}</span>
          <span className="font-bold text-ink">{yen(amount)}</span>
        </div>
      ))}
    </div>
  );
}

function DistancePreviewList({ rule }: { rule: AreaTravelFareRule }) {
  return (
    <div className="space-y-2">
      {buildDistanceFarePreview(rule, previewDistancesKm).map((item) => (
        <div className="rounded-lg border border-line bg-paper p-3" key={item.distanceKm}>
          <div className="flex items-center justify-between gap-3">
            <strong>{formatKm(item.distanceKm)}</strong>
            <Badge tone={item.recommendedMode === "打车" ? "yellow" : item.recommendedMode === "电车" ? "blue" : "green"}>{item.recommendedMode}</Badge>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-ink/65">
            <span>打车 {yen(item.taxi)}</span>
            <span>深夜 {yen(item.lateNightTaxi)}</span>
            <span>电车 {yen(item.train)}</span>
            <span>公交 {yen(item.bus)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function TravelSettingsPage() {
  const [activeTab, setActiveTab] = useState<TravelTab>("交通方式");
  const [selectedMode, setSelectedMode] = useState<TravelMode | null>(null);
  const [selectedCity, setSelectedCity] = useState<AreaTravelFareRule | null>(null);

  const modeColumns: Array<Column<TravelMode>> = [
    { key: "name", title: "方式", render: (row) => row.name },
    { key: "type", title: "类型", render: (row) => <Badge tone={getModeTone(row.type)}>{row.type}</Badge> },
    { key: "scene", title: "适用场景", render: (row) => row.scene },
    { key: "reimbursement", title: "报销 / 计费", render: (row) => row.reimbursement },
    { key: "max", title: "单次上限", render: (row) => yen(row.maxAmount) },
    { key: "enabled", title: "状态", render: (row) => <Badge tone={row.enabled ? "green" : "neutral"}>{row.enabled ? "启用" : "停用"}</Badge> }
  ];

  const fareColumns: Array<Column<AreaTravelFareRule>> = [
    { key: "region", title: "地区", render: (row) => row.region, width: "180px" },
    { key: "prefecture", title: "都道府县", render: (row) => row.prefecture, width: "110px" },
    { key: "base", title: "基础上门费", render: (row) => yen(row.baseVisitFee), sortValue: (row) => row.baseVisitFee, width: "130px" },
    { key: "taxiRule", title: "打车规则", render: (row) => formatTaxiRule(row), width: "240px" },
    {
      key: "taxiEstimate",
      title: "打车试算",
      render: (row) => <FareStack items={previewDistancesKm.map((distance) => [`${formatKm(distance)}`, estimateTaxiFare(row, distance)])} />,
      sortValue: (row) => estimateTaxiFare(row, 8),
      width: "150px"
    },
    {
      key: "trainEstimate",
      title: "电车试算",
      render: (row) => <FareStack items={previewDistancesKm.map((distance) => [`${formatKm(distance)}`, estimateTrainFare(row, distance)])} />,
      sortValue: (row) => estimateTrainFare(row, 8),
      width: "150px"
    },
    {
      key: "busEstimate",
      title: "公交试算",
      render: (row) => <FareStack items={previewDistancesKm.map((distance) => [`${formatKm(distance)}`, estimateBusFare(row, distance)])} />,
      sortValue: (row) => estimateBusFare(row, 8),
      width: "150px"
    },
    { key: "busRule", title: "公交规则", render: (row) => formatBusRule(row), width: "210px" },
    { key: "enabled", title: "状态", render: (row) => <Badge tone={row.enabled ? "green" : "neutral"}>{row.enabled ? "启用" : "停用"}</Badge> }
  ];

  return (
    <AdminLayout>
      <ModuleShell
        title="出行设置"
        description="设置技师上门移动时可使用的打车、电车、公交、步行/骑行方式，以及日本各地区按距离估算的车费、深夜加成和移动时间规则。"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary">导入城市车费</Button>
            <Button>保存出行规则</Button>
          </div>
        }
      >
        <section className="grid gap-3 md:grid-cols-4">
          {[
            ["启用交通方式", travelModes.filter((mode) => mode.enabled).length, "打车、电车、公交"],
            ["地区规则", areaTravelFareRules.length, "日本主要城市独立配置"],
            ["8km 电车均价", yen(averageTrainFare8Km), "按当前启用地区估算"],
            ["5km 公交均价", yen(averageBusFare5Km), "按当前启用地区估算"]
          ].map(([label, value, caption]) => (
            <article className="rounded-lg border border-line bg-white p-4 shadow-panel" key={label}>
              <p className="text-xs font-bold text-ink/50">{label}</p>
              <strong className="mt-2 block text-3xl">{value}</strong>
              <p className="mt-2 text-xs text-ink/55">{caption}</p>
            </article>
          ))}
        </section>

        <Tabs active={activeTab} items={tabs} onChange={(item) => setActiveTab(item as TravelTab)} />

        {activeTab === "交通方式" ? (
          <div className="space-y-5">
            <FilterBar
              searchPlaceholder="搜索交通方式、适用场景"
              filters={[
                { label: "类型", options: [{ label: "打车", value: "taxi" }, { label: "电车", value: "train" }, { label: "公交", value: "bus" }, { label: "步行/骑行", value: "walk" }] },
                { label: "状态", options: [{ label: "启用", value: "enabled" }, { label: "停用", value: "disabled" }] }
              ]}
            />
            <DataTable columns={modeColumns} onView={setSelectedMode} pageSize={10} rows={travelModes} />
          </div>
        ) : null}

        {activeTab === "城市车费" ? (
          <div className="space-y-5">
            <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
              <TitleWithInfo
                as="h2"
                info="打车按地区起步价和加算距离估算，电车按短距分段票价估算，公交按均一或距离阶梯估算。调度中心会读取这些规则，给派单、移动时间和上门费做智能提示。"
                label="车费计算说明"
                title="车费计算说明"
                titleClassName="text-lg font-black"
                variant="paper"
              />
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {[
                  ["打车", "起步价 + 超出距离加算，22:00-5:00 自动按 20% 深夜早朝加成试算。"],
                  ["电车", "按 3km、8km、15km 等常用上门距离走地区票价分段，不含特急和机场线加价。"],
                  ["公交", "大都市按均一单程，地方城市按超过固定距离后的阶梯补贴估算。"]
                ].map(([title, caption]) => (
                  <div className="rounded-lg bg-paper p-3" key={title}>
                    <strong className="text-sm">{title}</strong>
                    <p className="mt-1 text-xs leading-5 text-ink/55">{caption}</p>
                  </div>
                ))}
              </div>
            </section>
            <DataTable columns={fareColumns} onView={setSelectedCity} pageSize={10} rows={areaTravelFareRules} />
          </div>
        ) : null}

        {activeTab === "移动规则" ? (
          <section className="grid gap-4 xl:grid-cols-2">
            {movementRules.map(([title, caption], index) => (
              <article className="rounded-lg border border-line bg-white p-4 shadow-panel" key={title}>
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-ink text-sm font-black text-white">{index + 1}</span>
                  <TitleWithInfo
                    as="h2"
                    info={caption}
                    label={`${title}说明`}
                    title={title}
                    titleClassName="font-black"
                    variant="paper"
                  />
                </div>
              </article>
            ))}
          </section>
        ) : null}
      </ModuleShell>

      <Drawer open={Boolean(selectedMode)} title="交通方式详情" onClose={() => setSelectedMode(null)}>
        {selectedMode ? (
          <DetailGrid
            items={[
              { label: "方式", value: selectedMode.name },
              { label: "类型", value: selectedMode.type },
              { label: "适用场景", value: selectedMode.scene },
              { label: "报销 / 计费", value: selectedMode.reimbursement },
              { label: "单次上限", value: yen(selectedMode.maxAmount) },
              { label: "状态", value: selectedMode.enabled ? "启用" : "停用" }
            ]}
          />
        ) : null}
      </Drawer>

      <Drawer open={Boolean(selectedCity)} title="城市车费详情" onClose={() => setSelectedCity(null)}>
        {selectedCity ? (
          <div className="space-y-5">
            <DetailGrid
              items={[
                { label: "地区", value: selectedCity.region },
                { label: "都道府县", value: selectedCity.prefecture },
                { label: "基础上门费", value: yen(selectedCity.baseVisitFee) },
                { label: "打车规则", value: formatTaxiRule(selectedCity) },
                { label: "迎车参考", value: yen(selectedCity.taxi.dispatchFee) },
                { label: "深夜早朝", value: "22:00-5:00 / 20%" },
                { label: "公交规则", value: formatBusRule(selectedCity) },
                { label: "状态", value: selectedCity.enabled ? "启用" : "停用" }
              ]}
            />
            <section>
              <TitleWithInfo
                as="h3"
                info={selectedCity.note}
                label="距离试算说明"
                title="距离试算"
                titleClassName="text-base font-black"
                variant="paper"
              />
              <div className="mt-3">
                <DistancePreviewList rule={selectedCity} />
              </div>
            </section>
          </div>
        ) : null}
      </Drawer>
    </AdminLayout>
  );
}
