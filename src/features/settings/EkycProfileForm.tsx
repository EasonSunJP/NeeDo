import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { ekycApplicationsApi, type EkycApplicationDetail } from "./ekycApplicationsApi";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { ApplicationDropdown } from "../identity-applications/ApplicationDropdown";
import { ApplicationBottomAction, ApplicationButton, ApplicationField, ApplicationInput, ApplicationReadOnlyField, ApplicationSection } from "../identity-applications/ApplicationUi";
import { ekycOccupations, emptyEkycProfile, normalizeEkycProfile, validateEkycProfile, type EkycProfile } from "./ekycProfileModel";

export function EkycProfileForm({ onError }: { onError: (message: string) => void }) {
  const { session } = useAuth();
  return <EkycProfileFormForAccount key={session?.id ?? "anonymous"} onError={onError} />;
}

function EkycProfileFormForAccount({ onError }: { onError: (message: string) => void }) {
  const { language } = useI18n();
  const t = (source: string) => translateText(source, language);
  const [profile, setProfile] = useState<EkycProfile>({ ...emptyEkycProfile });
  const [review, setReview] = useState(false);
  const [application, setApplication] = useState<EkycApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const errorCallback = useRef(onError);
  errorCallback.current = onError;
  useEffect(() => {
    mounted.current = true;
    let current = true;
    setLoading(true); setLoadFailed(false);
    void ekycApplicationsApi.listMine().then(async result => {
      const latest = result.list[0];
      const detail = latest ? await ekycApplicationsApi.getMine(latest.id) : null;
      if (!current) return;
      setApplication(detail?.status === "withdrawn" ? null : detail);
      if (detail) setProfile(detail.profile);
      setReview(Boolean(detail && detail.status !== "withdrawn"));
    }).catch(error => {
      if (!current) return;
      setLoadFailed(true);
      errorCallback.current(error instanceof Error ? error.message : String(error));
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; mounted.current = false; };
  }, [revision]);
  const run = async (operation: () => Promise<EkycApplicationDetail>, withdrawn = false) => {
    if (busy) return;
    setBusy(true); onError("");
    try {
      const result = await operation();
      if (!mounted.current) return;
      setApplication(withdrawn ? null : result);
      setProfile(result.profile);
      setReview(!withdrawn);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) { if (mounted.current) onError(error instanceof Error ? error.message : String(error)); }
    finally { if (mounted.current) setBusy(false); }
  };
  const step = application ? 2 : Number(review);
  const update = (key: keyof EkycProfile, value: string) => {
    setProfile(current => ({ ...current, [key]: value }));
    onError("");
  };
  const field = (key: keyof EkycProfile, label: string, required = true, autoComplete?: string) => (
    <ApplicationField label={label} required={required}>
      <ApplicationInput aria-label={t(label)} autoComplete={autoComplete} maxLength={key === "postalCode" ? 9 : 120} inputMode={key === "postalCode" ? "numeric" : undefined} onChange={event => update(key, event.target.value)} value={profile[key]} />
    </ApplicationField>
  );
  const dateSelect = (key: "birthYear" | "birthMonth" | "birthDay", label: string, values: number[]) => (
    <ApplicationField as="div" label={label} required>
      <ApplicationDropdown label={t(label)} onChange={value => update(key, value)} options={values.map(value => ({ value: String(value), label: String(value) }))} placeholder={t("请选择")} value={profile[key]} />
    </ApplicationField>
  );
  const advance = () => {
    const normalized = normalizeEkycProfile(profile);
    const error = validateEkycProfile(normalized);
    onError(error);
    if (error) return;
    setProfile(normalized);
    setReview(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const reviewRows = [
    ["姓名", `${profile.familyName} ${profile.givenName}`],
    ["姓名（片假名）", `${profile.familyNameKana} ${profile.givenNameKana}`],
    ["出生日期", `${profile.birthYear}/${profile.birthMonth}/${profile.birthDay}`],
    ["性别", t(profile.sex === "male" ? "男性" : "女性")],
    ["邮政编码", profile.postalCode],
    ["都道府县／市区町村", profile.city],
    ["街道门牌", profile.street],
    ["楼栋／房间号", profile.building],
    ["职业", profile.occupation === "other" ? profile.otherOccupation : t(ekycOccupations.find(option => option.value === profile.occupation)?.label ?? "")]
  ];

  if (loading) return <p role="status">{t("正在加载…")}</p>;
  if (loadFailed) return <ApplicationButton onClick={() => setRevision(value => value + 1)}>{t("重试")}</ApplicationButton>;
  return <div className="space-y-5">
    <ol aria-label={t("认证资料进度")} className="grid grid-cols-3 gap-3">
      {["填写资料", "确认资料", "审核"].map((label, index) => <li aria-current={step === index ? "step" : undefined} className="min-w-0" key={label}>
        <div className={`h-1.5 rounded-full ${index <= step ? "bg-[color:var(--client-primary)]" : "bg-[color:var(--client-line)]"}`} />
        <p className="mt-2 text-center text-xs font-black text-[color:var(--client-text)]">{t(label)}</p>
      </li>)}
    </ol>
    {review ? <ApplicationSection title={application ? "申请资料" : "确认资料"} info="请确认填写内容与本人证件一致。">
      <div className="grid gap-4 sm:grid-cols-2">{reviewRows.map(([label, value]) => <ApplicationReadOnlyField key={label} label={label} value={value} />)}</div>
      <p className="text-sm leading-6 text-[color:var(--client-muted)]">{t(application ? (application.status === "approved" ? "本人认证已通过运营人工审核。" : application.status === "rejected" ? "审核未通过，请根据原因修改后再次申请。" : "资料已提交，请等待运营人工审核。") : "资料尚未提交，确认填写内容不代表认证通过。")}</p>
      {application?.rejectionReason ? <p className="rounded-2xl border border-red-500 bg-red-950 p-4 text-white">{t("驳回原因")}：{application.rejectionReason}</p> : null}
    </ApplicationSection> : <>
      <ApplicationSection title="姓名" info="请填写与本人证件一致的姓名。">
        <div className="grid grid-cols-2 gap-3">{field("familyName", "姓", true, "family-name")}{field("givenName", "名", true, "given-name")}</div>
        <div className="grid grid-cols-2 gap-3">{field("familyNameKana", "姓（片假名）")}{field("givenNameKana", "名（片假名）")}</div>
        <p className="text-xs text-[color:var(--client-muted)]">{t("姓名读音请使用全角片假名")}</p>
      </ApplicationSection>
      <ApplicationSection title="出生日期与性别">
        <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-2">
          {dateSelect("birthYear", "出生年", Array.from({ length: 121 }, (_, index) => new Date().getFullYear() - index))}
          {dateSelect("birthMonth", "出生月", Array.from({ length: 12 }, (_, index) => index + 1))}
          {dateSelect("birthDay", "出生日", Array.from({ length: 31 }, (_, index) => index + 1))}
        </div>
        <ApplicationField as="div" label="性别" required>
          <div aria-label={t("性别")} className="grid grid-cols-2 gap-3" role="radiogroup">
            {[["male", "男性"], ["female", "女性"]].map(([value, label]) => <label className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-[18px] border px-4 text-sm font-bold ${profile.sex === value ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary-soft)]" : "border-[color:var(--client-line)] bg-[color:var(--client-elevated)]"}`} key={value}>
              <input checked={profile.sex === value} className="h-4 w-4 accent-[color:var(--client-primary)]" name="ekyc-sex" onChange={() => update("sex", value)} type="radio" value={value} />{t(label)}
            </label>)}
          </div>
        </ApplicationField>
      </ApplicationSection>
      <ApplicationSection title="居住地址" info="请填写与本人证件一致的居住地址。">
        {field("postalCode", "邮政编码", true, "postal-code")}
        {field("city", "都道府县／市区町村")}
        {field("street", "街道门牌", true, "address-line1")}
        {field("building", "楼栋／房间号", false, "address-line2")}
      </ApplicationSection>
      <ApplicationSection title="职业">
        <ApplicationField as="div" label="职业" required>
          <ApplicationDropdown label={t("职业")} onChange={value => update("occupation", value)} options={ekycOccupations.map(option => ({ ...option, label: t(option.label) }))} placeholder={t("请选择职业")} value={profile.occupation} />
        </ApplicationField>
        {profile.occupation === "other" ? field("otherOccupation", "其他职业") : null}
      </ApplicationSection>
    </>}
    <ApplicationBottomAction>
      {application ? application.status === "submitted" ? <div className="flex gap-3">
        <ApplicationButton disabled={busy} tone="secondary" onClick={() => void run(() => ekycApplicationsApi.withdraw(application.id, application.version), true)}>{t("撤回")}</ApplicationButton>
        <ApplicationButton className="flex-1" disabled>{t("审核中")}</ApplicationButton>
      </div> : application.status === "rejected" ? <ApplicationButton className="w-full" tone="danger" onClick={() => { setApplication(null); setReview(false); onError(""); }}>{t("审核未通过，再次申请")}</ApplicationButton>
      : <ApplicationButton className="w-full" disabled>{t("审核已通过")}</ApplicationButton>
      : <div className="flex items-center justify-end gap-3">
        {review ? <ApplicationButton disabled={busy} onClick={() => { setReview(false); onError(""); }} tone="secondary">{t("上一步")}</ApplicationButton> : null}
        <ApplicationButton className="min-w-0 flex-1" disabled={busy} onClick={review ? () => void run(() => ekycApplicationsApi.submit(profile)) : advance}>{t(busy ? "提交中…" : review ? "提交审核" : "确认填写内容")}</ApplicationButton>
      </div>}
    </ApplicationBottomAction>
  </div>;
}
