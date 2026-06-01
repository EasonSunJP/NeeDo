import { demoAuthAccount } from "../auth/demoAccount";
import { getPortalFeaturePermissions } from "../auth/featurePermissions";
import type { AuthMePayload } from "../auth/rbac";
import {
  customers,
  dashboardMetrics,
  orders,
  schedules,
  serviceCategories,
  services,
  settlements,
  stores,
  technicians
} from "../data/mock";
import type {
  BackofficeDashboardPayload,
  BackofficeFinanceSettlementPayload,
  BackofficeOrderPayload,
  BackofficeScheduleSlotPayload,
  BackofficeShopPayload,
  BackofficeTechnicianPayload,
  CsvExportPayload,
  PaginatedApiPayload
} from "./backofficeRealData";
import type { HttpClientRequestOptions } from "./httpClient";
import type { PaginatedBookingData, BookingOrder, BookingScheduleSlot } from "../features/booking/api";
import type {
  CoreCategory,
  CoreCustomerProfile,
  CoreHomeRecommendations,
  CoreMediaAsset,
  CoreServiceCard,
  CoreServiceDetail,
  CoreShopCard,
  CoreShopDetail,
  CoreTechnicianCard,
  CoreTechnicianDetail
} from "../features/core-read/api";
import type {
  PaginatedData,
  PermissionPayload,
  PermissionTreePayload,
  PermissionType,
  RolePayload,
  UserPayload,
  UserRolePayload
} from "./userManagement";
import type { GoogleAccountConnectionStatus } from "../lib/googleAccountApi";
import type {
  GoogleCalendarApiExportResponse,
  GoogleCalendarApiImportResponse,
  GoogleCalendarConnectionStatus
} from "../lib/googleCalendarApi";

type StaticDemoResult<TData> =
  | { handled: true; data: TData }
  | { handled: false };

const staticTimestamp = "2026-05-29T00:00:00.000Z";
const staticAccessToken = "static-demo-access-token";
const staticRefreshToken = "static-demo-refresh-token";
const staticShopPricingModes = new Map<number, {
  pricingMode: "merchant" | "technician";
  technicianPricingRatePercent: number;
  updatedAt: string;
}>();

function isEnabledFlag(value: string | undefined) {
  return ["1", "static", "true", "yes"].includes((value ?? "").trim().toLowerCase());
}

export function isStaticDemoMode() {
  return isEnabledFlag(import.meta.env.VITE_NEEDO_STATIC_DEMO) || isEnabledFlag(import.meta.env.VITE_STATIC_DEMO);
}

function clone<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}

function normalizeStaticTechnicianPricingRatePercent(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(200, Math.max(10, Math.round(value)))
    : 100;
}

function getStaticShopPricingMode(shopId: number) {
  return staticShopPricingModes.get(shopId) ?? {
    pricingMode: "merchant" as const,
    technicianPricingRatePercent: 100,
    updatedAt: new Date().toISOString()
  };
}

function normalizePath(path: string) {
  try {
    const url = new URL(path, "http://static-demo.local");
    return url.pathname.replace(/\/+$/, "") || "/";
  } catch {
    return path.split("?")[0]?.replace(/\/+$/, "") || "/";
  }
}

