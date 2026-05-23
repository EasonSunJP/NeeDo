import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { TechnicianProfilePanel } from "../../components/admin/TechnicianProfilePanel";
import { AppIcon, FeatureSegmentedTabs } from "../../components/client-ui/AppScaffold";
import {
  createCustomContactCategoryDraft,
  CustomContactCategoryEditor,
  ContactDirectorySection,
  ContactShortcutGrid,
  ContactShortcutPanel,
  type ContactShortcut,
  type ContactShortcutPanelItem,
  type CustomContactCategory,
  type DirectoryContactItem,
  matchesCustomContactCategory,
  useCustomContactCategories
} from "../../components/mobile/ContactDirectory";
import { FloatingHomeHeader } from "../../components/mobile/FloatingHomeHeader";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileFullscreenPage } from "../../components/mobile/MobileFullscreenPage";
import { MobileShell } from "../../components/mobile/MobileShell";
import { MobileMessageCenter } from "../../components/mobile/MobileMessageCenter";
import {
  ContactInfoStatusPanel,
  type ContactInfoStatusFilter,
  type ContactInfoStatusItem
} from "../../components/mobile/ContactInfoStatusPanel";
import { OrderServiceMiniCard } from "../../components/mobile/OrderServiceMiniCard";
import { SharedHomeHeader } from "../../components/mobile/SharedHomeHeader";
import { SectionTitle } from "../../components/mobile/SectionTitle";
import { merchantNavItems, roleBasedTabConfig } from "../../components/mobile/navItems";
import { UnifiedUserCalendar } from "../../components/scheduling/UnifiedUserCalendar";
import { Badge } from "../../components/ui/Badge";
import { AvatarImage } from "../../components/ui/AvatarImage";
import { Button } from "../../components/ui/Button";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import { imageBank, orders, settlements } from "../../data/mock";
import { DispatchOverviewWorkspace } from "../../features/dispatch-center/components/OverviewWorkspace";
import { ImContactsListPage, ImMessagesEntryPage } from "../../features/im/pages";
import { ImScopeProvider } from "../../features/im/scope";
import { useImStore } from "../../features/im/store";
import { MerchantPrimaryNavCarousel } from "../../features/merchant-navigation/MerchantPrimaryNavCarousel";
import { AutomationWizard } from "../../features/scheduling/automation/AutomationWizard";
import { partitionDirectoryContacts } from "../../lib/contactDirectory";
import { parseBrowserStorageJson, writeBrowserStorage } from "../../lib/browserStorage";
import { getStoreCardDecorationConfig } from "../../lib/storeUiDecoration";
import { getMerchantCustomerConversationId, getMerchantTechnicianConversationId, getMessagePath } from "../../lib/messageCenter";
import {
  getMerchantStaffEmploymentLabel,
  getMerchantStaffRoleNames,
  getResolvedMerchantStaffRoleName,
  merchantManualEmployeeStorageKey,
  merchantStaffRoleLabelStorageKey,
  merchantStaffRoleQuickOptions,
  merchantTechnicianRoleName
} from "../../lib/merchantStaffRoles";
import { SocialProfileMiniCard, buildTechnicianInfoCardData, buildUserInfoCardData } from "../../shared/profile-card";
import { getScopedProfileDetailPath } from "../../shared/profile-detail";
import { updateTechnicianEntity, useEntityStore } from "../../state/entityStore";
import { cn, statusLabel, yen } from "../../lib/utils";
import type { Order, Store, Technician } from "../../types/domain";
import { StoreDetailExperience } from "../user/StoreDetailPage";
import { ShopAnalyticsDashboard } from "../../features/shop-analytics/ShopAnalyticsDashboard";

type MerchantView = "dashboard" | "orders" | "messages" | "schedule" | "staff" | "contacts" | "moments" | "me";
type MerchantMeTab = "service" | "data";
type MerchantSchedulePrimaryTab = "current" | "appointments" | "planning";
type MerchantStaffTab = "all" | "fullTime" | "partTime";
type StaffStatus = "出勤" | "休息" | "服务中" | "可指派";
type MerchantEmployeeRoleDraft = (typeof merchantStaffRoleQuickOptions)[number] | "custom";
type MerchantManualEmployeeStatus = "在岗" | "休息" | "待入职";
type MerchantManualEmployee = {
  id: string;
  storeId: string;
  name: string;
  roleName: string;
  salaryMonthly: number;
  status: MerchantManualEmployeeStatus;
  employmentType: Exclude<MerchantStaffTab, "all">;
};
type MerchantStoreStaffEntry = {
  employmentType: Exclude<MerchantStaffTab, "all">;
  status: StaffStatus;
  technician: Technician;
};
type MerchantStaffRoleGroup = {
  roleName: string;
  technicianEntries: MerchantStoreStaffEntry[];
  employees: MerchantManualEmployee[];
  count: number;
  monthlyCost: number;
};
type MerchantContactModal = { type: "staff"; id: string } | { type: "customer"; id: string } | null;
type MerchantContactStatusFilter = ContactInfoStatusFilter;
type MerchantContactStatusItem = ContactInfoStatusItem;
type MerchantIncomeTrendPoint = {
  key: string;
  label: string;
  subLabel: string;
  income: number;
  future?: boolean;
};
type MerchantPendingStaffDelete =
  | { type: "manual"; id: string; name: string }
  | { type: "technician"; id: string; name: string };
const merchantDetachedTechnicianStoreId = "unassigned";
const merchantInitialManualEmployees: MerchantManualEmployee[] = [
  {
    id: "manual-employee-chef-1",
    storeId: "store-1",
    name: "佐藤 宏",
    roleName: "厨师",
    salaryMonthly: 320000,
    status: "在岗",
    employmentType: "fullTime"
  },
  {
    id: "manual-employee-driver-1",
    storeId: "store-1",
    name: "高田 真司",
    roleName: "司机",
    salaryMonthly: 260000,
    status: "在岗",
    employmentType: "fullTime"
  },
  {
    id: "manual-employee-finance-1",
    storeId: "store-1",
    name: "林 美咲",
    roleName: "财务",
    salaryMonthly: 300000,
    status: "待入职",
    employmentType: "fullTime"
  }
];
const merchantIncomeTrendPoints: MerchantIncomeTrendPoint[] = [
  { key: "2026-04-07", label: "4/7", subLabel: "(二)", income: 88000 },
  { key: "2026-04-08", label: "4/8", subLabel: "(三)", income: 102000 },
  { key: "2026-04-09", label: "4/9", subLabel: "(四)", income: 76000 },
  { key: "2026-04-10", label: "4/10", subLabel: "(五)", income: 114000 },
  { key: "2026-04-11", label: "4/11", subLabel: "(六)", income: 92000 },
  { key: "2026-04-12", label: "4/12", subLabel: "(日)", income: 126000 },
  { key: "2026-04-13", label: "4/13", subLabel: "(一)", income: 86000 }
];
const merchantCityLabelMap: Record<string, string> = {
  東京都: "东京",
  大阪府: "大阪",
  神奈川県: "横滨",
  愛知県: "名古屋"
};
function getMerchantView(view?: string): MerchantView {
  if (view === "staff") {
    return "staff";
  }

  if (view === "customers" || view === "contacts") {
    return "contacts";
  }

  if (view === "orders" || view === "messages" || view === "schedule" || view === "moments" || view === "me") {
    return view;
  }

  return "dashboard";
}

function getMerchantMeTab(value?: string | null): MerchantMeTab {
  if (value === "service") {
    return value;
  }

  return "data";
}

function getMerchantLocationLabel(store?: Store | null) {
  if (!store) {
    return "定位中";
  }

  const cityPrefix = Object.keys(merchantCityLabelMap).find((prefix) => store.address.startsWith(prefix));
  const cityLabel = cityPrefix ? merchantCityLabelMap[cityPrefix] : "";

  if (cityLabel && store.area) {
    return `${cityLabel} · ${store.area}`;
  }

  return store.area || cityLabel || "定位中";
}

function formatMerchantOrderDateRange(startDate: string, endDate: string) {
  if (!startDate && !endDate) {
    return "";
  }

  if (!startDate || startDate === endDate) {
    return endDate || startDate;
  }

  if (!endDate) {
    return `${startDate} 起`;
  }

  return `${startDate} - ${endDate}`;
}

function getMerchantOrderHeaderSubtitle(orderList: Order[], startDate = "", endDate = "") {
  const latestDate = orderList.map((order) => order.bookedAt.slice(0, 10)).sort().at(-1) ?? "2026-04-12";
  const dateRange = formatMerchantOrderDateRange(startDate, endDate) || latestDate;

  return `${startDate || endDate ? "按时间" : "今日"} · 按小时 · ${dateRange}`;
}

function merchantOrderMatchesSearch(order: Order, query: string, startDate = "", endDate = "") {
  const normalizedQuery = query.trim().toLowerCase();
  const orderDate = order.bookedAt.slice(0, 10);

  if (startDate && orderDate < startDate) {
    return false;
  }

  if (endDate && orderDate > endDate) {
    return false;
  }

  if (!normalizedQuery) {
    return true;
  }

  return [
    order.orderNo,
    order.itemName,
    order.customerName,
    order.technicianName ?? "",
    order.area,
    order.source,
    statusLabel(order.status),
    yen(order.amount)
  ].some((value) => value.toLowerCase().includes(normalizedQuery));
}

function getMerchantStaffDetailPath(id: string) {
  return `/merchant/staff/${encodeURIComponent(id)}`;
}

function getMerchantAddStaffPath(staffType: Exclude<MerchantStaffTab, "all">, roleName?: string) {
  const params = new URLSearchParams({
    intent: "add-staff",
    staffType
  });

  if (roleName?.trim()) {
    params.set("roleName", roleName.trim());
  }

  return `/merchant/contacts?${params.toString()}`;
}

function normalizeMerchantManualEmployees(list: MerchantManualEmployee[]): MerchantManualEmployee[] {
  return list
    .filter((employee) => employee.name.trim().length > 0 && employee.roleName.trim().length > 0)
    .map((employee, index) => {
      const status: MerchantManualEmployeeStatus = employee.status === "休息" || employee.status === "待入职" ? employee.status : "在岗";
      const employmentType: Exclude<MerchantStaffTab, "all"> = employee.employmentType === "partTime" ? "partTime" : "fullTime";

      return {
        id: employee.id || `manual-employee-${index}`,
        storeId: employee.storeId || "store-1",
        name: employee.name.trim(),
        roleName: employee.roleName.trim(),
        salaryMonthly: Number.isFinite(employee.salaryMonthly) && employee.salaryMonthly >= 0
          ? Math.round(employee.salaryMonthly)
          : 0,
        status,
        employmentType
      };
    });
}

function getInitialMerchantManualEmployees() {
  return normalizeMerchantManualEmployees(parseBrowserStorageJson<MerchantManualEmployee[]>(
    merchantManualEmployeeStorageKey,
    merchantInitialManualEmployees,
    { removeOnError: true, silent: true }
  ));
}

function parseMerchantEmployeeSalary(value: string) {
  const numericValue = Number(value.replace(/[^\d]/g, ""));

  return Number.isFinite(numericValue) && numericValue > 0 ? Math.round(numericValue) : 0;
}

function getInitialMerchantStaffRoleLabelOverrides() {
  return parseBrowserStorageJson<Record<string, string>>(
    merchantStaffRoleLabelStorageKey,
    {},
    { removeOnError: true, silent: true }
  );
}

