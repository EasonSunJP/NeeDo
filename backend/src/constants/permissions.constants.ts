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

export const CONTENT_PUBLICATION_PERMISSIONS = {
  userHomeRead: "page:backoffice-user-home-carousel",
  userHomeEdit: "button:backoffice-user-home-carousel-edit",
  userHomePublish: "button:backoffice-user-home-carousel-publish",
  affiliateAnnouncementRead: "page:backoffice-affiliate-announcement",
  affiliateAnnouncementEdit: "button:backoffice-affiliate-announcement-edit",
  affiliateAnnouncementPublish: "button:backoffice-affiliate-announcement-publish",
  affiliateNoticeRead: "page:backoffice-affiliate-notice-carousel",
  affiliateNoticeEdit: "button:backoffice-affiliate-notice-carousel-edit",
  affiliateNoticePublish: "button:backoffice-affiliate-notice-carousel-publish",
  contentMediaUpload: "button:backoffice-content-media-upload"
} as const;

export const EXCHANGE_PERMISSIONS = {
  postList: "exchange:posts:list",
  postDetail: "exchange:posts:detail",
  createDemand: "exchange:posts:create-demand",
  createIntelligence: "exchange:posts:create-intelligence",
  withdrawOwn: "exchange:posts:withdraw-own",
  commentList: "exchange:comments:list",
  commentCreate: "exchange:comments:create",
  likeWrite: "exchange:likes:write",
  shareCreate: "exchange:shares:create"
} as const;

export const EXCHANGE_REQUEST_FEE_PERMISSIONS = {
  read: "backoffice:exchange-request-fee:read",
  write: "backoffice:exchange-request-fee:write"
} as const;

