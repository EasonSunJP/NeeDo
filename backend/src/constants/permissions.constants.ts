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

  createPermission("conversation:list", "会话列表", "api", "im", "分页查看 IM 会话"),
  createPermission("conversation:create", "创建会话", "api", "im", "创建 IM 单聊或群聊会话"),
  createPermission("message:list", "消息历史", "api", "im", "分页查看会话消息历史"),
  createPermission("message:create", "发送消息", "api", "im", "发送 IM 消息"),
  createPermission("message:read", "已读消息", "api", "im", "标记会话消息已读"),
  createPermission("contact:list", "联系人列表", "api", "im", "分页查看联系人"),
  createPermission("friend-request:list", "好友申请列表", "api", "im", "分页查看好友申请"),
  createPermission("friend-request:create", "创建好友申请", "api", "im", "发起好友申请"),
  createPermission("friend-request:respond", "处理好友申请", "api", "im", "接受或拒绝好友申请"),
  createPermission("social-post:list", "动态列表", "api", "social", "分页查看社交动态"),
  createPermission("social-post:create", "发布动态", "api", "social", "发布基础社交动态"),
  createPermission("follow:write", "关注操作", "api", "social", "关注或取消关注用户"),
  createPermission("notification:list", "通知列表", "api", "notification", "分页查看通知"),
  createPermission("notification:read", "通知已读", "api", "notification", "标记通知已读"),
  createPermission(
    "realtime:unread-counts",
    "实时未读数",
    "api",
    "realtime",
    "读取 IM、好友申请和通知未读数"
  ),
  createPermission("realtime:events", "实时事件流", "api", "realtime", "订阅 SSE 实时事件流"),

  createPermission("wallet:read", "查看钱包", "api", "wallet", "查看 NDP 钱包余额"),
  createPermission("wallet:ledger:list", "钱包流水", "api", "wallet", "分页查看 NDP 钱包流水"),
  createPermission(
    "finance:ledger:list",
    "财务账本流水",
    "api",
    "finance",
    "分页查看 NDP LedgerTransaction"
  ),
  createPermission(
    "finance:reconciliation:list",
    "财务对账列表",
    "api",
    "finance",
    "分页查看 NDP 财务对账"
  ),
  createPermission(
    "finance:reconciliation:export",
    "财务对账导出",
    "api",
    "finance",
    "导出 NDP 财务对账 CSV 内容"
  ),
  createPermission(
    "finance:fee-rule:list",
    "财务规则列表",
    "api",
    "finance",
    "分页查看 NDP 动态扣费规则"
  ),
  createPermission(
    "finance:fee-rule:write",
    "财务规则写入",
    "api",
    "finance",
    "创建或编辑 NDP 动态扣费规则"
  ),
  createPermission(
    "finance:fee-rule:activate",
    "财务规则启停",
    "api",
    "finance",
    "启用或暂停 NDP 动态扣费规则"
  ),
  createPermission(
    "finance:fee-rule:preview",
    "财务规则预览",
    "api",
    "finance",
    "预览订单命中的 NDP 动态扣费规则"
  ),
  createPermission(
    "finance:calculation-log:list",
    "财务计算日志",
    "api",
    "finance",
    "分页查看 NDP 费用计算日志"
  ),
  createPermission("menu:finance", "财务菜单", "menu", "menu", "显示财务与账本菜单"),
  createPermission("page:finance", "财务页面", "page", "finance", "访问财务与账本页面"),

  createPermission(
    "backoffice:dashboard:read",
    "运营后台 Dashboard",
    "api",
    "backoffice",
    "读取运营后台真实指标"
  ),
  createPermission(
    "backoffice:orders:list",
    "运营后台订单列表",
    "api",
    "backoffice",
    "分页读取运营后台真实订单"
  ),
  createPermission(
    "backoffice:schedule:list",
    "运营后台调度列表",
    "api",
    "backoffice",
    "分页读取运营后台真实排班"
  ),
  createPermission(
    "backoffice:finance:list",
    "运营后台财务结算",
    "api",
    "backoffice",
    "分页读取运营后台财务结算"
  ),
  createPermission(
    "backoffice:finance:export",
    "运营后台财务导出",
    "api",
    "backoffice",
    "导出运营后台财务结算 CSV"
  ),
  createPermission(
    "backoffice:finance-order:read",
    "运营后台订单钱路",
    "api",
    "backoffice",
    "读取运营后台订单钱路和服务收入上报详情"
  ),
  createPermission(
    "backoffice:technicians:list",
    "运营后台技师列表",
    "api",
    "backoffice",
    "分页读取运营后台技师"
  ),
  createPermission(
    "backoffice:shops:list",
    "运营后台店铺列表",
    "api",
    "backoffice",
    "分页读取运营后台店铺"
  ),
  createPermission(
    "merchant-admin:dashboard:read",
    "商户后台 Dashboard",
    "api",
    "merchant-admin",
    "读取商户后台真实指标"
  ),
  createPermission(
    "merchant-admin:orders:list",
    "商户后台订单列表",
    "api",
    "merchant-admin",
    "分页读取本店真实订单"
  ),
  createPermission(
    "merchant-admin:schedule:list",
    "商户后台调度列表",
    "api",
    "merchant-admin",
    "分页读取本店真实排班"
  ),
  createPermission(
    "merchant-admin:finance:list",
    "商户后台财务结算",
    "api",
    "merchant-admin",
    "分页读取本店财务结算"
  ),
  createPermission(
    "merchant-admin:finance:export",
    "商户后台财务导出",
    "api",
    "merchant-admin",
    "导出本店财务结算 CSV"
  ),
  createPermission(
    "merchant-admin:finance-order:read",
    "商户订单钱路读取",
    "api",
    "merchant-admin",
    "读取本店订单钱路、收入状态和技师收入预估"
  ),
  createPermission(
    "merchant-admin:finance-income-report:write",
    "商户服务收入上报",
    "api",
    "merchant-admin",
    "上报本店订单服务收入、支付渠道和确认状态"
  ),
  createPermission(
    "merchant-admin:finance-rules:read",
    "商户财务规则读取",
    "api",
    "merchant-admin",
    "读取本店工资、分成、奖金和 NDP 承担规则"
  ),
  createPermission(
    "merchant-admin:finance-rules:write",
    "商户财务规则维护",
    "api",
    "merchant-admin",
    "维护本店工资、分成、奖金和 NDP 承担规则"
  ),
  createPermission(
    "merchant-admin:finance-rules:preview",
    "商户财务规则预览",
    "api",
    "merchant-admin",
    "预览本店订单的工资、分成、奖金和 NDP 承担口径"
  ),
  createPermission(
    "merchant-admin:compensation-profile:read",
    "技师收入模式读取",
    "api",
    "merchant-admin",
    "读取本店技师收入模式和分成配置"
  ),
  createPermission(
    "merchant-admin:compensation-profile:write",
    "技师收入模式维护",
    "api",
    "merchant-admin",
    "维护本店技师固定工资、分成、奖金、扣款和 NDP 承担配置"
  ),
  createPermission(
    "merchant-admin:compensation-profile:preview",
    "技师收入模式预览",
    "api",
    "merchant-admin",
    "预览本店技师单笔订单收入、NDP 分摊和店铺毛利"
  ),
  createPermission(
    "merchant-admin:payroll:read",
    "商户工资单读取",
    "api",
    "merchant-admin",
    "读取本店 Pay Run、Payslip、工资行项目和支付记录"
  ),
  createPermission(
    "merchant-admin:payroll:write",
    "商户工资单生成",
    "api",
    "merchant-admin",
    "生成和重算本店工资周期草稿"
  ),
  createPermission(
    "merchant-admin:payroll:publish",
    "商户工资单发布审批",
    "api",
    "merchant-admin",
    "发布、审批和锁定本店工资周期"
  ),
  createPermission(
    "merchant-admin:payroll:payout-record:write",
    "商户工资支付记录",
    "api",
    "merchant-admin",
    "记录本店工资单支付方式、凭证和备注"
  ),
  createPermission(
    "merchant-admin:payroll-dispute:resolve",
    "商户工资申诉处理",
    "api",
    "merchant-admin",
    "处理本店技师工资单申诉并重新发布确认"
  ),
  createPermission(
    "merchant-admin:payroll-adjustment:read",
    "商户工资调整读取",
    "api",
    "merchant-admin",
    "读取本店工资奖金、补贴和扣款调整申请"
  ),
  createPermission(
    "merchant-admin:payroll-adjustment:write",
    "商户工资调整提交",
    "api",
    "merchant-admin",
    "创建和提交本店工资奖金、补贴和扣款调整申请"
  ),
  createPermission(
    "merchant-admin:payroll-adjustment:approve",
    "商户工资调整审批",
    "api",
    "merchant-admin",
    "审批或驳回本店工资奖金、补贴和扣款调整申请"
  ),
  createPermission(
    "technician:payslip:read",
    "技师工资单读取",
    "api",
    "technician",
    "读取本人工资单、行项目和支付记录"
  ),
  createPermission(
    "technician:payslip:confirm",
    "技师工资单确认",
    "api",
    "technician",
    "确认本人工资单"
  ),
  createPermission(
    "technician:payslip:dispute",
    "技师工资单申诉",
    "api",
    "technician",
    "对本人工资单发起申诉"
  ),
  createPermission(
    "technician:payout-record:confirm",
    "技师工资收款确认",
    "api",
    "technician",
    "确认本人工资单支付记录已收款"
  ),
  createPermission(
    "backoffice:payroll:read",
    "运营工资单只读",
    "api",
    "backoffice",
    "读取全平台 Pay Run 和工资单汇总"
  ),
  createPermission(
    "merchant-admin:technicians:list",
    "商户后台技师列表",
    "api",
    "merchant-admin",
    "分页读取本店技师"
  ),
  createPermission(
    "merchant-admin:shop:read",
    "商户后台店铺资料",
    "api",
    "merchant-admin",
    "读取当前店铺资料"
  ),
  createPermission(
    "merchant-admin:shop:pricing-mode:read",
    "商户定价模式读取",
    "api",
    "merchant-admin",
    "读取当前店铺定价模式"
  ),
  createPermission(
    "merchant-admin:shop:pricing-mode:update",
    "商户定价模式切换",
    "api",
    "merchant-admin",
    "切换店铺定价或技师定价模式"
  ),
  createPermission(
    "technician:services:list",
    "技师服务列表",
    "api",
    "technician",
    "分页读取本人服务信息"
  ),
  createPermission(
    "technician:services:write",
    "技师服务维护",
    "api",
    "technician",
    "创建、更新和下架本人服务信息"
  ),

  createPermission("menu:dashboard", "仪表盘菜单", "menu", "menu", "显示仪表盘菜单"),
  createPermission("page:dashboard", "仪表盘页面", "page", "dashboard", "访问仪表盘页面"),
  createPermission("menu:client-app", "用户端菜单", "menu", "menu", "显示 C 端用户 App"),
  createPermission("menu:merchant-app", "商户端菜单", "menu", "menu", "显示商户端 App"),
  createPermission("menu:technician-app", "技师端菜单", "menu", "menu", "显示技师端 App"),
  createPermission("menu:admin-console", "运营后台菜单", "menu", "menu", "显示运营后台入口"),
  createPermission("menu:merchant-admin", "商户后台菜单", "menu", "menu", "显示商户后台入口"),
  createPermission("menu:technician-schedule", "技师日程菜单", "menu", "menu", "显示技师日程入口"),
  createPermission("menu:orders", "订单菜单", "menu", "menu", "显示订单入口"),
  createPermission("menu:messages", "消息菜单", "menu", "menu", "显示消息入口"),
  createPermission("menu:social", "Social 菜单", "menu", "menu", "显示 Social 入口"),
  createPermission("menu:settings", "设置菜单", "menu", "menu", "显示设置入口"),
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