function getMerchantRoleOverrideKey(roleName: string, roleNameOverrides: Record<string, string>) {
  if (roleName === merchantTechnicianRoleName || roleNameOverrides[merchantTechnicianRoleName] === roleName) {
    return merchantTechnicianRoleName;
  }

  return merchantStaffRoleQuickOptions.find((option) => option === roleName || roleNameOverrides[option] === roleName);
}

function normalizeMerchantStaffRoleDraft(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function replaceMerchantStaffRoleTag(tags: string[], oldRoleName: string, nextRoleName: string, ensureNext: boolean) {
  const nextTags = tags.filter((tag) => tag !== oldRoleName && tag !== nextRoleName);

  return ensureNext || nextTags.length !== tags.length ? [...nextTags, nextRoleName] : tags;
}

function buildMerchantStaffRoleGroups(
  technicianEntries: MerchantStoreStaffEntry[],
  employees: MerchantManualEmployee[],
  roleNameOverrides: Record<string, string>
): MerchantStaffRoleGroup[] {
  const manualRoleNames = getMerchantStaffRoleNames(employees, { includeTechnician: false, roleNameOverrides });
  const technicianRoleName = getResolvedMerchantStaffRoleName(merchantTechnicianRoleName, roleNameOverrides);

  return [
    {
      roleName: technicianRoleName,
      technicianEntries,
      employees: [],
      count: technicianEntries.length,
      monthlyCost: 0
    },
    ...manualRoleNames.map((roleName) => {
      const roleEmployees = employees.filter((employee) => employee.roleName === roleName);

      return {
        roleName,
        technicianEntries: [],
        employees: roleEmployees,
        count: roleEmployees.length,
        monthlyCost: roleEmployees.reduce((sum, employee) => sum + employee.salaryMonthly, 0)
      };
    })
  ];
}

function getMerchantScheduleTab(value?: string | null): MerchantSchedulePrimaryTab {
  if (value === "appointments") {
    return "appointments";
  }

  if (value === "planning" || value === "automation" || value === "manual" || value === "smart") {
    return "planning";
  }

  return "current";
}

function getMerchantStaffTab(value?: string | null): MerchantStaffTab {
  if (value === "fullTime" || value === "partTime") {
    return value;
  }

  return "all";
}

function getMerchantStaffEmploymentType(technician: Technician, index: number): Exclude<MerchantStaffTab, "all"> {
  if (technician.identityLabel === "个人技师") {
    return "partTime";
  }

  if (technician.identityLabel === "店铺所属技师") {
    return "fullTime";
  }

  return index % 4 === 3 ? "partTime" : "fullTime";
}

function getMerchantStaffStatus(technician: Technician): StaffStatus {
  if (technician.status === "busy") {
    return "服务中";
  }

  if (technician.status === "off") {
    return "休息";
  }

  return "可指派";
}

function getMerchantStaffStatusTopTag(status: StaffStatus) {
  return {
    label: status,
    tone: status === "可指派" ? "green" as const : status === "服务中" ? "yellow" as const : "neutral" as const
  };
}

function getMerchantEmploymentTopTag(employmentType: Exclude<MerchantStaffTab, "all">) {
  return {
    label: getMerchantStaffEmploymentLabel(employmentType),
    tone: employmentType === "fullTime" ? "purple" as const : "yellow" as const
  };
}

function MerchantAddStaffButton({ staffType }: { staffType: Exclude<MerchantStaffTab, "all"> }) {
  const label = `添加${getMerchantStaffEmploymentLabel(staffType)}`;

  return (
    <Link
      aria-label={label}
      className="focus-ring inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--client-primary)_62%,var(--client-line))] bg-[color:var(--client-primary)] text-[color:var(--client-needo-text)] shadow-[0_12px_28px_color-mix(in_srgb,var(--client-primary)_30%,transparent)] transition hover:-translate-y-0.5"
      title={label}
      to={getMerchantAddStaffPath(staffType)}
    >
      <AppIcon className="h-5 w-5" name="plus" />
      <span className="sr-only">{label}</span>
    </Link>
  );
}

function MerchantRemoveStaffIconButton({
  label,
  onClick,
  onCover = false
}: {
  label: string;
  onClick: () => void;
  onCover?: boolean;
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        "focus-ring inline-flex h-8 w-8 items-center justify-center rounded-full border transition active:scale-[0.96]",
        onCover
          ? "border-white/32 bg-white/92 text-[#ef4f3f] shadow-[0_10px_20px_rgba(0,0,0,0.18)]"
          : "border-[color:color-mix(in_srgb,var(--client-accent)_42%,var(--client-line))] bg-[color:color-mix(in_srgb,var(--client-accent)_12%,var(--client-surface))] text-[color:var(--client-accent)]"
      )}
      onClick={onClick}
      type="button"
    >
      <AppIcon className="h-4 w-4" name="minus" />
    </button>
  );
}

function MerchantManualEmployeeCard({
  employee,
  onDelete
}: {
  employee: MerchantManualEmployee;
  onDelete: (employee: MerchantManualEmployee) => void;
}) {
  return (
    <article className="rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_86%,var(--client-bg)_14%)] p-3 text-[color:var(--client-text)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black">{employee.name}</p>
          <p className="mt-1 text-[11px] font-bold text-[color:var(--client-muted)]">{employee.roleName}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-[color:var(--client-primary-soft)] px-2.5 py-1 text-[11px] font-black text-[color:var(--client-primary)]">
            {employee.status}
          </span>
          <MerchantRemoveStaffIconButton label={`删除${employee.name}`} onClick={() => onDelete(employee)} />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-[16px] bg-[color:color-mix(in_srgb,var(--client-bg)_68%,var(--client-surface)_32%)] px-3 py-2">
          <p className="text-[10px] font-black text-[color:var(--client-muted)]">雇佣</p>
          <strong className="mt-1 block text-xs font-black">{getMerchantStaffEmploymentLabel(employee.employmentType)}</strong>
        </div>
        <div className="rounded-[16px] bg-[color:color-mix(in_srgb,var(--client-bg)_68%,var(--client-surface)_32%)] px-3 py-2">
          <p className="text-[10px] font-black text-[color:var(--client-muted)]">月人件费（日元）</p>
          <strong className="mt-1 block text-xs font-black">{yen(employee.salaryMonthly)}</strong>
        </div>
      </div>
    </article>
  );
}

function MerchantStaffRoleSection({
  group,
  onAdd,
  onRename,
  addTo,
  children
}: {
  group: MerchantStaffRoleGroup;
  onAdd?: (roleName: string) => void;
  onRename: (roleName: string, nextRoleName: string) => void;
  addTo?: string;
  children: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [roleNameDraft, setRoleNameDraft] = useState(group.roleName);

  useEffect(() => {
    if (!editing) {
      setRoleNameDraft(group.roleName);
    }
  }, [editing, group.roleName]);

  const saveRoleName = () => {
    onRename(group.roleName, roleNameDraft);
    setEditing(false);
  };
  const addButtonClassName = "focus-ring inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--client-primary)] text-[color:var(--client-needo-text)] shadow-[0_10px_20px_color-mix(in_srgb,var(--client-primary)_24%,transparent)]";

  return (
    <section className="rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_52%,var(--client-surface)_48%)] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          {editing ? (
            <div className="flex min-w-0 items-center gap-2">
              <input
                className="h-9 min-w-0 rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_82%,transparent)] bg-[color:var(--client-surface)] px-3 text-sm font-black text-[color:var(--client-text)] outline-none focus:border-[color:var(--client-primary)]"
                onChange={(event) => setRoleNameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    saveRoleName();
                  }
                  if (event.key === "Escape") {
                    setEditing(false);
                  }
                }}
                value={roleNameDraft}
              />
              <button aria-label="保存职务名" className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--client-primary)] text-[color:var(--client-needo-text)]" onClick={saveRoleName} type="button">
                <AppIcon className="h-4 w-4" name="check" />
              </button>
            </div>
          ) : (
            <div className="flex min-w-0 items-center gap-2">
              <h3 className="truncate text-base font-black text-[color:var(--client-text)]">{group.roleName}</h3>
              <button
                aria-label={`编辑${group.roleName}职务名`}
                className="focus-ring inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_72%,transparent)] text-[color:var(--client-muted)]"
                onClick={() => setEditing(true)}
                type="button"
              >
                <AppIcon className="h-3.5 w-3.5" name="edit" />
              </button>
            </div>
          )}
          <p className="mt-1 text-[11px] font-bold text-[color:var(--client-muted)]">
            {group.count} 人{group.monthlyCost > 0 ? ` · ${yen(group.monthlyCost)}/月` : ""}
          </p>
        </div>
        {addTo ? (
          <Link
            aria-label={`在${group.roleName}下添加员工`}
            className={addButtonClassName}
            to={addTo}
          >
            <AppIcon className="h-5 w-5" name="plus" />
          </Link>
        ) : (
          <button
            aria-label={`在${group.roleName}下添加员工`}
            className={addButtonClassName}
            onClick={() => onAdd?.(group.roleName)}
            type="button"
          >
            <AppIcon className="h-5 w-5" name="plus" />
          </button>
        )}
      </div>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function getMerchantOrderProvider(order: Order, store: Store, technicians: Technician[]) {
  return technicians.find((technician) => technician.name === order.technicianName || technician.nickname === order.technicianName) ?? store;
}

function formatMerchantAppointmentEventDateLabel(value: string, fallbackIndex = 0) {
  const [datePart = "2026-04-20", timePart = "12:00"] = value.split(" ");
  const [year = "2026", month = "04", day = "20"] = datePart.split("-");
  const time = timePart.length === 5 ? `${timePart}:00` : timePart || `${String(12 + fallbackIndex).padStart(2, "0")}:00:00`;

  return `${year.slice(-2)}.${month}.${day} ${time}`;
}

function getMerchantAppointmentEventTime(value: string) {
  const [, timePart = "12:00"] = value.split(" ");
  return timePart.slice(0, 5) || "12:00";
}

function getMerchantAppointmentEventRange(order: Order, fallbackIndex: number) {
  const start = getMerchantAppointmentEventTime(order.bookedAt);
  const [hourText = "12", minute = "00"] = start.split(":");
  const endHour = (Number(hourText) + (order.itemName.includes("90") || order.mode === "store" ? 1 : 2)) % 24;

  return `${start}-${String(endHour).padStart(2, "0")}:${minute || (fallbackIndex % 2 === 0 ? "00" : "30")}`;
}

