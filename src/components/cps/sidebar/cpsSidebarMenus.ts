export type CpsSidebarIconKey =
  | "analytics"
  | "overview"
  | "link"
  | "grid"
  | "wallet"
  | "user-plus"
  | "settings"
  | "book";

export type CpsWorkspaceModuleKey =
  | "dashboard"
  | "linkData"
  | "plans"
  | "wizard"
  | "team"
  | "links"
  | "materials"
  | "crm"
  | "tracking"
  | "attribution"
  | "settlement"
  | "wallet"
  | "risk"
  | "promoters"
  | "serviceRules";

export type CpsSidebarPage = {
  key: string;
  label: string;
  path: string;
  permission?: string;
  description: string;
  features: string[];
  workspaceModule?: CpsWorkspaceModuleKey;
};

export type CpsSidebarMenu = {
  key: string;
  label: string;
  icon: CpsSidebarIconKey;
  path?: string;
  permission?: string;
  description?: string;
  features?: string[];
  workspaceModule?: CpsWorkspaceModuleKey;
  children?: CpsSidebarPage[];
};

export const cpsSidebarMenus: CpsSidebarMenu[] = [
  {
    key: "analytics",
    label: "数据分析",
    icon: "analytics",
    permission: "cps:analytics:view",
    children: [
      {
        key: "statistics",
        label: "统计数据",
        path: "/NDA-admin/statistics",
        permission: "cps:analytics:statistics:view",
        workspaceModule: "dashboard",
        description: "查看 Afirieito 整体统计、增长趋势、归因 GMV、佣金成本、ROI 和风险冻结数据。",
        features: ["核心指标总览", "增长趋势图表", "ROI 与成本分析", "风险冻结数据"]
      },
      {
        key: "link-data",
        label: "链接数据",
        path: "/NDA-admin/link-data",
        permission: "cps:analytics:link-data:view",
        workspaceModule: "linkData",
        description: "按发行链接查看曝光、点击、注册、首购、复购、返佣和风险数据。",
        features: ["发行链接统计", "转化漏斗", "首购与复购", "风险事件监测"]
      },
      {
        key: "member-inspector",
        label: "推广者检查",
        path: "/NDA-admin/member-inspector",
        permission: "cps:promoter:inspect",
        workspaceModule: "promoters",
        description: "检查推广者、成员、下级数据、渠道来源、收益状态和风险分。",
        features: ["推广者资料检索", "收益与冻结金额检查", "渠道与邀请码检查", "风险分与身份状态"]
      }
    ]
  },
  {
    key: "links-creatives",
    label: "链接与素材",
    icon: "link",
    permission: "cps:creative:view",
    children: [
      {
        key: "links-builder",
        label: "推广链接生成",
        path: "/NDA-admin/links-builder",
        permission: "cps:link:manage",
        workspaceModule: "links",
        description: "用于生成推广者专属链接、活动链接、素材链接、推广码和 QR 码链接。",
        features: ["创建链接", "复制短链", "生成 QR", "查看点击数据", "暂停链接"]
      },
      {
        key: "ad-creatives-builder",
        label: "推广素材生成",
        path: "/NDA-admin/ad-creatives-builder",
        permission: "cps:creative:manage",
        workspaceModule: "materials",
        description: "创建和管理图文、视频、文案素材，并查看渠道素材 ROI 表现。",
        features: ["素材库管理", "图文素材", "视频素材", "文案模板", "渠道 ROI"]
      },
      {
        key: "banners",
        label: "横幅素材",
        path: "/NDA-admin/banners",
        permission: "cps:banner:view",
        description: "管理横幅推广素材、投放位置、尺寸规范和素材状态。",
        features: ["Banner 列表", "尺寸规范", "素材上下架", "点击表现"]
      },
      {
        key: "pre-roll-ads",
        label: "片前广告",
        path: "/NDA-admin/pre-roll-ads",
        permission: "cps:video-ad:view",
        description: "管理 Pre-roll、短视频广告素材和对应的渠道投放要求。",
        features: ["视频素材列表", "投放渠道", "审核状态", "转化表现"]
      },
      {
        key: "easylinks",
        label: "快捷链接",
        path: "/NDA-admin/easylinks",
        permission: "cps:easylink:view",
        description: "快速生成常用推广链接、默认落地页链接和高频活动链接。",
        features: ["常用链接模板", "批量复制", "默认落地页", "快捷状态切换"]
      }
    ]
  },
  {
    key: "whitelabels",
    label: "白标设置",
    icon: "grid",
    path: "/NDA-admin/whitelabels",
    permission: "cps:whitelabel:view",
    description: "预留品牌化、域名、自定义页面和白标推广入口。",
    features: ["品牌名称", "自定义域名", "推广落地页", "页面样式"]
  },
  {
    key: "payouts",
    label: "返佣结算",
    icon: "wallet",
    permission: "cps:payout:view",
    children: [
      {
        key: "payout-overview",
        label: "结算总览",
        path: "/NDA-admin/payout-overview",
        permission: "cps:payout:overview:view",
        workspaceModule: "settlement",
        description: "查看返佣总体情况、结算批次、冻结释放、冲正和付款状态。",
        features: ["结算批次", "佣金状态", "冻结释放", "付款状态", "导出审计"]
      },
      {
        key: "withdraw-review",
        label: "提现审核",
        path: "/NDA-admin/withdraw-review",
        permission: "cps:payout:withdraw-review",
        description: "审核推广者提现申请、风险冻结、付款资料和驳回原因。",
        features: ["提现申请", "付款资料复核", "风险冻结检查", "审核结果记录"]
      },
      {
        key: "payout-records",
        label: "结算记录",
        path: "/NDA-admin/payout-records",
        permission: "cps:payout:records:view",
        description: "查看历史结算记录、付款流水、冲正记录和财务导出结果。",
        features: ["历史批次", "付款流水", "冲正记录", "财务导出"]
      }
    ]
  },
  {
    key: "referral-program",
    label: "分销计划",
    icon: "user-plus",
    permission: "cps:referral:view",
    children: [
      {
        key: "referral-models",
        label: "推广计划管理",
        path: "/NDA-admin/referral-models",
        permission: "cps:referral:model:view",
        workspaceModule: "plans",
        description: "设置 CPA、CPS、多级返佣规则、预算继承和佣金结算基准。",
        features: ["佣金规则", "预算继承", "多级分销", "计划状态管理"]
      },
      {
        key: "campaign-create",
        label: "新建推广计划",
        path: "/NDA-admin/campaign-create",
        permission: "cps:campaign:create",
        workspaceModule: "wizard",
        description: "从分销计划里直接进入推广计划创建流程，配置佣金、归因、素材、预算和风控。",
        features: ["计划配置", "佣金设置", "素材绑定", "发布审核"]
      },
      {
        key: "referral-affiliates",
        label: "组织",
        path: "/NDA-admin/referral-affiliates",
        permission: "cps:referral:affiliate:view",
        workspaceModule: "team",
        description: "管理推广者组织层级、层级权限、目标拆分和组织风险状态。",
        features: ["组织层级", "下级推广者", "权限控制", "目标拆分", "组织风险"]
      }
    ]
  },
  {
    key: "service",
    label: "管理和服务",
    icon: "settings",
    permission: "cps:service:view",
    children: [
      {
        key: "account",
        label: "账户",
        path: "/NDA-admin/account",
        permission: "cps:account:view",
        description: "发行、编辑、批量管理 NDA管理后台账号，并控制前端后台与产运后台登录权限。",
        features: ["发行编辑账号", "批量生成账号", "登录端权限", "账号列表"]
      },
      {
        key: "support",
        label: "客服支持",
        path: "/NDA-admin/support",
        permission: "cps:support:view",
        description: "处理 Afirieito 系统客服咨询、申诉、异常素材和推广者问题。",
        features: ["客服工单", "申诉处理", "异常素材反馈", "推广者沟通记录"]
      },
      {
        key: "announcements",
        label: "公告",
        path: "/NDA-admin/announcements",
        permission: "cps:announcements:view",
        description: "查看和发送 NDA管理后台公告，复用产运后台官方通知的列表、详情、定时发送与图文视频能力。",
        features: ["公告列表", "定时发送", "图文视频", "重要弹出"]
      },
      {
        key: "service-rules",
        label: "规则",
        path: "/NDA-admin/service-rules",
        permission: "cps:service:rules:view",
        workspaceModule: "serviceRules",
        description: "设定店铺活跃数、服务规则和阶梯分成会引用的公共判定条件。",
        features: ["店铺活跃数", "一周订单数", "服务规则", "阶梯条件引用"]
      },
      {
        key: "system-service",
        label: "系统服务",
        path: "/NDA-admin/system-service",
        permission: "cps:service:system:view",
        description: "查看 Afirieito 系统服务状态、配置项、同步状态和运行提醒。",
        features: ["服务状态", "同步状态", "系统配置", "运行提醒"]
      }
    ]
  },
  {
    key: "documentation",
    label: "文档",
    icon: "book",
    permission: "cps:docs:view",
    children: [
      {
        key: "operation-docs",
        label: "操作文档",
        path: "/NDA-admin/operation-docs",
        permission: "cps:docs:operation:view",
        description: "查看与产运后台、商户后台保持一致的后台操作流程、权限口径、公告协同和结算风控说明。",
        features: ["三端一致", "后台流程", "权限口径", "结算风控"]
      },
      {
        key: "api-docs",
        label: "API 文档",
        path: "/NDA-admin/api-docs",
        permission: "cps:docs:api:view",
        description: "查看产运后台已开放给联盟营销后台的 API 分类，包含追踪、链接、归因、结算和关键字段说明。",
        features: ["产运开启", "追踪 API", "链接素材", "返佣结算"]
      }
    ]
  }
];

