import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import type { IdentityApplication } from "./api";
import { ApplicationReadOnlyField, ProtectedApplicationImage } from "./ApplicationUi";

export function ApplicationReviewEvidence({ application }: { application: IdentityApplication }) {
  const { language } = useI18n();
  const t = (source: string) => translateText(source, language);
  const evidence = application.reviewEvidence;
  if (!evidence) return null;
  const bank = evidence.bankAccount;
  const accountTypes: Record<string, string> = { ordinary: "普通預金", current: "当座預金", savings: "貯蓄預金", other: "その他" };
  const mediaLabels: Record<string, string> = { showcase: "店铺展示图", portrait: "本人照片", identity_document: "证件照片", corporate_registration: "法人登记资料" };
  return <>
    {application.type === "merchant" ? <div className="grid gap-3 sm:grid-cols-2">
      <ApplicationReadOnlyField label="服务种类" value={evidence.serviceCategories?.join("、") ?? ""} />
      <ApplicationReadOnlyField label="关键词" value={evidence.businessKeywords?.join("、") ?? ""} />
    </div> : null}
    {evidence.targetShopPublicId ? <ApplicationReadOnlyField label="店铺 ID" value={evidence.targetShopPublicId} /> : null}
    {bank ? <div className="grid gap-3 sm:grid-cols-2">
      <ApplicationReadOnlyField label="银行代码" value={bank.bankCode} />
      <ApplicationReadOnlyField label="银行名称" value={bank.bankName} />
      <ApplicationReadOnlyField label="支店代码" value={bank.branchCode} />
      <ApplicationReadOnlyField label="支店名称" value={bank.branchName} />
      <ApplicationReadOnlyField label="账户类型" value={t(accountTypes[bank.accountType] ?? bank.accountType)} />
      <ApplicationReadOnlyField label="账号" value={bank.accountNumberMasked ?? ""} />
      <ApplicationReadOnlyField label="账户名义人" value={bank.accountHolderMasked ?? ""} />
    </div> : null}
    {evidence.media.length ? <div className="grid gap-3 sm:grid-cols-2">{evidence.media.map(media => <figure key={media.id}>
      <ProtectedApplicationImage applicationId={application.id} mediaId={media.id} alt={t(mediaLabels[media.purpose] ?? media.purpose)} className="aspect-[4/3]" />
      <figcaption className="mt-2 text-sm text-[color:var(--client-muted)]">{t(mediaLabels[media.purpose] ?? media.purpose)}</figcaption>
    </figure>)}</div> : null}
    {evidence.contractAcceptance ? <details className="rounded-2xl border border-[color:var(--client-line)] p-4 text-[color:var(--client-text)]">
      <summary className="cursor-pointer font-bold">{t("已同意的合同")} · {evidence.contractAcceptance.contractVersion}</summary>
      <p className="my-3 break-all text-xs">{t("合同回执")} {evidence.contractAcceptance.receiptId}</p>
      <div className="whitespace-pre-wrap text-sm leading-7">{evidence.contractAcceptance.acceptedTextSnapshot}</div>
    </details> : null}
  </>;
}
