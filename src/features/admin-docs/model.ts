export type AdminDocsSurface = "ops" | "merchant" | "afirieito";

export type AdminDocsMode = "operation" | "api";

export type ApiDocVisibilityTarget = "merchant" | "afirieito";

export type ApiDocMethod = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  purpose: string;
};

export type OperationDocSection = {
  id: string;
  title: string;
  summary: string;
  owner: string;
  steps: string[];
  checks: string[];
};

export type ApiDocItem = {
  id: string;
  title: string;
  group: string;
  summary: string;
  methods: ApiDocMethod[];
  auth: string;
  fields: string[];
};

export type ApiDocVisibility = Record<ApiDocItem["id"], Record<ApiDocVisibilityTarget, boolean>>;

export const apiDocItemsStorageKey = "needo.admin-docs.api-items.v1";
export const apiDocVisibilityStorageKey = "needo.admin-docs.api-visibility.v1";

export const operationDocSections: OperationDocSection[] = [
  {
    id: "daily-console",
    title: "后台日常处理流程",
    summary: "登录后先确认待处理事项，再进入订单、人员、门店、分销或公告模块处理本日任务。",
    owner: "产运 / 商户 / NDA 管理员",
    steps: ["确认顶部通知与待处理数字", "进入对应业务模块筛选今日任务", "打开详情核对资料、状态和责任人", "保存处理结果并检查列表状态是否同步"],
    checks: ["列表状态已刷新", "详情页记录了处理人和时间", "需要跨后台同步的事项已在对应后台可见"]
  },
  {
    id: "account-permission",
    title: "账号与权限维护",
    summary: "所有后台都按角色授权使用。新增账号后需要确认登录端、菜单权限、可查看数据范围和停用策略。",
    owner: "平台管理员",
    steps: ["创建或选择角色", "开启菜单、查看、编辑和导出权限", "绑定账号可登录的后台", "用目标账号复核可见菜单和默认首页"],
    checks: ["账号只看到授权后台", "敏感操作需要管理员角色", "停用账号后不能继续登录"]
  },
  {
    id: "announcement-support",
    title: "公告与客服协同",
    summary: "公告、客服、异常申诉都使用相同的处理口径，避免同一事项在不同后台出现不同状态。",
    owner: "运营 / 客服",
    steps: ["按接收对象选择公告范围", "填写标题、内容、附件和发送时间", "客服工单中记录处理结果", "需要复核的事项转交对应管理员"],
    checks: ["公告对象正确", "附件可打开", "工单状态与备注完整"]
  },
  {
    id: "settlement-risk",
    title: "结算与风险复核",
    summary: "结算、返佣、退款和风控事件需要先核对数据来源，再执行通过、冻结、驳回或冲正。",
    owner: "财务 / 风控",
    steps: ["进入财务或返佣结算列表", "按批次、角色、店铺或推广者筛选", "打开明细核对订单、金额和风险原因", "执行审核并填写处理理由"],
    checks: ["金额口径与列表一致", "风险状态有明确理由", "导出文件与当前筛选条件一致"]
  }
];

