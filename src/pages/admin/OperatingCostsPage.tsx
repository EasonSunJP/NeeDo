import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "../../auth/AuthProvider";
import {
  platformPartnersApi,
  type OperatingCostAllocationMode,
  type OperatingCostCategory,
  type OperatingCostConfigurationInput,
  type OperatingCostDirectAssignment,
  type OperatingCostItem,
  type OperatingCostStatus,
  type Paginated,
} from "../../api/platformPartners";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";

const inputClass =
  "h-10 w-full rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink outline-none focus:border-moss";
const today = () => new Date().toISOString().slice(0, 10);
const localDateTime = () => {
  const value = new Date();
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
};
const formatJpy = (value: number) => `¥${value.toLocaleString()}`;
const errorMessage = (error: unknown) =>
  error instanceof Error && error.message
    ? error.message
    : "请求失败，请稍后重试";

type CostDraft = {
  costCode: string;
  categoryCode: OperatingCostCategory;
  name: string;
  amountJpy: string;
  periodStart: string;
  periodEnd: string;
  allocationMode: OperatingCostAllocationMode;
  directAssignments: string;
  effectiveAt: string;
  reason: string;
};

const emptyDraft = (): CostDraft => ({
  costCode: "",
  categoryCode: "personnel",
  name: "",
  amountJpy: "",
  periodStart: today(),
  periodEnd: today(),
  allocationMode: "equal_active_shops",
  directAssignments: "",
  effectiveAt: localDateTime(),
  reason: "",
});

export function parseDirectAssignments(
  value: string,
): OperatingCostDirectAssignment[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawShopPublicId, rawAmount] = line
        .split("=")
        .map((part) => part.trim());
      if (!/^shop\d{10}$/.test(rawShopPublicId ?? "") || !rawAmount)
        throw new TypeError("直接分配格式无效");
      if (rawAmount.endsWith("%")) {
        const share = Number(rawAmount.slice(0, -1));
        if (!Number.isFinite(share) || share < 0 || share > 100)
          throw new TypeError("直接分配比例无效");
        return {
          shopPublicId: rawShopPublicId,
          shareBps: Math.round(share * 100),
        };
      }
      const amountJpy = Number(rawAmount);
      if (!Number.isSafeInteger(amountJpy) || amountJpy < 0)
        throw new TypeError("直接分配金额无效");
      return { shopPublicId: rawShopPublicId, amountJpy };
    });
}

function toConfiguration(draft: CostDraft): OperatingCostConfigurationInput {
  const amountJpy = Number(draft.amountJpy);
  if (!Number.isSafeInteger(amountJpy) || amountJpy < 0)
    throw new TypeError("金额必须是非负整数");
  if (!draft.name.trim() || !draft.reason.trim())
    throw new TypeError("名称和设置理由不能为空");
  if (
    !draft.periodStart ||
    !draft.periodEnd ||
    draft.periodEnd < draft.periodStart
  )
    throw new TypeError("成本周期无效");
  return {
    categoryCode: draft.categoryCode,
    name: draft.name.trim(),
    amountJpy,
    periodStart: draft.periodStart,
    periodEnd: draft.periodEnd,
    allocationMode: draft.allocationMode,
    ...(draft.allocationMode === "direct_shops"
      ? { directAssignments: parseDirectAssignments(draft.directAssignments) }
      : {}),
    effectiveAt: new Date(draft.effectiveAt).toISOString(),
    reason: draft.reason.trim(),
  };
}

