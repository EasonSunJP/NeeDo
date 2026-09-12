import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiClientError } from "../../api/httpClient";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileShell } from "../../components/mobile/MobileShell";
import { bookingApi, type AdministrativeRegionReference } from "../../features/booking/api";
import {
  customerAddressApi,
  type CustomerAddress,
  type CustomerAddressCreateInput
} from "../../features/customer-address/api";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";
import { cn } from "../../lib/utils";

type AddressDraft = CustomerAddressCreateInput;

const emptyDraft: AddressDraft = {
  label: "",
  countryCode: "JP",
  postalCode: "",
  admin1Code: "",
  prefecture: "",
  admin2Code: "",
  city: "",
  addressLine1: "",
  addressLine2: "",
  building: "",
  isDefault: false
};

const copy: Record<Language, Record<string, string>> = {
  zh: { title: "我的地址", subtitle: "家庭、公司与常用上门地址", add: "添加地址", empty: "还没有保存地址", emptyHint: "保存后可在上门服务结算时直接选择。", loading: "正在读取地址", loadError: "地址读取失败", retry: "重新加载", label: "地址名称", labelPlaceholder: "例如：家、公司", prefecture: "都道府县", city: "市区町村", choosePrefecture: "请选择都道府县", chooseCity: "请选择市区町村", postal: "邮政编码", street: "街道地址", extra: "地址补充", building: "建筑物与房间", default: "默认地址", makeDefault: "设为默认", edit: "编辑", remove: "删除", deleteConfirm: "确定删除", cancel: "取消", save: "保存地址", saving: "正在保存", createTitle: "添加地址", editTitle: "编辑地址", required: "请完整填写地址名称、邮编、都道府县、市区町村和街道地址。", mutationError: "地址保存失败，请重试。", deleteError: "地址删除失败，请重试。", privacy: "地址仅供本人管理及上门预约使用，不会在公开资料中展示。", regionError: "行政区域读取失败，请重试。", authError: "登录状态已失效，请重新登录", permissionError: "当前身份没有管理地址的权限" },
  "zh-Hant": { title: "我的地址", subtitle: "住家、公司與常用到府地址", add: "新增地址", empty: "尚未儲存地址", emptyHint: "儲存後可在到府服務結帳時直接選擇。", loading: "正在讀取地址", loadError: "地址讀取失敗", retry: "重新載入", label: "地址名稱", labelPlaceholder: "例如：家、公司", prefecture: "都道府縣", city: "市區町村", choosePrefecture: "請選擇都道府縣", chooseCity: "請選擇市區町村", postal: "郵遞區號", street: "街道地址", extra: "地址補充", building: "建築物與房間", default: "預設地址", makeDefault: "設為預設", edit: "編輯", remove: "刪除", deleteConfirm: "確定刪除", cancel: "取消", save: "儲存地址", saving: "正在儲存", createTitle: "新增地址", editTitle: "編輯地址", required: "請完整填寫地址名稱、郵遞區號、都道府縣、市區町村和街道地址。", mutationError: "地址儲存失敗，請重試。", deleteError: "地址刪除失敗，請重試。", privacy: "地址僅供本人管理及到府預約使用，不會顯示於公開資料。", regionError: "行政區域讀取失敗，請重試。", authError: "登入狀態已失效，請重新登入", permissionError: "目前身份沒有管理地址的權限" },
  ja: { title: "マイ住所", subtitle: "自宅・会社・よく使う訪問先", add: "住所を追加", empty: "保存済みの住所はありません", emptyHint: "保存すると訪問サービスの予約時に選択できます。", loading: "住所を読み込み中", loadError: "住所を読み込めませんでした", retry: "再読み込み", label: "住所名", labelPlaceholder: "例：自宅、会社", prefecture: "都道府県", city: "市区町村", choosePrefecture: "都道府県を選択", chooseCity: "市区町村を選択", postal: "郵便番号", street: "町名・番地", extra: "住所補足", building: "建物名・部屋番号", default: "既定の住所", makeDefault: "既定にする", edit: "編集", remove: "削除", deleteConfirm: "削除を確定", cancel: "キャンセル", save: "住所を保存", saving: "保存中", createTitle: "住所を追加", editTitle: "住所を編集", required: "住所名、郵便番号、都道府県、市区町村、町名・番地を入力してください。", mutationError: "住所を保存できませんでした。もう一度お試しください。", deleteError: "住所を削除できませんでした。もう一度お試しください。", privacy: "住所は本人による管理と訪問予約にのみ使用され、公開プロフィールには表示されません。", regionError: "行政区域を読み込めませんでした。もう一度お試しください。", authError: "ログインの有効期限が切れました。再度ログインしてください。", permissionError: "現在のアカウントには住所を管理する権限がありません。" },
  en: { title: "My addresses", subtitle: "Home, work and frequently used service addresses", add: "Add address", empty: "No saved addresses", emptyHint: "Saved addresses can be selected during home-service checkout.", loading: "Loading addresses", loadError: "Could not load addresses", retry: "Reload", label: "Address label", labelPlaceholder: "For example: Home, Work", prefecture: "Prefecture", city: "City / ward / town", choosePrefecture: "Choose a prefecture", chooseCity: "Choose a city / ward / town", postal: "Postal code", street: "Street address", extra: "Address line 2", building: "Building and room", default: "Default address", makeDefault: "Make default", edit: "Edit", remove: "Delete", deleteConfirm: "Confirm delete", cancel: "Cancel", save: "Save address", saving: "Saving", createTitle: "Add address", editTitle: "Edit address", required: "Enter the label, postal code, prefecture, city and street address.", mutationError: "Could not save the address. Try again.", deleteError: "Could not delete the address. Try again.", privacy: "Addresses are used only for your account and home-service bookings. They are not shown publicly.", regionError: "Could not load administrative regions. Try again.", authError: "Your session has expired. Sign in again.", permissionError: "Your account cannot manage addresses." },
  ko: { title: "내 주소", subtitle: "집, 회사 및 자주 사용하는 방문 주소", add: "주소 추가", empty: "저장된 주소가 없습니다", emptyHint: "저장하면 방문 서비스 예약 시 선택할 수 있습니다.", loading: "주소 불러오는 중", loadError: "주소를 불러올 수 없습니다", retry: "다시 불러오기", label: "주소 이름", labelPlaceholder: "예: 집, 회사", prefecture: "도도부현", city: "시구정촌", choosePrefecture: "도도부현 선택", chooseCity: "시구정촌 선택", postal: "우편번호", street: "도로명 주소", extra: "상세 주소", building: "건물 및 호수", default: "기본 주소", makeDefault: "기본으로 설정", edit: "수정", remove: "삭제", deleteConfirm: "삭제 확인", cancel: "취소", save: "주소 저장", saving: "저장 중", createTitle: "주소 추가", editTitle: "주소 수정", required: "주소 이름, 우편번호, 도도부현, 시구정촌 및 도로명 주소를 입력하세요.", mutationError: "주소를 저장할 수 없습니다. 다시 시도하세요.", deleteError: "주소를 삭제할 수 없습니다. 다시 시도하세요.", privacy: "주소는 본인 관리 및 방문 예약에만 사용되며 공개 프로필에는 표시되지 않습니다.", regionError: "행정 구역을 불러올 수 없습니다. 다시 시도하세요.", authError: "로그인 세션이 만료되었습니다. 다시 로그인하세요.", permissionError: "현재 계정에는 주소 관리 권한이 없습니다." }
};

