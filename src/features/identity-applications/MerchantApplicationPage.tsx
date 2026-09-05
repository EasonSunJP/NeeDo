import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { StoreDetailExperience } from "../../pages/user/StoreDetailPage";
import { ShopTaxonomyRegistrationField } from "../shop-taxonomy/ShopTaxonomyRegistrationField";
import { platformMembershipSelfApi } from "../platform-membership/api";
import type { Store } from "../../types/domain";
import {
  ApplicationButton,
  ApplicationBottomAction,
  ApplicationCard,
  ApplicationField,
  ApplicationFileUpload,
  ApplicationInput,
  ApplicationNotice,
  ApplicationReadOnlyField,
  ApplicationSelect,
  ApplicationSection,
  ApplicationShell,
  ApplicationSteps,
  ApplicationTextArea
} from "./ApplicationUi";
import {
  identityApplicationsApi,
  type BankAccountInput,
  type ContractDefinition,
  type IdentityApplication
} from "./api";
import { getContractLanguage, validateMerchantShowcase, type MerchantShowcaseForm } from "./formModel";
import { formatMerchantPriceRange, parseMerchantPriceRange, validateMerchantPriceRange, type MerchantPriceRange } from "./merchantPriceRange";
import { merchantApplicationDraftMemory } from "./merchantApplicationDraftMemory";

type MerchantForm = MerchantShowcaseForm;

const emptyMerchantForm: MerchantForm = {
  applicantKind: "individual",
  corporateLegalName: "",
  corporateLegalNameKana: "",
  representativeName: "",
  representativeNameKana: "",
  shopName: "",
  businessAddress: "",
  contactPhone: "",
  responsiblePersonName: "",
  description: "",
  serviceCategoryIds: [],
  businessKeywordIds: []
};

const emptyBank: BankAccountInput = {
  bankCode: "",
  bankName: "",
  branchCode: "",
  branchName: "",
  accountType: "ordinary",
  accountNumber: "",
  accountHolderName: ""
};

const emptyCover =
  "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='700' viewBox='0 0 1200 700'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop stop-color='%23172228'/%3E%3Cstop offset='1' stop-color='%23263527'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='1200' height='700' fill='url(%23g)'/%3E%3Cpath d='M0 590C250 460 420 650 700 500s360-80 500-20v220H0Z' fill='%23a9ff38' opacity='.12'/%3E%3C/svg%3E";

function readDraftString(draft: Record<string, unknown> | null | undefined, key: string) {
  const value = draft?.[key];
  return typeof value === "string" ? value : "";
}

export function MerchantApplicationPage() {
  const { session } = useAuth();
  const accountId = session?.id ?? null;
  return <MerchantApplicationForm accountId={accountId} key={accountId ?? "anonymous"} />;
}

