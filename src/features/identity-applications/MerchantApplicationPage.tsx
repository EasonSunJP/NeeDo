import { translateBankResumeText } from "./bankResumeI18n";
import { selectLatestApplication } from "./model";
import { ApplicationReviewEvidence } from "./ApplicationReviewEvidence";
import { ApplicationReviewActions } from "./ApplicationReviewActions";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { StoreDetailExperience } from "../../pages/user/StoreDetailPage";
import { ShopTaxonomyRegistrationField } from "../shop-taxonomy/ShopTaxonomyRegistrationField";
import { platformMembershipSelfApi } from "../platform-membership/api";
import type { Store, StorePresentationConfig } from "../../types/domain";
import {
  ApplicationButton,
  ApplicationBottomAction,
  ApplicationCard,
  ApplicationField,
  ApplicationFileUpload,
  ApplicationInput,
  ApplicationNotice,
  ApplicationReadOnlyField,
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
import { getContractLanguage, splitApplicantName, merchantApplicationErrorMessage, normalizeBankDigits, validateMerchantBankAccount, validateMerchantShowcase, type MerchantShowcaseForm } from "./formModel";
import { formatMerchantPriceRange, parseMerchantPriceRange, validateMerchantPriceRange, type MerchantPriceRange } from "./merchantPriceRange";
import { merchantApplicationDraftMemory } from "./merchantApplicationDraftMemory";

import { ApplicationDropdown } from "./ApplicationDropdown";
import { MerchantAccountTypeSelect } from "./MerchantAccountTypeSelect";
import { japanBanks, japanBankGroups } from "./japanBanks";

type MerchantForm = MerchantShowcaseForm;

const emptyMerchantForm: MerchantForm = {
  applicantKind: "individual",
  corporateLegalName: "",
  corporateLegalNameKana: "",
  representativeName: "",
  representativeNameKana: "",
  shopName: "",
  businessAddress: "",
  nearestStation: "",
  stationTravelMinutes: "",
  stationAccess: "",
  contactPhone: "",
  responsiblePersonName: "",
  responsibleFamilyName: "",
  responsibleGivenName: "",
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
  const [customBank, setCustomBank] = useState(false);
  const [editingSavedBank, setEditingSavedBank] = useState(false);
  const savedBank = application?.reviewEvidence?.bankAccount;
  const reuseSavedBank = !editingSavedBank && Boolean(application?.merchantDetail?.bankAccountId && application.merchantDetail.bankVerificationStatus === "verified" && savedBank?.verificationStatus === "verified");
  const hasSavedRegistration = application?.merchantDetail?.mediaPurposes.includes("corporate_registration") ?? false;
  const bankText = (source: string) => translateBankResumeText(source, language);
  const [showcaseImage, setShowcaseImage] = useState<File | null>(retainedDraft?.showcaseImage ?? null);
  const [corporateRegistration, setCorporateRegistration] = useState<File | null>(null);
  const [contract, setContract] = useState<ContractDefinition | null>(null);
  const [contractFailed, setContractFailed] = useState(false);
  const [contractRevision, setContractRevision] = useState(0);
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
      const existing = selectLatestApplication(list);
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
          nearestStation: readDraftString(detail.showcaseDraft, "nearestStation"),
          stationTravelMinutes: typeof detail.showcaseDraft?.stationTravelMinutes === "number" ? String(detail.showcaseDraft.stationTravelMinutes) : "",
          stationAccess: readDraftString(detail.showcaseDraft, "stationAccess"),
          contactPhone: detail.contactPhone,
          responsiblePersonName: detail.responsiblePersonName,
          responsibleFamilyName: readDraftString(detail.showcaseDraft, "responsibleFamilyName") || splitApplicantName(detail.responsiblePersonName).familyName,
          responsibleGivenName: readDraftString(detail.showcaseDraft, "responsibleGivenName") || splitApplicantName(detail.responsiblePersonName).givenName,
          description: readDraftString(detail.showcaseDraft, "description"),
          serviceCategoryIds: detail.serviceCategoryIds ?? [],
          businessKeywordIds: detail.businessKeywordIds ?? []
        });
        setPriceRange(parseMerchantPriceRange(readDraftString(detail.showcaseDraft, "priceLabel")));
      }
      if (["submitted", "under_review", "approved", "rejected"].includes(existing.status)) setStep(3);
    }).catch((caught: unknown) => {
      if (active) setError(merchantApplicationErrorMessage(caught));
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
    let active = true;
    setContractFailed(false);
    identityApplicationsApi.getCurrentContract("merchant", getContractLanguage(language)).then(value => {
      if (active) setContract(value);
    }).catch((caught: unknown) => {
      if (active) { setContractFailed(true); setError(merchantApplicationErrorMessage(caught)); }
    });
    return () => { active = false; };
  }, [contract, language, step, contractRevision]);

  const updateForm = <K extends keyof MerchantForm>(key: K, value: MerchantForm[K]) =>
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "responsibleFamilyName" || key === "responsibleGivenName") next.responsiblePersonName = [next.responsibleFamilyName?.trim(), next.responsibleGivenName?.trim()].filter(Boolean).join(" ");
      return next;
    });
  const updateBank = <K extends keyof BankAccountInput>(key: K, value: BankAccountInput[K]) => {
    setError("");
    setBank((current) => ({ ...current, [key]: key === "bankCode" || key === "branchCode" || key === "accountNumber" ? normalizeBankDigits(value) : value }));
  };
  const selectBank = (code: string) => {
    const selected = japanBanks.find((item) => item.code === code);
    setCustomBank(code === "custom");
    setError("");
    setBank((current) => current.bankCode === code ? current : ({
      ...current, bankCode: selected?.code ?? "", bankName: selected?.name ?? "",
      branchCode: "", branchName: "", accountNumber: ""
    }));
  };
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

  const stationDuration = form.stationTravelMinutes ? `${form.stationTravelMinutes} ${t("分钟")}` : "";
  const draftPresentation: StorePresentationConfig = {
    subtitle: draftStore.description,
    favoriteCount: 0,
    station: form.nearestStation.trim() || t("未填写"),
    distance: stationDuration || form.stationAccess.trim(),
    access: form.stationAccess.trim(),
    routeGuide: form.stationAccess.trim(),
    seatLabel: t("环境"),
    menuLabel: t("服务项目"),
    peopleLabel: t("预约人数"),
    paymentMethods: [],
    equipment: [],
    parking: t("未填写"),
    seatFilters: [],
    offers: [],
    menuCards: []
  };

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
      responsibleFamilyName: form.responsibleFamilyName?.trim() ?? "",
      responsibleGivenName: form.responsibleGivenName?.trim() ?? "",
      description: form.description.trim(),
      priceLabel,
      nearestStation: form.nearestStation.trim(),
      stationTravelMinutes: form.stationTravelMinutes ? Number(form.stationTravelMinutes) : null,
      stationAccess: form.stationAccess.trim()
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
      setApplication(working);
      if (showcaseImage) {
        const uploaded = await identityApplicationsApi.uploadMedia(working.id, "showcase", working.version, showcaseImage);
        working = { ...working, version: uploaded.applicationVersion };
      }
      setApplication(working);
      merchantApplicationDraftMemory.clearIfCurrent(accountId, retainedDraft);
      setStep(1);
    } catch (caught) {
      setError(merchantApplicationErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const saveBankAndIdentity = async () => {
    if (!application) return;
    if (form.applicantKind === "corporate" && !corporateRegistration && !hasSavedRegistration) {
      setError("请上传法人登记资料");
      return;
    }
    const bankError = reuseSavedBank ? "" : validateMerchantBankAccount(bank);
    if (bankError) {
      setError(bankError);
      return;
    }
    setBusy(true);
    setError("");
    try {
      let version = application.version;
      if (corporateRegistration) {
        const registrationUploaded = await identityApplicationsApi.uploadMedia(application.id, "corporate_registration", version, corporateRegistration);
        version = registrationUploaded.applicationVersion;
        setApplication((current) => current ? { ...current, version } : current);
      }
      if (!reuseSavedBank) {
        const bound = await identityApplicationsApi.bindMerchantBankAccount(application.id, { ...bank, expectedVersion: version });
        setApplication((current) => current ? { ...current, version: bound.applicationVersion } : current);
      }
      setStep(2);
    } catch (caught) {
      setError(merchantApplicationErrorMessage(caught));
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
      setApplication((current) => current ? { ...current, version: accepted.applicationVersion } : current);
      const submitted = await identityApplicationsApi.submit(application.id, accepted.applicationVersion);
      setApplication(submitted);
      await refreshSession();
      setStep(3);
    } catch (caught) {
      setError(merchantApplicationErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ApplicationShell hideNavigation error={error} onDismissError={() => setError("")} info="按店铺前端的服务展示结构填写，完成银行名义校验与有法律效力的合同确认后才可提交。" title="申请店铺身份">
      <ApplicationSteps current={step} labels={["服务展示", "银行与身份", "收费规则与合同", "审核"]} />
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
            <div className="space-y-3" data-testid="applicant-name-fields">
              <div className="grid grid-cols-2 gap-3">
                <ApplicationField label="姓" required><ApplicationInput autoComplete="family-name" onChange={(event) => updateForm("responsibleFamilyName", event.target.value)} value={form.responsibleFamilyName ?? ""} /></ApplicationField>
                <ApplicationField label="名" required><ApplicationInput autoComplete="given-name" onChange={(event) => updateForm("responsibleGivenName", event.target.value)} value={form.responsibleGivenName ?? ""} /></ApplicationField>
              </div>
              <ApplicationButton className="w-full" disabled={busy} onClick={openVerification} tone={ekycVerified ? "secondary" : "primary"}>
                {t(ekycVerified ? "已本人确认" : "本人确认（eKYC）")}
              </ApplicationButton>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <ApplicationField label="法人或代表者姓名" required><ApplicationInput onChange={(event) => updateForm("representativeName", event.target.value)} value={form.representativeName} /></ApplicationField>
              <ApplicationField label="法人或代表者姓名片假名" required><ApplicationInput onChange={(event) => updateForm("representativeNameKana", event.target.value)} value={form.representativeNameKana} /></ApplicationField>
              <ApplicationField label="店铺名称" required><ApplicationInput onChange={(event) => updateForm("shopName", event.target.value)} value={form.shopName} /></ApplicationField>
              <ApplicationField label="店铺地址" required><ApplicationInput onChange={(event) => updateForm("businessAddress", event.target.value)} value={form.businessAddress} /></ApplicationField>
              <div className="grid grid-cols-2 items-start gap-3 sm:col-span-2">
                <ApplicationField label="最近车站"><ApplicationInput maxLength={160} onChange={(event) => updateForm("nearestStation", event.target.value)} value={form.nearestStation} /></ApplicationField>
                <ApplicationField label="到店时间">
                  <div className="relative">
                    <ApplicationInput aria-label={t("到店时间")} className="pr-14" inputMode="numeric" onChange={(event) => updateForm("stationTravelMinutes", normalizeBankDigits(event.target.value))} value={form.stationTravelMinutes} />
                    <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs font-semibold text-[color:var(--client-muted)]">{t("分钟")}</span>
                  </div>
                </ApplicationField>
              </div>
              <ApplicationField hint="填写车站出口、步行时间或到店路线。" label="交通说明"><ApplicationInput maxLength={255} onChange={(event) => updateForm("stationAccess", event.target.value)} value={form.stationAccess} /></ApplicationField>
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
            <div className="pointer-events-none max-h-[760px] overflow-hidden" aria-label={t("店铺服务展示预览")}><StoreDetailExperience embedded scope="user" store={draftStore} presentationOverride={draftPresentation} transportSummary={stationDuration || form.stationAccess.trim() || t("未填写")} techniciansOverride={[]} /></div>
          </ApplicationSection>
          <ApplicationBottomAction>
            <ApplicationButton className="w-full" disabled={busy || !canSaveRetainedDraft} onClick={() => void saveShowcase()}>{busy ? t("保存中") : t("下一步：银行与身份")}</ApplicationButton>
          </ApplicationBottomAction>
        </>
      ) : null}

      {step === 1 ? (
        <>
          <ApplicationCard className="space-y-4">
            <ApplicationNotice>{t(form.applicantKind === "corporate" ? "法人名义申请时，银行账户名义必须与法人名称一致。" : "银行账户名义必须与申请资料中的姓名片假名一致；要求 eKYC 时，以认证姓名为准。")}</ApplicationNotice>
            {form.applicantKind === "individual" ? <ApplicationNotice>{t("如尚未完成 eKYC，请先在用户设置的验证与资质页面完成认证。")}</ApplicationNotice> : null}
            {reuseSavedBank && savedBank ? <div className="space-y-4">
              <p className="text-sm font-medium">{bankText("已保存的银行账户")}</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <ApplicationReadOnlyField label="银行名称" value={`${savedBank.bankName}（${savedBank.bankCode}）`} />
                <ApplicationReadOnlyField label="支店名称" value={`${savedBank.branchName}（${savedBank.branchCode}）`} />
                <ApplicationReadOnlyField label="账户类型" value={({ ordinary: "普通預金", current: "当座預金", savings: "貯蓄預金", other: "その他" } as Record<string, string>)[savedBank.accountType] ?? "—"} />
                <ApplicationReadOnlyField label="账号" value={savedBank.accountNumberMasked ?? "—"} />
                <ApplicationReadOnlyField label="账户名义人" value={savedBank.accountHolderMasked ?? "—"} />
                <ApplicationReadOnlyField label="银行账户" value={t("已验证")} />
              </div>
              <p className="text-sm text-[color:var(--client-muted)]">{bankText("继续使用已保存的账户，无需再次填写完整账号。")}</p>
              <ApplicationButton tone="secondary" onClick={() => { setEditingSavedBank(true); setBank({ ...emptyBank }); setCustomBank(false); setError(""); }}>{bankText("修改银行账户")}</ApplicationButton>
            </div> : (
            <div className="grid gap-4 sm:grid-cols-2">
              <ApplicationField as="div" label="银行名称" required>
                <ApplicationDropdown label={t("银行名称")} maxVisibleOptions={10} onChange={selectBank} options={[
                  ...japanBankGroups.flatMap((group) => japanBanks.filter((item) => item.group === group.id).map((item) => ({ value: item.code, label: `${item.name}（${item.code}）` }))),
                  { value: "custom", label: t("其他金融机构（手动填写）") }
                ]} placeholder={t("请选择银行")} value={customBank ? "custom" : bank.bankCode} />
              </ApplicationField>
              {customBank ? <ApplicationField label="金融机构名称" required><ApplicationInput aria-label={t("金融机构名称")} onChange={(event) => updateBank("bankName", event.target.value)} value={bank.bankName} /></ApplicationField> : null}
              <ApplicationField label="银行代码" required><ApplicationInput inputMode="numeric" maxLength={4} onChange={(event) => updateBank("bankCode", event.target.value)} readOnly={!customBank} value={bank.bankCode} /></ApplicationField>
              <ApplicationField label="支店代码" required><ApplicationInput inputMode="numeric" maxLength={3} onChange={(event) => updateBank("branchCode", event.target.value)} value={bank.branchCode} /></ApplicationField>
              <ApplicationField label="支店名称" required><ApplicationInput onChange={(event) => updateBank("branchName", event.target.value)} value={bank.branchName} /></ApplicationField>
              <ApplicationField as="div" label="账户类型" required><MerchantAccountTypeSelect onChange={(value) => updateBank("accountType", value)} value={bank.accountType} /></ApplicationField>
              <ApplicationField label="账号" required><ApplicationInput inputMode="numeric" onChange={(event) => updateBank("accountNumber", event.target.value)} value={bank.accountNumber} /></ApplicationField>
              <ApplicationField hint={form.applicantKind === "corporate" ? "必须与法人名称片假名一致" : "必须与 eKYC 姓名一致"} label="账户名义人" required><ApplicationInput onChange={(event) => updateBank("accountHolderName", event.target.value)} value={bank.accountHolderName} /></ApplicationField>
            </div>
            )}
            {form.applicantKind === "corporate" ? hasSavedRegistration ? <p className="text-sm text-[color:var(--client-muted)]">{bankText("法人登记资料已保存")}</p> : <ApplicationField as="div" hint="JPEG 或 PNG" label="法人登记资料" required><ApplicationFileUpload accept="image/jpeg,image/png" file={corporateRegistration} label={t("法人登记资料")} onChange={setCorporateRegistration} /></ApplicationField> : null}
          </ApplicationCard>
          <ApplicationBottomAction>
            <div className="flex gap-3">
              <ApplicationButton disabled={busy} onClick={() => setStep(0)} tone="secondary">{t("上一步")}</ApplicationButton>
              <ApplicationButton className="min-w-0 flex-1" disabled={busy} onClick={() => void saveBankAndIdentity()}>{busy ? t("校验中") : t("下一步：收费规则与合同")}</ApplicationButton>
            </div>
          </ApplicationBottomAction>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <ApplicationCard className="space-y-4">
            <div><h2 className="text-xl font-black text-[color:var(--client-text)]">{t("收费规则与 NeeDo 合同")}</h2><p className="mt-1 text-xs leading-5 text-[color:var(--client-muted)]">{t("合同以当前版本、完整正文和内容哈希留存，确认后具有法律效力。")}</p></div>
            {contract ? <div className="max-h-[48vh] overflow-y-auto whitespace-pre-wrap rounded-[20px] border border-[color:var(--client-line)] bg-[color:var(--client-elevated)] p-4 text-[12px] leading-6 text-[color:var(--client-text)]">{contract.text}</div> : <ApplicationNotice>{t(contractFailed ? "合同暂时无法读取，请重试或联系平台客服。" : "正在读取合同全文")}{contractFailed ? <ApplicationButton tone="secondary" onClick={() => { setError(""); setContractRevision(value => value + 1); }}>{t("重试")}</ApplicationButton> : null}</ApplicationNotice>}
            {contract ? <p className="break-all text-[10px] text-[color:var(--client-muted)]">v{contract.version} · {contract.contentHash}</p> : null}
            <label className="flex items-start gap-3 text-sm font-bold text-[color:var(--client-text)]"><input checked={hasRead} className="mt-1 h-5 w-5 accent-[color:var(--client-primary)]" onChange={(event) => setHasRead(event.target.checked)} type="checkbox" />{t("我已阅读完整收费规则与合同")}</label>
            <label className="flex items-start gap-3 text-sm font-bold text-[color:var(--client-text)]"><input checked={hasAgreed} className="mt-1 h-5 w-5 accent-[color:var(--client-primary)]" onChange={(event) => setHasAgreed(event.target.checked)} type="checkbox" />{t("我同意与 NeeDo 缔结具有法律效力的合同")}</label>
          </ApplicationCard>
          <ApplicationBottomAction>
            <div className="flex gap-3">
              <ApplicationButton disabled={busy} onClick={() => setStep(1)} tone="secondary">{t("上一步")}</ApplicationButton>
              <ApplicationButton className="min-w-0 flex-1" disabled={busy || !contract || !hasRead || !hasAgreed} onClick={() => void acceptAndSubmit()}>{busy ? t("提交中") : t("提交申请")}</ApplicationButton>
            </div>
          </ApplicationBottomAction>
        </>
      ) : null}

      {step === 3 ? (
        <ApplicationCard className="space-y-4">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[color:var(--client-primary)] text-3xl font-black text-[color:var(--client-primary-contrast)]">✓</div>
          <div className="text-center">
            <h2 className="text-xl font-black text-[color:var(--client-text)]">{t(application?.status === "approved" ? "审核通过" : application?.status === "rejected" ? "审核未通过" : "审核中")}</h2>
            <p className="mt-2 text-sm leading-7 text-[color:var(--client-muted)]">{t("运营后台批准后会开启店铺身份，并发送系统消息。")}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <ApplicationReadOnlyField label="申请名义" value={t(form.applicantKind === "corporate" ? "法人名义" : "个人名义")} />
            <ApplicationReadOnlyField label="申请人" value={form.responsiblePersonName} />
            {form.applicantKind === "corporate" ? <>
              <ApplicationReadOnlyField label="法人名称" value={form.corporateLegalName} />
              <ApplicationReadOnlyField label="法人名称片假名" value={form.corporateLegalNameKana} />
            </> : null}
            <ApplicationReadOnlyField label="法人或代表者姓名" value={form.representativeName} />
            <ApplicationReadOnlyField label="法人或代表者姓名片假名" value={form.representativeNameKana} />
            <ApplicationReadOnlyField label="店铺名称" value={form.shopName} />
            <ApplicationReadOnlyField label="店铺地址" value={form.businessAddress} />
            <ApplicationReadOnlyField label="联系电话" value={form.contactPhone} />
            <ApplicationReadOnlyField label="最近车站" value={form.nearestStation} />
            <ApplicationReadOnlyField label="到店时间" value={stationDuration} />
            <ApplicationReadOnlyField label="交通说明" value={form.stationAccess} />
            <ApplicationReadOnlyField label="费用区间" value={priceLabel} />
            <ApplicationReadOnlyField label="店铺简介" value={form.description} />
            <ApplicationReadOnlyField label="eKYC" value={t(application?.merchantDetail?.eKycVerified ? "已验证" : "未验证")} />
            <ApplicationReadOnlyField label="银行账户" value={t(application?.merchantDetail?.bankVerificationStatus === "verified" ? "已验证" : application?.merchantDetail?.bankVerificationStatus === "declared" ? "已登记" : "未验证")} />
          </div>
          <ApplicationNotice>{t("申请结束 30 天后，服务器会删除申请资料和图片；合同回执及批准后用于结算的银行账户按法务和业务要求继续保存。")}</ApplicationNotice>
          {application?.purgedAt ? <ApplicationNotice>{t("申请资料已按保留期限清理。")}</ApplicationNotice> : null}
          {application ? <ApplicationReviewEvidence application={application} /> : null}
          {application?.rejectionReason ? <ApplicationNotice tone="error">{application.rejectionReason}</ApplicationNotice> : null}
          {application ? <ApplicationReviewActions application={application} onError={setError} onReapply={() => { if (application.purgedAt || !application.merchantDetail) setApplication(null); setStep(0); } } onWithdrawn={() => { setApplication(null); setStep(0); }} /> : null}
        </ApplicationCard>
      ) : null}
    </ApplicationShell>
  );
}
