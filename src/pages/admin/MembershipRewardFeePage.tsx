import { useEffect, useMemo, useRef, useState } from "react";
import { membershipRewardFeeApi, type MembershipRewardFeeOverview, type MembershipRewardFeeVersion } from "../../api/membershipRewardFee";
import { ApiClientError } from "../../api/httpClient";
import { PermissionGate } from "../../auth/PermissionGate";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Drawer } from "../../components/ui/Drawer";
import { TestFeatureBadge } from "../../components/ui/TestFeatureBadge";
import { useI18n } from "../../i18n/I18nProvider";
import { languageLocales } from "../../i18n/translations";
import { getMembershipRewardFeeCopy } from "./membershipRewardFeeCopy";
import {
  buildMembershipRewardFeeInput,
  classifyMembershipRewardFeeVersion,
  parseFeePercent,
  validateMembershipRewardFeeDraft,
  type MembershipRewardFeeDraft,
  type MembershipRewardFeeDraftErrors
} from "./membershipRewardFeeModel";

const pageSize = 20;

function localFuture(minutes = 5) {
  const date = new Date(Date.now() + minutes * 60_000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function MembershipRewardFeePage() {
  const { language } = useI18n();
  const copy = useMemo(() => getMembershipRewardFeeCopy(language), [language]);
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(languageLocales[language], { dateStyle: "medium", timeStyle: "short" }), [language]);
  const formatDate = (value: string | null) => value ? dateFormatter.format(new Date(value)) : "—";
  const formatRate = (value: number | null | undefined) => value === null || value === undefined ? copy.none : `${(value / 100).toFixed(2).replace(/\.00$/, "")}%`;
  const [overview, setOverview] = useState<MembershipRewardFeeOverview | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const requestId = useRef(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState<MembershipRewardFeeDraft>({ percent: "10", effectiveFrom: localFuture(), reason: "" });
  const [errors, setErrors] = useState<MembershipRewardFeeDraftErrors>({});
  const [confirmation, setConfirmation] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const id = ++requestId.current;
    setStatus("loading");
    setMessage("");
    membershipRewardFeeApi.getOverview({ page, pageSize }).then((result) => {
      if (id !== requestId.current) return;
      setOverview(result);
      setStatus("ready");
    }).catch((error: unknown) => {
      if (id !== requestId.current) return;
      setOverview(null);
      setStatus("error");
      setMessage(error instanceof ApiClientError && error.status === 403 ? copy.permissionDenied : copy.loadFailed);
    });
  }, [copy.loadFailed, copy.permissionDenied, page, revision]);

  const currentRate = overview?.summary.current?.feeRateBps ?? null;
  const draftRate = parseFeePercent(draft.percent);
  const exampleRate = confirmation ? draftRate : currentRate;
  const examplePlatformFee = exampleRate === null ? null : Math.ceil(1000 * exampleRate / 10_000);
  const totalPages = Math.max(1, Math.ceil((overview?.history.total ?? 0) / pageSize));

  const openDrawer = () => {
    setDraft({ percent: currentRate === null ? "10" : String(currentRate / 100), effectiveFrom: localFuture(), reason: "" });
    setErrors({}); setMessage(""); setConfirmation(false); setDrawerOpen(true);
  };

  const prepare = () => {
    const nextErrors = validateMembershipRewardFeeDraft(draft, new Date());
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) setConfirmation(true);
  };

  const createVersion = async () => {
    if (!overview || saving) return;
    setSaving(true); setMessage("");
    try {
      await membershipRewardFeeApi.createVersion(buildMembershipRewardFeeInput(draft, overview.summary.latestVersion));
      setMessage(copy.success);
      setConfirmation(false);
      setDrawerOpen(false);
      setRevision((value) => value + 1);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 403) setMessage(copy.permissionDenied);
      else if (error instanceof ApiClientError && error.status === 409) { setMessage(copy.conflict); setConfirmation(false); setRevision((value) => value + 1); }
      else setMessage(copy.saveFailed);
    } finally { setSaving(false); }
  };

  const statusLabel = (version: MembershipRewardFeeVersion) => {
    const classified = classifyMembershipRewardFeeVersion(version, overview?.summary.evaluatedAt ?? new Date().toISOString());
    return classified === "current" ? copy.currentStatus : classified === "scheduled" ? copy.scheduledStatus : copy.historicalStatus;
  };

  return <AdminLayout><div data-no-i18n><ModuleShell title={copy.title} description={copy.description} actions={<div className="flex items-center gap-2"><TestFeatureBadge /><Badge tone="blue">RBAC</Badge><Badge tone="green">Audit</Badge><PermissionGate permission="button:backoffice-membership-reward-fee-create"><Button onClick={openDrawer}>{copy.create}</Button></PermissionGate></div>}>
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-950" data-lifecycle-contract="客户获得的 NDP 之外额外收取；只影响之后新发布的卡方案版本">{copy.warning}</section>
    {message ? <section className="rounded-xl border border-line bg-white p-4 text-sm font-bold text-ink" role="status">{message}</section> : null}
    {status === "loading" ? <section className="rounded-xl border border-line bg-white p-6 text-sm font-bold text-ink/55">{copy.loading}</section> : null}
    {status === "error" ? <section className="rounded-xl border border-coral/30 bg-coral/5 p-5" role="alert"><strong>{message}</strong><Button className="mt-3" onClick={() => setRevision((value) => value + 1)} size="sm">{copy.retry}</Button></section> : null}
    {status === "ready" && overview ? <>
      <section className="grid gap-3 md:grid-cols-3">{[
        [copy.current, formatRate(overview.summary.current?.feeRateBps), overview.summary.current ? `v${overview.summary.current.version}` : copy.none],
        [copy.next, formatRate(overview.summary.nextScheduled?.feeRateBps), overview.summary.nextScheduled ? formatDate(overview.summary.nextScheduled.effectiveFrom) : copy.none],
        [copy.latest, `v${overview.summary.latestVersion}`, formatDate(overview.summary.evaluatedAt)]
      ].map(([label, value, detail]) => <article className="rounded-xl border border-line bg-white p-5 shadow-panel" key={label}><p className="text-xs font-black uppercase tracking-[0.12em] text-ink/45">{label}</p><strong className="mt-2 block text-3xl font-black text-ink">{value}</strong><span className="mt-2 block text-xs font-bold text-ink/45">{detail}</span></article>)}</section>

      <section className="rounded-xl border border-line bg-white p-5 shadow-panel"><div className="flex flex-wrap items-center justify-between gap-3"><div><Badge tone="blue">TEST</Badge><h2 className="mt-2 text-lg font-black text-ink">{copy.preview}</h2></div><span className="text-sm font-black text-ink/55">{formatRate(exampleRate)}</span></div><div className="mt-4 grid items-center gap-2 text-center sm:grid-cols-[1fr_auto_1fr_auto_1fr]"><div className="rounded-lg bg-mist p-4"><span className="text-xs font-bold text-ink/50">{copy.customer}</span><strong className="mt-1 block text-xl text-ink">1,000 NDP</strong></div><span className="font-black text-ink/35">＋</span><div className="rounded-lg bg-mist p-4"><span className="text-xs font-bold text-ink/50">{copy.platform}</span><strong className="mt-1 block text-xl text-ink">{examplePlatformFee === null ? "—" : `${examplePlatformFee} NDP`}</strong></div><span className="font-black text-ink/35">＝</span><div className="rounded-lg bg-mint/40 p-4"><span className="text-xs font-bold text-ink/50">{copy.shopTotal}</span><strong className="mt-1 block text-xl text-ink">{examplePlatformFee === null ? "—" : `${1000 + examplePlatformFee} NDP`}</strong></div></div></section>

      <section className="space-y-3" data-history-contract="不可变历史"><div className="flex items-end justify-between"><div><p className="text-xs font-black uppercase tracking-[0.12em] text-ink/45">Version ledger</p><h2 className="mt-1 text-xl font-black text-ink">{copy.history}</h2></div><span className="text-xs font-bold text-ink/45">{overview.history.total}</span></div>{overview.history.list.length ? <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-panel"><table className="min-w-[780px] w-full text-left text-sm"><thead className="border-b border-line bg-mist/70 text-xs uppercase tracking-wide text-ink/45"><tr>{[copy.version, copy.rate, copy.status, copy.interval, copy.operator, copy.reason].map((label) => <th className="px-4 py-3" key={label}>{label}</th>)}</tr></thead><tbody>{overview.history.list.map((version) => <tr className="border-b border-line last:border-0" key={version.publicId}><td className="px-4 py-3 font-mono font-black">v{version.version}</td><td className="px-4 py-3 font-black">{formatRate(version.feeRateBps)}</td><td className="px-4 py-3"><Badge tone={statusLabel(version) === copy.currentStatus ? "green" : statusLabel(version) === copy.scheduledStatus ? "yellow" : "neutral"}>{statusLabel(version)}</Badge></td><td className="px-4 py-3 text-xs font-bold text-ink/60">{formatDate(version.effectiveFrom)}<br />{formatDate(version.effectiveTo)}</td><td className="px-4 py-3 font-mono text-xs">{version.createdByNeedoId ?? "—"}</td><td className="max-w-[260px] px-4 py-3 text-xs font-semibold leading-5 text-ink/65">{version.reason}</td></tr>)}</tbody></table></div> : <div className="rounded-xl border border-line bg-white p-8 text-center text-sm font-bold text-ink/50">{copy.empty}</div>}<div className="flex items-center justify-between"><Button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} size="sm" variant="secondary">{copy.previous}</Button><span className="text-xs font-black text-ink/50">{page} / {totalPages}</span><Button disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} size="sm" variant="secondary">{copy.nextPage}</Button></div></section>
    </> : null}
  </ModuleShell>

  <Drawer footer={<div className="flex justify-end gap-2"><Button disabled={saving} onClick={() => { if (confirmation) setConfirmation(false); else setDrawerOpen(false); }} variant="secondary">{copy.cancel}</Button>{confirmation ? <Button disabled={saving} onClick={() => void createVersion()}>{saving ? copy.saving : copy.confirm}</Button> : <Button onClick={prepare}>{copy.continueAction}</Button>}</div>} onClose={() => { if (!saving) setDrawerOpen(false); }} open={drawerOpen} title={confirmation ? copy.confirmTitle : copy.create}>
    <div className="space-y-4">{confirmation ? <><div className="rounded-xl border border-line bg-mist p-4"><p className="text-xs font-bold text-ink/50">{copy.rate}</p><strong className="mt-1 block text-3xl text-ink">{draft.percent}%</strong><p className="mt-3 text-xs font-bold text-ink/50">{copy.effectiveFrom}</p><strong className="mt-1 block text-sm text-ink">{formatDate(new Date(draft.effectiveFrom).toISOString())}</strong><p className="mt-3 text-xs font-bold text-ink/50">{copy.reason}</p><p className="mt-1 text-sm font-semibold leading-6 text-ink">{draft.reason.trim()}</p></div><section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-950">{copy.warning}</section></> : <><label className="block"><span className="mb-2 block text-sm font-black text-ink">{copy.percent}</span><input className="input w-full" inputMode="decimal" onChange={(event) => { setDraft((current) => ({ ...current, percent: event.target.value })); setErrors({}); }} value={draft.percent} />{errors.percent ? <span className="mt-1 block text-xs font-bold text-coral">{copy.percentInvalid}</span> : null}</label><label className="block"><span className="mb-2 block text-sm font-black text-ink">{copy.effectiveFrom}</span><input className="input w-full" onChange={(event) => { setDraft((current) => ({ ...current, effectiveFrom: event.target.value })); setErrors({}); }} type="datetime-local" value={draft.effectiveFrom} />{errors.effectiveFrom ? <span className="mt-1 block text-xs font-bold text-coral">{copy.futureInvalid}</span> : null}</label><label className="block"><span className="mb-2 block text-sm font-black text-ink">{copy.reason}</span><textarea className="input min-h-28 w-full py-3" maxLength={500} onChange={(event) => { setDraft((current) => ({ ...current, reason: event.target.value })); setErrors({}); }} placeholder={copy.reasonHelp} value={draft.reason} />{errors.reason ? <span className="mt-1 block text-xs font-bold text-coral">{copy.reasonInvalid}</span> : null}</label></>}</div>
  </Drawer></div></AdminLayout>;
}