function buildMerchantAppointmentContactStatusItems(orderList: Order[], technicians: Technician[]): MerchantContactStatusItem[] {
  const homeOrders = orderList.filter((order) => order.mode === "home");
  const storeOrders = orderList.filter((order) => order.mode === "store");
  const unassignedOrder = homeOrders.find((order) => !order.technicianName && ["pending", "confirmed", "scheduled"].includes(order.status));
  const activeHomeOrder = homeOrders.find((order) => order.technicianName && ["confirmed", "scheduled"].includes(order.status)) ?? homeOrders[0];
  const activeStoreOrder = storeOrders.find((order) => ["confirmed", "scheduled"].includes(order.status)) ?? storeOrders[0];
  const cancelledOrder = orderList.find((order) => ["cancelled", "refunding", "refunded"].includes(order.status)) ?? orderList[3] ?? orderList[0];
  const resolvedOrder = orderList.find((order) => order.status === "inService" || order.status === "completed") ?? orderList[2] ?? orderList[0];
  const fallbackTechnician = technicians.find((technician) => technician.status === "available") ?? technicians[0];
  const items: MerchantContactStatusItem[] = [];

  if (activeStoreOrder) {
    const range = getMerchantAppointmentEventRange(activeStoreOrder, 0);

    items.push({
      id: `appointment-customer-no-show-${activeStoreOrder.id}`,
      dateLabel: formatMerchantAppointmentEventDateLabel(activeStoreOrder.bookedAt),
      detail: `超过预约时间客人还没到：${activeStoreOrder.customerName} ${range} 未到店，需要前台确认是否保留座位。`,
      icon: <AppIcon className="h-5 w-5" name="clock" />,
      status: "active",
      statusLabel: "处理中",
      title: "系统信息",
      tone: "red"
    });
  }

  if (activeHomeOrder) {
    const range = getMerchantAppointmentEventRange(activeHomeOrder, 1);

    items.push({
      id: `appointment-technician-late-${activeHomeOrder.id}`,
      dateLabel: formatMerchantAppointmentEventDateLabel(activeHomeOrder.bookedAt),
      detail: `技师还没到客人地址：${activeHomeOrder.technicianName ?? fallbackTechnician?.name ?? "担当技师"} ${range} 仍未完成到达确认。`,
      icon: <AppIcon className="h-5 w-5" name="map" />,
      status: "active",
      statusLabel: "处理中",
      title: "系统信息",
      tone: "red"
    });
  }

  if (unassignedOrder) {
    const range = getMerchantAppointmentEventRange(unassignedOrder, 2);

    items.push({
      id: `appointment-unassigned-${unassignedOrder.id}`,
      dateLabel: formatMerchantAppointmentEventDateLabel(unassignedOrder.bookedAt),
      detail: `预约未分配：${unassignedOrder.itemName}，${range} 仍未安排技师。`,
      icon: <AppIcon className="h-5 w-5" name="calendar" />,
      status: "active",
      statusLabel: "处理中",
      title: "系统信息"
    });
  }

  if (cancelledOrder) {
    const range = getMerchantAppointmentEventRange(cancelledOrder, 3);

    items.push({
      id: `appointment-cancelled-${cancelledOrder.id}`,
      dateLabel: formatMerchantAppointmentEventDateLabel(cancelledOrder.createdAt || cancelledOrder.bookedAt),
      detail: `临时取消预约：${cancelledOrder.customerName} 取消 ${range} ${cancelledOrder.itemName}，需要确认退款或重新开放时段。`,
      icon: <AppIcon className="h-5 w-5" name="bell" />,
      status: cancelledOrder.status === "refunded" ? "resolved" : "expired",
      statusLabel: cancelledOrder.status === "refunded" ? "已解决" : "已过期",
      title: "系统信息",
      tone: cancelledOrder.status === "refunded" ? "neutral" : "red"
    });
  }

  if (resolvedOrder) {
    const range = getMerchantAppointmentEventRange(resolvedOrder, 4);

    items.push({
      id: `appointment-arrival-confirmed-${resolvedOrder.id}`,
      dateLabel: formatMerchantAppointmentEventDateLabel(resolvedOrder.bookedAt),
      detail: `到达确认已完成：${resolvedOrder.technicianName ?? resolvedOrder.storeName ?? "门店"} ${range} 的预约状态已同步。`,
      icon: <AppIcon className="h-5 w-5" name="check" />,
      status: "resolved",
      statusLabel: "已解决",
      title: "系统信息"
    });
  }

  return items;
}

function buildMerchantHomeContactStatusItems(pendingOrders: Order[], technicians: Technician[]): MerchantContactStatusItem[] {
  const primaryOrder = pendingOrders[0];
  const secondOrder = pendingOrders[1] ?? primaryOrder;
  const availableTechnician = technicians.find((technician) => technician.status === "available") ?? technicians[0];
  const busyTechnician = technicians.find((technician) => technician.status === "busy") ?? technicians[1] ?? availableTechnician;

  return [
    {
      id: "home-contact-auto-dispatch",
      dateLabel: "今日",
      detail: `特派任务未分配：${primaryOrder?.itemName ?? "今日预约"}，${primaryOrder?.bookedAt.split(" ")[1] ?? "12:00"} 仍未安排员工。`,
      icon: <AppIcon className="h-5 w-5" name="calendar" />,
      status: "active",
      statusLabel: "处理中",
      title: "系统信息"
    },
    {
      id: "home-contact-customer-follow",
      dateLabel: "今日",
      detail: `顾客联系待跟进：${secondOrder?.customerName ?? "预约顾客"} 需要确认地址与到店时间，建议在服务前完成回复。`,
      icon: <AppIcon className="h-5 w-5" name="chat" />,
      status: "active",
      statusLabel: "处理中",
      title: "顾客联系"
    },
    {
      id: "home-contact-staff-swap",
      dateLabel: "今日",
      detail: `员工调班申请：${busyTechnician?.nickname ?? busyTechnician?.name ?? "员工"} 的晚间班次需要确认替补。`,
      icon: <AppIcon className="h-5 w-5" name="bell" />,
      status: "active",
      statusLabel: "处理中",
      title: "调班申请"
    },
    {
      id: "home-contact-expired",
      dateLabel: "今日",
      detail: "自动外呼确认已过期：上一轮 10:00-11:00 未完成回拨，已转为人工跟进。",
      icon: <AppIcon className="h-5 w-5" name="clock" />,
      status: "expired",
      statusLabel: "已过期",
      title: "系统信息",
      tone: "red"
    },
    {
      id: "home-contact-resolved",
      dateLabel: "今日",
      detail: `员工确认完成：${availableTechnician?.nickname ?? availableTechnician?.name ?? "员工"} 已接收今日预约提醒。`,
      icon: <AppIcon className="h-5 w-5" name="check" />,
      status: "resolved",
      statusLabel: "已解决",
      title: "员工联系"
    }
  ];
}

function buildMerchantStaffHrStatusItems(technicians: Technician[]): MerchantContactStatusItem[] {
  const onboardingStaff = technicians.find((technician) => technician.status === "available") ?? technicians[0];
  const resigningStaff = technicians.find((technician) => technician.status === "off") ?? technicians[1] ?? onboardingStaff;
  const lateStaff = technicians.find((technician) => technician.status === "busy") ?? technicians[2] ?? onboardingStaff;
  const shiftStaff = technicians[1] ?? onboardingStaff;

  return [
    {
      id: "staff-hr-onboarding",
      dateLabel: "26.05.05 09:00",
      detail: `${onboardingStaff?.nickname ?? onboardingStaff?.name ?? "新员工"} 已提交入职资料，等待确认合同、银行卡和系统权限。`,
      icon: onboardingStaff ? <AvatarImage alt={onboardingStaff.name} className="h-full w-full rounded-[12px] object-cover" src={onboardingStaff.avatar} /> : <AppIcon className="h-5 w-5" name="shield" />,
      status: "active",
      statusLabel: "处理中",
      title: "入职申请"
    },
    {
      id: "staff-hr-resignation",
      dateLabel: "26.05.05 10:00",
      detail: `${resigningStaff?.nickname ?? resigningStaff?.name ?? "员工"} 申请 05.31 退职，需要确认交接班次、未结算薪酬和账号停用时间。`,
      icon: resigningStaff ? <AvatarImage alt={resigningStaff.name} className="h-full w-full rounded-[12px] object-cover" src={resigningStaff.avatar} /> : <AppIcon className="h-5 w-5" name="clock" />,
      status: "active",
      statusLabel: "处理中",
      title: "退职申请"
    },
    {
      id: "staff-hr-late-warning",
      dateLabel: "26.05.05 11:30",
      detail: `${lateStaff?.nickname ?? lateStaff?.name ?? "员工"} 本月已 3 次迟到，建议安排面谈或调整早班排班。`,
      icon: <AppIcon className="h-5 w-5" name="bell" />,
      status: "active",
      statusLabel: "处理中",
      title: "多次迟到提醒",
      tone: "red"
    },
    {
      id: "staff-hr-leave",
      dateLabel: "26.05.04 15:00",
      detail: `${onboardingStaff?.nickname ?? onboardingStaff?.name ?? "员工"} 申请 15:00-17:00 临时请假，等待店长确认。`,
      icon: onboardingStaff ? <AvatarImage alt={onboardingStaff.name} className="h-full w-full rounded-[12px] object-cover" src={onboardingStaff.avatar} /> : <AppIcon className="h-5 w-5" name="calendar" />,
      status: "expired",
      statusLabel: "已过期",
      title: "请假申请",
      tone: "red"
    },
    {
      id: "staff-hr-shift-swap",
      dateLabel: "26.05.04 18:00",
      detail: `${shiftStaff?.nickname ?? shiftStaff?.name ?? "员工"} 的 18:00-20:00 调班已确认，后台排班已同步更新。`,
      icon: shiftStaff ? <AvatarImage alt={shiftStaff.name} className="h-full w-full rounded-[12px] object-cover" src={shiftStaff.avatar} /> : <AppIcon className="h-5 w-5" name="check" />,
      status: "resolved",
      statusLabel: "已解决",
      title: "调班申请"
    }
  ];
}

function MerchantHomeContactStatusPanel({
  className,
  emptyDetail = "当前筛选条件下没有今天的异常信息。",
  filter,
  items,
  onFilterChange,
  title = "异常信息"
}: {
  className?: string;
  emptyDetail?: string;
  filter: MerchantContactStatusFilter;
  items: MerchantContactStatusItem[];
  onFilterChange: (filter: MerchantContactStatusFilter) => void;
  title?: string;
}) {
  return (
    <ContactInfoStatusPanel
      className={cn("mt-4", className)}
      emptyDateLabel="今日"
      emptyDetail={emptyDetail}
      emptyIcon={<AppIcon className="h-6 w-6" name="bell" />}
      emptyId="home-contact-empty"
      filter={filter}
      items={items}
      onFilterChange={onFilterChange}
      title={title}
    />
  );
}

function MerchantScheduleHeaderTabs({
  value,
  onChange
}: {
  value: MerchantSchedulePrimaryTab;
  onChange: (value: MerchantSchedulePrimaryTab) => void;
}) {
  const tabs: Array<{ label: string; value: MerchantSchedulePrimaryTab }> = [
    { label: "现状确认", value: "current" },
    { label: "预约一览", value: "appointments" },
    { label: "排班", value: "planning" }
  ];

  return (
    <FloatingHomeHeader
      className="relative z-10"
      panelClassName="relative overflow-hidden"
    >
      <FeatureSegmentedTabs items={tabs} onChange={onChange} value={value} variant="header" />
    </FloatingHomeHeader>
  );
}

function MerchantStaffHeaderTabs({
  value,
  onChange
}: {
  value: MerchantStaffTab;
  onChange: (value: MerchantStaffTab) => void;
}) {
  const tabs: Array<{ label: string; value: MerchantStaffTab }> = [
    { label: "全部", value: "all" },
    { label: "正社员", value: "fullTime" },
    { label: "临时工", value: "partTime" }
  ];

  return (
    <FloatingHomeHeader
      className="relative z-10"
      panelClassName="relative overflow-hidden"
    >
      <FeatureSegmentedTabs items={tabs} onChange={onChange} value={value} variant="header" />
    </FloatingHomeHeader>
  );
}

function buildMerchantIncomePolyline(points: MerchantIncomeTrendPoint[], width: number, height: number, left: number, top: number, bottom: number) {
  const maxValue = Math.max(...points.map((point) => point.income), 1);
  const usableHeight = height - top - bottom;
  const usableWidth = width - left - 14;
  const step = points.length > 1 ? usableWidth / (points.length - 1) : 0;

  return points.map((point, index) => {
    const x = left + step * index;
    const y = top + usableHeight - (point.income / maxValue) * usableHeight;

    return `${x},${y}`;
  }).join(" ");
}

