import { useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  EmployeePayrollSchedulePolicyInput,
  PayrollSchedulePolicyResult,
} from "../../api/payrollSchedulePolicy";
import type {
  EmployeeRelationshipType,
  EmployeeWorkStatus,
  MerchantEmployee,
  MerchantEmployeeAffiliationUpdate,
  MerchantEmployeeProfileUpdate,
} from "../../features/merchant-admin/employeeApi";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { Badge, type BadgeTone } from "../ui/Badge";
import { Button } from "../ui/Button";
import { PayrollSchedulePolicyEditor } from "./PayrollSchedulePolicyEditor";

type SavingSection = "profile" | "affiliation" | null;

interface EmployeeDetailCardProps {
  employee: MerchantEmployee;
  saving: SavingSection;
  error: string;
  payrollPolicy: PayrollSchedulePolicyResult | null;
  payrollPolicyError: string;
  payrollPolicyLoading: boolean;
  payrollPolicySaving: boolean;
  onRetryPayrollPolicy: () => void;
  onSavePayrollPolicy: (
    input: EmployeePayrollSchedulePolicyInput,
  ) => Promise<void>;
  onSaveProfile: (input: MerchantEmployeeProfileUpdate) => Promise<void>;
  onSaveAffiliation: (
    input: MerchantEmployeeAffiliationUpdate,
  ) => Promise<void>;
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

function relationshipLabel(value: EmployeeRelationshipType) {
  return value === "exclusive" ? "专属技师" : "合作技师";
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

export function EmployeeDetailCard({
  employee,
  error,
  onSaveAffiliation,
  onRetryPayrollPolicy,
  onSavePayrollPolicy,
  onSaveProfile,
  payrollPolicy,
  payrollPolicyError,
  payrollPolicyLoading,
  payrollPolicySaving,
  saving,
}: EmployeeDetailCardProps) {
  const { language } = useOptionalI18n();
  const t = (source: string) => translateText(source, language);
  const [profileEditing, setProfileEditing] = useState(false);
  const [affiliationEditing, setAffiliationEditing] = useState(false);
  const [profileDraft, setProfileDraft] = useState(() =>
    createProfileDraft(employee),
  );
  const [affiliationDraft, setAffiliationDraft] = useState(() =>
    createAffiliationDraft(employee),
  );
  const [copied, setCopied] = useState(false);
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

  useEffect(() => {
    setProfileDraft(createProfileDraft(employee));
    setAffiliationDraft(createAffiliationDraft(employee));
  }, [employee]);

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

  const profileSaving = saving === "profile";
  const affiliationSaving = saving === "affiliation";
  const blocked = saving !== null || payrollPolicySaving;

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
              <div className="flex flex-wrap gap-2">
                <Badge
                  className="border border-white/10"
                  tone={workStatusTone(employee.affiliation.workStatus)}
                >
                  {t(workStatusLabel(employee.affiliation.workStatus))}
                </Badge>
                <Badge className="border border-white/10" tone="blue">
                  {t(relationshipLabel(employee.affiliation.relationshipType))}
                </Badge>
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
        <dl className="grid border-t border-white/10 bg-white/[0.035] sm:grid-cols-2 lg:grid-cols-4">
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

      {error ? (
        <div
          className="rounded-2xl border border-coral/35 bg-coral/10 px-4 py-3 text-sm font-bold text-[#9b3f35]"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <section className="rounded-[24px] border border-line bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-moss">
              01 · {t("基础信息")}
            </p>
            <h4 className="mt-1 text-xl font-black text-ink">
              {t("员工资料")}
            </h4>
          </div>
          {!profileEditing ? (
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

      <section className="rounded-[24px] border border-line bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-sky">
              02 · {t("从属关系")}
            </p>
            <h4 className="mt-1 text-xl font-black text-ink">
              {employee.affiliation.shop.name}
            </h4>
          </div>
          {!affiliationEditing ? (
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
                  <option value="exclusive">{t("专属技师")}</option>
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

      <PayrollSchedulePolicyEditor
        description="继承店铺默认规则，或为该员工设置独立结算周期与休息日处理方式。"
        error={payrollPolicyError}
        loading={payrollPolicyLoading}
        mode="employee"
        onRetry={onRetryPayrollPolicy}
        onSave={onSavePayrollPolicy}
        policy={payrollPolicy}
        saving={payrollPolicySaving}
        title="工资结算周期"
      />
    </article>
  );
}