const COMMON_PORTAL_MENU_PERMISSION_CODES = [
  "menu:orders",
  "menu:messages",
  "menu:social",
  "menu:settings"
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
  "menu:client-app",
  ...COMMON_PORTAL_MENU_PERMISSION_CODES,
  "booking:create",
  "order:list",
  "order:read",
  "order:cancel",
  "wallet:read",
  "wallet:ledger:list"
] as const satisfies readonly SystemPermissionCode[];

const SERVICE_PROVIDER_ORDER_PERMISSION_CODES = [
  ...AUTH_AND_DASHBOARD_PERMISSION_CODES,
  ...COMMON_PORTAL_MENU_PERMISSION_CODES,
  "order:list",
  "order:read",
  "order:confirm",
  "order:cancel",
  "order:start",
  "order:complete",
  "wallet:read",
  "wallet:ledger:list"
] as const satisfies readonly SystemPermissionCode[];

const REALTIME_USER_PERMISSION_CODES = [
  "conversation:list",
  "conversation:create",
  "message:list",
  "message:create",
  "message:read",
  "contact:list",
  "friend-request:list",
  "friend-request:create",
  "friend-request:respond",
  "social-post:list",
  "social-post:create",
  "follow:write",
  "notification:list",
  "notification:read",
  "realtime:unread-counts",
  "realtime:events"
] as const satisfies readonly SystemPermissionCode[];