function numberFromText(value: string | number | null | undefined, fallback: number) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const match = String(value ?? "").match(/\d+/);
  const parsed = match ? Number(match[0]) : fallback;

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readNumberQuery(options: HttpClientRequestOptions, key: string, fallback: number) {
  const value = options.query?.[key];
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readStringQuery(options: HttpClientRequestOptions, key: string) {
  const value = options.query?.[key];

  return typeof value === "string" ? value.trim() : "";
}

function paginate<TItem>(list: TItem[], options: HttpClientRequestOptions): PaginatedData<TItem> {
  const page = readNumberQuery(options, "page", 1);
  const pageSize = readNumberQuery(options, "pageSize", readNumberQuery(options, "page_size", 20));
  const start = (page - 1) * pageSize;

  return {
    list: list.slice(start, start + pageSize),
    page,
    page_size: pageSize,
    total: list.length
  };
}

const staticCoreCategories: CoreCategory[] = serviceCategories.map((category, index) => ({
  id: index + 1,
  code: category.id,
  name: category.name,
  nameEn: null,
  nameJa: category.name,
  parentId: null,
  iconUrl: null,
  sortOrder: index + 1,
  isActive: category.hot,
  createdAt: staticTimestamp,
  updatedAt: staticTimestamp
}));

function getCoreCategoryByCode(code: string) {
  return staticCoreCategories.find((category) => category.code === code) ?? staticCoreCategories[0]!;
}

function reviewSummary(rating: number, count: number, highlights: string[]) {
  return {
    ratingAverage: rating.toFixed(2),
    reviewCount: count,
    latestReviewAt: staticTimestamp,
    highlights: highlights.slice(0, 4)
  };
}

function mediaAsset(url: string | null | undefined, sortOrder: number): CoreMediaAsset | null {
  if (!url) {
    return null;
  }

  return {
    id: sortOrder,
    url,
    mimeType: "image/jpeg",
    usageType: sortOrder === 1 ? "cover" : "gallery",
    width: 1200,
    height: 800,
    altText: null,
    sortOrder
  };
}

function mediaAssetsFromUrls(urls: Array<string | null | undefined>) {
  return urls.map((url, index) => mediaAsset(url, index + 1)).filter((asset): asset is CoreMediaAsset => Boolean(asset));
}

function shopCard(index: number): CoreShopCard {
  const store = stores[index % stores.length] ?? stores[0]!;

  return {
    id: index + 1,
    name: store.name,
    city: store.area,
    address: store.address,
    coverUrl: store.cover,
    reviewSummary: reviewSummary(store.rating, store.reviewCount, store.tags)
  };
}

function technicianCard(index: number): CoreTechnicianCard {
  const technician = technicians[index % technicians.length] ?? technicians[0]!;

  return {
    id: index + 1,
    displayName: technician.name,
    city: technician.serviceAreas[0] ?? "东京",
    avatarUrl: technician.avatar,
    reviewSummary: reviewSummary(technician.rating, technician.reviewCount, technician.skills)
  };
}

function serviceCard(index: number): CoreServiceCard {
  const service = services[index % services.length] ?? services[0]!;
  const category = getCoreCategoryByCode(service.categoryId);
  const shop = shopCard(index);
  const technician = technicianCard(index);
  const firstPackage = service.packages[0];

  return {
    id: index + 1,
    name: service.name,
    description: service.summary,
    category,
    shop,
    technician,
    city: service.serviceAreas[0] ?? shop.city,
    priceAmount: service.priceFrom.toFixed(2),
    currency: "JPY",
    durationMinutes: firstPackage?.durationMinutes ?? 60,
    coverUrl: service.cover,
    reviewSummary: reviewSummary(service.rating, service.sales, service.tags)
  };
}

function serviceDetail(id: number): CoreServiceDetail {
  const index = Math.max(0, id - 1);
  const card = serviceCard(index);
  const source = services[index % services.length] ?? services[0]!;

  return {
    ...card,
    serviceMode: source.mode,
    mediaAssets: mediaAssetsFromUrls([source.cover]),
    createdAt: staticTimestamp,
    updatedAt: staticTimestamp
  };
}

function shopDetail(id: number): CoreShopDetail {
  const index = Math.max(0, id - 1);
  const source = stores[index % stores.length] ?? stores[0]!;
  const card = shopCard(index);

  return {
    ...card,
    description: source.description,
    phone: null,
    latitude: null,
    longitude: null,
    mediaAssets: mediaAssetsFromUrls([source.cover, ...source.gallery]),
    services: services.slice(0, 6).map((_, serviceIndex) => serviceCard(serviceIndex)),
    technicians: technicians.slice(0, 6).map((_, technicianIndex) => technicianCard(technicianIndex)),
    createdAt: staticTimestamp,
    updatedAt: staticTimestamp
  };
}

function technicianDetail(id: number): CoreTechnicianDetail {
  const index = Math.max(0, id - 1);
  const source = technicians[index % technicians.length] ?? technicians[0]!;
  const card = technicianCard(index);

  return {
    ...card,
    bio: source.bio ?? null,
    serviceArea: source.serviceAreas.join(", "),
    yearsExperience: Math.max(1, Math.round(source.orderCount / 180)),
    mediaAssets: mediaAssetsFromUrls([source.avatar, ...(source.gallery ?? [])]),
    services: services.slice(0, 6).map((_, serviceIndex) => serviceCard(serviceIndex)),
    createdAt: staticTimestamp,
    updatedAt: staticTimestamp
  };
}

function customerProfile(id: number): CoreCustomerProfile {
  const index = Math.max(0, id - 1);
  const source = customers[index % customers.length] ?? customers[0]!;

  return {
    id,
    displayName: source.nickname ? `${source.nickname} / ${source.name}` : source.name,
    city: source.tags[0] ?? null,
    bio: source.bio ?? null,
    avatarUrl: source.avatar,
    membershipLevel: source.memberLevel,
    reviewSummary: reviewSummary(source.activeScore / 20, source.orderCount, source.tags),
    createdAt: staticTimestamp,
    updatedAt: staticTimestamp
  };
}

function filteredServices(options: HttpClientRequestOptions) {
  const keyword = readStringQuery(options, "keyword").toLowerCase();
  const categoryId = Number(options.query?.categoryId);
  let list = services.map((_, index) => serviceCard(index));

  if (Number.isFinite(categoryId) && categoryId > 0) {
    list = list.filter((service) => service.category.id === categoryId);
  }

  if (keyword) {
    list = list.filter((service) => {
      const text = [
        service.name,
        service.description ?? "",
        service.category.name,
        service.city,
        service.shop.name,
        service.technician?.displayName ?? "",
        ...service.reviewSummary.highlights
      ].join(" ").toLowerCase();

      return text.includes(keyword);
    });
  }

  return list;
}

const staticPermissionSeed: Array<Pick<PermissionPayload, "code" | "module" | "name" | "type">> = [
  { code: "page:dashboard", module: "admin", name: "数据大盘", type: "page" },
  { code: "page:user-management", module: "admin", name: "账号管理", type: "page" },
  { code: "page:role-management", module: "admin", name: "角色管理", type: "page" },
  { code: "page:permission-management", module: "admin", name: "权限管理", type: "page" },
  { code: "menu:dashboard", module: "admin", name: "数据大盘菜单", type: "menu" },
  { code: "menu:user-management", module: "admin", name: "账号管理菜单", type: "menu" },
  { code: "menu:role-management", module: "admin", name: "角色管理菜单", type: "menu" },
  { code: "menu:permission-management", module: "admin", name: "权限管理菜单", type: "menu" },
  { code: "menu:admin-settings", module: "admin", name: "系统设置菜单", type: "menu" },
  { code: "button:user:create", module: "admin", name: "创建账号", type: "button" },
  { code: "button:user:disable", module: "admin", name: "停用账号", type: "button" },
  { code: "button:user:delete", module: "admin", name: "删除账号", type: "button" },
  { code: "button:user:assign-role", module: "admin", name: "分配角色", type: "button" },
  { code: "button:role:create", module: "admin", name: "创建角色", type: "button" },
  { code: "button:role:delete", module: "admin", name: "删除角色", type: "button" },
  { code: "button:role:assign-permission", module: "admin", name: "分配权限", type: "button" },
  { code: "button:permission:create", module: "admin", name: "创建权限", type: "button" },
  { code: "button:permission:delete", module: "admin", name: "删除权限", type: "button" },
  { code: "page:client-app", module: "client", name: "用户端", type: "page" },
  { code: "page:merchant-app", module: "merchant", name: "商户端", type: "page" },
  { code: "page:technician-app", module: "technician", name: "技师端", type: "page" },
  { code: "page:business-app", module: "business", name: "Afirieito 端", type: "page" },
  { code: "menu:client-app", module: "client", name: "用户端菜单", type: "menu" },
  { code: "menu:merchant-app", module: "merchant", name: "商户端菜单", type: "menu" },
  { code: "menu:technician-app", module: "technician", name: "技师端菜单", type: "menu" },
  { code: "menu:business-app", module: "business", name: "Afirieito 菜单", type: "menu" },
  ...getPortalFeaturePermissions("merchant").map((code) => ({
    code,
    module: "merchant",
    name: code,
    type: "button" as PermissionType
  }))
];

let staticPermissions = staticPermissionSeed.map<PermissionPayload>((permission, index) => ({
  id: index + 1,
  code: permission.code,
  module: permission.module,
  name: permission.name,
  type: permission.type,
  description: "静态演示权限",
  isSystem: true,
  createdAt: staticTimestamp,
  updatedAt: staticTimestamp,
  deletedAt: null
}));

function permissionsByCode(codes: string[]) {
  const codeSet = new Set(codes);

  return staticPermissions.filter((permission) => codeSet.has(permission.code));
}

function allPermissionCodes() {
  return staticPermissions.map((permission) => permission.code);
}

let staticRoles: RolePayload[] = [
  {
    id: 1,
    code: "admin",
    name: "超级管理员",
    description: "静态演示超级管理员",
    isSystem: true,
    createdAt: staticTimestamp,
    updatedAt: staticTimestamp,
    deletedAt: null,
    permissions: staticPermissions
  },
  {
    id: 2,
    code: "merchant_owner",
    name: "商户店长",
    description: "静态演示商户角色",
    isSystem: true,
    createdAt: staticTimestamp,
    updatedAt: staticTimestamp,
    deletedAt: null,
    permissions: permissionsByCode(["page:merchant-app", "menu:merchant-app", ...getPortalFeaturePermissions("merchant")])
  },
  {
    id: 3,
    code: "technician",
    name: "技师",
    description: "静态演示技师角色",
    isSystem: true,
    createdAt: staticTimestamp,
    updatedAt: staticTimestamp,
    deletedAt: null,
    permissions: permissionsByCode(["page:technician-app", "menu:technician-app"])
  },
  {
    id: 4,
    code: "customer",
    name: "用户",
    description: "静态演示 C 端角色",
    isSystem: true,
    createdAt: staticTimestamp,
    updatedAt: staticTimestamp,
    deletedAt: null,
    permissions: permissionsByCode(["page:client-app", "menu:client-app"])
  }
];

function roleAssignments(roleIds: number[]): UserRolePayload[] {
  return roleIds.map((roleId) => {
    const role = staticRoles.find((item) => item.id === roleId)!;

    return {
      id: roleId,
      roleId,
      code: role.code,
      name: role.name,
      scopeType: "global",
      scopeId: null
    };
  });
}

let staticUsers: UserPayload[] = [
  {
    id: 1,
    email: demoAuthAccount.adminEmail,
    phone: null,
    username: demoAuthAccount.username,
    avatarUrl: customers[0]?.avatar ?? null,
    isActive: true,
    lastLoginAt: staticTimestamp,
    createdAt: staticTimestamp,
    updatedAt: staticTimestamp,
    deletedAt: null,
    roleAssignments: roleAssignments([1, 2, 3, 4]),
    roles: ["admin", "merchant_owner", "technician", "customer", "scout"]
  },
  {
    id: 2,
    email: demoAuthAccount.merchantAdminEmail,
    phone: null,
    username: "store-admin",
    avatarUrl: technicians[0]?.avatar ?? null,
    isActive: true,
    lastLoginAt: staticTimestamp,
    createdAt: staticTimestamp,
    updatedAt: staticTimestamp,
    deletedAt: null,
    roleAssignments: roleAssignments([2]),
    roles: ["merchant_owner"]
  }
];

const staticAuthMe: AuthMePayload = {
  id: 1,
  email: demoAuthAccount.adminEmail,
  username: demoAuthAccount.username,
  avatarUrl: customers[0]?.avatar ?? null,
  isActive: true,
  currentIdentity: {
    id: 1,
    scopeId: 1,
    scopeType: "platform",
    type: "platform_admin"
  },
  identities: [
    { id: 1, scopeId: 1, scopeType: "platform", type: "platform_admin" },
    { id: 2, scopeId: 1, scopeType: "store", type: "merchant_owner" },
    { id: 3, scopeId: 1, scopeType: "technician_profile", type: "technician" },
    { id: 4, scopeId: 1, scopeType: "customer_profile", type: "customer" },
    { id: 5, scopeId: null, scopeType: "global", type: "scout" }
  ],
  roles: ["admin", "merchant_owner", "technician", "customer", "scout"],
  permissions: allPermissionCodes(),
  menus: staticPermissions.filter((permission) => permission.type === "menu").map((permission) => permission.code)
};

function permissionTree(): PermissionTreePayload {
  const modules = Array.from(new Set(staticPermissions.map((permission) => permission.module))).map((module) => {
    const modulePermissions = staticPermissions.filter((permission) => permission.module === module);
    const children = Array.from(new Set(modulePermissions.map((permission) => permission.type))).map((type) => ({
      type,
      permissions: modulePermissions.filter((permission) => permission.type === type)
    }));

    return { module, children };
  });

  return { modules };
}

function handleUserManagement<TData>(path: string, options: HttpClientRequestOptions): StaticDemoResult<TData> {
  const method = options.method ?? (options.body === undefined ? "GET" : "POST");

  if (path === "/users" && method === "GET") {
    return { handled: true, data: clone(paginate(staticUsers.filter((user) => !user.deletedAt), options)) as TData };
  }

  if (path === "/users" && method === "POST") {
    const body = options.body as Partial<UserPayload> & { password?: string };
    const user: UserPayload = {
      id: Math.max(...staticUsers.map((item) => item.id), 0) + 1,
      email: String(body.email ?? ""),
      phone: body.phone ?? null,
      username: String(body.username ?? body.email ?? "static-user"),
      avatarUrl: body.avatarUrl ?? null,
      isActive: body.isActive ?? true,
      lastLoginAt: null,
      createdAt: staticTimestamp,
      updatedAt: staticTimestamp,
      deletedAt: null,
      roleAssignments: roleAssignments([4]),
      roles: ["customer"]
    };
    staticUsers = [user, ...staticUsers];

    return { handled: true, data: clone(user) as TData };
  }

  const userAction = path.match(/^\/users\/(\d+)(?:\/(enable|disable|roles))?$/);
  if (userAction) {
    const userId = Number(userAction[1]);
    const action = userAction[2];
    const user = staticUsers.find((item) => item.id === userId);

    if (!user) {
      return { handled: true, data: {} as TData };
    }

    if (method === "DELETE") {
      user.deletedAt = staticTimestamp;
      return { handled: true, data: {} as TData };
    }

    if (action === "enable") {
      user.isActive = true;
    } else if (action === "disable") {
      user.isActive = false;
    } else if (action === "roles") {
      const body = options.body as { roles?: Array<{ roleId: number }> };
      const roleIds = body.roles?.map((role) => role.roleId).filter(Boolean) ?? [];
      user.roleAssignments = roleAssignments(roleIds);
      user.roles = user.roleAssignments.map((role) => role.code);
    } else if (method === "PATCH") {
      Object.assign(user, options.body, { updatedAt: staticTimestamp });
    }

    return { handled: true, data: clone(user) as TData };
  }

  if (path === "/roles" && method === "GET") {
    return { handled: true, data: clone(paginate(staticRoles.filter((role) => !role.deletedAt), options)) as TData };
  }

  if (path === "/roles" && method === "POST") {
    const body = options.body as Partial<RolePayload>;
    const role: RolePayload = {
      id: Math.max(...staticRoles.map((item) => item.id), 0) + 1,
      code: String(body.code ?? `static_role_${Date.now()}`),
      name: String(body.name ?? "静态角色"),
      description: body.description ?? null,
      isSystem: false,
      createdAt: staticTimestamp,
      updatedAt: staticTimestamp,
      deletedAt: null,
      permissions: []
    };
    staticRoles = [role, ...staticRoles];

    return { handled: true, data: clone(role) as TData };
  }

  const roleAction = path.match(/^\/roles\/(\d+)(?:\/permissions)?$/);
  if (roleAction) {
    const roleId = Number(roleAction[1]);
    const role = staticRoles.find((item) => item.id === roleId);

    if (!role) {
      return { handled: true, data: {} as TData };
    }

    if (method === "DELETE") {
      role.deletedAt = staticTimestamp;
      return { handled: true, data: {} as TData };
    }

    if (path.endsWith("/permissions")) {
      const body = options.body as { permissionIds?: number[] };
      const permissionIds = new Set(body.permissionIds ?? []);
      role.permissions = staticPermissions.filter((permission) => permissionIds.has(permission.id));
    } else if (method === "PATCH") {
      Object.assign(role, options.body, { updatedAt: staticTimestamp });
    }

    return { handled: true, data: clone(role) as TData };
  }

  if (path === "/permissions/tree") {
    return { handled: true, data: clone(permissionTree()) as TData };
  }

  if (path === "/permissions" && method === "GET") {
    return { handled: true, data: clone(paginate(staticPermissions.filter((permission) => !permission.deletedAt), options)) as TData };
  }

  if (path === "/permissions" && method === "POST") {
    const body = options.body as Partial<PermissionPayload>;
    const permission: PermissionPayload = {
      id: Math.max(...staticPermissions.map((item) => item.id), 0) + 1,
      code: String(body.code ?? `static:permission:${Date.now()}`),
      module: String(body.module ?? "static"),
      name: String(body.name ?? "静态权限"),
      type: body.type ?? "button",
      description: body.description ?? null,
      isSystem: false,
      createdAt: staticTimestamp,
      updatedAt: staticTimestamp,
      deletedAt: null
    };
    staticPermissions = [permission, ...staticPermissions];

    return { handled: true, data: clone(permission) as TData };
  }

  const permissionAction = path.match(/^\/permissions\/(\d+)$/);
  if (permissionAction) {
    const permissionId = Number(permissionAction[1]);
    const permission = staticPermissions.find((item) => item.id === permissionId);

    if (!permission) {
      return { handled: true, data: {} as TData };
    }

    if (method === "DELETE") {
      permission.deletedAt = staticTimestamp;
      return { handled: true, data: {} as TData };
    }

    if (method === "PATCH") {
      Object.assign(permission, options.body, { updatedAt: staticTimestamp });
    }

    return { handled: true, data: clone(permission) as TData };
  }

  return { handled: false };
}

function backofficeOrderPayload(orderIndex: number): BackofficeOrderPayload {
  const order = orders[orderIndex % orders.length] ?? orders[0]!;

  return {
    id: orderIndex + 1,
    orderNo: order.orderNo,
    status: order.status,
    paymentStatus: "unpaid",
    customerUserId: numberFromText(order.customerId, 1),
    customerName: order.customerName,
    serviceId: orderIndex + 1,
    serviceName: order.itemName,
    shopId: numberFromText(stores[orderIndex % stores.length]?.id, 1),
    shopName: order.storeName ?? stores[0]?.name ?? "静态店铺",
    technicianProfileId: order.technicianName ? orderIndex + 1 : null,
    technicianName: order.technicianName ?? null,
    fulfillmentMode: order.mode,
    priceAmount: order.amount,
    currency: "JPY",
    startsAt: staticTimestamp,
    endsAt: staticTimestamp,
    note: order.remark ?? null,
    cancelReason: null,
    createdAt: staticTimestamp,
    updatedAt: staticTimestamp
  };
}

function scheduleSlotPayload(scheduleIndex: number): BackofficeScheduleSlotPayload {
  const schedule = schedules[scheduleIndex % schedules.length] ?? schedules[0]!;
  const service = services[scheduleIndex % services.length] ?? services[0]!;
  const store = stores[scheduleIndex % stores.length] ?? stores[0]!;
  const technician = technicians[scheduleIndex % technicians.length] ?? technicians[0]!;

  return {
    id: scheduleIndex + 1,
    serviceId: scheduleIndex + 1,
    serviceName: service.name,
    shopId: numberFromText(store.id, scheduleIndex + 1),
    shopName: store.name,
    technicianProfileId: numberFromText(technician.id, scheduleIndex + 1),
    technicianName: technician.name,
    startsAt: `${schedule.date}T${schedule.startTime}:00.000Z`,
    endsAt: `${schedule.date}T${schedule.endTime}:00.000Z`,
    capacity: 1,
    bookedCount: schedule.status === "booked" ? 1 : 0,
    status: schedule.status === "free" ? "available" : schedule.status
  };
}

function financeSettlementPayload(settlementIndex: number): BackofficeFinanceSettlementPayload {
  const settlement = settlements[settlementIndex % settlements.length] ?? settlements[0]!;

  return {
    id: settlementIndex + 1,
    transactionId: settlementIndex + 1,
    transactionNo: `STATIC-TXN-${String(settlementIndex + 1).padStart(4, "0")}`,
    referenceType: "booking_order",
    referenceId: settlementIndex + 1,
    status: settlement.status === "paid" ? "exported" : "pending",
    currency: "JPY",
    expectedAmount: settlement.payableAmount,
    actualAmount: settlement.grossAmount,
    differenceAmount: -settlement.refundAmount,
    exportedAt: settlement.status === "paid" ? staticTimestamp : null,
    createdAt: staticTimestamp
  };
}

function technicianPayload(index: number): BackofficeTechnicianPayload {
  const technician = technicians[index % technicians.length] ?? technicians[0]!;
  const store = stores.find((item) => item.id === technician.storeId);

  return {
    id: index + 1,
    userId: index + 10,
    displayName: technician.name,
    email: technician.accountUsername ?? `${technician.id}@static-demo.needo.jp`,
    shopId: store ? numberFromText(store.id, index + 1) : null,
    shopName: store?.name ?? null,
    city: technician.serviceAreas[0] ?? "东京",
    serviceArea: technician.serviceAreas.join(", "),
    status: technician.status === "off" ? "draft" : "published",
    verifiedAt: staticTimestamp,
    createdAt: staticTimestamp
  };
}

function shopPayload(index: number): BackofficeShopPayload {
  const store = stores[index % stores.length] ?? stores[0]!;

  return {
    id: index + 1,
    ownerUserId: index + 20,
    ownerEmail: store.accountUsername ? `${store.accountUsername}@needo.jp` : null,
    name: store.name,
    city: store.area,
    address: store.address,
    phone: null,
    status: store.openStatus === "closed" ? "suspended" : "published",
    isRecommended: index < 4,
    createdAt: staticTimestamp
  };
}

function dashboardPayload(): BackofficeDashboardPayload {
  const orderRows = orders.slice(0, 8).map((_, index) => backofficeOrderPayload(index));
  const scheduleRows = schedules.slice(0, 12).map((_, index) => scheduleSlotPayload(index));
  const settlementRows = settlements.map((_, index) => financeSettlementPayload(index));

  return {
    metrics: dashboardMetrics.slice(0, 8),
    orders: orderRows,
    schedule: {
      total: scheduleRows.length,
      available: scheduleRows.filter((item) => item.status === "available").length,
      booked: scheduleRows.filter((item) => item.status === "booked").length
    },
    finance: {
      grossAmount: settlementRows.reduce((total, item) => total + item.actualAmount, 0),
      pendingSettlementAmount: settlementRows.filter((item) => item.status !== "exported").reduce((total, item) => total + item.expectedAmount, 0),
      refundAmount: settlementRows.reduce((total, item) => total + Math.abs(Math.min(0, item.differenceAmount)), 0)
    },
    technicians: technicians.slice(0, 8).map((_, index) => technicianPayload(index)),
    shops: stores.slice(0, 8).map((_, index) => shopPayload(index))
  };
}

function backofficeList<TItem>(list: TItem[], options: HttpClientRequestOptions): PaginatedApiPayload<TItem> {
  return paginate(list, options);
}

function handleBackoffice<TData>(path: string, options: HttpClientRequestOptions): StaticDemoResult<TData> {
  const scopeMatch = path.match(/^\/(backoffice|merchant-admin)(\/.*)?$/);

  if (!scopeMatch) {
    return { handled: false };
  }

  const suffix = scopeMatch[2] || "";

  if (suffix === "/dashboard") {
    return { handled: true, data: clone(dashboardPayload()) as TData };
  }

  if (suffix === "/orders") {
    return { handled: true, data: clone(backofficeList(orders.map((_, index) => backofficeOrderPayload(index)), options)) as TData };
  }

  if (suffix === "/schedule") {
    return { handled: true, data: clone(backofficeList(schedules.map((_, index) => scheduleSlotPayload(index)), options)) as TData };
  }

  if (suffix === "/finance/settlements") {
    return { handled: true, data: clone(backofficeList(settlements.map((_, index) => financeSettlementPayload(index)), options)) as TData };
  }

  if (suffix === "/finance/settlements/export") {
    const exportPayload: CsvExportPayload = {
      filename: "needo-static-demo-settlements.csv",
      contentType: "text/csv; charset=utf-8",
      content: "transaction_no,status,amount\nSTATIC-TXN-0001,pending,0\n"
    };

    return { handled: true, data: clone(exportPayload) as TData };
  }

  if (suffix === "/technicians") {
    return { handled: true, data: clone(backofficeList(technicians.map((_, index) => technicianPayload(index)), options)) as TData };
  }

  if (suffix === "/shops" || suffix === "/shop") {
    return { handled: true, data: clone(backofficeList(stores.map((_, index) => shopPayload(index)), options)) as TData };
  }

  return { handled: false };
}

function bookingOrder(index: number, patch: Partial<BookingOrder> = {}): BookingOrder {
  const order = orders[index % orders.length] ?? orders[0]!;
  const service = services[index % services.length] ?? services[0]!;
  const store = stores[index % stores.length] ?? stores[0]!;
  const technician = technicians[index % technicians.length] ?? technicians[0]!;

  return {
    id: index + 1,
    orderNo: order.orderNo,
    orderType: "booking",
    status: order.status === "scheduled" || order.status === "unpaid" || order.status === "refunding" || order.status === "refunded"
      ? "pending"
      : order.status,
    paymentStatus: "unpaid",
    customerUserId: numberFromText(order.customerId, 1),
    serviceId: index + 1,
    technicianServiceId: null,
    shopId: numberFromText(store.id, index + 1),
    technicianProfileId: numberFromText(technician.id, index + 1),
    scheduleSlotId: index + 1,
    fulfillmentMode: order.mode,
    serviceName: service.name,
    pricingModeSnapshot: "merchant",
    serviceOwnerType: "shop",
    serviceOwnerId: index + 1,
    serviceNameSnapshot: service.name,
    servicePriceSnapshot: service.priceFrom.toFixed(2),
    serviceDurationSnapshot: service.packages[0]?.durationMinutes ?? 60,
    serviceSnapshot: null,
    shopName: store.name,
    technicianName: technician.name,
    priceAmount: service.priceFrom.toFixed(2),
    currency: "JPY",
    startsAt: staticTimestamp,
    endsAt: staticTimestamp,
    note: order.remark ?? null,
    cancelReason: null,
    createdAt: staticTimestamp,
    updatedAt: staticTimestamp,
    statusHistory: [
      {
        id: 1,
        orderId: index + 1,
        fromStatus: null,
        toStatus: "pending",
        actorUserId: 1,
        reason: "static-demo",
        createdAt: staticTimestamp
      }
    ],
    ...patch
  };
}

function bookingSlot(index: number): BookingScheduleSlot {
  const service = services[index % services.length] ?? services[0]!;
  const store = stores[index % stores.length] ?? stores[0]!;
  const technician = technicians[index % technicians.length] ?? technicians[0]!;

  return {
    id: index + 1,
    serviceId: index + 1,
    technicianServiceId: null,
    shopId: numberFromText(store.id, index + 1),
    technicianProfileId: numberFromText(technician.id, index + 1),
    startsAt: staticTimestamp,
    endsAt: staticTimestamp,
    capacity: 1,
    bookedCount: 0,
    status: "available",
    serviceName: service.name,
    shopName: store.name,
    technicianName: technician.name,
    priceAmount: service.priceFrom.toFixed(2),
    currency: "JPY",
    durationMinutes: service.packages[0]?.durationMinutes ?? 60
  };
}

function bookingPage<TItem>(list: TItem[], options: HttpClientRequestOptions): PaginatedBookingData<TItem> {
  return paginate(list, options);
}

function handleBooking<TData>(path: string, options: HttpClientRequestOptions): StaticDemoResult<TData> {
  if (path === "/schedule/availability") {
    return { handled: true, data: clone(bookingPage(services.slice(0, 8).map((_, index) => bookingSlot(index)), options)) as TData };
  }

  if (path === "/bookings") {
    return { handled: true, data: clone(bookingOrder(0)) as TData };
  }

  if (path === "/orders") {
    return { handled: true, data: clone(bookingPage(orders.map((_, index) => bookingOrder(index)), options)) as TData };
  }

  const orderAction = path.match(/^\/orders\/(\d+)(?:\/(confirm|cancel|start|complete))?$/);
  if (orderAction) {
    const id = Number(orderAction[1]);
    const action = orderAction[2];
    const status = action === "confirm"
      ? "confirmed"
      : action === "cancel"
        ? "cancelled"
        : action === "start"
          ? "inService"
          : action === "complete"
            ? "completed"
            : undefined;

    return { handled: true, data: clone(bookingOrder(Math.max(0, id - 1), status ? { status } : {})) as TData };
  }

  return { handled: false };
}

function handleCoreRead<TData>(path: string, options: HttpClientRequestOptions): StaticDemoResult<TData> {
  if (path === "/categories") {
    return { handled: true, data: clone(paginate(staticCoreCategories, options)) as TData };
  }

  const pricingModeMatch = path.match(/^\/shops\/(\d+)\/pricing-mode$/);
  if (pricingModeMatch) {
    const shopId = Number(pricingModeMatch[1]);
    const current = getStaticShopPricingMode(shopId);
    const body = options.body as { pricingMode?: "merchant" | "technician"; technicianPricingRatePercent?: number } | undefined;
    const next = {
      pricingMode: body?.pricingMode ?? current.pricingMode,
      technicianPricingRatePercent: normalizeStaticTechnicianPricingRatePercent(
        body?.technicianPricingRatePercent ?? current.technicianPricingRatePercent
      ),
      updatedAt: new Date().toISOString()
    };
    staticShopPricingModes.set(shopId, next);
    return {
      handled: true,
      data: clone({
        shopId,
        ...next,
        updatedBy: 1
      }) as TData
    };
  }

  const bookingNavigationMatch = path.match(/^\/shops\/(\d+)\/booking-navigation$/);
  if (bookingNavigationMatch) {
    const shopId = Number(bookingNavigationMatch[1]);
    const pricingMode = getStaticShopPricingMode(shopId);
    const serviceNavigation = paginate(services.slice(0, 6).map((_, index) => ({
      id: index + 1,
      name: services[index]?.name ?? "服务",
      priceAmount: String(services[index]?.priceFrom ?? 0),
      currency: "JPY",
      durationMinutes: services[index]?.packages[0]?.durationMinutes ?? 60,
      coverUrl: services[index]?.cover ?? null
    })), options);
    const technicianNavigation = paginate(technicians.slice(0, 6).map((technician, index) => ({
      id: index + 1,
      displayName: technician.name,
      city: technician.serviceAreas[0] ?? "东京",
      avatarUrl: technician.avatar,
      reviewSummary: null
    })), options);
    return {
      handled: true,
      data: clone({
        shopId,
        pricingMode: pricingMode.pricingMode,
        technicianPricingRatePercent: pricingMode.technicianPricingRatePercent,
        ...(pricingMode.pricingMode === "technician"
          ? { entry: "technician_list", technicians: technicianNavigation }
          : { entry: "service_menu", services: serviceNavigation })
      }) as TData
    };
  }

  const publicTechnicianServicesMatch = path.match(/^\/shops\/(\d+)\/technicians\/(\d+)\/services$/);
  if (publicTechnicianServicesMatch || path.match(/^\/technicians\/me\/shops\/(\d+)\/services(?:\/\d+)?$/)) {
    const shopId = Number(publicTechnicianServicesMatch?.[1] ?? 1);
    const technician = technicians[(Number(publicTechnicianServicesMatch?.[2] ?? 1) - 1) % technicians.length] ?? technicians[0]!;
    const service = services[0]!;
    const pricingMode = getStaticShopPricingMode(shopId);
    const publicPriceAmount = publicTechnicianServicesMatch && pricingMode.pricingMode === "technician"
      ? Math.round((service.priceFrom * pricingMode.technicianPricingRatePercent) / 100)
      : service.priceFrom;
    const list = [
      {
        id: 1,
        shopId,
        technicianId: Number(publicTechnicianServicesMatch?.[2] ?? 1),
        sourceShopServiceId: null,
        name: service.name,
        description: `${technician.name} · ${service.summary}`,
        categoryId: 1,
        priceAmount: publicPriceAmount,
        currency: "JPY",
        durationMinutes: service.packages[0]?.durationMinutes ?? 60,
        coverImageUrl: service.cover,
        images: [service.cover],
        tags: technician.skills.slice(0, 3),
        isActive: true,
        isBookable: true,
        isRecommended: true,
        sortOrder: 0,
        reviewStatus: "approved",
        rejectionReason: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];

    if ((options.method ?? "GET") === "GET") {
      return { handled: true, data: clone(paginate(list, options)) as TData };
    }

    return { handled: true, data: clone(list[0]) as TData };
  }

  if (path === "/services" || path === "/search") {
    return { handled: true, data: clone(paginate(filteredServices(options), options)) as TData };
  }

  if (path === "/home/recommendations") {
    const limit = readNumberQuery(options, "limit", 20);
    const data: CoreHomeRecommendations = {
      categories: staticCoreCategories.slice(0, 10),
      services: services.slice(0, limit).map((_, index) => serviceCard(index)),
      shops: stores.slice(0, Math.min(8, limit)).map((_, index) => shopCard(index)),
      technicians: technicians.slice(0, Math.min(8, limit)).map((_, index) => technicianCard(index))
    };

    return { handled: true, data: clone(data) as TData };
  }

  const serviceMatch = path.match(/^\/services\/(\d+)$/);
  if (serviceMatch) {
    return { handled: true, data: clone(serviceDetail(Number(serviceMatch[1]))) as TData };
  }

  const shopMatch = path.match(/^\/shops\/(\d+)$/);
  if (shopMatch) {
    return { handled: true, data: clone(shopDetail(Number(shopMatch[1]))) as TData };
  }

  const technicianMatch = path.match(/^\/technicians\/(\d+)$/);
  if (technicianMatch) {
    return { handled: true, data: clone(technicianDetail(Number(technicianMatch[1]))) as TData };
  }

  const customerMatch = path.match(/^\/profiles\/customers\/(\d+)$/);
  if (customerMatch) {
    return { handled: true, data: clone(customerProfile(Number(customerMatch[1]))) as TData };
  }

  return { handled: false };
}

function emptyStaticFallback<TData>(path: string, options: HttpClientRequestOptions): TData {
  const method = options.method ?? (options.body === undefined ? "GET" : "POST");

  if (method === "GET" && /s$/.test(path.split("/").pop() ?? "")) {
    return paginate([], options) as TData;
  }

  return {} as TData;
}

export async function resolveStaticDemoRequest<TData>(
  rawPath: string,
  options: HttpClientRequestOptions
): Promise<StaticDemoResult<TData>> {
  if (!isStaticDemoMode()) {
    return { handled: false };
  }

  const path = normalizePath(rawPath);

  if (["/auth/login", "/login", "/auth/otp/verify"].includes(path)) {
    return {
      handled: true,
      data: clone({
        accessToken: staticAccessToken,
        refreshToken: staticRefreshToken,
        expiresIn: 900,
        me: staticAuthMe
      }) as TData
    };
  }

  if (path === "/auth/refresh") {
    return { handled: true, data: clone({ accessToken: staticAccessToken, expiresIn: 900 }) as TData };
  }

  if (path === "/auth/logout") {
    return { handled: true, data: {} as TData };
  }

  if (path === "/auth/me") {
    return { handled: true, data: clone(staticAuthMe) as TData };
  }

  if (path === "/auth/otp/send") {
    return { handled: true, data: clone({ expiresIn: 600, cooldownSeconds: 60 }) as TData };
  }

  const userManagement = handleUserManagement<TData>(path, options);
  if (userManagement.handled) {
    return userManagement;
  }

  const coreRead = handleCoreRead<TData>(path, options);
  if (coreRead.handled) {
    return coreRead;
  }

  const booking = handleBooking<TData>(path, options);
  if (booking.handled) {
    return booking;
  }

  const backoffice = handleBackoffice<TData>(path, options);
  if (backoffice.handled) {
    return backoffice;
  }

  return { handled: true, data: clone(emptyStaticFallback<TData>(path, options)) };
}

export function resolveStaticDemoDataUrl(rawPath: string): StaticDemoResult<string> {
  if (!isStaticDemoMode()) {
    return { handled: false };
  }

  const path = normalizePath(rawPath);
  const label = path.includes("captcha") ? "NeeDo static demo" : "NeeDo static asset";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="64" viewBox="0 0 180 64"><rect width="180" height="64" rx="12" fill="#162118"/><text x="90" y="39" text-anchor="middle" font-family="Arial" font-size="16" font-weight="700" fill="#d8c27a">${label}</text></svg>`;

  return { handled: true, data: `data:image/svg+xml;base64,${globalThis.btoa(svg)}` };
}

function actorIdFromPath(path: string) {
  const url = new URL(path, "http://static-demo.local");

  return url.searchParams.get("actorId") || "needo:static:demo";
}

function googleStatus(actorId: string): GoogleAccountConnectionStatus & GoogleCalendarConnectionStatus {
  return {
    ok: true,
    actorId,
    configured: false,
    connected: false,
    message: "static_demo.google_unconfigured",
    redirectUri: undefined,
    scopes: [],
    profile: null
  };
}

export function resolveStaticDemoGoogleAccountApi<TData>(path: string): StaticDemoResult<TData> {
  if (!isStaticDemoMode()) {
    return { handled: false };
  }

  const actorId = actorIdFromPath(path);
  const status = googleStatus(actorId);

  if (normalizePath(path) === "/api/google-account/auth-url") {
    return { handled: true, data: { ...status, authUrl: "#static-demo-google-account" } as TData };
  }

  return { handled: true, data: status as TData };
}

async function parseRequestJson(init: RequestInit = {}) {
  if (typeof init.body === "string") {
    try {
      return JSON.parse(init.body) as unknown;
    } catch {
      return null;
    }
  }

  return null;
}

export async function resolveStaticDemoGoogleCalendarApi<TData>(
  path: string,
  init: RequestInit = {}
): Promise<StaticDemoResult<TData>> {
  if (!isStaticDemoMode()) {
    return { handled: false };
  }

  const normalizedPath = normalizePath(path);
  const actorId = actorIdFromPath(path);
  const status = googleStatus(actorId);

  if (normalizedPath === "/api/google-calendar/auth-url") {
    return { handled: true, data: { ...status, authUrl: "#static-demo-google-calendar" } as TData };
  }

  if (normalizedPath === "/api/google-calendar/export") {
    const body = await parseRequestJson(init) as { events?: unknown[] } | null;
    const data: GoogleCalendarApiExportResponse = {
      ok: true,
      count: Array.isArray(body?.events) ? body.events.length : 0,
      message: "static_demo.exported_locally"
    };

    return { handled: true, data: data as TData };
  }

  if (normalizedPath === "/api/google-calendar/import") {
    const data: GoogleCalendarApiImportResponse<unknown> = {
      ok: true,
      count: 0,
      message: "static_demo.no_remote_calendar",
      events: []
    };

    return { handled: true, data: data as TData };
  }

  return { handled: true, data: status as TData };
}

export function createStaticDemoPlanCategoryTranslations<TLocale extends string>(
  locales: TLocale[],
  sourceText: string
) {
  return Object.fromEntries(locales.map((locale) => [locale, sourceText])) as Partial<Record<TLocale, string>>;
}

function responseJson(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status
  });
}

async function resolveStaticDemoFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url, window.location.origin);

  if (url.pathname.startsWith("/api/im")) {
    return null;
  }

  if (url.pathname === "/api/translate") {
    const body = await parseRequestJson(init) as { targets?: string[]; text?: string } | null;
    const targets = body?.targets ?? ["ja", "en", "ko", "zh-Hant", "zh"];
    const text = body?.text ?? "";

    return responseJson({ translations: createStaticDemoPlanCategoryTranslations(targets, text) });
  }

  if (url.pathname.startsWith("/api/google-account")) {
    const result = resolveStaticDemoGoogleAccountApi(url.toString());
    return result.handled ? responseJson(result.data) : null;
  }

  if (url.pathname.startsWith("/api/google-calendar")) {
    const result = await resolveStaticDemoGoogleCalendarApi(url.toString(), init);
    return result.handled ? responseJson(result.data) : null;
  }

  if (url.pathname.startsWith("/api/v1")) {
    const result = await resolveStaticDemoRequest(url.pathname.replace(/^\/api\/v1/, "") || "/", {
      body: init?.body,
      method: (init?.method as HttpClientRequestOptions["method"]) ?? "GET"
    });

    return result.handled ? responseJson({ code: 0, message: "success", data: result.data }) : null;
  }

  if (url.hostname.endsWith("googleapis.com")) {
    return responseJson([[[url.searchParams.get("q") ?? ""]]]);
  }

  if (url.pathname.startsWith("/api/")) {
    return responseJson({ ok: true, message: "static_demo.local_response" });
  }

  return null;
}

let staticDemoFetchGuardInstalled = false;

export function installStaticDemoFetchGuard() {
  if (!isStaticDemoMode() || typeof window === "undefined" || staticDemoFetchGuardInstalled) {
    return;
  }

  const originalFetch = window.fetch.bind(window);
  staticDemoFetchGuardInstalled = true;
  document.documentElement.dataset.needoStaticDemo = "true";

  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await resolveStaticDemoFetch(input, init);

    return response ?? originalFetch(input, init);
  }) as typeof window.fetch;
}