export const SYSTEM_PERMISSIONS = [
  createPermission("auth:me", "查看当前账号", "api", "auth", "读取当前登录账号、身份、角色和权限"),
  createPermission(
    "auth:me:read",
    "读取当前商家店铺范围",
    "api",
    "auth",
    "读取并切换当前商家账号已授权的正式店铺范围"
  ),
  createPermission("auth:refresh", "刷新访问令牌", "api", "auth", "使用刷新令牌续期访问令牌"),
  createPermission("auth:logout", "退出登录", "api", "auth", "退出登录并吊销会话"),
  createPermission(
    "auth:google:read",
    "查看 Google 登录状态",
    "api",
    "auth",
    "查看当前账号的 Google 登录绑定状态"
  ),
  createPermission(
    "auth:google:link",
    "绑定 Google 登录",
    "api",
    "auth",
    "为当前账号绑定经过验证的 Google 登录"
  ),
  createPermission(
    "auth:google:unlink",
    "解除 Google 登录",
    "api",
    "auth",
    "解除当前账号的 Google 登录并吊销现有会话"
  ),
  createPermission(
    "auth:password:setup",
    "设置密码登录",
    "api",
    "auth",
    "为当前账号设置经过邮箱验证的登录密码"
  ),

  createPermission(
    "customer-profile:read",
    "查看个人资料",
    "api",
    "customer-profile",
    "读取当前客户个人资料"
  ),
  createPermission(
    "customer-profile:write",
    "编辑个人资料",
    "api",
    "customer-profile",
    "更新当前客户个人资料"
  ),
  createPermission(
    "technician-profile:read",
    "查看技师资料",
    "api",
    "technician-profile",
    "读取当前技师身份的个人资料"
  ),
  createPermission(
    "technician-profile:write",
    "编辑技师资料",
    "api",
    "technician-profile",
    "更新当前技师身份的个人资料"
  ),
  createPermission(
    "identity-application:own",
    "本人身份申请",
    "api",
    "identity-application",
    "创建、查看、更新、提交和撤回本人的身份申请"
  ),
  createPermission(
    "merchant:technician-application:read",
    "查看本店技师申请",
    "api",
    "identity-application",
    "查看申请加入当前店铺的技师资料"
  ),
  createPermission(
    "merchant:technician-application:review",
    "审核本店技师申请",
    "api",
    "identity-application",
    "批准或拒绝申请加入当前店铺的技师"
  ),
  createPermission(
    "merchant:technician-application:contact",
    "联系技师申请人",
    "api",
    "identity-application",
    "通过店铺服务账号联系技师申请人"
  ),
  createPermission(
    "merchant:technician-application:export",
    "导出技师申请简历",
    "api",
    "identity-application",
    "导出当前店铺收到的单份技师申请简历"
  ),
  createPermission(
    "ops:merchant-application:read",
    "查看店铺身份申请",
    "api",
    "identity-application",
    "查看运营范围内的店铺身份申请"
  ),
  createPermission(
    "ops:merchant-application:review",
    "审核店铺身份申请",
    "api",
    "identity-application",
    "批准或拒绝店铺身份申请"
  ),
  createPermission("contract:read", "查看身份合同", "api", "contract", "读取当前身份合同与规则"),
  createPermission(
    "contract:accept",
    "接受身份合同",
    "api",
    "contract",
    "记录当前用户对身份合同的确认与接受"
  ),
  createPermission(
    "bank-account:own",
    "本人受保护银行账户",
    "api",
    "bank-account",
    "写入并查看掩码化的本人银行账户"
  ),
  createPermission(
    "identity-application-media:sensitive-read",
    "查看身份申请敏感资料",
    "api",
    "identity-application",
    "在审核范围内查看身份申请证件与照片"
  ),
  createPermission(
    "identity-application:purge",
    "执行身份申请数据清理",
    "api",
    "identity-application",
    "执行并审计到期身份申请敏感数据清理"
  ),

  createPermission("user:list", "用户列表", "api", "user", "分页查看用户列表"),
  createPermission("user:create", "创建用户", "api", "user", "创建后台或业务用户"),
  createPermission("user:update", "更新用户", "api", "user", "编辑用户基础资料"),
  createPermission("user:delete", "删除用户", "api", "user", "软删除用户"),
  createPermission("user:assign-role", "分配用户角色", "api", "user", "为用户分配角色"),
  createPermission("user:status:update", "更新用户状态", "api", "user", "启用或禁用用户"),
  createPermission(
    "user:test-account:update",
    "更新测试账号分类",
    "api",
    "user",
    "切换测试账号分类并审计双币种资金边界"
  ),
  createPermission("user:identity:list", "用户身份列表", "api", "user", "查看用户身份"),
  createPermission("user:identity:switch", "切换用户身份", "api", "user", "切换当前用户身份"),
  createPermission("page:user-management", "用户管理页面", "page", "user", "访问用户管理页面"),
  createPermission("button:user:create", "创建用户按钮", "button", "user", "显示创建用户操作"),
  createPermission("button:user:update", "更新用户按钮", "button", "user", "显示更新用户操作"),
  createPermission(
    "button:user:test-account:update",
    "测试账号分类按钮",
    "button",
    "user",
    "显示测试账号分类操作"
  ),
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
  createPermission(
    "merchant-admin:order-payment:write",
    "商户线下收款维护",
    "api",
    "order",
    "确认或标记退款本店订单的到店及银行转账收款"
  ),
  createPermission(
    "backoffice:order-payment:write",
    "运营线下收款维护",
    "api",
    "order",
    "运营确认或标记退款订单的到店及银行转账收款"
  ),

  createPermission("conversation:list", "会话列表", "api", "im", "分页查看 IM 会话"),
  createPermission("conversation:create", "创建会话", "api", "im", "创建 IM 单聊或群聊会话"),
  createPermission("message:list", "消息历史", "api", "im", "分页查看会话消息历史"),
  createPermission("message:create", "发送消息", "api", "im", "发送 IM 消息"),
  createPermission("message:recall", "撤回消息", "api", "im", "在正式时限内撤回本人发送的 IM 消息"),
  createPermission("message:react", "回应消息", "api", "im", "添加或移除 IM 消息表情回应"),
  createPermission("message:forward", "转发聊天记录", "api", "im", "创建并投递正式聊天记录包"),
  createPermission("message:favorite", "收藏聊天记录", "api", "im", "创建、查看和移除自己的聊天记录收藏"),
  createPermission("message:translate", "翻译消息", "api", "im", "翻译当前身份可见的 IM 消息"),
  createPermission("message:read", "已读消息", "api", "im", "标记会话消息已读"),
  createPermission("contact:list", "联系人列表", "api", "im", "分页查看联系人"),
  createPermission("contact:block", "联系人拉黑", "api", "im", "拉黑或解除拉黑自己的联系人"),
  createPermission("contact:delete", "联系人删除", "api", "im", "软删除当前账号自己的联系人关系"),
  createPermission("friend-request:list", "好友申请列表", "api", "im", "分页查看好友申请"),
  createPermission("friend-request:create", "创建好友申请", "api", "im", "发起好友申请"),
  createPermission("friend-request:respond", "处理好友申请", "api", "im", "接受或拒绝好友申请"),
  createPermission("social-post:list", "动态列表", "api", "social", "分页查看社交动态"),
  createPermission("social-post:create", "发布动态", "api", "social", "发布基础社交动态"),
  createPermission("social-post:interact", "动态互动", "api", "social", "点赞、收藏、记录浏览并向好友转发动态"),
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
    "wallet:adjustment:create",
    "提交钱包申请",
    "api",
    "wallet",
    "提交 NDP 充值或提现申请"
  ),
  createPermission(
    "wallet:adjustment:list",
    "钱包申请记录",
    "api",
    "wallet",
    "分页查看本人或本店的 NDP 申请"
  ),
  createPermission(
    "backoffice:wallet-adjustment:list",
    "钱包申请审核列表",
    "api",
    "finance",
    "分页查看全平台 NDP 充值提现申请"
  ),
  createPermission(
    "backoffice:wallet-adjustment:review",
    "审核钱包申请",
    "api",
    "finance",
    "批准或拒绝 NDP 充值提现申请"
  ),
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
    "backoffice:platform-fee-policy:read",
    "运营后台平台费策略读取",
    "api",
    "backoffice",
    "读取全局平台费与店铺收费策略"
  ),
  createPermission(
    "backoffice:platform-fee-policy:write",
    "运营后台平台费策略管理",
    "api",
    "backoffice",
    "修改全局平台费金额与店铺收费状态"
  ),
  createPermission(
    "backoffice:order-acceptance-pause:read",
    "运营接单暂停读取",
    "api",
    "backoffice",
    "分页读取集团和店铺接单暂停记录"
  ),
  createPermission(
    "backoffice:order-acceptance-pause:write",
    "运营接单暂停管理",
    "api",
    "backoffice",
    "创建或解除集团和店铺接单暂停"
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
    "backoffice:merchant-accounts:list",
    "运营后台商家账户列表",
    "api",
    "backoffice",
    "分页读取商家集团和独立店铺账户"
  ),
  createPermission(
    "backoffice:merchant-accounts:read",
    "运营后台商家账户详情",
    "api",
    "backoffice",
    "读取商家集团、店铺、计费与封号详情"
  ),
  createPermission(
    "backoffice:merchant-accounts:manage",
    "运营后台商家账户管理",
    "api",
    "backoffice",
    "管理集团从属关系和账户资料"
  ),
  createPermission(
    "backoffice:saas-billing:read",
    "运营后台 SaaS 计费读取",
    "api",
    "backoffice",
    "读取试用、计费档案、账单与付款记录"
  ),
  createPermission(
    "backoffice:saas-billing:write",
    "运营后台 SaaS 计费管理",
    "api",
    "backoffice",
    "修改计费周期、金额、试用期限和付款责任"
  ),
  createPermission(
    "backoffice:saas-payment:review",
    "运营后台 SaaS 付款审核",
    "api",
    "backoffice",
    "审核人工付款并更新服务有效期"
  ),
  createPermission(
    "backoffice:entity-suspension:write",
    "运营后台账户封号",
    "api",
    "backoffice",
    "对商家集团或店铺执行人工封号"
  ),
  createPermission(
    "backoffice:entity-suspension:release",
    "运营后台账户解封",
    "api",
    "backoffice",
    "解除商家集团或店铺封号"
  ),
  createPermission(
    "backoffice:entity-dissolution:write",
    "运营后台账户解散",
    "api",
    "backoffice",
    "软删除商家集团或店铺账户"
  ),
  createPermission(
    "backoffice:shops:write",
    "运营店铺维护",
    "api",
    "backoffice",
    "创建、更新、审核和软删除店铺及店铺账号"
  ),
  createPermission(
    "backoffice:technicians:write",
    "运营技师维护",
    "api",
    "backoffice",
    "更新、归属、审核和软删除技师"
  ),
  createPermission(
    "backoffice:customers:list",
    "运营客户列表",
    "api",
    "backoffice",
    "分页读取客户资料"
  ),
  createPermission(
    "backoffice:customers:write",
    "运营客户维护",
    "api",
    "backoffice",
    "更新和软删除客户资料"
  ),
  createPermission(
    "backoffice:services:list",
    "运营服务列表",
    "api",
    "backoffice",
    "分页读取店铺服务"
  ),
  createPermission(
    "backoffice:services:write",
    "运营服务维护",
    "api",
    "backoffice",
    "创建、更新和软删除店铺服务"
  ),
  createPermission(
    "merchant-admin:dashboard:read",
    "商户后台 Dashboard",
    "api",
    "merchant-admin",
    "读取商户后台真实指标"
  ),
  createPermission(
    "merchant-admin:platform-fee-policy:read",
    "商户平台费策略读取",
    "api",
    "merchant-admin",
    "读取当前商户身份可管理店铺的平台费策略"
  ),
  createPermission(
    "merchant-admin:platform-fee-policy:write",
    "商户平台费承担者管理",
    "api",
    "merchant-admin",
    "设置当前商户身份可管理店铺的平台费承担者"
  ),
  createPermission(
    "merchant-admin:order-acceptance-pause:read",
    "商户接单暂停读取",
    "api",
    "merchant-admin",
    "读取当前商户或店铺身份可见的接单暂停记录"
  ),
  createPermission(
    "merchant-admin:order-acceptance-pause:write",
    "商户接单暂停管理",
    "api",
    "merchant-admin",
    "在当前商户或店铺身份范围内创建或解除接单暂停"
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
    "schedule:slots:list",
    "正式排班列表",
    "api",
    "schedule",
    "分页读取当前身份范围内的正式排班与可预约库存"
  ),
  createPermission(
    "schedule:slots:write",
    "正式排班维护",
    "api",
    "schedule",
    "创建、更新、阻塞和软删除当前身份范围内的排班槽位"
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
    "merchant-admin:technicians:write",
    "商户技师维护",
    "api",
    "merchant-admin",
    "更新、审核和移除本店技师"
  ),
  createPermission(
    "merchant-admin:employee-affiliation:read",
    "商户员工从属读取",
    "api",
    "merchant-admin",
    "按当前店铺读取员工身份和在职从属关系"
  ),
  createPermission(
    "merchant-admin:employee-affiliation:write",
    "商户员工从属维护",
    "api",
    "merchant-admin",
    "按当前店铺创建、更新或结束员工从属关系"
  ),
  createPermission(
    "merchant-admin:customers:list",
    "商户客户列表",
    "api",
    "merchant-admin",
    "分页读取与本店有预约关系的客户"
  ),
  createPermission(
    "shop.member.view",
    "店铺会员读取",
    "api",
    "shop-membership",
    "读取当前店铺的会员关系、会员卡和基础总览"
  ),
  createPermission(
    "shop.member.create",
    "店铺会员开通",
    "api",
    "shop-membership",
    "为与当前店铺存在正式预约关系的客户开通店铺会员"
  ),
  createPermission(
    "shop.member.analytics.view",
    "店铺会员分析读取",
    "api",
    "shop-membership",
    "读取当前店铺的会员与会员卡状态分析"
  ),
  createPermission(
    "shop.member.operation_log.view",
    "店铺会员活动读取",
    "api",
    "shop-membership",
    "读取当前店铺的会员操作活动记录"
  ),
  createPermission(
    "shop.member.card_plan.view",
    "会员卡方案读取",
    "api",
    "shop-membership",
    "读取当前店铺的会员卡方案、版本和 NDP 返点规则"
  ),
  createPermission(
    "shop.member.card_plan.manage",
    "会员卡方案维护",
    "api",
    "shop-membership",
    "创建和编辑当前店铺的会员卡方案草稿并进行成本试算"
  ),
  createPermission(
    "shop.member.card_plan.publish",
    "会员卡方案发布",
    "api",
    "shop-membership",
    "发布或停用当前店铺的不可变会员卡方案版本"
  ),
  createPermission(
    "shop.member.card.issue",
    "店铺会员卡开卡",
    "api",
    "shop-membership",
    "按当前店铺的已发布卡方案为有效会员正式开卡"
  ),
  createPermission(
    "shop.member.card.adjust.request",
    "店铺会员卡调整申请",
    "api",
    "shop-membership",
    "为当前店铺会员卡提交需要客户确认的本金或次数调整申请"
  ),
  createPermission(
    "page:backoffice-membership-reward-fee",
    "会员返点平台费读取",
    "page",
    "finance",
    "读取会员 NDP 返点平台费当前版本和历史"
  ),
  createPermission(
    "button:backoffice-membership-reward-fee-create",
    "会员返点平台费版本创建",
    "button",
    "finance",
    "创建会员 NDP 返点平台费的不可变版本"
  ),
  createPermission(
    "merchant-admin:services:list",
    "商户服务列表",
    "api",
    "merchant-admin",
    "分页读取本店服务"
  ),
  createPermission(
    "merchant-admin:services:write",
    "商户服务维护",
    "api",
    "merchant-admin",
    "创建、更新和软删除本店服务"
  ),
  createPermission(
    "merchant-admin:shop:read",
    "商户后台店铺资料",
    "api",
    "merchant-admin",
    "读取当前店铺资料"
  ),
  createPermission(
    "merchant-admin:shop:write",
    "商户后台店铺资料维护",
    "api",
    "merchant-admin",
    "更新当前店铺的基础资料"
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
  createPermission("page:admin-settings", "后台设置页面", "page", "dashboard", "访问后台设置页面"),
  createPermission("menu:affiliate", "联盟营销", "menu", "affiliate", "显示用户联盟营销入口"),
  createPermission(
    "page:affiliate-marketplace",
    "联盟任务大厅",
    "page",
    "affiliate",
    "访问联盟任务大厅和本人推广数据"
  ),
  createPermission(
    "button:affiliate-claim",
    "领取联盟任务",
    "button",
    "affiliate",
    "显示领取有效联盟任务的操作"
  ),
  createPermission(
    "page:affiliate-profile",
    "联盟营销资料",
    "page",
    "affiliate",
    "访问本人联盟营销公开资料"
  ),
  createPermission(
    "button:affiliate-profile-edit",
    "编辑联盟营销资料",
    "button",
    "affiliate",
    "编辑本人联盟营销资料和外部平台主页链接"
  ),
  createPermission("page:affiliate-alliance", "联盟", "page", "affiliate", "访问本人当前联盟"),
  createPermission(
    "button:affiliate-alliance-create",
    "创建联盟",
    "button",
    "affiliate",
    "创建本人拥有的联盟"
  ),
  createPermission(
    "affiliate-alliance:members:list",
    "查看联盟成员",
    "api",
    "affiliate",
    "查看本人负责联盟的成员列表"
  ),
  createPermission(
    "affiliate-alliance:candidates:list",
    "查看联盟邀请候选",
    "api",
    "affiliate",
    "查看本人负责联盟的双向好友候选"
  ),
  createPermission(
    "affiliate-alliance:invitations:list",
    "查看联盟邀请",
    "api",
    "affiliate",
    "查看本人负责联盟发出的邀请或本人收到的邀请"
  ),
  createPermission(
    "button:affiliate-alliance-invite",
    "邀请联盟成员",
    "button",
    "affiliate",
    "向符合条件的双向好友发送联盟邀请"
  ),
  createPermission(
    "button:affiliate-alliance-invitation-respond",
    "响应联盟邀请",
    "button",
    "affiliate",
    "接受或拒绝本人收到的联盟邀请"
  ),
  createPermission(
    "menu:merchant-affiliate",
    "商户联盟营销",
    "menu",
    "merchant-affiliate",
    "显示商户或店铺联盟营销入口"
  ),
  createPermission(
    "page:merchant-affiliate-task",
    "商户联盟任务",
    "page",
    "merchant-affiliate",
    "访问当前商户或店铺范围的联盟任务"
  ),
  createPermission(
    "button:merchant-affiliate-task-create",
    "创建联盟任务",
    "button",
    "merchant-affiliate",
    "显示创建联盟任务操作"
  ),
  createPermission(
    "button:merchant-affiliate-task-submit",
    "提交联盟任务",
    "button",
    "merchant-affiliate",
    "显示提交发布并冻结预算操作"
  ),
  createPermission(
    "button:merchant-affiliate-task-pause",
    "暂停联盟任务",
    "button",
    "merchant-affiliate",
    "显示暂停或恢复联盟任务操作"
  ),
  createPermission(
    "menu:backoffice-affiliate",
    "运营联盟营销",
    "menu",
    "backoffice-affiliate",
    "显示运营后台联盟营销入口"
  ),
  createPermission(
    "page:backoffice-affiliate",
    "运营联盟营销页面",
    "page",
    "backoffice-affiliate",
    "访问全平台联盟营销数据"
  ),
  createPermission(
    "page:backoffice-affiliate-fee-rule",
    "联盟营销抽成规则",
    "page",
    "backoffice-affiliate",
    "分页查看联盟营销平台抽成规则及历史版本"
  ),
  createPermission(
    "button:backoffice-affiliate-fee-rule-create",
    "新建联盟营销抽成版本",
    "button",
    "backoffice-affiliate",
    "创建全局或店铺范围的联盟营销平台抽成规则版本"
  ),
  createPermission(
    "button:backoffice-affiliate-review",
    "审核联盟任务",
    "button",
    "backoffice-affiliate",
    "显示联盟任务审核操作"
  ),
  createPermission(
    "button:backoffice-affiliate-suspend",
    "暂停联盟任务",
    "button",
    "backoffice-affiliate",
    "显示运营暂停联盟任务操作"
  ),
  createPermission(
    "button:backoffice-affiliate-reversal",
    "冲正联盟返点",
    "button",
    "backoffice-affiliate",
    "显示受审计的联盟返点冲正操作"
  ),
  createPermission(
    "button:backoffice-affiliate-export",
    "导出联盟数据",
    "button",
    "backoffice-affiliate",
    "显示联盟营销服务端导出操作"
  ),
  createPermission(
    CONTENT_PUBLICATION_PERMISSIONS.userHomeRead,
    "用户首页轮播读取",
    "page",
    "content-publication",
    "查看用户首页轮播版本和预览"
  ),
  createPermission(
    CONTENT_PUBLICATION_PERMISSIONS.userHomeEdit,
    "用户首页轮播编辑",
    "button",
    "content-publication",
    "创建和编辑用户首页轮播草稿"
  ),
  createPermission(
    CONTENT_PUBLICATION_PERMISSIONS.userHomePublish,
    "用户首页轮播发布",
    "button",
    "content-publication",
    "发布、定时、停用和回滚用户首页轮播"
  ),
  createPermission(
    CONTENT_PUBLICATION_PERMISSIONS.affiliateAnnouncementRead,
    "联盟公告读取",
    "page",
    "content-publication",
    "查看联盟营销正式公告版本和预览"
  ),
  createPermission(
    CONTENT_PUBLICATION_PERMISSIONS.affiliateAnnouncementEdit,
    "联盟公告编辑",
    "button",
    "content-publication",
    "创建和编辑联盟营销公告草稿"
  ),
  createPermission(
    CONTENT_PUBLICATION_PERMISSIONS.affiliateAnnouncementPublish,
    "联盟公告发布",
    "button",
    "content-publication",
    "发布、定时、停用和回滚联盟营销公告"
  ),
  createPermission(
    CONTENT_PUBLICATION_PERMISSIONS.affiliateNoticeRead,
    "联盟公告轮播读取",
    "page",
    "content-publication",
    "查看联盟营销公告轮播版本和预览"
  ),
  createPermission(
    CONTENT_PUBLICATION_PERMISSIONS.affiliateNoticeEdit,
    "联盟公告轮播编辑",
    "button",
    "content-publication",
    "创建和编辑联盟营销公告轮播草稿"
  ),
  createPermission(
    CONTENT_PUBLICATION_PERMISSIONS.affiliateNoticePublish,
    "联盟公告轮播发布",
    "button",
    "content-publication",
    "发布、定时、停用和回滚联盟营销公告轮播"
  ),
  createPermission(
    CONTENT_PUBLICATION_PERMISSIONS.contentMediaUpload,
    "内容媒体上传",
    "button",
    "content-publication",
    "上传正式内容发布媒体资源"
  ),
  createPermission(
    EXCHANGE_PERMISSIONS.postList,
    "需求情报列表",
    "api",
    "exchange",
    "分页读取正式需求与情报"
  ),
  createPermission(
    EXCHANGE_PERMISSIONS.postDetail,
    "需求情报详情",
    "api",
    "exchange",
    "读取正式需求或情报详情"
  ),
  createPermission(
    EXCHANGE_PERMISSIONS.createDemand,
    "发布需求",
    "api",
    "exchange",
    "以当前顾客身份发布正式需求"
  ),
  createPermission(
    EXCHANGE_PERMISSIONS.createIntelligence,
    "发布情报",
    "api",
    "exchange",
    "以当前技师或店铺身份发布正式情报"
  ),
  createPermission(
    EXCHANGE_PERMISSIONS.withdrawOwn,
    "撤回本人发布",
    "api",
    "exchange",
    "撤回当前账号发布的正式需求或情报"
  ),
  createPermission(
    EXCHANGE_PERMISSIONS.commentList,
    "需求情报评论列表",
    "api",
    "exchange",
    "分页读取正式需求与情报评论"
  ),
  createPermission(
    EXCHANGE_PERMISSIONS.commentCreate,
    "需求情报评论",
    "api",
    "exchange",
    "以当前身份发布正式评论"
  ),
  createPermission(
    EXCHANGE_PERMISSIONS.likeWrite,
    "需求情报点赞",
    "api",
    "exchange",
    "写入或撤销当前账号的正式点赞"
  ),
  createPermission(
    EXCHANGE_PERMISSIONS.shareCreate,
    "需求情报分享",
    "api",
    "exchange",
    "记录当前账号已完成的正式分享"
  ),
  createPermission(
    EXCHANGE_REQUEST_FEE_PERMISSIONS.read,
    "需求发布费用读取",
    "api",
    "exchange",
    "读取需求发布费用的当前规则与版本历史"
  ),
  createPermission(
    EXCHANGE_REQUEST_FEE_PERMISSIONS.write,
    "需求发布费用版本管理",
    "api",
    "exchange",
    "创建需求发布费用的乐观锁版本"
  )
] as const satisfies readonly SystemPermissionDefinition[];

