import { useEffect, useMemo, useState } from "react";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { AdminToggleSwitch } from "../../components/admin/AdminToggleSwitch";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Drawer } from "../../components/ui/Drawer";
import { cn } from "../../lib/utils";
import {
  apiDocItems,
  countVisibleApiDocs,
  getVisibleApiDocItems,
  operationDocSections,
  readApiDocItems,
  readApiDocVisibility,
  writeApiDocItems,
  writeApiDocVisibility,
  type AdminDocsMode,
  type AdminDocsSurface,
  type ApiDocItem,
  type ApiDocMethod,
  type ApiDocVisibilityTarget
} from "./model";

const surfaceLabels: Record<AdminDocsSurface, string> = {
  ops: "产运后台",
  merchant: "商户后台",
  afirieito: "联盟营销（Afirieito）后台"
};

const targetLabels: Record<ApiDocVisibilityTarget, string> = {
  merchant: "商户后台",
  afirieito: "联盟营销后台"
};

const targetDescriptions: Record<ApiDocVisibilityTarget, string> = {
  merchant: "给门店经营、调度、财务和店铺配置人员查看。",
  afirieito: "给 NDA 管理后台、推广计划、链接素材和返佣结算人员查看。"
};
const apiDocMethodOptions: ApiDocMethod["method"][] = ["GET", "POST", "PATCH", "DELETE"];
const adminDocsFieldClassName = "mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold text-ink outline-none transition focus:border-moss";
const adminDocsTextareaClassName = "mt-1 min-h-24 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm font-semibold leading-6 text-ink outline-none transition focus:border-moss";

type ApiDocEditDraft = {
  auth: string;
  fieldsText: string;
  group: string;
  id: string;
  methods: ApiDocMethod[];
  summary: string;
  title: string;
};

const docsRoutes: Record<AdminDocsSurface, Record<AdminDocsMode, string>> = {
  ops: {
    operation: "/admin/docs",
    api: "/admin/docs/api"
  },
  merchant: {
    operation: "/merchant-admin/docs",
    api: "/merchant-admin/docs/api"
  },
  afirieito: {
    operation: "/NDA-admin/operation-docs",
    api: "/NDA-admin/api-docs"
  }
};

function methodClassName(method: ApiDocItem["methods"][number]["method"]) {
  if (method === "GET") {
    return "bg-sky/20 text-[#245a80]";
  }

  if (method === "POST") {
    return "bg-mint/25 text-[#2f6846]";
  }

  if (method === "PATCH") {
    return "bg-lemon/25 text-[#795b00]";
  }

  return "bg-coral/15 text-[#a63f32]";
}

function createApiDocDraft(item: ApiDocItem): ApiDocEditDraft {
  return {
    auth: item.auth,
    fieldsText: item.fields.join("\n"),
    group: item.group,
    id: item.id,
    methods: item.methods.map((method) => ({ ...method })),
    summary: item.summary,
    title: item.title
  };
}

function parseFieldList(value: string) {
  return value
    .split(/[\n,，]/)
    .map((field) => field.trim())
    .filter(Boolean);
}

function draftToApiDocItem(draft: ApiDocEditDraft): ApiDocItem {
  const methods = draft.methods
    .map((method) => ({
      method: method.method,
      path: method.path.trim(),
      purpose: method.purpose.trim()
    }))
    .filter((method) => method.path && method.purpose);

  return {
    id: draft.id,
    title: draft.title.trim(),
    group: draft.group.trim(),
    summary: draft.summary.trim(),
    methods,
    auth: draft.auth.trim(),
    fields: parseFieldList(draft.fieldsText)
  };
}

function getDocsDescription(surface: AdminDocsSurface, mode: AdminDocsMode) {
  if (mode === "operation") {
    return "操作文档在产运后台、商户后台、联盟营销（Afirieito）后台保持同一份内容，确保流程、权限、公告、结算和风控口径一致。";
  }

  if (surface === "ops") {
    return "产运后台默认显示全部 API 文档，并在这里控制哪些 API 分类开放给商户后台和联盟营销后台查看。";
  }

  return `${surfaceLabels[surface]}只显示产运后台已开启的 API 文档分类。`;
}

