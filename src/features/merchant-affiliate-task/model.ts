import type {
  AffiliateContentLocale,
  MerchantAffiliateEditableInput,
  MerchantAffiliateFeePreviewInput,
  MerchantAffiliateFeePreview,
  MerchantAffiliatePublisherOption,
  MerchantAffiliateServiceOption,
  MerchantAffiliateTask,
  MerchantAffiliateTaskCreateInput,
  MerchantAffiliateTaskTranslations,
  MerchantAffiliateTaskUpdateInput
} from "../../api/merchantAffiliateTasks";

export interface MerchantAffiliateTaskForm {
  taskId: number | null;
  taskCode: string | null;
  lockVersion: number | null;
  publisherType: "shop" | "merchant_account";
  merchantAccountId: number | null;
  shopIds: number[];
  selectedServiceIds: number[];
  sourceLocale: AffiliateContentLocale;
  name: string;
  description: string;
  coverMediaAssetId: number | null;
  rewardNdpPerCompletedOrder: number;
  totalBudgetNdp: number;
  customerDiscountType: "none" | "fixed_jpy" | "percent";
  fixedDiscountJpy: number;
  discountRateBps: number;
  discountCapJpy: number;
  minimumOrderAmountJpy: number;
  claimStartsAt: string;
  claimEndsAt: string;
  taskStartsAt: string;
  taskEndsAt: string;
  attributionWindowDays: number;
  maxCompletedOrdersPerClaim: number | null;
  maxCompletedOrdersPerCustomer: number | null;
  serviceScopeMode: "all_current_services" | "selected_services";
  translations: MerchantAffiliateTaskTranslations;
  feePreview: MerchantAffiliateFeePreview | null;
}

export const affiliateLocaleOrder: AffiliateContentLocale[] = [
  "ja",
  "en",
  "ko",
  "zh-TW",
  "zh-CN"
];

export type MerchantAffiliateLocaleEditorValue = {
  name: string;
  description: string;
  dirty: boolean;
};

export type MerchantAffiliateLocaleEditorState = Record<
  AffiliateContentLocale,
  MerchantAffiliateLocaleEditorValue
>;

export const taskToLocaleEditorState = (
  task: Pick<MerchantAffiliateTask, "translations">
): MerchantAffiliateLocaleEditorState =>
  Object.fromEntries(
    affiliateLocaleOrder.map((locale) => {
      const translation = task.translations[locale];
      return [
        locale,
        {
          name: translation?.name ?? "",
          description: translation?.description ?? "",
          dirty: false
        }
      ];
    })
  ) as MerchantAffiliateLocaleEditorState;

export const emptyLocaleEditorState = (): MerchantAffiliateLocaleEditorState =>
  taskToLocaleEditorState({ translations: {} });

export const isoToDateTimeLocal = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offsetMilliseconds = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMilliseconds).toISOString().slice(0, 16);
};

export const dateTimeLocalToIso = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
};

export const taskToForm = (task: MerchantAffiliateTask): MerchantAffiliateTaskForm => {
  const authoredTranslation = Object.entries(task.translations).find(
    ([, translation]) => translation && !translation.isInitialCopy
  )?.[1];
  return {
    taskId: task.id,
    taskCode: task.taskCode,
    lockVersion: task.lockVersion,
    publisherType: task.publisherType,
    merchantAccountId: task.publisherMerchantAccountId,
    shopIds: task.shops.map((shop) => shop.shopId),
    selectedServiceIds: task.services.map((service) => service.serviceId),
    sourceLocale: authoredTranslation?.sourceLocale ?? "ja",
    name: task.name,
    description: task.description ?? "",
    coverMediaAssetId: task.coverMediaAssetId,
    rewardNdpPerCompletedOrder: task.rewardNdpPerCompletedOrder,
    totalBudgetNdp: task.totalBudgetNdp,
    customerDiscountType: task.customerDiscountType,
    fixedDiscountJpy: task.fixedDiscountJpy,
    discountRateBps: task.discountRateBps,
    discountCapJpy: task.discountCapJpy,
    minimumOrderAmountJpy: task.minimumOrderAmountJpy,
    claimStartsAt: task.claimStartsAt,
    claimEndsAt: task.claimEndsAt,
    taskStartsAt: task.taskStartsAt,
    taskEndsAt: task.taskEndsAt,
    attributionWindowDays: task.attributionWindowDays,
    maxCompletedOrdersPerClaim: task.maxCompletedOrdersPerClaim,
    maxCompletedOrdersPerCustomer: task.maxCompletedOrdersPerCustomer,
    serviceScopeMode: task.serviceScopeMode,
    translations: task.translations,
    feePreview: null
  };
};

export const changePublisher = (
  form: MerchantAffiliateTaskForm,
  publisher: MerchantAffiliatePublisherOption
): MerchantAffiliateTaskForm => ({
  ...form,
  publisherType: publisher.publisherType,
  merchantAccountId: publisher.merchantAccountId,
  shopIds: [],
  selectedServiceIds: [],
  feePreview: null
});

