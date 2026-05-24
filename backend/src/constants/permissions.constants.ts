export type PermissionType = "api" | "menu" | "page" | "button";

export interface SystemRoleDefinition {
  code: string;
  name: string;
  description: string;
  isSystem: true;
}

export interface SystemPermissionDefinition {
  code: string;
  name: string;
  type: PermissionType;
  module: string;
  description: string;
  isSystem: true;
}

export const SYSTEM_ROLES = [
  {
    code: "admin",
    name: "超级管理员",
    description: "全局最高权限",
    isSystem: true
  },
  {
    code: "operator",
    name: "平台运营",
    description: "运营后台日常操作",
    isSystem: true
  },
  {
    code: "finance",
    name: "财务人员",
    description: "财务、账本、对账",
    isSystem: true
  },
  {
    code: "support",
    name: "客服人员",
    description: "用户支持、工单、订单协助",
    isSystem: true
  },
  {
    code: "merchant_owner",
    name: "店铺负责人",
    description: "店铺最高管理权限",
    isSystem: true
  },
  {
    code: "merchant_staff",
    name: "店铺员工",
    description: "店铺日常操作",
    isSystem: true
  },
  {
    code: "technician",
    name: "技师",
    description: "服务者端权限",
    isSystem: true
  },
  {
    code: "customer",
    name: "普通用户",
    description: "C 端基础权限",
    isSystem: true
  },
  {
    code: "broker",
    name: "经纪人",
    description: "管理技师组 / 代运营",
    isSystem: true
  },
  {
    code: "scout",
    name: "介绍人",
    description: "拉新 / 分销",
    isSystem: true
  },
  {
    code: "viewer",
    name: "只读观察员",
    description: "后台只读",
    isSystem: true
  }
] as const satisfies readonly SystemRoleDefinition[];

export type SystemRoleCode = (typeof SYSTEM_ROLES)[number]["code"];

export const SYSTEM_ROLE_CODES = SYSTEM_ROLES.map((role) => role.code);

const createPermission = (
  code: string,
  name: string,
  type: PermissionType,
  module: string,
  description: string
): SystemPermissionDefinition => ({
  code,
  name,
  type,
  module,
  description,
  isSystem: true
});

export const SYSTEM_PERMISSIONS = [
  createPermission("auth:me", "查看当前账号", "api", "auth", "读取当前登录账号、身份、角色和权限"),
  createPermission("auth:refresh", "刷新访问令牌", "api", "auth", "使用刷新令牌续期访问令牌"),
  createPermission("auth:logout", "退出登录", "api", "auth", "退出登录并吊销会话"),

  createPermission("user:list", "用户列表", "api", "user", "分页查看用户列表"),
  createPermission("user:create", "创建用户", "api", "user", "创建后台或业务用户"),
  createPermission("user:update", "更新用户", "api", "user", "编辑用户基础资料"),
  createPermission("user:delete", "删除用户", "api", "user", "软删除用户"),
  createPermission("user:assign-role", "分配用户角色", "api", "user", "为用户分配角色"),
  createPermission("user:status:update", "更新用户状态", "api", "user", "启用或禁用用户"),
  createPermission("user:identity:list", "用户身份列表", "api", "user", "查看用户身份"),
  createPermission("user:identity:switch", "切换用户身份", "api", "user", "切换当前用户身份"),
  createPermission("page:user-management", "用户管理页面", "page", "user", "访问用户管理页面"),
  createPermission("button:user:create", "创建用户按钮", "button", "user", "显示创建用户操作"),
  createPermission("button:user:update", "更新用户按钮", "button", "user", "显示更新用户操作"),
  createPermission("button:user:disable", "禁用用户按钮", "button", "user", "显示禁用用户操作"),
  createPermission("button:user:delete", "删除用户按钮", "button", "user", "显示删除用户操作"),
  createPermission(
    "button:user:assign-role",
    "分配角色按钮",
    "button",
    "user",
    "显示用户角色分配操作"
  ),

  createPermission("role:list", "角色列表", "api", "role", "分页查看角色列表"),
  createPermission("role:create", "创建角色", "api", "role", "创建角色"),
  createPermission("role:update", "更新角色", "api", "role", "编辑角色资料"),
  createPermission("role:delete", "删除角色", "api", "role", "软删除角色"),
  createPermission("role:assign-permission", "分配角色权限", "api", "role", "为角色分配权限"),
  createPermission("page:role-management", "角色管理页面", "page", "role", "访问角色管理页面"),
  createPermission("button:role:create", "创建角色按钮", "button", "role", "显示创建角色操作"),
  createPermission("button:role:update", "更新角色按钮", "button", "role", "显示更新角色操作"),
  createPermission("button:role:delete", "删除角色按钮", "button", "role", "显示删除角色操作"),
  createPermission(
    "button:role:assign-permission",
    "分配权限按钮",
    "button",
    "role",
    "显示角色权限分配操作"
  ),

  createPermission("permission:list", "权限列表", "api", "permission", "分页查看权限列表"),
  createPermission("permission:create", "创建权限", "api", "permission", "创建权限"),
  createPermission("permission:update", "更新权限", "api", "permission", "编辑权限资料"),
  createPermission("permission:delete", "删除权限", "api", "permission", "软删除权限"),
  createPermission(
    "page:permission-management",
    "权限管理页面",
    "page",
    "permission",
    "访问权限管理页面"
  ),
  createPermission(
    "button:permission:create",
    "创建权限按钮",
    "button",
    "permission",
    "显示创建权限操作"
  ),
  createPermission(
    "button:permission:update",
    "更新权限按钮",
    "button",
    "permission",
    "显示更新权限操作"
  ),
  createPermission(
    "button:permission:delete",
    "删除权限按钮",
    "button",
    "permission",
    "显示删除权限操作"
  ),

  createPermission("booking:create", "创建预约", "api", "booking", "创建 Booking 免费预约订单"),
  createPermission("order:list", "订单列表", "api", "order", "分页查看订单列表"),
  createPermission("order:read", "订单详情", "api", "order", "查看订单详情与状态历史"),
  createPermission("order:confirm", "确认接单", "api", "order", "服务方确认接单"),
  createPermission("order:cancel", "取消订单", "api", "order", "取消 Booking 订单"),
  createPermission("order:start", "开始服务", "api", "order", "将订单切换为服务中"),
  createPermission("order:complete", "完成服务", "api", "order", "将订单切换为已完成"),

  createPermission("menu:dashboard", "仪表盘菜单", "menu", "menu", "显示仪表盘菜单"),
  createPermission("page:dashboard", "仪表盘页面", "page", "dashboard", "访问仪表盘页面"),
  createPermission("menu:user-management", "用户管理菜单", "menu", "menu", "显示用户管理菜单"),
  createPermission("menu:role-management", "角色管理菜单", "menu", "menu", "显示角色管理菜单"),
  createPermission(
    "menu:permission-management",
    "权限管理菜单",
    "menu",
    "menu",
    "显示权限管理菜单"
  ),
  createPermission("menu:admin-settings", "后台设置菜单", "menu", "menu", "显示后台设置菜单"),
  createPermission("page:admin-settings", "后台设置页面", "page", "dashboard", "访问后台设置页面")
] as const satisfies readonly SystemPermissionDefinition[];

