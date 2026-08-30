import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  merchantAffiliateTasksApi,
  type AffiliateContentLocale,
  type MerchantAffiliatePublisherOption,
  type MerchantAffiliateServiceOption,
  type MerchantAffiliateShopOption,
  type MerchantAffiliateTask,
  type MerchantAffiliateTaskStatus
} from "../../api/merchantAffiliateTasks";
import { Button } from "../../components/ui/Button";
import { ApiClientError } from "../../api/httpClient";
import { useI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";
import { cn } from "../../lib/utils";
import {
  buildCreatePayload,
  buildUpdatePayload,
  changePublisher,
  dateTimeLocalToIso,
  emptyLocaleEditorState,
  affiliateLocaleOrder,
  isoToDateTimeLocal,
  removeShop,
  taskToForm,
  taskToLocaleEditorState,
  type MerchantAffiliateLocaleEditorState,
  type MerchantAffiliateTaskForm
} from "./model";
import {
  describeMerchantAffiliateTaskError,
  getMerchantAffiliateTaskCopy
} from "../../pages/merchant-admin/merchantAffiliateTaskCopy";

export const editorSteps = ["basic", "scope", "reward", "timing", "locales", "finance"] as const;
type EditorStep = (typeof editorSteps)[number];

type EditorConflict = {
  localForm: MerchantAffiliateTaskForm;
  localeState: MerchantAffiliateLocaleEditorState;
  message: string;
  reloaded: boolean;
};

type EditorText = {
  steps: Record<EditorStep, string>;
  sourceLocale: string;
  name: string;
  description: string;
  publisher: string;
  shops: string;
  services: string;
  allServices: string;
  selectedServices: string;
  rewardPerOrder: string;
  totalBudget: string;
  discountType: string;
  noDiscount: string;
  fixedDiscount: string;
  percentDiscount: string;
  fixedDiscountAmount: string;
  discountRate: string;
  discountCap: string;
  minimumOrder: string;
  claimStarts: string;
  claimEnds: string;
  taskStarts: string;
  taskEnds: string;
  attributionDays: string;
  maxPerClaim: string;
  maxPerCustomer: string;
  saveDraft: string;
  saving: string;
  loading: string;
  publisherEmpty: string;
  shopEmpty: string;
  serviceEmpty: string;
  localeSummary: (sourceLocale: AffiliateContentLocale, savedLocaleCount: number) => string;
  financeSummary: (totalBudgetNdp: number) => string;
  readOnly: string;
  required: string;
};

const editorCopies: Record<Language, EditorText> = {
  zh: {
    steps: { basic: "基础", scope: "范围", reward: "奖励", timing: "时间", locales: "多语言", finance: "费用确认" },
    sourceLocale: "原始内容语言", name: "任务名称", description: "任务说明", publisher: "发布主体", shops: "适用店铺", services: "适用服务", allServices: "全部当前服务", selectedServices: "仅选择的服务", rewardPerOrder: "每个完成订单奖励", totalBudget: "佣金总预算", discountType: "用户优惠", noDiscount: "无优惠", fixedDiscount: "固定金额", percentDiscount: "比例优惠", fixedDiscountAmount: "固定优惠 JPY", discountRate: "优惠比例 bps", discountCap: "优惠上限 JPY", minimumOrder: "最低订单金额 JPY", claimStarts: "领取开始", claimEnds: "领取结束", taskStarts: "任务开始", taskEnds: "任务结束", attributionDays: "归因窗口天数", maxPerClaim: "每次领取最多完成数", maxPerCustomer: "每位用户最多完成数", saveDraft: "保存草稿", saving: "正在保存", loading: "正在读取正式任务", publisherEmpty: "没有可用发布主体", shopEmpty: "没有可用正式店铺", serviceEmpty: "所选店铺没有可用服务", localeSummary: (sourceLocale, count) => `原始语言：${sourceLocale}；已保存 ${count} 个语言版本。`, financeSummary: (budget) => `佣金预算：${budget.toLocaleString()} NDP。平台费与冻结总额以服务端提交前计算为准。`, readOnly: "当前任务为只读状态", required: "请补齐当前步骤的必填内容"
  },
  "zh-Hant": {
    steps: { basic: "基礎", scope: "範圍", reward: "獎勵", timing: "時間", locales: "多語言", finance: "費用確認" },
    sourceLocale: "原始內容語言", name: "任務名稱", description: "任務說明", publisher: "發布主體", shops: "適用店舖", services: "適用服務", allServices: "全部目前服務", selectedServices: "僅選擇的服務", rewardPerOrder: "每個完成訂單獎勵", totalBudget: "佣金總預算", discountType: "使用者優惠", noDiscount: "無優惠", fixedDiscount: "固定金額", percentDiscount: "比例優惠", fixedDiscountAmount: "固定優惠 JPY", discountRate: "優惠比例 bps", discountCap: "優惠上限 JPY", minimumOrder: "最低訂單金額 JPY", claimStarts: "領取開始", claimEnds: "領取結束", taskStarts: "任務開始", taskEnds: "任務結束", attributionDays: "歸因窗口天數", maxPerClaim: "每次領取最多完成數", maxPerCustomer: "每位使用者最多完成數", saveDraft: "儲存草稿", saving: "正在儲存", loading: "正在讀取正式任務", publisherEmpty: "沒有可用發布主體", shopEmpty: "沒有可用正式店舖", serviceEmpty: "所選店舖沒有可用服務", localeSummary: (sourceLocale, count) => `原始語言：${sourceLocale}；已儲存 ${count} 個語言版本。`, financeSummary: (budget) => `佣金預算：${budget.toLocaleString()} NDP。平台費與凍結總額以服務端提交前計算為準。`, readOnly: "目前任務為唯讀狀態", required: "請補齊目前步驟的必填內容"
  },
  ja: {
    steps: { basic: "基本", scope: "範囲", reward: "報酬", timing: "期間", locales: "多言語", finance: "費用確認" },
    sourceLocale: "原文の言語", name: "タスク名", description: "タスク説明", publisher: "公開主体", shops: "対象店舗", services: "対象サービス", allServices: "現在の全サービス", selectedServices: "選択したサービスのみ", rewardPerOrder: "完了注文ごとの報酬", totalBudget: "報酬総予算", discountType: "ユーザー割引", noDiscount: "割引なし", fixedDiscount: "固定額", percentDiscount: "割合", fixedDiscountAmount: "固定割引 JPY", discountRate: "割引率 bps", discountCap: "割引上限 JPY", minimumOrder: "最低注文額 JPY", claimStarts: "取得開始", claimEnds: "取得終了", taskStarts: "タスク開始", taskEnds: "タスク終了", attributionDays: "アトリビューション日数", maxPerClaim: "1取得あたりの完了上限", maxPerCustomer: "ユーザーごとの完了上限", saveDraft: "下書きを保存", saving: "保存中", loading: "正式タスクを読み込み中", publisherEmpty: "利用できる公開主体がありません", shopEmpty: "利用できる正式店舗がありません", serviceEmpty: "選択店舗に利用可能なサービスがありません", localeSummary: (sourceLocale, count) => `原文：${sourceLocale}、保存済み言語：${count} 件。`, financeSummary: (budget) => `報酬予算：${budget.toLocaleString()} NDP。手数料と凍結総額は送信前にサーバーで計算されます。`, readOnly: "このタスクは読み取り専用です", required: "必須項目を入力してください"
  },
  en: {
    steps: { basic: "Basic", scope: "Scope", reward: "Reward", timing: "Timing", locales: "Languages", finance: "Fee confirmation" },
    sourceLocale: "Source language", name: "Task name", description: "Task description", publisher: "Publisher", shops: "Shops", services: "Services", allServices: "All current services", selectedServices: "Selected services only", rewardPerOrder: "Reward per completed order", totalBudget: "Commission budget", discountType: "Customer discount", noDiscount: "No discount", fixedDiscount: "Fixed amount", percentDiscount: "Percentage", fixedDiscountAmount: "Fixed discount JPY", discountRate: "Discount rate bps", discountCap: "Discount cap JPY", minimumOrder: "Minimum order JPY", claimStarts: "Claim starts", claimEnds: "Claim ends", taskStarts: "Task starts", taskEnds: "Task ends", attributionDays: "Attribution window days", maxPerClaim: "Max completions per claim", maxPerCustomer: "Max completions per customer", saveDraft: "Save draft", saving: "Saving", loading: "Loading formal task", publisherEmpty: "No publisher is available", shopEmpty: "No formal shop is available", serviceEmpty: "No service is available for the selected shops", localeSummary: (sourceLocale, count) => `Source: ${sourceLocale}; ${count} language versions saved.`, financeSummary: (budget) => `Commission budget: ${budget.toLocaleString()} NDP. Platform fee and frozen total are calculated by the server before submission.`, readOnly: "This task is read-only", required: "Complete the required fields"
  },
  ko: {
    steps: { basic: "기본", scope: "범위", reward: "보상", timing: "기간", locales: "다국어", finance: "수수료 확인" },
    sourceLocale: "원문 언어", name: "작업 이름", description: "작업 설명", publisher: "게시 주체", shops: "대상 매장", services: "대상 서비스", allServices: "현재 모든 서비스", selectedServices: "선택한 서비스만", rewardPerOrder: "완료 주문당 보상", totalBudget: "커미션 총예산", discountType: "사용자 할인", noDiscount: "할인 없음", fixedDiscount: "고정 금액", percentDiscount: "비율 할인", fixedDiscountAmount: "고정 할인 JPY", discountRate: "할인율 bps", discountCap: "할인 상한 JPY", minimumOrder: "최소 주문 금액 JPY", claimStarts: "수령 시작", claimEnds: "수령 종료", taskStarts: "작업 시작", taskEnds: "작업 종료", attributionDays: "기여 기간 일수", maxPerClaim: "수령당 최대 완료 수", maxPerCustomer: "사용자당 최대 완료 수", saveDraft: "초안 저장", saving: "저장 중", loading: "정식 작업을 불러오는 중", publisherEmpty: "사용 가능한 게시 주체가 없습니다", shopEmpty: "사용 가능한 정식 매장이 없습니다", serviceEmpty: "선택한 매장에 사용 가능한 서비스가 없습니다", localeSummary: (sourceLocale, count) => `원문: ${sourceLocale}, 저장된 언어: ${count}개.`, financeSummary: (budget) => `커미션 예산: ${budget.toLocaleString()} NDP. 플랫폼 수수료와 동결 총액은 제출 전에 서버에서 계산됩니다.`, readOnly: "현재 작업은 읽기 전용입니다", required: "필수 항목을 입력해 주세요"
  }
};

type LocaleWorkflowText = {
  localeName: string;
  localeDescription: string;
  saveLocale: string;
  savingLocale: string;
  syncAll: string;
  confirmSyncTitle: string;
  confirmSyncBody: string;
  confirmSync: string;
  cancel: string;
  saveDraftFirst: string;
  localValues: string;
  reloaded: string;
};

const localeWorkflowCopies: Record<Language, LocaleWorkflowText> = {
  zh: {
    localeName: "语言版本名称",
    localeDescription: "语言版本说明",
    saveLocale: "保存当前语言",
    savingLocale: "正在保存语言",
    syncAll: "同步到全部语言",
    confirmSyncTitle: "确认覆盖全部语言",
    confirmSyncBody: "服务端会以当前语言内容覆盖其他四个语言版本。此操作仅在确认后执行。",
    confirmSync: "确认同步全部",
    cancel: "取消",
    saveDraftFirst: "请先保存任务草稿，再分别维护五种语言内容。",
    localValues: "冲突时保留的本地内容",
    reloaded: "已重新加载服务端最新版本；下方仍保留冲突前的本地内容供对比。"
  },
  "zh-Hant": {
    localeName: "語言版本名稱",
    localeDescription: "語言版本說明",
    saveLocale: "儲存目前語言",
    savingLocale: "正在儲存語言",
    syncAll: "同步至全部語言",
    confirmSyncTitle: "確認覆蓋全部語言",
    confirmSyncBody: "伺服器會以目前語言內容覆蓋其他四個語言版本。此操作僅在確認後執行。",
    confirmSync: "確認同步全部",
    cancel: "取消",
    saveDraftFirst: "請先儲存任務草稿，再分別維護五種語言內容。",
    localValues: "衝突時保留的本機內容",
    reloaded: "已重新載入伺服器最新版本；下方仍保留衝突前的本機內容以供比對。"
  },
  ja: {
    localeName: "言語別タスク名",
    localeDescription: "言語別説明",
    saveLocale: "この言語を保存",
    savingLocale: "言語を保存中",
    syncAll: "すべての言語へ同期",
    confirmSyncTitle: "全言語の上書きを確認",
    confirmSyncBody: "現在の内容で他の4言語を上書きします。確認するまでサーバーへ送信しません。",
    confirmSync: "全言語へ同期する",
    cancel: "キャンセル",
    saveDraftFirst: "先にタスクの下書きを保存してから、5言語を個別に編集してください。",
    localValues: "競合時に保持したローカル内容",
    reloaded: "サーバーの最新版を再読み込みしました。競合前のローカル内容は比較用に下へ保持しています。"
  },
  en: {
    localeName: "Localized task name",
    localeDescription: "Localized description",
    saveLocale: "Save this language",
    savingLocale: "Saving language",
    syncAll: "Sync to all languages",
    confirmSyncTitle: "Confirm all-language overwrite",
    confirmSyncBody: "The server will overwrite the other four languages with this content. Nothing is sent until you confirm.",
    confirmSync: "Confirm sync all",
    cancel: "Cancel",
    saveDraftFirst: "Save the task draft first, then maintain each of the five languages independently.",
    localValues: "Local content preserved at conflict",
    reloaded: "The latest server version is loaded. The pre-conflict local content remains below for comparison."
  },
  ko: {
    localeName: "언어별 작업 이름",
    localeDescription: "언어별 설명",
    saveLocale: "현재 언어 저장",
    savingLocale: "언어 저장 중",
    syncAll: "모든 언어에 동기화",
    confirmSyncTitle: "모든 언어 덮어쓰기 확인",
    confirmSyncBody: "현재 내용으로 다른 네 언어를 덮어씁니다. 확인 전에는 서버로 전송하지 않습니다.",
    confirmSync: "전체 언어 동기화 확인",
    cancel: "취소",
    saveDraftFirst: "먼저 작업 초안을 저장한 다음 다섯 언어를 각각 관리해 주세요.",
    localValues: "충돌 시 보존된 로컬 내용",
    reloaded: "서버 최신 버전을 다시 불러왔습니다. 충돌 전 로컬 내용은 비교를 위해 아래에 유지됩니다."
  }
};

const localeOptions: Array<{ value: AffiliateContentLocale; label: string }> = [
  { value: "ja", label: "日本語" },
  { value: "en", label: "English" },
  { value: "ko", label: "한국어" },
  { value: "zh-TW", label: "繁體中文" },
  { value: "zh-CN", label: "简体中文" }
];

const inputClassName =
  "focus-ring mt-2 h-11 w-full rounded-lg border border-line bg-white px-3 text-sm font-bold text-ink outline-none disabled:cursor-not-allowed disabled:bg-paper disabled:text-ink/45";

const nowPlusDays = (days: number): string => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCSeconds(0, 0);
  return date.toISOString();
};

