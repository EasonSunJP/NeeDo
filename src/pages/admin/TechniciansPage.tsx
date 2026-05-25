import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { backofficeRealDataApi, mapBackofficeTechnician } from "../../api/backofficeRealData";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { TechnicianEntitySyncEditor } from "../../components/admin/EntitySyncEditor";
import { TechnicianListModule } from "../../components/admin/TechnicianListModule";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { TechnicianProfilePanel } from "../../components/admin/TechnicianProfilePanel";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable, type Column } from "../../components/ui/DataTable";
import { Drawer } from "../../components/ui/Drawer";
import { Tabs } from "../../components/ui/Tabs";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import { stores } from "../../data/mock";
import { formatSystemId } from "../../lib/systemIds";
import { yen } from "../../lib/utils";
import { useEntityStore } from "../../state/entityStore";
import type { Technician } from "../../types/domain";

type TechnicianModule = "技师列表" | "虚拟技师" | "技师榜单";
type TechnicianRankingType = "收入榜" | "人气榜" | "订单榜";
type VirtualTechnician = Technician & {
  virtual: true;
  scenario: string;
  createdAt: string;
  enabled: boolean;
};

const moduleToQuery: Record<TechnicianModule, string> = {
  技师列表: "list",
  虚拟技师: "virtual",
  技师榜单: "ranking"
};

const queryToModule: Record<string, TechnicianModule> = {
  list: "技师列表",
  virtual: "虚拟技师",
  ranking: "技师榜单"
};

const virtualSeeds: VirtualTechnician[] = [
  {
    id: "virtual-tech-1",
    systemId: formatSystemId("b", 9000000001),
    name: "Virtual Mika",
    storeId: "store-1",
    role: "therapist",
    status: "available",
    rating: 4.82,
    orderCount: 42,
    income: 286000,
    skills: ["肩颈调理", "深夜可测", "中文 OK"],
    serviceAreas: ["银座", "六本木", "新宿"],
    acceptRate: 94,
    cancelRate: 1.1,
    reviewCount: 68,
    languages: ["日本語", "中文"],
    avatar: "/images/generated/profiles/profile-12.jpg",
    virtual: true,
    scenario: "东京深夜按摩冷启动",
    createdAt: "2026-04-02 11:30",
    enabled: true
  },
  {
    id: "virtual-tech-2",
    systemId: formatSystemId("b", 9000000002),
    name: "Virtual Haru",
    storeId: "store-4",
    role: "cleaner",
    status: "available",
    rating: 4.76,
    orderCount: 35,
    income: 198000,
    skills: ["家庭保洁", "修水管", "宠物家庭"],
    serviceAreas: ["目黑", "品川", "涩谷"],
    acceptRate: 91,
    cancelRate: 1.8,
    reviewCount: 43,
    languages: ["日本語", "English"],
    avatar: "/images/generated/profiles/profile-13.jpg",
    virtual: true,
    scenario: "保洁服务初期供给测试",
    createdAt: "2026-04-05 16:20",
    enabled: true
  }
];

const generatedAvatars = [
  "/images/generated/profiles/profile-14.jpg",
  "/images/generated/profiles/profile-15.jpg",
  "/images/generated/profiles/profile-16.jpg",
  "/images/generated/profiles/profile-01.jpg",
  "/images/generated/profiles/profile-02.jpg"
];

const moduleItems: TechnicianModule[] = ["技师列表", "虚拟技师", "技师榜单"];
const rankingTypeItems: TechnicianRankingType[] = ["收入榜", "人气榜", "订单榜"];

function getStoreName(storeList: Array<{ id: string; name: string }>, storeId: string) {
  return storeList.find((store) => store.id === storeId)?.name ?? "未绑定门店";
}

function getTechnicianDisplayName(technician: Technician) {
  return technician.nickname ? `${technician.nickname} / ${technician.name}` : technician.name;
}

function getTechnicianScore(technician: Technician) {
  return Math.round(technician.income / 10000 + technician.orderCount * 0.8 + technician.acceptRate * 4 + technician.rating * 30);
}

