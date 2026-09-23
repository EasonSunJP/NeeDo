import { useEffect, useState, type FormEvent } from "react";
import { backofficeRealDataApi, type BackofficeShopPayload } from "../../api/backofficeRealData";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { ShopEmployeeDirectoryPanel } from "../../components/admin/ShopEmployeeDirectoryPanel";
import { Button } from "../../components/ui/Button";
import { useAuth } from "../../auth/AuthProvider";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";

export function EmployeesPage() {
  const { hasPermission } = useAuth();
  const { language } = useOptionalI18n();
  const t = (source: string) => translateText(source, language);
  const [shops, setShops] = useState<BackofficeShopPayload[]>([]);
  const [shopId, setShopId] = useState<number | undefined>();
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void backofficeRealDataApi.shops("backoffice", { keyword: keyword || undefined, page: 1, pageSize: 100 })
      .then((result) => { if (active) setShops(result.list); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "error.api"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [keyword]);

  const search = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setKeyword(keywordInput.trim());
  };

  return <AdminLayout><ModuleShell actions={<></>} title={t("员工管理")} description={t("选择店铺后管理正式员工名录。")}>
    <form className="mb-4 flex flex-wrap gap-2" onSubmit={search}>
      <input aria-label={t("搜索店铺")} className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-white px-3" onChange={(event) => setKeywordInput(event.target.value)} placeholder={t("搜索店铺")} value={keywordInput} />
      <Button type="submit" variant="secondary">{t("搜索")}</Button>
    </form>
    {error ? <p className="mb-3 text-sm font-bold text-coral" role="alert">{error}</p> : null}
    <select aria-label={t("选择店铺")} className="mb-5 h-11 w-full rounded-lg border border-line bg-white px-3" disabled={loading} onChange={(event) => setShopId(event.target.value ? Number(event.target.value) : undefined)} value={shopId ?? ""}>
      <option value="">{loading ? t("正在加载店铺") : t("请先选择店铺")}</option>
      {shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name} · {shop.city}</option>)}
    </select>
    <ShopEmployeeDirectoryPanel canCreate={hasPermission("backoffice:shops:write")} scope="backoffice" shopId={shopId} />
  </ModuleShell></AdminLayout>;
}