export type SystemPermissionCode = (typeof SYSTEM_PERMISSIONS)[number]["code"];

export const SYSTEM_PERMISSION_CODES = SYSTEM_PERMISSIONS.map((permission) => permission.code);

const EXCHANGE_COMMON_PERMISSION_CODES = [
  EXCHANGE_PERMISSIONS.postList,
  EXCHANGE_PERMISSIONS.postDetail,
  EXCHANGE_PERMISSIONS.commentList,
  EXCHANGE_PERMISSIONS.commentCreate,
  EXCHANGE_PERMISSIONS.likeWrite,
  EXCHANGE_PERMISSIONS.shareCreate
] as const satisfies readonly SystemPermissionCode[];

const EXCHANGE_DEMAND_PUBLISHER_PERMISSION_CODES = [
  ...EXCHANGE_COMMON_PERMISSION_CODES,
  EXCHANGE_PERMISSIONS.createDemand,
  EXCHANGE_PERMISSIONS.withdrawOwn
] as const satisfies readonly SystemPermissionCode[];

const EXCHANGE_INTELLIGENCE_PUBLISHER_PERMISSION_CODES = [
  ...EXCHANGE_COMMON_PERMISSION_CODES,
  EXCHANGE_PERMISSIONS.createIntelligence,
  EXCHANGE_PERMISSIONS.withdrawOwn
] as const satisfies readonly SystemPermissionCode[];