export type SystemPermissionCode = (typeof SYSTEM_PERMISSIONS)[number]["code"];

export const SYSTEM_PERMISSION_CODES = SYSTEM_PERMISSIONS.map((permission) => permission.code);

const AUTH_AND_DASHBOARD_PERMISSION_CODES = [
  "auth:me",
  "auth:refresh",
  "auth:logout",
  "menu:dashboard",
  "page:dashboard"
] as const satisfies readonly SystemPermissionCode[];

const READ_ONLY_BACKOFFICE_PERMISSION_CODES = [
  ...AUTH_AND_DASHBOARD_PERMISSION_CODES,
  "menu:user-management",
  "page:user-management",
  "user:list",
  "user:identity:list",
  "menu:role-management",
  "page:role-management",
  "role:list",
  "menu:permission-management",
  "page:permission-management",
  "permission:list"
] as const satisfies readonly SystemPermissionCode[];

const CUSTOMER_BOOKING_PERMISSION_CODES = [
  ...AUTH_AND_DASHBOARD_PERMISSION_CODES,
  "booking:create",
  "order:list",
  "order:read",
  "order:cancel"
] as const satisfies readonly SystemPermissionCode[];

const SERVICE_PROVIDER_ORDER_PERMISSION_CODES = [
  ...AUTH_AND_DASHBOARD_PERMISSION_CODES,
  "order:list",
  "order:read",
  "order:confirm",
  "order:cancel",
  "order:start",
  "order:complete"
] as const satisfies readonly SystemPermissionCode[];

export const buildRolePermissionAssignments = (): Record<
  SystemRoleCode,
  SystemPermissionCode[]
> => ({
  admin: [...SYSTEM_PERMISSION_CODES],
  operator: [
    ...READ_ONLY_BACKOFFICE_PERMISSION_CODES,
    "user:create",
    "user:update",
    "user:status:update",
    "user:assign-role",
    "button:user:create",
    "button:user:update",
    "button:user:disable",
    "button:user:assign-role",
    "menu:admin-settings",
    "page:admin-settings"
  ],
  finance: [...AUTH_AND_DASHBOARD_PERMISSION_CODES, "menu:admin-settings", "page:admin-settings"],
  support: [
    ...AUTH_AND_DASHBOARD_PERMISSION_CODES,
    "menu:user-management",
    "page:user-management",
    "user:list",
    "user:update",
    "user:identity:list",
    "button:user:update"
  ],
  merchant_owner: [...SERVICE_PROVIDER_ORDER_PERMISSION_CODES],
  merchant_staff: [...SERVICE_PROVIDER_ORDER_PERMISSION_CODES],
  technician: [...SERVICE_PROVIDER_ORDER_PERMISSION_CODES],
  customer: [...CUSTOMER_BOOKING_PERMISSION_CODES],
  broker: [...AUTH_AND_DASHBOARD_PERMISSION_CODES],
  scout: [...AUTH_AND_DASHBOARD_PERMISSION_CODES],
  viewer: [...READ_ONLY_BACKOFFICE_PERMISSION_CODES]
});