const FINANCE_PERMISSION_CODES = [
  ...AUTH_AND_DASHBOARD_PERMISSION_CODES,
  "wallet:read",
  "wallet:ledger:list",
  "finance:ledger:list",
  "finance:reconciliation:list",
  "finance:reconciliation:export",
  "finance:fee-rule:list",
  "finance:fee-rule:preview",
  "finance:calculation-log:list",
  "menu:finance",
  "page:finance"
] as const satisfies readonly SystemPermissionCode[];

const BACKOFFICE_REAL_DATA_PERMISSION_CODES = [
  ...AUTH_AND_DASHBOARD_PERMISSION_CODES,
  "menu:admin-console",
  "backoffice:dashboard:read",
  "backoffice:orders:list",
  "backoffice:schedule:list",
  "backoffice:finance:list",
  "backoffice:finance:export",
  "backoffice:finance-order:read",
  "backoffice:payroll:read",
  "backoffice:technicians:list",
  "backoffice:shops:list",
  "menu:finance",
  "page:finance"
] as const satisfies readonly SystemPermissionCode[];

const MERCHANT_ADMIN_REAL_DATA_PERMISSION_CODES = [
  ...AUTH_AND_DASHBOARD_PERMISSION_CODES,
  "menu:merchant-app",
  "menu:merchant-admin",
  "merchant-admin:dashboard:read",
  "merchant-admin:orders:list",
  "merchant-admin:schedule:list",
  "merchant-admin:finance:list",
  "merchant-admin:finance:export",
  "merchant-admin:finance-order:read",
  "merchant-admin:finance-income-report:write",
  "merchant-admin:finance-rules:read",
  "merchant-admin:finance-rules:write",
  "merchant-admin:finance-rules:preview",
  "merchant-admin:compensation-profile:read",
  "merchant-admin:compensation-profile:write",
  "merchant-admin:compensation-profile:preview",
  "merchant-admin:payroll:read",
  "merchant-admin:payroll:write",
  "merchant-admin:payroll:publish",
  "merchant-admin:payroll:payout-record:write",
  "merchant-admin:payroll-dispute:resolve",
  "merchant-admin:payroll-adjustment:read",
  "merchant-admin:payroll-adjustment:write",
  "merchant-admin:payroll-adjustment:approve",
  "merchant-admin:technicians:list",
  "merchant-admin:shop:read",
  "merchant-admin:shop:pricing-mode:read",
  "merchant-admin:shop:pricing-mode:update",
  "menu:finance",
  "page:finance"
] as const satisfies readonly SystemPermissionCode[];

