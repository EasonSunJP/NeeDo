import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiClientError } from "../../api/httpClient";
import { useAuth } from "../../auth/AuthProvider";
import { PermissionGate } from "../../auth/PermissionGate";
import { AdminToggleSwitch } from "../../components/admin/AdminToggleSwitch";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { adminSystemSettingsApi } from "./api";
import {
  createDraftFromLegalTemplate,
  createEmptyLegalDocumentDraft,
  legalDisplayLocationOptions,
  legalDocumentTemplates,
  legalInternalRouteOptions,
  type LegalDocumentCreateDraft,
  type LegalDocumentTemplateSlug
} from "./legalDocumentGuidance";
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

function updateCodeSelection(current: string[], code: string, checked: boolean) {
  if (checked) return current.includes(code) ? current : [...current, code];
  return current.filter((item) => item !== code);
}

function InternalRouteField({
  disabled,
  id,
  onChange,
  value
}: {
  disabled: boolean;
  id: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="block text-sm font-bold" htmlFor={id}>
      关联站内页面
      <span className="mt-1 block text-xs font-medium leading-5 text-ink/50">用户查看或确认这份政策的现有 NeeDo 页面，只填写域名后以 / 开头的部分。</span>
      <input
        aria-invalid={!isSafeInternalPath(value)}
        className="mt-2 h-11 w-full rounded-lg border border-line bg-white px-3 font-mono text-sm"
        disabled={disabled}
        id={id}
        list={`${id}-options`}
        onChange={(event) => onChange(event.target.value)}
        placeholder="例如 /me/settings/privacy"
        value={value}
      />
      <datalist id={`${id}-options`}>
        {legalInternalRouteOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </datalist>
      <span className="mt-2 block rounded-lg bg-mist px-3 py-2 text-xs font-medium leading-5 text-ink/60">
        <strong className="text-ink">URL 从哪里来？</strong> 从下拉建议选择 NeeDo 已有页面，或向开发人员确认路由。例如用户访问地址由“当前 NeeDo 域名 + <code>/me/settings/privacy</code>”组成，请不要粘贴 <code>https://</code> 开头的外部网址。
      </span>
    </label>
  );
}

function DisplayLocationPicker({
  disabled,
  onChange,
  value
}: {
  disabled: boolean;
  onChange: (value: string[]) => void;
  value: string[];
}) {
  const knownCodes = new Set(legalDisplayLocationOptions.map((option) => option.value));
  const unknownCodes = value.filter((code) => !knownCodes.has(code));
  return (
    <fieldset className="md:col-span-2">
      <legend className="text-sm font-bold">用户会在哪里看到</legend>
      <p className="mt-1 text-xs font-medium leading-5 text-ink/50">可多选。这里决定政策链接或确认提示出现在哪些业务场景，不是页面 URL。</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {legalDisplayLocationOptions.map((option) => {
          const checked = value.includes(option.value);
          return (
            <label className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition ${checked ? "border-moss bg-mint/20" : "border-line bg-white"}`} key={option.value}>
              <input
                checked={checked}
                className="mt-1 h-4 w-4 accent-[color:var(--color-moss)]"
                disabled={disabled}
                onChange={(event) => onChange(updateCodeSelection(value, option.value, event.target.checked))}
                type="checkbox"
              />
              <span><strong className="block text-sm">{option.label}</strong><span className="mt-1 block text-xs leading-5 text-ink/50">{option.description}</span></span>
            </label>
          );
        })}
        {unknownCodes.map((code) => (
          <label className="flex cursor-pointer gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3" key={code}>
            <input checked className="mt-1 h-4 w-4" disabled={disabled} onChange={(event) => onChange(updateCodeSelection(value, code, event.target.checked))} type="checkbox" />
            <span><strong className="block text-sm">保留现有位置</strong><span className="mt-1 block break-all font-mono text-xs text-ink/60">{code}</span></span>
          </label>
        ))}
      </div>
    </fieldset>
  );
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
  const [createTemplateSlug, setCreateTemplateSlug] = useState<LegalDocumentTemplateSlug | "">("");
  const [createDraft, setCreateDraft] = useState<LegalDocumentCreateDraft>(createEmptyLegalDocumentDraft);
  const [metadata, setMetadata] = useState({ name: "", internalPath: "/", displayLocations: [] as string[], isEnabled: false });
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
    JSON.stringify(metadata.displayLocations) !== JSON.stringify(selected.displayLocations) ||
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
    setMetadata({ name: selected.name, internalPath: selected.internalPath, displayLocations: [...selected.displayLocations], isEnabled: selected.isEnabled });
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
        displayLocations: metadata.displayLocations,
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
        ...createDraft
      });
      setShowCreate(false);
      setCreateTemplateSlug("");
      setCreateDraft(createEmptyLegalDocumentDraft());
      await loadCatalog(1, created.publicId);
    } catch {
      setError("新增文档失败，请检查 slug 和站内链接。");
    }
  };

  if (loading && !catalog) return <p className="rounded-xl bg-paper p-5 text-sm font-bold text-ink/50">正在读取政策文档…</p>;
  if (!catalog) return <div className="rounded-xl bg-coral/10 p-5"><p className="font-bold text-coral">{error}</p><Button className="mt-3" onClick={() => void loadCatalog(1)}>重试</Button></div>;

  const catalogSlugs = new Set(catalog.list.map((document) => document.slug));
  const availableTemplates = legalDocumentTemplates.filter((template) => !catalogSlugs.has(template.slug));

  return (
    <div className="space-y-5">
      <section aria-label="政策发布流程示意图" className="overflow-hidden rounded-2xl border border-line bg-paper p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-xs font-black uppercase tracking-[0.18em] text-moss">操作说明</p><h2 className="mt-1 text-xl font-black">一张图看懂：从建档到用户可见</h2></div>
          <p className="max-w-xl text-xs font-semibold leading-6 text-ink/50">“保存草稿”不会让用户看到内容；只有发布当前语言版本并开启链接后，该语言的正式内容才会生效。</p>
        </div>
        <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["01", "1. 选择政策类型", "优先使用系统推荐类型，自动带出名称与用途。"],
            ["02", "2. 确认用户入口", "从现有 NeeDo 页面中选择，不粘贴外部网址。"],
            ["03", "3. 完善各语言", "五种语言分别保存，彼此不会覆盖。"],
            ["04", "4. 保存并发布", "先保存草稿，再选择发布日期发布正式版本。"]
          ].map(([number, title, description]) => (
            <div className="relative rounded-xl border border-line bg-white p-4" key={number}>
              <span className="font-mono text-xs font-black text-moss">{number}</span><strong className="mt-2 block text-sm">{title}</strong><p className="mt-2 text-xs font-medium leading-5 text-ink/50">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {showCreate ? <section className="rounded-2xl border-2 border-moss/40 bg-mint/10 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-black">新增政策与协议</h2><p className="mt-1 text-sm font-medium text-ink/55">先选推荐类型，系统会填写稳定标识、关联页面和建议展示位置。创建后再到右侧编辑各语言正文。</p></div><Button onClick={() => setShowCreate(false)} size="sm" variant="ghost">关闭</Button></div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-bold" htmlFor="legal-template">选择推荐类型<span className="mt-1 block text-xs font-medium leading-5 text-ink/50">列表中只显示当前目录尚未创建的标准文档；也可以手动填写自定义文档。</span><select className="mt-2 h-11 w-full rounded-lg border border-line bg-white px-3" id="legal-template" onChange={(event) => {
            const slug = event.target.value as LegalDocumentTemplateSlug | "";
            setCreateTemplateSlug(slug);
            setCreateDraft(slug ? createDraftFromLegalTemplate(slug) : createEmptyLegalDocumentDraft());
          }} value={createTemplateSlug}><option value="">自定义 / 手动填写</option>{availableTemplates.map((template) => <option key={template.slug} value={template.slug}>{template.label} — {template.purpose}</option>)}</select></label>
          <label className="block text-sm font-bold" htmlFor="legal-name">文档名称<span className="mt-1 block text-xs font-medium leading-5 text-ink/50">后台目录使用的名称；用户看到的标题在下方各语言编辑器中填写。</span><input className="mt-2 h-11 w-full rounded-lg border border-line bg-white px-3" id="legal-name" onChange={(event) => setCreateDraft((current) => ({ ...current, name: event.target.value }))} placeholder="例如 NeeDo Cancellation and Refund Policy" value={createDraft.name} /></label>
          <label className="block text-sm font-bold" htmlFor="legal-slug">稳定标识（slug）<span className="mt-1 block text-xs font-medium leading-5 text-ink/50">API 使用的永久英文标识，只用小写字母、数字和连字符；创建后不随翻译改变。</span><input className="mt-2 h-11 w-full rounded-lg border border-line bg-white px-3 font-mono text-sm" id="legal-slug" onChange={(event) => setCreateDraft((current) => ({ ...current, slug: event.target.value }))} placeholder="例如 cancellation-refund-policy" value={createDraft.slug} /></label>
          <InternalRouteField disabled={!canWrite} id="legal-create-route" onChange={(internalPath) => setCreateDraft((current) => ({ ...current, internalPath }))} value={createDraft.internalPath} />
          <DisplayLocationPicker disabled={!canWrite} onChange={(displayLocations) => setCreateDraft((current) => ({ ...current, displayLocations }))} value={createDraft.displayLocations} />
        </div>
        {!isSafeInternalPath(createDraft.internalPath) ? <p className="mt-3 text-sm font-bold text-coral">站内页面必须以单个 / 开头，不能填写完整网址、反斜杠或跳转路径。</p> : null}
        <div className="mt-5 flex flex-wrap items-center gap-3"><AdminToggleSwitch ariaLabel="创建后显示链接" checked={createDraft.isEnabled} disabled={!canWrite} onChange={(isEnabled) => setCreateDraft((current) => ({ ...current, isEnabled }))} /><span className="text-sm font-bold">创建后开启链接</span><span className="text-xs font-medium text-ink/50">建议先关闭；完成法务确认并发布正文后再开启。</span><Button disabled={!canWrite || !createDraft.slug.trim() || !createDraft.name.trim() || !isSafeInternalPath(createDraft.internalPath) || createDraft.displayLocations.length === 0} onClick={() => void createDocument()}>创建并进入内容编辑</Button></div>
      </section> : null}

      <div className="grid gap-5 xl:grid-cols-[280px,minmax(0,1fr)]">
        <aside className="space-y-3">
          <div className="flex items-center justify-between"><div><h2 className="font-black">政策与协议</h2><p className="mt-1 text-xs font-medium text-ink/50">共 {catalog.total} 份</p></div><PermissionGate permission="backoffice:legal-documents:write"><Button onClick={() => setShowCreate((value) => !value)} size="sm" variant="secondary">{showCreate ? "收起" : "新增"}</Button></PermissionGate></div>
          <div className="space-y-2">
            {catalog.list.map((document) => <button className={`w-full rounded-xl border p-3 text-left ${selectedId === document.publicId ? "border-ink bg-ink text-white" : "border-line bg-paper"}`} key={document.publicId} onClick={() => setSelectedId(document.publicId)} type="button"><span className="flex items-start justify-between gap-2"><strong className="leading-5">{document.name}</strong>{!document.isEnabled ? <Badge tone="neutral">未启用</Badge> : null}</span><span className="mt-2 block break-all font-mono text-xs opacity-60">{document.slug}</span></button>)}
          </div>
          <div className="flex items-center justify-between text-xs font-bold"><Button disabled={catalog.page <= 1} onClick={() => void loadCatalog(catalog.page - 1)} size="sm" variant="ghost">上一页</Button><span>{catalog.page} / {Math.max(1, Math.ceil(catalog.total / catalog.page_size))}</span><Button disabled={catalog.page * catalog.page_size >= catalog.total} onClick={() => void loadCatalog(catalog.page + 1)} size="sm" variant="ghost">下一页</Button></div>
        </aside>

        {selected ? <div className="min-w-0 space-y-5">
          <section className="rounded-2xl border border-line bg-paper p-5">
            <div><h2 className="text-lg font-black">显示与入口设置</h2><p className="mt-1 text-sm font-medium text-ink/50">这些设置决定链接出现在哪里；下方语言区才是用户实际阅读的标题和正文。</p></div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="text-sm font-bold">文档名称<span className="mt-1 block text-xs font-medium leading-5 text-ink/50">仅用于后台识别，不会替代每种语言的公开标题。</span><input className="mt-2 h-11 w-full rounded-lg border border-line bg-white px-3" disabled={!canWrite} onChange={(event) => setMetadata((current) => ({ ...current, name: event.target.value }))} value={metadata.name} /></label>
              <label className="text-sm font-bold">稳定标识（slug）<span className="mt-1 block text-xs font-medium leading-5 text-ink/50">由系统创建后固定，API 和发布记录都用它识别文档。</span><input className="mt-2 h-11 w-full rounded-lg border border-line bg-mist px-3 font-mono text-sm text-ink/60" disabled readOnly value={selected.slug} /></label>
              <div className="md:col-span-2"><InternalRouteField disabled={!canWrite} id="legal-metadata-route" onChange={(internalPath) => setMetadata((current) => ({ ...current, internalPath }))} value={metadata.internalPath} /></div>
              <DisplayLocationPicker disabled={!canWrite} onChange={(displayLocations) => setMetadata((current) => ({ ...current, displayLocations }))} value={metadata.displayLocations} />
            </div>
            {!isSafeInternalPath(metadata.internalPath) ? <p className="mt-3 text-sm font-bold text-coral">站内页面必须以单个 / 开头，不能填写完整网址、反斜杠或跳转路径。</p> : null}
            <div className="mt-5 flex flex-wrap items-center gap-3"><AdminToggleSwitch ariaLabel="显示此文档链接" checked={metadata.isEnabled} disabled={!canWrite} onChange={(isEnabled) => setMetadata((current) => ({ ...current, isEnabled }))} /><span className="text-sm font-bold">开启用户入口</span><span className="text-xs font-medium text-ink/50">未发布当前语言时，开启也不会生成该语言正文。</span>{isSafeInternalPath(selected.internalPath) ? <Link className="text-sm font-black text-moss underline" to={selected.internalPath}>打开关联页面</Link> : null}<PermissionGate permission="backoffice:legal-documents:write"><Button disabled={!metadataDirty || !metadata.name.trim() || !isSafeInternalPath(metadata.internalPath) || metadata.displayLocations.length === 0} onClick={() => void saveMetadata()} size="sm" variant="secondary">保存入口设置</Button></PermissionGate></div>
          </section>

          <section className="rounded-2xl border border-line bg-paper p-5"><h2 className="text-lg font-black">各语言标题与正文</h2><p className="mt-1 text-sm font-medium text-ink/50">语言分别保存和发布。切换语言不会把另一种语言的正文带过来。</p><div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="文档语言">
            {legalDocumentLocales.map((item) => <button aria-selected={locale === item} className={`rounded-full border px-4 py-2 text-sm font-black ${locale === item ? "border-ink bg-ink text-white" : "border-line bg-white"}`} key={item} onClick={() => setLocale(item)} role="tab" type="button">{localeLabels[item]}{drafts[`${selected.publicId}:${item}`]?.dirty ? " •" : ""}</button>)}
          </div></section>

          {editor ? <>
            <section className="space-y-3 overflow-hidden rounded-2xl border border-line bg-white"><label className="sr-only" htmlFor="legal-document-title">文档标题</label><input aria-label="文档标题" className="h-14 w-full border-b border-line px-4 text-lg font-black outline-none" disabled={!canWrite} id="legal-document-title" onChange={(event) => updateEditor({ title: event.target.value })} placeholder="填写当前语言向用户显示的正式标题" value={editor.title} /><label className="sr-only" htmlFor="legal-document-body">文档正文</label><textarea aria-label="文档正文" className="min-h-[420px] w-full resize-y px-4 pb-4 text-sm leading-7 outline-none" disabled={!canWrite} id="legal-document-body" onChange={(event) => updateEditor({ body: event.target.value })} placeholder="填写经过法务与运营确认的当前语言正文" value={editor.body} /></section>
            <div className="flex flex-wrap items-end gap-3"><PermissionGate permission="backoffice:legal-documents:write"><Button disabled={!editor.dirty || !editor.title.trim() || !editor.body.trim()} onClick={() => void saveDraft()}>保存当前语言草稿</Button></PermissionGate><label className="text-sm font-bold">版本发布日期<span className="mt-1 block text-xs font-medium text-ink/50">可立即发布，也可设定未来生效时间。</span><input className="mt-1 block h-10 rounded-lg border border-line px-3" onChange={(event) => setPublishedAt(event.target.value)} type="datetime-local" value={publishedAt} /></label><PermissionGate permission="backoffice:legal-documents:publish"><Button disabled={editor.dirty || !editor.serverLockVersion || !canPublish} onClick={() => void publish()} variant="dark">发布当前语言版本</Button></PermissionGate></div>
            <div className="rounded-xl bg-paper p-4 text-sm font-semibold text-ink/60">{localeState?.currentRelease ? <>当前已发布：v{localeState.currentRelease.version} · {new Date(localeState.currentRelease.publishedAt).toLocaleString()}</> : <>当前语言尚无已发布版本</>}</div>
          </> : <p className="rounded-xl bg-paper p-5 text-sm font-bold text-ink/50">正在读取当前语言…</p>}

          {notice ? <p className="rounded-xl bg-mint/20 p-3 text-sm font-bold">{notice}</p> : null}
          {error ? <p className="rounded-xl bg-coral/10 p-3 text-sm font-bold text-coral">{error}</p> : null}
          <section className="rounded-2xl border border-line bg-paper p-4"><h3 className="font-black">版本历史</h3><div className="mt-3 space-y-2">{history?.list.map((release) => <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-3 text-sm" key={release.publicId}><strong>v{release.version} · {release.title}</strong><span className="text-ink/50">{new Date(release.publishedAt).toLocaleString()}</span></div>)}{history && history.list.length === 0 ? <p className="text-sm text-ink/50">暂无发布记录</p> : null}</div>{history ? <div className="mt-3 flex justify-end gap-2"><Button disabled={history.page <= 1} onClick={() => void loadHistory(history.page - 1)} size="sm" variant="ghost">上一页</Button><Button disabled={history.page * history.page_size >= history.total} onClick={() => void loadHistory(history.page + 1)} size="sm" variant="ghost">下一页</Button></div> : null}</section>
        </div> : <p className="rounded-xl bg-paper p-5 text-sm font-bold text-ink/50">尚无文档，可使用“新增”创建。</p>}
      </div>
    </div>
  );
}