const panelClassName = "rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_74%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_84%,transparent)] p-4 shadow-[0_18px_42px_rgba(0,0,0,0.06)]";
const inputClassName = "focus-ring min-h-12 w-full rounded-[18px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-4 text-sm font-bold text-[color:var(--client-text)]";

function describeAddress(address: CustomerAddress) {
  const postal = address.postalCode.length === 7 ? `${address.postalCode.slice(0, 3)}-${address.postalCode.slice(3)}` : address.postalCode;
  return [`〒${postal}`, address.prefecture, address.city, address.addressLine1, address.addressLine2, address.building].filter(Boolean).join(" ");
}

function apiErrorMessage(error: unknown, fallback: string, authError: string, permissionError: string) {
  if (error instanceof ApiClientError && error.status === 401) return authError;
  if (error instanceof ApiClientError && error.status === 403) return permissionError;
  return fallback;
}

export function UserAddressesPage() {
  const navigate = useNavigate();
  const { language } = useOptionalI18n();
  const text = copy[language];
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const [editingPublicId, setEditingPublicId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AddressDraft | null>(null);
  const [prefectures, setPrefectures] = useState<AdministrativeRegionReference[]>([]);
  const [municipalities, setMunicipalities] = useState<AdministrativeRegionReference[]>([]);
  const [saving, setSaving] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const [deletePublicId, setDeletePublicId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setStatus("loading");
    setMessage("");
    customerAddressApi.list({ page: 1, pageSize: 100 })
      .then((result) => { if (active) { setAddresses(result.list); setStatus("ready"); } })
      .catch((error) => { if (active) { setMessage(apiErrorMessage(error, text.loadError, text.authError, text.permissionError)); setStatus("error"); } });
    return () => { active = false; };
  }, [revision, text.loadError]);

  useEffect(() => {
    let active = true;
    bookingApi.listAdministrativeRegions({ country: "JP", locale: "ja" })
      .then(({ list }) => { if (active) setPrefectures(list); })
      .catch(() => { if (active) setMutationError(text.regionError); });
    return () => { active = false; };
  }, [text.regionError]);

  useEffect(() => {
    if (!draft?.admin1Code) { setMunicipalities([]); return; }
    let active = true;
    bookingApi.listAdministrativeRegions({ country: "JP", locale: "ja", parent: draft.admin1Code })
      .then(({ list }) => { if (active) setMunicipalities(list); })
      .catch(() => { if (active) setMutationError(text.regionError); });
    return () => { active = false; };
  }, [draft?.admin1Code, text.regionError]);

  const defaultAddress = useMemo(() => addresses.find((address) => address.isDefault) ?? null, [addresses]);
  const startCreate = () => { setEditingPublicId(null); setDraft({ ...emptyDraft, isDefault: addresses.length === 0 }); setMutationError(""); };
  const startEdit = (address: CustomerAddress) => {
    setEditingPublicId(address.publicId);
    setDraft({
      label: address.label, countryCode: "JP", postalCode: address.postalCode,
      admin1Code: address.admin1Code, prefecture: address.prefecture,
      admin2Code: address.admin2Code, city: address.city, addressLine1: address.addressLine1,
      addressLine2: address.addressLine2 ?? "", building: address.building ?? "", isDefault: address.isDefault
    });
    setMutationError("");
  };
  const updateDraft = (next: Partial<AddressDraft>) => setDraft((current) => current ? { ...current, ...next } : current);

  const save = async () => {
    if (!draft || saving) return;
    if (!draft.label.trim() || !/^\d{3}-?\d{4}$/u.test(draft.postalCode.normalize("NFKC")) || !draft.admin1Code || !draft.admin2Code || !draft.prefecture || !draft.city || !draft.addressLine1.trim()) {
      setMutationError(text.required);
      return;
    }
    setSaving(true); setMutationError("");
    try {
      if (editingPublicId) {
        const { isDefault, ...fields } = draft;
        await customerAddressApi.update(editingPublicId, { ...fields, ...(isDefault ? { isDefault: true as const } : {}) });
      }
      else await customerAddressApi.create(draft);
      setDraft(null); setEditingPublicId(null); setRevision((value) => value + 1);
    } catch (error) {
      setMutationError(apiErrorMessage(error, text.mutationError, text.authError, text.permissionError));
    } finally {
      setSaving(false);
    }
  };

  const makeDefault = async (address: CustomerAddress) => {
    setMutationError("");
    try { await customerAddressApi.update(address.publicId, { isDefault: true }); setRevision((value) => value + 1); }
    catch (error) { setMutationError(apiErrorMessage(error, text.mutationError, text.authError, text.permissionError)); }
  };

  const remove = async (address: CustomerAddress) => {
    if (deletePublicId !== address.publicId) { setDeletePublicId(address.publicId); return; }
    setMutationError("");
    try { await customerAddressApi.remove(address.publicId); setDeletePublicId(null); setRevision((value) => value + 1); }
    catch (error) { setMutationError(apiErrorMessage(error, text.deleteError, text.authError, text.permissionError)); }
  };

  return <MobileShell showBottomNav={false}>
    <MobileFullscreenHeader onBack={() => navigate("/me")} subtitle={text.subtitle} title={text.title} />
    <main className="mx-auto w-full max-w-[760px] space-y-4 px-4 pb-28 pt-4">
      <section className={cn(panelClassName, "bg-[color:var(--client-primary-soft)]")}><p className="text-xs font-bold leading-5 text-[color:var(--client-primary-strong)]">{text.privacy}</p></section>
      {mutationError ? <p className="rounded-[18px] border border-red-300 bg-red-50 px-4 py-3 text-sm font-bold text-red-700" role="alert">{mutationError}</p> : null}
      {draft ? <section className={panelClassName}>
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-black">{editingPublicId ? text.editTitle : text.createTitle}</h2><button className="text-sm font-black text-[color:var(--client-muted)]" onClick={() => { setDraft(null); setEditingPublicId(null); }} type="button">{text.cancel}</button></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input aria-label={text.label} className={inputClassName} maxLength={50} onChange={(event) => updateDraft({ label: event.target.value })} placeholder={text.labelPlaceholder} value={draft.label} />
          <input aria-label={text.postal} className={inputClassName} inputMode="numeric" maxLength={9} onChange={(event) => updateDraft({ postalCode: event.target.value })} placeholder="160-0022" value={draft.postalCode} />
          <select aria-label={text.prefecture} className={inputClassName} onChange={(event) => { const region = prefectures.find((item) => item.code === event.target.value); updateDraft({ admin1Code: event.target.value, prefecture: region?.name ?? "", admin2Code: "", city: "" }); }} value={draft.admin1Code}><option value="">{text.choosePrefecture}</option>{prefectures.map((region) => <option key={region.code} value={region.code}>{region.name}</option>)}</select>
          <select aria-label={text.city} className={inputClassName} disabled={!draft.admin1Code} onChange={(event) => { const region = municipalities.find((item) => item.code === event.target.value); updateDraft({ admin2Code: event.target.value, city: region?.name ?? "" }); }} value={draft.admin2Code}><option value="">{text.chooseCity}</option>{municipalities.map((region) => <option key={region.code} value={region.code}>{region.name}</option>)}</select>
          <input aria-label={text.street} className={inputClassName} maxLength={255} onChange={(event) => updateDraft({ addressLine1: event.target.value })} placeholder="新宿1-1-1" value={draft.addressLine1} />
          <input aria-label={text.extra} className={inputClassName} maxLength={255} onChange={(event) => updateDraft({ addressLine2: event.target.value })} value={draft.addressLine2 ?? ""} />
          <input aria-label={text.building} className={cn(inputClassName, "sm:col-span-2")} maxLength={255} onChange={(event) => updateDraft({ building: event.target.value })} value={draft.building ?? ""} />
        </div>
        {!defaultAddress || draft.isDefault ? <label className="mt-4 flex items-center gap-2 text-sm font-black"><input checked={draft.isDefault} onChange={(event) => updateDraft({ isDefault: event.target.checked })} type="checkbox" />{text.default}</label> : null}
        <button className="mt-5 min-h-12 w-full rounded-full bg-[color:var(--client-primary)] px-5 text-sm font-black text-[color:var(--client-primary-contrast)] disabled:opacity-50" disabled={saving} onClick={() => void save()} type="button">{saving ? text.saving : text.save}</button>
      </section> : <button className="min-h-12 w-full rounded-full bg-[color:var(--client-primary)] px-5 text-sm font-black text-[color:var(--client-primary-contrast)]" onClick={startCreate} type="button">＋ {text.add}</button>}
      {status === "loading" ? <section className={cn(panelClassName, "py-12 text-center text-sm font-black")}>{text.loading}</section> : null}
      {status === "error" ? <section className={cn(panelClassName, "py-10 text-center")} role="alert"><h2 className="font-black">{message}</h2><button className="mt-4 rounded-full border border-[color:var(--client-primary)] px-5 py-2 text-sm font-black text-[color:var(--client-primary)]" onClick={() => setRevision((value) => value + 1)} type="button">{text.retry}</button></section> : null}
      {status === "ready" && addresses.length === 0 ? <section className={cn(panelClassName, "py-12 text-center")}><h2 className="font-black">{text.empty}</h2><p className="mt-2 text-sm font-semibold text-[color:var(--client-muted)]">{text.emptyHint}</p></section> : null}
      {status === "ready" ? <div className="space-y-3">{addresses.map((address) => <article className={panelClassName} key={address.publicId}>
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><h2 className="truncate text-lg font-black">{address.label}</h2>{address.isDefault ? <span className="rounded-full bg-[color:var(--client-primary-soft)] px-2.5 py-1 text-[10px] font-black text-[color:var(--client-primary-strong)]">{text.default}</span> : null}</div><p className="mt-2 text-sm font-semibold leading-6 text-[color:var(--client-muted)]">{describeAddress(address)}</p></div></div>
        <div className="mt-4 flex flex-wrap gap-2">{!address.isDefault ? <button className="rounded-full border border-[color:var(--client-primary)] px-4 py-2 text-xs font-black text-[color:var(--client-primary)]" onClick={() => void makeDefault(address)} type="button">{text.makeDefault}</button> : null}<button className="rounded-full border border-[color:var(--client-line)] px-4 py-2 text-xs font-black" onClick={() => startEdit(address)} type="button">{text.edit}</button><button className={cn("rounded-full border px-4 py-2 text-xs font-black", deletePublicId === address.publicId ? "border-red-500 bg-red-50 text-red-700" : "border-[color:var(--client-line)] text-[color:var(--client-muted)]")} onClick={() => void remove(address)} type="button">{deletePublicId === address.publicId ? text.deleteConfirm : text.remove}</button>{deletePublicId === address.publicId ? <button className="rounded-full px-4 py-2 text-xs font-black text-[color:var(--client-muted)]" onClick={() => setDeletePublicId(null)} type="button">{text.cancel}</button> : null}</div>
      </article>)}</div> : null}
    </main>
  </MobileShell>;
}