export const apiDocItems: ApiDocItem[] = [
  {
    id: "platform-bootstrap",
    title: "平台启动与会话 API",
    group: "基础平台",
    summary: "登录、会话恢复、用户资料、菜单权限和启动数据读取。",
    methods: [
      { method: "POST", path: "/api/auth/login", purpose: "账号登录并返回会话" },
      { method: "GET", path: "/api/bootstrap", purpose: "读取当前端口需要的启动数据" },
      { method: "GET", path: "/api/me", purpose: "读取当前账号资料和权限" }
    ],
    auth: "Bearer token，后台账号必须具备对应 portal 登录权限。",
    fields: ["accountId", "portal", "role", "permissions", "sessionExpiresAt"]
  },
  {
    id: "ops-orders",
    title: "订单与调度 API",
    group: "订单调度",
    summary: "订单列表、订单详情、改期、派单、排班格子和调度中心数据。",
    methods: [
      { method: "GET", path: "/api/admin/orders", purpose: "按状态、城市、门店读取订单" },
      { method: "PATCH", path: "/api/admin/orders/:orderId", purpose: "更新订单状态、备注或处理结果" },
      { method: "GET", path: "/api/scheduling/stores/:storeId/cycles", purpose: "读取门店排班周期和 confirmed slots" }
    ],
    auth: "产运后台、商户后台按数据范围授权。",
    fields: ["orderId", "storeId", "customerId", "staffId", "status", "bookedAt", "confirmedSlots"]
  },
  {
    id: "merchant-store",
    title: "商户门店 API",
    group: "商户后台",
    summary: "门店资料、营业时间、装修内容、菜单、库存、场控和资质文件。",
    methods: [
      { method: "GET", path: "/api/merchant-admin/stores/:storeId", purpose: "读取当前门店后台资料" },
      { method: "PATCH", path: "/api/merchant-admin/stores/:storeId", purpose: "保存门店资料和营业设置" },
      { method: "GET", path: "/api/merchant-admin/stores/:storeId/documents", purpose: "读取资质文件和审核状态" }
    ],
    auth: "商户管理员只能访问所属门店；产运后台可按授权查看全量。",
    fields: ["storeId", "businessHours", "openStatus", "cover", "documents", "reviewStatus"]
  },
  {
    id: "finance-settlement",
    title: "财务结算 API",
    group: "财务结算",
    summary: "平台流水、商户结算、退款审核、发票记录、分账与导出。",
    methods: [
      { method: "GET", path: "/api/admin/settlements", purpose: "读取结算批次和结算单" },
      { method: "PATCH", path: "/api/admin/settlements/:settlementId", purpose: "审核、冻结或冲正结算单" },
      { method: "GET", path: "/api/merchant-admin/finance", purpose: "读取本店流水和待结算金额" }
    ],
    auth: "财务、平台管理员和授权商户角色可访问。",
    fields: ["settlementId", "grossAmount", "commission", "refunds", "payoutStatus", "exportUrl"]
  },
  {
    id: "afirieito-links",
    title: "Afirieito 链接与素材 API",
    group: "联盟营销",
    summary: "推广链接、短链、QR、素材、横幅、片前广告和快捷链接管理。",
    methods: [
      { method: "POST", path: "/api/afirieito/links", purpose: "生成推广链接、推广码和 QR" },
      { method: "GET", path: "/api/afirieito/materials", purpose: "读取素材库和渠道素材表现" },
      { method: "PATCH", path: "/api/afirieito/materials/:materialId", purpose: "上下架或更新素材内容" }
    ],
    auth: "NDA 管理员、平台管理员和具备素材权限的推广角色。",
    fields: ["linkId", "campaignId", "promoterId", "shortUrl", "qrUrl", "materialStatus"]
  },
  {
    id: "afirieito-attribution",
    title: "Afirieito 归因与返佣 API",
    group: "联盟营销",
    summary: "曝光、点击、注册、首购、归因订单、返佣结算和风控冻结。",
    methods: [
      { method: "POST", path: "/api/afirieito/tracking/events", purpose: "写入曝光、点击、注册或支付事件" },
      { method: "GET", path: "/api/afirieito/attribution/orders", purpose: "读取归因订单和佣金状态" },
      { method: "PATCH", path: "/api/afirieito/payouts/:payoutId", purpose: "审核提现、冻结或释放返佣" }
    ],
    auth: "NDA 管理员可见授权范围；产运后台可见全量同步数据。",
    fields: ["eventId", "source", "promoterId", "orderId", "commissionAmount", "riskStatus"]
  },
  {
    id: "notifications-support",
    title: "通知、公告与客服 API",
    group: "系统服务",
    summary: "官方通知、后台公告、客服工单、求救通知和消息未读数。",
    methods: [
      { method: "GET", path: "/api/admin/notifications", purpose: "读取官方通知和后台公告" },
      { method: "POST", path: "/api/admin/notifications", purpose: "创建定时或立即发送的公告" },
      { method: "GET", path: "/api/admin/support/tickets", purpose: "读取客服工单和申诉列表" }
    ],
    auth: "后台账号按公告接收对象、客服角色和通知权限授权。",
    fields: ["notificationId", "targetPortals", "scheduledAt", "ticketId", "unreadCount"]
  }
];

export const defaultApiDocVisibility: ApiDocVisibility = apiDocItems.reduce<ApiDocVisibility>((visibility, item) => {
  visibility[item.id] = {
    merchant: ["ops-orders", "merchant-store", "finance-settlement", "notifications-support"].includes(item.id),
    afirieito: ["platform-bootstrap", "afirieito-links", "afirieito-attribution", "notifications-support"].includes(item.id)
  };

  return visibility;
}, {});

