import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiClientError } from "../../api/httpClient";
import { useAuth } from "../../auth/AuthProvider";
import { PermissionGate } from "../../auth/PermissionGate";
import { AdminToggleSwitch } from "../../components/admin/AdminToggleSwitch";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { adminSystemSettingsApi } from "./api";
import { legalDocumentLocales, type LegalDocumentCatalog, type LegalDocumentLocale, type LegalDocumentLocaleState, type LegalDocumentRelease, type Page } from "./types";

const localeLabels: Record<LegalDocumentLocale, string> = {
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  ja: "日本語",
  en: "English",
  ko: "한국어"
};

type EditorDraft = {
  title: string;
  body: string;
  serverLockVersion: number | null;
  dirty: boolean;
};

function isSafeInternalPath(path: string) {
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("://");
}

function toLocalDateTime(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function LegalDocumentsTab({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission("backoffice:legal-documents:write");
  const canPublish = hasPermission("backoffice:legal-documents:publish");
  const [catalog, setCatalog] = useState<Page<LegalDocumentCatalog> | null>(null);
  const [catalogPage, setCatalogPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [locale, setLocale] = useState<LegalDocumentLocale>("zh-CN");
  const [localeStates, setLocaleStates] = useState<Record<string, LegalDocumentLocaleState>>({});
  const [drafts, setDrafts] = useState<Record<string, EditorDraft>>({});
  const [history, setHistory] = useState<Page<LegalDocumentRelease> | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [publishedAt, setPublishedAt] = useState(toLocalDateTime);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createDraft, setCreateDraft] = useState({ slug: "", name: "", internalPath: "/", displayLocations: "", isEnabled: false });
  const [metadata, setMetadata] = useState({ name: "", internalPath: "/", displayLocations: "", isEnabled: false });
  const catalogGeneration = useRef(0);
  const localeGeneration = useRef(0);
  const historyGeneration = useRef(0);

  const selected = catalog?.list.find((document) => document.publicId === selectedId) ?? null;
  const editorKey = selectedId ? `${selectedId}:${locale}` : "";
  const editor = drafts[editorKey];
  const localeState = localeStates[editorKey];
  const metadataDirty = Boolean(selected && (
    metadata.name !== selected.name ||
    metadata.internalPath !== selected.internalPath ||
    metadata.displayLocations !== selected.displayLocations.join(", ") ||
    metadata.isEnabled !== selected.isEnabled
  ));
  const anyDirty = Object.values(drafts).some((draft) => draft.dirty) || metadataDirty;
  useEffect(() => onDirtyChange(anyDirty), [anyDirty, onDirtyChange]);

  const loadCatalog = useCallback(async (page = catalogPage, preferredId?: string) => {
    const generation = ++catalogGeneration.current;
    setLoading(true);
    setError("");
    try {
      const next = await adminSystemSettingsApi.listLegalDocuments(page, 20);
      if (generation !== catalogGeneration.current) return;
      setCatalog(next);
      setCatalogPage(next.page);
      setSelectedId((current) => preferredId ?? (current && next.list.some((item) => item.publicId === current) ? current : next.list[0]?.publicId ?? null));
    } catch {
      if (generation === catalogGeneration.current) setError("文档列表读取失败，请重试。");
    } finally {
      if (generation === catalogGeneration.current) setLoading(false);
    }
  }, [catalogPage]);

  useEffect(() => { void loadCatalog(1); }, []);
  useEffect(() => {
    if (!selected) return;
    setMetadata({ name: selected.name, internalPath: selected.internalPath, displayLocations: selected.displayLocations.join(", "), isEnabled: selected.isEnabled });
  }, [selected?.publicId, selected?.lockVersion]);

  const loadLocale = useCallback(async () => {
    if (!selectedId) return;
    const key = `${selectedId}:${locale}`;
    const generation = ++localeGeneration.current;
    setError("");
    try {
      const value = await adminSystemSettingsApi.getLegalLocale(selectedId, locale);
      if (generation !== localeGeneration.current) return;
      setLocaleStates((current) => ({ ...current, [key]: value }));
      setDrafts((current) => {
        if (current[key]?.dirty) return current;
        return {
          ...current,
          [key]: {
            title: value.draft?.title ?? value.currentRelease?.title ?? "",
            body: value.draft?.body ?? value.currentRelease?.body ?? "",
            serverLockVersion: value.draft?.lockVersion ?? null,
            dirty: false
          }
        };
      });
    } catch {
      if (generation === localeGeneration.current) setError("当前语言文档读取失败；不会使用其他语言替代。");
    }
  }, [locale, selectedId]);

  const loadHistory = useCallback(async (page: number) => {
    if (!selectedId) return;
    const generation = ++historyGeneration.current;
    try {
      const value = await adminSystemSettingsApi.listLegalReleases(selectedId, locale, page, 10);
      if (generation !== historyGeneration.current) return;
      setHistory(value);
      setHistoryPage(value.page);
    } catch {
      if (generation === historyGeneration.current) setHistory(null);
    }
  }, [locale, selectedId]);

  useEffect(() => { void loadLocale(); void loadHistory(1); }, [loadLocale, selectedId, locale]);

  const updateEditor = (changes: Partial<EditorDraft>) => {
    if (!editorKey) return;
    setDrafts((current) => ({ ...current, [editorKey]: { ...(current[editorKey] ?? { title: "", body: "", serverLockVersion: null, dirty: false }), ...changes, dirty: true } }));
    setNotice("");
  };

  const saveDraft = async () => {
    if (!selectedId || !editor || !editor.title.trim() || !editor.body.trim()) return;
    setError("");
    try {
      const saved = await adminSystemSettingsApi.saveLegalDraft(selectedId, locale, {
        expectedLockVersion: editor.serverLockVersion,
        title: editor.title,
        body: editor.body
      });
      setDrafts((current) => ({ ...current, [editorKey]: { title: saved.title, body: saved.body, serverLockVersion: saved.lockVersion, dirty: false } }));
      setLocaleStates((current) => ({ ...current, [editorKey]: { ...(current[editorKey] as LegalDocumentLocaleState), draft: saved } }));
      setNotice("草稿已保存，尚未发布。");
    } catch (caught) {
      setError(caught instanceof ApiClientError && caught.status === 409 ? "版本冲突；当前语言草稿已保留。" : "草稿保存失败，请重试。");
    }
  };

  const publish = async () => {
    if (!selectedId || !editor || editor.dirty || !editor.serverLockVersion) return;
    const timestamp = new Date(publishedAt);
    if (Number.isNaN(timestamp.getTime())) { setError("请输入有效的发布日期。"); return; }
    setError("");
    try {
      await adminSystemSettingsApi.publishLegalDraft(selectedId, locale, {
        expectedDraftLockVersion: editor.serverLockVersion,
        publishedAt: timestamp.toISOString()
      });
      setNotice("当前语言的新版本已发布。");
      await Promise.all([loadLocale(), loadHistory(1)]);
    } catch (caught) {
      setError(caught instanceof ApiClientError && caught.status === 409 ? "发布版本冲突；草稿未被覆盖。" : "发布失败，请重试。");
    }
  };

  const saveMetadata = async () => {
    if (!selected || !metadataDirty || !isSafeInternalPath(metadata.internalPath)) return;
    try {
      const updated = await adminSystemSettingsApi.updateLegalDocument(selected.publicId, {
        expectedLockVersion: selected.lockVersion,
        name: metadata.name,
        internalPath: metadata.internalPath,
        displayLocations: metadata.displayLocations.split(",").map((item) => item.trim()).filter(Boolean),
        isEnabled: metadata.isEnabled
      });
      setNotice("文档显示设置已保存。");
      await loadCatalog(catalogPage, updated.publicId);
    } catch (caught) {
      setError(caught instanceof ApiClientError && caught.status === 409 ? "文档设置版本冲突；修改已保留。" : "文档设置保存失败。");
    }
  };

  const createDocument = async () => {
    if (!createDraft.slug || !createDraft.name || !isSafeInternalPath(createDraft.internalPath)) return;
    try {
      const created = await adminSystemSettingsApi.createLegalDocument({
        ...createDraft,
        displayLocations: createDraft.displayLocations.split(",").map((item) => item.trim()).filter(Boolean)
      });
      setShowCreate(false);
      setCreateDraft({ slug: "", name: "", internalPath: "/", displayLocations: "", isEnabled: false });
      await loadCatalog(1, created.publicId);
    } catch {
      setError("新增文档失败，请检查 slug 和站内链接。");
    }
  };

  if (loading && !catalog) return <p className="rounded-xl bg-paper p-5 text-sm font-bold text-ink/50">正在读取政策文档…</p>;
  if (!catalog) return <div className="rounded-xl bg-coral/10 p-5"><p className="font-bold text-coral">{error}</p><Button className="mt-3" onClick={() => void loadCatalog(1)}>重试</Button></div>;

  return (
    <div className="grid gap-5 xl:grid-cols-[260px,minmax(0,1fr)]">
      <aside className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="font-black">政策与协议</h2><PermissionGate permission="backoffice:legal-documents:write"><Button onClick={() => setShowCreate((value) => !value)} size="sm" variant="secondary">新增</Button></PermissionGate></div>
        {showCreate ? <div className="space-y-2 rounded-xl border border-line bg-paper p-3">
          <input aria-label="文档 slug" className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm" onChange={(event) => setCreateDraft((current) => ({ ...current, slug: event.target.value }))} placeholder="document-slug" value={createDraft.slug} />
          <input aria-label="文档名称" className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm" onChange={(event) => setCreateDraft((current) => ({ ...current, name: event.target.value }))} placeholder="文档名称" value={createDraft.name} />
          <input aria-label="显示链接" className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm" onChange={(event) => setCreateDraft((current) => ({ ...current, internalPath: event.target.value }))} placeholder="/legal/page" value={createDraft.internalPath} />
          <input aria-label="显示位置" className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm" onChange={(event) => setCreateDraft((current) => ({ ...current, displayLocations: event.target.value }))} placeholder="settings, registration" value={createDraft.displayLocations} />
          <label className="flex items-center gap-2 text-sm font-bold"><AdminToggleSwitch ariaLabel="创建后显示链接" checked={createDraft.isEnabled} disabled={!canWrite} onChange={(value) => setCreateDraft((current) => ({ ...current, isEnabled: value }))} />创建后显示链接</label>
          <Button disabled={!canWrite || !isSafeInternalPath(createDraft.internalPath)} onClick={() => void createDocument()} size="sm">创建文档</Button>
        </div> : null}
        <div className="space-y-2">
          {catalog.list.map((document) => <button className={`w-full rounded-xl border p-3 text-left ${selectedId === document.publicId ? "border-ink bg-ink text-white" : "border-line bg-paper"}`} key={document.publicId} onClick={() => setSelectedId(document.publicId)} type="button"><span className="flex items-center justify-between gap-2"><strong>{document.name}</strong>{!document.isEnabled ? <Badge tone="neutral">未启用</Badge> : null}</span><span className="mt-1 block text-xs opacity-60">{document.slug}</span></button>)}
        </div>
        <div className="flex items-center justify-between text-xs font-bold"><Button disabled={catalog.page <= 1} onClick={() => void loadCatalog(catalog.page - 1)} size="sm" variant="ghost">上一页</Button><span>{catalog.page} / {Math.max(1, Math.ceil(catalog.total / catalog.page_size))}</span><Button disabled={catalog.page * catalog.page_size >= catalog.total} onClick={() => void loadCatalog(catalog.page + 1)} size="sm" variant="ghost">下一页</Button></div>
      </aside>

      {selected ? <div className="min-w-0 space-y-5">
        <section className="rounded-2xl border border-line bg-paper p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm font-bold">文档名称<input className="mt-2 h-11 w-full rounded-lg border border-line bg-white px-3" disabled={!canWrite} onChange={(event) => setMetadata((current) => ({ ...current, name: event.target.value }))} value={metadata.name} /></label>
            <label className="text-sm font-bold">相关页面链接<input aria-invalid={!isSafeInternalPath(metadata.internalPath)} className="mt-2 h-11 w-full rounded-lg border border-line bg-white px-3" disabled={!canWrite} onChange={(event) => setMetadata((current) => ({ ...current, internalPath: event.target.value }))} value={metadata.internalPath} /></label>
            <label className="text-sm font-bold md:col-span-2">显示位置（逗号分隔）<input className="mt-2 h-11 w-full rounded-lg border border-line bg-white px-3" disabled={!canWrite} onChange={(event) => setMetadata((current) => ({ ...current, displayLocations: event.target.value }))} value={metadata.displayLocations} /></label>
          </div>
          {!isSafeInternalPath(metadata.internalPath) ? <p className="mt-2 text-sm font-bold text-coral">必须填写同站点内以 / 开头的路径。</p> : null}
          <div className="mt-3 flex flex-wrap items-center gap-3"><AdminToggleSwitch ariaLabel="显示此文档链接" checked={metadata.isEnabled} disabled={!canWrite} onChange={(value) => setMetadata((current) => ({ ...current, isEnabled: value }))} /><span className="text-sm font-bold">显示此文档链接</span>{isSafeInternalPath(selected.internalPath) ? <Link className="text-sm font-black text-moss underline" to={selected.internalPath}>打开相关页面</Link> : null}<PermissionGate permission="backoffice:legal-documents:write"><Button disabled={!metadataDirty || !isSafeInternalPath(metadata.internalPath)} onClick={() => void saveMetadata()} size="sm" variant="secondary">保存显示设置</Button></PermissionGate></div>
        </section>

        <div className="flex flex-wrap gap-2" role="tablist" aria-label="文档语言">
          {legalDocumentLocales.map((item) => <button aria-selected={locale === item} className={`rounded-full border px-4 py-2 text-sm font-black ${locale === item ? "border-ink bg-ink text-white" : "border-line bg-white"}`} key={item} onClick={() => setLocale(item)} role="tab" type="button">{localeLabels[item]}{drafts[`${selected.publicId}:${item}`]?.dirty ? " •" : ""}</button>)}
        </div>

        {editor ? <>
          <section className="space-y-3 rounded-2xl border border-line bg-white">
            <input aria-label="文档标题" className="h-12 w-full border-b border-line px-4 text-lg font-black outline-none" disabled={!canWrite} onChange={(event) => updateEditor({ title: event.target.value })} value={editor.title} />
            <textarea aria-label="文档正文" className="min-h-[360px] w-full resize-y px-4 pb-4 text-sm leading-7 outline-none" disabled={!canWrite} onChange={(event) => updateEditor({ body: event.target.value })} value={editor.body} />
          </section>
          <div className="flex flex-wrap items-end gap-3">
            <PermissionGate permission="backoffice:legal-documents:write"><Button disabled={!editor.dirty || !editor.title.trim() || !editor.body.trim()} onClick={() => void saveDraft()}>保存当前语言草稿</Button></PermissionGate>
            <label className="text-sm font-bold">版本发布日期<input className="mt-1 block h-10 rounded-lg border border-line px-3" onChange={(event) => setPublishedAt(event.target.value)} type="datetime-local" value={publishedAt} /></label>
            <PermissionGate permission="backoffice:legal-documents:publish"><Button disabled={editor.dirty || !editor.serverLockVersion || !canPublish} onClick={() => void publish()} variant="dark">发布当前语言版本</Button></PermissionGate>
          </div>
          <div className="rounded-xl bg-paper p-4 text-sm font-semibold text-ink/60">
            {localeState?.currentRelease ? <>当前已发布：v{localeState.currentRelease.version} · {new Date(localeState.currentRelease.publishedAt).toLocaleString()}</> : <>当前语言尚无已发布版本</>}
          </div>
        </> : <p className="rounded-xl bg-paper p-5 text-sm font-bold text-ink/50">正在读取当前语言…</p>}

        {notice ? <p className="rounded-xl bg-mint/20 p-3 text-sm font-bold">{notice}</p> : null}
        {error ? <p className="rounded-xl bg-coral/10 p-3 text-sm font-bold text-coral">{error}</p> : null}
        <section className="rounded-2xl border border-line bg-paper p-4"><h3 className="font-black">版本历史</h3><div className="mt-3 space-y-2">{history?.list.map((release) => <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-3 text-sm" key={release.publicId}><strong>v{release.version} · {release.title}</strong><span className="text-ink/50">{new Date(release.publishedAt).toLocaleString()}</span></div>)}{history && history.list.length === 0 ? <p className="text-sm text-ink/50">暂无发布记录</p> : null}</div>{history ? <div className="mt-3 flex justify-end gap-2"><Button disabled={history.page <= 1} onClick={() => void loadHistory(history.page - 1)} size="sm" variant="ghost">上一页</Button><Button disabled={history.page * history.page_size >= history.total} onClick={() => void loadHistory(history.page + 1)} size="sm" variant="ghost">下一页</Button></div> : null}</section>
      </div> : <p className="rounded-xl bg-paper p-5 text-sm font-bold text-ink/50">尚无文档，可使用“新增”创建。</p>}
    </div>
  );
}
