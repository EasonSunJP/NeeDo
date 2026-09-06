import { useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { ApplicationDropdown } from "../identity-applications/ApplicationDropdown";
import { ApplicationBottomAction, ApplicationButton, ApplicationField, ApplicationInput, ApplicationReadOnlyField, ApplicationSection } from "../identity-applications/ApplicationUi";
import { ekycOccupations, emptyEkycProfile, normalizeEkycProfile, validateEkycProfile, type EkycProfile } from "./ekycProfileModel";

export function EkycProfileForm({ onError }: { onError: (message: string) => void }) {
  const { language } = useI18n();
  const t = (source: string) => translateText(source, language);
  const [profile, setProfile] = useState<EkycProfile>({ ...emptyEkycProfile });
  const [review, setReview] = useState(false);
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

  return <div className="space-y-5">
    <ol aria-label={t("认证资料进度")} className="grid grid-cols-2 gap-3">
      {["填写资料", "确认资料"].map((label, index) => <li aria-current={Number(review) === index ? "step" : undefined} className="min-w-0" key={label}>
        <div className={`h-1.5 rounded-full ${index <= Number(review) ? "bg-[color:var(--client-primary)]" : "bg-[color:var(--client-line)]"}`} />
        <p className="mt-2 text-center text-xs font-black text-[color:var(--client-text)]">{t(label)}</p>
      </li>)}
    </ol>
    {review ? <ApplicationSection title="确认资料" info="请确认填写内容与本人证件一致。">
      <div className="grid gap-4 sm:grid-cols-2">{reviewRows.map(([label, value]) => <ApplicationReadOnlyField key={label} label={label} value={value} />)}</div>
      <p className="text-sm leading-6 text-[color:var(--client-muted)]">{t("资料尚未提交，确认填写内容不代表认证通过。")}</p>
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
      <div className="flex items-center justify-end gap-3">
        {review ? <ApplicationButton onClick={() => { setReview(false); onError(""); }} tone="secondary">{t("上一步")}</ApplicationButton> : null}
        <ApplicationButton className="min-w-0 flex-1" disabled={review} onClick={advance}>{t(review ? "认证提交暂未开放" : "确认填写内容")}</ApplicationButton>
      </div>
    </ApplicationBottomAction>
  </div>;
}
