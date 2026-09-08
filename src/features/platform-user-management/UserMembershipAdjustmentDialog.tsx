import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { membershipTierText } from "./i18n";
import { platformUserManagementApi } from "./api";
import { platformTierCodes, type PlatformTierCode } from "./types";

type Props = {
  kind: "tier";
  currentValue: PlatformTierCode;
  expectedLockVersion: number | null;
  userId: number;
  onSaved: () => void;
} | {
  kind: "multiplier";
  currentValue: number;
  expectedLockVersion: number | null;
  userId: number;
  onSaved: () => void;
};

export function UserMembershipAdjustmentDialog(props: Props) {
  const { language } = useOptionalI18n();
  const [open, setOpen] = useState(false);
  const [tierCode, setTierCode] = useState<PlatformTierCode>(
    props.kind === "tier" ? props.currentValue : "free"
  );
  const [multiplier, setMultiplier] = useState(
    props.kind === "multiplier" ? String(props.currentValue) : "1"
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const actionLabel = translateText(
    props.kind === "tier" ? "修改会员类型" : "修改会员倍率",
    language
  );

  const save = async () => {
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      setError(translateText("请填写调整理由", language));
      return;
    }
    const normalizedMultiplier = Number(multiplier);
    if (props.kind === "multiplier" && (!Number.isFinite(normalizedMultiplier) || normalizedMultiplier <= 0 || normalizedMultiplier > 100)) {
      setError(translateText("会员倍率必须大于 0 且不超过 100", language));
      return;
    }
    setSaving(true);
    setError("");
    try {
      await platformUserManagementApi.adjustMembership(props.userId, {
        ...(props.kind === "tier" ? { tierCode } : { multiplier: normalizedMultiplier }),
        reason: normalizedReason,
        expectedLockVersion: props.expectedLockVersion
      });
      setOpen(false);
      setReason("");
      props.onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : translateText("会员调整保存失败", language));
    } finally {
      setSaving(false);
    }
  };

  return <>
    <Button onClick={() => { setError(""); setOpen(true); }} size="sm" variant="secondary">{actionLabel}</Button>
    {open ? <div aria-label={actionLabel} aria-modal="true" className="fixed inset-0 z-[150] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm" role="dialog">
      <section className="w-full max-w-md rounded-[18px] border border-line bg-white p-5 shadow-panel">
        <h3 className="text-lg font-black text-ink">{actionLabel}</h3>
        <div className="mt-4 space-y-3">
          {props.kind === "tier" ? <label className="block text-xs font-black text-ink/55">{translateText("会员类型", language)}
            <select className="mt-1 h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold" onChange={(event) => setTierCode(event.target.value as PlatformTierCode)} value={tierCode}>
              {platformTierCodes.map((code) => <option key={code} value={code}>{membershipTierText(code, language)}</option>)}
            </select>
          </label> : <label className="block text-xs font-black text-ink/55">{translateText("会员倍率", language)}
            <input className="mt-1 h-11 w-full rounded-lg border border-line bg-paper px-3 text-sm font-bold" max="100" min="0.0001" onChange={(event) => setMultiplier(event.target.value)} step="0.0001" type="number" value={multiplier} />
          </label>}
          <label className="block text-xs font-black text-ink/55">{translateText("调整理由", language)}
            <textarea className="mt-1 min-h-24 w-full rounded-lg border border-line bg-paper p-3 text-sm font-bold" maxLength={500} onChange={(event) => setReason(event.target.value)} value={reason} />
          </label>
        </div>
        {error ? <p className="mt-3 text-sm font-bold text-coral">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button disabled={saving} onClick={() => setOpen(false)} size="sm" variant="secondary">{translateText("取消", language)}</Button>
          <Button disabled={saving} onClick={() => void save()} size="sm">{translateText("保存调整", language)}</Button>
        </div>
      </section>
    </div> : null}
  </>;
}