export const cpsReservedSidebarPages: CpsSidebarPage[] = [
  {
    key: "campaigns",
    label: "活动列表",
    path: "/NDA-admin/campaigns",
    permission: "cps:campaign:view",
    workspaceModule: "plans",
    description: "后续推广活动管理入口，用于查看活动列表、预算、目标和状态。",
    features: ["活动列表", "活动状态", "预算与目标", "活动效果"]
  },
  {
    key: "campaign-create",
    label: "新建推广计划",
    path: "/NDA-admin/campaign-create",
    permission: "cps:campaign:create",
    workspaceModule: "wizard",
    description: "后续推广活动创建入口，用于配置推广计划、佣金、归因、素材、预算和风控。",
    features: ["计划配置", "佣金设置", "素材绑定", "发布审核"]
  },
  {
    key: "tracking-events",
    label: "事件记录",
    path: "/NDA-admin/tracking-events",
    permission: "cps:tracking:view",
    workspaceModule: "tracking",
    description: "后续推广追踪入口，用于查看点击、扫码、注册、订单、支付和退款事件。",
    features: ["事件流水", "追踪签名", "来源路径", "异常定位"]
  },
  {
    key: "anti-fraud",
    label: "防作弊中心",
    path: "/NDA-admin/anti-fraud",
    permission: "cps:risk:view",
    workspaceModule: "risk",
    description: "后续防作弊中心入口，用于查看风险事件、风控规则和人工审核状态。",
    features: ["风险事件", "风控规则", "人工审核", "冻结解冻"]
  },
  {
    key: "operation-logs",
    label: "操作记录",
    path: "/NDA-admin/operation-logs",
    permission: "cps:audit:view",
    workspaceModule: "risk",
    description: "后续操作日志入口，用于查看后台操作、结算变更和审计留痕。",
    features: ["操作记录", "结算变更记录", "审计留痕", "责任人追踪"]
  }
];

