import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AppIcon } from "../../components/client-ui/AppScaffold";
import { SettingsDetailPage } from "../../components/client-ui/SettingsDirectory";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import {
  ApplicationButton,
  ApplicationBottomAction,
  ApplicationCard,
  ApplicationField,
  ApplicationInput,
  ApplicationNotice,
  ProtectedApplicationImage
} from "./ApplicationUi";
import { identityApplicationsApi, type MerchantReview, type TechnicianReview } from "./api";
import { mergePendingMerchantReviews } from "../../components/admin/adminOperatorSummaryModel";
import { UnifiedEntityInfoCard } from "../../shared/profile-card/UnifiedEntityInfoCard";

const reviewableStatus = (status: string) => status === "submitted" || status === "under_review";
const visibleReviewStatus = (status: string) => status !== "draft" && status !== "withdrawn";

function ReviewShell({ title, info, backTo, children, embedded }: { title: string; info: string; backTo: string; children: React.ReactNode; embedded?: boolean }) {
  const { language } = useI18n();
  if (embedded) return <div className="space-y-5"><h1 className="text-3xl font-black">{translateText(title, language)}</h1><p className="text-sm text-[color:var(--client-muted)]">{translateText(info, language)}</p>{children}</div>;
  return <SettingsDetailPage backTo={backTo} closeTo={backTo} info={translateText(info, language)} navItems={undefined} title={translateText(title, language)}>{children}</SettingsDetailPage>;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  const { language } = useI18n();
  return <div className="grid gap-1 border-b border-[color:var(--client-line)] py-3 last:border-b-0 sm:grid-cols-[9rem_1fr]"><dt className="text-xs font-black text-[color:var(--client-muted)]">{translateText(label, language)}</dt><dd className="break-words text-sm font-bold text-[color:var(--client-text)]">{value || "—"}</dd></div>;
}

