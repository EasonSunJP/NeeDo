import { useEffect, useMemo, useState } from "react";
import { ApiClientError } from "../../api/httpClient";
import { PermissionGate } from "../../auth/PermissionGate";
import { AdminToggleSwitch } from "../../components/admin/AdminToggleSwitch";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { useI18n } from "../../i18n/I18nProvider";
import { adminSystemSettingsApi } from "./api";
import { adminSystemSettingsText } from "./i18n";
import type { CapabilityProject, OperationsPlatformSettings } from "./types";

type Props = {
  settings: OperationsPlatformSettings;
  canWrite: boolean;
  labels: { conflict: string; projectOnly: string; save: string; saved: string; saving: string; unavailable: string };
  onDirtyChange: (dirty: boolean) => void;
  onSaved: () => Promise<void>;
};

const futurePaymentProjects: CapabilityProject[] = [
  { code: "paypay", configured: false, enabled: false, actionable: false },
  { code: "paypal", configured: false, enabled: false, actionable: false },
  { code: "stripe", configured: false, enabled: false, actionable: false }
];

export function PaymentSettingsTab({ settings, canWrite, labels, onDirtyChange, onSaved }: Props) {
  const { language } = useI18n();
  const t = (source: string) => adminSystemSettingsText(source, language);
  const initial = useMemo(() => ({ offlinePaymentEnabled: settings.offlinePaymentEnabled, ndpPaymentEnabled: settings.ndpPaymentEnabled }), [settings]);
  const [draft, setDraft] = useState(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "conflict" | "error">("idle");
  const dirty = draft.offlinePaymentEnabled !== initial.offlinePaymentEnabled || draft.ndpPaymentEnabled !== initial.ndpPaymentEnabled;
  useEffect(() => { setDraft(initial); setState("idle"); }, [initial]);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const save = async () => {
    if (!canWrite || !dirty) return;
    setState("saving");
    try {
      await adminSystemSettingsApi.updatePayment({ expectedVersion: settings.version, ...draft });
      setState("saved");
      await onSaved();
    } catch (error) {
      setState(error instanceof ApiClientError && error.status === 409 ? "conflict" : "error");
    }
  };

  const projects = settings.paymentProviderProjects.length ? settings.paymentProviderProjects : futurePaymentProjects;
  return (
    <div className="space-y-5">
      <section className="grid gap-3 xl:grid-cols-2">
        <div className="flex items-center justify-between gap-5 rounded-2xl border border-line bg-paper p-5">
          <div><h2 className="font-black">{t("线下支付")}</h2><p className="mt-1 text-sm font-semibold text-ink/55">{t("由现场人员、技师或店铺人工确认收款。")}</p></div>
          <AdminToggleSwitch ariaLabel={t("线下支付")} checked={draft.offlinePaymentEnabled} disabled={!canWrite} onChange={(value) => setDraft((current) => ({ ...current, offlinePaymentEnabled: value }))} />
        </div>
        <div className="flex items-center justify-between gap-5 rounded-2xl border border-line bg-paper p-5">
          <div><h2 className="font-black">{t("NDP 支付")}</h2><p className="mt-1 text-sm font-semibold text-ink/55">{t("控制 NeeDo 内的 NDP 正式支付能力。")}</p></div>
          <AdminToggleSwitch ariaLabel={t("NDP 支付")} checked={draft.ndpPaymentEnabled} disabled={!canWrite} onChange={(value) => setDraft((current) => ({ ...current, ndpPaymentEnabled: value }))} />
        </div>
      </section>
      <section className="rounded-2xl border border-line bg-white p-5">
        <h2 className="text-lg font-black">{t("外部支付项目")}</h2>
        <p className="mt-1 text-sm font-semibold text-ink/50">{t("PayPay 与 PayPal 未来由 NeeDo 直接调起外部支付；不是人工确认。Stripe 仅保留聚合支付项目入口。")}</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {projects.map((project) => (
            <div className="rounded-xl border border-line bg-paper p-4" key={project.code}>
              <div className="flex items-center justify-between"><strong className="uppercase">{project.code}</strong><Badge tone="neutral">{labels.unavailable}</Badge></div>
              <p className="mt-3 text-xs font-semibold text-ink/50">{labels.projectOnly}</p>
            </div>
          ))}
        </div>
      </section>
      {state === "conflict" ? <p className="rounded-xl bg-lemon/25 p-3 text-sm font-bold">{labels.conflict}</p> : null}
      {state === "error" ? <p className="rounded-xl bg-coral/15 p-3 text-sm font-bold text-coral">{t("保存失败，请重试。")}</p> : null}
      {state === "saved" ? <p className="rounded-xl bg-mint/20 p-3 text-sm font-bold">{labels.saved}</p> : null}
      <PermissionGate permission="backoffice:payment-settings:write">
        <Button disabled={!dirty || state === "saving"} onClick={() => void save()}>{state === "saving" ? labels.saving : labels.save}</Button>
      </PermissionGate>
    </div>
  );
}
