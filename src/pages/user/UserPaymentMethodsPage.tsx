import { useEffect, useState } from "react";
import { PrimaryButton } from "../../components/client-ui/AppScaffold";
import {
  SettingsDetailPage,
  SettingsSection,
} from "../../components/client-ui/SettingsDirectory";
import { usePlatformSettings } from "../../features/platform-settings/PlatformSettingsProvider";
import { walletApi, type WalletSummary } from "../../features/wallet/api";
import { useI18n } from "../../i18n/I18nProvider";
import { cn } from "../../lib/utils";
import { paymentMethodsText } from "./userPaymentMethodsI18n";

type PaymentMethodStatus = "available" | "loading" | "unavailable" | "unintegrated";

function PaymentMethodRow({
  code,
  description,
  label,
  onUnavailableClick,
  status,
}: {
  code: "card" | "cash" | "ndp" | "paypal" | "paypay";
  description: string;
  label: string;
  onUnavailableClick?: () => void;
  status: PaymentMethodStatus;
}) {
  const { language } = useI18n();
  const statusLabel = paymentMethodsText(status, language);

  return (
    <div
      aria-disabled={status === "available" ? undefined : true}
      className="flex min-h-[78px] items-center gap-3 px-4 py-3.5"
      data-testid={`payment-method-${code}`}
      onClick={status === "unintegrated" ? onUnavailableClick : undefined}
      onKeyDown={status === "unintegrated" ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onUnavailableClick?.(); } } : undefined}
      role={status === "unintegrated" ? "button" : undefined}
      tabIndex={status === "unintegrated" ? 0 : undefined}
    >
      <span
        aria-hidden="true"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[color:var(--client-primary-soft)] text-xs font-black uppercase text-[color:var(--client-primary-strong)]"
      >
        {code === "cash" ? "¥" : code === "ndp" ? "N" : code.slice(0, 2)}
      </span>
      <div className="min-w-0 flex-1">
        <strong className="block text-[15px] font-black text-[color:var(--client-text)]">
          {label}
        </strong>
        <p className="mt-1 text-xs font-semibold leading-5 text-[color:var(--client-muted)]">
          {description}
        </p>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black",
          status === "available"
            ? "bg-[color:var(--client-primary-soft)] text-[color:var(--client-primary-strong)]"
            : "bg-[color:color-mix(in_srgb,var(--client-line)_62%,transparent)] text-[color:var(--client-muted)]",
        )}
      >
        {statusLabel}
      </span>
    </div>
  );
}

export function UserPaymentMethodsPage() {
  const { language } = useI18n();
  const platform = usePlatformSettings();
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [walletStatus, setWalletStatus] = useState<"error" | "loading" | "ready">("loading");
  const [walletRevision, setWalletRevision] = useState(0);
  const [unavailableNotice, setUnavailableNotice] = useState(false);
  const t = (key: Parameters<typeof paymentMethodsText>[0]) => paymentMethodsText(key, language);

  useEffect(() => {
    let active = true;
    setWalletStatus("loading");
    setWallet(null);
    void walletApi.getMyWalletSummary().then(
      (summary) => {
        if (!active) return;
        setWallet(summary);
        setWalletStatus("ready");
      },
      () => {
        if (!active) return;
        setWallet(null);
        setWalletStatus("error");
      },
    );

    return () => {
      active = false;
    };
  }, [walletRevision]);

  const getConfiguredStatus = (method: "cash" | "ndp"): PaymentMethodStatus => {
    if (platform.status === "loading") return "loading";
    if (platform.status !== "ready" || !platform.settings.paymentMethods.includes(method)) {
      return "unavailable";
    }
    if (method === "ndp" && walletStatus === "loading") return "loading";
    if (method === "ndp" && walletStatus !== "ready") return "unavailable";
    return "available";
  };

  const cashStatus = getConfiguredStatus("cash");
  const ndpStatus = getConfiguredStatus("ndp");
  const isTestNdp = wallet?.activeCurrency === "TEST_NDP";
  const loadFailed = platform.status === "error" || walletStatus === "error";

  const retry = () => {
    platform.reload();
    setWalletRevision((current) => current + 1);
  };

  return (
    <SettingsDetailPage
      backTo="/me"
      info={t("pageInfo")}
      title={t("title")}
    >
      <SettingsSection
        description={t("sectionInfo")}
        panelClassName="divide-y divide-[color:color-mix(in_srgb,var(--client-line)_68%,transparent)]"
        title={t("sectionTitle")}
      >
        <PaymentMethodRow
          code="cash"
          description={t(cashStatus === "available" ? "cashAvailable" : "cashUnavailable")}
          label={t("cash")}
          status={cashStatus}
        />
        <PaymentMethodRow
          code="ndp"
          description={t(
            ndpStatus === "available"
              ? isTestNdp
                ? "testNdpAvailable"
                : "ndpAvailable"
              : "ndpUnavailable",
          )}
          label={t(isTestNdp ? "testNdp" : "ndp")}
          status={ndpStatus}
        />
        <PaymentMethodRow
          code="card"
          description={t("cardUnavailable")}
          label={t("card")}
          onUnavailableClick={() => setUnavailableNotice(true)}
          status="unintegrated"
        />
        <PaymentMethodRow
          code="paypay"
          description={t("paypayUnavailable")}
          label="PayPay"
          onUnavailableClick={() => setUnavailableNotice(true)}
          status="unintegrated"
        />
        <PaymentMethodRow
          code="paypal"
          description={t("paypalUnavailable")}
          label="PayPal"
          onUnavailableClick={() => setUnavailableNotice(true)}
          status="unintegrated"
        />
      </SettingsSection>

      {unavailableNotice ? <p className="rounded-[18px] bg-[color:var(--client-surface)] px-4 py-3 text-sm font-bold text-[color:var(--client-muted)]" role="status">{t("paymentUnavailable")}</p> : null}

      {loadFailed ? (
        <section
          className="rounded-[22px] border border-red-400/35 bg-red-500/10 p-4"
          role="alert"
        >
          <p className="text-sm font-black text-red-500">{t("loadFailed")}</p>
          <PrimaryButton className="mt-3 h-11 w-full" onClick={retry}>
            {t("retry")}
          </PrimaryButton>
        </section>
      ) : null}

      <section className="rounded-[22px] border border-[color:color-mix(in_srgb,var(--client-primary)_28%,var(--client-line))] bg-[color:var(--client-primary-soft)] p-4">
        <h2 className="text-sm font-black text-[color:var(--client-primary-strong)]">
          {t("noticeTitle")}
        </h2>
        <p className="mt-1 text-xs font-semibold leading-5 text-[color:var(--client-muted)]">
          {t("noticeBody")}
        </p>
      </section>
    </SettingsDetailPage>
  );
}
