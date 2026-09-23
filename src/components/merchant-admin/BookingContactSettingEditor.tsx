import { useEffect, useState } from "react";
import { backofficeRealDataApi, type BackofficeShopPayload, type BookingContactSetting } from "../../api/backofficeRealData";
import { merchantEmployeeApi, type ShopEmployeeDirectoryItem } from "../../features/merchant-admin/employeeApi";
import { registerTranslationEntries } from "../../i18n/translations";
import { Button } from "../ui/Button";

registerTranslationEntries({
  "预约页联系目标": { "zh-Hant": "預約頁聯絡對象", ja: "予約ページの連絡先", en: "Booking contact destination", ko: "예약 페이지 연락 대상" },
  "顾客点击预约页的联系按钮后，会直接进入业务聊天。": { "zh-Hant": "顧客點擊預約頁的聯絡按鈕後，會直接進入業務聊天。", ja: "お客様が予約ページの連絡ボタンを押すと、業務チャットが開きます。", en: "The booking contact button opens a business chat for customers.", ko: "고객이 예약 페이지의 연락 버튼을 누르면 업무 채팅이 열립니다." },
  "店主／创建者": { "zh-Hant": "店主／建立者", ja: "店舗オーナー／作成者", en: "Owner / creator", ko: "매장 소유자 / 생성자" },
  "指定店员": { "zh-Hant": "指定店員", ja: "指定スタッフ", en: "Selected employee", ko: "지정 직원" },
  "当前预约指定技师": { "zh-Hant": "目前預約指定技師", ja: "予約で指名した担当者", en: "Nominated technician", ko: "예약에서 지정한 기술자" },
  "服务号（暂不可用）": { "zh-Hant": "服務號（暫不可用）", ja: "サービスアカウント（現在利用不可）", en: "Service account (unavailable)", ko: "서비스 계정 (현재 이용 불가)" },
  "请选择店员": { "zh-Hant": "請選擇店員", ja: "スタッフを選択", en: "Select an employee", ko: "직원을 선택하세요" },
  "目前此功能暂不可用": { "zh-Hant": "目前此功能暫不可用", ja: "この機能は現在利用できません", en: "This feature is currently unavailable", ko: "이 기능은 현재 사용할 수 없습니다" },
  "保存联系目标": { "zh-Hant": "儲存聯絡對象", ja: "連絡先を保存", en: "Save contact destination", ko: "연락 대상 저장" },
  "联系目标已保存": { "zh-Hant": "聯絡對象已儲存", ja: "連絡先を保存しました", en: "Contact destination saved", ko: "연락 대상을 저장했습니다" }
});

const defaultBookingContact: BookingContactSetting = { target: "owner", employeeNeedoId: null };

export function BookingContactSettingEditor({
  shop,
  mode,
  onSaved
}: {
  shop: BackofficeShopPayload;
  mode: "merchant" | "backoffice";
  onSaved: (shop: BackofficeShopPayload) => void;
}) {
  const [setting, setSetting] = useState<BookingContactSetting>(shop.bookingContact ?? defaultBookingContact);
  const [employees, setEmployees] = useState<ShopEmployeeDirectoryItem[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setSetting(shop.bookingContact ?? defaultBookingContact);
  }, [shop.id, shop.bookingContact]);

  useEffect(() => {
    let active = true;
    setLoadingEmployees(true);
    const load = async () => {
      const list: ShopEmployeeDirectoryItem[] = [];
      for (let page = 1; page <= 100; page += 1) {
        const result = mode === "merchant"
          ? await merchantEmployeeApi.listDirectory({ page, pageSize: 100 })
          : await merchantEmployeeApi.listBackofficeDirectory(shop.id, { page, pageSize: 100 });
        list.push(...result.list);
        if (list.length >= result.total) break;
      }
      if (active) setEmployees(list.filter((employee) => employee.status === "active"));
    };
    void load().catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => { if (active) setLoadingEmployees(false); });
    return () => { active = false; };
  }, [mode, shop.id]);

  const save = async () => {
    if (saving || (setting.target === "employee" && !setting.employeeNeedoId)) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const updated = mode === "merchant"
        ? await backofficeRealDataApi.updateMerchantShop({ bookingContact: setting })
        : await backofficeRealDataApi.updateShop(shop.id, { bookingContact: setting });
      onSaved(updated);
      setMessage("联系目标已保存");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  return <section className="rounded-lg border border-line bg-white p-5 shadow-panel">
    <h2 className="text-lg font-black text-ink">预约页联系目标</h2>
    <p className="mt-1 text-sm text-ink/55">顾客点击预约页的联系按钮后，会直接进入业务聊天。</p>
    <div className="mt-4 grid gap-2 sm:grid-cols-2">
      {([
        ["owner", "店主／创建者"],
        ["employee", "指定店员"],
        ["selected_technician", "当前预约指定技师"]
      ] as const).map(([target, label]) => <button
        aria-pressed={setting.target === target}
        className={`rounded-lg border px-4 py-3 text-left text-sm font-bold ${setting.target === target ? "border-moss bg-moss/10 text-moss" : "border-line bg-paper text-ink"}`}
        key={target}
        onClick={() => { setSetting({ target, employeeNeedoId: target === "employee" ? setting.employeeNeedoId : null }); setMessage(""); }}
        type="button"
      >{label}</button>)}
      <button className="rounded-lg border border-line bg-paper px-4 py-3 text-left text-sm font-bold text-ink/45" onClick={() => setMessage("目前此功能暂不可用")} type="button">服务号（暂不可用）</button>
    </div>
    {setting.target === "employee" ? <label className="mt-4 block text-sm font-bold text-ink">
      指定店员
      <select className="mt-2 h-11 w-full rounded-lg border border-line bg-paper px-3" disabled={loadingEmployees} onChange={(event) => setSetting({ target: "employee", employeeNeedoId: event.target.value || null })} value={setting.employeeNeedoId ?? ""}>
        <option value="">请选择店员</option>
        {employees.map((employee) => <option key={employee.needoId} value={employee.needoId}>{employee.displayName} · {employee.needoId}</option>)}
      </select>
    </label> : null}
    {error ? <p className="mt-3 text-sm font-bold text-red-700" role="alert">{error}</p> : null}
    {message ? <p className="mt-3 text-sm font-bold text-ink" role="status">{message}</p> : null}
    <Button className="mt-4" disabled={saving || (setting.target === "employee" && !setting.employeeNeedoId) || JSON.stringify(setting) === JSON.stringify(shop.bookingContact ?? defaultBookingContact)} onClick={() => void save()}>{saving ? "正在保存..." : "保存联系目标"}</Button>
  </section>;
}