const EXCHANGE_REQUEST_FEE_READ_PERMISSION_CODES = [
  EXCHANGE_REQUEST_FEE_PERMISSIONS.read
] as const satisfies readonly SystemPermissionCode[];

const EXCHANGE_REQUEST_FEE_WRITE_PERMISSION_CODES = [
  ...EXCHANGE_REQUEST_FEE_READ_PERMISSION_CODES,
  EXCHANGE_REQUEST_FEE_PERMISSIONS.write
] as const satisfies readonly SystemPermissionCode[];

const AUTH_AND_DASHBOARD_PERMISSION_CODES = [
  "auth:me",
  "auth:me:read",
  "auth:refresh",
  "auth:logout",
  "auth:google:read",
  "auth:google:link",
  "auth:google:unlink",
  "auth:password:setup",
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
  "customer-profile:read",
  "customer-profile:write",
  "booking:create",
  "order:list",
  "order:read",
  "order:cancel",
  "wallet:read",
  "wallet:ledger:list",
  "wallet:adjustment:create",
  "wallet:adjustment:list"
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
  "wallet:ledger:list",
  "wallet:adjustment:create",
  "wallet:adjustment:list",
  "schedule:slots:list",
  "schedule:slots:write"
] as const satisfies readonly SystemPermissionCode[];

