import { selectLatestApplication } from "./model";
import { ApplicationDropdown } from "./ApplicationDropdown";
import { AppIcon } from "../../components/client-ui/AppScaffold";
import { ApplicationReviewEvidence } from "./ApplicationReviewEvidence";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import {
  ApplicationBottomAction,
  ApplicationButton,
  ApplicationCard,
  ApplicationField,
  ApplicationInput,
  ApplicationNotice,
  ApplicationReadOnlyField,
  ApplicationFileUpload,
  ApplicationShell,
  ApplicationSteps,
  ApplicationTextArea
} from "./ApplicationUi";
import { identityApplicationsApi, type EligibleShop, type IdentityApplication } from "./api";
import { UnifiedSimpleProfileCard } from "../../shared/profile-card/UnifiedSimpleProfileCard";
import { ApplicationReviewActions } from "./ApplicationReviewActions";
import {
  identityApplicationMediaErrorMessage,
  splitApplicationList,
  validateTechnicianProfile
} from "./formModel";

type TechnicianForm = {
  applicantName: string;
  phone: string;
  city: string;
  serviceAreas: string;
  skills: string;
  yearsExperience: string;
  bio: string;
  gender: "" | "male" | "female" | "other" | "undisclosed";
  birthDate: string;
};

const emptyForm: TechnicianForm = {
  applicantName: "",
  phone: "",
  city: "",
  serviceAreas: "",
  skills: "",
  yearsExperience: "",
  bio: "",
  gender: "",
  birthDate: ""
};

