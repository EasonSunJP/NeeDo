import { useEffect, useMemo, useState } from "react";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { DetailGrid } from "../../components/admin/DetailGrid";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable, type Column } from "../../components/ui/DataTable";
import { Drawer } from "../../components/ui/Drawer";
import { FilterBar } from "../../components/ui/FilterBar";
import { Tabs } from "../../components/ui/Tabs";
import { cn } from "../../lib/utils";
import { useEntityStore } from "../../state/entityStore";
import type { Customer, Store, Technician } from "../../types/domain";

type OrnamentAudience = "用户" | "技师" | "商户";
type OrnamentType = "头像框" | "特殊标签";
type OrnamentStatus = "启用" | "草稿" | "停用";

type AvatarOrnament = {
  id: string;
  name: string;
  type: OrnamentType;
  audience: OrnamentAudience[];
  rarity: "普通" | "稀有" | "限定" | "认证";
  color: string;
  label: string;
  rule: string;
  validDays: string;
  grantedCount: number;
  usedCount: number;
  status: OrnamentStatus;
  previewTarget: {
    name: string;
    avatar: string;
    caption: string;
  };
};

type GrantRecord = {
  id: string;
  targetName: string;
  targetType: OrnamentAudience;
  ornamentName: string;
  grantedAt: string;
  expireAt: string;
  operator: string;
  reason: string;
};

const tabs = ["挂件库", "发放记录", "规则设置"] as const;

function buildOrnamentsSeed(customers: Customer[], stores: Store[], technicians: Technician[]): AvatarOrnament[] {
  return [
    {
    id: "ornament-1",
    name: "金牌服务头像框",
    type: "头像框",
    audience: ["技师"],
    rarity: "认证",
    color: "#d6a944",
    label: "金牌技师",
    rule: "近 30 天评分 >= 4.9 且履约率 >= 96%",
    validDays: "30 天自动复核",
    grantedCount: 128,
    usedCount: 96,
    status: "启用",
    previewTarget: {
      name: technicians[0].name,
      avatar: technicians[0].avatar,
      caption: "上门按摩 · 评分 4.96"
    }
    },
    {
    id: "ornament-2",
    name: "平台严选商户章",
    type: "特殊标签",
    audience: ["商户"],
    rarity: "认证",
    color: "#2f75ff",
    label: "平台严选",
    rule: "资质完整、投诉率低、连续 60 天营业稳定",
    validDays: "60 天自动复核",
    grantedCount: 46,
    usedCount: 41,
    status: "启用",
    previewTarget: {
      name: stores[0].name,
      avatar: stores[0].cover,
      caption: "银座 · 肩颈调理"
    }
    },
    {
    id: "ornament-3",
    name: "黑卡会员头像框",
    type: "头像框",
    audience: ["用户"],
    rarity: "限定",
    color: "#0f101a",
    label: "Black VIP",
    rule: "LTV >= ¥300,000 或平台手动发放",
    validDays: "永久，除非风控撤销",
    grantedCount: 312,
    usedCount: 248,
    status: "启用",
    previewTarget: {
      name: customers[2].name,
      avatar: customers[2].avatar,
      caption: "黑卡会员 · 54 单"
    }
    },
    {
    id: "ornament-4",
    name: "夜间响应标签",
    type: "特殊标签",
    audience: ["技师", "商户"],
    rarity: "稀有",
    color: "#7c4dff",
    label: "深夜可约",
    rule: "22:00 后可预约时段 >= 12 个 / 周",
    validDays: "7 天滚动计算",
    grantedCount: 84,
    usedCount: 67,
    status: "启用",
    previewTarget: {
      name: technicians[1].name,
      avatar: technicians[1].avatar,
      caption: "空调清洗 · 当日预约"
    }
    },
    {
    id: "ornament-5",
    name: "新人扶持徽章",
    type: "特殊标签",
    audience: ["用户", "技师", "商户"],
    rarity: "普通",
    color: "#22b36b",
    label: "新人扶持",
    rule: "注册 30 天内，运营可配置展示",
    validDays: "30 天",
    grantedCount: 920,
    usedCount: 511,
    status: "草稿",
    previewTarget: {
      name: technicians[4]?.name ?? technicians[0].name,
      avatar: technicians[4]?.avatar ?? technicians[0].avatar,
      caption: "冷启动供给 · 新城市"
    }
    }
  ];
}