function splitMerchantIncomeTrend(points: MerchantIncomeTrendPoint[]) {
  const firstFutureIndex = points.findIndex((point) => point.future);

  if (firstFutureIndex === -1) {
    return { solid: points, dashed: [] as MerchantIncomeTrendPoint[] };
  }

  if (firstFutureIndex === 0) {
    return { solid: [] as MerchantIncomeTrendPoint[], dashed: points };
  }

  return {
    solid: points.slice(0, firstFutureIndex),
    dashed: points.slice(firstFutureIndex - 1)
  };
}

function MerchantIncomeTrendPreview({
  points,
  className
}: {
  points: MerchantIncomeTrendPoint[];
  className?: string;
}) {
  const maxValue = Math.max(...points.map((point) => point.income), 1);
  const width = 300;
  const height = 136;
  const left = 14;
  const top = 14;
  const bottom = 40;
  const usableHeight = height - top - bottom;
  const usableWidth = width - left - 14;
  const step = points.length > 1 ? usableWidth / (points.length - 1) : 0;
  const pointGroups = splitMerchantIncomeTrend(points);
  const solidPolyline = pointGroups.solid.length > 0 ? buildMerchantIncomePolyline(pointGroups.solid, width, height, left, top, bottom) : "";
  const dashedPolyline = pointGroups.dashed.length > 0 ? buildMerchantIncomePolyline(pointGroups.dashed, width, height, left, top, bottom) : "";

  return (
    <div
      className={cn(
        "min-w-0 max-w-full overflow-hidden rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-primary)_14%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--client-surface)_76%,transparent),color-mix(in_srgb,var(--client-bg)_94%,transparent))] px-3 py-3",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold text-[color:var(--client-muted)]">近7天收入趋势</p>
        <span className="inline-flex items-center rounded-full bg-[color:var(--client-primary-soft)] px-2.5 py-1 text-[11px] font-black text-[color:var(--client-primary-strong)]">
          {yen(maxValue)} 峰值
        </span>
      </div>
      <div className="mt-3 min-w-0">
        <svg className="h-[136px] w-full overflow-visible" preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`}>
          {Array.from({ length: 3 }, (_, index) => {
            const y = top + (usableHeight / 2) * index;

            return <line key={index} stroke="var(--client-line)" strokeDasharray="4 4" strokeWidth="1" x1={left} x2={width - 14} y1={y} y2={y} />;
          })}
          {points.map((point, index) => {
            const x = left + step * index;

            return (
              <line
                key={`${point.key}-guide`}
                stroke="var(--client-line)"
                strokeDasharray="4 5"
                strokeWidth="1"
                x1={x}
                x2={x}
                y1={top}
                y2={height - bottom + 4}
              />
            );
          })}
          {solidPolyline ? <polyline fill="none" points={solidPolyline} stroke="var(--client-primary)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.5" /> : null}
          {dashedPolyline ? <polyline fill="none" points={dashedPolyline} stroke="var(--client-primary)" strokeDasharray="8 7" strokeLinecap="round" strokeLinejoin="round" strokeOpacity="0.82" strokeWidth="3.5" /> : null}
          {points.map((point, index) => {
            const x = left + step * index;
            const y = top + usableHeight - (point.income / maxValue) * usableHeight;
            const textAnchor = index === 0 ? "start" : index === points.length - 1 ? "end" : "middle";

            return (
              <g key={point.key}>
                <circle cx={x} cy={y} fill="var(--client-bg)" r="4.5" stroke="var(--client-primary)" strokeWidth="2.5" />
                <text fill="var(--client-muted)" fontSize="8.5" fontWeight="800" textAnchor={textAnchor} x={x} y={height - 20}>
                  {point.label}
                </text>
                <text fill="var(--client-soft-muted)" fontSize="8" fontWeight="800" opacity="0.88" textAnchor={textAnchor} x={x} y={height - 8}>
                  {point.subLabel}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export function MerchantStaffDetailRoutePage() {
  const { staffId } = useParams();
  const navigate = useNavigate();
  const { technicians } = useEntityStore();
  const technician = technicians.find((tech) => tech.id === staffId);
  const displayName = technician ? (technician.nickname ? `${technician.nickname} / ${technician.name}` : technician.name) : "员工详情";
  const closePage = () => {
    if (typeof window !== "undefined") {
      const historyState = window.history.state as { idx?: number } | null;

      if (typeof historyState?.idx === "number" && historyState.idx > 0) {
        navigate(-1);
        return;
      }
    }

    navigate("/merchant/staff", { replace: true });
  };

  return (
    <MobileFullscreenPage>
      <MobileFullscreenHeader
        className="fixed inset-x-0 top-0 z-[70] mx-auto w-full max-w-[480px]"
        onBack={closePage}
        subtitle={technician ? "员工详细信息卡" : "员工资料不可用"}
        title={displayName}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+104px)]">
        {technician ? (
          <div className="space-y-4">
            <SocialProfileMiniCard
              showAction={false}
              technician={technician}
              topTags={[getMerchantStaffStatusTopTag(getMerchantStaffStatus(technician))]}
            />
            <TechnicianProfilePanel context="merchant" showSummaryCard={false} technician={technician} />
          </div>
        ) : (
          <section className="rounded-[24px] border border-line bg-white p-5 text-center shadow-panel">
            <h2 className="text-base font-black text-ink">员工不存在</h2>
            <p className="mt-2 text-sm font-bold leading-6 text-ink/55">当前员工资料可能已被移除，或链接已经失效。</p>
            <Button className="mt-4" to="/merchant/staff">
              返回员工列表
            </Button>
          </section>
        )}
      </div>
    </MobileFullscreenPage>
  );
}

function MerchantOrdersHeader({
  count,
  endDate,
  onClose,
  onEndDateChange,
  onSearchQueryChange,
  onSearchToggle,
  onStartDateChange,
  searchOpen,
  searchQuery,
  startDate,
  subtitle
}: {
  count: number;
  endDate: string;
  onClose: () => void;
  onEndDateChange: (value: string) => void;
  onSearchQueryChange: (value: string) => void;
  onSearchToggle: () => void;
  onStartDateChange: (value: string) => void;
  searchOpen: boolean;
  searchQuery: string;
  startDate: string;
  subtitle: string;
}) {
  return (
    <header className="relative z-40 -mx-4 -mt-4 shrink-0 border-b border-white/10 bg-[linear-gradient(180deg,#191b31_0%,#151628_100%)] px-4 pb-4 pt-4 text-white">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-[28px] font-black leading-tight text-white">订单明细</h1>
          <p className="mt-2 line-clamp-2 text-xs font-bold leading-5 text-white/65">{subtitle}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            aria-label="搜索订单"
            aria-pressed={searchOpen}
            className={cn(
              "focus-ring grid h-12 w-12 place-items-center rounded-full border transition",
              searchOpen
                ? "border-[#7d6bff] bg-[#6f5df5] text-white"
                : "border-white/14 bg-white/8 text-white hover:border-white/24 hover:bg-white/12"
            )}
            onClick={onSearchToggle}
            type="button"
          >
            <AppIcon className="h-5 w-5" name="search" />
          </button>
          <button
            aria-label="关闭订单明细"
            className="focus-ring grid h-12 w-12 place-items-center rounded-full border border-white/14 bg-white/8 text-white transition hover:border-white/24 hover:bg-white/12"
            onClick={onClose}
            type="button"
          >
            <AppIcon className="h-5 w-5" name="close" />
          </button>
        </div>
      </div>
      {searchOpen ? (
        <div className="mt-4 space-y-3">
          <label className="flex h-11 items-center gap-2 rounded-full border border-white/14 bg-white/8 px-4">
            <AppIcon className="h-4 w-4 shrink-0 text-white/60" name="search" />
            <input
              autoFocus
              className="min-w-0 flex-1 bg-transparent text-sm font-bold text-white outline-none placeholder:text-white/35"
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder="搜索订单、客户、区域、状态"
              value={searchQuery}
            />
            <span className="shrink-0 text-[11px] font-black text-white/45">{count} 单</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className="mb-1 block text-[11px] font-black text-white/45">开始时间</span>
              <input
                className="h-11 w-full rounded-[16px] border border-white/14 bg-white/8 px-3 text-sm font-black text-white outline-none [color-scheme:dark]"
                max={endDate || undefined}
                onChange={(event) => onStartDateChange(event.target.value)}
                onInput={(event) => onStartDateChange(event.currentTarget.value)}
                type="date"
                value={startDate}
              />
            </label>
            <label>
              <span className="mb-1 block text-[11px] font-black text-white/45">结束时间</span>
              <input
                className="h-11 w-full rounded-[16px] border border-white/14 bg-white/8 px-3 text-sm font-black text-white outline-none [color-scheme:dark]"
                min={startDate || undefined}
                onChange={(event) => onEndDateChange(event.target.value)}
                onInput={(event) => onEndDateChange(event.currentTarget.value)}
                type="date"
                value={endDate}
              />
            </label>
          </div>
        </div>
      ) : null}
    </header>
  );
}

export function MerchantPortalPage() {
  const merchantPortalConfig = roleBasedTabConfig.merchant;
  const { view } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session } = useAuth();
  const { customers, stores, technicians, revision: entityRevision } = useEntityStore();
  const merchantImStore = useImStore("merchant");
  const activeView = getMerchantView(view);
  const activeMeTab = getMerchantMeTab(searchParams.get("meTab"));
  const store = stores.find((item) => item.id === session?.linkedStoreId) ?? stores[0];
  const storeTechnicians = useMemo(() => {
    return technicians.filter((tech) => tech.storeId === store.id);
  }, [entityRevision, store.id, technicians]);
  const embeddedHeaderViews: MerchantView[] = ["orders", "schedule", "staff", "messages", "contacts", "me"];
  const pageTitleMap: Record<MerchantView, string> = {
    dashboard: "门店工作台",
    orders: "订单处理",
    messages: "聊天",
    schedule: "排班",
    staff: "员工",
    contacts: "通讯录",
    moments: "动态",
    me: "我的"
  };
  const staffStatuses = useMemo<Record<string, StaffStatus>>(
    () => Object.fromEntries(technicians.map((tech) => [tech.id, getMerchantStaffStatus(tech)])),
    [technicians]
  );
  const [selectedContact, setSelectedContact] = useState<MerchantContactModal>(null);
  const [merchantOrderSearchOpen, setMerchantOrderSearchOpen] = useState(false);
  const [merchantOrderSearchQuery, setMerchantOrderSearchQuery] = useState("");
  const [merchantOrderStartDate, setMerchantOrderStartDate] = useState("");
  const [merchantOrderEndDate, setMerchantOrderEndDate] = useState("");
  const [followedStaffIds, setFollowedStaffIds] = useState<string[]>(["tech-1"]);
  const [followedCustomerIds, setFollowedCustomerIds] = useState<string[]>(["cus-1", "cus-3"]);
  const [activeDirectoryShortcut, setActiveDirectoryShortcut] = useState<string | null>(null);
  const [contactLog, setContactLog] = useState("暂无联系记录");
  const [homeContactStatusFilter, setHomeContactStatusFilter] = useState<MerchantContactStatusFilter>("active");
  const [staffHrStatusFilter, setStaffHrStatusFilter] = useState<MerchantContactStatusFilter>("active");
  const [appointmentContactStatusFilter, setAppointmentContactStatusFilter] = useState<MerchantContactStatusFilter>("active");
  const [generalContactStatusFilter, setGeneralContactStatusFilter] = useState<MerchantContactStatusFilter>("active");
  const staffIdParam = searchParams.get("staffId");
  const [manualEmployees, setManualEmployees] = useState<MerchantManualEmployee[]>(() => getInitialMerchantManualEmployees());
  const [employeeNameDraft, setEmployeeNameDraft] = useState("");
  const [employeeRoleDraft, setEmployeeRoleDraft] = useState<MerchantEmployeeRoleDraft>("custom");
  const [customEmployeeRoleDraft, setCustomEmployeeRoleDraft] = useState("");
  const [employeeRoleMenuOpen, setEmployeeRoleMenuOpen] = useState(false);
  const [employeeSalaryDraft, setEmployeeSalaryDraft] = useState("");
  const [pendingStaffDelete, setPendingStaffDelete] = useState<MerchantPendingStaffDelete | null>(null);
  const [staffRoleNameOverrides, setStaffRoleNameOverrides] = useState<Record<string, string>>(() => getInitialMerchantStaffRoleLabelOverrides());
  const technicianRoleName = getResolvedMerchantStaffRoleName(merchantTechnicianRoleName, staffRoleNameOverrides);
  const pendingOrders = useMemo(() => orders.filter((order) => ["pending", "confirmed", "scheduled"].includes(order.status)), []);
  const storeOrders = useMemo(() => orders.slice(0, 10), []);
  const filteredStoreOrders = useMemo(
    () => storeOrders.filter((order) => merchantOrderMatchesSearch(order, merchantOrderSearchQuery, merchantOrderStartDate, merchantOrderEndDate)),
    [merchantOrderEndDate, merchantOrderSearchQuery, merchantOrderStartDate, storeOrders]
  );
  const merchantOrderHeaderSubtitle = useMemo(
    () => getMerchantOrderHeaderSubtitle(storeOrders, merchantOrderStartDate, merchantOrderEndDate),
    [merchantOrderEndDate, merchantOrderStartDate, storeOrders]
  );
  const homeContactStatusItems = useMemo(
    () => buildMerchantHomeContactStatusItems(pendingOrders, storeTechnicians),
    [pendingOrders, storeTechnicians]
  );
  const generalContactStatusItems = useMemo<MerchantContactStatusItem[]>(
    () => contactLog === "暂无联系记录"
      ? []
      : [
          {
            dateLabel: "现在",
            detail: contactLog,
            icon: <AppIcon className="h-6 w-6" name="chat" />,
            id: "merchant-general-contact-log",
            status: "active",
            statusLabel: "已记录",
            title: "联系记录"
          }
        ],
    [contactLog]
  );
  const appointmentContactStatusItems = useMemo(
    () => buildMerchantAppointmentContactStatusItems(storeOrders, storeTechnicians),
    [storeOrders, storeTechnicians]
  );
  const merchantTodayOps = [
    { slot: "10:00", traffic: 28, revenue: 28000, utilization: 42, bookings: 2 },
    { slot: "12:00", traffic: 36, revenue: 46200, utilization: 55, bookings: 3 },
    { slot: "14:00", traffic: 44, revenue: 53800, utilization: 61, bookings: 4 },
    { slot: "16:00", traffic: 33, revenue: 39600, utilization: 48, bookings: 2 },
    { slot: "18:00", traffic: 58, revenue: 81200, utilization: 72, bookings: 5 },
    { slot: "20:00", traffic: 67, revenue: 96800, utilization: 84, bookings: 6 },
    { slot: "22:00", traffic: 52, revenue: 74400, utilization: 76, bookings: 4 },
    { slot: "24:00", traffic: 31, revenue: 41800, utilization: 51, bookings: 2 }
  ];
  const todayRevenueTotal = merchantTodayOps.reduce((sum, point) => sum + point.revenue, 0);
  const todayUtilizationAvg = Math.round(merchantTodayOps.reduce((sum, point) => sum + point.utilization, 0) / merchantTodayOps.length);
  const onlineTechnicianCount = storeTechnicians.filter((technician) => staffStatuses[technician.id] !== "休息").length;
  const merchantWeeklyIncomeTotal = merchantIncomeTrendPoints.reduce((sum, point) => sum + point.income, 0);
  const merchantCompletedOrderCount = Math.max(
    5,
    storeOrders.filter((order) => order.status !== "pending" && order.status !== "scheduled").length
  );
  const nextMerchantStoreSchedule = pendingOrders[0] ? `${pendingOrders[0].bookedAt} · ${pendingOrders[0].itemName}` : "暂无未来安排";
  const technicianCardUi = useMemo(() => getStoreCardDecorationConfig(store, "technician"), [store.id, store.uiDecoration]);
  const selectedContactStaff = selectedContact?.type === "staff" ? technicians.find((tech) => tech.id === selectedContact.id) : undefined;
  const selectedContactCustomer = selectedContact?.type === "customer" ? customers.find((customer) => customer.id === selectedContact.id) : undefined;
  const selectedCustomerOrder = selectedContactCustomer
    ? orders.find((order) => order.customerId === selectedContactCustomer.id) ?? orders[0]
    : orders[0];
  const merchantSchedulePrimaryTab = getMerchantScheduleTab(searchParams.get("tab"));
  const merchantStaffTab = getMerchantStaffTab(searchParams.get("staffType"));
  const storeStaffEntries = useMemo(
    () => storeTechnicians.map((technician, index) => ({
      employmentType: getMerchantStaffEmploymentType(technician, index),
      status: staffStatuses[technician.id] ?? getMerchantStaffStatus(technician),
      technician
    })),
    [staffStatuses, storeTechnicians]
  );
  const filteredStoreStaffEntries = useMemo(
    () => storeStaffEntries.filter((entry) => merchantStaffTab === "all" || entry.employmentType === merchantStaffTab),
    [merchantStaffTab, storeStaffEntries]
  );
  const manualEmployeesForStore = useMemo(
    () => manualEmployees.filter((employee) => employee.storeId === store.id),
    [manualEmployees, store.id]
  );
  const filteredManualEmployees = useMemo(
    () => manualEmployeesForStore.filter((employee) => merchantStaffTab === "all" || employee.employmentType === merchantStaffTab),
    [manualEmployeesForStore, merchantStaffTab]
  );
  const manualPersonnelMonthlyCost = manualEmployeesForStore.reduce((sum, employee) => sum + employee.salaryMonthly, 0);
  const manualPersonnelCost = filteredManualEmployees.reduce((sum, employee) => sum + employee.salaryMonthly, 0);
  const staffRoleGroups = useMemo(
    () => buildMerchantStaffRoleGroups(filteredStoreStaffEntries, filteredManualEmployees, staffRoleNameOverrides),
    [filteredManualEmployees, filteredStoreStaffEntries, staffRoleNameOverrides]
  );
  const staffHrStatusItems = useMemo(
    () => buildMerchantStaffHrStatusItems(filteredStoreStaffEntries.map((entry) => entry.technician)),
    [filteredStoreStaffEntries]
  );

  useEffect(() => {
    writeBrowserStorage(merchantManualEmployeeStorageKey, JSON.stringify(manualEmployees), { silent: true });
  }, [manualEmployees]);

  useEffect(() => {
    writeBrowserStorage(merchantStaffRoleLabelStorageKey, JSON.stringify(staffRoleNameOverrides), { silent: true });
  }, [staffRoleNameOverrides]);

  useEffect(() => {
    if (activeView !== "staff" || !staffIdParam) {
      return;
    }

    if (technicians.some((tech) => tech.id === staffIdParam)) {
      navigate(getMerchantStaffDetailPath(staffIdParam), { replace: true });
    }
  }, [activeView, navigate, staffIdParam, technicians]);

  const openStaffDetail = (id: string) => {
    navigate(getMerchantStaffDetailPath(id));
  };

  const closeSelectedContact = () => {
    setSelectedContact(null);

    if (searchParams.has("staffId")) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("staffId");
      setSearchParams(nextParams);
    }
  };

  const resolveEmployeeRoleName = (roleName?: string) => {
    if (roleName) {
      return roleName;
    }

    if (customEmployeeRoleDraft.trim()) {
      return customEmployeeRoleDraft.trim();
    }

    return employeeRoleDraft === "custom" ? "" : getResolvedMerchantStaffRoleName(employeeRoleDraft, staffRoleNameOverrides);
  };

  const syncMerchantContactRoleTags = (oldRoleName: string, nextRoleName: string, shouldEnsureStoreTechnicianTag: boolean) => {
    merchantImStore.contacts.forEach((contact) => {
      const user = merchantImStore.usersById[contact.targetUserId];
      const technician = user?.entityId ? technicians.find((item) => item.id === user.entityId) : undefined;
      const hasOldRoleTag = contact.tags.includes(oldRoleName) || user?.tags.includes(oldRoleName);
      const belongsToCurrentStoreTechnician = shouldEnsureStoreTechnicianTag && user?.profileKind === "technician" && technician?.storeId === store.id;

      if (!hasOldRoleTag && !belongsToCurrentStoreTechnician) {
        return;
      }

      const nextTags = replaceMerchantStaffRoleTag(contact.tags, oldRoleName, nextRoleName, belongsToCurrentStoreTechnician);

      if (nextTags.join("\u0000") !== contact.tags.join("\u0000")) {
        void merchantImStore.updateContactTags(contact.id, nextTags);
      }
    });
  };

  const renameMerchantStaffRole = (roleName: string, nextRoleNameDraft: string) => {
    const nextRoleName = normalizeMerchantStaffRoleDraft(nextRoleNameDraft);

    if (!nextRoleName || nextRoleName === roleName) {
      return;
    }

    const roleOverrideKey = getMerchantRoleOverrideKey(roleName, staffRoleNameOverrides);
    const isTechnicianRole = roleName === technicianRoleName || roleOverrideKey === merchantTechnicianRoleName;

    if (roleOverrideKey) {
      setStaffRoleNameOverrides((current) => ({
        ...current,
        [roleOverrideKey]: nextRoleName
      }));
    }

    setManualEmployees((current) =>
      current.map((employee) => employee.storeId === store.id && employee.roleName === roleName ? { ...employee, roleName: nextRoleName } : employee)
    );

    if (customEmployeeRoleDraft === roleName) {
      setCustomEmployeeRoleDraft(nextRoleName);
    }

    technicians.forEach((technician) => {
      const shouldEnsureTechnicianRole = isTechnicianRole && technician.storeId === store.id;
      const hasOldRoleTag = (technician.profileTags ?? technician.skills).includes(roleName);

      if (!shouldEnsureTechnicianRole && !hasOldRoleTag) {
        return;
      }

      updateTechnicianEntity(technician.id, (current) => ({
        profileTags: replaceMerchantStaffRoleTag(current.profileTags ?? current.skills, roleName, nextRoleName, shouldEnsureTechnicianRole)
      }));
    });

    syncMerchantContactRoleTags(roleName, nextRoleName, isTechnicianRole);
  };

  const addManualEmployee = (roleName?: string) => {
    const resolvedRoleName = resolveEmployeeRoleName(roleName);

    if (!resolvedRoleName) {
      return;
    }

    const roleEmployeeCount = manualEmployeesForStore.filter((employee) => employee.roleName === resolvedRoleName).length;
    const salaryMonthly = parseMerchantEmployeeSalary(employeeSalaryDraft);
    const employmentType: Exclude<MerchantStaffTab, "all"> = merchantStaffTab === "partTime" ? "partTime" : "fullTime";

    setManualEmployees((current) => [
      ...current,
      {
        id: `manual-employee-${store.id}-${Date.now()}`,
        storeId: store.id,
        name: employeeNameDraft.trim() || `${resolvedRoleName}员工 ${roleEmployeeCount + 1}`,
        roleName: resolvedRoleName,
        salaryMonthly,
        status: "在岗",
        employmentType
      }
    ]);
    setEmployeeNameDraft("");
    setEmployeeSalaryDraft("");
  };

  const removeManualEmployee = (employeeId: string) => {
    setManualEmployees((current) => current.filter((employee) => employee.id !== employeeId));
  };

  const removeStoreTechnician = (technicianId: string) => {
    const roleTagsToRemove = new Set([
      "员工",
      "专职",
      "兼职",
      "正社员",
      "临时工",
      technicianRoleName,
      ...staffRoleGroups.map((group) => group.roleName)
    ]);

    updateTechnicianEntity(technicianId, (technician) => ({
      storeId: technician.storeId === store.id ? merchantDetachedTechnicianStoreId : technician.storeId,
      identityLabel: "个人技师",
      profileTags: (technician.profileTags ?? technician.skills).filter((tag) => !roleTagsToRemove.has(tag))
    }));

    merchantImStore.contacts.forEach((contact) => {
      const user = merchantImStore.usersById[contact.targetUserId];

      if (user?.entityId !== technicianId) {
        return;
      }

      const nextTags = contact.tags.filter((tag) => !roleTagsToRemove.has(tag));

      if (nextTags.length !== contact.tags.length) {
        void merchantImStore.updateContactTags(contact.id, nextTags);
      }
    });

    if (selectedContact?.type === "staff" && selectedContact.id === technicianId) {
      closeSelectedContact();
    }
  };

  const confirmStaffDelete = () => {
    if (!pendingStaffDelete) {
      return;
    }

    if (pendingStaffDelete.type === "manual") {
      removeManualEmployee(pendingStaffDelete.id);
    } else {
      removeStoreTechnician(pendingStaffDelete.id);
    }

    setPendingStaffDelete(null);
  };

  const directoryContacts: Array<DirectoryContactItem & { followed: boolean }> = [
    ...technicians.map((tech, index) => ({
      id: tech.id,
      systemId: tech.systemId,
      name: tech.name,
      username: `tech_${tech.id.replace("tech-", "").padStart(3, "0")}`,
      remark: ["主力夜间担当", "空调清洗负责人", "美业复购担当"][index] ?? "门店员工",
      avatar: tech.avatar,
      title: "员工",
      badgeTone: "green" as const,
      tags: ["员工", staffStatuses[tech.id], ...(tech.profileTags ?? tech.skills).slice(0, 2)],
      meta: `★ ${tech.rating} · ${tech.serviceAreas.join(" / ")}`,
      followed: followedStaffIds.includes(tech.id),
      to: getMessagePath("merchant", getMerchantTechnicianConversationId(tech.id)),
      todayPriority: orders.some((order) => order.technicianName === tech.name && order.bookedAt.startsWith("2026-04-13")),
      entityCardData: {
        ...buildTechnicianInfoCardData(tech),
        cardUi: technicianCardUi,
        detailPath: getMerchantStaffDetailPath(tech.id)
      },
      entityCardVariant: "compact" as const
    })),
    ...customers.map((customer, index) => ({
      id: customer.id,
      systemId: customer.systemId,
      name: customer.name,
      username: `cus_${customer.id.replace("cus-", "").padStart(3, "0")}`,
      remark: ["高频夜间客户", "周末到店客", "英文美业复购"][index] ?? "普通顾客",
      avatar: customer.avatar,
      title: "顾客",
      badgeTone: "yellow" as const,
      tags: ["顾客", customer.memberLevel, ...customer.tags.slice(0, 2)],
      meta: `${customer.orderCount} 单 · 活跃分 ${customer.activeScore}`,
      followed: followedCustomerIds.includes(customer.id),
      to: getMessagePath("merchant", getMerchantCustomerConversationId(customer.id)),
      todayPriority: orders.some((order) => order.customerId === customer.id && order.bookedAt.startsWith("2026-04-13")),
      entityCardData: {
        ...buildUserInfoCardData(customer),
        detailPath: getScopedProfileDetailPath("merchant", "user", customer.id)
      },
      entityCardVariant: "compact" as const
    }))
  ].map((contactItem) => ({
    ...contactItem,
    secondaryAction: {
      label: contactItem.followed ? "取消关注" : "关注",
      onClick: () => toggleFollow(contactItem.title === "顾客" ? "customer" : "staff", contactItem.id),
      tone: contactItem.followed ? "secondary" as const : "primary" as const
    }
  }));
  const { followed: followedDirectoryContacts, regular: regularDirectoryContacts } = partitionDirectoryContacts(directoryContacts);
  const { categories: customDirectoryCategories, setCategories: setCustomDirectoryCategories } = useCustomContactCategories("merchant");
  const [editingDirectoryCategoryId, setEditingDirectoryCategoryId] = useState<string | null>(null);
  const availableDirectoryTags = Array.from(new Set(directoryContacts.flatMap((contact) => contact.tags))).sort((left, right) =>
    left.localeCompare(right, "ja")
  );
  const editingDirectoryCategory = editingDirectoryCategoryId
    ? customDirectoryCategories.find((category) => category.id === editingDirectoryCategoryId)
    : null;
  const directoryShortcuts: ContactShortcut[] = [
    { id: "all", title: "全部", caption: "查看全部", icon: "all", tone: "bg-[#171717] text-lemon" },
    { id: "new", title: "新朋友", caption: "8 个申请", icon: "new", tone: "bg-[#171717] text-lemon" },
    { id: "group", title: "群聊", caption: "12 个群", icon: "group", tone: "bg-[#171717] text-lemon" },
    { id: "service", title: "服务号", caption: "6 个通知", icon: "service", tone: "bg-[#171717] text-lemon" },
    ...customDirectoryCategories.map((category) => ({
      id: category.id,
      title: category.title,
      caption: category.ruleTags.length === 0 ? "暂无规则" : `${category.ruleTags.length} 个标签`,
      icon: "add",
      tone: "bg-[#171717] text-lemon",
      badge: directoryContacts.filter((contact) => matchesCustomContactCategory(contact, category)).length
    })),
    { id: "custom-add", title: "添加自定义分类", caption: "新建分类", icon: "add", tone: "bg-[#171717] text-lemon" }
  ];
  const merchantBaseShortcutPanels: Record<string, { title: string; caption: string; items: ContactShortcutPanelItem[] }> = {
    new: {
      title: "新朋友申请",
      caption: "新来的顾客、员工和平台协作联系人会先集中在这里。",
      items: [
        {
          id: `shortcut-new-customer-${customers[3]?.id ?? customers[0].id}`,
          title: customers[3]?.name ?? customers[0].name,
          caption: "新顾客申请 · 希望加入常用联系",
          meta: `${(customers[3]?.tags ?? customers[0].tags).slice(0, 2).join(" / ")} · ID ${customers[3]?.systemId ?? customers[0].systemId}`,
          avatar: customers[3]?.avatar ?? customers[0].avatar,
          badge: "顾客",
          onClick: () => setSelectedContact({ type: "customer", id: customers[3]?.id ?? customers[0].id }),
          entityCardData: {
            ...buildUserInfoCardData(customers[3] ?? customers[0]),
            detailPath: getScopedProfileDetailPath("merchant", "user", customers[3]?.id ?? customers[0].id)
          },
          entityCardVariant: "compact" as const
        },
        {
          id: `shortcut-new-staff-${technicians[2]?.id ?? technicians[0].id}`,
          title: technicians[2]?.name ?? technicians[0].name,
          caption: "新员工申请 · 等待加入门店通讯录",
          meta: `${(technicians[2]?.profileTags ?? technicians[2]?.skills ?? technicians[0].profileTags ?? technicians[0].skills).slice(0, 2).join(" / ")} · ID ${technicians[2]?.systemId ?? technicians[0].systemId}`,
          avatar: technicians[2]?.avatar ?? technicians[0].avatar,
          badge: "员工",
          onClick: () => openStaffDetail(technicians[2]?.id ?? technicians[0].id),
          entityCardData: {
            ...buildTechnicianInfoCardData(technicians[2] ?? technicians[0]),
            cardUi: technicianCardUi,
            detailPath: getMerchantStaffDetailPath(technicians[2]?.id ?? technicians[0].id)
          },
          entityCardVariant: "compact" as const
        },
        {
          id: "shortcut-new-platform",
          title: "NeeDo 商户 onboarding",
          caption: "平台协作申请 · 引导配置门店资料与支付",
          meta: "处理入驻配置、开店校验和商户操作指引",
          icon: "service",
          badge: "平台",
          to: "/merchant/messages?chat=merchant-support"
        }
      ]
    },
    group: {
      title: "群聊",
      caption: "门店常用群聊会集中在这里，方便快速进入沟通。",
      items: [
        {
          id: "merchant-group-shift",
          title: "今日排班群",
          caption: "8 人 · 门店排班与到店同步",
          meta: "店长、前台、当班员工、平台调度",
          icon: "group",
          badge: "群聊",
          to: "/merchant/messages"
        },
        {
          id: "merchant-group-vip",
          title: "VIP 预约跟进群",
          caption: "5 人 · 高价值顾客预约跟进",
          meta: "客服、店长、资深员工",
          icon: "group",
          badge: "群聊",
          to: "/merchant/messages"
        },
        {
          id: "merchant-group-night",
          title: "夜班联络群",
          caption: "6 人 · 深夜时段应急联络",
          meta: "夜班人员、平台客服、调度支持",
          icon: "group",
          badge: "群聊",
          to: "/merchant/messages"
        }
      ]
    },
    service: {
      title: "服务号",
      caption: "售后、改期、结算和系统消息入口集中在这里。",
      items: [
        {
          id: "merchant-service-support",
          title: "NeeDo 客服",
          caption: "退款、改期、纠纷和售后处理",
          meta: "平台客服会在这里同步最新处理进度",
          icon: "service",
          badge: "服务号",
          to: "/merchant/messages?chat=merchant-support"
        },
        {
          id: "merchant-service-settlement",
          title: "结算助手",
          caption: "对账、发票、分账和到账提醒",
          meta: "查看门店结算周期和最近到账情况",
          icon: "service",
          badge: "服务号",
          to: "/merchant/messages?chat=merchant-support"
        }
      ]
    }
  };
  const merchantShortcutPanels: Record<string, { title: string; caption: string; items: ContactShortcutPanelItem[] }> = {
    all: {
      title: "全部分类",
      caption: "把所有快捷分类内容汇总在这里，方便一次查看。",
      items: Object.values(merchantBaseShortcutPanels).flatMap((panel) => panel.items)
    },
    ...merchantBaseShortcutPanels,
    ...Object.fromEntries(
      customDirectoryCategories.map((category) => [
        category.id,
        {
          title: category.title,
          caption: `命中标签：${category.ruleTags.join(" / ")}`,
          items: directoryContacts
            .filter((contact) => matchesCustomContactCategory(contact, category))
            .map((contact) => ({
              id: contact.id,
              title: contact.name,
              caption: contact.remark,
              meta: `${contact.meta}${contact.tags.length > 0 ? ` · ${contact.tags.join(" / ")}` : ""}`,
              avatar: contact.avatar,
              badge: contact.title,
              to: contact.to,
              entityCardData: contact.entityCardData,
              entityCardVariant: "compact" as const
            }))
        }
      ])
    )
  };

  const contact = (name: string, mode: "chat" | "phone") => {
    setContactLog(`${mode === "chat" ? "已打开聊天" : "已发起电话"}：${name}`);
  };

  const toggleFollow = (type: "staff" | "customer", id: string) => {
    const update = (current: string[]) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

    if (type === "staff") {
      setFollowedStaffIds(update);
      return;
    }

    setFollowedCustomerIds(update);
  };

  const updateMerchantSchedulePrimaryTab = (nextTab: MerchantSchedulePrimaryTab) => {
    const nextParams = new URLSearchParams(searchParams);

    if (nextTab === "current") {
      nextParams.delete("tab");
    } else if (nextTab === "appointments") {
      nextParams.set("tab", "appointments");
    } else {
      nextParams.set("tab", "planning");
    }

    setSearchParams(nextParams);
  };

  const updateMerchantStaffTab = (nextTab: MerchantStaffTab) => {
    const nextParams = new URLSearchParams(searchParams);

    if (nextTab === "all") {
      nextParams.delete("staffType");
    } else {
      nextParams.set("staffType", nextTab);
    }

    nextParams.delete("staffId");
    setSearchParams(nextParams);
    setSelectedContact(null);
  };

  const updateMerchantMeTab = (nextTab: MerchantMeTab) => {
    const nextParams = new URLSearchParams(searchParams);

    if (nextTab === "data") {
      nextParams.delete("meTab");
    } else {
      nextParams.set("meTab", nextTab);
    }

    setSearchParams(nextParams);
  };

  const isMerchantDataCenterView = activeView === "me" && activeMeTab === "data";

  return (
    <MobileShell
      className={isMerchantDataCenterView ? "merchant-analytics-clean-shell" : undefined}
      navItems={merchantNavItems}
      navPanelStyle={activeView === "me" ? "plain" : "default"}
      showTopEdgeMask={activeView !== "orders"}
    >
      {activeView === "dashboard" ? (
        <FloatingHomeHeader
          panelClassName="client-floating-header-glass-frame rounded-none border-transparent px-0 pb-0 shadow-none"
        >
          <SharedHomeHeader
            avatarAlt={store.name}
            avatarLabel="打开经营数据中心"
            avatarSrc={store.cover}
            avatarTo={merchantPortalConfig.myPath}
            locationLabel={getMerchantLocationLabel(store)}
            locationTo="/merchant/settings/profile"
            settingsLabel="打开设置中心"
            settingsTo={merchantPortalConfig.settingsPath}
          />
        </FloatingHomeHeader>
      ) : null}
      {activeView === "me" ? (
        <FloatingHomeHeader
          stacked
          panelClassName="relative overflow-hidden"
        >
          <SharedHomeHeader
            avatarAlt={store.name}
            avatarLabel="打开经营数据中心"
            avatarSrc={store.cover}
            avatarTo={merchantPortalConfig.myPath}
            forceLight
            locationLabel={getMerchantLocationLabel(store)}
            locationTo="/merchant/settings/profile"
            settingsLabel="打开设置中心"
            settingsTo={merchantPortalConfig.settingsPath}
          />
          <FeatureSegmentedTabs
            items={[
              { label: "服务展示", value: "service" },
              { label: "数据中心", value: "data" }
            ]}
            onChange={(value) => updateMerchantMeTab(value as MerchantMeTab)}
            value={activeMeTab}
            variant="header"
          />
        </FloatingHomeHeader>
      ) : null}

      <div
        className={cn(
          activeView === "me"
            ? "space-y-4 pt-0"
            : activeView === "schedule" || activeView === "staff"
              ? "px-4 pb-4 pt-0"
              : activeView === "dashboard"
                ? "space-y-4 px-4 pb-4 pt-2"
                : "space-y-4 px-4 py-4"
        )}
      >
        {activeView === "dashboard" ? (
          <>
            <section className="client-feature-panel overflow-hidden rounded-[28px] border text-white">
              <div className="relative min-h-[228px] p-5">
                <img alt={store.name} className="absolute inset-0 h-full w-full object-cover opacity-24" src={imageBank.salon} />
                <div className="client-feature-aura absolute inset-0" />
                <div className="relative flex min-h-[188px] flex-col justify-between">
                  <div>
                    <TitleWithInfo
                      as="h1"
                      info="查看今日预约、员工状态、经营数据和客户提醒，保留原有经营能力。"
                      label="店铺工作台说明"
                      title="店铺工作台"
                      titleClassName="text-[28px] font-black tracking-[-0.04em] text-white"
                      variant="dark"
                    />
                    <p className="mt-2 text-sm text-white/70">{store.name} · {store.area}</p>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      ["今日预约", `${pendingOrders.length} 单`],
                      ["在线员工", `${storeTechnicians.filter((technician) => staffStatuses[technician.id] !== "休息").length} 人`],
                      ["今日流水", yen(todayRevenueTotal)],
                      ["利用率", `${todayUtilizationAvg}%`]
                    ].map(([label, value]) => (
                      <div className="rounded-[20px] border border-[color:color-mix(in_srgb,var(--client-primary)_24%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_20%,transparent)] px-4 py-3 backdrop-blur" key={label}>
                        <p className="text-[11px] font-bold text-white/55">{label}</p>
                        <strong className="mt-1 block text-base font-black text-white">{value}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <MerchantPrimaryNavCarousel />

            <section className="space-y-3">
              <div className="px-1">
                <SectionTitle caption="展示今日待确认、进行中和即将开始的预约，减少来回切页。" title="今日预约">
                  <Button size="sm" to="/merchant/schedule/auto-dispatch" variant="secondary">
                    自动派单
                  </Button>
                </SectionTitle>
              </div>
              <div className="space-y-3">
                {pendingOrders.slice(0, 4).map((order, index) => {
                  const orderProvider = getMerchantOrderProvider(order, store, technicians);

                  return (
                    <article
                      className="rounded-[28px] border border-line bg-white p-3 shadow-panel"
                      key={order.id}
                    >
                      <OrderServiceMiniCard
                        className="merchant-dashboard-appointment-service"
                        contactTo={`/merchant/messages?chat=${getMerchantCustomerConversationId(order.customerId)}`}
                        detailTo={`/merchant/orders/${order.id}`}
                        order={order}
                        provider={orderProvider}
                        topTags={[{ label: index === 0 ? "优先处理" : "待跟进", tone: index === 0 ? "yellow" : "purple" }]}
                      />
                      <Button className="mt-3 w-full" size="sm" to={`/merchant/orders/${order.id}/dispatch`}>
                        派单
                      </Button>
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="rounded-[28px] border border-line bg-white p-4 shadow-panel">
              <SectionTitle caption="展示员工在线、可约、服务中和休息状态，并保留进入通讯录和资料卡的能力。" title="员工状态">
                <Button size="sm" to="/merchant/staff" variant="secondary">
                  查看全部
                </Button>
              </SectionTitle>
              <div className="mt-3 space-y-3">
                {storeTechnicians.slice(0, 4).map((technician) => {
                  const staffStatus = staffStatuses[technician.id];

                  return (
                    <SocialProfileMiniCard
                      className="cursor-pointer"
                      detailTo={getMerchantStaffDetailPath(technician.id)}
                      key={technician.id}
                      showAction={false}
                      technician={technician}
                      topTags={[getMerchantStaffStatusTopTag(staffStatus)]}
                    />
                  );
                })}
              </div>
            </section>
          </>
        ) : !embeddedHeaderViews.includes(activeView) ? (
          <header className="rounded-lg border border-line bg-white px-4 py-4 shadow-panel">
            <div>
              <h1 className="mt-1 text-2xl font-black">{pageTitleMap[activeView]}</h1>
            </div>
          </header>
        ) : null}

        {activeView === "messages" && (
          <ImScopeProvider scope="merchant">
            <ImMessagesEntryPage />
          </ImScopeProvider>
        )}

        {activeView === "orders" && (
          <>
            <MerchantOrdersHeader
              count={filteredStoreOrders.length}
              endDate={merchantOrderEndDate}
              onClose={() => navigate("/merchant")}
              onEndDateChange={setMerchantOrderEndDate}
              onSearchQueryChange={setMerchantOrderSearchQuery}
              onSearchToggle={() => setMerchantOrderSearchOpen((value) => !value)}
              onStartDateChange={setMerchantOrderStartDate}
              searchOpen={merchantOrderSearchOpen}
              searchQuery={merchantOrderSearchQuery}
              startDate={merchantOrderStartDate}
              subtitle={merchantOrderHeaderSubtitle}
            />
            <section className="space-y-3">
              {filteredStoreOrders.map((order) => (
                <div className="space-y-2" key={order.id}>
                  <OrderServiceMiniCard
                    contactTo={`/merchant/messages?chat=${getMerchantCustomerConversationId(order.customerId)}`}
                    detailTo={`/merchant/orders/${order.id}`}
                    order={order}
                    provider={getMerchantOrderProvider(order, store, technicians)}
                    topTags={[{ label: statusLabel(order.status), tone: "neutral" }]}
                  />
                </div>
              ))}
              {filteredStoreOrders.length === 0 ? (
                <div className="rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_82%,transparent)] px-4 py-8 text-center">
                  <p className="text-sm font-black text-[color:var(--client-text)]">没有匹配的订单</p>
                </div>
              ) : null}
            </section>
          </>
        )}

        {activeView === "staff" && (
          <>
            <MerchantStaffHeaderTabs
              onChange={updateMerchantStaffTab}
              value={merchantStaffTab}
            />
            <section className="rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,var(--client-bg)_12%)] p-4 shadow-panel">
              <SectionTitle caption="当前员工、职务分组和非技师人件费会一起计入经营管理。" title="员工统计" />
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ["显示员工", `${filteredStoreStaffEntries.length + filteredManualEmployees.length} 人`],
                  ["可指派", `${filteredStoreStaffEntries.filter((entry) => entry.status === "可指派").length + filteredManualEmployees.filter((employee) => employee.status === "在岗").length} 人`],
                  ["服务中", `${filteredStoreStaffEntries.filter((entry) => entry.status === "服务中").length} 人`],
                  ["月人件费（日元）", yen(manualPersonnelCost)]
                ].map(([label, value]) => (
                  <div className="rounded-[20px] bg-[color:color-mix(in_srgb,var(--client-bg)_72%,var(--client-surface)_28%)] px-3 py-3 text-center" key={label}>
                    <p className="text-[11px] font-black text-[color:var(--client-muted)]">{label}</p>
                    <strong className="mt-1 block text-sm font-black text-[color:var(--client-text)]">{value}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-3 rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,var(--client-bg)_12%)] p-4 shadow-panel">
              <SectionTitle caption="职务名支持自定义；总务、财务、司机、厨师可一键选择。" title="职务与员工" />
              <div className="mt-4 space-y-3">
                {staffRoleGroups.map((group) => (
                  <MerchantStaffRoleSection
                    addTo={group.roleName === technicianRoleName ? getMerchantAddStaffPath(merchantStaffTab === "partTime" ? "partTime" : "fullTime", group.roleName) : undefined}
                    group={group}
                    key={group.roleName}
                    onAdd={addManualEmployee}
                    onRename={renameMerchantStaffRole}
                  >
                    {group.roleName === technicianRoleName ? (
                      group.technicianEntries.length > 0 ? (
                        group.technicianEntries.map(({ employmentType, status: staffStatus, technician }) => (
                          <SocialProfileMiniCard
                            actionSlot={(
                              <MerchantRemoveStaffIconButton
                                label={`删除${technician.nickname ?? technician.name}`}
                                onClick={() => setPendingStaffDelete({ type: "technician", id: technician.id, name: technician.nickname ?? technician.name })}
                                onCover
                              />
                            )}
                            className="cursor-pointer"
                            detailTo={getMerchantStaffDetailPath(technician.id)}
                            key={technician.id}
                            technician={technician}
                            topTags={[getMerchantEmploymentTopTag(employmentType), getMerchantStaffStatusTopTag(staffStatus)]}
                          />
                        ))
                      ) : (
                        <div className="rounded-[18px] border border-dashed border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_68%,var(--client-surface)_32%)] px-4 py-5 text-center text-xs font-black text-[color:var(--client-muted)]">
                          当前分类下暂无技师。
                        </div>
                      )
                    ) : group.employees.length > 0 ? (
                      group.employees.map((employee) => (
                        <MerchantManualEmployeeCard
                          employee={employee}
                          key={employee.id}
                          onDelete={() => setPendingStaffDelete({ type: "manual", id: employee.id, name: employee.name })}
                        />
                      ))
                    ) : (
                      <div className="rounded-[18px] border border-dashed border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_68%,var(--client-surface)_32%)] px-4 py-5 text-center text-xs font-black text-[color:var(--client-muted)]">
                        暂无员工。
                      </div>
                    )}
                  </MerchantStaffRoleSection>
                ))}
              </div>

              <div className="mt-4 rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_58%,var(--client-surface)_42%)] p-3">
                <div className="relative">
                  <input
                    className="h-11 w-full min-w-0 rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_86%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_78%,var(--client-surface)_22%)] px-4 pr-12 text-sm font-black text-[color:var(--client-text)] outline-none placeholder:text-[color:var(--client-muted)] focus:border-[color:var(--client-primary)]"
                    onChange={(event) => {
                      setCustomEmployeeRoleDraft(event.target.value);
                      setEmployeeRoleDraft("custom");
                    }}
                    placeholder="职务名"
                    value={customEmployeeRoleDraft}
                  />
                  <button
                    aria-expanded={employeeRoleMenuOpen}
                    aria-label="选择职务名"
                    className="focus-ring absolute right-1.5 top-1.5 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_78%,transparent)] text-[color:var(--client-text)]"
                    onClick={() => setEmployeeRoleMenuOpen((open) => !open)}
                    type="button"
                  >
                    <AppIcon className="h-4 w-4" name="menu" />
                  </button>
                  {employeeRoleMenuOpen ? (
                    <div className="absolute right-0 top-12 z-30 w-44 overflow-hidden rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_82%,transparent)] bg-[color:var(--client-surface)] p-1 shadow-[0_18px_42px_rgba(0,0,0,0.2)]">
                      {[...merchantStaffRoleQuickOptions, "custom" as const].map((roleName) => {
                        const label = roleName === "custom" ? "自定义" : getResolvedMerchantStaffRoleName(roleName, staffRoleNameOverrides);
                        const active = roleName === "custom"
                          ? employeeRoleDraft === "custom" && !merchantStaffRoleQuickOptions.some((option) => getResolvedMerchantStaffRoleName(option, staffRoleNameOverrides) === customEmployeeRoleDraft)
                          : customEmployeeRoleDraft === label;

                        return (
                          <button
                            className={cn(
                              "block h-10 w-full rounded-[14px] px-3 text-left text-sm font-black transition",
                              active
                                ? "bg-[color:var(--client-primary)] text-[color:var(--client-needo-text)]"
                                : "text-[color:var(--client-text)] hover:bg-[color:color-mix(in_srgb,var(--client-primary-soft)_72%,transparent)]"
                            )}
                            key={roleName}
                            onClick={() => {
                              setEmployeeRoleDraft(roleName);
                              setCustomEmployeeRoleDraft(roleName === "custom" ? "" : label);
                              setEmployeeRoleMenuOpen(false);
                            }}
                            type="button"
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <input
                    className="h-11 min-w-0 rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_86%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_78%,var(--client-surface)_22%)] px-4 text-sm font-black text-[color:var(--client-text)] outline-none placeholder:text-[color:var(--client-muted)] focus:border-[color:var(--client-primary)]"
                    onChange={(event) => setEmployeeNameDraft(event.target.value)}
                    placeholder="员工姓名"
                    value={employeeNameDraft}
                  />
                  <input
                    className="h-11 min-w-0 rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_86%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_78%,var(--client-surface)_22%)] px-4 text-sm font-black text-[color:var(--client-text)] outline-none placeholder:text-[color:var(--client-muted)] focus:border-[color:var(--client-primary)]"
                    inputMode="numeric"
                    onChange={(event) => setEmployeeSalaryDraft(event.target.value)}
                    placeholder="月人件费（日元）"
                    value={employeeSalaryDraft}
                  />
                </div>
                <button
                  className="focus-ring mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[color:var(--client-primary)] px-4 text-sm font-black text-[color:var(--client-needo-text)] shadow-[0_12px_28px_color-mix(in_srgb,var(--client-primary)_24%,transparent)]"
                  onClick={() => addManualEmployee()}
                  type="button"
                >
                  <AppIcon className="h-5 w-5" name="plus" />
                  添加员工
                </button>
              </div>
            </section>
          </>
        )}

        {activeView === "schedule" && (
          <>
            <MerchantScheduleHeaderTabs
              onChange={updateMerchantSchedulePrimaryTab}
              value={merchantSchedulePrimaryTab}
            />
            {merchantSchedulePrimaryTab === "current" ? (
              <DispatchOverviewWorkspace
                operatorId={store.id}
                staffLabel="员工"
                storeId={store.id}
                surface="mobile"
              />
            ) : null}
            {merchantSchedulePrimaryTab === "appointments" ? (
              <UnifiedUserCalendar currentStore={store} displayMode="parallel" scope="merchant" />
            ) : null}
            {merchantSchedulePrimaryTab === "planning" ? (
              <AutomationWizard operatorId={store.id} storeId={store.id} surface="mobile" />
            ) : null}
          </>
        )}

        {activeView === "contacts" && (
          <ImScopeProvider scope="merchant">
            <ImContactsListPage />
          </ImScopeProvider>
        )}

        {activeView === "me" && (
          <>
            <div className={cn("space-y-4 px-4 pb-0", isMerchantDataCenterView && "merchant-analytics-clean-content")}>
              {activeMeTab === "service" ? (
                <StoreDetailExperience
                  embedded
                  scope="merchant"
                  store={store}
                />
              ) : null}

              {activeMeTab === "data" ? (
                <ShopAnalyticsDashboard
                  customers={customers}
                  key={entityRevision}
                  orders={orders}
                  personnelMonthlyCost={manualPersonnelMonthlyCost}
                  settlements={settlements}
                  store={store}
                  stores={stores}
                  technicians={technicians}
                />
              ) : null}
            </div>
          </>
        )}
        {selectedContact && (
          <div className="fixed inset-0 z-50 bg-black/45 px-4 py-8">
            {selectedContactStaff ? (
              <section className="mx-auto flex h-full w-full max-w-[460px] flex-col overflow-hidden rounded-[28px] bg-paper p-3 text-ink shadow-soft">
                <div className="flex shrink-0 items-center justify-between gap-3 rounded-[22px] bg-white px-3 py-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-[0.14em] text-moss">员工详情</p>
                    <h2 className="mt-1 truncate text-base font-black">{selectedContactStaff.nickname ? `${selectedContactStaff.nickname} / ${selectedContactStaff.name}` : selectedContactStaff.name}</h2>
                  </div>
                  <button className="rounded-full bg-paper px-3 py-2 text-xs font-black" onClick={closeSelectedContact} type="button">
                    关闭
                  </button>
                </div>
                <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
                  <TechnicianProfilePanel context="merchant" technician={selectedContactStaff} />
                </div>
              </section>
            ) : (
              <section className="mx-auto mt-20 w-full max-w-[440px] rounded-[28px] bg-white p-4 text-ink shadow-soft">
                <div className="flex justify-end">
                  <button className="rounded-full bg-paper px-3 py-2 text-xs font-black" onClick={closeSelectedContact} type="button">
                    关闭
                  </button>
                </div>

                {selectedContactCustomer ? (
                  <SocialProfileMiniCard
                    actionLabel={followedCustomerIds.includes(selectedContactCustomer.id) ? "关注中" : "关注"}
                    className="mt-3"
                    customer={selectedContactCustomer}
                    detailTo={getScopedProfileDetailPath("merchant", "user", selectedContactCustomer.id)}
                    onAction={() => toggleFollow("customer", selectedContactCustomer.id)}
                  />
                ) : null}

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    to={`/merchant/messages?chat=${getMerchantCustomerConversationId(selectedContactCustomer?.id ?? customers[0].id)}`}
                  >
                    聊天
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      contact(selectedContactCustomer?.name ?? "联系人", "phone");
                      closeSelectedContact();
                    }}
                  >
                    电话
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    to={`/merchant/messages?chat=${getMerchantCustomerConversationId(selectedContactCustomer?.id ?? customers[0].id)}`}
                  >
                    预约详细
                  </Button>
                  <Button size="sm" variant="secondary" to="/merchant/moments">
                    查看动态
                  </Button>
                </div>

                <div className="mt-4 rounded-lg bg-paper p-3 text-xs leading-5 text-ink/55">
                  预约提醒：最近订单 {selectedCustomerOrder.itemName}，时间 {selectedCustomerOrder.bookedAt}。
                </div>
              </section>
            )}
          </div>
        )}

        {pendingStaffDelete ? (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/72 p-4 backdrop-blur-md">
            <section className="w-full max-w-[420px] rounded-[26px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-4 text-[color:var(--client-text)] shadow-[0_28px_90px_rgba(0,0,0,0.42)]">
              <h2 className="text-base font-black">删除员工</h2>
              <p className="mt-2 text-sm font-bold leading-6 text-[color:var(--client-muted)]">
                是否要删除此员工，删除后会从组织的现有架构中删除。
              </p>
              <p className="mt-2 truncate text-sm font-black">{pendingStaffDelete.name}</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  className="focus-ring h-11 rounded-full border border-[color:color-mix(in_srgb,var(--client-line)_82%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_80%,var(--client-bg)_20%)] text-sm font-black text-[color:var(--client-text)]"
                  onClick={() => setPendingStaffDelete(null)}
                  type="button"
                >
                  取消
                </button>
                <button
                  className="focus-ring h-11 rounded-full bg-[color:var(--client-accent)] text-sm font-black text-white shadow-[0_12px_26px_color-mix(in_srgb,var(--client-accent)_24%,transparent)]"
                  onClick={confirmStaffDelete}
                  type="button"
                >
                  删除
                </button>
              </div>
            </section>
          </div>
        ) : null}

        {activeView === "dashboard" ? (
          <MerchantHomeContactStatusPanel
            filter={homeContactStatusFilter}
            items={homeContactStatusItems}
            onFilterChange={setHomeContactStatusFilter}
          />
        ) : activeView === "staff" ? (
          <MerchantHomeContactStatusPanel
            emptyDetail="当前筛选条件下没有员工人事信息。"
            filter={staffHrStatusFilter}
            items={staffHrStatusItems}
            onFilterChange={setStaffHrStatusFilter}
            title="人事信息"
          />
        ) : activeView === "schedule" && merchantSchedulePrimaryTab === "appointments" ? (
          <MerchantHomeContactStatusPanel
            emptyDetail="当前筛选条件下没有预约相关异常信息。"
            filter={appointmentContactStatusFilter}
            items={appointmentContactStatusItems}
            onFilterChange={setAppointmentContactStatusFilter}
            title="异常信息"
          />
        ) : activeView !== "schedule" ? (
          <MerchantHomeContactStatusPanel
            emptyDetail={contactLog}
            filter={generalContactStatusFilter}
            items={generalContactStatusItems}
            onFilterChange={setGeneralContactStatusFilter}
          />
        ) : null}
      </div>
    </MobileShell>
  );
}
