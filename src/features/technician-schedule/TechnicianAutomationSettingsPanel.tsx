import { useEffect, useMemo, useState } from "react";
import { TestFeatureBadge } from "../../components/ui/TestFeatureBadge";
import { cn } from "../../lib/utils";
import { pricingModeApi, type TechnicianServicePayload } from "../pricing-mode/api";
import {
  automationApi,
  type TechnicianAutomationContactPage,
  type TechnicianAutomationKind,
  type TechnicianAutomationRules,
  type TechnicianAutomationSetting,
  type TechnicianAutomationTimeWindow
} from "./automation-api";

const panelClass = "rounded-[24px] border border-[color:var(--client-line)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,transparent)] p-4 shadow-[var(--client-shadow)]";
const fieldClass = "mt-2 h-11 w-full rounded-[14px] border border-[color:var(--client-line)] bg-[color:var(--client-elevated)] px-3 text-sm font-bold text-[color:var(--client-text)] outline-none focus:border-[color:var(--client-primary)]";
const applicationSelectClass = "mt-2 min-h-12 w-full rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_74%,transparent)] px-4 text-[15px] font-semibold text-[color:var(--client-text)] outline-none transition focus:border-[color:var(--client-primary)]";
const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function defaultAutomationRules(kind: TechnicianAutomationKind): TechnicianAutomationRules {
  return {
    timeWindows: [],
    minLeadMinutes: kind === "booking" ? 30 : 0,
    bufferMinutes: 30,
    areaCodes: [],
    maxDistanceKm: 5,
    minOrderAmountJpy: null,
    minNetAmountJpy: null,
    minCustomerRating: null,
    acceptNewCustomers: true,
    minCompletedOrders: 0,
    requireEkyc: false,
    maxCancellationRatePercent: null,
    source: { mode: "any", contactIdentityIds: [] },
    customerType: "all",
    partyTypes: ["single"],
    serviceModes: ["store", "home"],
    paymentMethods: ["onsite", "card", "ndp", "bank_transfer", "other"],
    serviceIds: [],
    minimumPrepaymentPercent: 0,
    onlyOnline: kind === "request",
    requestStartWindow: kind === "request" ? "within_3_hours" : "any",
    requireMatchingTags: kind === "request"
  };
}

function cloneRules(rules: TechnicianAutomationRules) {
  return JSON.parse(JSON.stringify(rules)) as TechnicianAutomationRules;
}

