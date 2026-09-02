import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import {
  platformPartnersApi,
  type AgentCommissionRuleOverview,
  type AgentProfileListItem,
  type AgentSettlement,
  type AgentSettlementExternalDeduction,
  type AgentSettlementPreview,
  type AgentShopReferral,
  type Paginated,
  type PaymentMethod,
} from "../../api/platformPartners";
import { AdminLayout } from "../../components/admin/AdminLayout";
import { ModuleShell } from "../../components/admin/ModuleShell";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";

const inputClass =
  "h-10 w-full rounded-lg border border-line bg-white px-3 text-sm font-semibold text-ink outline-none focus:border-moss";
const cardClass = "rounded-2xl border border-line bg-white p-5 shadow-sm";
const toIso = (localValue: string) => new Date(localValue).toISOString();
const formatJpy = (value: number) => `¥${value.toLocaleString()}`;
const paymentMethodLabels: Record<PaymentMethod, string> = {
  bank_transfer: "银行转账",
  ndp: "NDP",
  other: "其他",
};
const paymentMethodLabel = (value: PaymentMethod) => paymentMethodLabels[value];
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 7)}-01`;
const currentLocalDateTime = () => {
  const value = new Date();
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
};
const errorMessage = (error: unknown) =>
  error instanceof Error && error.message
    ? error.message
    : "请求失败，请稍后重试";

export function AgentsPage() {
  const { agentPublicId } = useParams<{ agentPublicId?: string }>();
  return agentPublicId ? (
    <AgentDetailPage agentPublicId={agentPublicId} />
  ) : (
    <AgentListPage />
  );
}

function AgentListPage() {
  const [data, setData] = useState<Paginated<AgentProfileListItem> | null>(
    null,
  );
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<"" | "active" | "inactive">("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(
        await platformPartnersApi.listAgents({
          page,
          pageSize: 20,
          keyword: keyword.trim() || undefined,
          status: status || undefined,
        }),
      );
    } catch (loadError) {
      setError(errorMessage(loadError));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [keyword, page, status]);

  useEffect(() => {
    void load();
  }, [load]);
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / 20));

  return (
    <AdminLayout>
      <div>
        <ModuleShell
          title="代理商管理"
          description="管理代理商用户、介绍店铺、佣金规则与不可变结算凭证。"
          actions={
            <Button onClick={() => void load()} variant="secondary">
              刷新
            </Button>
          }
        >
          <form
            className="grid gap-3 rounded-2xl border border-line bg-white p-4 md:grid-cols-[1fr_180px_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              void load();
            }}
          >
            <input
              aria-label="搜索代理商"
              className={inputClass}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="NeeDo ID 或昵称"
              value={keyword}
            />
            <select
              aria-label="账号状态"
              className={inputClass}
              onChange={(event) =>
                setStatus(event.target.value as typeof status)
              }
              value={status}
            >
              <option value="">全部状态</option>
              <option value="active">有效</option>
              <option value="inactive">停用</option>
            </select>
            <Button type="submit">检索</Button>
          </form>
          {loading ? <Loading text="正在读取正式代理商数据…" /> : null}
          {error ? (
            <ErrorPanel error={error} retry={() => void load()} />
          ) : null}
          {!loading && !error && data?.list.length === 0 ? (
            <Empty text="尚无代理商。请先在用户详情中标记普通用户为代理商。" />
          ) : null}
          {!loading && !error && data?.list.length ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {data.list.map((agent) => (
                <AgentSummaryCard agent={agent} key={agent.publicId} />
              ))}
            </div>
          ) : null}
          {data && data.total > 0 ? (
            <Pagination page={page} totalPages={totalPages} setPage={setPage} />
          ) : null}
        </ModuleShell>
      </div>
    </AdminLayout>
  );
}

function AgentSummaryCard({ agent }: { agent: AgentProfileListItem }) {
  const { administration } = agent;
  return (
    <article className={cardClass}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {agent.user.avatarUrl ? (
            <img
              alt=""
              className="h-12 w-12 rounded-full object-cover"
              src={agent.user.avatarUrl}
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-moss/10 font-black text-moss">
              代
            </div>
          )}
          <div className="min-w-0">
            <h2 className="truncate text-lg font-black">
              {agent.user.nickname}
            </h2>
            <p className="text-xs text-ink/50">{agent.user.needoId}</p>
          </div>
        </div>
        <Badge tone={agent.user.status === "active" ? "green" : "red"}>
          {agent.user.status === "active" ? "有效" : "停用"}
        </Badge>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <SummaryFact
          label="关联店铺"
          value={`${administration.referralCount} 家`}
        />
        <SummaryFact
          label="当前佣金规则"
          value={
            administration.currentRule
              ? `固定 ${formatJpy(administration.currentRule.fixedSuccessRewardJpy)} + ${(administration.currentRule.profitShareRateBps / 100).toFixed(2)}%`
              : "未设置"
          }
        />
        <SummaryFact
          label="最近结算"
          value={
            administration.latestSettlement
              ? `${administration.latestSettlement.status === "paid" ? "已支付" : "已确认"} · ${formatJpy(administration.latestSettlement.totalAmountJpy)}`
              : "暂无"
          }
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-ink/60">
        {administration.referredShops.map((shop) => (
          <span className="rounded-full bg-paper px-3 py-1" key={shop.publicId}>
            {shop.name} · {shop.city}
          </span>
        ))}
        {administration.referralCount > administration.referredShops.length ? (
          <span>
            另有{" "}
            {administration.referralCount - administration.referredShops.length}{" "}
            家
          </span>
        ) : null}
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-ink/45">
        <span>生效 {new Date(agent.activatedAt).toLocaleString()}</span>
        <Button size="sm" to={`/admin/agents/${agent.publicId}`}>
          查看与结算
        </Button>
      </div>
    </article>
  );
}

function AgentDetailPage({ agentPublicId }: { agentPublicId: string }) {
  const { hasPermission } = useAuth();
  const canWriteAgent = hasPermission("backoffice:agent:write");
  const canWriteSettlement = hasPermission("backoffice:agent-settlement:write");
  const canPaySettlement = hasPermission("backoffice:agent-settlement:pay");
  const [referrals, setReferrals] =
    useState<Paginated<AgentShopReferral> | null>(null);
  const [rules, setRules] = useState<AgentCommissionRuleOverview | null>(null);
  const [settlements, setSettlements] =
    useState<Paginated<AgentSettlement> | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMoreRules, setLoadingMoreRules] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextReferrals, nextRules, nextSettlements] = await Promise.all([
        platformPartnersApi.listShopReferrals(agentPublicId, {
          page: 1,
          pageSize: 100,
        }),
        platformPartnersApi.getCommissionRules(agentPublicId, {
          page: 1,
          pageSize: 20,
        }),
        platformPartnersApi.listSettlements(agentPublicId, {
          page: 1,
          pageSize: 50,
        }),
      ]);
      setReferrals(nextReferrals);
      setRules(nextRules);
      setSettlements(nextSettlements);
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [agentPublicId]);

  useEffect(() => {
    void load();
  }, [load]);
  const mutation = async (action: () => Promise<unknown>, success: string) => {
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
    }
  };
  const loadMoreRules = async () => {
    if (
      !rules ||
      loadingMoreRules ||
      rules.history.list.length >= rules.history.total
    )
      return;
    setLoadingMoreRules(true);
    setError("");
    try {
      const next = await platformPartnersApi.getCommissionRules(agentPublicId, {
        page: rules.history.page + 1,
        pageSize: rules.history.page_size,
      });
      setRules((current) => {
        if (!current) return next;
        const known = new Set(
          current.history.list.map((item) => item.publicId),
        );
        return {
          ...next,
          history: {
            ...next.history,
            list: [
              ...current.history.list,
              ...next.history.list.filter((item) => !known.has(item.publicId)),
            ],
          },
        };
      });
    } catch (historyError) {
      setError(errorMessage(historyError));
    } finally {
      setLoadingMoreRules(false);
    }
  };

  return (
    <AdminLayout>
      <div>
        <ModuleShell
          title="代理商详细资料"
          description={`代理商公开编号：${agentPublicId}`}
          actions={
            <div className="flex gap-2">
              <Button to="/admin/agents" variant="secondary">
                返回列表
              </Button>
              <Button onClick={() => void load()} variant="secondary">
                刷新
              </Button>
            </div>
          }
        >
          {loading ? (
            <Loading text="正在读取代理关系、佣金规则与结算凭证…" />
          ) : null}
          {error ? (
            <ErrorPanel error={error} retry={() => void load()} />
          ) : null}
          {notice ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
              {notice}
            </div>
          ) : null}
          {!loading ? (
            <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="space-y-5">
                <ReferralPanel
                  agentPublicId={agentPublicId}
                  canWrite={canWriteAgent}
                  mutate={mutation}
                  referrals={referrals?.list ?? []}
                />
                <RulePanel
                  agentPublicId={agentPublicId}
                  canWrite={canWriteAgent}
                  loadingMore={loadingMoreRules}
                  loadMore={loadMoreRules}
                  mutate={mutation}
                  rules={rules}
                />
              </div>
              <div className="space-y-5">
                <SettlementPanel
                  agentPublicId={agentPublicId}
                  canPay={canPaySettlement}
                  canWrite={canWriteSettlement}
                  mutate={mutation}
                  referrals={referrals?.list ?? []}
                  settlements={settlements?.list ?? []}
                />
              </div>
            </div>
          ) : null}
        </ModuleShell>
      </div>
    </AdminLayout>
  );
}

function ReferralPanel({
  agentPublicId,
  canWrite,
  mutate,
  referrals,
}: {
  agentPublicId: string;
  canWrite: boolean;
  mutate: (action: () => Promise<unknown>, success: string) => Promise<boolean>;
  referrals: AgentShopReferral[];
}) {
  const [draft, setDraft] = useState({
    shopPublicId: "",
    source: "运营人工确认",
    confirmedAt: currentLocalDateTime(),
    reason: "",
  });
  const submit = () =>
    mutate(
      () =>
        platformPartnersApi.linkShop(agentPublicId, {
          ...draft,
          shopPublicId: draft.shopPublicId.trim(),
          source: draft.source.trim(),
          confirmedAt: toIso(draft.confirmedAt),
          reason: draft.reason.trim(),
        }),
      "店铺介绍关系已保存",
    );
  return (
    <section className={cardClass}>
      <SectionHeader title="介绍店铺" badge={`${referrals.length} 家`} />
      <div className="space-y-2">
        {referrals.map((row) => (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-paper p-3"
            key={row.publicId}
          >
            <div>
              <p className="font-black">{row.shop.name}</p>
              <p className="text-xs text-ink/50">
                {row.shop.publicId} · {row.shop.city}
              </p>
            </div>
            <Badge tone={row.status === "revoked" ? "red" : "green"}>
              {row.status}
            </Badge>
          </div>
        ))}
        {referrals.length === 0 ? (
          <p className="text-sm text-ink/50">尚未关联店铺</p>
        ) : null}
      </div>
      {canWrite ? (
        <form
          className="mt-4 grid gap-3 border-t border-line pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label>
            <span className="field-label">店铺公开 ID</span>
            <input
              className={inputClass}
              onChange={(event) =>
                setDraft((value) => ({
                  ...value,
                  shopPublicId: event.target.value,
                }))
              }
              placeholder="shop0000000001"
              required
              value={draft.shopPublicId}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="field-label">确认来源</span>
              <input
                className={inputClass}
                onChange={(event) =>
                  setDraft((value) => ({
                    ...value,
                    source: event.target.value,
                  }))
                }
                required
                value={draft.source}
              />
            </label>
            <label>
              <span className="field-label">确认时间</span>
              <input
                className={inputClass}
                onChange={(event) =>
                  setDraft((value) => ({
                    ...value,
                    confirmedAt: event.target.value,
                  }))
                }
                required
                type="datetime-local"
                value={draft.confirmedAt}
              />
            </label>
          </div>
          <label>
            <span className="field-label">设置理由</span>
            <textarea
              className="min-h-20 w-full rounded-lg border border-line p-3 text-sm"
              onChange={(event) =>
                setDraft((value) => ({ ...value, reason: event.target.value }))
              }
              required
              value={draft.reason}
            />
          </label>
          <Button type="submit">关联店铺</Button>
        </form>
      ) : (
        <ReadOnlyNotice />
      )}
    </section>
  );
}

function RulePanel({
  agentPublicId,
  canWrite,
  loadingMore,
  loadMore,
  mutate,
  rules,
}: {
  agentPublicId: string;
  canWrite: boolean;
  loadingMore: boolean;
  loadMore: () => Promise<void>;
  mutate: (action: () => Promise<unknown>, success: string) => Promise<boolean>;
  rules: AgentCommissionRuleOverview | null;
}) {
  const [draft, setDraft] = useState({
    fixed: "",
    rate: "",
    paymentMethod: "bank_transfer" as PaymentMethod,
    effectiveFrom: currentLocalDateTime(),
    reason: "",
  });
  const submit = () =>
    mutate(
      () =>
        platformPartnersApi.publishCommissionRule(agentPublicId, {
          fixedSuccessRewardJpy: Number(draft.fixed),
          profitShareRateBps: Math.round(Number(draft.rate) * 100),
          paymentMethod: draft.paymentMethod,
          effectiveFrom: toIso(draft.effectiveFrom),
          reason: draft.reason.trim(),
        }),
      "新佣金规则版本已发布",
    );
  return (
    <section className={cardClass}>
      <SectionHeader
        title="代理商佣金规则"
        badge={rules?.current ? `v${rules.current.version}` : "未设置"}
      />
      {rules?.current ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryFact
            label="成功奖励"
            value={formatJpy(rules.current.fixedSuccessRewardJpy)}
          />
          <SummaryFact
            label="纯利润分成"
            value={`${(rules.current.profitShareRateBps / 100).toFixed(2)}%`}
          />
          <SummaryFact
            label="支付方式"
            value={paymentMethodLabel(rules.current.paymentMethod)}
          />
        </div>
      ) : (
        <Empty text="尚无当前生效规则，结算前必须先发布规则。" />
      )}
      {rules?.history.list.length ? (
        <div className="mt-4 border-t border-line pt-4">
          <SectionHeader
            title="佣金规则版本历史"
            badge={`${rules.history.total}`}
          />
          <div className="space-y-3">
            {rules.history.list.map((rule) => (
              <article
                className="rounded-xl border border-line bg-paper p-3"
                key={rule.publicId}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Badge
                      tone={
                        rule.publicId === rules.current?.publicId
                          ? "green"
                          : "neutral"
                      }
                    >
                      v{rule.version}
                    </Badge>
                    <strong>{rule.reason}</strong>
                  </div>
                  <span className="text-xs text-ink/50">
                    {new Date(rule.effectiveFrom).toLocaleString()} ～{" "}
                    {rule.effectiveTo
                      ? new Date(rule.effectiveTo).toLocaleString()
                      : "长期有效"}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                  <SummaryFact
                    label="固定成功奖励（日元）"
                    value={formatJpy(rule.fixedSuccessRewardJpy)}
                  />
                  <SummaryFact
                    label="纯利润分成比例"
                    value={`${(rule.profitShareRateBps / 100).toFixed(2)}%`}
                  />
                  <SummaryFact
                    label="支付方式"
                    value={paymentMethodLabel(rule.paymentMethod)}
                  />
                </div>
              </article>
            ))}
          </div>
          {rules.history.list.length < rules.history.total ? (
            <Button
              className="mt-3"
              disabled={loadingMore}
              onClick={() => void loadMore()}
              size="sm"
              variant="secondary"
            >
              {loadingMore ? "正在加载…" : "加载更多规则版本"}
            </Button>
          ) : null}
        </div>
      ) : null}
      {canWrite ? (
        <form
          className="mt-4 grid gap-3 border-t border-line pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="field-label">固定成功奖励（日元）</span>
              <input
                className={inputClass}
                min="0"
                onChange={(event) =>
                  setDraft((value) => ({ ...value, fixed: event.target.value }))
                }
                required
                type="number"
                value={draft.fixed}
              />
            </label>
            <label>
              <span className="field-label">纯利润分成比例</span>
              <input
                className={inputClass}
                max="100"
                min="0"
                onChange={(event) =>
                  setDraft((value) => ({ ...value, rate: event.target.value }))
                }
                required
                step="0.01"
                type="number"
                value={draft.rate}
              />
            </label>
            <label>
              <span className="field-label">支付方式</span>
              <select
                className={inputClass}
                onChange={(event) =>
                  setDraft((value) => ({
                    ...value,
                    paymentMethod: event.target.value as PaymentMethod,
                  }))
                }
                value={draft.paymentMethod}
              >
                <option value="bank_transfer">银行转账</option>
                <option value="ndp">NDP</option>
                <option value="other">其他</option>
              </select>
            </label>
            <label>
              <span className="field-label">生效时间</span>
              <input
                className={inputClass}
                onChange={(event) =>
                  setDraft((value) => ({
                    ...value,
                    effectiveFrom: event.target.value,
                  }))
                }
                required
                type="datetime-local"
                value={draft.effectiveFrom}
              />
            </label>
          </div>
          <label>
            <span className="field-label">设置理由</span>
            <textarea
              className="min-h-20 w-full rounded-lg border border-line p-3 text-sm"
              onChange={(event) =>
                setDraft((value) => ({ ...value, reason: event.target.value }))
              }
              required
              value={draft.reason}
            />
          </label>
          <Button type="submit">发布新版本</Button>
        </form>
      ) : (
        <ReadOnlyNotice />
      )}
    </section>
  );
}

function SettlementPanel({
  agentPublicId,
  canPay,
  canWrite,
  mutate,
  referrals,
  settlements,
}: {
  agentPublicId: string;
  canPay: boolean;
  canWrite: boolean;
  mutate: (action: () => Promise<unknown>, success: string) => Promise<boolean>;
  referrals: AgentShopReferral[];
  settlements: AgentSettlement[];
}) {
  const [period, setPeriod] = useState({ start: monthStart(), end: today() });
  const [evidence, setEvidence] = useState<
    Record<string, AgentSettlementExternalDeduction>
  >({});
  const [preview, setPreview] = useState<AgentSettlementPreview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [confirmationInput, setConfirmationInput] = useState<{
    periodStart: string;
    periodEnd: string;
    externalDeductions: AgentSettlementExternalDeduction[];
    idempotencyKey: string;
  } | null>(null);
  const [payment, setPayment] = useState({
    settlementPublicId: "",
    paymentMethod: "bank_transfer" as PaymentMethod,
    reference: "",
    reason: "",
  });
  const activeReferrals = useMemo(
    () => referrals.filter((row) => row.status !== "revoked"),
    [referrals],
  );

  useEffect(() => {
    setEvidence((current) =>
      Object.fromEntries(
        activeReferrals.map((row) => [
          row.shop.publicId,
          current[row.shop.publicId] ?? {
            shopPublicId: row.shop.publicId,
            channelFeesJpy: 0,
            consumptionTaxJpy: 0,
            evidenceReference: "",
            reason: "",
          },
        ]),
      ),
    );
  }, [activeReferrals]);
  const deductions = activeReferrals
    .map((row) => evidence[row.shop.publicId])
    .filter((row): row is AgentSettlementExternalDeduction => Boolean(row));
  const doPreview = async () => {
    setPreviewError("");
    const reviewedInput = {
      periodStart: period.start,
      periodEnd: period.end,
      externalDeductions: deductions.map((item) => ({ ...item })),
    };
    try {
      const next = await platformPartnersApi.previewSettlement(
        agentPublicId,
        reviewedInput,
      );
      setPreview(next);
      setConfirmationInput({
        ...reviewedInput,
        idempotencyKey: globalThis.crypto.randomUUID(),
      });
    } catch (previewFailure) {
      setPreview(null);
      setConfirmationInput(null);
      setPreviewError(errorMessage(previewFailure));
    }
  };
  const confirm = async () => {
    if (!preview || !confirmationInput) return;
    const succeeded = await mutate(
      () =>
        platformPartnersApi.confirmSettlement(
          agentPublicId,
          confirmationInput,
        ),
      "代理商结算已确认并生成不可变凭证",
    );
    if (succeeded) {
      setPreview(null);
      setConfirmationInput(null);
    }
  };
  const pay = async () => {
    const succeeded = await mutate(
      () =>
        platformPartnersApi.markSettlementPaid(
          agentPublicId,
          payment.settlementPublicId,
          {
            paymentMethod: payment.paymentMethod,
            paymentReference: payment.reference.trim(),
            reason: payment.reason.trim(),
          },
        ),
      "支付凭证已确认",
    );
    if (succeeded) {
      setPayment((value) => ({
        ...value,
        settlementPublicId: "",
        reference: "",
        reason: "",
      }));
    }
  };
  const updateEvidence = (
    shopPublicId: string,
    patch: Partial<AgentSettlementExternalDeduction>,
  ) =>
    setEvidence((current) => ({
      ...current,
      [shopPublicId]: { ...current[shopPublicId]!, ...patch },
    }));

  return (
    <>
      <section className={cardClass}>
        <SectionHeader title="结算预览" badge="逐店纯利润" />
        {canWrite ? (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void doPreview();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className="field-label">开始日期</span>
                <input
                  className={inputClass}
                  onChange={(event) =>
                    setPeriod((value) => ({
                      ...value,
                      start: event.target.value,
                    }))
                  }
                  required
                  type="date"
                  value={period.start}
                />
              </label>
              <label>
                <span className="field-label">结束日期</span>
                <input
                  className={inputClass}
                  onChange={(event) =>
                    setPeriod((value) => ({
                      ...value,
                      end: event.target.value,
                    }))
                  }
                  required
                  type="date"
                  value={period.end}
                />
              </label>
            </div>
            {activeReferrals.map((row) => {
              const item = evidence[row.shop.publicId];
              if (!item) return null;
              return (
                <div
                  className="rounded-xl border border-line bg-paper p-3"
                  key={row.publicId}
                >
                  <p className="mb-3 font-black">
                    {row.shop.name} · {row.shop.publicId}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label>
                      <span className="field-label">支付通道费 JPY</span>
                      <input
                        className={inputClass}
                        min="0"
                        onChange={(event) =>
                          updateEvidence(row.shop.publicId, {
                            channelFeesJpy: Number(event.target.value),
                          })
                        }
                        required
                        type="number"
                        value={item.channelFeesJpy}
                      />
                    </label>
                    <label>
                      <span className="field-label">消费税 JPY</span>
                      <input
                        className={inputClass}
                        min="0"
                        onChange={(event) =>
                          updateEvidence(row.shop.publicId, {
                            consumptionTaxJpy: Number(event.target.value),
                          })
                        }
                        required
                        type="number"
                        value={item.consumptionTaxJpy}
                      />
                    </label>
                    <label>
                      <span className="field-label">外部凭证编号</span>
                      <input
                        className={inputClass}
                        onChange={(event) =>
                          updateEvidence(row.shop.publicId, {
                            evidenceReference: event.target.value,
                          })
                        }
                        required
                        value={item.evidenceReference}
                      />
                    </label>
                    <label>
                      <span className="field-label">凭证说明</span>
                      <input
                        className={inputClass}
                        onChange={(event) =>
                          updateEvidence(row.shop.publicId, {
                            reason: event.target.value,
                          })
                        }
                        required
                        value={item.reason}
                      />
                    </label>
                  </div>
                </div>
              );
            })}
            {activeReferrals.length ? (
              <Button type="submit">计算预览</Button>
            ) : (
              <Empty text="请先关联至少一家有效店铺。" />
            )}
            {previewError ? (
              <p className="text-sm font-bold text-coral">{previewError}</p>
            ) : null}
          </form>
        ) : (
          <ReadOnlyNotice />
        )}
        {preview ? (
          <SettlementPreviewView confirm={confirm} preview={preview} />
        ) : null}
      </section>
      <section className={cardClass}>
        <SectionHeader title="历史结算" badge={`${settlements.length} 条`} />
        <div className="space-y-3">
          {settlements.map((row) => (
            <div
              className="rounded-xl border border-line p-4"
              key={row.publicId}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-black">
                    {row.periodStart.slice(0, 10)} ～{" "}
                    {row.periodEnd.slice(0, 10)}
                  </p>
                  <p className="text-xs text-ink/50">{row.publicId}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black">
                    {formatJpy(row.totalAmountJpy)}
                  </p>
                  <Badge tone={row.status === "paid" ? "green" : "blue"}>
                    {row.status === "paid" ? "已支付" : "已确认"}
                  </Badge>
                </div>
              </div>
              {row.status === "confirmed" && canPay ? (
                <Button
                  className="mt-3"
                  onClick={() =>
                    setPayment((value) => ({
                      ...value,
                      settlementPublicId: row.publicId,
                      paymentMethod: row.rule.paymentMethod,
                    }))
                  }
                  size="sm"
                  variant="secondary"
                >
                  登记支付凭证
                </Button>
              ) : null}
              {payment.settlementPublicId === row.publicId ? (
                <form
                  className="mt-3 grid gap-3 border-t border-line pt-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void pay();
                  }}
                >
                  <select
                    className={inputClass}
                    onChange={(event) =>
                      setPayment((value) => ({
                        ...value,
                        paymentMethod: event.target.value as PaymentMethod,
                      }))
                    }
                    value={payment.paymentMethod}
                  >
                    <option value="bank_transfer">银行转账</option>
                    <option value="ndp">NDP</option>
                    <option value="other">其他</option>
                  </select>
                  <input
                    className={inputClass}
                    onChange={(event) =>
                      setPayment((value) => ({
                        ...value,
                        reference: event.target.value,
                      }))
                    }
                    placeholder="支付凭证编号"
                    required
                    value={payment.reference}
                  />
                  <input
                    className={inputClass}
                    onChange={(event) =>
                      setPayment((value) => ({
                        ...value,
                        reason: event.target.value,
                      }))
                    }
                    placeholder="确认理由"
                    required
                    value={payment.reason}
                  />
                  <Button type="submit">确认已支付</Button>
                </form>
              ) : null}
            </div>
          ))}
          {settlements.length === 0 ? (
            <p className="text-sm text-ink/50">暂无结算记录</p>
          ) : null}
        </div>
      </section>
    </>
  );
}

function SettlementPreviewView({
  preview,
  confirm,
}: {
  preview: AgentSettlementPreview;
  confirm: () => void;
}) {
  const components: Array<[string, keyof AgentSettlementPreview["totals"]]> = [
    ["订单平台服务费", "orderPlatformFeesJpy"],
    ["SaaS 费", "saasFeesJpy"],
    ["用户返点", "userRebatesJpy"],
    ["退款／冲正", "refundsAndReversalsJpy"],
    ["支付通道费", "channelFeesJpy"],
    ["消费税", "consumptionTaxJpy"],
    ["运营成本均摊", "allocatedOperatingCostsJpy"],
    ["纯利润", "pureProfitJpy"],
    ["代理商分佣", "totalAmountJpy"],
  ];
  return (
    <div className="mt-5 border-t border-line pt-5">
      <div className="grid gap-2 sm:grid-cols-3">
        {components.map(([label, key]) => (
          <SummaryFact
            key={key}
            label={label}
            value={formatJpy(preview.totals[key])}
          />
        ))}
      </div>
      <div className="mt-4 space-y-3">
        {preview.shops.map((shop) => (
          <div
            className="overflow-x-auto rounded-xl border border-line"
            key={shop.shopPublicId}
          >
            <div className="flex items-center justify-between bg-paper px-4 py-3">
              <strong>{shop.shopName}</strong>
              <strong>{formatJpy(shop.totalAmountJpy)}</strong>
            </div>
            <table className="min-w-[820px] w-full text-left text-xs">
              <thead>
                <tr>
                  {[
                    "平台费",
                    "SaaS",
                    "返点",
                    "退款",
                    "通道费",
                    "税",
                    "成本均摊",
                    "纯利润",
                    "分佣",
                  ].map((label) => (
                    <th className="px-3 py-2" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {[
                    shop.orderPlatformFeesJpy,
                    shop.saasFeesJpy,
                    shop.userRebatesJpy,
                    shop.refundsAndReversalsJpy,
                    shop.channelFeesJpy,
                    shop.consumptionTaxJpy,
                    shop.allocatedOperatingCostsJpy,
                    shop.pureProfitJpy,
                    shop.totalAmountJpy,
                  ].map((value, index) => (
                    <td className="px-3 py-2 font-bold" key={index}>
                      {formatJpy(value)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        ))}
      </div>
      <Button className="mt-4" onClick={confirm}>
        确认并生成结算凭证
      </Button>
    </div>
  );
}

function SectionHeader({ title, badge }: { title: string; badge: string }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-lg font-black">{title}</h2>
      <Badge tone="blue">{badge}</Badge>
    </div>
  );
}
function SummaryFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-paper p-3">
      <p className="text-xs font-bold text-ink/45">{label}</p>
      <p className="mt-1 break-words text-sm font-black">{value}</p>
    </div>
  );
}
function Loading({ text }: { text: string }) {
  return (
    <div className={`${cardClass} text-sm font-bold text-ink/50`}>{text}</div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line p-4 text-sm text-ink/50">
      {text}
    </div>
  );
}
function ErrorPanel({ error, retry }: { error: string; retry: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
      <span>{error}</span>
      <Button onClick={retry} size="sm" variant="secondary">
        重试
      </Button>
    </div>
  );
}
function ReadOnlyNotice() {
  return (
    <p className="mt-4 rounded-xl bg-paper p-3 text-sm text-ink/50">
      当前账号只有读取权限。
    </p>
  );
}
function Pagination({
  page,
  totalPages,
  setPage,
}: {
  page: number;
  totalPages: number;
  setPage: (page: number) => void;
}) {
  return (
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
  );
}
