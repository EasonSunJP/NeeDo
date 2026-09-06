import { useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthProvider";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Button } from "../../components/ui/Button";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { ekycApplicationsApi, type EkycApplicationDetail, type EkycApplicationStatus, type EkycApplicationSummary } from "./ekycApplicationsApi";
import { ekycOccupations } from "./ekycProfileModel";

export function EkycReviewPage() {
  const { session } = useAuth();
  return <EkycReviewContent key={session?.id ?? "anonymous"} />;
}

function EkycReviewContent() {
  const { session, hasPermission } = useAuth();
  const { language } = useI18n();
  const t = (text: string) => translateText(text, language);
  const [items, setItems] = useState<EkycApplicationSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<EkycApplicationStatus | "">("submitted");
  const [selected, setSelected] = useState<EkycApplicationDetail | null>(null);
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const statusLabel = (value: string) => t(({ submitted: "审核中", approved: "审核已通过", rejected: "审核未通过", withdrawn: "已撤回" } as Record<string, string>)[value] ?? value);
  useEffect(() => {
    let current = true;
    setLoading(true); setError(""); setItems([]);
    void ekycApplicationsApi.listReviews(page, status || undefined).then(result => {
      if (current) { setItems(result.list); setTotal(result.total); }
    }).catch(cause => { if (current) setError(cause instanceof Error ? cause.message : String(cause)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [page, status, revision, session?.id]);
  useEffect(() => { setSelected(null); setNote(""); setReason(""); setConfirmed(false); }, [session?.id]);
  const open = async (id: number) => {
    setBusy(true); setError("");
    try { setSelected(await ekycApplicationsApi.getReview(id)); setNote(""); setReason(""); setConfirmed(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  const decide = async (approved: boolean) => {
    if (!selected || busy) return;
    setBusy(true); setError("");
    try {
      const result = approved ? await ekycApplicationsApi.approve(selected.id, selected.version, note.trim()) : await ekycApplicationsApi.reject(selected.id, selected.version, reason.trim());
      setSelected(result); setRevision(value => value + 1);
      window.dispatchEvent(new Event("ekyc-review-updated"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };
  const canReview = selected?.status === "submitted" && selected.userId !== session?.id && hasPermission("ops:ekyc-application:review");
  const profile = selected?.profile;
  const rows = profile ? [
    ["姓名", `${profile.familyName} ${profile.givenName}`], ["姓名（片假名）", `${profile.familyNameKana} ${profile.givenNameKana}`],
    ["出生日期", `${profile.birthYear}/${profile.birthMonth}/${profile.birthDay}`], ["性别", t(profile.sex === "male" ? "男性" : "女性")],
    ["邮政编码", profile.postalCode], ["都道府县／市区町村", profile.city], ["街道门牌", profile.street], ["楼栋／房间号", profile.building],
    ["职业", profile.occupation === "other" ? profile.otherOccupation : t(ekycOccupations.find(item => item.value === profile.occupation)?.label ?? profile.occupation)]
  ] : [];
  return <AdminLayout><ModuleShell title={t("eKYC手动")} description={t("核对本人提交的资料，记录人工核验依据后作出审核决定。") }>
    {error ? <div className="rounded-xl border border-red-500 bg-red-950 p-4 text-white" role="alert">{t(error)}<button className="ml-4 underline" onClick={() => setRevision(value => value + 1)} type="button">{t("重试")}</button></div> : null}
    {selected ? <>
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-black">{t("申请编号")} #{selected.id} · {statusLabel(selected.status)}</h2><Button onClick={() => setSelected(null)} variant="secondary">{t("返回申请列表")}</Button></div>
      <dl className="grid gap-x-8 rounded-2xl border border-line bg-white p-5 md:grid-cols-2">{rows.map(([label, value]) => <div className="border-b border-line py-4" key={label}><dt className="text-xs text-ink/60">{t(label)}</dt><dd className="mt-2 break-words font-bold">{value || "—"}</dd></div>)}</dl>
      {selected.reviewNote ? <p className="rounded-xl border border-line p-4">{t("核验说明")}：{selected.reviewNote}</p> : null}
      {selected.rejectionReason ? <p className="rounded-xl border border-red-500 p-4">{t("驳回原因")}：{selected.rejectionReason}</p> : null}
      {canReview ? <section className="space-y-4 rounded-2xl border border-line bg-white p-5">
        <label className="block space-y-2 font-bold"><span>{t("核验说明")}</span><textarea aria-label={t("核验说明")} className="min-h-24 w-full rounded-xl border border-line bg-paper p-3 font-normal" maxLength={1000} value={note} onChange={event => setNote(event.target.value)} /></label>
        <label className="flex items-start gap-3"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1" /><span>{t("已通过人工核对确认上述资料与本人一致")}</span></label>
        <Button disabled={busy || !confirmed || !note.trim()} onClick={() => void decide(true)}>{t("审核通过")}</Button>
        <hr className="border-line" />
        <label className="block space-y-2 font-bold"><span>{t("驳回原因")}</span><textarea aria-label={t("驳回原因")} className="min-h-20 w-full rounded-xl border border-line bg-paper p-3 font-normal" maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></label>
        <Button className="border-red-500 bg-red-600 text-white" disabled={busy || !reason.trim()} onClick={() => void decide(false)}>{t("驳回")}</Button>
      </section> : null}
    </> : <>
      <div className="flex flex-wrap gap-3"><label className="flex items-center gap-3">{t("审核状态")}<select className="h-11 rounded-lg border border-line bg-white px-3" value={status} onChange={event => { setStatus(event.target.value as EkycApplicationStatus | ""); setPage(1); }}><option value="">{t("全部")}</option>{["submitted", "approved", "rejected", "withdrawn"].map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></label><Button onClick={() => setRevision(value => value + 1)} variant="secondary">{t("刷新")}</Button></div>
      {loading ? <p role="status">{t("正在加载…")}</p> : <div className="overflow-x-auto rounded-xl border border-line"><table className="w-full text-left text-sm"><thead className="bg-paper"><tr>{["申请编号", "用户 ID", "审核状态", "申请时间", "操作"].map(label => <th className="p-4" key={label}>{t(label)}</th>)}</tr></thead><tbody>{items.map(item => <tr key={item.id} className="border-t border-line bg-white"><td className="p-4">#{item.id}</td><td className="p-4">{item.userId}</td><td className="p-4">{statusLabel(item.status)}</td><td className="p-4">{new Date(item.createdAt).toLocaleString(language, { timeZone: "Asia/Tokyo" })}</td><td className="p-4"><Button disabled={busy} onClick={() => void open(item.id)} variant="secondary">{t("查看申请")}</Button></td></tr>)}</tbody></table>{!items.length ? <p className="p-6 text-center text-ink/60">{t("暂无申请")}</p> : null}</div>}
      <div className="flex items-center justify-end gap-3"><span>{page} / {Math.max(1, Math.ceil(total / 20))}</span><Button disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)} variant="secondary">{t("上一页")}</Button><Button disabled={loading || page * 20 >= total} onClick={() => setPage(value => value + 1)} variant="secondary">{t("下一页")}</Button></div>
    </>}
  </ModuleShell></AdminLayout>;
}