function buildGrantRecordsSeed(customers: Customer[], stores: Store[], technicians: Technician[]): GrantRecord[] {
  return [
    {
    id: "grant-1",
    targetName: technicians[0].name,
    targetType: "技师",
    ornamentName: "金牌服务头像框",
    grantedAt: "2026-04-12 18:20",
    expireAt: "2026-05-12 23:59",
    operator: "平台运营 / Lisa",
    reason: "近 30 天评分与履约率达标"
    },
    {
    id: "grant-2",
    targetName: stores[0].name,
    targetType: "商户",
    ornamentName: "平台严选商户章",
    grantedAt: "2026-04-10 11:00",
    expireAt: "2026-06-10 23:59",
    operator: "商家运营 / Ken",
    reason: "资质完整，投诉率低"
    },
    {
    id: "grant-3",
    targetName: customers[2].name,
    targetType: "用户",
    ornamentName: "黑卡会员头像框",
    grantedAt: "2026-04-08 09:30",
    expireAt: "永久",
    operator: "会员运营 / Mei",
    reason: "高 LTV 用户人工加权"
    }
  ];
}

function OrnamentPreview({ ornament }: { ornament: AvatarOrnament }) {
  return (
    <div className="rounded-lg border border-line bg-paper p-4">
      <div className="flex items-center gap-4">
        <div className="relative">
          <div
            className="avatar-frame grid h-24 w-24 place-items-center p-[4px]"
            style={{
              background:
                ornament.type === "头像框"
                  ? `conic-gradient(from 180deg, ${ornament.color}, #ffffff, ${ornament.color}, #111827, ${ornament.color})`
                  : "transparent"
            }}
          >
            <img alt={ornament.previewTarget.name} className="avatar-shape h-full w-full border-4 border-white object-cover" src={ornament.previewTarget.avatar} />
          </div>
          {ornament.type === "特殊标签" ? (
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-black text-white shadow-soft" style={{ background: ornament.color }}>
              {ornament.label}
            </span>
          ) : null}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-bold text-ink/45">预览对象</p>
          <strong className="mt-1 block truncate text-lg">{ornament.previewTarget.name}</strong>
          <p className="mt-1 text-sm text-ink/55">{ornament.previewTarget.caption}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone={ornament.type === "头像框" ? "yellow" : "blue"}>{ornament.type}</Badge>
            <Badge tone="neutral">{ornament.rarity}</Badge>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AvatarBadgesPage() {
  const { customers, stores, technicians } = useEntityStore();
  const ornamentsSeed = useMemo(() => buildOrnamentsSeed(customers, stores, technicians), [customers, stores, technicians]);
  const grantRecordsSeed = useMemo(() => buildGrantRecordsSeed(customers, stores, technicians), [customers, stores, technicians]);
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("挂件库");
  const [ornaments, setOrnaments] = useState(ornamentsSeed);
  useEffect(() => {
    setOrnaments((current) => current.map((ornament) => ({
      ...ornament,
      previewTarget: ornamentsSeed.find((item) => item.id === ornament.id)?.previewTarget ?? ornament.previewTarget
    })));
  }, [ornamentsSeed]);
  const [selectedOrnament, setSelectedOrnament] = useState<AvatarOrnament | null>(null);
  const activeCount = ornaments.filter((ornament) => ornament.status === "启用").length;
  const totalGranted = ornaments.reduce((sum, ornament) => sum + ornament.grantedCount, 0);
  const averageUsage = Math.round((ornaments.reduce((sum, ornament) => sum + ornament.usedCount / Math.max(1, ornament.grantedCount), 0) / ornaments.length) * 100);

  const ornamentColumns = useMemo<Array<Column<AvatarOrnament>>>(
    () => [
      {
        key: "name",
        title: "挂件",
        render: (row) => (
          <button className="focus-ring text-left font-black text-moss hover:underline" onClick={() => setSelectedOrnament(row)} type="button">
            {row.name}
          </button>
        )
      },
      { key: "type", title: "类型", render: (row) => <Badge tone={row.type === "头像框" ? "yellow" : "blue"}>{row.type}</Badge> },
      { key: "audience", title: "适用对象", render: (row) => row.audience.join("、") },
      { key: "rarity", title: "稀有度", render: (row) => row.rarity },
      { key: "granted", title: "发放/使用", render: (row) => `${row.grantedCount} / ${row.usedCount}` },
      { key: "status", title: "状态", render: (row) => <Badge tone={row.status === "启用" ? "green" : row.status === "草稿" ? "yellow" : "neutral"}>{row.status}</Badge> },
      {
        key: "toggle",
        title: "启停",
        render: (row) => (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setOrnaments((current) => current.map((item) => (item.id === row.id ? { ...item, status: item.status === "启用" ? "停用" : "启用" } : item)))}
          >
            {row.status === "启用" ? "停用" : "启用"}
          </Button>
        )
      }
    ],
    []
  );

  const grantColumns: Array<Column<GrantRecord>> = [
    { key: "target", title: "对象", render: (row) => row.targetName },
    { key: "targetType", title: "身份", render: (row) => <Badge tone={row.targetType === "技师" ? "blue" : row.targetType === "商户" ? "green" : "yellow"}>{row.targetType}</Badge> },
    { key: "ornament", title: "挂件", render: (row) => row.ornamentName },
    { key: "grantedAt", title: "发放时间", render: (row) => row.grantedAt },
    { key: "expireAt", title: "有效期", render: (row) => row.expireAt },
    { key: "operator", title: "操作人", render: (row) => row.operator }
  ];

  return (
    <AdminLayout>
      <ModuleShell
        title="挂件设置"
        description="给用户、技师和商户配置头像框、特殊身份标签、展示规则、有效期和发放记录。它不是页面装修，而是身份展示与运营权益。"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary">新建特殊标签</Button>
            <Button>新建头像框</Button>
          </div>
        }
      >
        <section className="grid gap-3 md:grid-cols-4">
          {[
            ["启用挂件", activeCount, "当前可在前端展示"],
            ["累计发放", totalGranted, "用户 / 技师 / 商户合计"],
            ["平均佩戴率", `${averageUsage}%`, "已使用 / 已发放"],
            ["自动规则", 4, "评分、LTV、资质、活跃度"]
          ].map(([label, value, caption]) => (
            <article className="rounded-lg border border-line bg-white p-4 shadow-panel" key={label}>
              <p className="text-xs font-bold text-ink/50">{label}</p>
              <strong className="mt-2 block text-3xl">{value}</strong>
              <p className="mt-2 text-xs text-ink/55">{caption}</p>
            </article>
          ))}
        </section>

        <Tabs active={activeTab} items={[...tabs]} onChange={(item) => setActiveTab(item as (typeof tabs)[number])} />

        {activeTab === "挂件库" ? (
          <div className="space-y-5">
            <FilterBar
              searchPlaceholder="搜索头像框、特殊标签、适用对象"
              filters={[
                { label: "适用对象", options: [{ label: "用户", value: "user" }, { label: "技师", value: "technician" }, { label: "商户", value: "merchant" }] },
                { label: "类型", options: [{ label: "头像框", value: "frame" }, { label: "特殊标签", value: "tag" }] },
                { label: "状态", options: [{ label: "启用", value: "active" }, { label: "草稿", value: "draft" }, { label: "停用", value: "off" }] }
              ]}
            />
            <section className="grid gap-4 lg:grid-cols-3">
              {ornaments.slice(0, 3).map((ornament) => (
                <button className="text-left" key={ornament.id} onClick={() => setSelectedOrnament(ornament)} type="button">
                  <OrnamentPreview ornament={ornament} />
                </button>
              ))}
            </section>
            <DataTable columns={ornamentColumns} onView={setSelectedOrnament} pageSize={10} rows={ornaments} />
          </div>
        ) : null}

        {activeTab === "发放记录" ? (
          <div className="space-y-5">
            <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
              <h2 className="text-lg font-black">快速发放</h2>
              <div className="mt-4 grid gap-3 xl:grid-cols-4">
                <select className="h-11 rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none">
                  <option>选择对象类型</option>
                  <option>用户</option>
                  <option>技师</option>
                  <option>商户</option>
                </select>
                <select className="h-11 rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none">
                  <option>选择发放对象</option>
                  {technicians.slice(0, 6).map((technician) => <option key={technician.id}>{technician.name}</option>)}
                </select>
                <select className="h-11 rounded-lg border border-line bg-paper px-3 text-sm font-bold outline-none">
                  <option>选择挂件</option>
                  {ornaments.map((ornament) => <option key={ornament.id}>{ornament.name}</option>)}
                </select>
                <Button>确认发放</Button>
              </div>
            </section>
            <DataTable columns={grantColumns} pageSize={10} rows={grantRecordsSeed} />
          </div>
        ) : null}

        {activeTab === "规则设置" ? (
          <section className="grid gap-4 xl:grid-cols-2">
            {ornaments.map((ornament) => (
              <article className="rounded-lg border border-line bg-white p-4 shadow-panel" key={ornament.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-black">{ornament.name}</h2>
                    <p className="mt-2 text-sm leading-6 text-ink/60">{ornament.rule}</p>
                  </div>
                  <Badge tone={ornament.status === "启用" ? "green" : "yellow"}>{ornament.status}</Badge>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg bg-paper p-3">
                    <p className="text-xs text-ink/45">对象</p>
                    <strong className="mt-1 block">{ornament.audience.join("、")}</strong>
                  </div>
                  <div className="rounded-lg bg-paper p-3">
                    <p className="text-xs text-ink/45">有效期</p>
                    <strong className="mt-1 block">{ornament.validDays}</strong>
                  </div>
                  <div className="rounded-lg bg-paper p-3">
                    <p className="text-xs text-ink/45">展示文案</p>
                    <strong className="mt-1 block">{ornament.label}</strong>
                  </div>
                </div>
              </article>
            ))}
          </section>
        ) : null}
      </ModuleShell>

      <Drawer open={Boolean(selectedOrnament)} title="挂件详情" onClose={() => setSelectedOrnament(null)}>
        {selectedOrnament ? (
          <div className="space-y-5">
            <OrnamentPreview ornament={selectedOrnament} />
            <DetailGrid
              items={[
                { label: "挂件名称", value: selectedOrnament.name },
                { label: "类型", value: selectedOrnament.type },
                { label: "适用对象", value: selectedOrnament.audience.join("、") },
                { label: "展示标签", value: selectedOrnament.label },
                { label: "稀有度", value: selectedOrnament.rarity },
                { label: "发放规则", value: selectedOrnament.rule },
                { label: "有效期", value: selectedOrnament.validDays },
                { label: "发放数量", value: `${selectedOrnament.grantedCount} 次` },
                { label: "佩戴数量", value: `${selectedOrnament.usedCount} 次` },
                { label: "状态", value: selectedOrnament.status }
              ]}
            />
            <section className="rounded-lg border border-line bg-white p-4">
              <h3 className="font-black">展示位置</h3>
              <div className="mt-3 grid gap-2 text-sm text-ink/65">
                {["用户 / 技师 / 商户信息卡", "动态作者头像", "IM 聊天信息卡", "预约详情页", "排行榜和推荐列表"].map((item) => (
                  <div className="flex items-center gap-2 rounded-lg bg-paper px-3 py-2" key={item}>
                    <span className={cn("h-2 w-2 rounded-full", selectedOrnament.status === "启用" ? "bg-mint" : "bg-lemon")} />
                    {item}
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </Drawer>
    </AdminLayout>
  );
}