export const cpsSidebarPages = cpsSidebarMenus.flatMap((menu) => {
  if (menu.children?.length) {
    return menu.children;
  }

  if (menu.path) {
    return [
      {
        key: menu.key,
        label: menu.label,
        path: menu.path,
        permission: menu.permission,
        description: menu.description ?? "",
        features: menu.features ?? [],
        workspaceModule: menu.workspaceModule
      }
    ];
  }

  return [];
});

const cpsSidebarPageByPath = new Map(
  [...cpsSidebarPages, ...cpsReservedSidebarPages, {
    key: "statistics-root",
    label: "统计数据",
    path: "/NDA-admin",
    permission: "cps:dashboard:view",
    workspaceModule: "dashboard" as CpsWorkspaceModuleKey,
    description: "查看 Afirieito 整体统计、增长趋势、归因 GMV、佣金成本、ROI 和风险冻结数据。",
    features: ["核心指标总览", "增长趋势图表", "ROI 与成本分析", "风险冻结数据"]
  }].map((page) => [page.path.toLowerCase(), page])
);

export function normalizeCpsAdminPath(pathname: string) {
  const normalized = pathname.replace(/^\/(?:nda-admin|afirieito-admin|cps-admin|business-admin|CPS-admin)/i, "/NDA-admin").replace(/\/+$/, "");

  return normalized || "/NDA-admin";
}

export function findCpsSidebarPageByPath(pathname: string) {
  return cpsSidebarPageByPath.get(normalizeCpsAdminPath(pathname).toLowerCase()) ?? null;
}

export function findCpsSidebarMenuByPath(pathname: string) {
  const normalizedPath = normalizeCpsAdminPath(pathname);

  if (normalizedPath === "/NDA-admin") {
    const analytics = cpsSidebarMenus.find((menu) => menu.key === "analytics");
    const statistics = analytics?.children?.find((item) => item.key === "statistics") ?? null;

    if (analytics && statistics) {
      return { menu: analytics, page: statistics, parent: analytics };
    }
  }

  for (const menu of cpsSidebarMenus) {
    if (menu.path && normalizeCpsAdminPath(menu.path) === normalizedPath) {
      return { menu, page: findCpsSidebarPageByPath(normalizedPath), parent: null };
    }

    const child = menu.children?.find((item) => {
      const childPath = normalizeCpsAdminPath(item.path);

      return childPath === normalizedPath || normalizedPath.startsWith(`${childPath}/`);
    });

    if (child) {
      return { menu, page: child, parent: menu };
    }
  }

  return null;
}
