import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../auth/AuthProvider";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileFullscreenPage } from "../../components/mobile/MobileFullscreenPage";
import { MobileShell } from "../../components/mobile/MobileShell";
import { ArrangementDetailContent } from "../../features/dispatch-center/components/ArrangementDetailContent";
import { getDispatchArrangementByOrderId, useDispatchCenterStore } from "../../features/dispatch-center/store";
import { useEntityStore } from "../../state/entityStore";

const fullscreenHeaderClassName =
  "";

export function MerchantScheduleArrangementRoutePage() {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const { session } = useAuth();
  const { stores } = useEntityStore();
  const dispatchSnapshot = useDispatchCenterStore();
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const store = stores.find((item) => item.id === session?.linkedStoreId) ?? stores[0];
  const arrangement = useMemo(
    () => (store && orderId ? getDispatchArrangementByOrderId(store.id, orderId) : null),
    [dispatchSnapshot.revision, orderId, store]
  );

  return (
    <MobileShell navItems={[]}>
      <MobileFullscreenPage>
        <MobileFullscreenHeader
          className={fullscreenHeaderClassName}
          onClose={() => navigate("/merchant/schedule")}
          title="预约安排详情"
        />
        <main className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-28">
          {flashMessage ? (
            <p className="rounded-2xl bg-lemon/25 px-4 py-3 text-sm font-semibold text-[#795b00]">{flashMessage}</p>
          ) : null}
          {arrangement && store ? (
            <ArrangementDetailContent
              arrangement={arrangement}
              onActionComplete={(result) => setFlashMessage(result.ok ? "已同步到共享调度数据。" : result.message ?? "操作失败。")}
              operatorId={store.id}
              storeId={store.id}
              surface="mobile"
            />
          ) : (
            <section className="rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_78%,transparent)] bg-[color:color-mix(in_srgb,var(--client-elevated)_86%,transparent)] p-4">
              <p className="text-sm font-black text-[color:var(--client-text)]">当前预约安排不存在</p>
              <p className="mt-2 text-sm leading-6 text-[color:var(--client-muted)]">可能已被调整或不属于当前门店，请返回日程重新选择。</p>
            </section>
          )}
        </main>
      </MobileFullscreenPage>
    </MobileShell>
  );
}