export const buildRolePermissionAssignments = (): Record<
  SystemRoleCode,
  SystemPermissionCode[]
> => ({
  admin: [...SYSTEM_PERMISSION_CODES],
  operator: [
    ...READ_ONLY_BACKOFFICE_PERMISSION_CODES,
    ...BACKOFFICE_REAL_DATA_PERMISSION_CODES,
    "finance:fee-rule:list",
    "finance:fee-rule:preview",
    "finance:calculation-log:list",
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
  finance: [
    ...FINANCE_PERMISSION_CODES,
    "backoffice:finance:list",
    "backoffice:finance:export",
    "backoffice:finance-order:read",
    "backoffice:payroll:read",
    "menu:admin-settings",
    "page:admin-settings"
  ],
  support: [
    ...AUTH_AND_DASHBOARD_PERMISSION_CODES,
    "menu:user-management",
    "page:user-management",
    "user:list",
    "user:update",
    "user:identity:list",
    "button:user:update"
  ],
  merchant_owner: [
    ...SERVICE_PROVIDER_ORDER_PERMISSION_CODES,
    ...REALTIME_USER_PERMISSION_CODES,
    ...MERCHANT_ADMIN_REAL_DATA_PERMISSION_CODES
  ],
  merchant_staff: [
    ...SERVICE_PROVIDER_ORDER_PERMISSION_CODES,
    ...REALTIME_USER_PERMISSION_CODES,
    ...MERCHANT_ADMIN_REAL_DATA_PERMISSION_CODES
  ],
  technician: [
    "menu:technician-app",
    "menu:technician-schedule",
    ...SERVICE_PROVIDER_ORDER_PERMISSION_CODES,
    ...REALTIME_USER_PERMISSION_CODES,
    "technician:services:list",
    "technician:services:write",
    "technician:payslip:read",
    "technician:payslip:confirm",
    "technician:payslip:dispute",
    "technician:payout-record:confirm"
  ],
  customer: [...CUSTOMER_BOOKING_PERMISSION_CODES, ...REALTIME_USER_PERMISSION_CODES],
  broker: [...AUTH_AND_DASHBOARD_PERMISSION_CODES],
  scout: [...AUTH_AND_DASHBOARD_PERMISSION_CODES],
  viewer: [...READ_ONLY_BACKOFFICE_PERMISSION_CODES]
});
