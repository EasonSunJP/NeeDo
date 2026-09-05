import { useMemo, useState } from "react";
import { platformPartnersApi, type PartnerType } from "../../api/platformPartners";
import { Button } from "../../components/ui/Button";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";

type RangeDraft = {
  startsAt: string;
  endsAt: string;
  permanent: boolean;
  reason: string;
};

type Labels = {
  title: string;
  partnerNames: Record<PartnerType, string>;
  start: string;
  end: string;
  permanent: string;
  reason: string;
  reasonPlaceholder: string;
  save: string;
  saving: string;
  saved: string;
  required: string;
  invalidRange: string;
  failed: string;
};

const copy: Record<Language, Labels> = {
  zh: { title: "平台合作方标记", partnerNames: { agent: "代理商", franchisee: "加盟商", supplier: "供货商" }, start: "开始日期", end: "结束日期", permanent: "永久", reason: "标记理由", reasonPlaceholder: "合同或审核凭证说明", save: "保存", saving: "保存中...", saved: "合作方有效期已保存", required: "请填写开始日期、结束日期或永久选项以及调整理由", invalidRange: "结束日期必须晚于开始日期", failed: "合作方标记保存失败" },
  "zh-Hant": { title: "平台合作方標記", partnerNames: { agent: "代理商", franchisee: "加盟商", supplier: "供貨商" }, start: "開始日期", end: "結束日期", permanent: "永久", reason: "標記理由", reasonPlaceholder: "合約或審核憑證說明", save: "儲存", saving: "儲存中...", saved: "合作方有效期已儲存", required: "請填寫開始日期、結束日期或永久選項以及調整理由", invalidRange: "結束日期必須晚於開始日期", failed: "合作方標記儲存失敗" },
  ja: { title: "プラットフォーム提携先設定", partnerNames: { agent: "代理店", franchisee: "加盟店", supplier: "仕入先" }, start: "開始日時", end: "終了日時", permanent: "無期限", reason: "設定理由", reasonPlaceholder: "契約または審査証跡", save: "保存", saving: "保存中...", saved: "提携期間を保存しました", required: "開始日時、終了日時または無期限、設定理由を入力してください", invalidRange: "終了日時は開始日時より後にしてください", failed: "提携先設定の保存に失敗しました" },
  en: { title: "Platform partner markers", partnerNames: { agent: "Agent", franchisee: "Franchisee", supplier: "Supplier" }, start: "Start date", end: "End date", permanent: "Permanent", reason: "Reason", reasonPlaceholder: "Contract or review evidence", save: "Save", saving: "Saving...", saved: "Partner validity saved", required: "Enter a start date, an end date or permanent setting, and a reason", invalidRange: "End date must be after start date", failed: "Could not save partner marker" },
  ko: { title: "플랫폼 협력사 표시", partnerNames: { agent: "대리점", franchisee: "가맹점", supplier: "공급업체" }, start: "시작 일시", end: "종료 일시", permanent: "영구", reason: "설정 사유", reasonPlaceholder: "계약 또는 심사 증빙", save: "저장", saving: "저장 중...", saved: "협력사 유효 기간을 저장했습니다", required: "시작 일시, 종료 일시 또는 영구 설정과 사유를 입력하세요", invalidRange: "종료 일시는 시작 일시보다 늦어야 합니다", failed: "협력사 표시를 저장하지 못했습니다" }
};

const partnerTypes: PartnerType[] = ["agent", "franchisee", "supplier"];

