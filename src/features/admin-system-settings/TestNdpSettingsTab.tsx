import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { useI18n } from "../../i18n/I18nProvider";
import { walletApi } from "../wallet/api";
import type { PlatformManagedUser } from "../platform-user-management/types";
import { adminSystemSettingsApi } from "./api";
import { adminSystemSettingsText } from "./i18n";
import type { TestNdpVisibilityPreference } from "./types";

type ActionKind = "test" | "formal";

export function TestNdpSettingsTab({
  canCreditTestNdp,
  canCreateFormalTopup,
  canManageParticipants
}: {
  canCreditTestNdp: boolean;
  canCreateFormalTopup: boolean;
  canManageParticipants: boolean;
}) {
  const { language } = useI18n();
  const t = useCallback((value: string) => adminSystemSettingsText(value, language), [language]);
  const [preference, setPreference] = useState<TestNdpVisibilityPreference | null>(null);
  const [participants, setParticipants] = useState<PlatformManagedUser[]>([]);
  const [keyword, setKeyword] = useState("");
  const [candidates, setCandidates] = useState<PlatformManagedUser[]>([]);
  const [selected, setSelected] = useState<{ kind: ActionKind; user: PlatformManagedUser } | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAllParticipants = useCallback(async () => {
    const first = await adminSystemSettingsApi.listTestParticipants(1);
    const totalPages = Math.ceil(first.total / first.page_size);
    if (totalPages <= 1) return first.list;
    const remaining = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, index) =>
        adminSystemSettingsApi.listTestParticipants(index + 2)
      )
    );
    return [first, ...remaining].flatMap((page) => page.list);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextPreference, nextParticipants] = await Promise.all([
        adminSystemSettingsApi.getTestNdpVisibility(),
        loadAllParticipants()
      ]);
      setPreference(nextPreference);
      setParticipants(nextParticipants);
    } catch {
      setError(t("Test NDP 设置读取失败"));
    }
  }, [loadAllParticipants, t]);

  useEffect(() => { void load(); }, [load]);

  const updateVisibility = async () => {
    if (!preference || busy) return;
    setBusy(true);
    setError(null);
    try {
      setPreference(await adminSystemSettingsApi.updateTestNdpVisibility(!preference.showTestNdpData));
      setStatus(t("个人显示设置已保存"));
    } catch {
      setError(t("设置保存失败，请重试。"));
    } finally {
      setBusy(false);
    }
  };

  const search = async () => {
    const value = keyword.trim();
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      setCandidates((await adminSystemSettingsApi.searchParticipantCandidates(value)).list);
    } catch {
      setError(t("账号搜索失败"));
    } finally {
      setBusy(false);
    }
  };

  const setParticipant = async (user: PlatformManagedUser, isTestAccount: boolean) => {
    setBusy(true);
    setError(null);
    try {
      await adminSystemSettingsApi.updateTestParticipant(user.id, isTestAccount, user.updatedAt);
      setStatus(t(isTestAccount ? "测试人员已添加，账号全部身份已生效" : "测试人员已移除"));
      setCandidates((current) => current.map((item) => item.id === user.id ? { ...item, isTestAccount } : item));
      await load();
    } catch {
      setError(t("测试人员更新失败，请确认没有活动中的 Test NDP 交易。"));
    } finally {
      setBusy(false);
    }
  };

  const submitCredit = async () => {
    if (!selected || busy) return;
    const amountNdp = Number(amount);
    if (!Number.isSafeInteger(amountNdp) || amountNdp <= 0 || !reason.trim()) {
      setError(t("请输入正整数金额和原因"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const idempotencyKey = `${selected.kind}-${selected.user.id}-${crypto.randomUUID()}`;
      if (selected.kind === "test") {
        await walletApi.creditTestNdp({ targetUserId: selected.user.id, amountNdp, reason: reason.trim(), idempotencyKey });
        setStatus(t("Test NDP 已入账"));
      } else {
        await walletApi.createBackofficeTopup({ targetUserId: selected.user.id, amountNdp, note: reason.trim(), idempotencyKey });
        setStatus(t("正式 NDP 入账申请已提交，须由另一名管理员审核"));
      }
      setSelected(null);
      setAmount("");
      setReason("");
      await load();
    } catch {
      setError(t("入账操作失败，请检查账号资格、权限或重复请求。"));
    } finally {
      setBusy(false);
    }
  };

  return <div className="space-y-6">
    <section className="rounded-xl border border-line bg-paper p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-black">{t("显示 Test NDP 数据")}</h2>
          <p className="mt-1 text-sm font-semibold text-ink/55">{t("此设置只影响当前管理员。关闭后运营数据、余额和入账入口均不显示 Test NDP。")}</p>
          {preference ? <p className="mt-2 text-xs font-bold text-ink/45">{preference.source === "explicit" ? t("个人设置") : t("环境默认")}</p> : null}
        </div>
        <Button disabled={!preference || busy} onClick={() => void updateVisibility()} variant={preference?.showTestNdpData ? "primary" : "secondary"}>
          {preference?.showTestNdpData ? t("已开启") : t("已关闭")}
        </Button>
      </div>
    </section>

    <section className="space-y-4">
      <div>
        <h2 className="text-base font-black">{t("测试人员列表")}</h2>
        <p className="mt-1 text-sm font-semibold text-ink/55">{t("添加账号中的任一身份后，该账号全部身份及其所有店铺成为测试主体。")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <input aria-label={t("搜索账号")} className="min-h-10 flex-1 rounded-lg border border-line bg-white px-3 text-sm font-bold" onChange={(event) => setKeyword(event.target.value)} placeholder={t("NeeDo ID、账号、邮箱或手机号")} value={keyword} />
        <Button disabled={busy || !keyword.trim()} onClick={() => void search()} variant="secondary">{t("搜索")}</Button>
      </div>
      {candidates.length ? <div className="space-y-2 rounded-xl border border-line bg-paper p-3">
        {candidates.map((user) => <ParticipantRow key={`candidate-${user.id}`} user={user} actions={<>
          {canManageParticipants ? <Button disabled={busy} onClick={() => void setParticipant(user, !user.isTestAccount)} size="sm" variant="secondary">{t(user.isTestAccount ? "移出测试人员" : "加入测试人员")}</Button> : null}
          {canCreateFormalTopup && !user.isTestAccount ? <Button disabled={busy} onClick={() => setSelected({ kind: "formal", user })} size="sm">{t("添加正式 NDP")}</Button> : null}
        </>} />)}
      </div> : null}
      <div className="space-y-2">
        {participants.map((user) => <ParticipantRow key={user.id} user={user} showTestBalance={Boolean(preference?.showTestNdpData)} actions={<>
          {canCreditTestNdp && preference?.showTestNdpData ? <Button disabled={busy} onClick={() => setSelected({ kind: "test", user })} size="sm">{t("添加 Test NDP")}</Button> : null}
          {canManageParticipants ? <Button disabled={busy} onClick={() => void setParticipant(user, false)} size="sm" variant="secondary">{t("移出测试人员")}</Button> : null}
        </>} />)}
        {!participants.length ? <p className="rounded-xl border border-line bg-paper p-4 text-sm font-bold text-ink/50">{t("当前没有测试人员")}</p> : null}
      </div>
    </section>

    {selected ? <section className="rounded-xl border border-moss/30 bg-moss/5 p-4">
      <h3 className="font-black">{t(selected.kind === "test" ? "添加 Test NDP" : "添加正式 NDP")} · {selected.user.displayName}</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <input aria-label={t("金额")} className="min-h-10 rounded-lg border border-line bg-white px-3 text-sm font-bold" inputMode="numeric" onChange={(event) => setAmount(event.target.value)} placeholder={t("正整数金额")} value={amount} />
        <input aria-label={t("原因")} className="min-h-10 rounded-lg border border-line bg-white px-3 text-sm font-bold" onChange={(event) => setReason(event.target.value)} placeholder={t("必填原因")} value={reason} />
      </div>
      <div className="mt-3 flex gap-2"><Button disabled={busy} onClick={() => void submitCredit()}>{t("提交")}</Button><Button disabled={busy} onClick={() => setSelected(null)} variant="secondary">{t("取消")}</Button></div>
    </section> : null}

    {status ? <Badge tone="green">{status}</Badge> : null}
    {error ? <p className="rounded-lg border border-coral/30 bg-coral/10 p-3 text-sm font-bold text-coral">{error}</p> : null}
  </div>;
}

function ParticipantRow({ actions, showTestBalance = false, user }: { actions: ReactNode; showTestBalance?: boolean; user: PlatformManagedUser }) {
  return <article className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white p-4 shadow-sm">
    <div>
      <div className="flex flex-wrap items-center gap-2"><strong>{user.displayName}</strong><Badge tone={user.isTestAccount ? "yellow" : "green"}>{user.isTestAccount ? "TEST" : "FORMAL"}</Badge></div>
      <p className="mt-1 text-xs font-bold text-ink/50">{user.needoId} · {user.email}</p>
      {showTestBalance && user.testNdpBalance ? <p className="mt-2 text-sm font-black">Test NDP {user.testNdpBalance.available.toLocaleString("ja-JP")}</p> : null}
    </div>
    <div className="flex flex-wrap gap-2">{actions}</div>
  </article>;
}