function getTechnicianFavoriteCount(technician: Technician) {
  const seed = technician.id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);

  return Math.round(technician.reviewCount * 1.18 + technician.orderCount * 0.22 + technician.rating * 46 + (seed % 180));
}

function formatRankingValue(row: Technician & { favoriteCount: number }, rankingType: TechnicianRankingType) {
  if (rankingType === "收入榜") {
    return yen(row.income);
  }

  if (rankingType === "人气榜") {
    return `${row.favoriteCount} 次收藏`;
  }

  return `${row.orderCount} 单`;
}

function getRankingValue(row: Technician & { favoriteCount: number }, rankingType: TechnicianRankingType) {
  if (rankingType === "收入榜") {
    return row.income;
  }

  if (rankingType === "人气榜") {
    return row.favoriteCount;
  }

  return row.orderCount;
}

function createVirtualTechnician(index: number, storeId = stores[index % stores.length]?.id ?? "store-1"): VirtualTechnician {
  const skills = [
    ["肩颈调理", "深夜可约", "女性可选"],
    ["家庭保洁", "修水管", "当日预约"],
    ["宠物陪伴", "喂养", "照片回传"],
    ["上门回收", "家电搬运", "报价测试"],
    ["商务预约", "酒店服务", "中文 OK"]
  ][index % 5];

  return {
    id: `virtual-tech-${Date.now()}-${index}`,
    systemId: formatSystemId("b", 9000000010 + index),
    name: `冷启动技师 ${index + 1}`,
    storeId,
    role: index % 2 === 0 ? "therapist" : "cleaner",
    status: "available",
    rating: 4.65 + index * 0.03,
    orderCount: 8 + index * 5,
    income: 62000 + index * 42000,
    skills,
    serviceAreas: ["新宿", "涩谷", "银座"].slice(0, 2 + (index % 2)),
    acceptRate: 88 + index,
    cancelRate: 1.5 + index * 0.2,
    reviewCount: 12 + index * 5,
    languages: index % 2 === 0 ? ["日本語", "中文"] : ["日本語", "English"],
    avatar: generatedAvatars[index % generatedAvatars.length],
    virtual: true,
    scenario: index % 2 === 0 ? "新城市冷启动供给" : "高峰时段测试账号",
    createdAt: "2026-04-14 09:30",
    enabled: true
  };
}

function TechnicianNameButton({ technician, onSelect }: { technician: Technician; onSelect: (technician: Technician) => void }) {
  return (
    <button className="focus-ring font-black text-moss hover:underline" onClick={() => onSelect(technician)} type="button">
      {getTechnicianDisplayName(technician)}
    </button>
  );
}

