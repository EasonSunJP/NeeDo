import { useCallback, useEffect, useState } from "react";
import { useOptionalAuth } from "../../auth/AuthProvider";
import { Button } from "../../components/ui/Button";
import { walletApi, type WalletAdjustmentRequest } from "../../features/wallet/api";
import { useI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";

const copy: Record<Language, {
  title: string;
  description: string;
  refresh: string;
  error: string;
  loading: string;
  empty: string;
  user: string;
  requester: string;
  noNote: string;
  approve: string;
  reject: string;
  approveNote: string;
  rejectNote: string;
}> = {
  zh: { title: "正式 NDP 入账审核", description: "申请人不能审核自己的申请；仅审核通过后写入正式 NDP 账本。", refresh: "刷新", error: "入账申请读取或审核失败", loading: "正在读取待审核申请…", empty: "当前没有待审核的正式 NDP 入账申请", user: "用户", requester: "申请人", noNote: "无备注", approve: "通过", reject: "拒绝", approveNote: "运营财务复核通过", rejectNote: "运营财务复核拒绝" },
  "zh-Hant": { title: "正式 NDP 入帳審核", description: "申請人不能審核自己的申請；只有審核通過後才會寫入正式 NDP 帳本。", refresh: "重新整理", error: "讀取或審核入帳申請失敗", loading: "正在讀取待審核申請…", empty: "目前沒有待審核的正式 NDP 入帳申請", user: "使用者", requester: "申請人", noNote: "無備註", approve: "通過", reject: "拒絕", approveNote: "營運財務審核通過", rejectNote: "營運財務審核拒絕" },
  ja: { title: "正式 NDP 入金審査", description: "申請者本人は審査できません。承認後にのみ正式 NDP 台帳へ記帳されます。", refresh: "更新", error: "入金申請の読み込みまたは審査に失敗しました", loading: "審査待ち申請を読み込んでいます…", empty: "審査待ちの正式 NDP 入金申請はありません", user: "ユーザー", requester: "申請者", noNote: "備考なし", approve: "承認", reject: "却下", approveNote: "運営財務審査で承認", rejectNote: "運営財務審査で却下" },
  en: { title: "Formal NDP credit review", description: "Requesters cannot review their own requests. Formal NDP is posted only after approval.", refresh: "Refresh", error: "Failed to load or review credit requests", loading: "Loading pending requests…", empty: "There are no pending formal NDP credit requests", user: "User", requester: "Requester", noNote: "No note", approve: "Approve", reject: "Reject", approveNote: "Approved by operations finance", rejectNote: "Rejected by operations finance" },
  ko: { title: "정식 NDP 입금 심사", description: "신청자는 본인의 신청을 심사할 수 없습니다. 승인 후에만 정식 NDP 원장에 기록됩니다.", refresh: "새로고침", error: "입금 신청을 불러오거나 심사하지 못했습니다", loading: "심사 대기 신청을 불러오는 중…", empty: "심사 대기 중인 정식 NDP 입금 신청이 없습니다", user: "사용자", requester: "신청자", noNote: "메모 없음", approve: "승인", reject: "거절", approveNote: "운영 재무 심사 승인", rejectNote: "운영 재무 심사 거절" }
};

export function WalletAdjustmentReview() {
  const auth = useOptionalAuth();
  const { language } = useI18n();
  const labels = copy[language];
  const canList = auth?.hasPermission("backoffice:wallet-adjustment:list") ?? false;
  const canReview = auth?.hasPermission("backoffice:wallet-adjustment:review") ?? false;
  const [requests, setRequests] = useState<WalletAdjustmentRequest[]>([]);
  const [loading, setLoading] = useState(canList);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    if (!canList) return;
    setLoading(true);
    setError(false);
    walletApi.listBackofficeAdjustments({ status: "pending", type: "topup", page: 1, pageSize: 50 })
      .then((result) => setRequests(result.list.filter((item) => item.ownerType === "user")))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [canList]);

  useEffect(load, [load]);

  const review = async (request: WalletAdjustmentRequest, action: "approve" | "reject") => {
    setBusyId(request.id);
    setError(false);
    try {
      await walletApi.reviewAdjustment(request.id, {
        action,
        note: action === "approve" ? labels.approveNote : labels.rejectNote
      });
      load();
    } catch {
      setError(true);
    } finally {
      setBusyId(null);
    }
  };

  if (!canList) return null;
  return <section className="mt-5 rounded-lg border border-line bg-white p-4 shadow-panel">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="font-bold">{labels.title}</h2><p className="mt-1 text-xs font-bold text-ink/45">{labels.description}</p></div>
      <Button disabled={loading} onClick={load} size="sm" variant="secondary">{labels.refresh}</Button>
    </div>
    {error ? <p className="mt-3 text-sm font-bold text-coral">{labels.error}</p> : null}
    {loading ? <p className="mt-3 text-sm font-bold text-ink/45">{labels.loading}</p> : null}
    {!loading && !requests.length ? <p className="mt-3 text-sm font-bold text-ink/45">{labels.empty}</p> : null}
    <div className="mt-3 space-y-2">
      {requests.map((request) => <article className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-paper p-3" key={request.id}>
        <div><strong>{labels.user} #{request.ownerId} · {request.amountNdp.toLocaleString(language)} NDP</strong><p className="mt-1 text-xs font-bold text-ink/45">{labels.requester} #{request.requestedById} · {request.note ?? labels.noNote}</p></div>
        {canReview ? <div className="flex gap-2"><Button disabled={busyId !== null} onClick={() => void review(request, "approve")} size="sm">{labels.approve}</Button><Button disabled={busyId !== null} onClick={() => void review(request, "reject")} size="sm" variant="danger">{labels.reject}</Button></div> : null}
      </article>)}
    </div>
  </section>;
}