function MerchantApplicationForm({ accountId }: { accountId: number | null }) {
  const navigate = useNavigate();
  const { language } = useI18n();
  const { refreshSession } = useAuth();
  const t = (source: string) => translateText(source, language);
  // Reading during initialization is non-destructive so StrictMode can replay the mount safely.
  const [retainedDraft] = useState(() => merchantApplicationDraftMemory.read(accountId));
  const [canSaveRetainedDraft, setCanSaveRetainedDraft] = useState(!retainedDraft);
  const [step, setStep] = useState(0);
  const [application, setApplication] = useState<IdentityApplication | null>(retainedDraft?.application ?? null);
  const [form, setForm] = useState<MerchantForm>(retainedDraft?.form ?? emptyMerchantForm);
  const [priceRange, setPriceRange] = useState<MerchantPriceRange>(retainedDraft?.priceRange ?? { min: "", max: "" });
  const [ekycVerified, setEkycVerified] = useState(false);
  const [bank, setBank] = useState<BankAccountInput>(emptyBank);
  const [showcaseImage, setShowcaseImage] = useState<File | null>(retainedDraft?.showcaseImage ?? null);
  const [representativeIdentity, setRepresentativeIdentity] = useState<File | null>(null);
  const [corporateRegistration, setCorporateRegistration] = useState<File | null>(null);
  const [contract, setContract] = useState<ContractDefinition | null>(null);
  const [hasRead, setHasRead] = useState(false);
  const [hasAgreed, setHasAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [previewImageUrl, setPreviewImageUrl] = useState("");
  const [selectedKeywordLabels, setSelectedKeywordLabels] = useState<string[]>(retainedDraft?.selectedKeywordLabels ?? []);

  useEffect(() => {
    merchantApplicationDraftMemory.clearIfCurrent(accountId, retainedDraft);
  }, [accountId, retainedDraft]);

  useEffect(() => {
    let active = true;
    platformMembershipSelfApi.getMine()
      .then((membership) => {
        if (active) setEkycVerified(membership.ekycVerified);
      })
      .catch(() => {
        if (active) setEkycVerified(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    identityApplicationsApi.listMine({ type: "merchant" }).then(({ list }) => {
      if (!active) return;
      const existing = list.find((item) => !["withdrawn", "approved"].includes(item.status)) ?? null;
      if (retainedDraft) {
        const base = retainedDraft.baseApplication;
        if (existing?.id !== base?.id || existing?.version !== base?.version) {
          setError("店铺申请草稿已发生变更。本页未保存资料已保留，请复制后重新打开申请。");
          return;
        }
        setCanSaveRetainedDraft(true);
      }
      if (!existing) return;
      setApplication(existing);
      const detail = existing.merchantDetail;
      if (detail && !retainedDraft) {
        setForm({
          applicantKind: detail.applicantKind,
          corporateLegalName: detail.corporateLegalName ?? "",
          corporateLegalNameKana: detail.corporateLegalNameKana ?? "",
          representativeName: detail.representativeName,
          representativeNameKana: detail.representativeNameKana,
          shopName: detail.shopName,
          businessAddress: detail.businessAddress,
          contactPhone: detail.contactPhone,
          responsiblePersonName: detail.responsiblePersonName,
          description: readDraftString(detail.showcaseDraft, "description"),
          serviceCategoryIds: detail.serviceCategoryIds ?? [],
          businessKeywordIds: detail.businessKeywordIds ?? []
        });
        setPriceRange(parseMerchantPriceRange(readDraftString(detail.showcaseDraft, "priceLabel")));
      }
      if (existing.status === "submitted" || existing.status === "under_review") setStep(3);
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : String(caught));
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!showcaseImage) {
      setPreviewImageUrl("");
      return;
    }
    const objectUrl = URL.createObjectURL(showcaseImage);
    setPreviewImageUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [showcaseImage]);

  useEffect(() => {
    if (step !== 2 || contract) return;
    identityApplicationsApi.getCurrentContract("merchant", getContractLanguage(language)).then(setContract).catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : String(caught));
    });
  }, [contract, language, step]);

  const updateForm = <K extends keyof MerchantForm>(key: K, value: MerchantForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const updateBank = <K extends keyof BankAccountInput>(key: K, value: BankAccountInput[K]) =>
    setBank((current) => ({ ...current, [key]: value }));
  const priceLabel = formatMerchantPriceRange(priceRange);

  const openVerification = () => {
    if (busy) return;
    merchantApplicationDraftMemory.retain(accountId, {
      baseApplication: application ? { id: application.id, version: application.version } : null,
      application, form, priceRange, showcaseImage, selectedKeywordLabels
    });
    navigate("/me/settings/verification");
  };

  const draftStore = useMemo<Store>(() => ({
    id: "merchant-application-draft",
    systemId: `application-${application?.id ?? "new"}`,
    merchantId: `application-${application?.id ?? "new"}`,
    name: form.shopName || t("未命名店铺"),
    area: form.businessAddress || t("地址未填写"),
    address: form.businessAddress || t("地址未填写"),
    rating: 0,
    reviewCount: 0,
    priceLabel: priceLabel || t("收费规则待填写"),
    tags: selectedKeywordLabels,
    openStatus: "closed",
    nextSlot: t("申请审核中"),
    cover: previewImageUrl || emptyCover,
    gallery: previewImageUrl ? [previewImageUrl] : [emptyCover],
    description: form.description || t("请填写服务展示说明"),
    rankLabel: t("新店申请"),
    businessHours: t("审核通过后设置"),
    mode: "store"
  }), [application?.id, form, priceLabel, previewImageUrl, language, selectedKeywordLabels]);

  const showcasePayload = () => ({
    applicantKind: form.applicantKind,
    corporateLegalName: form.applicantKind === "corporate" ? form.corporateLegalName.trim() || form.representativeName.trim() : null,
    corporateLegalNameKana: form.applicantKind === "corporate" ? form.corporateLegalNameKana.trim() || form.representativeNameKana.trim() : null,
    representativeName: form.representativeName.trim(),
    representativeNameKana: form.representativeNameKana.trim(),
    shopName: form.shopName.trim(),
    businessAddress: form.businessAddress.trim(),
    contactPhone: form.contactPhone.trim(),
    responsiblePersonName: form.responsiblePersonName.trim(),
    serviceCategoryIds: form.serviceCategoryIds,
    businessKeywordIds: form.businessKeywordIds,
    showcaseDraft: {
      description: form.description.trim(),
      priceLabel
    }
  });

  const saveShowcase = async () => {
    if (!canSaveRetainedDraft) return;
    const payload = showcasePayload();
    const validationError = validateMerchantShowcase({
      ...form,
      corporateLegalName: payload.corporateLegalName ?? "",
      corporateLegalNameKana: payload.corporateLegalNameKana ?? ""
    });
    if (validationError) {
      setError(validationError);
      return;
    }
    const priceError = validateMerchantPriceRange(priceRange);
    if (priceError) {
      setError(priceError);
      return;
    }
    setBusy(true);
    setError("");
    try {
      let working = application
        ? await identityApplicationsApi.updateMerchantShowcase(application.id, { ...payload, expectedVersion: application.version })
        : await identityApplicationsApi.createMerchantDraft(payload);
      if (showcaseImage) {
        const uploaded = await identityApplicationsApi.uploadMedia(working.id, "showcase", working.version, showcaseImage);
        working = { ...working, version: uploaded.applicationVersion };
      }
      setApplication(working);
      merchantApplicationDraftMemory.clearIfCurrent(accountId, retainedDraft);
      setStep(1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const saveBankAndIdentity = async () => {
    if (!application) return;
    if (!representativeIdentity) {
      setError("请上传法人或代表者证件照片");
      return;
    }
    if (form.applicantKind === "corporate" && !corporateRegistration) {
      setError("请上传法人登记资料");
      return;
    }
    if (!/^\d{4}$/u.test(bank.bankCode) || !/^\d{3}$/u.test(bank.branchCode) || !/^\d{4,12}$/u.test(bank.accountNumber) || !bank.bankName.trim() || !bank.branchName.trim() || !bank.accountHolderName.trim()) {
      setError("请完整填写银行账户资料");
      return;
    }
    setBusy(true);
    setError("");
    try {
      let version = application.version;
      const repUploaded = await identityApplicationsApi.uploadMedia(application.id, "representative_identity", version, representativeIdentity);
      version = repUploaded.applicationVersion;
      if (corporateRegistration) {
        const registrationUploaded = await identityApplicationsApi.uploadMedia(application.id, "corporate_registration", version, corporateRegistration);
        version = registrationUploaded.applicationVersion;
      }
      const bound = await identityApplicationsApi.bindMerchantBankAccount(application.id, { ...bank, expectedVersion: version });
      setApplication((current) => current ? { ...current, version: bound.applicationVersion } : current);
      setStep(2);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const acceptAndSubmit = async () => {
    if (!application || !contract || !hasRead || !hasAgreed) return;
    setBusy(true);
    setError("");
    try {
      const accepted = await identityApplicationsApi.acceptMerchantContract(application.id, {
        expectedVersion: application.version,
        contractVersion: contract.version,
        contentHash: contract.contentHash,
        language: contract.language,
        hasRead: true,
        hasAgreed: true
      });
      const submitted = await identityApplicationsApi.submit(application.id, accepted.applicationVersion);
      setApplication(submitted);
      await refreshSession();
      setStep(3);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ApplicationShell hideNavigation info="按店铺前端的服务展示结构填写，完成银行名义校验与有法律效力的合同确认后才可提交。" title="申请店铺身份">
      <ApplicationSteps current={Math.min(step, 2)} labels={["服务展示", "银行与身份", "收费规则与合同"]} />
      {error ? <ApplicationNotice tone="error">{t(error)}</ApplicationNotice> : null}
      {application?.status === "rejected" && application.rejectionReason ? <ApplicationNotice tone="error">{t("上次驳回原因")}：{application.rejectionReason}</ApplicationNotice> : null}

      {step === 0 ? (
        <>
          <ApplicationSection info="选择以个人或法人主体提交店铺申请。" title="名义">
            <div className="grid grid-cols-2 gap-2 rounded-full bg-[color:var(--client-elevated)] p-1">
              {(["individual", "corporate"] as const).map((kind) => (
                <button className={`rounded-full px-4 py-3 text-sm font-black ${form.applicantKind === kind ? "bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)]" : "text-[color:var(--client-muted)]"}`} key={kind} onClick={() => updateForm("applicantKind", kind)} type="button">{t(kind === "individual" ? "个人名义" : "法人名义")}</button>
              ))}
            </div>
          </ApplicationSection>
          <ApplicationSection info="填写申请人与店铺的正式联系资料。" title="基础信息">
            <ApplicationField label="申请人" required>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                <ApplicationInput onChange={(event) => updateForm("responsiblePersonName", event.target.value)} value={form.responsiblePersonName} />
                <ApplicationButton disabled={busy} onClick={openVerification} tone={ekycVerified ? "secondary" : "primary"}>
                  {t(ekycVerified ? "已本人确认" : "本人确认（eKYC）")}
                </ApplicationButton>
              </div>
            </ApplicationField>
            <div className="grid gap-4 sm:grid-cols-2">
              <ApplicationField label="法人或代表者姓名" required><ApplicationInput onChange={(event) => updateForm("representativeName", event.target.value)} value={form.representativeName} /></ApplicationField>
              <ApplicationField label="法人或代表者姓名片假名" required><ApplicationInput onChange={(event) => updateForm("representativeNameKana", event.target.value)} value={form.representativeNameKana} /></ApplicationField>
              <ApplicationField label="店铺名称" required><ApplicationInput onChange={(event) => updateForm("shopName", event.target.value)} value={form.shopName} /></ApplicationField>
              <ApplicationField label="店铺地址" required><ApplicationInput onChange={(event) => updateForm("businessAddress", event.target.value)} value={form.businessAddress} /></ApplicationField>
              <ApplicationField label="联系电话" required><ApplicationInput onChange={(event) => updateForm("contactPhone", event.target.value)} value={form.contactPhone} /></ApplicationField>
            </div>
          </ApplicationSection>
          <ShopTaxonomyRegistrationField
            language={language}
            onChange={(value) => setForm((current) => ({ ...current, ...value }))}
            onKeywordLabelsChange={setSelectedKeywordLabels}
            value={{ serviceCategoryIds: form.serviceCategoryIds, businessKeywordIds: form.businessKeywordIds }}
          />
          <ApplicationSection info="填写主页展示的最低与最高服务费用。" title="费用区间">
            <div className="grid grid-cols-2 gap-3">
              <ApplicationField label="最低费用">
                <ApplicationInput inputMode="numeric" onChange={(event) => setPriceRange((current) => ({ ...current, min: event.target.value.replace(/\D/gu, "") }))} value={priceRange.min} />
              </ApplicationField>
              <ApplicationField label="最高费用">
                <ApplicationInput inputMode="numeric" onChange={(event) => setPriceRange((current) => ({ ...current, max: event.target.value.replace(/\D/gu, "") }))} value={priceRange.max} />
              </ApplicationField>
            </div>
          </ApplicationSection>
          <ApplicationSection info="简介会显示在店铺主页。" title="店铺简介">
            <ApplicationTextArea aria-label={t("店铺简介")} required onChange={(event) => updateForm("description", event.target.value)} value={form.description} />
          </ApplicationSection>
          <ApplicationSection info="支持 JPEG 或 PNG，并作为主页第一张展示图。" title="上传店铺第一张展示图">
            <ApplicationFileUpload accept="image/jpeg,image/png" file={showcaseImage} label={t("选择店铺展示图")} onChange={setShowcaseImage} />
          </ApplicationSection>
          <ApplicationSection className="overflow-hidden" info="按照店铺主页的正式组件实时预览申请资料。" title="主页效果预览">
            <div className="pointer-events-none max-h-[760px] overflow-hidden" aria-label={t("店铺服务展示预览")}><StoreDetailExperience embedded scope="user" store={draftStore} techniciansOverride={[]} /></div>
          </ApplicationSection>
          <ApplicationBottomAction>
            <ApplicationButton className="w-full" disabled={busy || !canSaveRetainedDraft} onClick={() => void saveShowcase()}>{busy ? t("保存中") : t("下一步：银行与身份")}</ApplicationButton>
          </ApplicationBottomAction>
        </>
      ) : null}

      {step === 1 ? (
        <ApplicationCard className="space-y-4">
          <ApplicationNotice>{t(form.applicantKind === "corporate" ? "法人名义申请时，银行账户名义必须与法人名称一致。" : "个人名义申请时，银行账户名义必须与 eKYC 姓名一致。")}</ApplicationNotice>
          {form.applicantKind === "individual" ? <ApplicationNotice>{t("如尚未完成 eKYC，请先在用户设置的验证与资质页面完成认证。")}</ApplicationNotice> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <ApplicationField label="银行代码" required><ApplicationInput inputMode="numeric" maxLength={4} onChange={(event) => updateBank("bankCode", event.target.value)} value={bank.bankCode} /></ApplicationField>
            <ApplicationField label="银行名称" required><ApplicationInput onChange={(event) => updateBank("bankName", event.target.value)} value={bank.bankName} /></ApplicationField>
            <ApplicationField label="支店代码" required><ApplicationInput inputMode="numeric" maxLength={3} onChange={(event) => updateBank("branchCode", event.target.value)} value={bank.branchCode} /></ApplicationField>
            <ApplicationField label="支店名称" required><ApplicationInput onChange={(event) => updateBank("branchName", event.target.value)} value={bank.branchName} /></ApplicationField>
            <ApplicationField label="账户类型" required><ApplicationSelect onChange={(event) => updateBank("accountType", event.target.value as BankAccountInput["accountType"])} value={bank.accountType}><option value="ordinary">{t("普通账户")}</option><option value="current">{t("当座账户")}</option></ApplicationSelect></ApplicationField>
            <ApplicationField label="账号" required><ApplicationInput inputMode="numeric" onChange={(event) => updateBank("accountNumber", event.target.value)} value={bank.accountNumber} /></ApplicationField>
            <ApplicationField hint={form.applicantKind === "corporate" ? "必须与法人名称片假名一致" : "必须与 eKYC 姓名一致"} label="账户名义人" required><ApplicationInput onChange={(event) => updateBank("accountHolderName", event.target.value)} value={bank.accountHolderName} /></ApplicationField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <ApplicationField hint="JPEG 或 PNG" label="法人或代表者证件照片" required><ApplicationInput accept="image/jpeg,image/png" onChange={(event) => setRepresentativeIdentity(event.target.files?.[0] ?? null)} type="file" /></ApplicationField>
            {form.applicantKind === "corporate" ? <ApplicationField hint="JPEG 或 PNG" label="法人登记资料" required><ApplicationInput accept="image/jpeg,image/png" onChange={(event) => setCorporateRegistration(event.target.files?.[0] ?? null)} type="file" /></ApplicationField> : null}
          </div>
          <div className="flex gap-3"><ApplicationButton className="flex-1" disabled={busy} onClick={() => void saveBankAndIdentity()}>{busy ? t("校验中") : t("下一步：收费规则与合同")}</ApplicationButton><ApplicationButton onClick={() => setStep(0)} tone="secondary">{t("上一步")}</ApplicationButton></div>
        </ApplicationCard>
      ) : null}

      {step === 2 ? (
        <ApplicationCard className="space-y-4">
          <div><h2 className="text-xl font-black text-[color:var(--client-text)]">{t("收费规则与 NeeDo 合同")}</h2><p className="mt-1 text-xs leading-5 text-[color:var(--client-muted)]">{t("合同以当前版本、完整正文和内容哈希留存，确认后具有法律效力。")}</p></div>
          {contract ? <div className="max-h-[48vh] overflow-y-auto whitespace-pre-wrap rounded-[20px] border border-[color:var(--client-line)] bg-[color:var(--client-elevated)] p-4 text-[12px] leading-6 text-[color:var(--client-text)]">{contract.text}</div> : <ApplicationNotice>{t("正在读取合同全文")}</ApplicationNotice>}
          {contract ? <p className="break-all text-[10px] text-[color:var(--client-muted)]">v{contract.version} · {contract.contentHash}</p> : null}
          <label className="flex items-start gap-3 text-sm font-bold text-[color:var(--client-text)]"><input checked={hasRead} className="mt-1 h-5 w-5 accent-[color:var(--client-primary)]" onChange={(event) => setHasRead(event.target.checked)} type="checkbox" />{t("我已阅读完整收费规则与合同")}</label>
          <label className="flex items-start gap-3 text-sm font-bold text-[color:var(--client-text)]"><input checked={hasAgreed} className="mt-1 h-5 w-5 accent-[color:var(--client-primary)]" onChange={(event) => setHasAgreed(event.target.checked)} type="checkbox" />{t("我同意与 NeeDo 缔结具有法律效力的合同")}</label>
          <div className="flex gap-3"><ApplicationButton className="flex-1" disabled={busy || !contract || !hasRead || !hasAgreed} onClick={() => void acceptAndSubmit()}>{busy ? t("提交中") : t("提交申请")}</ApplicationButton><ApplicationButton onClick={() => setStep(1)} tone="secondary">{t("上一步")}</ApplicationButton></div>
        </ApplicationCard>
      ) : null}

      {step === 3 ? (
        <ApplicationCard className="space-y-4">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[color:var(--client-primary)] text-3xl font-black text-[color:var(--client-primary-contrast)]">✓</div>
          <div className="text-center">
            <h2 className="text-xl font-black text-[color:var(--client-text)]">{t("店铺申请已提交")}</h2>
            <p className="mt-2 text-sm leading-7 text-[color:var(--client-muted)]">{t("运营后台批准后会开启店铺身份，并发送系统消息。")}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <ApplicationReadOnlyField label="申请名义" value={t(form.applicantKind === "corporate" ? "法人名义" : "个人名义")} />
            <ApplicationReadOnlyField label="申请人" value={form.responsiblePersonName} />
            <ApplicationReadOnlyField label="法人或代表者姓名" value={form.representativeName} />
            <ApplicationReadOnlyField label="法人或代表者姓名片假名" value={form.representativeNameKana} />
            <ApplicationReadOnlyField label="店铺名称" value={form.shopName} />
            <ApplicationReadOnlyField label="店铺地址" value={form.businessAddress} />
            <ApplicationReadOnlyField label="联系电话" value={form.contactPhone} />
            <ApplicationReadOnlyField label="费用区间" value={priceLabel} />
            <ApplicationReadOnlyField label="店铺简介" value={form.description} />
            <ApplicationReadOnlyField label="eKYC" value={t(application?.merchantDetail?.eKycVerified ? "已验证" : "未验证")} />
            <ApplicationReadOnlyField label="银行账户" value={t(application?.merchantDetail?.bankVerificationStatus === "verified" ? "已验证" : "未验证")} />
          </div>
          <ApplicationNotice>{t("申请结束 30 天后，服务器会删除申请资料和图片；合同回执及批准后用于结算的银行账户按法务和业务要求继续保存。")}</ApplicationNotice>
          <ApplicationButton className="w-full" disabled tone="secondary">{t("审核中")}</ApplicationButton>
          <ApplicationButton className="w-full" onClick={() => window.location.assign("/me/settings/portal")}>{t("返回身份设置")}</ApplicationButton>
        </ApplicationCard>
      ) : null}
    </ApplicationShell>
  );
}
