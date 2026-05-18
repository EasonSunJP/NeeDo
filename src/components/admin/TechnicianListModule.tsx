import { useEffect, useState } from "react";
import { cn } from "../../lib/utils";
import type { Technician } from "../../types/domain";
import { AvatarImage } from "../ui/AvatarImage";
import { Badge } from "../ui/Badge";
import { DataTable, type Column } from "../ui/DataTable";
import { FilterBar } from "../ui/FilterBar";
import { TitleWithInfo } from "../ui/TitleWithInfo";

type ScopeMode = "platform" | "store";
type TechnicianListContext = "platform" | "merchant";
type StoreSummary = {
  id: string;
  name: string;
};

const statusText: Record<Technician["status"], string> = {
  available: "空闲",
  busy: "服务中",
  off: "休息"
};

function getStoreName(storeList: StoreSummary[], storeId: string) {
  return storeList.find((store) => store.id === storeId)?.name ?? "未绑定门店";
}

function TechnicianNameButton({
  technician,
  onSelect
}: {
  technician: Technician;
  onSelect: (technician: Technician) => void;
}) {
  return (
    <button className="focus-ring font-black text-moss hover:underline" onClick={() => onSelect(technician)} type="button">
      {technician.nickname ? `${technician.nickname} / ${technician.name}` : technician.name}
    </button>
  );
}

export function TechnicianListModule({
  context,
  technicians,
  stores,
  onSelectTechnician
}: {
  context: TechnicianListContext;
  technicians: Technician[];
  stores: StoreSummary[];
  onSelectTechnician: (technician: Technician) => void;
}) {
  const [scope, setScope] = useState<ScopeMode>("platform");
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");

  useEffect(() => {
    if (!stores.some((store) => store.id === storeId)) {
      setStoreId(stores[0]?.id ?? "");
    }
  }, [storeId, stores]);

  const visibleTechnicians = context === "merchant" ? technicians : scope === "store" ? technicians.filter((technician) => technician.storeId === storeId) : technicians;

  const staffLabel = context === "merchant" ? "员工" : "技师";

  const technicianColumns: Array<Column<Technician>> = [
    {
      key: "profile",
      title: staffLabel,
      render: (row) => (
        <div className="flex items-center gap-3">
          <AvatarImage alt={row.name} className="h-10 w-10 shrink-0" src={row.avatar} />
          <div className="min-w-0">
            <TechnicianNameButton onSelect={onSelectTechnician} technician={row} />
            <p className="mt-1 text-xs text-ink/45">
              {getStoreName(stores, row.storeId)}
              {row.accountUsername ? ` · 测试账号 ${row.accountUsername}` : ""}
            </p>
          </div>
        </div>
      )
    },
    {
      key: "status",
      title: "状态",
      render: (row) => (
        <Badge tone={row.status === "available" ? "green" : row.status === "busy" ? "yellow" : "neutral"}>
          {statusText[row.status]}
        </Badge>
      )
    },
    { key: "skills", title: "能力标签", render: (row) => row.skills.slice(0, 3).join("、") },
    { key: "areas", title: "服务区域", render: (row) => row.serviceAreas.join("、") },
    { key: "rating", title: "评分", render: (row) => `★ ${row.rating.toFixed(2)} · ${row.reviewCount}` },
    { key: "orders", title: "订单量", render: (row) => `${row.orderCount} 单` },
    { key: "accept", title: "接单率", render: (row) => `${row.acceptRate}%` }
  ];

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-line bg-white p-4 shadow-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TitleWithInfo
            as="h2"
            info={
              context === "platform"
                ? "切换后可模拟平台后台和店铺后台看到的数据范围。"
                : "当前页与平台运营后台共用同一套员工列表模块，商户侧只显示自己可管理的员工。"
            }
            label="可见范围说明"
            title="可见范围"
            titleClassName="text-lg font-black"
            variant="paper"
          />
          {context === "platform" ? (
            <div className="flex flex-wrap gap-2">
              {[
                ["platform", "平台后台"],
                ["store", "店铺后台"]
              ].map(([value, label]) => (
                <button
                  className={cn(
                    "focus-ring rounded-lg border px-4 py-2 text-sm font-black",
                    scope === value ? "border-ink bg-ink text-white" : "border-line bg-paper text-ink/60"
                  )}
                  key={value}
                  onClick={() => setScope(value as ScopeMode)}
                  type="button"
                >
                  {label}
                </button>
              ))}
              {scope === "store" ? (
                <select
                  className="h-10 rounded-lg border border-line bg-paper px-3 text-sm font-black outline-none"
                  onChange={(event) => setStoreId(event.target.value)}
                  value={storeId}
                >
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <span className="rounded-lg border border-ink bg-ink px-4 py-2 text-sm font-black text-white">商户后台</span>
              <span className="rounded-lg border border-line bg-paper px-4 py-2 text-sm font-black text-ink/65">
                {stores.length > 1 ? `${stores.length} 家门店` : stores[0]?.name ?? "当前门店"}
              </span>
              <span className="rounded-lg border border-line bg-paper px-4 py-2 text-sm font-black text-ink/65">
                {technicians.length} 位员工
              </span>
            </div>
          )}
        </div>
      </section>

      <FilterBar
        searchPlaceholder={context === "merchant" ? "搜索员工姓名、门店、技能、区域" : "搜索技师姓名、门店、技能、区域"}
        filters={[
          { label: "状态", options: [{ label: "空闲", value: "available" }, { label: "服务中", value: "busy" }, { label: "休息", value: "off" }] },
          { label: "语言", options: [{ label: "日本語", value: "ja" }, { label: "中文", value: "zh" }, { label: "English", value: "en" }] },
          { label: "接单率", options: [{ label: "90% 以上", value: "90" }, { label: "95% 以上", value: "95" }] }
        ]}
      />

      <DataTable columns={technicianColumns} onView={onSelectTechnician} pageSize={10} rows={visibleTechnicians} />
    </div>
  );
}