const REALTIME_USER_PERMISSION_CODES = [
  "conversation:list",
  "conversation:create",
  "message:list",
  "message:create",
  "message:recall",
  "message:react",
  "message:forward",
  "message:favorite",
  "message:translate",
  "message:read",
  "contact:list",
  "contact:block",
  "contact:delete",
  "friend-request:list",
  "friend-request:create",
  "friend-request:respond",
  "social-post:list",
  "social-post:create",
  "social-post:interact",
  "follow:write",
  "notification:list",
  "notification:read",
  "realtime:unread-counts",
  "realtime:events"
] as const satisfies readonly SystemPermissionCode[];

const IDENTITY_APPLICATION_APPLICANT_PERMISSION_CODES = [
  "identity-application:own",
  "contract:read",
  "contract:accept",
  "bank-account:own"
] as const satisfies readonly SystemPermissionCode[];

const MERCHANT_TECHNICIAN_APPLICATION_PERMISSION_CODES = [
  "merchant:technician-application:read",
  "merchant:technician-application:review",
  "merchant:technician-application:contact",
  "merchant:technician-application:export",
  "identity-application-media:sensitive-read"
] as const satisfies readonly SystemPermissionCode[];

const OPERATIONS_MERCHANT_APPLICATION_PERMISSION_CODES = [
  "ops:merchant-application:read",
  "ops:merchant-application:review",
  "identity-application-media:sensitive-read"
] as const satisfies readonly SystemPermissionCode[];

