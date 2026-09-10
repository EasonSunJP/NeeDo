export type LegalDocumentCreateDraft = {
  slug: string;
  name: string;
  internalPath: string;
  displayLocations: string[];
  isEnabled: boolean;
};

export type LegalDocumentTemplate = LegalDocumentCreateDraft & {
  label: string;
  purpose: string;
};

export type LegalGuidanceOption = {
  value: string;
  label: string;
  description: string;
};

export const legalInternalRouteOptions: readonly LegalGuidanceOption[] = [
  { value: "/me/settings/terms", label: "利用规约页面", description: "用户、技师和店铺设置中心的利用规约入口" },
  { value: "/me/settings/privacy", label: "隐私政策页面", description: "用户、技师和店铺设置中心的个人信息保护方针入口" },
  { value: "/me/settings/merchant-agreement", label: "店铺协议页面", description: "店铺申请时查看商户服务合同" },
  { value: "/me/settings/affiliate-agreement", label: "联盟协议页面", description: "开启联盟营销时查看合同" },
  { value: "/me/identity/technician/apply", label: "技师申请页面", description: "申请技师身份的正式入口" },
  { value: "/me/settings/verification", label: "eKYC 页面", description: "本人确认和身份资料提交入口" },
  { value: "/orders", label: "订单页面", description: "预约取消、退款和订单规则入口" },
  { value: "/me/settings/ndp-guide", label: "NDP 说明页面", description: "NDP 获取、使用和提现说明入口" },
  { value: "/moments", label: "动态页面", description: "投稿、互动与举报规则入口" },
  { value: "/me/settings/about", label: "关于 NeeDo 页面", description: "运营主体与法定表示入口" }
];

export const legalDisplayLocationOptions: readonly LegalGuidanceOption[] = [
  { value: "settings", label: "设置中心", description: "用户主动查看政策" },
  { value: "registration", label: "账号注册", description: "注册前展示基础条款" },
  { value: "footer", label: "网站页脚", description: "公共页面的长期入口" },
  { value: "merchant-application", label: "店铺申请", description: "提交店铺资料或合同时展示" },
  { value: "technician-application", label: "技师申请", description: "提交技师身份申请时展示" },
  { value: "affiliate-activation", label: "联盟营销开启", description: "启用联盟身份前展示" },
  { value: "ekyc", label: "eKYC 本人确认", description: "上传身份资料前展示" },
  { value: "withdrawal", label: "提现", description: "绑定银行账户或提现前展示" },
  { value: "booking-checkout", label: "预约确认", description: "用户确认预约与费用前展示" },
  { value: "order-detail", label: "订单详情", description: "订单履行过程中可查看" },
  { value: "cancellation", label: "取消与退款", description: "取消操作前展示" },
  { value: "ndp-wallet", label: "NDP 钱包", description: "查看点数余额与流水时展示" },
  { value: "social-compose", label: "发布动态", description: "发布公开内容前展示" },
  { value: "social-report", label: "内容举报", description: "举报或申诉时展示" },
  { value: "paid-service", label: "付费服务", description: "购买收费服务前展示" },
  { value: "membership-purchase", label: "会员购买", description: "购买会员或订阅前展示" }
];

export const legalDocumentTemplates: readonly LegalDocumentTemplate[] = [
  {
    slug: "terms-of-use",
    label: "利用规约",
    name: "NeeDo Terms of Use",
    purpose: "所有用户使用 NeeDo 的基础规则",
    internalPath: "/me/settings/terms",
    displayLocations: ["settings", "registration", "footer"],
    isEnabled: false
  },
  {
    slug: "privacy-policy",
    label: "个人信息保护方针",
    name: "NeeDo Personal Information Protection Policy",
    purpose: "说明个人信息的取得、利用、共享、保存和权利请求",
    internalPath: "/me/settings/privacy",
    displayLocations: ["settings", "registration", "ekyc", "footer"],
    isEnabled: false
  },
  {
    slug: "merchant-agreement",
    label: "店铺服务规则与合同",
    name: "NeeDo Merchant Service Rules and Agreement",
    purpose: "店铺入驻、收费、资料真实性和服务责任",
    internalPath: "/me/settings/merchant-agreement",
    displayLocations: ["merchant-application"],
    isEnabled: false
  },
  {
    slug: "affiliate-agreement",
    label: "联盟营销规则与合同",
    name: "NeeDo Affiliate Marketing Rules and Agreement",
    purpose: "联盟营销开启、归因、NDP 报酬和提现条件",
    internalPath: "/me/settings/affiliate-agreement",
    displayLocations: ["affiliate-activation"],
    isEnabled: false
  },
  {
    slug: "technician-agreement",
    label: "技师服务提供者协议",
    name: "NeeDo Technician Service Provider Agreement",
    purpose: "技师申请、资质、接单、服务质量和店铺从属规则",
    internalPath: "/me/identity/technician/apply",
    displayLocations: ["technician-application"],
    isEnabled: false
  },
  {
    slug: "ekyc-consent",
    label: "eKYC 同意与身份信息处理说明",
    name: "NeeDo eKYC Consent and Identity Data Handling Notice",
    purpose: "上传证件前说明用途、处理范围、保存期限和委托方",
    internalPath: "/me/settings/verification",
    displayLocations: ["ekyc", "merchant-application", "technician-application", "withdrawal"],
    isEnabled: false
  },
  {
    slug: "cancellation-refund-policy",
    label: "取消与退款政策",
    name: "NeeDo Cancellation and Refund Policy",
    purpose: "预约取消、退款、责任划分和到账时间",
    internalPath: "/orders",
    displayLocations: ["booking-checkout", "order-detail", "cancellation"],
    isEnabled: false
  },
  {
    slug: "ndp-rules",
    label: "NDP 使用规则",
    name: "NeeDo NDP Rules",
    purpose: "NDP 的取得、消费、有效期、退还和提现边界",
    internalPath: "/me/settings/ndp-guide",
    displayLocations: ["ndp-wallet", "booking-checkout", "withdrawal"],
    isEnabled: false
  },
  {
    slug: "community-guidelines",
    label: "社区与内容发布规则",
    name: "NeeDo Community and Content Guidelines",
    purpose: "动态、评价、图片视频、举报和违规处置规则",
    internalPath: "/moments",
    displayLocations: ["social-compose", "social-report"],
    isEnabled: false
  },
  {
    slug: "specified-commercial-transactions-disclosure",
    label: "特定商取引法表示",
    name: "Disclosure under the Specified Commercial Transactions Act",
    purpose: "运营主体、价格、支付、提供时期和取消条件等法定表示",
    internalPath: "/me/settings/about",
    displayLocations: ["paid-service", "membership-purchase", "footer"],
    isEnabled: false
  }
];

export type LegalDocumentTemplateSlug = (typeof legalDocumentTemplates)[number]["slug"];

export function createDraftFromLegalTemplate(slug: LegalDocumentTemplateSlug): LegalDocumentCreateDraft {
  const template = legalDocumentTemplates.find((item) => item.slug === slug);
  if (!template) throw new Error("error.legal_document.template_not_found");
  return {
    slug: template.slug,
    name: template.name,
    internalPath: template.internalPath,
    displayLocations: [...template.displayLocations],
    isEnabled: false
  };
}

export function createEmptyLegalDocumentDraft(): LegalDocumentCreateDraft {
  return { slug: "", name: "", internalPath: "/", displayLocations: [], isEnabled: false };
}