export function TechniciansPage() {
  const { stores: liveStores } = useEntityStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeModule = queryToModule[searchParams.get("module") ?? "list"] ?? "技师列表";
  const [activeRankingType, setActiveRankingType] = useState<TechnicianRankingType>("收入榜");
  const [virtualTechnicians, setVirtualTechnicians] = useState<VirtualTechnician[]>(virtualSeeds);
  const [realTechnicians, setRealTechnicians] = useState<Technician[]>([]);
  const [selectedTechnician, setSelectedTechnician] = useState<Technician | VirtualTechnician | null>(null);
  useEffect(() => {
    let activeRequest = true;

    backofficeRealDataApi.technicians("backoffice").then((response) => {
      if (activeRequest) {
        setRealTechnicians(response.list.map(mapBackofficeTechnician));
      }
    }).catch(() => {
      if (activeRequest) {
        setRealTechnicians([]);
      }
    });

    return () => {
      activeRequest = false;
    };
  }, []);
  const rankingRows = useMemo(
    () =>
      realTechnicians
        .map((technician) => ({ ...technician, favoriteCount: getTechnicianFavoriteCount(technician) }))
        .sort((a, b) => getRankingValue(b, activeRankingType) - getRankingValue(a, activeRankingType) || getTechnicianScore(b) - getTechnicianScore(a))
        .map((technician, index) => ({ ...technician, rank: index + 1 })),
    [activeRankingType, realTechnicians]
  );

  const virtualColumns: Array<Column<VirtualTechnician>> = [
    {
      key: "profile",
      title: "虚拟技师",
      render: (row) => (
        <div className="flex items-center gap-3">
          <img alt={row.name} className="avatar-shape h-10 w-10 object-cover" src={row.avatar} />
          <div>
            <TechnicianNameButton onSelect={setSelectedTechnician} technician={row} />
            <p className="mt-1 text-xs text-ink/45">{row.scenario}</p>
          </div>
        </div>
      )
    },
    { key: "store", title: "绑定门店", render: (row) => getStoreName(liveStores, row.storeId) },
    { key: "enabled", title: "状态", render: (row) => <Badge tone={row.enabled ? "green" : "neutral"}>{row.enabled ? "启用" : "停用"}</Badge> },
    { key: "skills", title: "测试标签", render: (row) => row.skills.join("、") },
    { key: "orders", title: "模拟订单", render: (row) => `${row.orderCount} 单` },
    { key: "created", title: "创建时间", render: (row) => row.createdAt },
    {
      key: "toggle",
      title: "启停",
      render: (row) => (
        <button
          className="focus-ring rounded-lg border border-line bg-paper px-3 py-2 text-xs font-black text-ink/70 hover:border-moss hover:text-moss"
          onClick={() => setVirtualTechnicians((current) => current.map((item) => (item.id === row.id ? { ...item, enabled: !item.enabled } : item)))}
          type="button"
        >
          {row.enabled ? "停用" : "启用"}
        </button>
      )
    }
  ];

  const rankingColumns: Array<Column<(typeof rankingRows)[number]>> = [
    { key: "rank", title: "排名", render: (row) => <span className="rounded-md bg-ink px-2 py-1 text-xs font-black text-white">#{row.rank}</span> },
    {
      key: "profile",
      title: "技师",
      render: (row) => (
        <div className="flex items-center gap-3">
          <img alt={row.name} className="avatar-shape h-10 w-10 object-cover" src={row.avatar} />
          <TechnicianNameButton onSelect={setSelectedTechnician} technician={row} />
        </div>
      )
    },
    { key: "store", title: "所属门店", render: (row) => getStoreName(liveStores, row.storeId) },
    { key: "income", title: "收入", render: (row) => yen(row.income) },
    { key: "favorites", title: "收藏数", render: (row) => `${row.favoriteCount} 次` },
    { key: "orders", title: "订单量", render: (row) => `${row.orderCount} 单` },
    { key: "rating", title: "评分", render: (row) => `★ ${row.rating.toFixed(2)} · ${row.reviewCount}` }
  ];

  const addOneVirtual = () => setVirtualTechnicians((current) => [createVirtualTechnician(current.length), ...current]);
  const generateColdStart = () => setVirtualTechnicians((current) => [...Array.from({ length: 5 }, (_, index) => createVirtualTechnician(current.length + index)), ...current]);
  const isRankingModule = activeModule === "技师榜单";

  return (
    <AdminLayout>
      <ModuleShell
        title={isRankingModule ? "技师榜单" : "技师管理"}
        description={isRankingModule ? "按收入、收藏人气和订单量查看技师排名。" : "管理真实技师、虚拟技师和业绩排行。平台后台可查看全部技师，店铺后台仅能查看自己旗下的技师。"}
        actions={
          activeModule === "虚拟技师" ? (
            <>
              <Button variant="secondary" onClick={generateColdStart}>一键生成冷启动技师</Button>
              <Button onClick={addOneVirtual}>新增虚拟技师</Button>
            </>
          ) : (
            <Button>{isRankingModule ? "导出榜单数据" : "导出技师数据"}</Button>
          )
        }
      >
        {isRankingModule ? (
          <Tabs active={activeRankingType} items={rankingTypeItems} onChange={(item) => setActiveRankingType(item as TechnicianRankingType)} />
        ) : (
          <Tabs
            active={activeModule}
            items={moduleItems}
            onChange={(item) => {
              const module = item as TechnicianModule;
              setSearchParams(moduleToQuery[module] === "list" ? {} : { module: moduleToQuery[module] });
            }}
          />
        )}

        {activeModule === "技师列表" ? (
          <TechnicianListModule context="platform" onSelectTechnician={setSelectedTechnician} stores={liveStores} technicians={realTechnicians} />
        ) : null}

        {activeModule === "虚拟技师" ? (
          <div className="space-y-5">
            <section className="grid gap-4 md:grid-cols-3">
              {[
                ["启用虚拟技师", virtualTechnicians.filter((item) => item.enabled).length],
                ["冷启动场景", new Set(virtualTechnicians.map((item) => item.scenario)).size],
                ["模拟订单", virtualTechnicians.reduce((sum, item) => sum + item.orderCount, 0)]
              ].map(([label, value]) => (
                <article className="rounded-lg border border-line bg-white p-4 shadow-panel" key={label}>
                  <p className="text-sm font-bold text-ink/50">{label}</p>
                  <strong className="mt-2 block text-3xl font-black">{value}</strong>
                </article>
              ))}
            </section>
            <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
              <TitleWithInfo
                as="h2"
                info="虚拟技师用于测试下单、排班、地图展示、动态冷启动和新城市初期供给。正式上线时可以关闭，不参与真实派单和结算。"
                label="用途说明"
                title="用途说明"
                titleClassName="text-lg font-black"
                variant="paper"
              />
            </section>
            <DataTable columns={virtualColumns} onView={setSelectedTechnician} pageSize={10} rows={virtualTechnicians} />
          </div>
        ) : null}

        {activeModule === "技师榜单" ? (
          <div className="space-y-5">
            <section className="grid gap-4 xl:grid-cols-3">
              {rankingRows.slice(0, 3).map((technician) => (
                <article className="rounded-lg border border-line bg-white p-4 shadow-panel" key={technician.id}>
                  <div className="flex items-center gap-3">
                    <span className="grid h-12 w-12 place-items-center rounded-lg bg-ink text-lg font-black text-white">#{technician.rank}</span>
                    <img alt={technician.name} className="avatar-shape h-14 w-14 object-cover" src={technician.avatar} />
                    <div className="min-w-0">
                      <button className="focus-ring truncate text-left text-lg font-black text-moss hover:underline" onClick={() => setSelectedTechnician(technician)} type="button">
                        {getTechnicianDisplayName(technician)}
                      </button>
                      <p className="mt-1 text-xs text-ink/45">{getStoreName(liveStores, technician.storeId)}</p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-lg bg-ink px-3 py-2 text-center text-white">
                    <p className="text-xs font-bold text-white/55">{activeRankingType}</p>
                    <strong className="mt-1 block text-lg font-black">{formatRankingValue(technician, activeRankingType)}</strong>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-paper p-3"><p className="text-xs text-ink/45">收入</p><strong>{yen(technician.income)}</strong></div>
                    <div className="rounded-lg bg-paper p-3"><p className="text-xs text-ink/45">收藏</p><strong>{technician.favoriteCount}</strong></div>
                    <div className="rounded-lg bg-paper p-3"><p className="text-xs text-ink/45">订单</p><strong>{technician.orderCount}</strong></div>
                  </div>
                </article>
              ))}
            </section>
            <DataTable columns={rankingColumns} onView={setSelectedTechnician} pageSize={10} rows={rankingRows} />
          </div>
        ) : null}
      </ModuleShell>

      <Drawer open={Boolean(selectedTechnician)} title="技师详细信息卡" onClose={() => setSelectedTechnician(null)}>
        {selectedTechnician ? (
          <div className="space-y-5">
            {"virtual" in selectedTechnician && selectedTechnician.virtual ? null : <TechnicianEntitySyncEditor key={selectedTechnician.id} technician={selectedTechnician} />}
            <TechnicianProfilePanel technician={selectedTechnician} />
          </div>
        ) : null}
      </Drawer>
    </AdminLayout>
  );
}
