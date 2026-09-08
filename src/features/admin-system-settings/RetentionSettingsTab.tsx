import { useEffect, useMemo, useState } from "react";
import { ApiClientError } from "../../api/httpClient";
import { PermissionGate } from "../../auth/PermissionGate";
import { Button } from "../../components/ui/Button";
import { useI18n } from "../../i18n/I18nProvider";
import { adminSystemSettingsApi } from "./api";
import { adminSystemSettingsText } from "./i18n";
import type { ImRetentionSettings } from "./types";

type Props = {
  settings: ImRetentionSettings;
  canWrite: boolean;
  labels: { conflict: string; save: string; saved: string; saving: string };
  onDirtyChange: (dirty: boolean) => void;
  onSaved: (settings: ImRetentionSettings) => void;
};

export function RetentionSettingsTab({ settings, canWrite, labels, onDirtyChange, onSaved }: Props) {
  const { language } = useI18n();
  const t = (source: string) => adminSystemSettingsText(source, language);
  const initial = useMemo(() => ({ messageDays: settings.messageDays, mediaDays: settings.mediaDays }), [settings]);
  const [draft, setDraft] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "conflict" | "error">("idle");
  const valid = Number.isInteger(draft.messageDays) && draft.messageDays >= 1 && draft.messageDays <= 3650 && Number.isInteger(draft.mediaDays) && draft.mediaDays >= 1 && draft.mediaDays <= 3650;
  const dirty = draft.messageDays !== initial.messageDays || draft.mediaDays !== initial.mediaDays;
  useEffect(() => { setDraft(initial); setState("idle"); }, [initial]);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const save = async () => {
    if (!canWrite || !dirty || !valid) return;
    setState("saving");
    try {
      const next = await adminSystemSettingsApi.updateRetention({ expectedVersion: settings.version, ...draft });
      setState("saved");
      onSaved(next);
    } catch (error) {
      setState(error instanceof ApiClientError && error.status === 409 ? "conflict" : "error");
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-sky/30 bg-sky/10 p-4 text-sm font-semibold leading-6 text-ink/70">
        {t("此规则只清理服务器保存的数据，并仅对保存后的新规则生效；不会删除用户设备本地的聊天记录或媒体缓存。")}
      </div>
      <section className="grid gap-4 md:grid-cols-2">
        {([
          ["messageDays", "IM 消息", "默认 30 天"],
          ["mediaDays", "IM 媒体", "默认 3 天"]
        ] as const).map(([key, title, hint]) => (
          <label className="rounded-2xl border border-line bg-paper p-5" key={key}>
            <span className="font-black">{t(title)}</span>
            <span className="mt-1 block text-sm font-semibold text-ink/50">{t("服务器保存时间，单位：天")}（{t(hint)}）</span>
            <input className="mt-4 h-12 w-full rounded-xl border border-line bg-white px-4 text-lg font-black outline-none focus:border-moss" disabled={!canWrite} max={3650} min={1} onChange={(event) => setDraft((current) => ({ ...current, [key]: Number(event.target.value) }))} step={1} type="number" value={draft[key]} />
          </label>
        ))}
      </section>
      {!valid ? <p className="rounded-xl bg-coral/15 p-3 text-sm font-bold text-coral">{t("请输入 1 至 3650 的整数天数。")}</p> : null}
      {state === "conflict" ? <p className="rounded-xl bg-lemon/25 p-3 text-sm font-bold">{labels.conflict}</p> : null}
      {state === "error" ? <p className="rounded-xl bg-coral/15 p-3 text-sm font-bold text-coral">{t("保存失败，请重试。")}</p> : null}
      {state === "saved" ? <p className="rounded-xl bg-mint/20 p-3 text-sm font-bold">{labels.saved}</p> : null}
      <PermissionGate permission="backoffice:im-retention:write">
        <Button disabled={!dirty || !valid || state === "saving"} onClick={() => void save()}>{state === "saving" ? labels.saving : labels.save}</Button>
      </PermissionGate>
    </div>
  );
}