function DocsModeTabs({ mode, surface }: { mode: AdminDocsMode; surface: AdminDocsSurface }) {
  return (
    <div className="flex flex-wrap gap-2">
      {([
        ["operation", "操作文档"],
        ["api", "API 文档"]
      ] as Array<[AdminDocsMode, string]>).map(([key, label]) => (
        <Button key={key} size="sm" to={docsRoutes[surface][key]} variant={mode === key ? "dark" : "secondary"}>
          {label}
        </Button>
      ))}
    </div>
  );
}

function OperationDocsContent() {
  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-3">
        {[
          ["后台一致", "3 个后台", "同一份操作文档内容"],
          ["流程覆盖", `${operationDocSections.length} 组`, "日常、权限、公告、结算"],
          ["复核口径", "统一", "状态、责任人、处理时间"]
        ].map(([title, value, caption]) => (
          <article className="rounded-lg border border-line bg-white p-4 shadow-panel" key={title}>
            <p className="text-sm font-bold text-ink/45">{title}</p>
            <strong className="mt-2 block text-2xl font-black">{value}</strong>
            <p className="mt-2 text-xs font-semibold text-ink/50">{caption}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {operationDocSections.map((section) => (
          <article className="rounded-lg border border-line bg-white p-4 shadow-panel" key={section.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[0.14em] text-moss">Operation Doc</p>
                <h2 className="mt-1 text-lg font-black">{section.title}</h2>
              </div>
              <Badge tone="blue">{section.owner}</Badge>
            </div>
            <p className="mt-3 text-sm font-semibold leading-6 text-ink/60">{section.summary}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-line bg-paper p-3">
                <h3 className="text-sm font-black">操作顺序</h3>
                <ol className="mt-3 space-y-2 text-sm font-semibold leading-6 text-ink/65">
                  {section.steps.map((step, index) => (
                    <li className="grid grid-cols-[24px_1fr] gap-2" key={step}>
                      <span className="grid h-6 w-6 place-items-center rounded-md bg-ink text-[11px] font-black text-white">{index + 1}</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="rounded-lg border border-line bg-paper p-3">
                <h3 className="text-sm font-black">完成检查</h3>
                <div className="mt-3 space-y-2">
                  {section.checks.map((check) => (
                    <div className="flex items-start gap-2 text-sm font-semibold leading-6 text-ink/65" key={check}>
                      <span className="mt-1 grid h-4 w-4 shrink-0 place-items-center rounded bg-mint/30 text-[10px] font-black text-moss">✓</span>
                      <span>{check}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function ApiDocCard({
  item,
  onEdit,
  onToggle,
  surface,
  visibility
}: {
  item: ApiDocItem;
  onEdit?: (item: ApiDocItem) => void;
  onToggle?: (itemId: string, target: ApiDocVisibilityTarget, checked: boolean) => void;
  surface: AdminDocsSurface;
  visibility: ReturnType<typeof readApiDocVisibility>;
}) {
  return (
    <article className="rounded-lg border border-line bg-white p-4 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{item.group}</Badge>
            {surface === "ops" ? <Badge tone="dark">产运后台全量可见</Badge> : <Badge tone="blue">产运后台已开启</Badge>}
          </div>
          <h2 className="mt-3 text-lg font-black">{item.title}</h2>
        </div>
        {surface === "ops" ? (
          <div className="grid gap-2">
            {(["merchant", "afirieito"] as ApiDocVisibilityTarget[]).map((target) => (
              <div className="flex items-center justify-end gap-2 rounded-lg border border-line bg-paper px-3 py-2" key={target}>
                <span className="text-xs font-black text-ink/60">{targetLabels[target]}</span>
                <span className={cn("text-xs font-black", visibility[item.id]?.[target] ? "text-moss" : "text-ink/40")}>
                  {visibility[item.id]?.[target] ? "显示" : "隐藏"}
                </span>
                <AdminToggleSwitch
                  ariaLabel={`${item.title}${targetLabels[target]}${visibility[item.id]?.[target] ? "隐藏" : "显示"}`}
                  checked={visibility[item.id]?.[target] ?? false}
                  onChange={(checked) => onToggle?.(item.id, target, checked)}
                />
              </div>
            ))}
            <Button onClick={() => onEdit?.(item)} size="sm" type="button" variant="secondary">
              编辑接口
            </Button>
          </div>
        ) : null}
      </div>
      <p className="mt-3 text-sm font-semibold leading-6 text-ink/60">{item.summary}</p>

      <div className="mt-4 space-y-2">
        {item.methods.map((method) => (
          <div className="grid gap-2 rounded-lg border border-line bg-paper p-3 md:grid-cols-[88px_1fr] md:items-center" key={`${method.method}-${method.path}`}>
            <span className={cn("inline-flex h-8 w-fit items-center rounded-md px-2 text-xs font-black", methodClassName(method.method))}>{method.method}</span>
            <div className="min-w-0">
              <code className="block break-all rounded-md bg-white px-2 py-1 text-xs font-bold text-ink">{method.path}</code>
              <p className="mt-1 text-xs font-semibold text-ink/50">{method.purpose}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-line bg-paper p-3">
          <h3 className="text-sm font-black">授权口径</h3>
          <p className="mt-2 text-sm font-semibold leading-6 text-ink/60">{item.auth}</p>
        </div>
        <div className="rounded-lg border border-line bg-paper p-3">
          <h3 className="text-sm font-black">关键字段</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {item.fields.map((field) => (
              <code className="rounded-md bg-white px-2 py-1 text-xs font-bold text-ink/65" key={field}>{field}</code>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

function ApiDocEditorDrawer({
  draft,
  onChange,
  onClose,
  onReset,
  onSave
}: {
  draft: ApiDocEditDraft | null;
  onChange: (draft: ApiDocEditDraft) => void;
  onClose: () => void;
  onReset: () => void;
  onSave: () => void;
}) {
  const [error, setError] = useState("");
  const updateDraft = <Key extends keyof ApiDocEditDraft>(key: Key, value: ApiDocEditDraft[Key]) => {
    if (!draft) {
      return;
    }

    setError("");
    onChange({ ...draft, [key]: value });
  };
  const updateMethod = <Key extends keyof ApiDocMethod>(index: number, key: Key, value: ApiDocMethod[Key]) => {
    if (!draft) {
      return;
    }

    setError("");
    onChange({
      ...draft,
      methods: draft.methods.map((method, methodIndex) => (methodIndex === index ? { ...method, [key]: value } : method))
    });
  };
  const addMethod = () => {
    if (!draft) {
      return;
    }

    setError("");
    onChange({
      ...draft,
      methods: [...draft.methods, { method: "GET", path: "/api/", purpose: "填写接口用途" }]
    });
  };
  const removeMethod = (index: number) => {
    if (!draft || draft.methods.length <= 1) {
      return;
    }

    setError("");
    onChange({
      ...draft,
      methods: draft.methods.filter((_, methodIndex) => methodIndex !== index)
    });
  };
  const save = () => {
    if (!draft) {
      return;
    }

    const item = draftToApiDocItem(draft);

    if (!item.title || !item.group || !item.summary || !item.auth) {
      setError("请补全标题、分组、说明和授权口径。");
      return;
    }

    if (item.methods.length === 0) {
      setError("至少保留一个完整的接口方法、路径和用途。");
      return;
    }

    if (item.fields.length === 0) {
      setError("至少填写一个关键字段。");
      return;
    }

    setError("");
    onSave();
  };

  return (
    <Drawer
      defaultWidth={820}
      maxWidth={980}
      onClose={onClose}
      open={Boolean(draft)}
      title="编辑 API 接口"
      widthStorageKey="needo.admin-docs.api-editor.width"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button onClick={onReset} type="button" variant="secondary">
            恢复默认
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onClose} type="button" variant="secondary">
              取消
            </Button>
            <Button onClick={save} type="button">
              保存接口
            </Button>
          </div>
        </div>
      }
    >
      {draft ? (
        <div className="space-y-5">
          {error ? <div className="rounded-lg border border-coral/30 bg-coral/10 px-4 py-3 text-sm font-bold text-[#a63f32]">{error}</div> : null}

          <section className="rounded-lg border border-line bg-paper p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm font-bold text-ink/70">
                API 分类标题
                <input className={adminDocsFieldClassName} onChange={(event) => updateDraft("title", event.target.value)} value={draft.title} />
              </label>
              <label className="text-sm font-bold text-ink/70">
                分组
                <input className={adminDocsFieldClassName} onChange={(event) => updateDraft("group", event.target.value)} value={draft.group} />
              </label>
            </div>
            <label className="mt-3 block text-sm font-bold text-ink/70">
              接口说明
              <textarea className={adminDocsTextareaClassName} onChange={(event) => updateDraft("summary", event.target.value)} value={draft.summary} />
            </label>
            <label className="mt-3 block text-sm font-bold text-ink/70">
              授权口径
              <textarea className={adminDocsTextareaClassName} onChange={(event) => updateDraft("auth", event.target.value)} value={draft.auth} />
            </label>
            <label className="mt-3 block text-sm font-bold text-ink/70">
              关键字段
              <textarea className={adminDocsTextareaClassName} onChange={(event) => updateDraft("fieldsText", event.target.value)} value={draft.fieldsText} />
              <span className="mt-1 block text-xs font-semibold text-ink/45">每行一个字段，也可以用逗号分隔。</span>
            </label>
          </section>

          <section className="rounded-lg border border-line bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-black">接口方法</h3>
                <p className="mt-1 text-xs font-semibold text-ink/45">编辑 method、path 和用途。商户后台和联盟营销后台会读取保存后的内容。</p>
              </div>
              <Button onClick={addMethod} size="sm" type="button" variant="secondary">
                添加接口
              </Button>
            </div>
            <div className="mt-4 space-y-3">
              {draft.methods.map((method, index) => (
                <div className="rounded-lg border border-line bg-paper p-3" key={`${method.method}-${index}`}>
                  <div className="grid gap-3 md:grid-cols-[120px_1fr_auto]">
                    <label className="text-xs font-black text-ink/45">
                      Method
                      <select className={adminDocsFieldClassName} onChange={(event) => updateMethod(index, "method", event.target.value as ApiDocMethod["method"])} value={method.method}>
                        {apiDocMethodOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-black text-ink/45">
                      Path
                      <input className={adminDocsFieldClassName} onChange={(event) => updateMethod(index, "path", event.target.value)} value={method.path} />
                    </label>
                    <div className="flex items-end">
                      <Button disabled={draft.methods.length <= 1} onClick={() => removeMethod(index)} size="sm" type="button" variant="secondary">
                        删除
                      </Button>
                    </div>
                  </div>
                  <label className="mt-3 block text-xs font-black text-ink/45">
                    用途
                    <input className={adminDocsFieldClassName} onChange={(event) => updateMethod(index, "purpose", event.target.value)} value={method.purpose} />
                  </label>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </Drawer>
  );
}

function ApiDocsContent({ surface }: { surface: AdminDocsSurface }) {
  const [items, setItems] = useState(readApiDocItems);
  const [visibility, setVisibility] = useState(readApiDocVisibility);
  const [editDraft, setEditDraft] = useState<ApiDocEditDraft | null>(null);
  const visibleItems = useMemo(() => getVisibleApiDocItems(surface, visibility, items), [items, surface, visibility]);

  useEffect(() => {
    writeApiDocVisibility(visibility);
  }, [visibility]);

  useEffect(() => {
    writeApiDocItems(items);
  }, [items]);

  const onToggle = (itemId: string, target: ApiDocVisibilityTarget, checked: boolean) => {
    setVisibility((current) => ({
      ...current,
      [itemId]: {
        ...current[itemId],
        [target]: checked
      }
    }));
  };
  const openEditor = (item: ApiDocItem) => {
    setEditDraft(createApiDocDraft(item));
  };
  const resetDraftToDefault = () => {
    if (!editDraft) {
      return;
    }

    const defaultItem = apiDocItems.find((item) => item.id === editDraft.id);

    if (!defaultItem) {
      return;
    }

    setEditDraft(createApiDocDraft(defaultItem));
  };
  const saveDraft = () => {
    if (!editDraft) {
      return;
    }

    const nextItem = draftToApiDocItem(editDraft);

    setItems((current) => current.map((item) => (item.id === nextItem.id ? nextItem : item)));
    setEditDraft(null);
  };

  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-3">
        <article className="rounded-lg border border-line bg-white p-4 shadow-panel">
          <p className="text-sm font-bold text-ink/45">当前后台</p>
          <strong className="mt-2 block text-2xl font-black">{surfaceLabels[surface]}</strong>
          <p className="mt-2 text-xs font-semibold text-ink/50">{surface === "ops" ? "默认显示全部 API 文档" : "仅显示已开启分类"}</p>
        </article>
        <article className="rounded-lg border border-line bg-white p-4 shadow-panel">
          <p className="text-sm font-bold text-ink/45">可见 API 分类</p>
          <strong className="mt-2 block text-2xl font-black">{visibleItems.length} / {items.length}</strong>
          <p className="mt-2 text-xs font-semibold text-ink/50">{surface === "ops" ? "产运后台全量可见" : "由产运后台控制显示"}</p>
        </article>
        <article className="rounded-lg border border-line bg-white p-4 shadow-panel">
          <p className="text-sm font-bold text-ink/45">显示规则</p>
          <strong className="mt-2 block text-2xl font-black">{surface === "ops" ? "可配置" : "只读"}</strong>
          <p className="mt-2 text-xs font-semibold text-ink/50">{surface === "ops" ? `商户 ${countVisibleApiDocs("merchant", visibility, items)} 类 / 联盟营销 ${countVisibleApiDocs("afirieito", visibility, items)} 类` : targetDescriptions[surface]}</p>
        </article>
      </section>

      {visibleItems.length > 0 ? (
        <section className="grid gap-4 xl:grid-cols-2">
          {visibleItems.map((item) => (
            <ApiDocCard item={item} key={item.id} onEdit={surface === "ops" ? openEditor : undefined} onToggle={surface === "ops" ? onToggle : undefined} surface={surface} visibility={visibility} />
          ))}
        </section>
      ) : (
        <section className="rounded-lg border border-dashed border-line bg-white p-8 text-center shadow-panel">
          <Badge tone="yellow">暂无可见 API</Badge>
          <h2 className="mt-3 text-lg font-black">当前后台还没有开启 API 文档分类</h2>
          <p className="mt-2 text-sm font-semibold text-ink/55">请在产运后台的文档中心开启对应 API 分类后再查看。</p>
        </section>
      )}
      {surface === "ops" ? (
        <ApiDocEditorDrawer
          draft={editDraft}
          onChange={setEditDraft}
          onClose={() => setEditDraft(null)}
          onReset={resetDraftToDefault}
          onSave={saveDraft}
        />
      ) : null}
    </div>
  );
}

export function AdminDocsWorkspace({ mode = "operation", surface }: { mode?: AdminDocsMode; surface: AdminDocsSurface }) {
  return (
    <ModuleShell
      actions={<DocsModeTabs mode={mode} surface={surface} />}
      description={getDocsDescription(surface, mode)}
      title="文档中心"
    >
      {mode === "operation" ? <OperationDocsContent /> : <ApiDocsContent surface={surface} />}
    </ModuleShell>
  );
}
