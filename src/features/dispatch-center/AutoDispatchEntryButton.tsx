import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { shopAutoDispatchApi, toShopAutoDispatchInput, type ShopAutoDispatchRule } from "../../api/shopAutoDispatch";
import { ToggleSwitch } from "../../components/ui/ToggleSwitch";

export function AutoDispatchEntryButton() {
  const [rule, setRule] = useState<ShopAutoDispatchRule | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    shopAutoDispatchApi.read()
      .then((value) => { if (active) setRule(value); })
      .catch(() => { if (active) setError("自动派单读取失败"); });
    return () => { active = false; };
  }, []);

  const changeEnabled = async (enabled: boolean) => {
    if (!rule || pending) return;
    setPending(true);
    setError("");
    try {
      setRule(await shopAutoDispatchApi.update({ ...toShopAutoDispatchInput(rule), enabled }));
    } catch {
      setError("自动派单保存失败，请重试。");
    } finally {
      setPending(false);
    }
  };

  return <div className="rounded-[18px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,transparent)] px-3 py-2 backdrop-blur-xl">
    <div className="flex items-center gap-2">
      <Link className="text-xs font-black text-[color:var(--client-text)]" to="/merchant/schedule/auto-dispatch">自动派单设置</Link>
      <ToggleSwitch ariaLabel="开启自动派单" checked={rule?.enabled ?? false} disabled={!rule || pending} onChange={(enabled) => void changeEnabled(enabled)} />
    </div>
    {error ? <p className="mt-1 text-[10px] font-bold text-[color:var(--client-accent)]" role="status">{error}</p> : null}
  </div>;
}
