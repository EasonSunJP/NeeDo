import { useState } from "react";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { AdminToggleSwitch } from "../../components/admin/AdminToggleSwitch";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { HorizontalScrollArea } from "../../components/ui/HorizontalScrollArea";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import { permissionModules } from "../../data/mock";

const roles = ["平台管理员", "运营", "财务", "客服", "商家管理员", "店长", "技师/员工"];
const permissions = ["菜单权限", "查看权限", "编辑权限", "导出权限", "审核权限", "退款权限", "结算权限"];
const permissionModuleLabels: Record<string, string> = {
  Dashboard: "数据大盘",
  "Operation Timeline": "运营时间线",
  Analytics: "分析中心",
  Orders: "订单中心",
  "Field Jobs": "工单中心",
  CRM: "用户管理",
  Marketing: "营销中心",
  Finance: "财务结算",
  Reviews: "评价中心",
  Merchants: "商家门店",
  "Store Scheduling Overview": "调度中心 / 排班一览",
  "Store Scheduling Automation": "调度中心 / 自动化排班设定",
  "Store Dispatch": "调度中心 / 调度操作",
  "Store Inventory": "店铺库存管理",
  "Store Stage Layout": "店铺场控布局"
};

function getPermissionKey(module: string, permission: string) {
  return `${module}__${permission}`;
}

function getInitialPermissionState() {
  return Object.fromEntries(
    permissionModules.flatMap((module, rowIndex) =>
      permissions.map((permission, index) => [getPermissionKey(module, permission), rowIndex < 3 || index < 4 || module === "Finance"])
    )
  );
}

export function RolesPage() {
  const [permissionState, setPermissionState] = useState<Record<string, boolean>>(getInitialPermissionState);

  const updatePermission = (module: string, permission: string, checked: boolean) => {
    setPermissionState((current) => ({
      ...current,
      [getPermissionKey(module, permission)]: checked
    }));
  };

  return (
    <AdminLayout>
      <ModuleShell
        title="角色权限管理"
        description="按平台、运营、财务、客服、商家、店长和技师角色配置菜单、查看、编辑、导出、审核、退款与结算权限。"
        actions={<Button>新增角色</Button>}
      >
        <section className="grid gap-3 md:grid-cols-7">
          {roles.map((role, index) => (
            <article className={`rounded-lg border p-4 shadow-panel ${index === 0 ? "border-moss bg-mint/20" : "border-line bg-white"}`} key={role}>
              <TitleWithInfo
                as="h2"
                info={index === 0 ? "全平台权限" : "按模块授权"}
                label={`${role}说明`}
                title={role}
                titleClassName="font-bold"
                variant="paper"
              />
              <Badge className="mt-3" tone={index === 0 ? "green" : "neutral"}>{index === 0 ? "系统" : "可编辑"}</Badge>
            </article>
          ))}
        </section>

        <section className="mt-5 overflow-hidden rounded-lg border border-line bg-white shadow-panel">
          <div className="border-b border-line p-4">
            <TitleWithInfo
              as="h2"
              info="后端接入后可映射 Role、Permission、MenuPolicy 与审批流。"
              label="权限矩阵说明"
              title="权限矩阵"
              titleClassName="font-bold"
              variant="paper"
            />
          </div>
          <HorizontalScrollArea ariaLabel="权限矩阵横向滚动区域">
            <table className="w-full min-w-[980px] border-collapse text-sm">
              <thead className="bg-paper text-left text-xs font-bold uppercase text-ink/50">
                <tr>
                  <th className="border-b border-line px-4 py-3">模块</th>
                  {permissions.map((permission) => (
                    <th className="border-b border-line px-4 py-3" key={permission}>{permission}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {permissionModules.map((module, rowIndex) => (
                  <tr className="border-b border-line last:border-b-0" key={module}>
                    <td className="px-4 py-3 font-bold">{permissionModuleLabels[module] ?? module}</td>
                    {permissions.map((permission, index) => {
                      const permissionKey = getPermissionKey(module, permission);
                      const enabled = permissionState[permissionKey] ?? (rowIndex < 3 || index < 4 || module === "Finance");
                      return (
                        <td className="px-4 py-3 text-center" key={`${module}-${permission}`}>
                          <AdminToggleSwitch
                            ariaLabel={`${permissionModuleLabels[module] ?? module}${permission}${enabled ? "开启" : "关闭"}`}
                            checked={enabled}
                            onChange={(checked) => updatePermission(module, permission, checked)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </HorizontalScrollArea>
        </section>
      </ModuleShell>
    </AdminLayout>
  );
}
