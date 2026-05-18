import { useState } from "react";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { DetailGrid } from "../../components/admin/DetailGrid";
import { GoogleScheduleCalendar } from "../../components/admin/GoogleScheduleCalendar";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { StoreShiftPlanningWorkspace } from "../../components/scheduling/StoreShiftPlanningWorkspace";
import { TechnicianProfilePanel } from "../../components/admin/TechnicianProfilePanel";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { DataTable } from "../../components/ui/DataTable";
import { Drawer } from "../../components/ui/Drawer";
import { fieldJobs, orders } from "../../data/mock";
import { dispatchTodayKey, parseDateKey, type DispatchCalendarView } from "../../lib/dispatchCalendar";
import { statusLabel } from "../../lib/utils";
import { useEntityStore } from "../../state/entityStore";
import { useScheduleStore } from "../../state/scheduleStore";
import type { Schedule, Technician } from "../../types/domain";

export function DispatchPage() {
  const { technicians } = useEntityStore();
  const { schedules } = useScheduleStore();
  const [selectedSchedule, setSelectedSchedule] = useState<Schedule | null>(null);
  const [selectedTechnician, setSelectedTechnician] = useState<Technician | null>(null);
  const [dispatchView, setDispatchView] = useState<DispatchCalendarView>("week");
  const [dispatchDate, setDispatchDate] = useState(() => parseDateKey(dispatchTodayKey));
  const selectedScheduleTechnician = selectedSchedule ? technicians.find((tech) => tech.id === selectedSchedule.staffId) : undefined;

  const openTechnicianProfile = (technician: Technician) => {
    setSelectedTechnician(technician);
  };
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
        title="调度中心"
        description="后台管理端可代店铺执行同等的一键排班与一键确认操作，同时保留下方共享日历用于跨店调度和工单排查。"
      >
        <StoreShiftPlanningWorkspace mode="admin" />

        <GoogleScheduleCalendar
          currentDate={dispatchDate}
          onCurrentDateChange={setDispatchDate}
          onScheduleClick={setSelectedSchedule}
          onTechnicianClick={openTechnicianProfile}
          onViewChange={setDispatchView}
          orders={orders}
          showIntegratedCapacityHeader
          technicians={technicians}
          view={dispatchView}
        />

        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <section>
            <h2 className="mb-3 text-lg font-bold">员工排班</h2>
            <DataTable<Schedule>
              columns={[
                {
                  key: "staff",
                  title: "员工",
                  render: (row) => {
                    const technician = technicians.find((tech) => tech.id === row.staffId);

                    return technician ? (
                      <button className="focus-ring font-black text-moss hover:underline" onClick={() => openTechnicianProfile(technician)} type="button">
                        {technician.nickname ? `${technician.nickname} / ${technician.name}` : technician.name}
                      </button>
                    ) : row.staffId;
                  }
                },
                { key: "date", title: "日期", render: (row) => row.date },
                { key: "time", title: "时间", render: (row) => `${row.startTime}-${row.endTime}` },
                { key: "status", title: "状态", render: (row) => <Badge tone={row.status === "free" ? "green" : "yellow"}>{row.status}</Badge> }
              ]}
              footerPlacement="inline"
              rows={schedules}
            />
          </section>
          <section>
            <h2 className="mb-3 text-lg font-bold">区域派单池</h2>
            <DataTable
              columns={[
                { key: "content", title: "服务内容", render: (row) => row.serviceContent },
                { key: "address", title: "地址", render: (row) => row.address },
                { key: "tech", title: "技师", render: (row) => getTechnicianDisplayName(row.technicianName) },
                { key: "status", title: "状态", render: (row) => <Badge tone="yellow">{statusLabel(row.status)}</Badge> }
              ]}
              footerPlacement="inline"
              rows={fieldJobs}
            />
          </section>
        </div>

        <section className="mt-5">
          <h2 className="mb-3 text-lg font-bold">技师实时状态</h2>
          <DataTable<Technician>
            columns={[
              {
                key: "name",
                title: "技师",
                render: (row) => (
                  <button className="focus-ring font-black text-moss hover:underline" onClick={() => openTechnicianProfile(row)} type="button">
                    {row.nickname ? `${row.nickname} / ${row.name}` : row.name}
                  </button>
                )
              },
              { key: "status", title: "状态", render: (row) => <Badge tone={row.status === "available" ? "green" : "yellow"}>{row.status}</Badge> },
              { key: "areas", title: "服务范围", render: (row) => row.serviceAreas.join("、") },
              { key: "accept", title: "接单率", render: (row) => `${row.acceptRate}%` },
              { key: "move", title: "移动预估", render: () => "18-35 分钟" }
            ]}
            footerPlacement="inline"
            rows={technicians}
          />
        </section>
      </ModuleShell>

      <Drawer open={Boolean(selectedSchedule)} title="排班详情" onClose={() => setSelectedSchedule(null)}>
        {selectedSchedule ? (
          <div className="space-y-5">
            <DetailGrid
              items={[
                {
                  label: "技师",
                  value: selectedScheduleTechnician
                    ? selectedScheduleTechnician.nickname
                      ? `${selectedScheduleTechnician.nickname} / ${selectedScheduleTechnician.name}`
                      : selectedScheduleTechnician.name
                    : selectedSchedule.staffId
                },
                { label: "日期", value: selectedSchedule.date },
                { label: "时间", value: `${selectedSchedule.startTime}-${selectedSchedule.endTime}` },
                { label: "状态", value: selectedSchedule.status === "free" ? "空闲" : selectedSchedule.status === "booked" ? "已预约" : "锁定" },
                { label: "订单", value: selectedSchedule.orderId ?? "未绑定订单" },
                { label: "服务区域", value: selectedScheduleTechnician?.serviceAreas.join("、") ?? "-" }
              ]}
            />
            <div className="grid gap-3 sm:grid-cols-3">
              <Button>调整时间</Button>
              <Button variant="secondary">分配订单</Button>
              <Button variant="secondary">锁定时段</Button>
            </div>
          </div>
        ) : null}
      </Drawer>

      <Drawer open={Boolean(selectedTechnician)} title="技师详细信息卡" onClose={() => setSelectedTechnician(null)}>
        {selectedTechnician ? <TechnicianProfilePanel technician={selectedTechnician} /> : null}
      </Drawer>
    </AdminLayout>
  );
}