export function TechnicianApplicationPage({ mode = "identity" }: { mode?: "identity" | "additional-shop" }) {
  const { language } = useI18n();
  const { refreshSession } = useAuth();
  const t = (source: string) => translateText(source, language);
  const [step, setStep] = useState(0);
  const [application, setApplication] = useState<IdentityApplication | null>(null);
  const [selectedShop, setSelectedShop] = useState<EligibleShop | null>(null);
  const [query, setQuery] = useState("");
  const [shops, setShops] = useState<EligibleShop[]>([]);
  const [form, setForm] = useState<TechnicianForm>(emptyForm);
  const [portrait, setPortrait] = useState<File | null>(null);
  const [identityDocument, setIdentityDocument] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    identityApplicationsApi.listMine(
      mode === "additional-shop"
        ? { page: 1, pageSize: 100, type: "technician" }
        : { type: "technician" }
    ).then(({ list }) => {
      if (!active) return;
      const existing = selectLatestApplication(
        mode === "additional-shop"
          ? list.filter((item) => item.status !== "approved" && item.status !== "withdrawn")
          : list
      );
      if (!existing) return;
      setApplication(existing);
      if (existing.technicianDetail) {
        const detail = existing.technicianDetail;
        setSelectedShop({ id: detail.targetShopId, merchantId: "", name: existing.reviewEvidence?.targetShopName ?? t("店铺"), city: "", address: "" });
        setForm({
          applicantName: detail.applicantName,
          phone: detail.phone ?? "",
          city: detail.city ?? "",
          serviceAreas: detail.serviceAreas.join("、"),
          skills: detail.skills.join("、"),
          yearsExperience: detail.yearsExperience === null ? "" : String(detail.yearsExperience),
          bio: detail.bio ?? "",
          gender: detail.gender ?? "",
          birthDate: detail.birthDate?.slice(0, 10) ?? ""
        });
      }
      if (["submitted", "under_review", "approved", "rejected"].includes(existing.status)) setStep(2);
      else setStep(1);
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : String(caught));
    });
    return () => {
      active = false;
    };
  }, [mode]);

  const updateForm = <K extends keyof TechnicianForm>(key: K, value: TechnicianForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const searchShops = async () => {
    if (!query.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await identityApplicationsApi.searchShops(query.trim());
      setShops(result.list);
    } catch (caught) {
      setError(identityApplicationMediaErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const submitProfile = async () => {
    const validationError = validateTechnicianProfile({ applicantName: form.applicantName, targetShopId: selectedShop?.id ?? null });
    if (validationError) {
      setError(validationError);
      return;
    }

    setBusy(true);
    setError("");
    try {
      let working = application ?? await identityApplicationsApi.createTechnicianDraft({
        targetShopId: selectedShop!.id,
        applicantName: form.applicantName.trim()
      });
      setApplication(working);
      working = await identityApplicationsApi.updateTechnicianProfile(working.id, {
        expectedVersion: working.version,
        targetShopId: selectedShop!.id,
        applicantName: form.applicantName.trim(),
        phone: form.phone.trim() || null,
        city: form.city.trim() || null,
        serviceAreas: splitApplicationList(form.serviceAreas),
        skills: splitApplicationList(form.skills),
        yearsExperience: form.yearsExperience ? Number(form.yearsExperience) : null,
        bio: form.bio.trim() || null,
        gender: form.gender || null,
        birthDate: form.birthDate || null
      });
      setApplication(working);
      let version = working.version;
      for (const [purpose, file] of [["portrait", portrait], ["identity_document", identityDocument]] as const) {
        if (file) {
          const uploaded = await identityApplicationsApi.uploadSensitiveMediaBundle(
            working.id,
            purpose,
            version,
            file
          );
          version = uploaded.applicationVersion;
          working = { ...working, version };
          setApplication(working);
        }
      }
      working = await identityApplicationsApi.submit(working.id, version);
      setApplication(working);
      await refreshSession();
      setStep(2);
    } catch (caught) {
      setError(identityApplicationMediaErrorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const shopSummary = useMemo(() => selectedShop ? `${selectedShop.name}${selectedShop.address ? ` · ${selectedShop.address}` : ""}` : "", [selectedShop]);
  const genderLabel = form.gender
    ? t({ male: "男", female: "女", other: "其他", undisclosed: "不公开" }[form.gender])
    : "—";

  return (
    <ApplicationShell
      backTo={mode === "additional-shop" ? "/technician/shop-stays" : undefined}
      closeTo={mode === "additional-shop" ? "/technician/shop-stays" : undefined}
      hideNavigation
      error={error}
      onDismissError={() => setError("")}
      info="申请资料仅供目标店铺审核，服务器会在申请结束 30 天后删除资料与图片。"
      title={t(mode === "additional-shop" ? "追加入住店铺" : "申请技师身份")}
    >
      <ApplicationSteps current={step} labels={["选择店铺", "本人资料", "审核"]} />


      {step === 0 ? (
        <>
        <ApplicationCard className="space-y-4">
          <div>
            <h2 className="text-xl font-black text-[color:var(--client-text)]">{t("选择申请入驻的店铺")}</h2>
            <p className="mt-1 text-xs leading-5 text-[color:var(--client-muted)]">{t("可用地址、商户 ID 或商户名称搜索。")}</p>
          </div>
          <div className="flex gap-2">
            <ApplicationInput className="min-w-0 flex-1" onChange={(event) => setQuery(event.target.value)} placeholder={t("地址 / 商户 ID / 商户名称")} value={query} />
            <ApplicationButton className="shrink-0 whitespace-nowrap" disabled={busy || !query.trim()} onClick={() => void searchShops()}>{busy ? t("搜索中") : t("搜索")}</ApplicationButton>
          </div>
        </ApplicationCard>
          <div className="space-y-3" role="radiogroup" aria-label={t("选择店铺")}>
            {shops.map((shop) => (
              <UnifiedSimpleProfileCard
                key={shop.id}
                variant="compact"
                showRating={shop.rating !== null && shop.rating !== undefined}
                footerSlot={shop.merchantId ? <p className="px-4 pb-3 text-xs text-[color:var(--client-muted)]">{shop.merchantId}</p> : null}
                data={{ id: shop.merchantId, entityType: "shop", displayName: shop.name, avatar: shop.coverUrl ?? undefined, coverImage: shop.coverUrl ?? undefined, rating: shop.rating ?? undefined, reviewCount: shop.reviewCount, region: shop.address || shop.city, tags: shop.keywords ?? [], badgeList: [] }}
                className={selectedShop?.id === shop.id ? "ring-2 ring-[color:var(--client-primary)]" : ""}
                onOpenDetails={() => setSelectedShop(shop)}
                actionSlot={<div className="flex h-[46px] w-[42px] items-start justify-center"><button
                  aria-label={`${t(selectedShop?.id === shop.id ? "已选择" : "选择店铺")} ${shop.name}`}
                  aria-checked={selectedShop?.id === shop.id}
                  role="radio"
                  className={`focus-ring inline-flex h-[29px] w-[29px] shrink-0 items-center justify-center rounded-full border transition ${selectedShop?.id === shop.id ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)]" : "border-white/80 bg-black/40 text-white backdrop-blur-xl"}`}
                  onClick={() => setSelectedShop(shop)} type="button"
                ><AppIcon className="h-[14px] w-[14px]" name={selectedShop?.id === shop.id ? "check" : "plus"} /></button></div>}
              />
            ))}
          </div>
          <ApplicationBottomAction><ApplicationButton className="w-full" disabled={!selectedShop} onClick={() => setStep(1)}>{t("下一步")}</ApplicationButton></ApplicationBottomAction>
        </>
      ) : null}

      {step === 1 ? (
        <ApplicationCard className="space-y-4">
          <ApplicationNotice>{t("申请店铺")}：{shopSummary}</ApplicationNotice>
          {application?.status === "rejected" && application.rejectionReason ? (
            <ApplicationNotice tone="error">{t("上次驳回原因")}：{application.rejectionReason}</ApplicationNotice>
          ) : null}
          <ApplicationField label="本人姓名" required><ApplicationInput required onChange={(event) => updateForm("applicantName", event.target.value)} value={form.applicantName} /></ApplicationField>
          <div className="grid gap-4 sm:grid-cols-2">
            <ApplicationField as="div" label="性别"><ApplicationDropdown label={t("性别")} onChange={value => updateForm("gender", value as TechnicianForm["gender"])} value={form.gender} options={[{ value: "", label: t("不填写") }, { value: "male", label: t("男") }, { value: "female", label: t("女") }, { value: "other", label: t("其他") }, { value: "undisclosed", label: t("不公开") }]} /></ApplicationField>
            <ApplicationField label="生日"><ApplicationInput onChange={(event) => updateForm("birthDate", event.target.value)} type="date" value={form.birthDate} /></ApplicationField>
            <ApplicationField label="联系电话"><ApplicationInput onChange={(event) => updateForm("phone", event.target.value)} value={form.phone} /></ApplicationField>
            <ApplicationField label="所在城市"><ApplicationInput onChange={(event) => updateForm("city", event.target.value)} value={form.city} /></ApplicationField>
            <ApplicationField label="从业年数"><ApplicationInput min="0" onChange={(event) => updateForm("yearsExperience", event.target.value)} type="number" value={form.yearsExperience} /></ApplicationField>
          </div>
          <ApplicationField hint="可用逗号或换行分隔" label="可服务区域"><ApplicationTextArea onChange={(event) => updateForm("serviceAreas", event.target.value)} value={form.serviceAreas} /></ApplicationField>
          <ApplicationField hint="可用逗号或换行分隔" label="擅长项目"><ApplicationTextArea onChange={(event) => updateForm("skills", event.target.value)} value={form.skills} /></ApplicationField>
          <ApplicationField label="自我介绍"><ApplicationTextArea onChange={(event) => updateForm("bio", event.target.value)} value={form.bio} /></ApplicationField>
          <div className="grid gap-4 sm:grid-cols-2">
            <ApplicationField as="div" hint="JPEG 或 PNG" label="本人照片"><ApplicationFileUpload accept="image/jpeg,image/png" file={portrait} label={t("本人照片")} onChange={setPortrait} /></ApplicationField>
            <ApplicationField as="div" hint="JPEG 或 PNG" label="证件照片"><ApplicationFileUpload accept="image/jpeg,image/png" file={identityDocument} label={t("证件照片")} onChange={setIdentityDocument} /></ApplicationField>
          </div>
          <ApplicationNotice>{t("姓名为必填；照片、性别、生日、证件照片及其他基础信息均为选填。")}</ApplicationNotice>
          <ApplicationBottomAction><div className="flex gap-3">
            <ApplicationButton disabled={busy} onClick={() => setStep(0)} tone="secondary">{t("上一步")}</ApplicationButton>
            <ApplicationButton className="min-w-0 flex-1" disabled={busy} onClick={() => void submitProfile()}>{busy ? t("提交中") : t("提交申请")}</ApplicationButton>
          </div></ApplicationBottomAction>
        </ApplicationCard>
      ) : null}

      {step === 2 ? (
        <ApplicationCard className="space-y-4">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[color:var(--client-primary)] text-3xl font-black text-[color:var(--client-primary-contrast)]">✓</div>
          <div className="text-center">
            <h2 className="text-xl font-black text-[color:var(--client-text)]">{t(application?.status === "approved" ? "审核通过" : application?.status === "rejected" ? "审核未通过" : "审核中")}</h2>
            <p className="mt-2 text-sm leading-7 text-[color:var(--client-muted)]">{t("店铺审核后会通过系统消息通知你。店铺也可以点击联系，与该账号自动建立好友关系并开启聊天。")}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <ApplicationReadOnlyField label="申请店铺" value={shopSummary} />
            <ApplicationReadOnlyField label="本人姓名" value={form.applicantName} />
            <ApplicationReadOnlyField label="性别" value={genderLabel} />
            <ApplicationReadOnlyField label="生日" value={form.birthDate} />
            <ApplicationReadOnlyField label="联系电话" value={form.phone} />
            <ApplicationReadOnlyField label="所在城市" value={form.city} />
            <ApplicationReadOnlyField label="从业年数" value={form.yearsExperience ? `${form.yearsExperience} ${t("年")}` : ""} />
            <ApplicationReadOnlyField label="可服务区域" value={form.serviceAreas} />
            <ApplicationReadOnlyField label="擅长项目" value={form.skills} />
            <ApplicationReadOnlyField label="自我介绍" value={form.bio} />
          </div>
          <ApplicationNotice>{t("申请结束 30 天后，服务器会删除申请资料和图片；店铺主动下载的简历副本会保存在店铺设备中。")}</ApplicationNotice>
          {application?.purgedAt ? <ApplicationNotice>{t("申请资料已按保留期限清理。")}</ApplicationNotice> : null}
          {application ? <ApplicationReviewEvidence application={application} /> : null}
          {application?.rejectionReason ? <ApplicationNotice tone="error">{application.rejectionReason}</ApplicationNotice> : null}
          {application ? <ApplicationReviewActions application={application} onError={setError} onReapply={() => { if (application.purgedAt || !application.technicianDetail) setApplication(null); setStep(1); } } onWithdrawn={() => { setApplication(null); setStep(1); }} /> : null}
        </ApplicationCard>
      ) : null}
    </ApplicationShell>
  );
}