const FINANCE_PERMISSION_CODES = [
  ...AUTH_AND_DASHBOARD_PERMISSION_CODES,
  "wallet:read",
  "wallet:ledger:list",
  "finance:ledger:list",
  "finance:reconciliation:list",
  "finance:reconciliation:export",
  "backoffice:wallet-adjustment:list",
  "backoffice:wallet-adjustment:review",
  "finance:fee-rule:list",
  "finance:fee-rule:preview",
  "finance:calculation-log:list",
  "backoffice:platform-fee-policy:read",
  "page:backoffice-membership-reward-fee",
  "button:backoffice-membership-reward-fee-create",
  "menu:finance",
  "page:finance"
] as const satisfies readonly SystemPermissionCode[];

const BACKOFFICE_REAL_DATA_PERMISSION_CODES = [
  ...AUTH_AND_DASHBOARD_PERMISSION_CODES,
  "menu:admin-console",
  "backoffice:dashboard:read",
  "backoffice:platform-fee-policy:read",
  "backoffice:platform-fee-policy:write",
  "backoffice:order-acceptance-pause:read",
  "backoffice:order-acceptance-pause:write",
  "backoffice:orders:list",
  "backoffice:schedule:list",
  "backoffice:finance:list",
  "backoffice:finance:export",
  "backoffice:finance-order:read",
  "backoffice:order-payment:write",
  "backoffice:wallet-adjustment:list",
  "backoffice:wallet-adjustment:review",
  "backoffice:payroll:read",
  "backoffice:technicians:list",
  "backoffice:technicians:write",
  "backoffice:shops:list",
  "backoffice:shops:write",
  "backoffice:merchant-accounts:list",
  "backoffice:merchant-accounts:read",
  "backoffice:merchant-accounts:manage",
  "backoffice:saas-billing:read",
  "backoffice:saas-billing:write",
  "backoffice:saas-payment:review",
  "backoffice:entity-suspension:write",
  "backoffice:entity-suspension:release",
  "backoffice:entity-dissolution:write",
  "backoffice:customers:list",
  "backoffice:customers:write",
  "backoffice:services:list",
  "backoffice:services:write",
  "menu:finance",
  "page:finance"
] as const satisfies readonly SystemPermissionCode[];

