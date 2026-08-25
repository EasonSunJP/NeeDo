import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import {
  ApplicationButton,
  ApplicationCard,
  ApplicationField,
  ApplicationInput,
  ApplicationNotice,
  ApplicationSelect,
  ApplicationShell,
  ApplicationSteps,
  ApplicationTextArea
} from "./ApplicationUi";
import { identityApplicationsApi, type EligibleShop, type IdentityApplication } from "./api";
import { splitApplicationList, validateTechnicianProfile } from "./formModel";

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

const isReviewing = (application: IdentityApplication | null) =>
  application?.status === "submitted" || application?.status === "under_review";

export function TechnicianApplicationPage() {
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
    identityApplicationsApi.listMine({ type: "technician" }).then(({ list }) => {
      if (!active) return;
      const existing = list.find((item) => !["withdrawn", "approved"].includes(item.status)) ?? null;
      if (!existing) return;
      setApplication(existing);
      if (existing.technicianDetail) {
        const detail = existing.technicianDetail;
        setSelectedShop({ id: detail.targetShopId, merchantId: "", name: `${t("店铺")} #${detail.targetShopId}`, city: "", address: "" });
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
      if (isReviewing(existing)) setStep(2);
      else setStep(1);
    }).catch((caught: unknown) => {
      if (active) setError(caught instanceof Error ? caught.message : String(caught));
    });
    return () => {
      active = false;
    };
  }, []);

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
      setError(caught instanceof Error ? caught.message : String(caught));
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
      let version = working.version;
      for (const [purpose, file] of [["portrait", portrait], ["identity_document", identityDocument]] as const) {
        if (file) {
          const uploaded = await identityApplicationsApi.uploadMedia(working.id, purpose, version, file);
          version = uploaded.applicationVersion;
        }
      }
      working = await identityApplicationsApi.submit(working.id, version);
      setApplication(working);
      await refreshSession();
      setStep(2);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const shopSummary = useMemo(() => selectedShop ? `${selectedShop.name}${selectedShop.address ? ` · ${selectedShop.address}` : ""}` : "", [selectedShop]);

  return (
    <ApplicationShell info="申请资料仅供目标店铺审核，服务器会在申请结束 30 天后删除资料与图片。" title="申请技师身份">
      <ApplicationSteps current={step} labels={["选择店铺", "本人资料", "提交完成"]} />

      {error ? <ApplicationNotice tone="error">{t(error)}</ApplicationNotice> : null}

      {step === 0 ? (
        <ApplicationCard className="space-y-4">
          <div>
            <h2 className="text-xl font-black text-[color:var(--client-text)]">{t("选择申请入驻的店铺")}</h2>
            <p className="mt-1 text-xs leading-5 text-[color:var(--client-muted)]">{t("可用地址、商户 ID 或商户名称搜索。")}</p>
          </div>
          <div className="flex gap-2">
            <ApplicationInput onChange={(event) => setQuery(event.target.value)} placeholder={t("地址 / 商户 ID / 商户名称")} value={query} />
            <ApplicationButton disabled={busy || !query.trim()} onClick={() => void searchShops()}>{busy ? t("搜索中") : t("搜索")}</ApplicationButton>
          </div>
          <div className="space-y-2">
            {shops.map((shop) => (
              <button
                className={`w-full rounded-[20px] border p-4 text-left transition ${selectedShop?.id === shop.id ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary-soft)]" : "border-[color:var(--client-line)]"}`}
                key={shop.id}
                onClick={() => setSelectedShop(shop)}
                type="button"
              >
                <span className="block text-sm font-black text-[color:var(--client-text)]">{shop.name}</span>
                <span className="mt-1 block text-xs text-[color:var(--client-muted)]">{shop.merchantId} · {shop.address}</span>
              </button>
            ))}
          </div>
          <ApplicationButton className="w-full" disabled={!selectedShop} onClick={() => setStep(1)}>{t("下一步")}</ApplicationButton>
        </ApplicationCard>
      ) : null}

      {step === 1 ? (
        <ApplicationCard className="space-y-4">
          <ApplicationNotice>{t("申请店铺")}：{shopSummary}</ApplicationNotice>
          {application?.status === "rejected" && application.rejectionReason ? (
            <ApplicationNotice tone="error">{t("上次驳回原因")}：{application.rejectionReason}</ApplicationNotice>
          ) : null}
          <ApplicationField label="本人姓名" required><ApplicationInput onChange={(event) => updateForm("applicantName", event.target.value)} value={form.applicantName} /></ApplicationField>
          <div className="grid gap-4 sm:grid-cols-2">
            <ApplicationField label="性别"><ApplicationSelect onChange={(event) => updateForm("gender", event.target.value as TechnicianForm["gender"])} value={form.gender}><option value="">{t("不填写")}</option><option value="male">{t("男")}</option><option value="female">{t("女")}</option><option value="other">{t("其他")}</option><option value="undisclosed">{t("不公开")}</option></ApplicationSelect></ApplicationField>
            <ApplicationField label="生日"><ApplicationInput onChange={(event) => updateForm("birthDate", event.target.value)} type="date" value={form.birthDate} /></ApplicationField>
            <ApplicationField label="联系电话"><ApplicationInput onChange={(event) => updateForm("phone", event.target.value)} value={form.phone} /></ApplicationField>
            <ApplicationField label="所在城市"><ApplicationInput onChange={(event) => updateForm("city", event.target.value)} value={form.city} /></ApplicationField>
            <ApplicationField label="从业年数"><ApplicationInput min="0" onChange={(event) => updateForm("yearsExperience", event.target.value)} type="number" value={form.yearsExperience} /></ApplicationField>
          </div>
          <ApplicationField hint="可用逗号或换行分隔" label="可服务区域"><ApplicationTextArea onChange={(event) => updateForm("serviceAreas", event.target.value)} value={form.serviceAreas} /></ApplicationField>
          <ApplicationField hint="可用逗号或换行分隔" label="擅长项目"><ApplicationTextArea onChange={(event) => updateForm("skills", event.target.value)} value={form.skills} /></ApplicationField>
          <ApplicationField label="自我介绍"><ApplicationTextArea onChange={(event) => updateForm("bio", event.target.value)} value={form.bio} /></ApplicationField>
          <div className="grid gap-4 sm:grid-cols-2">
            <ApplicationField hint="JPEG 或 PNG" label="本人照片"><ApplicationInput accept="image/jpeg,image/png" onChange={(event) => setPortrait(event.target.files?.[0] ?? null)} type="file" /></ApplicationField>
            <ApplicationField hint="JPEG 或 PNG" label="证件照片"><ApplicationInput accept="image/jpeg,image/png" onChange={(event) => setIdentityDocument(event.target.files?.[0] ?? null)} type="file" /></ApplicationField>
          </div>
          <ApplicationNotice>{t("姓名为必填；照片、性别、生日、证件照片及其他基础信息均为选填。")}</ApplicationNotice>
          <div className="flex gap-3">
            <ApplicationButton className="flex-1" disabled={busy} onClick={() => void submitProfile()}>{busy ? t("提交中") : t("提交申请")}</ApplicationButton>
            {!application ? <ApplicationButton onClick={() => setStep(0)} tone="secondary">{t("返回选店")}</ApplicationButton> : null}
          </div>
        </ApplicationCard>
      ) : null}

      {step === 2 ? (
        <ApplicationCard className="space-y-4 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[color:var(--client-primary)] text-3xl font-black text-[color:var(--client-primary-contrast)]">✓</div>
          <h2 className="text-xl font-black text-[color:var(--client-text)]">{t("申请已提交")}</h2>
          <p className="text-sm leading-7 text-[color:var(--client-muted)]">{t("店铺审核后会通过系统消息通知你。店铺也可以点击联系，与该账号自动建立好友关系并开启聊天。")}</p>
          <ApplicationNotice>{t("申请结束 30 天后，服务器会删除申请资料和图片；店铺主动下载的简历副本会保存在店铺设备中。")}</ApplicationNotice>
          <ApplicationButton className="w-full" onClick={() => window.location.assign("/me/settings/portal")}>{t("返回身份设置")}</ApplicationButton>
        </ApplicationCard>
      ) : null}
    </ApplicationShell>
  );
}
