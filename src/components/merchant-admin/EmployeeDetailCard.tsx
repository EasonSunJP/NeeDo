import { WorkStatusMetrics } from "../../features/technician-work-status/WorkStatusMetrics";
import { WorkTimeline } from "../../features/technician-work-status/WorkTimeline";
import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import type {
  EmployeePayrollSchedulePolicyInput,
  PayrollSchedulePolicyResult,
} from "../../api/payrollSchedulePolicy";
import type {
  CompensationProfilePreviewInput,
  EmployeeCompensationPreviewResult,
  EmployeeCompensationResult,
  TechnicianCompensationProfileInput,
} from "../../api/employeeCompensation";
import type {
  EmployeeRelationshipType,
  EmployeeWorkStatus,
  MerchantEmployee,
  MerchantEmployeeAffiliationUpdate,
  MerchantEmployeeProfileUpdate,
  PaginatedEmployeeTimeline,
} from "../../features/merchant-admin/employeeApi";
import { useOptionalAuth } from "../../auth/AuthProvider";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { languageLocales, translateText } from "../../i18n/translations";
import { cn } from "../../lib/utils";
import {
  FormalTabs,
  type FormalLocalization,
} from "../admin/FormalProfileDetailPanels";
import {
  FormalTimelinePagination,
  type FormalTimelinePageSize,
} from "../admin/FormalTimelinePagination";
import { AdminEventTimeline } from "../admin/AdminEventTimeline";
import type { ContactEventTimelineEntry } from "../mobile/ContactEventTimeline";
import { Badge, type BadgeTone } from "../ui/Badge";
import { Button } from "../ui/Button";
import { PayrollSchedulePolicyEditor } from "./PayrollSchedulePolicyEditor";
import { EmployeeCompensationPanel } from "./EmployeeCompensationPanel";
import { EmployeeSchedulePanel } from "./EmployeeSchedulePanel";
import { EmployeeSettlementPanel } from "./EmployeeSettlementPanel";

type SavingSection = "profile" | "affiliation" | null;

export type EmployeeDetailTab =
  | "基础资料"
  | "从属与账号"
  | "员工日程"
  | "薪酬与分成"
  | "结算记录"
  | "员工动态";

const employeeDetailTabs: EmployeeDetailTab[] = [
  "基础资料",
  "从属与账号",
  "员工日程",
  "薪酬与分成",
  "结算记录",
  "员工动态",
];

interface EmployeeDetailCardProps {
  employee: MerchantEmployee;
  saving: SavingSection;
  error: string;
  compensation: EmployeeCompensationResult | null;
  compensationError: string;
  compensationLoading: boolean;
  compensationPreview: EmployeeCompensationPreviewResult | null;
  compensationPreviewing: boolean;
  compensationSaving: boolean;
  payrollPolicy: PayrollSchedulePolicyResult | null;
  payrollPolicyError: string;
  payrollPolicyLoading: boolean;
  payrollPolicySaving: boolean;
  timeline: PaginatedEmployeeTimeline | null;
  timelineError: string;
  timelineLoading: boolean;
  onRetryPayrollPolicy: () => void;
  onRetryCompensation: () => void;
  onSaveCompensation: (
    input: TechnicianCompensationProfileInput,
  ) => Promise<void>;
  onPreviewCompensation: (
    input: CompensationProfilePreviewInput,
  ) => Promise<void>;
  onSavePayrollPolicy: (
    input: EmployeePayrollSchedulePolicyInput,
  ) => Promise<void>;
  onSaveProfile: (input: MerchantEmployeeProfileUpdate) => Promise<void>;
  onRetryTimeline: () => void;
  onTimelinePageChange: (page: number) => void;
  onTimelinePageSizeChange: (pageSize: FormalTimelinePageSize) => void;
  onSubmitTimelineComment: (message: string) => Promise<void>;
  onSaveAffiliation: (
    input: MerchantEmployeeAffiliationUpdate,
  ) => Promise<void>;
  readOnly?: boolean;
  scheduleSurface?: "desktop" | "mobile";
}

type ProfileDraft = Required<
  Pick<
    MerchantEmployeeProfileUpdate,
    "displayName" | "city" | "yearsExperience"
  >