const MERCHANT_ADMIN_REAL_DATA_PERMISSION_CODES = [
  ...AUTH_AND_DASHBOARD_PERMISSION_CODES,
  "menu:merchant-app",
  "menu:merchant-admin",
  "merchant-admin:dashboard:read",
  "merchant-admin:platform-fee-policy:read",
  "merchant-admin:platform-fee-policy:write",
  "merchant-admin:order-acceptance-pause:read",
  "merchant-admin:order-acceptance-pause:write",
  "merchant-admin:orders:list",
  "merchant-admin:schedule:list",
  "merchant-admin:finance:list",
  "merchant-admin:finance:export",
  "merchant-admin:finance-order:read",
  "merchant-admin:finance-income-report:write",
  "merchant-admin:order-payment:write",
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
  "merchant-admin:technicians:write",
  "merchant-admin:employee-affiliation:read",
  "merchant-admin:employee-affiliation:write",
  "merchant-admin:customers:list",
  "shop.member.view",
  "shop.member.card_plan.view",
  "merchant-admin:services:list",
  "merchant-admin:services:write",
  "merchant-admin:shop:read",
  "merchant-admin:shop:write",
  "merchant-admin:shop:pricing-mode:read",
  "merchant-admin:shop:pricing-mode:update",
  "menu:finance",
  "page:finance"
] as const satisfies readonly SystemPermissionCode[];

const MERCHANT_OWNER_MEMBERSHIP_PERMISSION_CODES = [
  "shop.member.create",
  "shop.member.analytics.view",
  "shop.member.operation_log.view",
  "shop.member.card_plan.manage",
  "shop.member.card_plan.publish",
  "shop.member.card.issue",
  "shop.member.card.adjust.request"
] as const satisfies readonly SystemPermissionCode[];

const AFFILIATE_ENTRY_PERMISSION_CODES = [
  "menu:affiliate"
] as const satisfies readonly SystemPermissionCode[];

const ACTIVATED_AFFILIATE_PERMISSION_CODES = [
  "menu:affiliate",
  "page:affiliate-marketplace",
  "button:affiliate-claim",
  "page:affiliate-profile",
  "button:affiliate-profile-edit",
  "page:affiliate-alliance",
  "button:affiliate-alliance-create",
  "affiliate-alliance:members:list",
  "affiliate-alliance:candidates:list",
  "affiliate-alliance:invitations:list",
  "button:affiliate-alliance-invite",
  "button:affiliate-alliance-invitation-respond"
] as const satisfies readonly SystemPermissionCode[];

const MERCHANT_AFFILIATE_PERMISSION_CODES = [
  "menu:merchant-affiliate",
  "page:merchant-affiliate-task",
  "button:merchant-affiliate-task-create",
  "button:merchant-affiliate-task-submit",
  "button:merchant-affiliate-task-pause"
] as const satisfies readonly SystemPermissionCode[];

const BACKOFFICE_AFFILIATE_READ_PERMISSION_CODES = [
  "menu:backoffice-affiliate",
  "page:backoffice-affiliate"
] as const satisfies readonly SystemPermissionCode[];

const BACKOFFICE_AFFILIATE_FEE_RULE_READ_PERMISSION_CODES = [
  "page:backoffice-affiliate-fee-rule"
] as const satisfies readonly SystemPermissionCode[];

const BACKOFFICE_AFFILIATE_FEE_RULE_WRITE_PERMISSION_CODES = [
  ...BACKOFFICE_AFFILIATE_FEE_RULE_READ_PERMISSION_CODES,
  "button:backoffice-affiliate-fee-rule-create"
] as const satisfies readonly SystemPermissionCode[];

const BACKOFFICE_AFFILIATE_OPERATOR_PERMISSION_CODES = [
  ...BACKOFFICE_AFFILIATE_READ_PERMISSION_CODES,
  "button:backoffice-affiliate-review",
  "button:backoffice-affiliate-suspend",
  "button:backoffice-affiliate-export"
] as const satisfies readonly SystemPermissionCode[];

const BACKOFFICE_AFFILIATE_FINANCE_PERMISSION_CODES = [
  ...BACKOFFICE_AFFILIATE_READ_PERMISSION_CODES,
  "button:backoffice-affiliate-reversal",
  "button:backoffice-affiliate-export"
] as const satisfies readonly SystemPermissionCode[];

const CONTENT_PUBLICATION_READ_PERMISSION_CODES = [
  CONTENT_PUBLICATION_PERMISSIONS.userHomeRead,
  CONTENT_PUBLICATION_PERMISSIONS.affiliateAnnouncementRead,
  CONTENT_PUBLICATION_PERMISSIONS.affiliateNoticeRead
] as const satisfies readonly SystemPermissionCode[];

const CONTENT_PUBLICATION_OPERATION_PERMISSION_CODES = [
  ...CONTENT_PUBLICATION_READ_PERMISSION_CODES,
  CONTENT_PUBLICATION_PERMISSIONS.userHomeEdit,
  CONTENT_PUBLICATION_PERMISSIONS.userHomePublish,
  CONTENT_PUBLICATION_PERMISSIONS.affiliateAnnouncementEdit,
  CONTENT_PUBLICATION_PERMISSIONS.affiliateAnnouncementPublish,
  CONTENT_PUBLICATION_PERMISSIONS.affiliateNoticeEdit,
  CONTENT_PUBLICATION_PERMISSIONS.affiliateNoticePublish,
  CONTENT_PUBLICATION_PERMISSIONS.contentMediaUpload
] as const satisfies readonly SystemPermissionCode[];

export const buildRolePermissionAssignments = (): Record<
  SystemRoleCode,
  SystemPermissionCode[]
