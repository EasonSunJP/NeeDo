const workbookColumns = [
  { key: "zh", header: "简体中文" },
  { key: "zh-Hant", header: "繁体中文" },
  { key: "ja", header: "日语" },
  { key: "en", header: "英语" },
  { key: "ko", header: "韩语" }
];

const featureSheetDefinitions = [
  { key: "common", title: "通用" },
  { key: "shell", title: "入口壳子" },
  { key: "user", title: "用户端" },
  { key: "merchant", title: "商户端" },
  { key: "technician", title: "技师端" },
  { key: "needo", title: "NeeDo广场" },
  { key: "admin", title: "平台后台" },
  { key: "merchantAdmin", title: "商户后台" },
  { key: "scheduling", title: "排班调度" },
  { key: "messaging", title: "消息通讯" },
  { key: "social", title: "动态社交" },
  { key: "settings", title: "设置" },
  { key: "mock", title: "测试数据" },
  { key: "backend", title: "后端脚本" },
  { key: "uncategorized", title: "未归类" }
];

const featureSheetMap = new Map(featureSheetDefinitions.map((item, index) => [item.key, { ...item, index }]));

const schedulingFileHints = [
  "/src/lib/dispatchCalendar.ts",
  "/src/lib/oneClickSchedule.ts",
  "/src/lib/scheduleAutomation.ts",
  "/src/lib/shiftPlanning.ts",
  "/src/lib/scheduling/",
  "/src/state/shiftPlanningStore.ts",
  "/src/state/technicianScheduleStore.ts",
  "/src/state/scheduleStore.ts"
];

const messagingFileHints = [
  "/src/lib/messageCenter.ts",
  "/src/lib/contactDirectory.ts",
  "/src/lib/forwardContacts.ts",
  "/src/components/mobile/MobileMessageCenter.tsx",
  "/src/components/mobile/ConversationListCard.tsx",
  "/src/components/mobile/ChatConversationInfoCard.tsx",
  "/src/components/mobile/ContactDirectory.tsx",
  "/src/components/ui/ConversationListItem.tsx",
  "/src/pages/user/MessagesPage.tsx",
  "/src/pages/user/ContactsPage.tsx"
];

const shellFileHints = [
  "/src/App.tsx",
  "/src/main.tsx",
  "/src/auth/AuthProvider.tsx",
  "/src/auth/featurePermissions.ts"
];

const mockFileHints = [
  "/src/data/",
  "/src/auth/demoAccount.ts",
  "/src/lib/detailProfiles.ts",
  "/src/features/im/seed.ts",
  "/src/features/im/seed.test.ts",
  "/src/lib/share.test.ts",
  "/src/lib/browserStorage.test.ts",
  "/src/lib/shiftPlanning.test.ts",
  "/src/lib/technicianWorkAnalytics.test.ts",
  "/src/theme/ClientThemeProvider.test.ts"
];

function normalizePath(filePath) {
  return String(filePath).replace(/\\/g, "/");
}

function hasHint(filePath, hints) {
  return hints.some((hint) => filePath.includes(hint));
}

export function inferFeatureKey(filePath) {
  const normalized = normalizePath(filePath);

  if (normalized.includes("/scripts/")) {
    return "backend";
  }

  if (hasHint(normalized, mockFileHints)) {
    return "mock";
  }

  if (normalized.includes("/src/features/settings/") || normalized.includes("/src/pages/user/UserSettingsPages.tsx") || normalized.includes("/src/components/ui/LanguageSwitcher.tsx") || normalized.includes("/src/components/mobile/MobilePreferencePanel.tsx")) {
    return "settings";
  }

  if (normalized.includes("/src/features/social/") || normalized.includes("/src/pages/mobile/MomentsPage.tsx")) {
    return "social";
  }

  if (normalized.includes("/src/features/im/") || hasHint(normalized, messagingFileHints)) {
    return "messaging";
  }

  if (normalized.includes("/src/features/scheduling/") || normalized.includes("/src/features/dispatch-center/") || normalized.includes("/src/components/scheduling/") || hasHint(normalized, schedulingFileHints)) {
    return "scheduling";
  }

  if (normalized.includes("/src/pages/merchant-admin/") || normalized.includes("/src/components/merchant-admin/")) {
    return "merchantAdmin";
  }

  if (normalized.includes("/src/pages/admin/") || normalized.includes("/src/components/admin/")) {
    return "admin";
  }

  if (normalized.includes("/src/pages/mobile/Needo")) {
    return "needo";
  }

  if (normalized.includes("/src/pages/mobile/Technician") || normalized.includes("/src/features/technician-schedule/")) {
    return "technician";
  }

  if (normalized.includes("/src/pages/mobile/Merchant")) {
    return "merchant";
  }

  if (normalized.includes("/src/pages/user/") || normalized.includes("/src/components/client-ui/") || normalized.includes("/src/shared/")) {
    return "user";
  }

  if (hasHint(normalized, shellFileHints)) {
    return "shell";
  }

  if (normalized.includes("/src/")) {
    return "common";
  }

  return "uncategorized";
}

export function getFeatureSheetDefinition(featureKey) {
  return featureSheetMap.get(featureKey) ?? featureSheetMap.get("uncategorized");
}

export function getFeatureSheetTitle(featureKey) {
  return getFeatureSheetDefinition(featureKey).title;
}

export function compareFeatureKeys(left, right) {
  return getFeatureSheetDefinition(left).index - getFeatureSheetDefinition(right).index;
}

export const workbookLanguageHeaders = workbookColumns.map((item) => item.header);
export const workbookUsageHeader = "使用位置";
export const workbookDisplayByteLimitHeader = "最多显示字节数（UTF-8）";
export const workbookHeaders = [...workbookLanguageHeaders, workbookUsageHeader, workbookDisplayByteLimitHeader];
export const workbookLanguageColumns = workbookColumns;
export const workbookFeatureSheets = featureSheetDefinitions;