> & {
  bio: string;
  serviceArea: string;
};

type AffiliationDraft = {
  relationshipType: EmployeeRelationshipType;
  workStatus: EmployeeWorkStatus;
};

const inputClassName =
  "h-11 w-full rounded-xl border border-line bg-white px-3 text-sm font-bold text-ink outline-none transition focus:border-moss focus:ring-2 focus:ring-moss/15 disabled:cursor-not-allowed disabled:opacity-60";
const textareaClassName = `${inputClassName} h-28 resize-y py-3`;

function createProfileDraft(employee: MerchantEmployee): ProfileDraft {
  return {
    bio: employee.profile.bio ?? "",
    city: employee.profile.city,
    displayName: employee.displayName,
    serviceArea: employee.profile.serviceArea ?? "",
    yearsExperience: employee.profile.yearsExperience,
  };
}

function createAffiliationDraft(employee: MerchantEmployee): AffiliationDraft {
  return {
    relationshipType: employee.affiliation.relationshipType,
    workStatus: employee.affiliation.workStatus,
  };
}

function relationshipLabel(_value: EmployeeRelationshipType) {
  return "合作技师";
}

function workStatusLabel(value: EmployeeWorkStatus) {
  if (value === "active") return "在职";
  if (value === "on_leave") return "休假";
  if (value === "suspended") return "停职";
  return "已离职";
}

function workStatusTone(value: EmployeeWorkStatus): BadgeTone {
  if (value === "active") return "green";
  if (value === "on_leave") return "yellow";
  if (value === "suspended" || value === "ended") return "red";
  return "neutral";
}

function verifiedLabel(employee: MerchantEmployee) {
  return employee.verifiedAt || employee.profileStatus === "verified"
    ? "已验证"
    : "未验证";
}