export const removeShop = (
  form: MerchantAffiliateTaskForm,
  shopId: number,
  serviceOptions: MerchantAffiliateServiceOption[]
): MerchantAffiliateTaskForm => {
  const removedServiceIds = new Set(
    serviceOptions
      .filter((service) => service.shopId === shopId)
      .map((service) => service.serviceId)
  );
  return {
    ...form,
    shopIds: form.shopIds.filter((currentShopId) => currentShopId !== shopId),
    selectedServiceIds: form.selectedServiceIds.filter(
      (serviceId) => !removedServiceIds.has(serviceId)
    ),
    feePreview: null
  };
};

export const buildScopePayload = (
  form: MerchantAffiliateTaskForm
): Pick<MerchantAffiliateEditableInput, "serviceScopeMode" | "selectedServiceIds"> => ({
  serviceScopeMode: form.serviceScopeMode,
  selectedServiceIds:
    form.serviceScopeMode === "all_current_services" ? [] : [...form.selectedServiceIds]
});

export const buildFeePreviewKey = (form: MerchantAffiliateTaskForm): string =>
  [
    form.publisherType,
    form.merchantAccountId ?? "shop",
    [...form.shopIds].sort((left, right) => left - right).join(","),
    form.totalBudgetNdp
  ].join(":");

export const buildFeePreviewPayload = (
  form: MerchantAffiliateTaskForm
): MerchantAffiliateFeePreviewInput => {
  const common = {
    shopIds: [...form.shopIds].sort((left, right) => left - right),
    totalBudgetNdp: form.totalBudgetNdp
  };
  if (form.publisherType === "shop") {
    return { publisherType: "shop", ...common };
  }
  if (form.merchantAccountId === null) {
    throw new Error("Merchant account publisher is not selected");
  }
  return {
    publisherType: "merchant_account",
    merchantAccountId: form.merchantAccountId,
    ...common
  };
};

const buildEditablePayload = (form: MerchantAffiliateTaskForm): MerchantAffiliateEditableInput => ({
  name: form.name.trim(),
  description: form.description.trim() || null,
  coverMediaAssetId: form.coverMediaAssetId,
  rewardNdpPerCompletedOrder: form.rewardNdpPerCompletedOrder,
  totalBudgetNdp: form.totalBudgetNdp,
  customerDiscountType: form.customerDiscountType,
  fixedDiscountJpy: form.fixedDiscountJpy,
  discountRateBps: form.discountRateBps,
  discountCapJpy: form.discountCapJpy,
  minimumOrderAmountJpy: form.minimumOrderAmountJpy,
  claimStartsAt: form.claimStartsAt,
  claimEndsAt: form.claimEndsAt,
  taskStartsAt: form.taskStartsAt,
  taskEndsAt: form.taskEndsAt,
  attributionWindowDays: form.attributionWindowDays,
  maxCompletedOrdersPerClaim: form.maxCompletedOrdersPerClaim,
  maxCompletedOrdersPerCustomer: form.maxCompletedOrdersPerCustomer,
  ...buildScopePayload(form)
});

export const buildCreatePayload = (
  form: MerchantAffiliateTaskForm
): MerchantAffiliateTaskCreateInput => {
  const editable = buildEditablePayload(form);
  if (form.publisherType === "shop") {
    return { ...editable, publisherType: "shop", sourceLocale: form.sourceLocale };
  }
  if (form.merchantAccountId === null) {
    throw new Error("Merchant account publisher is not selected");
  }
  return {
    ...editable,
    publisherType: "merchant_account",
    merchantAccountId: form.merchantAccountId,
    shopIds: [...form.shopIds],
    sourceLocale: form.sourceLocale
  };
};

export const buildUpdatePayload = (
  form: MerchantAffiliateTaskForm
): MerchantAffiliateTaskUpdateInput => {
  if (form.lockVersion === null) {
    throw new Error("Persisted task lock version is unavailable");
  }
  return {
    ...buildEditablePayload(form),
    lockVersion: form.lockVersion,
    ...(form.publisherType === "merchant_account" ? { shopIds: [...form.shopIds] } : {})
  };
};

const displayNumber = (value: number | null): string => (value === null ? "-" : String(value));

export const taskDisplayRows = (task: MerchantAffiliateTask): string[] => [
  task.taskCode,
  task.name,
  task.publisherDisplayName,
  ...task.shops.flatMap((shop) => [shop.shopNameSnapshot, shop.publicId]),
  task.status,
  String(task.rewardNdpPerCompletedOrder),
  String(task.totalBudgetNdp),
  String(task.platformFeeBps),
  String(task.platformFeeReserveNdp),
  String(task.reservedBudgetNdp),
  String(task.allocatedBudgetNdp),
  String(task.settledBudgetNdp),
  String(task.releasedBudgetNdp),
  task.claimStartsAt,
  task.claimEndsAt,
  task.taskStartsAt,
  task.taskEndsAt,
  displayNumber(task.maxCompletedOrdersPerClaim),
  displayNumber(task.maxCompletedOrdersPerCustomer),
  task.createdAt,
  task.updatedAt
];
