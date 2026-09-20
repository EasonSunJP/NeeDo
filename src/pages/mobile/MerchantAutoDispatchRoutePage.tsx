import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { shopAutoDispatchApi, type ShopAutoDispatchRule, type ShopAutoDispatchRuleInput } from "../../api/shopAutoDispatch";
import { MobileBottomActionBar } from "../../components/mobile/MobileBottomActionBar";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileShell } from "../../components/mobile/MobileShell";
import { Button } from "../../components/ui/Button";
import { useClientTheme } from "../../theme/ClientThemeProvider";

const fieldClass = "mt-2 h-12 w-full rounded-[18px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-4 font-black text-[color:var(--client-text)]";
const timeValue = (minutes: number) => `${Math.floor(minutes / 60).toString().padStart(2, "0")}:${(minutes % 60).toString().padStart(2, "0")}`;
const readMinutes = (value: string) => value.split(":").map(Number).reduce((hour, minute) => hour * 60 + minute);
const toInput = (rule: ShopAutoDispatchRule): ShopAutoDispatchRuleInput => {
  const { id: _id, shopId: _shopId, candidates: _candidates, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = rule;
  return input;
};

export function MerchantAutoDispatchRoutePage() {
  const navigate = useNavigate();
  const { isNight } = useClientTheme();
  const [rule, setRule] = useState<ShopAutoDispatchRule | null>(null);
  const [editingStaff, setEditingStaff] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    shopAutoDispatchApi.read().then((value) => {
      if (!active) return;
      setRule(value);
      setStatus("ready");
    }).catch(() => {
      if (!active) return;
      setStatus("error");
      setMessage("自动派单规则读取失败，请重试。");
    });
    return () => { active = false; };
  }, []);

  const patch = (value: Partial<ShopAutoDispatchRule>) => setRule((current) => current ? { ...current, ...value } : current);
  const save = async () => {
    if (!rule || status === "saving") return;
    setStatus("saving");
    setMessage("");
    try {
      setRule(await shopAutoDispatchApi.update(toInput(rule)));
      setStatus("ready");
      setMessage("自动派单规则已保存。");
    } catch {
      setStatus("error");
      setMessage("保存失败，请检查规则后重试。");
    }
  };

  return <MobileShell>
    <MobileFullscreenHeader dark={isNight} onBack={() => navigate(-1)} title="自动派单设置" />
    <main className="client-app-gutter space-y-4 pb-36 pt-4 text-[color:var(--client-text)]">
      {rule ? <>
        <section className="rounded-[28px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-5 shadow-panel">
          <div className="flex items-center justify-between gap-4">
            <div><h1 className="text-xl font-black">店铺自动派单规则</h1><p className="mt-1 text-xs font-bold text-[color:var(--client-muted)]">切换状态后保存，规则才会正式生效。</p></div>
            <button aria-pressed={rule.enabled} className={`h-12 min-w-28 rounded-full font-black ${rule.enabled ? "bg-[color:var(--client-primary)] text-[color:var(--client-primary-contrast)]" : "bg-red-500 text-white"}`} onClick={() => patch({ enabled: !rule.enabled })} type="button">{rule.enabled ? "ON" : "OFF"}</button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs font-black">
            <div className="rounded-2xl bg-[color:var(--client-bg)] p-3"><span className="block text-lg">{rule.candidates.length}</span>候选员工</div>
            <div className="rounded-2xl bg-[color:var(--client-bg)] p-3"><span className="block text-lg">{rule.allowStore ? "到店" : "—"}</span>订单</div>
            <div className="rounded-2xl bg-[color:var(--client-bg)] p-3"><span className="block text-lg">{rule.allowHome ? "上门" : "—"}</span>订单</div>
          </div>
        </section>
        <section className="space-y-4 rounded-[28px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-5 shadow-panel">
          <h2 className="text-lg font-black">订单范围条件</h2>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-black text-[color:var(--client-muted)]">开始日期<input className={fieldClass} onChange={(event) => patch({ startsOn: event.target.value || null })} type="date" value={rule.startsOn ?? ""} /></label>
            <label className="text-xs font-black text-[color:var(--client-muted)]">结束日期<input className={fieldClass} onChange={(event) => patch({ endsOn: event.target.value || null })} type="date" value={rule.endsOn ?? ""} /></label>
            <label className="text-xs font-black text-[color:var(--client-muted)]">开始时间<input className={fieldClass} onChange={(event) => patch({ startMinute: readMinutes(event.target.value) })} type="time" value={timeValue(rule.startMinute)} /></label>
            <label className="text-xs font-black text-[color:var(--client-muted)]">结束时间<input className={fieldClass} onChange={(event) => patch({ endMinute: readMinutes(event.target.value) })} type="time" value={timeValue(rule.endMinute)} /></label>
          </div>
          <div className="flex gap-2">{([['allowStore','到店预约'],['allowHome','上门服务']] as const).map(([key, label]) => <button aria-pressed={rule[key]} className={`rounded-full border px-4 py-2 text-sm font-black ${rule[key] ? "border-[color:var(--client-primary)] text-[color:var(--client-primary)]" : "border-[color:var(--client-line)] text-[color:var(--client-muted)]"}`} key={key} onClick={() => patch({ [key]: !rule[key] })} type="button">{label}</button>)}</div>
        </section>
        <section className="space-y-4 rounded-[28px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-5 shadow-panel">
          <div className="flex items-center justify-between"><h2 className="text-lg font-black">员工筛选条件</h2><Button onClick={() => setEditingStaff((value) => !value)} size="sm" variant="secondary">{editingStaff ? "完成" : "编辑"}</Button></div>
          <div><p className="text-sm font-black">优先员工列表</p><div className="mt-2 flex flex-wrap gap-2">{rule.candidates.filter((candidate) => rule.preferredTechnicianIds.includes(candidate.id)).map((candidate) => <span className="rounded-full border border-[color:var(--client-primary)] px-3 py-2 text-xs font-black text-[color:var(--client-primary)]" key={candidate.id}>{candidate.displayName}</span>)}{rule.preferredTechnicianIds.length === 0 ? <span className="text-xs font-bold text-[color:var(--client-muted)]">未指定</span> : null}</div></div>
          {editingStaff ? <div className="grid grid-cols-2 gap-2">{rule.candidates.map((candidate) => { const checked = rule.preferredTechnicianIds.includes(candidate.id); return <label className="flex items-center gap-2 rounded-2xl border border-[color:var(--client-line)] p-3 text-sm font-black" key={candidate.id}><input checked={checked} onChange={() => patch({ preferredTechnicianIds: checked ? rule.preferredTechnicianIds.filter((id) => id !== candidate.id) : [...rule.preferredTechnicianIds, candidate.id] })} type="checkbox" />{candidate.displayName}</label>; })}</div> : null}
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="最低评分" max={5} onChange={(value) => patch({ minimumRating: value })} step={0.1} value={rule.minimumRating} />
            <NumberField label="最低接单率 %" max={100} onChange={(value) => patch({ minimumAcceptanceRate: value })} value={rule.minimumAcceptanceRate} />
            <NumberField label="最高取消率 %" max={100} onChange={(value) => patch({ maximumCancellationRate: value })} value={rule.maximumCancellationRate} />
            <NumberField label="单员工每日上限" min={1} onChange={(value) => patch({ dailyTechnicianLimit: value })} value={rule.dailyTechnicianLimit} />
          </div>
        </section>
        <section className="space-y-4 rounded-[28px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-5 shadow-panel">
          <h2 className="text-lg font-black">分配策略</h2>
          <div className="space-y-2">{([['balanced','综合平衡'],['longest_idle','优先长时间空闲'],['highest_rating','优先高评价'],['preferred','优先员工列表']] as const).map(([value, label]) => <button aria-pressed={rule.strategy === value} className={`w-full rounded-[20px] border p-4 text-left font-black ${rule.strategy === value ? "border-[color:var(--client-primary)] bg-[color:var(--client-primary-soft)]" : "border-[color:var(--client-line)]"}`} key={value} onClick={() => patch({ strategy: value })} type="button">{label}</button>)}</div>
          <NumberField label="上门每公里移动时间（分钟）" min={1} onChange={(value) => patch({ travelMinutesPerKm: value ?? 3 })} value={rule.travelMinutesPerKm} />
          <label className="flex items-center justify-between rounded-[20px] bg-[color:var(--client-bg)] p-4 text-sm font-black">严格遵守班次窗口<input checked={rule.strictWindow} onChange={(event) => patch({ strictWindow: event.target.checked })} type="checkbox" /></label>
        </section>
      </> : <section className="rounded-[28px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-5 font-black">{message || "正在读取正式派单规则…"}</section>}
      {message && rule ? <p className={`px-2 text-sm font-black ${status === "error" ? "text-red-500" : "text-[color:var(--client-primary)]"}`} role="status">{message}</p> : null}
    </main>
    <MobileBottomActionBar contentClassName="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] gap-3">
      <Button onClick={() => navigate("/merchant/schedule?tab=appointments")} size="lg" variant="secondary">手动派单</Button>
      <Button disabled={!rule || status === "saving"} onClick={() => void save()} size="lg">{status === "saving" ? "保存中…" : "保存自动派单"}</Button>
    </MobileBottomActionBar>
  </MobileShell>;
}

function NumberField({ label, max, min = 0, onChange, step = 1, value }: { label: string; max?: number; min?: number; onChange: (value: number | null) => void; step?: number; value: number | null }) {
  return <label className="text-xs font-black text-[color:var(--client-muted)]">{label}<input className={fieldClass} max={max} min={min} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} step={step} type="number" value={value ?? ""} /></label>;
}
