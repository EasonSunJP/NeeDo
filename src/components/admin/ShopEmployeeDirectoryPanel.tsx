import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ApiClientError } from "../../api/httpClient";
import { merchantEmployeeApi, type ShopEmployeeDirectoryItem, type ShopEmployeeRoleCode } from "../../features/merchant-admin/employeeApi";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { Button } from "../ui/Button";
import { DataTable } from "../ui/DataTable";
import { Drawer } from "../ui/Drawer";
import { PasswordInput } from "../ui/PasswordInput";

const roleOptions: Array<{ code: ShopEmployeeRoleCode; label: string }> = [
  { code: "STAFF", label: "员工" },
  { code: "ACCOUNTANT", label: "会计" },
  { code: "DRIVER", label: "司机" },
  { code: "GENERAL_AFFAIRS", label: "总务" },
  { code: "CHEF", label: "厨师" }
];

export function ShopEmployeeDirectoryPanel({ scope, shopId, canCreate = true, onOpenTechnician }: {
  scope: "merchant" | "backoffice";
  shopId?: number;
  canCreate?: boolean;
  onOpenTechnician?: (needoId: string) => void;
}) {
  const { language } = useOptionalI18n();
  const t = (source: string) => translateText(source, language);
  const [employees, setEmployees] = useState<ShopEmployeeDirectoryItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [keywordInput, setKeywordInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roleCode, setRoleCode] = useState<ShopEmployeeRoleCode>("STAFF");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    if (scope === "backoffice" && !shopId) {
      setEmployees([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const query = { page, pageSize: 20, keyword: keyword || undefined };
      const result = scope === "merchant"
        ? await merchantEmployeeApi.listDirectory(query)
        : await merchantEmployeeApi.listBackofficeDirectory(shopId!, query);
      if (requestId.current !== currentRequest) return;
      setEmployees(result.list);
      setTotal(result.total);
    } catch (caught) {
      if (requestId.current === currentRequest) setError(caught instanceof Error ? caught.message : "error.api");
    } finally {
      if (requestId.current === currentRequest) setLoading(false);
    }
  }, [scope, shopId, page, keyword]);

  useEffect(() => {
    void load();
    return () => { requestId.current += 1; };
  }, [load]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving || (scope === "backoffice" && !shopId)) return;
    setSaving(true);
    setSaveError("");
    try {
      const input = { displayName: displayName.trim(), email: email.trim(), password, roleCode };
      const created = scope === "merchant"
        ? await merchantEmployeeApi.createDirectoryEmployee(input)
        : await merchantEmployeeApi.createBackofficeEmployee(shopId!, input);
      setFormOpen(false);
      setDisplayName("");
      setEmail("");
      setPassword("");
      setRoleCode("STAFF");
      setNotice(`${t("员工已新建")}：${created.needoId}`);
      if (page === 1) await load();
      else setPage(1);
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 409) setSaveError(t("该邮箱已注册"));
      else if (caught instanceof ApiClientError && caught.status === 404) setSaveError(t("未找到可用店铺或职务"));
      else if (caught instanceof ApiClientError && caught.status === 403) setSaveError(t("当前身份没有新建员工的权限"));
      else setSaveError(caught instanceof Error ? caught.message : "error.api");
    } finally {
      setSaving(false);
    }
  };

  if (scope === "backoffice" && !shopId) return <p className="rounded-lg border border-line bg-white p-5 text-sm font-bold">{t("请先选择店铺")}</p>;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <form className="flex min-w-0 flex-1 gap-2" onSubmit={(event) => { event.preventDefault(); setPage(1); setKeyword(keywordInput.trim()); }}>
          <input aria-label={t("搜索员工")} className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-white px-3 text-sm" onChange={(event) => setKeywordInput(event.target.value)} placeholder={t("姓名或 NeeDoID")} value={keywordInput} />
          <Button size="sm" type="submit" variant="secondary">{t("搜索")}</Button>
        </form>
        {canCreate ? <Button onClick={() => { setNotice(""); setSaveError(""); setFormOpen(true); }}>{t("新建员工")}</Button> : null}
      </div>
      {notice ? <p className="text-sm font-bold text-moss" role="status">{notice}</p> : null}
      {error ? <div className="flex items-center gap-3 text-sm text-coral" role="alert"><span>{error}</span><Button size="sm" variant="secondary" onClick={() => void load()}>{t("重试")}</Button></div> : null}
      {loading ? <p className="text-sm text-ink/55">{t("正在加载员工")}</p> : null}
      {!loading && !error ? <DataTable<ShopEmployeeDirectoryItem>
        columns={[
          { key: "name", title: t("员工"), render: (row) => row.displayName },
          { key: "needoId", title: "NeeDoID", render: (row) => row.needoId },
          { key: "role", title: t("职务"), render: (row) => row.roles.map((role) => ({ zh: role.names.zhHans, "zh-Hant": role.names.zhHant, ja: role.names.ja, en: role.names.en, ko: role.names.ko })[language]).join("、") || "—" },
          { key: "status", title: t("状态"), render: (row) => t(row.status === "active" ? "在职" : row.status === "on_leave" ? "休假" : "停职") },
          { key: "contact", title: t("联系方式"), render: (row) => row.email },
          { key: "detail", title: t("详情"), render: (row) => row.technician && onOpenTechnician ? <Button size="sm" variant="secondary" onClick={() => onOpenTechnician(row.technician!.needoId)}>{t("技师详情")}</Button> : "—" }
        ]}
        paginationMode="server" showFooter={false} rows={employees} /> : null}
      {!loading && !error && total > 20 ? <div className="flex items-center justify-between text-sm">
        <span>{page} / {Math.ceil(total / 20)}</span>
        <div className="flex gap-2"><Button disabled={page <= 1} size="sm" variant="secondary" onClick={() => setPage((value) => value - 1)}>{t("上一页")}</Button><Button disabled={page * 20 >= total} size="sm" variant="secondary" onClick={() => setPage((value) => value + 1)}>{t("下一页")}</Button></div>
      </div> : null}
      <Drawer open={formOpen} title={t("新建员工")} onClose={() => { if (!saving) setFormOpen(false); }}>
        <form className="space-y-4" onSubmit={(event) => void submit(event)}>
          <p className="text-sm text-ink/60">{t("创建后系统自动分配 NeeDoID。请设置员工姓名、邮箱与初始密码。")}</p>
          <label className="block text-sm font-bold">{t("员工 NeeDoID")}
            <input aria-label={t("员工 NeeDoID")} className="mt-2 h-11 w-full rounded-lg border border-line bg-paper px-3" placeholder={t("保存后自动生成")} readOnly value="" />
          </label>
          <label className="block text-sm font-bold">{t("员工姓名")}
            <input aria-label={t("员工姓名")} className="mt-2 h-11 w-full rounded-lg border border-line px-3" maxLength={120} onChange={(event) => setDisplayName(event.target.value)} required value={displayName} />
          </label>
          <label className="block text-sm font-bold">{t("邮箱")}
            <input aria-label={t("邮箱")} autoComplete="off" className="mt-2 h-11 w-full rounded-lg border border-line px-3" maxLength={255} onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
          </label>
          <label className="block text-sm font-bold">{t("初始密码")}
            <PasswordInput aria-label={t("初始密码")} autoComplete="new-password" inputClassName="mt-2 h-11 w-full rounded-lg border border-line px-3 pr-12" minLength={8} onChange={(event) => setPassword(event.target.value)} required value={password} />
          </label>
          <label className="block text-sm font-bold">{t("职务")}
            <select aria-label={t("职务")} className="mt-2 h-11 w-full rounded-lg border border-line px-3" onChange={(event) => setRoleCode(event.target.value as ShopEmployeeRoleCode)} value={roleCode}>
              {roleOptions.map((role) => <option key={role.code} value={role.code}>{t(role.label)}</option>)}
            </select>
          </label>
          {saveError ? <p className="text-sm font-bold text-coral" role="alert">{saveError}</p> : null}
          <Button disabled={saving} type="submit">{saving ? t("保存中") : t("新建员工")}</Button>
        </form>
      </Drawer>
    </section>
  );
}
