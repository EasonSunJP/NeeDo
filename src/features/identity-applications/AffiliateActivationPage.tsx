import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { openPortalEntry } from "../../auth/portalEntry";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import {
  ApplicationButton,
  ApplicationCard,
  ApplicationNotice,
  ApplicationShell
} from "./ApplicationUi";
import { identityApplicationsApi, type ContractDefinition } from "./api";
import { getContractLanguage } from "./formModel";

export function AffiliateActivationPage() {
  const { language } = useI18n();
  const { refreshSession, session } = useAuth();
  const t = (source: string) => translateText(source, language);
  const [contract, setContract] = useState<ContractDefinition | null>(null);
  const [hasRead, setHasRead] = useState(false);
  const [hasAgreed, setHasAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const alreadyActive = session?.identityAvailability.some((item) => item.kind === "affiliate" && item.state === "active") ?? false;

  useEffect(() => {
    if (alreadyActive) return;
    identityApplicationsApi.getCurrentContract("affiliate", getContractLanguage(language)).then(setContract).catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : String(caught));
    });
  }, [alreadyActive, language]);

  const activate = async () => {
    if (!contract || !hasRead || !hasAgreed) return;
    setBusy(true);
    setError("");
    try {
      await identityApplicationsApi.activateAffiliate({
        contractVersion: contract.version,
        contentHash: contract.contentHash,
        language: contract.language,
        hasRead: true,
        hasAgreed: true
      });
      const refreshed = await refreshSession("business");
      if (!refreshed.ok) throw new Error(refreshed.message);
      openPortalEntry("business", "/afirieito/me");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(false);
    }
  };

  return (
    <ApplicationShell info="阅读联盟营销规则及与 NeeDo 的完整合同，确认后即时开启身份。" title="开启联盟营销身份">
      {error ? <ApplicationNotice tone="error">{t(error)}</ApplicationNotice> : null}
      {alreadyActive ? (
        <ApplicationCard className="space-y-4 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[color:var(--client-primary)] text-3xl font-black text-[color:var(--client-primary-contrast)]">✓</div>
          <h2 className="text-xl font-black text-[color:var(--client-text)]">{t("联盟营销身份已开启")}</h2>
          <ApplicationButton className="w-full" onClick={() => void refreshSession("business").then((result) => result.ok && openPortalEntry("business", "/afirieito/me"))}>{t("进入联盟营销")}</ApplicationButton>
        </ApplicationCard>
      ) : (
        <ApplicationCard className="space-y-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[color:var(--client-primary)]">{t("规则与合同")}</p>
            <h2 className="mt-1 text-xl font-black text-[color:var(--client-text)]">{t("NeeDo 联盟营销合同")}</h2>
            <p className="mt-2 text-xs leading-6 text-[color:var(--client-muted)]">{t("本页面不是一般说明弹窗；确认行为将与合同版本、完整正文及内容哈希共同留存，并具有法律效力。")}</p>
          </div>
          {contract ? (
            <>
              <div className="max-h-[52vh] overflow-y-auto whitespace-pre-wrap rounded-[20px] border border-[color:var(--client-line)] bg-[color:var(--client-elevated)] p-4 text-[12px] leading-6 text-[color:var(--client-text)]">{contract.text}</div>
              <p className="break-all text-[10px] text-[color:var(--client-muted)]">v{contract.version} · {contract.contentHash}</p>
            </>
          ) : <ApplicationNotice>{t("正在读取规则与合同全文")}</ApplicationNotice>}
          <ApplicationNotice>{t("联盟营销赚取的 NDP 在提现时必须完成 eKYC 并填写银行账户；银行账户名义人必须与 eKYC 姓名一致。")}</ApplicationNotice>
          <label className="flex items-start gap-3 text-sm font-bold text-[color:var(--client-text)]"><input checked={hasRead} className="mt-1 h-5 w-5 accent-[color:var(--client-primary)]" onChange={(event) => setHasRead(event.target.checked)} type="checkbox" />{t("我已阅读完整规则与合同")}</label>
          <label className="flex items-start gap-3 text-sm font-bold text-[color:var(--client-text)]"><input checked={hasAgreed} className="mt-1 h-5 w-5 accent-[color:var(--client-primary)]" onChange={(event) => setHasAgreed(event.target.checked)} type="checkbox" />{t("我确认并同意与 NeeDo 缔结合同")}</label>
          <ApplicationButton className="w-full" disabled={busy || !contract || !hasRead || !hasAgreed} onClick={() => void activate()}>{busy ? t("开启中") : t("确认并开启")}</ApplicationButton>
        </ApplicationCard>
      )}
    </ApplicationShell>
  );
}
