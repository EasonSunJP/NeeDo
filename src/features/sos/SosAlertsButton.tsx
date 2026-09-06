import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Drawer } from "../../components/ui/Drawer";
import { sosApi, type SosAlert, type SosAlertPage } from "./api";
import { useSosText } from "./i18n";
import { subscribeSosRefresh } from "./refresh";
import { useSosScope } from "./useSosScope";
import "./sos.css";

export function SosAlertsButton() {
  const scope = useSosScope();
  return scope.canRead ? <SosInbox key={scope.ownerKey} canResolve={scope.canResolve} /> : null;
}

export function SosWarningIcon() {
  return <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="m12 3 10 18H2L12 3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M12 9v5m0 3v.1" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>;
}

function SosInbox({ canResolve }: { canResolve: boolean }) {
  const t = useSosText();
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [countError, setCountError] = useState(false);
  const [status, setStatus] = useState<SosAlert["status"]>("pending");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SosAlertPage | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [resolveError, setResolveError] = useState(false);
  const [revision, setRevision] = useState(0);
  const mounted = useRef(true);
  const resolving = useRef(false);
  const refreshCount = useRef<() => void>(() => {});
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    let sequence = 0;
    const controller = new AbortController();
    const refresh = async () => {
      const request = ++sequence;
      try {
        const value = await sosApi.count(controller.signal);
        if (active && sequence === request) { setCount(value.pending); setCountError(false); }
      } catch { if (active && sequence === request) setCountError(true); }
    };
    refreshCount.current = () => { void refresh(); };
    void refresh();
    const unsubscribe = subscribeSosRefresh(() => { void refresh(); setRevision((value) => value + 1); });
    return () => { active = false; controller.abort(); unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!open) return;
    let active = true;
    const controller = new AbortController();
    setLoadError(false);
    void sosApi.list(status, page, controller.signal).then((value) => {
      if (!active) return;
      const lastPage = Math.max(1, Math.ceil(value.total / value.page_size));
      if (page > lastPage) { setData(null); setPage(lastPage); return; }
      setData(value);
    }).catch(() => { if (active) setLoadError(true); });
    return () => { active = false; controller.abort(); };
  }, [open, status, page, revision]);
  useEffect(() => {
    if (!open) return;
    dialog.current?.focus();
    return () => { trigger.current?.focus(); };
  }, [open]);
  const close = () => { setOpen(false); setData(null); setResolveError(false); };
  const resolve = async (id: number) => {
    if (!canResolve || resolving.current) return;
    resolving.current = true; setBusy(id); setResolveError(false);
    try {
      await sosApi.resolve(id);
      if (!mounted.current) return;
      refreshCount.current(); setRevision((value) => value + 1);
    } catch { if (mounted.current) setResolveError(true); }
    finally { resolving.current = false; if (mounted.current) setBusy(null); }
  };
  const retry = () => { refreshCount.current(); setRevision((value) => value + 1); };
  return <>
    <button aria-label={t("title")} aria-haspopup="dialog" aria-expanded={open} className="backoffice-action focus-ring" data-active={(count ?? 0) > 0} onClick={() => setOpen(true)} ref={trigger} type="button" title={countError ? t("connectionError") : t("title")} data-no-i18n>
      <span className="sos-alert-icon"><SosWarningIcon /></span><span className="sos-alert-label">{t("title")}</span>
      {count !== null && count > 0 ? <span className="rounded-full bg-white/20 px-1.5 text-xs">{count > 99 ? "99+" : count}</span> : null}
      {countError ? <span aria-label={t("connectionError")}>!</span> : null}
    </button>
    {open ? createPortal(
      <div aria-label={t("title")} aria-modal="true" data-no-i18n ref={dialog} role="dialog" tabIndex={-1} onKeyDown={(event) => {
        if (event.key === "Escape") { event.stopPropagation(); close(); }
        if (event.key !== "Tab") return;
        const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],[tabindex="0"]') ?? [])];
        const first = controls[0]; const last = controls.at(-1);
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first?.focus(); }
      }}>
        <Drawer open onClose={close} closeLabel={t("close")} title={t("title")} resizable={false}>
          <div className="flex gap-2" role="group" aria-label={t("title")}>
            {(["pending", "resolved"] as const).map((value) => <button aria-pressed={status === value} className={`rounded-lg border px-4 py-2 text-sm font-bold ${status === value ? "border-red-500 bg-red-500/10 text-red-500" : "border-line"}`} key={value} onClick={() => { if (status === value && page === 1) return; setData(null); setStatus(value); setPage(1); }} type="button">{t(value)}</button>)}
          </div>
          {countError || loadError ? <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm" role="alert"><p>{countError ? t("connectionError") : t("loadError")}</p><button className="mt-2 underline" onClick={retry} type="button">{t("retry")}</button></div> : null}
          {resolveError ? <p className="mt-3 text-sm text-red-500" role="alert">{t("resolveError")}</p> : null}
          {!data && !loadError ? <p className="mt-5" role="status">{t("loading")}</p> : null}
          {data?.list.length === 0 ? <p className="mt-8 text-center text-sm opacity-65">{t("empty")}</p> : null}
          <div className="mt-4 space-y-3">
            {data?.list.map((alert) => <article className="rounded-2xl border border-line bg-paper p-4" key={alert.id}>
              <div className="flex items-start justify-between gap-3"><strong>{alert.senderName} · {t(alert.senderType)}</strong><span className={alert.status === "pending" ? "text-red-500" : "opacity-60"}>{t(alert.status)}</span></div>
              <p className="mt-2 text-sm">{alert.serviceName}</p><p className="mt-1 break-words text-sm opacity-70">{alert.shopName} · {alert.orderNo}</p>
              <time className="mt-2 block text-xs opacity-60" dateTime={alert.createdAt}>{new Date(alert.createdAt).toLocaleString()}</time>
              {alert.resolvedAt ? <p className="mt-2 text-xs opacity-60">{alert.resolvedByName} · {new Date(alert.resolvedAt).toLocaleString()}</p> : null}
              {canResolve && alert.status === "pending" ? <button className="mt-3 rounded-lg border border-red-500/40 px-3 py-2 text-sm font-bold text-red-500 disabled:opacity-50" disabled={busy !== null} onClick={() => void resolve(alert.id)} type="button">{busy === alert.id ? t("resolving") : t("resolve")}</button> : null}
            </article>)}
          </div>
          {data ? <div className="mt-5 flex items-center justify-between gap-3"><button disabled={page <= 1} className="rounded-lg border border-line p-2 disabled:opacity-40" onClick={() => { setData(null); setPage((value) => value - 1); }} type="button">{t("previous")}</button><span className="text-xs">{page} / {Math.max(1, Math.ceil(data.total / data.page_size))}</span><button disabled={page * data.page_size >= data.total} className="rounded-lg border border-line p-2 disabled:opacity-40" onClick={() => { setData(null); setPage((value) => value + 1); }} type="button">{t("next")}</button></div> : null}
        </Drawer>
      </div>, trigger.current?.closest(".admin-shell") ?? document.body
    ) : null}
  </>;
}