function normalizeApiDocMethod(input: unknown): ApiDocMethod | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const raw = input as Record<string, unknown>;
  const method = raw.method === "GET" || raw.method === "POST" || raw.method === "PATCH" || raw.method === "DELETE" ? raw.method : null;
  const path = typeof raw.path === "string" ? raw.path.trim() : "";
  const purpose = typeof raw.purpose === "string" ? raw.purpose.trim() : "";

  if (!method || !path || !purpose) {
    return null;
  }

  return { method, path, purpose };
}

export function normalizeApiDocItems(input: unknown): ApiDocItem[] {
  if (!Array.isArray(input)) {
    return apiDocItems;
  }

  return apiDocItems.map((defaultItem) => {
    const rawItem = input.find((item) => item && typeof item === "object" && (item as Record<string, unknown>).id === defaultItem.id);

    if (!rawItem || typeof rawItem !== "object") {
      return defaultItem;
    }

    const raw = rawItem as Record<string, unknown>;
    const methods = Array.isArray(raw.methods) ? raw.methods.map(normalizeApiDocMethod).filter((item): item is ApiDocMethod => Boolean(item)) : defaultItem.methods;
    const fields = Array.isArray(raw.fields)
      ? raw.fields.map((field) => (typeof field === "string" ? field.trim() : "")).filter(Boolean)
      : defaultItem.fields;

    return {
      id: defaultItem.id,
      title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : defaultItem.title,
      group: typeof raw.group === "string" && raw.group.trim() ? raw.group.trim() : defaultItem.group,
      summary: typeof raw.summary === "string" && raw.summary.trim() ? raw.summary.trim() : defaultItem.summary,
      methods: methods.length > 0 ? methods : defaultItem.methods,
      auth: typeof raw.auth === "string" && raw.auth.trim() ? raw.auth.trim() : defaultItem.auth,
      fields: fields.length > 0 ? fields : defaultItem.fields
    };
  });
}

export function readApiDocItems(): ApiDocItem[] {
  if (typeof window === "undefined") {
    return apiDocItems;
  }

  try {
    return normalizeApiDocItems(JSON.parse(window.localStorage.getItem(apiDocItemsStorageKey) ?? "null"));
  } catch {
    return apiDocItems;
  }
}

export function writeApiDocItems(items: ApiDocItem[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(apiDocItemsStorageKey, JSON.stringify(normalizeApiDocItems(items)));
}

export function normalizeApiDocVisibility(input: unknown): ApiDocVisibility {
  const next: ApiDocVisibility = { ...defaultApiDocVisibility };

  if (!input || typeof input !== "object") {
    return next;
  }

  for (const item of apiDocItems) {
    const rawItem = (input as Record<string, unknown>)[item.id];

    if (!rawItem || typeof rawItem !== "object") {
      continue;
    }

    next[item.id] = {
      merchant: typeof (rawItem as Record<string, unknown>).merchant === "boolean" ? Boolean((rawItem as Record<string, unknown>).merchant) : next[item.id].merchant,
      afirieito: typeof (rawItem as Record<string, unknown>).afirieito === "boolean" ? Boolean((rawItem as Record<string, unknown>).afirieito) : next[item.id].afirieito
    };
  }

  return next;
}

export function readApiDocVisibility(): ApiDocVisibility {
  if (typeof window === "undefined") {
    return defaultApiDocVisibility;
  }

  try {
    return normalizeApiDocVisibility(JSON.parse(window.localStorage.getItem(apiDocVisibilityStorageKey) ?? "null"));
  } catch {
    return defaultApiDocVisibility;
  }
}

export function writeApiDocVisibility(visibility: ApiDocVisibility) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(apiDocVisibilityStorageKey, JSON.stringify(visibility));
}

export function getVisibleApiDocItems(surface: AdminDocsSurface, visibility: ApiDocVisibility, items: ApiDocItem[] = apiDocItems) {
  if (surface === "ops") {
    return items;
  }

  return items.filter((item) => visibility[item.id]?.[surface] ?? false);
}

export function countVisibleApiDocs(surface: ApiDocVisibilityTarget, visibility: ApiDocVisibility, items: ApiDocItem[] = apiDocItems) {
  return items.filter((item) => visibility[item.id]?.[surface] ?? false).length;
}