export function OperatingCostsPage() {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission("backoffice:operating-cost:write");
  const [data, setData] = useState<Paginated<OperatingCostItem> | null>(null);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<"" | OperatingCostStatus>("");
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState<CostDraft>(emptyDraft);
  const [editing, setEditing] = useState<OperatingCostItem | null>(null);
  const [commandReasons, setCommandReasons] = useState<Record<string, string>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(
        await platformPartnersApi.listOperatingCosts({
          page,
          pageSize: 20,
          keyword: keyword.trim() || undefined,
          status: status || undefined,
        }),
      );
    } catch (loadError) {
      setData(null);
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [keyword, page, status]);
  useEffect(() => {
    void load();
  }, [load]);

  const mutate = async (action: () => Promise<unknown>, success: string) => {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(success);
      await load();
      return true;
    } catch (mutationError) {
      setError(errorMessage(mutationError));
      return false;
    } finally {
      setSaving(false);
    }
  };
  const submit = async () => {
    try {
      const configuration = toConfiguration(draft);
      const succeeded = await mutate(
        () =>
          editing
            ? platformPartnersApi.updateOperatingCost(
                editing.publicId,
                configuration,
              )
            : platformPartnersApi.createOperatingCost({
                ...configuration,
                costCode: draft.costCode.trim(),
              }),
        editing ? "运营成本草稿已更新" : "运营成本草稿已创建",
      );
      if (succeeded) {
        setEditing(null);
        setDraft(emptyDraft());
      }
    } catch (validationError) {
      setError(errorMessage(validationError));
    }
  };
  const edit = (item: OperatingCostItem) => {
    setEditing(item);
    setDraft({
      costCode: item.costCode,
      categoryCode: item.categoryCode,
      name: item.name,
      amountJpy: String(item.amountJpy),
      periodStart: item.periodStart.slice(0, 10),
      periodEnd: item.periodEnd.slice(0, 10),
      allocationMode: item.allocationMode,
      directAssignments: (item.directAssignments ?? [])
        .map((row) =>
          "amountJpy" in row
            ? `${row.shopPublicId}=${row.amountJpy}`
            : `${row.shopPublicId}=${row.shareBps / 100}%`,
        )
        .join("\n"),
      effectiveAt: new Date(
        new Date(item.effectiveAt).getTime() -
          new Date(item.effectiveAt).getTimezoneOffset() * 60_000,
      )
        .toISOString()
        .slice(0, 16),
      reason: item.reason,
    });
    globalThis.scrollTo?.({ top: 0, behavior: "smooth" });
  };
  const command = (item: OperatingCostItem, kind: "publish" | "delete") => {
    const reason = commandReasons[item.publicId]?.trim();
    if (!reason) {
      setError("发布或撤回前必须填写操作理由");
      return;
    }
    void mutate(
      () =>
        kind === "publish"
          ? platformPartnersApi.publishOperatingCost(item.publicId, reason)
          : platformPartnersApi.deleteOperatingCost(item.publicId, reason),
      kind === "publish" ? "成本已发布并生成店铺分摊明细" : "成本草稿已撤回",
    );
  };
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / 20));

  return (
    <AdminLayout>
      <div>
        <ModuleShell
          title="运营成本设置"
          description="按版本配置人件费、服务器和第三方 API 成本；发布后生成店铺分摊证据并参与平台纯利润计算。"
          actions={
            <Button onClick={() => void load()} variant="secondary">
              刷新
            </Button>
          }
        >
          {canWrite ? (
            <form
              className="rounded-2xl border border-line bg-white p-5 shadow-sm"
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-black">
                  {editing
                    ? `编辑草稿 · ${editing.costCode} v${editing.version}`
                    : "新建运营成本草稿"}
                </h2>
                {editing ? (
                  <Button
                    onClick={() => {
                      setEditing(null);
                      setDraft(emptyDraft());
                    }}
                    size="sm"
                    variant="secondary"
                  >
                    取消编辑
                  </Button>
                ) : null}
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field label="成本代码">
                  <input
                    className={inputClass}
                    disabled={Boolean(editing)}
                    onChange={(event) =>
                      setDraft((value) => ({
                        ...value,
                        costCode: event.target.value,
                      }))
                    }
                    pattern="[a-z0-9][a-z0-9._-]*"
                    required
                    value={draft.costCode}
                  />
                </Field>
                <Field label="成本类型">
                  <select
                    className={inputClass}
                    onChange={(event) =>
                      setDraft((value) => ({
                        ...value,
                        categoryCode: event.target
                          .value as OperatingCostCategory,
                      }))
                    }
                    value={draft.categoryCode}
                  >
                    <option value="personnel">人件费</option>
                    <option value="server">服务器</option>
                    <option value="third_party_api">第三方 API</option>
                    <option value="other">其他</option>
                  </select>
                </Field>
                <Field label="项目名称">
                  <input
                    className={inputClass}
                    onChange={(event) =>
                      setDraft((value) => ({
                        ...value,
                        name: event.target.value,
                      }))
                    }
                    required
                    value={draft.name}
                  />
                </Field>
                <Field label="金额 JPY">
                  <input
                    className={inputClass}
                    min="0"
                    onChange={(event) =>
                      setDraft((value) => ({
                        ...value,
                        amountJpy: event.target.value,
                      }))
                    }
                    required
                    type="number"
                    value={draft.amountJpy}
                  />
                </Field>
                <Field label="周期开始">
                  <input
                    className={inputClass}
                    onChange={(event) =>
                      setDraft((value) => ({
                        ...value,
                        periodStart: event.target.value,
                      }))
                    }
                    required
                    type="date"
                    value={draft.periodStart}
                  />
                </Field>
                <Field label="周期结束">
                  <input
                    className={inputClass}
                    onChange={(event) =>
                      setDraft((value) => ({
                        ...value,
                        periodEnd: event.target.value,
                      }))
                    }
                    required
                    type="date"
                    value={draft.periodEnd}
                  />
                </Field>
                <Field label="分摊方式">
                  <select
                    className={inputClass}
                    onChange={(event) =>
                      setDraft((value) => ({
                        ...value,
                        allocationMode: event.target
                          .value as OperatingCostAllocationMode,
                      }))
                    }
                    value={draft.allocationMode}
                  >
                    <option value="equal_active_shops">
                      按活跃店铺等额分摊
                    </option>
                    <option value="platform_income_proportional">
                      按已结算平台收入比例
                    </option>
                    <option value="direct_shops">指定店铺</option>
                  </select>
                </Field>
                <Field label="生效时间">
                  <input
                    className={inputClass}
                    onChange={(event) =>
                      setDraft((value) => ({
                        ...value,
                        effectiveAt: event.target.value,
                      }))
                    }
                    required
                    type="datetime-local"
                    value={draft.effectiveAt}
                  />
                </Field>
              </div>
              {draft.allocationMode === "direct_shops" ? (
                <Field label="指定店铺分配（每行 shopID=金额，或 shopID=百分比%）">
                  <textarea
                    className="min-h-28 w-full rounded-lg border border-line p-3 font-mono text-sm"
                    onChange={(event) =>
                      setDraft((value) => ({
                        ...value,
                        directAssignments: event.target.value,
                      }))
                    }
                    placeholder={"shop0000000001=60000\nshop0000000002=40%"}
                    required
                    value={draft.directAssignments}
                  />
                </Field>
              ) : null}
              <Field label="设置理由">
                <textarea
                  className="min-h-24 w-full rounded-lg border border-line p-3 text-sm"
                  onChange={(event) =>
                    setDraft((value) => ({
                      ...value,
                      reason: event.target.value,
                    }))
                  }
                  required
                  value={draft.reason}
                />
              </Field>
              <Button disabled={saving} type="submit">
                {editing ? "保存草稿" : "创建草稿"}
              </Button>
            </form>
          ) : (
            <div className="rounded-xl bg-paper p-4 text-sm text-ink/50">
              当前账号只有读取权限。
            </div>
          )}
          <form
            className="grid gap-3 rounded-2xl border border-line bg-white p-4 md:grid-cols-[1fr_180px_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              void load();
            }}
          >
            <input
              aria-label="搜索运营成本"
              className={inputClass}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="成本代码或名称"
              value={keyword}
            />
            <select
              aria-label="发布状态"
              className={inputClass}
              onChange={(event) =>
                setStatus(event.target.value as typeof status)
              }
              value={status}
            >
              <option value="">全部状态</option>
              <option value="draft">草稿</option>
              <option value="published">已发布</option>
              <option value="archived">已归档</option>
            </select>
            <Button type="submit">检索</Button>
          </form>
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
              {error}
            </div>
          ) : null}
          {notice ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
              {notice}
            </div>
          ) : null}
          {loading ? (
            <div className="rounded-2xl border border-line bg-white p-5 text-sm text-ink/50">
              正在读取正式运营成本…
            </div>
          ) : null}
          {!loading && data ? (
            <div className="space-y-4">
              {data?.list.map((item) => (
                <article
                  className="rounded-2xl border border-line bg-white p-5 shadow-sm"
                  key={item.publicId}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-black">{item.name}</h2>
                        <Badge
                          tone={
                            item.status === "published"
                              ? "green"
                              : item.status === "draft"
                                ? "blue"
                                : "neutral"
                          }
                        >
                          {item.status}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-ink/50">
                        {item.costCode} · v{item.version} · {item.categoryCode}
                      </p>
                    </div>
                    <p className="text-2xl font-black">
                      {formatJpy(item.amountJpy)}
                    </p>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-4">
                    <Fact
                      label="成本周期"
                      value={`${item.periodStart.slice(0, 10)} ～ ${item.periodEnd.slice(0, 10)}`}
                    />
                    <Fact label="分摊方式" value={item.allocationMode} />
                    <Fact
                      label="生效时间"
                      value={new Date(item.effectiveAt).toLocaleString()}
                    />
                    <Fact
                      label="分摊店铺"
                      value={`${item.allocations.length} 家`}
                    />
                  </div>
                  <p className="mt-4 rounded-xl bg-paper p-3 text-sm">
                    {item.reason}
                  </p>
                  {item.allocations.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.allocations.map((allocation) => (
                        <span
                          className="rounded-full border border-line px-3 py-1 text-xs"
                          key={allocation.shopPublicId}
                        >
                          {allocation.shopName} ·{" "}
                          {formatJpy(allocation.amountJpy)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {item.status === "draft" && canWrite ? (
                    <div className="mt-4 grid gap-3 border-t border-line pt-4 md:grid-cols-[1fr_auto_auto]">
                      <input
                        className={inputClass}
                        onChange={(event) =>
                          setCommandReasons((value) => ({
                            ...value,
                            [item.publicId]: event.target.value,
                          }))
                        }
                        placeholder="发布或撤回理由（必填）"
                        value={commandReasons[item.publicId] ?? ""}
                      />
                      <Button
                        disabled={saving}
                        onClick={() => edit(item)}
                        variant="secondary"
                      >
                        编辑
                      </Button>
                      <div className="flex gap-2">
                        <Button
                          disabled={saving}
                          onClick={() => command(item, "publish")}
                        >
                          发布并分摊
                        </Button>
                        <Button
                          disabled={saving}
                          onClick={() => command(item, "delete")}
                          variant="danger"
                        >
                          撤回
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </article>
              ))}
              {data?.list.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-ink/50">
                  没有符合条件的运营成本项目
                </div>
              ) : null}
            </div>
          ) : null}
          {data && data.total > 0 ? (
            <div className="flex items-center justify-end gap-3">
              <Button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                size="sm"
                variant="secondary"
              >
                上一页
              </Button>
              <span className="text-sm font-bold">
                {page} / {totalPages}
              </span>
              <Button
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
                size="sm"
                variant="secondary"
              >
                下一页
              </Button>
            </div>
          ) : null}
        </ModuleShell>
      </div>
    </AdminLayout>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mt-3 block">
      <span className="mb-2 block text-xs font-black text-ink/55">{label}</span>
      {children}
    </label>
  );
}
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-paper p-3">
      <p className="text-xs font-bold text-ink/45">{label}</p>
      <p className="mt-1 break-words text-sm font-black">{value}</p>
    </div>
  );
}