function TechnicianApplicationCardStatus({ status, t }: { status: TechnicianReview["status"]; t: (source: string) => string }) {
  if (status === "approved") {
    return (
      <span
        aria-label={t("审核已通过")}
        className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[#06100b] shadow-[0_14px_30px_color-mix(in_srgb,var(--client-primary)_36%,transparent)]"
      >
        <AppIcon className="h-5 w-5" name="check" />
      </span>
    );
  }

  if (status === "rejected") {
    return (
      <span
        aria-label={t("审核未通过")}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[color:color-mix(in_srgb,var(--client-accent)_55%,var(--client-line))] bg-[color:color-mix(in_srgb,var(--client-accent)_14%,transparent)] text-xl font-black text-[color:var(--client-accent)]"
      >
        ×
      </span>
    );
  }

  return <span aria-label={t("查看申请")} className="shrink-0 text-xl text-[color:var(--client-primary)]">›</span>;
}

export function TechnicianApplicationsReviewPage({ embedded = false, searchQuery = "" }: { embedded?: boolean; searchQuery?: string } = {}) {
  const { language } = useI18n();
  const t = (source: string) => translateText(source, language);
  const [items, setItems] = useState<TechnicianReview[]>([]);
  const [selected, setSelected] = useState<TechnicianReview | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const visibleItems = items.filter((item) => visibleReviewStatus(item.status) && (!normalizedSearchQuery || [
    item.applicantName,
    item.phone,
    item.city,
    item.status,
    String(item.applicationId)
  ].some((value) => (value ?? "").toLowerCase().includes(normalizedSearchQuery))));

  const load = async () => {
    setError("");
    try {
      const result = await identityApplicationsApi.listTechnicianReviews();
      setItems(result.list);
      if (selected) {
        const refreshed = result.list.find((item) => item.applicationId === selected.applicationId) ?? null;
        setSelected(refreshed);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const open = async (id: number) => {
    setBusy(true);
    setError("");
    try {
      setSelected(await identityApplicationsApi.getTechnicianReview(id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await identityApplicationsApi.approveTechnicianApplication(selected.applicationId, selected.version);
      await load();
      setSelected(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!selected || !rejectionReason.trim()) return;
    setBusy(true);
    setError("");
    try {
      await identityApplicationsApi.rejectTechnicianApplication(selected.applicationId, selected.version, rejectionReason.trim());
      await load();
      setSelected(null);
      setRejectionReason("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const contact = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const result = await identityApplicationsApi.contactTechnicianApplicant(selected.applicationId);
      window.location.assign(`/merchant/messages/${result.conversationId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setBusy(false);
    }
  };

  const download = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const dataUrl = await identityApplicationsApi.downloadTechnicianResume(selected.applicationId);
      const anchor = document.createElement("a");
      anchor.href = dataUrl;
      anchor.download = `technician-application-${selected.applicationId}.xlsx`;
      anchor.click();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ReviewShell embedded={embedded} backTo="/merchant" info="查看申请资料和照片，批准入驻、联系申请人或下载包含全部资料和图片的 Excel 简历。" title={embedded ? "员工申请管理" : "技师入驻申请"}>
      {error ? <ApplicationNotice tone="error">{t(error)}</ApplicationNotice> : null}
      {!selected ? (
        <ApplicationCard className="space-y-3 overflow-visible">
          {visibleItems.length === 0 ? <ApplicationNotice><span data-testid="technician-applications-empty">{t("暂无申请")}</span></ApplicationNotice> : visibleItems.map((item) => (
            <div data-application-status={item.status} key={item.applicationId}>
              <UnifiedEntityInfoCard
                actionSlot={<TechnicianApplicationCardStatus status={item.status} t={t} />}
                data={{
                  kind: "technician",
                  id: String(item.applicantUserId),
                  name: item.applicantName,
                  imageUrl: item.media.find((media) => media.purpose === "portrait")?.url ?? null,
                  description: item.bio,
                  languages: [],
                  tags: [...item.skills, ...item.serviceAreas],
                  rating: null,
                  completedOrderCount: null,
                  distanceKm: null,
                  favoriteCount: null,
                  shareCount: null,
                }}
                language={language}
                onOpenDetails={() => void open(item.applicationId)}
              />
            </div>
          ))}
        </ApplicationCard>
      ) : (
        <>
          <div className="space-y-5 pb-[calc(env(safe-area-inset-bottom,0px)+8rem)]" data-testid="technician-application-detail-content">
            <ApplicationCard>
              <dl>
                <DetailRow label="本人姓名" value={selected.applicantName} />
                <DetailRow label="联系电话" value={selected.phone} />
                <DetailRow label="所在城市" value={selected.city} />
                <DetailRow label="性别" value={selected.gender ? t(selected.gender) : "—"} />
                <DetailRow label="生日" value={selected.birthDate?.slice(0, 10)} />
                <DetailRow label="从业年数" value={selected.yearsExperience === null ? "—" : `${selected.yearsExperience} ${t("年")}`} />
                <DetailRow label="可服务区域" value={selected.serviceAreas.join("、")} />
                <DetailRow label="擅长项目" value={selected.skills.join("、")} />
                <DetailRow label="自我介绍" value={selected.bio} />
              </dl>
            </ApplicationCard>
            {selected.media.length ? <ApplicationCard className="grid gap-4 sm:grid-cols-2">{selected.media.map((media) => <figure key={media.id}><ProtectedApplicationImage alt={t(media.purpose === "portrait" ? "本人照片" : "证件照片")} applicationId={selected.applicationId} className="aspect-[4/3]" mediaId={media.id} /><figcaption className="mt-2 text-center text-xs font-bold text-[color:var(--client-muted)]">{t(media.purpose === "portrait" ? "本人照片" : "证件照片")}</figcaption></figure>)}</ApplicationCard> : null}
            {reviewableStatus(selected.status) ? <ApplicationCard><div className="flex gap-3"><div className="min-w-0 flex-1"><ApplicationField label="驳回原因" required><ApplicationInput onChange={(event) => setRejectionReason(event.target.value)} value={rejectionReason} /></ApplicationField></div><ApplicationButton className="self-end" disabled={busy || !rejectionReason.trim()} onClick={() => void reject()} tone="danger">{t("驳回")}</ApplicationButton></div></ApplicationCard> : null}
          </div>
          <ApplicationBottomAction>
            <div className="grid grid-cols-3 gap-2" data-testid="technician-application-floating-actions">
              <ApplicationButton className="px-2 text-[11px] sm:text-sm" disabled={busy} onClick={() => void download()} tone="secondary">{t("下载 Excel 简历")}</ApplicationButton>
              <ApplicationButton className="px-2 text-xs sm:text-sm" disabled={busy} onClick={() => void contact()} tone="secondary">{t("联系")}</ApplicationButton>
              <ApplicationButton className="px-2 text-xs sm:text-sm" disabled={busy || !reviewableStatus(selected.status)} onClick={() => void approve()}>{t("审核通过")}</ApplicationButton>
            </div>
          </ApplicationBottomAction>
        </>
      )}
    </ReviewShell>
  );
}

export function MerchantApplicationsReviewPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { language } = useI18n();
  const t = (source: string) => translateText(source, language);
  const [searchParams, setSearchParams] = useSearchParams();
  const pendingOnly = searchParams.get("status") === "pending";
  const concreteStatuses = new Set(["draft", "submitted", "under_review", "approved", "rejected", "withdrawn"]);
  const requestedStatus = searchParams.get("status");
  const concreteStatus = requestedStatus && concreteStatuses.has(requestedStatus)
    ? requestedStatus as NonNullable<Parameters<typeof identityApplicationsApi.listMerchantReviews>[0]>["status"]
    : undefined;
  const applicationIdValue = searchParams.get("applicationId");
  const applicationId = applicationIdValue && /^\d+$/.test(applicationIdValue) && Number(applicationIdValue) > 0
    ? Number(applicationIdValue)
    : null;
  const [items, setItems] = useState<MerchantReview[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<MerchantReview | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setError("");
    try {
      if (pendingOnly) {
        const [submitted, underReview] = await Promise.all([
          identityApplicationsApi.listMerchantReviews({ page: 1, pageSize: 20, status: "submitted" }),
          identityApplicationsApi.listMerchantReviews({ page: 1, pageSize: 20, status: "under_review" })
        ]);
        const merged = mergePendingMerchantReviews(submitted, underReview, 20);
        setItems(merged.list);
        setTotal(merged.total);
      } else {
        const result = await identityApplicationsApi.listMerchantReviews({
          page: 1,
          pageSize: 20,
          status: concreteStatus
        });
        setItems(result.list);
        setTotal(result.total);
      }
    } catch (caught) {
      setItems([]);
      setTotal(0);
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  useEffect(() => {
    void load();
  }, [concreteStatus, pendingOnly]);

  useEffect(() => {
    if (applicationId === null) {
      setSelected(null);
      setRejectionReason("");
      return;
    }
    let current = true;
    setBusy(true);
    setError("");
    identityApplicationsApi.getMerchantReview(applicationId)
      .then((result) => {
        if (current) setSelected(result);
      })
      .catch((caught: unknown) => {
        if (current) {
          setSelected(null);
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      })
      .finally(() => {
        if (current) setBusy(false);
      });
    return () => {
      current = false;
    };
  }, [applicationId]);

  const setApplicationId = (id: number | null) => {
    const next = new URLSearchParams(searchParams);
    if (id === null) next.delete("applicationId");
    else next.set("applicationId", String(id));
    setSearchParams(next, { replace: true });
  };

  const review = async (approved: boolean) => {
    if (!selected || (!approved && !rejectionReason.trim())) return;
    setBusy(true);
    setError("");
    try {
      if (approved) await identityApplicationsApi.approveMerchantApplication(selected.applicationId, selected.version);
      else await identityApplicationsApi.rejectMerchantApplication(selected.applicationId, selected.version, rejectionReason.trim());
      await load();
      setApplicationId(null);
      setRejectionReason("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ReviewShell embedded={embedded} backTo="/admin/merchants" info="核对代表者、eKYC、法人资料、银行账户登记、服务展示及合同证据后批准或驳回店铺身份。" title={embedded ? "店铺申请管理" : "店铺身份申请审核"}>
      {error ? <ApplicationNotice tone="error">{t(error)}</ApplicationNotice> : null}
      {!selected ? (
        <ApplicationCard className="space-y-2">
          {pendingOnly && !error ? <p className="px-1 text-xs font-black text-[color:var(--client-muted)]">{t("待审核共")} {total} {t("条")}</p> : null}
          {items.length === 0 ? <ApplicationNotice>{t("暂无店铺身份申请")}</ApplicationNotice> : items.map((item) => <button className="flex w-full items-center justify-between rounded-[20px] border border-[color:var(--client-line)] p-4 text-left" key={item.applicationId} onClick={() => setApplicationId(item.applicationId)} type="button"><span><span className="block text-sm font-black text-[color:var(--client-text)]">{item.shopName}</span><span className="mt-1 block text-xs text-[color:var(--client-muted)]">#{item.applicationId} · {t(item.status)}</span></span><span className="text-xl text-[color:var(--client-primary)]">›</span></button>)}
        </ApplicationCard>
      ) : (
        <>
          <ApplicationCard><dl>
            <DetailRow label="申请名义" value={t(selected.applicantKind === "corporate" ? "法人名义" : "个人名义")} />
            <DetailRow label="法人名称" value={selected.corporateLegalName} />
            <DetailRow label="法人名称片假名" value={selected.corporateLegalNameKana} />
            <DetailRow label="法人或代表者姓名" value={selected.representativeName} />
            <DetailRow label="法人或代表者姓名片假名" value={selected.representativeNameKana} />
            <DetailRow label="店铺名称" value={selected.shopName} />
            <DetailRow label="店铺地址" value={selected.businessAddress} />
            <DetailRow label="联系电话" value={selected.contactPhone} />
            <DetailRow label="负责人姓名" value={selected.responsiblePersonName} />
            <DetailRow label="eKYC" value={t(selected.eKycVerified ? "已验证" : "未验证")} />
            <DetailRow label="银行账户" value={selected.bankAccount ? `${selected.bankAccount.bankName} ${selected.bankAccount.branchName} · ${selected.bankAccount.accountNumberMasked}` : "—"} />
            <DetailRow label="账户名义人" value={selected.bankAccount?.accountHolderMasked} />
            <DetailRow label="合同版本" value={selected.contractAcceptance?.contractVersion} />
            <DetailRow label="合同回执" value={selected.contractAcceptance?.receiptId} />
            <DetailRow label="服务种类" value={selected.serviceCategories.map((category) => category.label).join("、")} />
            <DetailRow label="服务关键词" value={selected.businessKeywords.map((keyword) => keyword.label).join("、") || "—"} />
            <DetailRow label="服务展示" value={<pre className="whitespace-pre-wrap text-xs">{JSON.stringify(selected.showcaseDraft, null, 2)}</pre>} />
          </dl></ApplicationCard>
          {selected.media.length ? <ApplicationCard className="grid gap-4 sm:grid-cols-2">{selected.media.map((media) => <figure key={media.id}><ProtectedApplicationImage alt={t(media.purpose)} applicationId={selected.applicationId} className="aspect-[4/3]" mediaId={media.id} /><figcaption className="mt-2 text-center text-xs font-bold text-[color:var(--client-muted)]">{t(media.purpose)}</figcaption></figure>)}</ApplicationCard> : null}
          <ApplicationNotice>{t("试用期计算：开启日当月剩余少于 15 天时，自动额外增加同等剩余天数；剩余正好 15 天或大于 15 天时，当月计为试用第一个月。")}</ApplicationNotice>
          <ApplicationCard className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2"><ApplicationButton disabled={busy || !reviewableStatus(selected.status)} onClick={() => void review(true)}>{t("审核通过")}</ApplicationButton><ApplicationButton disabled={busy || !rejectionReason.trim() || !reviewableStatus(selected.status)} onClick={() => void review(false)} tone="danger">{t("驳回")}</ApplicationButton></div>
            {reviewableStatus(selected.status) ? <ApplicationField label="驳回原因" required><ApplicationInput onChange={(event) => setRejectionReason(event.target.value)} value={rejectionReason} /></ApplicationField> : null}
            <ApplicationButton className="w-full" onClick={() => setApplicationId(null)} tone="secondary">{t("返回申请列表")}</ApplicationButton>
          </ApplicationCard>
        </>
      )}
    </ReviewShell>
  );
}