const createInitialForm = (): MerchantAffiliateTaskForm => ({
  taskId: null,
  taskCode: null,
  lockVersion: null,
  publisherType: "shop",
  merchantAccountId: null,
  shopIds: [],
  selectedServiceIds: [],
  sourceLocale: "ja",
  name: "",
  description: "",
  coverMediaAssetId: null,
  rewardNdpPerCompletedOrder: 1_000,
  totalBudgetNdp: 100_000,
  customerDiscountType: "none",
  fixedDiscountJpy: 0,
  discountRateBps: 0,
  discountCapJpy: 0,
  minimumOrderAmountJpy: 0,
  claimStartsAt: nowPlusDays(1),
  claimEndsAt: nowPlusDays(21),
  taskStartsAt: nowPlusDays(1),
  taskEndsAt: nowPlusDays(30),
  attributionWindowDays: 30,
  maxCompletedOrdersPerClaim: null,
  maxCompletedOrdersPerCustomer: 1,
  serviceScopeMode: "all_current_services",
  translations: {},
  feePreview: null
});

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="block text-xs font-black text-ink/55">
      {label}
      {children}
    </label>
  );
}

export function MerchantAffiliateTaskEditor({
  canWrite,
  onPersisted,
  taskId
}: {
  canWrite: boolean;
  onPersisted: (task: MerchantAffiliateTask) => void;
  taskId: number | null;
}) {
  const { language } = useI18n();
  const copy = getMerchantAffiliateTaskCopy(language);
  const text = editorCopies[language];
  const localeText = localeWorkflowCopies[language];
  const [activeStep, setActiveStep] = useState<EditorStep>("basic");
  const [activeLocale, setActiveLocale] = useState<AffiliateContentLocale>("ja");
  const [form, setForm] = useState<MerchantAffiliateTaskForm>(createInitialForm);
  const [localeState, setLocaleState] = useState<MerchantAffiliateLocaleEditorState>(
    emptyLocaleEditorState
  );
  const [taskStatus, setTaskStatus] = useState<MerchantAffiliateTaskStatus>("draft");
  const [publishers, setPublishers] = useState<MerchantAffiliatePublisherOption[]>([]);
  const [shops, setShops] = useState<MerchantAffiliateShopOption[]>([]);
  const [services, setServices] = useState<MerchantAffiliateServiceOption[]>([]);
  const [loadStatus, setLoadStatus] = useState<"loading" | "ready" | "error">(
    taskId ? "loading" : "ready"
  );
  const [resourceError, setResourceError] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving">("idle");
  const [localeSaveStatus, setLocaleSaveStatus] = useState<"idle" | "saving">("idle");
  const [saveError, setSaveError] = useState("");
  const [syncConfirmOpen, setSyncConfirmOpen] = useState(false);
  const [conflict, setConflict] = useState<EditorConflict | null>(null);
  const [reloadStatus, setReloadStatus] = useState<"idle" | "loading">("idle");
  const readOnly = !canWrite || taskStatus !== "draft";

  useEffect(() => {
    let cancelled = false;
    merchantAffiliateTasksApi
      .listPublishers({ page: 1, pageSize: 20 })
      .then((result) => {
        if (cancelled) return;
        setPublishers(result.list);
        if (taskId === null) {
          const current = result.list.find((publisher) => publisher.current) ?? result.list[0];
          if (current) setForm((existing) => changePublisher(existing, current));
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setResourceError(describeMerchantAffiliateTaskError(error, language));
      });
    return () => {
      cancelled = true;
    };
  }, [language, taskId]);

  useEffect(() => {
    if (taskId === null) {
      setLoadStatus("ready");
      return;
    }
    let cancelled = false;
    setLoadStatus("loading");
    merchantAffiliateTasksApi
      .getTask(taskId)
      .then((task) => {
        if (cancelled) return;
        setForm(taskToForm(task));
        setLocaleState(taskToLocaleEditorState(task));
        setTaskStatus(task.status);
        setLoadStatus("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setResourceError(describeMerchantAffiliateTaskError(error, language));
        setLoadStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [language, taskId]);

  useEffect(() => {
    let cancelled = false;
    const query =
      form.publisherType === "shop"
        ? { publisherType: "shop" as const, page: 1, pageSize: 100 }
        : form.merchantAccountId
          ? {
              publisherType: "merchant_account" as const,
              merchantAccountId: form.merchantAccountId,
              page: 1,
              pageSize: 100
            }
          : null;
    if (!query) {
      setShops([]);
      return;
    }
    merchantAffiliateTasksApi
      .listShops(query)
      .then((result) => {
        if (cancelled) return;
        setShops(result.list);
        if (form.publisherType === "shop" && taskId === null) {
          setForm((existing) => ({
            ...existing,
            shopIds: result.list.map((shop) => shop.shopId),
            feePreview: null
          }));
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setResourceError(describeMerchantAffiliateTaskError(error, language));
      });
    return () => {
      cancelled = true;
    };
  }, [form.merchantAccountId, form.publisherType, language, taskId]);

  const shopIdsKey = [...form.shopIds].sort((left, right) => left - right).join(",");
  useEffect(() => {
    let cancelled = false;
    if (!shopIdsKey) {
      setServices([]);
      return;
    }
    const query =
      form.publisherType === "shop"
        ? {
            publisherType: "shop" as const,
            shopIds: shopIdsKey,
            page: 1,
            pageSize: 100
          }
        : form.merchantAccountId
          ? {
              publisherType: "merchant_account" as const,
              merchantAccountId: form.merchantAccountId,
              shopIds: shopIdsKey,
              page: 1,
              pageSize: 100
            }
          : null;
    if (!query) return;
    merchantAffiliateTasksApi
      .listServices(query)
      .then((result) => {
        if (!cancelled) setServices(result.list);
      })
      .catch((error: unknown) => {
        if (!cancelled) setResourceError(describeMerchantAffiliateTaskError(error, language));
      });
    return () => {
      cancelled = true;
    };
  }, [form.merchantAccountId, form.publisherType, language, shopIdsKey]);

  const selectedPublisherValue =
    form.publisherType === "shop"
      ? `shop:${publishers.find((publisher) => publisher.publisherType === "shop")?.shopId ?? ""}`
      : `merchant_account:${form.merchantAccountId ?? ""}`;
  const visibleServices = services.filter((service) => form.shopIds.includes(service.shopId));
  const valid = useMemo(
    () =>
      form.name.trim().length > 0 &&
      form.rewardNdpPerCompletedOrder > 0 &&
      form.totalBudgetNdp > 0 &&
      Boolean(form.claimStartsAt && form.claimEndsAt && form.taskStartsAt && form.taskEndsAt) &&
      (form.publisherType === "shop" ||
        (form.merchantAccountId !== null && form.shopIds.length > 0)) &&
      (form.serviceScopeMode === "all_current_services" || form.selectedServiceIds.length > 0),
    [form]
  );

  const selectPublisher = (value: string) => {
    const publisher = publishers.find((option) => {
      const key =
        option.publisherType === "shop"
          ? `shop:${option.shopId ?? ""}`
          : `merchant_account:${option.merchantAccountId ?? ""}`;
      return key === value;
    });
    if (publisher) setForm((current) => changePublisher(current, publisher));
  };

  const toggleShop = (shopId: number, checked: boolean) => {
    setForm((current) => {
      if (!checked) return removeShop(current, shopId, services);
      return {
        ...current,
        shopIds: [...new Set([...current.shopIds, shopId])].sort((left, right) => left - right),
        feePreview: null
      };
    });
  };

  const toggleService = (serviceId: number, checked: boolean) => {
    setForm((current) => ({
      ...current,
      selectedServiceIds: checked
        ? [...new Set([...current.selectedServiceIds, serviceId])].sort((left, right) => left - right)
        : current.selectedServiceIds.filter((currentId) => currentId !== serviceId),
      feePreview: null
    }));
  };

  const setNumber = (key: keyof MerchantAffiliateTaskForm, value: string) => {
    const parsed = value === "" ? 0 : Number(value);
    setForm((current) => ({ ...current, [key]: Number.isFinite(parsed) ? parsed : 0, feePreview: null }));
  };

  const save = async () => {
    if (readOnly || saveStatus === "saving") return;
    if (!valid) {
      setSaveError(text.required);
      return;
    }
    setSaveStatus("saving");
    setSaveError("");
    try {
      const persisted =
        form.taskId === null
          ? await merchantAffiliateTasksApi.createDraft(buildCreatePayload(form))
          : await merchantAffiliateTasksApi.updateDraft(form.taskId, buildUpdatePayload(form));
      setForm(taskToForm(persisted));
      setLocaleState(taskToLocaleEditorState(persisted));
      setTaskStatus(persisted.status);
      onPersisted(persisted);
    } catch (error: unknown) {
      if (error instanceof ApiClientError && error.code === 40918) {
        setConflict({
          localForm: form,
          localeState,
          message: copy.conflictMessage,
          reloaded: false
        });
      }
      setSaveError(describeMerchantAffiliateTaskError(error, language));
    } finally {
      setSaveStatus("idle");
    }
  };

  const updateLocaleValue = (
    key: "name" | "description",
    value: string
  ) => {
    setLocaleState((current) => ({
      ...current,
      [activeLocale]: {
        ...current[activeLocale],
        [key]: value,
        dirty: true
      }
    }));
  };

  const persistLocale = async (syncToAll: boolean) => {
    if (
      readOnly ||
      form.taskId === null ||
      form.lockVersion === null ||
      localeSaveStatus === "saving"
    ) return;
    const currentLocale = localeState[activeLocale];
    if (!currentLocale.name.trim()) {
      setSaveError(text.required);
      return;
    }
    setLocaleSaveStatus("saving");
    setSaveError("");
    try {
      const persisted = await merchantAffiliateTasksApi.updateLocale(
        form.taskId,
        activeLocale,
        {
          lockVersion: form.lockVersion,
          name: currentLocale.name.trim(),
          description: currentLocale.description.trim() || null,
          syncToAll
        }
      );
      setForm(taskToForm(persisted));
      setLocaleState(taskToLocaleEditorState(persisted));
      setTaskStatus(persisted.status);
      setSyncConfirmOpen(false);
      onPersisted(persisted);
    } catch (error: unknown) {
      if (error instanceof ApiClientError && error.code === 40918) {
        setConflict({
          localForm: form,
          localeState,
          message: copy.conflictMessage,
          reloaded: false
        });
      }
      setSaveError(describeMerchantAffiliateTaskError(error, language));
    } finally {
      setLocaleSaveStatus("idle");
    }
  };

  const reloadLatest = async () => {
    if (form.taskId === null || reloadStatus === "loading") return;
    setReloadStatus("loading");
    setSaveError("");
    try {
      const latest = await merchantAffiliateTasksApi.getTask(form.taskId);
      setForm(taskToForm(latest));
      setLocaleState(taskToLocaleEditorState(latest));
      setTaskStatus(latest.status);
      setConflict((current) => current ? { ...current, reloaded: true } : current);
      onPersisted(latest);
    } catch (error: unknown) {
      setSaveError(describeMerchantAffiliateTaskError(error, language));
    } finally {
      setReloadStatus("idle");
    }
  };

  if (loadStatus === "loading") {
    return <p className="py-12 text-center text-sm font-black text-ink/55">{text.loading}</p>;
  }
  if (loadStatus === "error") {
    return <p className="py-12 text-center text-sm font-black text-coral">{resourceError}</p>;
  }

  return (
    <div className="space-y-5" data-fee-preview={form.feePreview ? "ready" : "empty"}>
      <nav className="grid grid-cols-3 gap-2 border-b border-line pb-4 sm:grid-cols-6">
        {editorSteps.map((step, index) => (
          <button
            className={cn(
              "focus-ring rounded-lg border px-2 py-2 text-xs font-black",
              step === activeStep ? "border-ink bg-ink text-white" : "border-line bg-paper text-ink/55"
            )}
            data-step={step}
            key={step}
            onClick={() => setActiveStep(step)}
            type="button"
          >
            <span className="block text-[10px] opacity-55">0{index + 1}</span>
            {text.steps[step]}
          </button>
        ))}
      </nav>

      {resourceError ? <p className="rounded-lg border border-coral/25 bg-coral/5 px-3 py-2 text-sm font-bold text-coral">{resourceError}</p> : null}
      {readOnly ? <p className="rounded-lg border border-sky/30 bg-sky/10 px-3 py-2 text-sm font-black text-[#245a80]">{text.readOnly}</p> : null}
      {conflict ? (
        <section
          className="rounded-xl border border-amber-400/45 bg-amber-50 px-4 py-4"
          data-conflict-panel
          role="alert"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-black text-amber-950">{copy.conflictTitle}</h3>
              <p className="mt-1 text-sm font-bold text-amber-900/70">{conflict.message}</p>
              {conflict.reloaded ? (
                <p className="mt-2 text-xs font-black text-amber-900/70">{localeText.reloaded}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                data-action="reload-affiliate-task"
                disabled={reloadStatus === "loading"}
                onClick={() => void reloadLatest()}
                variant="secondary"
              >
                {copy.reloadCurrent}
              </Button>
              <Button onClick={() => setConflict(null)} variant="secondary">
                {copy.closeConflict}
              </Button>
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-amber-300/50 bg-white/70 px-3 py-3" data-conflict-local>
            <p className="text-xs font-black text-amber-950/60">{localeText.localValues}</p>
            <p className="mt-1 text-sm font-black text-amber-950">{conflict.localForm.name}</p>
            {affiliateLocaleOrder
              .filter((locale) => conflict.localeState[locale].dirty)
              .map((locale) => (
                <p className="mt-1 text-sm font-bold text-amber-950/80" key={locale}>
                  {locale}: {conflict.localeState[locale].name}
                </p>
              ))}
          </div>
        </section>
      ) : null}

      {activeStep === "basic" ? (
        <section className="grid gap-4">
          <Field label={text.sourceLocale}>
            <select
              className={inputClassName}
              disabled={readOnly || form.taskId !== null}
              onChange={(event) => setForm((current) => ({ ...current, sourceLocale: event.target.value as AffiliateContentLocale }))}
              value={form.sourceLocale}
            >
              {localeOptions.map((locale) => <option key={locale.value} value={locale.value}>{locale.label}</option>)}
            </select>
          </Field>
          <Field label={text.name}>
            <input className={inputClassName} data-field="name" disabled={readOnly} maxLength={160} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} value={form.name} />
          </Field>
          <Field label={text.description}>
            <textarea className="focus-ring mt-2 min-h-32 w-full rounded-lg border border-line bg-white px-3 py-3 text-sm font-bold text-ink outline-none disabled:bg-paper" disabled={readOnly} maxLength={5000} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} value={form.description} />
          </Field>
        </section>
      ) : null}

      {activeStep === "scope" ? (
        <section className="space-y-5">
          <Field label={text.publisher}>
            <select className={inputClassName} data-field="publisher" disabled={readOnly || form.taskId !== null} onChange={(event) => selectPublisher(event.target.value)} value={selectedPublisherValue}>
              {publishers.length === 0 ? <option value="">{text.publisherEmpty}</option> : null}
              {publishers.map((publisher) => {
                const value = publisher.publisherType === "shop" ? `shop:${publisher.shopId}` : `merchant_account:${publisher.merchantAccountId}`;
                return <option key={value} value={value}>{publisher.displayName}</option>;
              })}
            </select>
          </Field>
          <div>
            <h3 className="text-xs font-black text-ink/55">{text.shops}</h3>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {shops.length === 0 ? <p className="text-sm font-bold text-ink/45">{text.shopEmpty}</p> : shops.map((shop) => (
                <label className="rounded-lg border border-line bg-paper px-3 py-3" key={shop.publicId}>
                  <span className="flex items-start gap-3">
                    <input checked={form.shopIds.includes(shop.shopId)} className="mt-1" data-shop-public-id={shop.publicId} disabled={readOnly || form.publisherType === "shop"} onChange={(event) => toggleShop(shop.shopId, event.target.checked)} type="checkbox" />
                    <span className="min-w-0">
                      <strong className="block text-sm text-ink">{shop.name}</strong>
                      <span className="mt-1 inline-flex rounded-md border border-moss/25 bg-mint/10 px-2 py-0.5 font-mono text-[11px] font-black text-[#2f6846]">{shop.publicId}</span>
                      <span className="mt-1 block text-xs font-bold text-ink/45">{shop.city}</span>
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <Field label={text.services}>
            <select className={inputClassName} data-field="serviceScopeMode" disabled={readOnly} onChange={(event) => setForm((current) => ({ ...current, serviceScopeMode: event.target.value as MerchantAffiliateTaskForm["serviceScopeMode"], selectedServiceIds: [], feePreview: null }))} value={form.serviceScopeMode}>
              <option value="all_current_services">{text.allServices}</option>
              <option value="selected_services">{text.selectedServices}</option>
            </select>
          </Field>
          {form.serviceScopeMode === "selected_services" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {visibleServices.length === 0 ? <p className="text-sm font-bold text-ink/45">{text.serviceEmpty}</p> : visibleServices.map((service) => (
                <label className="rounded-lg border border-line bg-white px-3 py-3" key={`${service.shopPublicId}:${service.serviceName}`}>
                  <span className="flex items-start gap-3">
                    <input checked={form.selectedServiceIds.includes(service.serviceId)} className="mt-1" data-service-name={service.serviceName} disabled={readOnly} onChange={(event) => toggleService(service.serviceId, event.target.checked)} type="checkbox" />
                    <span>
                      <strong className="block text-sm text-ink">{service.serviceName}</strong>
                      <span className="mt-1 block text-xs font-bold text-ink/55">{service.priceJpy.toLocaleString(copy.locale)} JPY · {service.shopName}</span>
                    </span>
                  </span>
                </label>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {activeStep === "reward" ? (
        <section className="grid gap-4 sm:grid-cols-2">
          <Field label={text.rewardPerOrder}><input className={inputClassName} disabled={readOnly} inputMode="numeric" min={1} onChange={(event) => setNumber("rewardNdpPerCompletedOrder", event.target.value)} type="number" value={form.rewardNdpPerCompletedOrder} /></Field>
          <Field label={text.totalBudget}><input className={inputClassName} disabled={readOnly} inputMode="numeric" min={1} onChange={(event) => setNumber("totalBudgetNdp", event.target.value)} type="number" value={form.totalBudgetNdp} /></Field>
          <Field label={text.discountType}><select className={inputClassName} disabled={readOnly} onChange={(event) => setForm((current) => ({ ...current, customerDiscountType: event.target.value as MerchantAffiliateTaskForm["customerDiscountType"], fixedDiscountJpy: 0, discountRateBps: 0, discountCapJpy: 0, feePreview: null }))} value={form.customerDiscountType}><option value="none">{text.noDiscount}</option><option value="fixed_jpy">{text.fixedDiscount}</option><option value="percent">{text.percentDiscount}</option></select></Field>
          {form.customerDiscountType === "fixed_jpy" ? <Field label={text.fixedDiscountAmount}><input className={inputClassName} disabled={readOnly} inputMode="numeric" min={0} onChange={(event) => setNumber("fixedDiscountJpy", event.target.value)} type="number" value={form.fixedDiscountJpy} /></Field> : null}
          {form.customerDiscountType === "percent" ? <><Field label={text.discountRate}><input className={inputClassName} disabled={readOnly} inputMode="numeric" min={1} onChange={(event) => setNumber("discountRateBps", event.target.value)} type="number" value={form.discountRateBps} /></Field><Field label={text.discountCap}><input className={inputClassName} disabled={readOnly} inputMode="numeric" min={0} onChange={(event) => setNumber("discountCapJpy", event.target.value)} type="number" value={form.discountCapJpy} /></Field></> : null}
          <Field label={text.minimumOrder}><input className={inputClassName} disabled={readOnly} inputMode="numeric" min={0} onChange={(event) => setNumber("minimumOrderAmountJpy", event.target.value)} type="number" value={form.minimumOrderAmountJpy} /></Field>
        </section>
      ) : null}

      {activeStep === "timing" ? (
        <section className="grid gap-4 sm:grid-cols-2">
          {([ ["claimStartsAt", text.claimStarts], ["claimEndsAt", text.claimEnds], ["taskStartsAt", text.taskStarts], ["taskEndsAt", text.taskEnds] ] as const).map(([key, label]) => <Field key={key} label={label}><input className={inputClassName} disabled={readOnly} onChange={(event) => setForm((current) => ({ ...current, [key]: dateTimeLocalToIso(event.target.value), feePreview: null }))} type="datetime-local" value={isoToDateTimeLocal(form[key])} /></Field>)}
          <Field label={text.attributionDays}><input className={inputClassName} disabled={readOnly} inputMode="numeric" min={1} onChange={(event) => setNumber("attributionWindowDays", event.target.value)} type="number" value={form.attributionWindowDays} /></Field>
          <Field label={text.maxPerClaim}><input className={inputClassName} disabled={readOnly} inputMode="numeric" min={1} onChange={(event) => setForm((current) => ({ ...current, maxCompletedOrdersPerClaim: event.target.value === "" ? null : Number(event.target.value) }))} type="number" value={form.maxCompletedOrdersPerClaim ?? ""} /></Field>
          <Field label={text.maxPerCustomer}><input className={inputClassName} disabled={readOnly} inputMode="numeric" min={1} onChange={(event) => setForm((current) => ({ ...current, maxCompletedOrdersPerCustomer: event.target.value === "" ? null : Number(event.target.value) }))} type="number" value={form.maxCompletedOrdersPerCustomer ?? ""} /></Field>
        </section>
      ) : null}

      {activeStep === "locales" ? (
        <section className="space-y-4" data-locale-editor>
          <p className="rounded-lg border border-line bg-paper px-3 py-3 text-sm font-black text-ink/55">
            {text.localeSummary(form.sourceLocale, Object.keys(form.translations).length)}
          </p>
          {form.taskId === null ? (
            <p className="rounded-lg border border-sky/30 bg-sky/10 px-3 py-3 text-sm font-black text-[#245a80]">
              {localeText.saveDraftFirst}
            </p>
          ) : (
            <>
              <nav className="flex flex-wrap gap-2" aria-label={text.steps.locales}>
                {affiliateLocaleOrder.map((locale) => (
                  <button
                    className={cn(
                      "focus-ring rounded-lg border px-3 py-2 text-xs font-black",
                      activeLocale === locale
                        ? "border-moss bg-mint/15 text-[#2f6846]"
                        : "border-line bg-white text-ink/55"
                    )}
                    data-locale-code={locale}
                    key={locale}
                    onClick={() => {
                      setActiveLocale(locale);
                      setSyncConfirmOpen(false);
                    }}
                    type="button"
                  >
                    {locale}
                  </button>
                ))}
              </nav>
              <div className="grid gap-4">
                <Field label={localeText.localeName}>
                  <input
                    className={inputClassName}
                    data-locale-name={activeLocale}
                    disabled={readOnly}
                    maxLength={160}
                    onChange={(event) => updateLocaleValue("name", event.target.value)}
                    value={localeState[activeLocale].name}
                  />
                </Field>
                <Field label={localeText.localeDescription}>
                  <textarea
                    className="focus-ring mt-2 min-h-32 w-full rounded-lg border border-line bg-white px-3 py-3 text-sm font-bold text-ink outline-none disabled:bg-paper"
                    data-locale-description={activeLocale}
                    disabled={readOnly}
                    maxLength={5000}
                    onChange={(event) => updateLocaleValue("description", event.target.value)}
                    value={localeState[activeLocale].description}
                  />
                </Field>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  data-action="save-affiliate-locale"
                  disabled={readOnly || localeSaveStatus === "saving"}
                  onClick={() => void persistLocale(false)}
                  variant="secondary"
                >
                  {localeSaveStatus === "saving" ? localeText.savingLocale : localeText.saveLocale}
                </Button>
                <Button
                  data-action="sync-affiliate-locales"
                  disabled={readOnly || localeSaveStatus === "saving"}
                  onClick={() => setSyncConfirmOpen(true)}
                >
                  {localeText.syncAll}
                </Button>
              </div>
              {syncConfirmOpen ? (
                <section className="rounded-xl border border-coral/25 bg-coral/5 px-4 py-4">
                  <h3 className="font-black text-ink">{localeText.confirmSyncTitle}</h3>
                  <p className="mt-1 text-sm font-bold text-ink/55">{localeText.confirmSyncBody}</p>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <Button onClick={() => setSyncConfirmOpen(false)} variant="secondary">
                      {localeText.cancel}
                    </Button>
                    <Button
                      data-action="confirm-sync-affiliate-locales"
                      disabled={localeSaveStatus === "saving"}
                      onClick={() => void persistLocale(true)}
                    >
                      {localeText.confirmSync}
                    </Button>
                  </div>
                </section>
              ) : null}
            </>
          )}
        </section>
      ) : null}
      {activeStep === "finance" ? <p className="rounded-lg border border-line bg-paper px-4 py-6 text-sm font-black text-ink/55">{text.financeSummary(form.totalBudgetNdp)}</p> : null}

      {saveError ? <p className="rounded-lg border border-coral/25 bg-coral/5 px-3 py-2 text-sm font-bold text-coral" role="alert">{saveError}</p> : null}
      {activeStep !== "locales" ? (
        <div className="sticky bottom-0 flex justify-end border-t border-line bg-white/95 pt-4 backdrop-blur">
          <Button data-action="save-affiliate-draft" disabled={readOnly || saveStatus === "saving"} onClick={() => void save()}>
            {saveStatus === "saving" ? text.saving : text.saveDraft}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