function localDateTimeNow() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function PlatformPartnerRangeEditor({ userId }: { userId: number }) {
  const { language } = useOptionalI18n();
  const labels = copy[language];
  const initialDrafts = useMemo(
    () => Object.fromEntries(partnerTypes.map((type) => [type, {
      startsAt: localDateTimeNow(),
      endsAt: "",
      permanent: false,
      reason: ""
    }])) as Record<PartnerType, RangeDraft>,
    []
  );
  const [drafts, setDrafts] = useState(initialDrafts);
  const [saving, setSaving] = useState<PartnerType | null>(null);
  const [notice, setNotice] = useState<Record<PartnerType, string>>({ agent: "", franchisee: "", supplier: "" });
  const [errors, setErrors] = useState<Record<PartnerType, string>>({ agent: "", franchisee: "", supplier: "" });

  const update = <K extends keyof RangeDraft>(type: PartnerType, key: K, value: RangeDraft[K]) => {
    setDrafts((current) => ({ ...current, [type]: { ...current[type], [key]: value } }));
  };

  const save = async (type: PartnerType) => {
    const draft = drafts[type];
    if (!draft.startsAt || (!draft.permanent && !draft.endsAt) || !draft.reason.trim()) {
      setErrors((current) => ({ ...current, [type]: labels.required }));
      return;
    }
    if (!draft.permanent && new Date(draft.endsAt) <= new Date(draft.startsAt)) {
      setErrors((current) => ({ ...current, [type]: labels.invalidRange }));
      return;
    }

    setSaving(type);
    setErrors((current) => ({ ...current, [type]: "" }));
    setNotice((current) => ({ ...current, [type]: "" }));
    try {
      await platformPartnersApi.markPartnerProfile(userId, {
        partnerType: type,
        startsAt: new Date(draft.startsAt).toISOString(),
        endsAt: draft.permanent ? null : new Date(draft.endsAt).toISOString(),
        permanent: draft.permanent,
        reason: draft.reason.trim()
      });
      setNotice((current) => ({ ...current, [type]: labels.saved }));
      update(type, "reason", "");
    } catch (error) {
      setErrors((current) => ({
        ...current,
        [type]: error instanceof Error ? error.message : labels.failed
      }));
    } finally {
      setSaving(null);
    }
  };

  return (
    <section className="rounded-[18px] border border-line bg-white p-4 shadow-panel sm:p-5">
      <h3 className="border-l-[3px] border-moss pl-3 text-base font-black">{labels.title}</h3>
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        {partnerTypes.map((type) => {
          const draft = drafts[type];
          return (
            <article className="rounded-xl border border-line bg-paper p-4" key={type}>
              <h4 className="text-sm font-black text-ink">{labels.partnerNames[type]}</h4>
              <div className="mt-3 grid gap-3">
                <label className="text-xs font-bold text-ink/55">
                  {labels.start}
                  <input aria-label={labels.start} className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm" onChange={(event) => update(type, "startsAt", event.target.value)} type="datetime-local" value={draft.startsAt} />
                </label>
                <label className="text-xs font-bold text-ink/55">
                  {labels.end}
                  <input aria-label={labels.end} className="mt-1 h-10 w-full rounded-lg border border-line bg-white px-3 text-sm disabled:opacity-40" disabled={draft.permanent} onChange={(event) => update(type, "endsAt", event.target.value)} type="datetime-local" value={draft.endsAt} />
                </label>
                <label className="flex items-center gap-2 text-xs font-bold text-ink/70">
                  <input aria-label={labels.permanent} checked={draft.permanent} onChange={(event) => update(type, "permanent", event.target.checked)} type="checkbox" />
                  {labels.permanent}
                </label>
                <label className="text-xs font-bold text-ink/55">
                  {labels.reason}
                  <textarea className="mt-1 min-h-20 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm" onChange={(event) => update(type, "reason", event.target.value)} placeholder={labels.reasonPlaceholder} value={draft.reason} />
                </label>
              </div>
              <Button className="mt-3 w-full" disabled={saving !== null} onClick={() => void save(type)} size="sm" variant={type === "agent" ? "primary" : "secondary"}>
                {saving === type ? labels.saving : `${labels.save}${labels.partnerNames[type]}`}
              </Button>
              {notice[type] ? <p className="mt-2 text-xs font-bold text-emerald-700">{notice[type]}</p> : null}
              {errors[type] ? <p className="mt-2 text-xs font-bold text-coral">{errors[type]}</p> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