> => ({
  admin: [...SYSTEM_PERMISSION_CODES],
  operator: [
    ...READ_ONLY_BACKOFFICE_PERMISSION_CODES,
    ...BACKOFFICE_REAL_DATA_PERMISSION_CODES,
    ...AFFILIATE_ENTRY_PERMISSION_CODES,
    ...BACKOFFICE_AFFILIATE_OPERATOR_PERMISSION_CODES,
    ...BACKOFFICE_AFFILIATE_FEE_RULE_READ_PERMISSION_CODES,
    ...EXCHANGE_REQUEST_FEE_READ_PERMISSION_CODES,
    ...CONTENT_PUBLICATION_OPERATION_PERMISSION_CODES,
    ...OPERATIONS_MERCHANT_APPLICATION_PERMISSION_CODES,
    "page:backoffice-membership-reward-fee",
    "finance:fee-rule:list",
    "finance:fee-rule:preview",
    "finance:calculation-log:list",
    "user:create",
    "user:update",
    "user:status:update",
    "user:assign-role",
    "user:test-account:update",
    "button:user:create",
    "button:user:update",
    "button:user:disable",
    "button:user:assign-role",
    "button:user:test-account:update",
    "menu:admin-settings",
    "page:admin-settings"
  ],
  finance: [
    ...FINANCE_PERMISSION_CODES,
    ...AFFILIATE_ENTRY_PERMISSION_CODES,
    ...BACKOFFICE_AFFILIATE_FINANCE_PERMISSION_CODES,
    ...BACKOFFICE_AFFILIATE_FEE_RULE_WRITE_PERMISSION_CODES,
    ...EXCHANGE_REQUEST_FEE_WRITE_PERMISSION_CODES,
    "backoffice:finance:list",
    "backoffice:finance:export",
    "backoffice:finance-order:read",
    "backoffice:order-payment:write",
    "backoffice:payroll:read",
    "menu:admin-settings",
    "page:admin-settings"
  ],
  support: [
    ...AUTH_AND_DASHBOARD_PERMISSION_CODES,
    ...AFFILIATE_ENTRY_PERMISSION_CODES,
    "ops:merchant-application:read",
    "identity-application-media:sensitive-read",
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
    ...EXCHANGE_INTELLIGENCE_PUBLISHER_PERMISSION_CODES,
    EXCHANGE_PERMISSIONS.createDemand,
    ...MERCHANT_ADMIN_REAL_DATA_PERMISSION_CODES,
    ...MERCHANT_OWNER_MEMBERSHIP_PERMISSION_CODES,
    ...AFFILIATE_ENTRY_PERMISSION_CODES,
    ...MERCHANT_AFFILIATE_PERMISSION_CODES,
    ...IDENTITY_APPLICATION_APPLICANT_PERMISSION_CODES,
    ...MERCHANT_TECHNICIAN_APPLICATION_PERMISSION_CODES
  ],
  merchant_staff: [
    ...SERVICE_PROVIDER_ORDER_PERMISSION_CODES,
    ...REALTIME_USER_PERMISSION_CODES,
    ...EXCHANGE_INTELLIGENCE_PUBLISHER_PERMISSION_CODES,
    ...MERCHANT_ADMIN_REAL_DATA_PERMISSION_CODES,
    ...AFFILIATE_ENTRY_PERMISSION_CODES,
    ...MERCHANT_AFFILIATE_PERMISSION_CODES,
    ...IDENTITY_APPLICATION_APPLICANT_PERMISSION_CODES,
    ...MERCHANT_TECHNICIAN_APPLICATION_PERMISSION_CODES
  ],
  technician: [
    "menu:technician-app",
    "menu:technician-schedule",
    "technician-profile:read",
    "technician-profile:write",
    ...SERVICE_PROVIDER_ORDER_PERMISSION_CODES,
    ...REALTIME_USER_PERMISSION_CODES,
    ...EXCHANGE_INTELLIGENCE_PUBLISHER_PERMISSION_CODES,
    ...AFFILIATE_ENTRY_PERMISSION_CODES,
    ...IDENTITY_APPLICATION_APPLICANT_PERMISSION_CODES,
    "technician:services:list",
    "technician:services:write",
    "technician:payslip:read",
    "technician:payslip:confirm",
    "technician:payslip:dispute",
    "technician:payout-record:confirm"
  ],
  customer: [
    ...CUSTOMER_BOOKING_PERMISSION_CODES,
    ...REALTIME_USER_PERMISSION_CODES,
    ...EXCHANGE_DEMAND_PUBLISHER_PERMISSION_CODES,
    ...AFFILIATE_ENTRY_PERMISSION_CODES,
    ...IDENTITY_APPLICATION_APPLICANT_PERMISSION_CODES
  ],
  broker: [
    ...AUTH_AND_DASHBOARD_PERMISSION_CODES,
    ...AFFILIATE_ENTRY_PERMISSION_CODES,
    ...IDENTITY_APPLICATION_APPLICANT_PERMISSION_CODES
  ],
  scout: [
    ...AUTH_AND_DASHBOARD_PERMISSION_CODES,
    ...ACTIVATED_AFFILIATE_PERMISSION_CODES,
    ...IDENTITY_APPLICATION_APPLICANT_PERMISSION_CODES
  ],
  viewer: [
    ...READ_ONLY_BACKOFFICE_PERMISSION_CODES,
    ...AFFILIATE_ENTRY_PERMISSION_CODES,
    ...BACKOFFICE_AFFILIATE_READ_PERMISSION_CODES,
    ...BACKOFFICE_AFFILIATE_FEE_RULE_READ_PERMISSION_CODES,
    ...EXCHANGE_REQUEST_FEE_READ_PERMISSION_CODES,
    ...CONTENT_PUBLICATION_READ_PERMISSION_CODES
  ]
});
