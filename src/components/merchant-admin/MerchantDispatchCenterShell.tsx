import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { ModuleShell } from "../admin/ModuleShell";
import { Button } from "../ui/Button";
import { TitleWithInfo } from "../ui/TitleWithInfo";
import { cn } from "../../lib/utils";

type DispatchTab = "current" | "appointments" | "schedule";

const dispatchTabs: Array<{ key: DispatchTab; label: string; to: string }> = [
  { key: "current", label: "现状确认", to: "/merchant-admin/dispatch-center/current" },
  { key: "appointments", label: "预约一览", to: "/merchant-admin/dispatch-center/appointments" },
  { key: "schedule", label: "排班", to: "/merchant-admin/dispatch-center/schedule" }
];

function getDispatchTabInfo(tab: DispatchTab) {
  if (tab === "current") {
    return "现状确认负责查看正在执行或即将执行的班表、异常、员工状态和 confirmed slots 投影。";
  }

  if (tab === "appointments") {
    return "预约一览与商户端前台保持同一套日程能力，可按日、周、月查看预约，并在 PC 侧快速处理担当、时间和备注。";
  }

  return "排班页承载手动、自动、智能三种方式；三种方式最终都必须进入现状确认。";
}

export function MerchantDispatchCenterShell({
  tab,
  title,
  description,
  breadcrumb,
  actions,
  children
}: {
  tab: DispatchTab;
  title: string;
  description: string;
  breadcrumb: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const headerActions = actions === undefined ? <Button variant="secondary">导出</Button> : actions;

  return (
    <ModuleShell actions={headerActions} description={description} title={title}>
      <section className="merchant-dispatch-surface sticky top-[110px] z-10 rounded-[26px] border p-4 backdrop-blur lg:top-[76px]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <TitleWithInfo
              as="h2"
              info={getDispatchTabInfo(tab)}
              label={`${breadcrumb}说明`}
              title={breadcrumb}
              titleClassName="text-xl font-black"
              variant="paper"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {dispatchTabs.map((item) => (
            <NavLink
              className={({ isActive }) =>
                cn(
                  "merchant-dispatch-toggle rounded-full border px-4 py-2 text-sm font-black transition",
                  isActive && "is-active"
                )
              }
              end
              key={item.to}
              to={item.to}
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      </section>

      <div className="mt-5">{children}</div>
    </ModuleShell>
  );
}