function compactDate(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

function localizeTimelineMessage(
  message: string,
  actorRole: string,
  language: "zh" | "zh-Hant" | "ja" | "en" | "ko",
  t: (source: string) => string,
) {
  if (actorRole === "财务备注") return message;
  if (actorRole === "基本资料" && message.startsWith("更新了")) {
    const fields = message
      .slice(3)
      .split("、")
      .map(t)
      .join(language === "en" ? ", " : language === "ja" ? "・" : "、");
    if (language === "ja") return `${fields}を更新しました`;
    if (language === "en") return `Updated ${fields}`;
    if (language === "ko") return `${fields} 업데이트`;
    return `${t("更新了")}${fields}`;
  }
  const affiliation = message.match(/^更新为(.+)，当前状态：(.+)$/);
  if (actorRole === "从属关系" && affiliation) {
    const relationship = t(affiliation[1]);
    const status = t(affiliation[2]);
    if (language === "ja") return `${relationship}、現在の状態：${status}`;
    if (language === "en")
      return `Changed to ${relationship}; current status: ${status}`;
    if (language === "ko")
      return `${relationship}(으)로 변경, 현재 상태: ${status}`;
    return `${t("更新为")}${relationship}，${t("当前状态：")}${status}`;
  }
  return t(message);
}

export function EmployeeDetailCard({
  compensation,
  compensationError,
  compensationLoading,
  compensationPreview,
  compensationPreviewing,
  compensationSaving,
  employee,
  error,
  onPreviewCompensation,
  onRetryCompensation,
  onSaveCompensation,
  onSaveAffiliation,
  onRetryPayrollPolicy,
  onSavePayrollPolicy,
  onSaveProfile,
  payrollPolicy,
  payrollPolicyError,
  payrollPolicyLoading,
  payrollPolicySaving,
  saving,
  timeline,
  timelineError,
  timelineLoading,
  onRetryTimeline,
  onTimelinePageChange,
  onTimelinePageSizeChange,
  onSubmitTimelineComment,
  readOnly = false,
  scheduleSurface = "desktop",
}: EmployeeDetailCardProps) {
  const auth = useOptionalAuth();
  const { language } = useOptionalI18n();
  const t = (source: string) => translateText(source, language);
  const [activeTab, setActiveTab] = useState<EmployeeDetailTab>("基础资料");
  const panelId = useId();
  const [profileEditing, setProfileEditing] = useState(false);
  const [affiliationEditing, setAffiliationEditing] = useState(false);
  const [profileDraft, setProfileDraft] = useState(() =>
    createProfileDraft(employee),
  );
  const [affiliationDraft, setAffiliationDraft] = useState(() =>
    createAffiliationDraft(employee),
  );
  const [copied, setCopied] = useState(false);
  const [terminationConfirmOpen, setTerminationConfirmOpen] = useState(false);
  const locale = useMemo(
    () =>
      ({
        en: "en-US",
        ja: "ja-JP",
        ko: "ko-KR",
        zh: "zh-CN",
        "zh-Hant": "zh-Hant",
      })[language],
    [language],
  );
  const tabLocalization = useMemo<FormalLocalization>(
    () => ({
      language,
      locale: languageLocales[language],
      t,
    }),
    [language],
  );

  useEffect(() => {
    setProfileDraft(createProfileDraft(employee));
    setAffiliationDraft(createAffiliationDraft(employee));
    setTerminationConfirmOpen(false);
  }, [employee]);

  useEffect(() => {
    if (readOnly) {
      setProfileEditing(false);
      setAffiliationEditing(false);
    }
  }, [readOnly]);

  const resetProfile = () => {
    setProfileDraft(createProfileDraft(employee));
    setProfileEditing(false);
  };

  const resetAffiliation = () => {
    setAffiliationDraft(createAffiliationDraft(employee));
    setAffiliationEditing(false);
  };

  const copyNeedoId = async () => {
    try {
      await navigator.clipboard?.writeText(employee.needoId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const submitProfile = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await onSaveProfile({
        bio: profileDraft.bio.trim() || null,
        city: profileDraft.city.trim(),
        displayName: profileDraft.displayName.trim(),
        serviceArea: profileDraft.serviceArea.trim() || null,
        yearsExperience: Number(profileDraft.yearsExperience),
      });
      setProfileEditing(false);
    } catch {
      // Keep the server-rejected draft in place so the user can correct and retry it.
    }
  };

  const submitAffiliation = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await onSaveAffiliation({
        endsAt: employee.affiliation.endsAt,
        relationshipType: affiliationDraft.relationshipType,
        startsAt: employee.affiliation.startsAt,
        workStatus: affiliationDraft.workStatus,
      });
      setAffiliationEditing(false);
    } catch {
      // Keep the server-rejected draft in place so the user can correct and retry it.
    }
  };

  const terminateAffiliation = async () => {
    try {
      await onSaveAffiliation({
        endsAt: new Date().toISOString(),
        relationshipType: employee.affiliation.relationshipType,
        startsAt: employee.affiliation.startsAt,
        workStatus: "ended",
      });
      setTerminationConfirmOpen(false);
    } catch {
      // Keep confirmation visible so the server error can be reviewed and retried.
    }
  };

  const profileSaving = saving === "profile";
  const affiliationSaving = saving === "affiliation";
  const blocked = saving !== null || payrollPolicySaving || compensationSaving;
  const timelineEvents = useMemo<ContactEventTimelineEntry[]>(() => {
    return (timeline?.list ?? []).map((event) => ({
      actorAvatarSrc: event.actorAvatarUrl ?? undefined,
      actorName: event.actorName,
      actorRole: t(event.actorRole),
      atLabel: event.at,
      id: event.id,
      message: localizeTimelineMessage(
        event.message,
        event.actorRole,
        language,
        t,
      ),
      title: t(event.actorRole),
      tone: event.tone,
    }));
  }, [language, timeline]);

  return (
    <article className="space-y-5" data-testid="employee-detail-card">
      <section className="overflow-hidden rounded-[28px] border border-moss/20 bg-ink text-white shadow-soft">
        <div className="h-1.5 bg-gradient-to-r from-moss via-sky to-lemon" />
        <div className="grid gap-5 p-5 sm:grid-cols-[96px_minmax(0,1fr)] sm:p-6">
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-[24px] border border-white/20 bg-white/10 text-3xl font-black">
            {employee.avatarUrl ? (
              <img
                alt={employee.displayName}
                className="h-full w-full object-cover"
                src={employee.avatarUrl}
              />
            ) : (
              employee.displayName.trim().slice(0, 1).toUpperCase()
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-white/55">
                  {t("员工详细信息卡")}
                </p>
                <h3 className="mt-2 break-words text-2xl font-black tracking-tight sm:text-3xl">
                  {employee.displayName}
                </h3>
              </div>
              <div className="flex flex-col items-end gap-2">
                {!readOnly && employee.affiliation.workStatus !== "ended" ? (
                  <button
                    className="focus-ring rounded-full border border-coral/70 px-4 py-2 text-xs font-black text-coral transition hover:bg-coral/10 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={blocked}
                    onClick={() => setTerminationConfirmOpen(true)}
                    type="button"
                  >
                    {t("解约")}
                  </button>
                ) : null}
                <div className="flex flex-wrap justify-end gap-2">
                  <Badge
                    className="border border-white/10"
                    tone={workStatusTone(employee.affiliation.workStatus)}
                  >
                    {t(workStatusLabel(employee.affiliation.workStatus))}
                  </Badge>
                  <Badge className="border border-white/10" tone="blue">
                    {t(
                      relationshipLabel(employee.affiliation.relationshipType),
                    )}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2.5">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">
                NeeDoID
              </span>
              <strong className="min-w-0 flex-1 break-all font-mono text-sm tracking-wide">
                {employee.needoId}
              </strong>
              <button
                className="focus-ring rounded-full border border-white/15 px-3 py-1.5 text-xs font-black text-white/80 transition hover:bg-white/10"
                onClick={() => void copyNeedoId()}
                type="button"
              >
                {t(copied ? "已复制" : "复制")}
              </button>
            </div>
          </div>
        </div>
        <dl className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] border-t border-white/10 bg-white/[0.035]">
          {[
            ["所属店铺", employee.affiliation.shop.name],
            ["邮箱", employee.email],
            ["手机号码", employee.phone || t("未填写")],
            ["账号状态", t(employee.account.isActive ? "启用" : "停用")],
          ].map(([label, value]) => (
            <div
              className="min-w-0 border-b border-white/10 px-5 py-4 last:border-b-0 sm:border-r sm:last:border-r-0"
              key={label}
            >
              <dt className="text-[11px] font-black uppercase tracking-[0.12em] text-white/45">
                {t(label)}
              </dt>
              <dd
                className="mt-1.5 truncate text-sm font-bold text-white/90"
                title={value}
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <FormalTabs
        active={activeTab}
        idPrefix={panelId}
        items={employeeDetailTabs}
        localization={tabLocalization}
        onChange={setActiveTab}
        pageSize={4}
        variant="flat"
      />

      {error ? (
        <div
          className="rounded-2xl border border-coral/35 bg-coral/10 px-4 py-3 text-sm font-bold text-[#9b3f35]"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <section
        aria-labelledby={`${panelId}-tab-0`}
        className={cn(
          "rounded-[24px] border border-line bg-white p-5 shadow-sm sm:p-6",
          activeTab !== "基础资料" && "hidden",
        )}
        hidden={activeTab !== "基础资料"}
        id={`${panelId}-panel-0`}
        role="tabpanel"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-moss">
              01 · {t("基础信息")}
            </p>
            <h4 className="mt-1 text-xl font-black text-ink">
              {t("员工资料")}
            </h4>
          </div>
          {!readOnly && !profileEditing ? (
            <Button
              disabled={blocked}
              onClick={() => setProfileEditing(true)}
              size="sm"
              variant="secondary"
            >
              {t("编辑")}
            </Button>
          ) : null}
        </div>

        {profileEditing ? (
          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => void submitProfile(event)}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-black text-ink">
                <span className="mb-2 block">{t("姓名")}</span>
                <input
                  className={inputClassName}
                  data-testid="employee-display-name"
                  disabled={profileSaving}
                  maxLength={120}
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...current,
                      displayName: event.target.value,
                    }))
                  }
                  required
                  value={profileDraft.displayName}
                />
              </label>
              <label className="block text-sm font-black text-ink">
                <span className="mb-2 block">{t("城市")}</span>
                <input
                  className={inputClassName}
                  data-testid="employee-city"
                  disabled={profileSaving}
                  maxLength={100}
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...current,
                      city: event.target.value,
                    }))
                  }
                  required
                  value={profileDraft.city}
                />
              </label>
              <label className="block text-sm font-black text-ink">
                <span className="mb-2 block">{t("服务区域")}</span>
                <input
                  className={inputClassName}
                  data-testid="employee-service-area"
                  disabled={profileSaving}
                  maxLength={255}
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...current,
                      serviceArea: event.target.value,
                    }))
                  }
                  value={profileDraft.serviceArea}
                />
              </label>
              <label className="block text-sm font-black text-ink">
                <span className="mb-2 block">{t("从业年限")}</span>
                <input
                  className={inputClassName}
                  data-testid="employee-years-experience"
                  disabled={profileSaving}
                  max={80}
                  min={0}
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...current,
                      yearsExperience: Number(event.target.value),
                    }))
                  }
                  required
                  type="number"
                  value={profileDraft.yearsExperience}
                />
              </label>
            </div>
            <label className="block text-sm font-black text-ink">
              <span className="mb-2 block">{t("个人简介")}</span>
              <textarea
                className={textareaClassName}
                data-testid="employee-bio"
                disabled={profileSaving}
                maxLength={5000}
                onChange={(event) =>
                  setProfileDraft((current) => ({
                    ...current,
                    bio: event.target.value,
                  }))
                }
                value={profileDraft.bio}
              />
            </label>
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <Button
                disabled={profileSaving}
                onClick={resetProfile}
                size="sm"
                variant="ghost"
              >
                {t("取消")}
              </Button>
              <Button disabled={profileSaving} size="sm" type="submit">
                {profileSaving ? t("正在保存") : t("保存变更")}
              </Button>
            </div>
          </form>
        ) : (
          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            {[
              ["姓名", employee.displayName],
              ["城市", employee.profile.city],
              ["服务区域", employee.profile.serviceArea || t("未填写")],
              ["从业年限", `${employee.profile.yearsExperience} ${t("年")}`],
            ].map(([label, value]) => (
              <div
                className="rounded-2xl border border-line bg-paper/60 px-4 py-3"
                key={label}
              >
                <dt className="text-xs font-black text-ink/45">{t(label)}</dt>
                <dd className="mt-1.5 text-sm font-bold text-ink">{value}</dd>
              </div>
            ))}
            <div className="rounded-2xl border border-line bg-paper/60 px-4 py-3 sm:col-span-2">
              <dt className="text-xs font-black text-ink/45">
                {t("个人简介")}
              </dt>
              <dd className="mt-1.5 whitespace-pre-wrap text-sm font-bold leading-6 text-ink">
                {employee.profile.bio || t("未填写")}
              </dd>
            </div>
          </dl>
        )}
      </section>

      <section
        aria-labelledby={`${panelId}-tab-1`}
        className={cn(
          "rounded-[24px] border border-line bg-white p-5 shadow-sm sm:p-6",
          activeTab !== "从属与账号" && "hidden",
        )}
        hidden={activeTab !== "从属与账号"}
        id={`${panelId}-panel-1`}
        role="tabpanel"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky">
              02 · {t("从属关系")}
            </p>
            <h4 className="mt-1 text-xl font-black text-ink">
              {employee.affiliation.shop.name}
            </h4>
          </div>
          {!readOnly && !affiliationEditing ? (
            <Button
              disabled={blocked}
              onClick={() => setAffiliationEditing(true)}
              size="sm"
              variant="secondary"
            >
              {t("编辑从属关系")}
            </Button>
          ) : null}
        </div>

        {affiliationEditing ? (
          <form
            className="mt-5 space-y-4"
            onSubmit={(event) => void submitAffiliation(event)}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-black text-ink">
                <span className="mb-2 block">{t("技师分类")}</span>
                <select
                  className={inputClassName}
                  data-testid="employee-relationship-type"
                  disabled={affiliationSaving}
                  onChange={(event) =>
                    setAffiliationDraft((current) => ({
                      ...current,
                      relationshipType: event.target
                        .value as EmployeeRelationshipType,
                    }))
                  }
                  value={affiliationDraft.relationshipType}
                >
                  <option value="partner">{t("合作技师")}</option>
                </select>
              </label>
              <label className="block text-sm font-black text-ink">
                <span className="mb-2 block">{t("工作状态")}</span>
                <select
                  className={inputClassName}
                  data-testid="employee-work-status"
                  disabled={affiliationSaving}
                  onChange={(event) =>
                    setAffiliationDraft((current) => ({
                      ...current,
                      workStatus: event.target.value as EmployeeWorkStatus,
                    }))
                  }
                  value={affiliationDraft.workStatus}
                >
                  <option value="active">{t("在职")}</option>
                  <option value="on_leave">{t("休假")}</option>
                  <option value="suspended">{t("停职")}</option>
                  {employee.affiliation.workStatus === "ended" ? (
                    <option value="ended">{t("已离职")}</option>
                  ) : null}
                </select>
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <Button
                disabled={affiliationSaving}
                onClick={resetAffiliation}
                size="sm"
                variant="ghost"
              >
                {t("取消")}
              </Button>
              <Button disabled={affiliationSaving} size="sm" type="submit">
                {affiliationSaving ? t("正在保存") : t("保存从属关系")}
              </Button>
            </div>
          </form>
        ) : (
          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-line bg-paper/60 px-4 py-3">
              <dt className="text-xs font-black text-ink/45">
                {t("技师分类")}
              </dt>
              <dd className="mt-1.5 text-sm font-bold text-ink">
                {t(relationshipLabel(employee.affiliation.relationshipType))}
              </dd>
            </div>
            <div className="rounded-2xl border border-line bg-paper/60 px-4 py-3">
              <dt className="text-xs font-black text-ink/45">
                {t("工作状态")}
              </dt>
              <dd className="mt-1.5 text-sm font-bold text-ink">
                {t(workStatusLabel(employee.affiliation.workStatus))}
              </dd>
            </div>
            <div className="rounded-2xl border border-line bg-paper/60 px-4 py-3">
              <dt className="text-xs font-black text-ink/45">
                {t("开始日期")}
              </dt>
              <dd className="mt-1.5 text-sm font-bold text-ink">
                {compactDate(employee.affiliation.startsAt, locale)}
              </dd>
            </div>
            <div className="rounded-2xl border border-line bg-paper/60 px-4 py-3">
              <dt className="text-xs font-black text-ink/45">
                {t("结束日期")}
              </dt>
              <dd className="mt-1.5 text-sm font-bold text-ink">
                {employee.affiliation.endsAt
                  ? compactDate(employee.affiliation.endsAt, locale)
                  : t("未填写")}
              </dd>
            </div>
          </dl>
        )}

        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
          <Badge
            tone={
              employee.verifiedAt || employee.profileStatus === "verified"
                ? "green"
                : "yellow"
            }
          >
            {t("档案验证")} · {t(verifiedLabel(employee))}
          </Badge>
          <Badge tone={employee.account.isActive ? "green" : "red"}>
            {t("账号状态")} · {t(employee.account.isActive ? "启用" : "停用")}
          </Badge>
        </div>
      </section>

      <div
        aria-labelledby={`${panelId}-tab-5`}
        className={cn(activeTab !== "员工动态" && "hidden")}
        hidden={activeTab !== "员工动态"}
        id={`${panelId}-panel-5`}
        role="tabpanel"
      >
        {employee.technicianProfileId ? (
          <div className="mb-4 space-y-4">
            <WorkStatusMetrics
              target={{
                scope: "merchant-admin",
                technicianProfileId: employee.technicianProfileId,
              }}
            />
            <WorkTimeline
              appearance={scheduleSurface === "mobile" ? "client" : "admin"}
              target={{
                scope: "merchant-admin",
                technicianProfileId: employee.technicianProfileId,
              }}
              comments={!readOnly}
            />
          </div>
        ) : null}
        {timelineLoading ? (
          <div className="rounded-[24px] border border-line bg-white px-5 py-6 text-sm font-bold text-ink/50 shadow-sm">
            {t("正在读取员工动态...")}
          </div>
        ) : timelineError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-coral/35 bg-coral/10 px-5 py-4 text-sm font-bold text-[#9b3f35]">
            <span>{timelineError}</span>
            <Button onClick={onRetryTimeline} size="sm" variant="secondary">
              {t("重试")}
            </Button>
          </div>
        ) : (
          <AdminEventTimeline
            appearance={scheduleSurface === "mobile" ? "client" : "admin"}
            className="border-line bg-white shadow-sm"
            commentAuthorAvatarSrc={auth?.session?.avatarUrl ?? undefined}
            commentAuthorName={auth?.session?.username ?? t("当前管理员")}
            commentAuthorRole={t("员工备注")}
            commentButtonLabel={t("评论")}
            commentPlaceholder={t("写下员工档案备注...")}
            emptyLabel={t("暂无员工动态。")}
            events={timelineEvents}
            onCommentSubmit={(message) => {
              void onSubmitTimelineComment(message).catch(() => undefined);
            }}
            showCommentComposer={!readOnly}
            title={t("员工动态")}
          />
        )}
        {!timelineError && timeline ? (
          <FormalTimelinePagination
            ariaLabel="员工动态翻页"
            disabled={timelineLoading}
            onPageChange={onTimelinePageChange}
            onPageSizeChange={onTimelinePageSizeChange}
            page={timeline.page}
            pageSize={timeline.page_size}
            total={timeline.total}
          />
        ) : null}
      </div>

      <div
        aria-labelledby={`${panelId}-tab-2`}
        className={cn(activeTab !== "员工日程" && "hidden")}
        hidden={activeTab !== "员工日程"}
        id={`${panelId}-panel-2`}
        role="tabpanel"
      >
        <EmployeeSchedulePanel
          employee={employee}
          readOnly={readOnly}
          scheduleSurface={scheduleSurface}
        />
      </div>

      <div
        aria-labelledby={`${panelId}-tab-3`}
        className={cn(activeTab !== "薪酬与分成" && "hidden")}
        hidden={activeTab !== "薪酬与分成"}
        id={`${panelId}-panel-3`}
        role="tabpanel"
      >
        <EmployeeCompensationPanel
          error={compensationError}
          loading={compensationLoading}
          onPreview={onPreviewCompensation}
          onRetry={onRetryCompensation}
          onSave={onSaveCompensation}
          preview={compensationPreview}
          previewing={compensationPreviewing}
          result={compensation}
          readOnly={readOnly}
          saving={compensationSaving}
        />
      </div>

      <div
        aria-labelledby={`${panelId}-tab-4`}
        className={cn("space-y-5", activeTab !== "结算记录" && "hidden")}
        hidden={activeTab !== "结算记录"}
        id={`${panelId}-panel-4`}
        role="tabpanel"
      >
        <EmployeeSettlementPanel
          error={compensationError}
          loading={compensationLoading}
          onRetry={onRetryCompensation}
          result={compensation}
        />
        <PayrollSchedulePolicyEditor
          description="继承店铺默认规则，或为该员工设置独立结算周期与休息日处理方式。"
          error={payrollPolicyError}
          loading={payrollPolicyLoading}
          mode="employee"
          onRetry={onRetryPayrollPolicy}
          onSave={onSavePayrollPolicy}
          policy={payrollPolicy}
          readOnly={readOnly}
          saving={payrollPolicySaving}
          title="工资结算周期"
        />
      </div>

      {terminationConfirmOpen ? (
        <div
          aria-labelledby={`${panelId}-termination-title`}
          aria-modal="true"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-5 backdrop-blur-sm"
          role="dialog"
        >
          <div className="w-full max-w-sm rounded-[24px] border border-coral/35 bg-white p-5 text-ink shadow-2xl">
            <h2
              className="text-xl font-black"
              id={`${panelId}-termination-title`}
            >
              {t("确认解约")}
            </h2>
            <p className="mt-3 text-sm font-bold leading-6 text-ink/65">
              {t("解约后，该员工将从当前店铺离职，并停止继续排班。")}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                disabled={affiliationSaving}
                onClick={() => setTerminationConfirmOpen(false)}
                size="sm"
                variant="secondary"
              >
                {t("取消")}
              </Button>
              <Button
                disabled={affiliationSaving}
                onClick={() => void terminateAffiliation()}
                size="sm"
                variant="danger"
              >
                {t("确认解约")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}
