import { useEffect, useState } from "react";
import { shopAutoDispatchApi } from "../../api/shopAutoDispatch";
import { Button } from "../../components/ui/Button";

export function AutoDispatchEntryButton() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    shopAutoDispatchApi.read()
      .then((rule) => { if (active) setEnabled(rule.enabled); })
      .catch(() => { if (active) setEnabled(null); });
    return () => { active = false; };
  }, []);
  return <Button size="sm" to="/merchant/schedule/auto-dispatch" variant="secondary">自动派单 · {enabled === null ? "—" : enabled ? "ON" : "OFF"}</Button>;
}