function minuteToTime(minute: number) {
  const safe = Math.min(1439, Math.max(0, minute));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function timeToMinute(value: string, end = false) {
  const [hour, minute] = value.split(":").map(Number);
  if (end && hour === 0 && minute === 0) return 1440;
  return hour * 60 + minute;
}

function optionalNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function Toggle({ checked, label, onChange, disabled = false }: { checked: boolean; label: string; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <label className={cn("flex min-h-11 items-center justify-between gap-3 rounded-[14px] border border-[color:var(--client-line)] px-3 text-sm font-bold", disabled && "opacity-50")}>
      <span>{label}</span>
      <input aria-label={label} checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
    </label>
  );
}

function MultiChoice<T extends string>({
  label,
  options,
  value,
  onChange
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T[];
  onChange: (value: T[]) => void;
}) {
  return (
    <fieldset>
      <legend className="text-xs font-black text-[color:var(--client-muted)]">{label}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => {
          const active = value.includes(option.value);
          return (
            <button
              aria-pressed={active}
              className={cn(
                "min-h-9 rounded-full border px-3 text-xs font-black",
                active
                  ? "border-[color:var(--client-primary)] bg-[color:color-mix(in_srgb,var(--client-primary)_18%,transparent)] text-[color:var(--client-primary)]"
                  : "border-[color:var(--client-line)] text-[color:var(--client-muted)]"
              )}
              key={option.value}
              onClick={() => {
                if (active && value.length === 1) return;
                onChange(active ? value.filter((item) => item !== option.value) : [...value, option.value]);
              }}
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function TechnicianAutomationSettingsPanel({
  kind,
  onDirtyChange
}: {
  kind: TechnicianAutomationKind;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [setting, setSetting] = useState<TechnicianAutomationSetting | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [rules, setRules] = useState<TechnicianAutomationRules>(() => defaultAutomationRules(kind));
  const [contacts, setContacts] = useState<TechnicianAutomationContactPage["list"]>([]);
  const [services, setServices] = useState<TechnicianServicePayload[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [message, setMessage] = useState("");
  const title = kind === "booking" ? "自动接单" : "自动抢单";
  const initialSnapshot = setting ? JSON.stringify({ enabled: setting.enabled, rules: setting.rules }) : "";
  const dirty = Boolean(setting) && initialSnapshot !== JSON.stringify({ enabled, rules });
  const specificSource = rules.source.mode === "specific_contacts" || rules.source.mode === "specific_contact_referrals";

  useEffect(() => {
    let active = true;
    setState("loading");
    setMessage("");
    void Promise.all([
      automationApi.getSetting(kind),
      automationApi.listContacts().catch(() => ({ list: [], total: 0, page: 1, page_size: 100 })),
      pricingModeApi.listMyTechnicianServices({ page: 1, pageSize: 200, activeOnly: true })
        .catch(() => ({ list: [], total: 0, page: 1, page_size: 200 }))
    ]).then(([nextSetting, contactPage, servicePage]) => {
      if (!active) return;
      setSetting(nextSetting);
      setEnabled(nextSetting.enabled);
      setRules(cloneRules(nextSetting.rules));
      setContacts(contactPage.list);
      setServices(servicePage.list);
      setState("ready");
    }).catch(() => {
      if (!active) return;
      setState("error");
      setMessage("设置读取失败，请稍后重试");
    });
    return () => { active = false; };
  }, [kind]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const updateRules = (patch: Partial<TechnicianAutomationRules>) => {
    setRules((current) => ({ ...current, ...patch }));
    setMessage("");
  };

  const updateWindow = (index: number, patch: Partial<TechnicianAutomationTimeWindow>) => {
    updateRules({ timeWindows: rules.timeWindows.map((window, currentIndex) => currentIndex === index ? { ...window, ...patch } : window) });
  };

  const validation = useMemo(() => {
    if (specificSource && rules.source.contactIdentityIds.length === 0) return "请选择至少一位联系人";
    if (rules.timeWindows.some((window) => window.endMinute <= window.startMinute)) return "结束时间必须晚于开始时间";
    if (
      rules.minimumPrepaymentPercent !== 0 &&
      (!Number.isInteger(rules.minimumPrepaymentPercent) || rules.minimumPrepaymentPercent < 10 || rules.minimumPrepaymentPercent > 100)
    ) return "最低预付比例必须是 10 至 100 的整数";
    return "";
  }, [rules.minimumPrepaymentPercent, rules.source.contactIdentityIds.length, rules.timeWindows, specificSource]);

  const save = async () => {
    if (!setting || validation) return;
    if (!dirty) {
      setMessage("当前设置已是最新");
      return;
    }
    setState("saving");
    setMessage("");
    try {
      const saved = await automationApi.updateSetting(kind, {
        enabled,
        expectedVersion: setting.version,
        rules
      });
      setSetting(saved);
      setEnabled(saved.enabled);
      setRules(cloneRules(saved.rules));
      setState("ready");
      setMessage("设置已保存并立即生效");
    } catch {
      setState("ready");
      setMessage("保存失败；设置未覆盖，请重新加载后重试");
    }
  };

  if (state === "loading") return <section className={panelClass} aria-live="polite">正在读取正式设置</section>;
  if (!setting || state === "error") return <section className={panelClass} role="alert">{message || "设置不可用"}</section>;

  return (
    <div className="space-y-4 pb-[calc(104px+env(safe-area-inset-bottom))]" data-testid={`technician-${kind}-automation-settings`}>
      <section className={panelClass}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2"><h2 className="text-xl font-black">{title}</h2><TestFeatureBadge /></div>
            <p className="mt-2 text-xs font-bold leading-5 text-[color:var(--client-muted)]">
              全部已启用规则为 AND 关系；资料缺失或平台限制时不会执行自动操作。
            </p>
          </div>
          <button
            aria-checked={enabled}
            aria-label={kind === "booking" ? "启用自动接单" : "启用自动抢单"}
            className={cn(
              "relative inline-flex h-7 w-12 shrink-0 rounded-full border transition disabled:cursor-not-allowed disabled:opacity-40",
              enabled
                ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary)]"
                : "border-[color:var(--client-line)] bg-[color:var(--client-elevated)]"
            )}
            disabled={!setting.entitled}
            onClick={() => setEnabled((current) => !current)}
            role="switch"
            type="button"
          >
            <span
              aria-hidden="true"
              className={cn(
                "absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                enabled && "translate-x-5"
              )}
            />
          </button>
        </div>
        {!setting.entitled ? <p className="mt-3 text-xs font-black text-red-500">当前账号未开通此功能</p> : null}
      </section>

      {kind === "request" ? (
        <section className={panelClass}>
          <h3 className="text-sm font-black">Request 即时条件</h3>
          <div className="mt-3 space-y-3">
            <Toggle checked={rules.onlyOnline} label="仅在线时自动应募" onChange={(onlyOnline) => updateRules({ onlyOnline })} />
            <label className="block text-xs font-black text-[color:var(--client-muted)]">开始时间范围
              <select className={fieldClass} onChange={(event) => updateRules({ requestStartWindow: event.target.value as TechnicianAutomationRules["requestStartWindow"] })} value={rules.requestStartWindow}>
                <option value="immediate">立即开始</option><option value="within_1_hour">1小时内</option><option value="within_3_hours">3小时内</option><option value="today">今天</option><option value="any">不限</option>
              </select>
            </label>
            <Toggle checked={rules.requireMatchingTags} label="服务标签必须匹配" onChange={(requireMatchingTags) => updateRules({ requireMatchingTags })} />
          </div>
        </section>
      ) : null}

      <section className={panelClass}>
        <div className="flex items-center justify-between gap-3">
          <div><h3 className="text-sm font-black">可执行时段</h3><p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">留空表示不限制；可添加多个星期与时段。</p></div>
          <button className="rounded-full border border-[color:var(--client-primary)] px-3 py-2 text-xs font-black text-[color:var(--client-primary)]" onClick={() => updateRules({ timeWindows: [...rules.timeWindows, { weekday: 1, startMinute: 540, endMinute: 1080 }] })} type="button">添加时段</button>
        </div>
        <div className="mt-3 space-y-2">
          {rules.timeWindows.map((window, index) => (
            <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-end gap-2" key={`${window.weekday}-${index}`}>
              <select aria-label={`星期 ${index + 1}`} className={fieldClass} onChange={(event) => updateWindow(index, { weekday: Number(event.target.value) })} value={window.weekday}>{weekdays.map((day, dayIndex) => <option key={day} value={dayIndex}>{day}</option>)}</select>
              <input aria-label={`开始时间 ${index + 1}`} className={fieldClass} onChange={(event) => updateWindow(index, { startMinute: timeToMinute(event.target.value) })} type="time" value={minuteToTime(window.startMinute)} />
              <input aria-label={`结束时间 ${index + 1}`} className={fieldClass} onChange={(event) => updateWindow(index, { endMinute: timeToMinute(event.target.value, true) })} type="time" value={window.endMinute === 1440 ? "00:00" : minuteToTime(window.endMinute)} />
              <button aria-label={`删除时段 ${index + 1}`} className="mb-1 h-10 px-2 text-red-500" onClick={() => updateRules({ timeWindows: rules.timeWindows.filter((_, currentIndex) => currentIndex !== index) })} type="button">删除</button>
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <NumberField label="最少提前分钟" min={0} value={rules.minLeadMinutes} onChange={(minLeadMinutes) => updateRules({ minLeadMinutes: minLeadMinutes ?? 0 })} />
          <label className="text-xs font-black text-[color:var(--client-muted)]">前后缓冲
            <select className={fieldClass} onChange={(event) => updateRules({ bufferMinutes: Number(event.target.value) as 0 | 15 | 30 | 60 })} value={rules.bufferMinutes}><option value={0}>0分钟</option><option value={15}>15分钟</option><option value={30}>30分钟</option><option value={60}>60分钟</option></select>
          </label>
        </div>
      </section>

      <section className={panelClass}>
        <h3 className="text-sm font-black">地点与金额</h3>
        <label className="mt-3 block text-xs font-black text-[color:var(--client-muted)]">服务区域（逗号分隔）
          <input className={fieldClass} onChange={(event) => updateRules({ areaCodes: event.target.value.split(/[,，]/).map((item) => item.trim()).filter(Boolean) })} placeholder="例如：港区、新宿区" value={rules.areaCodes.join("，")} />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <NumberField label="最大距离 km" min={0.1} step={0.1} value={rules.maxDistanceKm} onChange={(maxDistanceKm) => updateRules({ maxDistanceKm })} />
          <NumberField label="最低订单金额 JPY" min={0} value={rules.minOrderAmountJpy} onChange={(minOrderAmountJpy) => updateRules({ minOrderAmountJpy })} />
          <NumberField label="最低预计净收入 JPY" min={0} value={rules.minNetAmountJpy} onChange={(minNetAmountJpy) => updateRules({ minNetAmountJpy })} />
        </div>
      </section>

      <section className={panelClass}>
        <h3 className="text-sm font-black">客户质量与来源</h3>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <NumberField label="最低评分" min={1} max={5} step={0.1} value={rules.minCustomerRating} onChange={(minCustomerRating) => updateRules({ minCustomerRating })} />
          <NumberField label="最高取消率 %" min={0} max={100} step={0.1} value={rules.maxCancellationRatePercent} onChange={(maxCancellationRatePercent) => updateRules({ maxCancellationRatePercent })} />
        </div>
        <div className="mt-3 space-y-3">
          <Toggle checked={rules.acceptNewCustomers} label="允许无历史评分的新客户" onChange={(acceptNewCustomers) => updateRules({ acceptNewCustomers })} />
          <Toggle checked={rules.requireEkyc} label="客户必须通过 eKYC" onChange={(requireEkyc) => updateRules({ requireEkyc })} />
          <label className="block text-xs font-black text-[color:var(--client-muted)]">最低已完成订单
            <select className={applicationSelectClass} onChange={(event) => updateRules({ minCompletedOrders: Number(event.target.value) as 0 | 1 | 3 | 5 | 10 })} value={rules.minCompletedOrders}>{[0, 1, 3, 5, 10].map((value) => <option key={value} value={value}>{value}</option>)}</select>
          </label>
          <label className="block text-xs font-black text-[color:var(--client-muted)]">客户来源
            <select className={applicationSelectClass} onChange={(event) => updateRules({ source: { mode: event.target.value as TechnicianAutomationRules["source"]["mode"], contactIdentityIds: [] } })} value={rules.source.mode}>
              <option value="any">不限</option><option value="existing_contacts">已有联系人</option><option value="specific_contacts">指定联系人</option><option value="existing_contact_referrals">已有联系人推荐</option><option value="specific_contact_referrals">指定联系人推荐</option>
            </select>
          </label>
          {specificSource ? <fieldset><legend className="text-xs font-black text-[color:var(--client-muted)]">指定联系人</legend><div className="mt-2 max-h-48 space-y-2 overflow-auto">{contacts.length === 0 ? <p className="text-xs text-[color:var(--client-muted)]">暂无可选联系人</p> : contacts.map((contact) => <label className="flex items-center gap-2 rounded-xl border border-[color:var(--client-line)] p-3 text-sm font-bold" key={contact.identityId}><input checked={rules.source.contactIdentityIds.includes(contact.identityId)} onChange={(event) => updateRules({ source: { ...rules.source, contactIdentityIds: event.target.checked ? [...rules.source.contactIdentityIds, contact.identityId] : rules.source.contactIdentityIds.filter((id) => id !== contact.identityId) } })} type="checkbox" />{contact.displayName}<span className="text-xs text-[color:var(--client-muted)]">{contact.publicId}</span></label>)}</div></fieldset> : null}
          <label className="block text-xs font-black text-[color:var(--client-muted)]">客户类型
            <select className={applicationSelectClass} onChange={(event) => updateRules({ customerType: event.target.value as TechnicianAutomationRules["customerType"] })} value={rules.customerType}><option value="all">全部</option><option value="returning">回头客</option><option value="new">新客户</option></select>
          </label>
        </div>
      </section>

      <section className={panelClass}>
        <h3 className="text-sm font-black">订单属性</h3>
        <div className="mt-3 space-y-4">
          <MultiChoice label="人数" options={[{ value: "single", label: "单人" }, { value: "multiple", label: "多人" }]} value={rules.partyTypes} onChange={(partyTypes) => updateRules({ partyTypes })} />
          <MultiChoice label="服务方式" options={[{ value: "store", label: "到店" }, { value: "home", label: "上门" }]} value={rules.serviceModes} onChange={(serviceModes) => updateRules({ serviceModes })} />
          <MultiChoice label="支付方式" options={[{ value: "onsite", label: "现场" }, { value: "card", label: "银行卡" }, { value: "ndp", label: "NDP" }, { value: "bank_transfer", label: "转账" }, { value: "other", label: "其他" }]} value={rules.paymentMethods} onChange={(paymentMethods) => updateRules({ paymentMethods })} />
          <fieldset><legend className="text-xs font-black text-[color:var(--client-muted)]">项目类型（不选表示全部）</legend><div className="mt-2 space-y-2">{services.length === 0 ? <p className="text-xs text-[color:var(--client-muted)]">当前没有可用的正式服务项目</p> : services.map((service) => <label className="flex items-center gap-2 rounded-xl border border-[color:var(--client-line)] p-3 text-sm font-bold" key={service.id}><input checked={rules.serviceIds.includes(service.id)} onChange={(event) => updateRules({ serviceIds: event.target.checked ? [...rules.serviceIds, service.id] : rules.serviceIds.filter((id) => id !== service.id) })} type="checkbox" />{service.name}<span className="ml-auto text-xs text-[color:var(--client-muted)]">¥{service.priceAmount.toLocaleString()}</span></label>)}</div></fieldset>
          <div className="space-y-3 border-t border-[color:var(--client-line)] pt-4" data-testid="automation-prepayment-rule">
            <Toggle
              checked={rules.minimumPrepaymentPercent !== 0}
              label="需要预付"
              onChange={(required) => updateRules({ minimumPrepaymentPercent: required ? 10 : 0 })}
            />
            {rules.minimumPrepaymentPercent !== 0 ? (
              <label className="block text-xs font-black text-[color:var(--client-muted)]">
                最低预付比例
                <span className="mt-2 flex items-center gap-2">
                  <input
                    aria-label="最低预付比例"
                    className={fieldClass}
                    inputMode="numeric"
                    max={100}
                    min={10}
                    onChange={(event) => updateRules({
                      minimumPrepaymentPercent: event.target.value === "" ? Number.NaN : Number(event.target.value)
                    })}
                    step={1}
                    type="number"
                    value={Number.isFinite(rules.minimumPrepaymentPercent) ? rules.minimumPrepaymentPercent : ""}
                  />
                  <span className="shrink-0 text-sm text-[color:var(--client-text)]">%以上</span>
                </span>
                <span className="mt-2 block font-bold leading-5">按订单金额计算；达到该比例后才会自动接单或抢单。</span>
              </label>
            ) : null}
          </div>
        </div>
      </section>

      {validation || message ? <p aria-live="polite" className={cn("fixed bottom-[calc(72px+env(safe-area-inset-bottom))] left-1/2 z-40 w-[calc(100%-2rem)] max-w-[928px] -translate-x-1/2 text-center text-xs font-black", validation || message.includes("失败") ? "text-red-500" : "text-[color:var(--client-primary)]")}>{validation || message}</p> : null}
      <button className="fixed bottom-[calc(12px+env(safe-area-inset-bottom))] left-1/2 z-40 h-12 w-[calc(100%-2rem)] max-w-[928px] -translate-x-1/2 rounded-full bg-[color:var(--client-primary)] text-sm font-black text-[color:var(--client-needo-text)] shadow-[0_16px_36px_color-mix(in_srgb,var(--client-primary)_24%,transparent)] disabled:opacity-40" data-testid="automation-save" disabled={Boolean(validation) || state === "saving" || !setting.entitled} onClick={() => void save()} type="button">{state === "saving" ? "保存中" : "保存设置"}</button>
    </div>
  );
}

function NumberField({ label, value, onChange, min, max, step = 1 }: { label: string; value: number | null; onChange: (value: number | null) => void; min?: number; max?: number; step?: number }) {
  return <label className="text-xs font-black text-[color:var(--client-muted)]">{label}<input className={fieldClass} max={max} min={min} onChange={(event) => onChange(optionalNumber(event.target.value))} step={step} type="number" value={value ?? ""} /></label>;
}
