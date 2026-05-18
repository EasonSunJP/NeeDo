import { useState } from "react";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { DetailGrid } from "../../components/admin/DetailGrid";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable } from "../../components/ui/DataTable";
import { Drawer } from "../../components/ui/Drawer";
import { FilterBar } from "../../components/ui/FilterBar";
import { Tabs } from "../../components/ui/Tabs";
import { fieldJobs } from "../../data/mock";
import { statusLabel, yen } from "../../lib/utils";
import { useEntityStore } from "../../state/entityStore";
import type { FieldJob } from "../../types/domain";

const tabs = ["待派工", "已派工", "服务中", "已完成", "异常工单"];

export function FieldJobsPage() {
  const { technicians } = useEntityStore();
  const [active, setActive] = useState("待派工");
  const [selected, setSelected] = useState<FieldJob | null>(null);
  const getTechnicianDisplayName = (name?: string | null) => {
    if (!name) {
      return "待分配";
    }

    const technician = technicians.find((item) => item.name === name || item.nickname === name);
    return technician?.nickname ? `${technician.nickname} / ${technician.name}` : technician?.name ?? name;
  };

  return (
    <AdminLayout>
      <ModuleShell
        title="上门工单中心"
        description="管理待派工、已派工、服务中、已完成和异常工单，沉淀拍照上传、完工确认与异常上报记录。"
        actions={<Button>创建工单</Button>}
      >
        <Tabs active={active} items={tabs} onChange={setActive} />
        <div className="mt-4">
          <FilterBar
            searchPlaceholder="搜索用户地址、技师、手机号"
            filters={[
              { label: "区域", options: [{ label: "新宿", value: "shinjuku" }, { label: "品川", value: "shinagawa" }] },
              { label: "服务类型", options: [{ label: "保洁", value: "clean" }, { label: "按摩", value: "massage" }] },
              { label: "异常", options: [{ label: "全部异常", value: "exception" }, { label: "无异常", value: "normal" }] }
            ]}
          />
        </div>
        <div className="mt-4">
          <DataTable<FieldJob>
            columns={[
              { key: "time", title: "服务时间", render: (row) => row.serviceTime },
              { key: "address", title: "用户地址", render: (row) => row.address },
              { key: "content", title: "服务内容", render: (row) => row.serviceContent },
              { key: "tech", title: "分配技师", render: (row) => getTechnicianDisplayName(row.technicianName) },
              { key: "quote", title: "报价", render: (row) => yen(row.quote) },
              { key: "status", title: "状态", render: (row) => <Badge tone={row.status === "exception" ? "red" : "yellow"}>{statusLabel(row.status)}</Badge> }
            ]}
            rows={fieldJobs}
            onView={setSelected}
          />
        </div>
      </ModuleShell>

      <Drawer open={Boolean(selected)} title="工单详情" onClose={() => setSelected(null)}>
        {selected && (
          <div className="space-y-5">
            <DetailGrid
              items={[
                { label: "用户地址", value: selected.address },
                { label: "服务时间", value: selected.serviceTime },
                { label: "服务内容", value: selected.serviceContent },
                { label: "分配技师", value: getTechnicianDisplayName(selected.technicianName) },
                { label: "联系电话", value: selected.phone },
                { label: "报价", value: yen(selected.quote) },
                { label: "备注", value: selected.exceptionNote ?? "无" },
                { label: "导航入口", value: "Google Maps / Apple Maps" }
              ]}
            />
            <div className="grid grid-cols-2 gap-3">
              <button className="rounded-lg border border-dashed border-line bg-paper p-5 text-sm font-bold text-ink/55" type="button">
                拍照上传
              </button>
              <button className="rounded-lg border border-dashed border-line bg-paper p-5 text-sm font-bold text-ink/55" type="button">
                完工确认
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {["派工", "改派", "联系用户", "导航", "异常上报", "完工"].map((action) => (
                <Button key={action} size="sm" variant={action === "异常上报" ? "danger" : "secondary"}>
                  {action}
                </Button>
              ))}
            </div>
          </div>
        )}
      </Drawer>
    </AdminLayout>
  );
}
