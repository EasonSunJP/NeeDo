import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileFullscreenPage } from "../../components/mobile/MobileFullscreenPage";
import { coreReadApi, type CoreTechnicianDetail } from "../../features/core-read/api";
import { useCoreReadQuery } from "../../features/core-read/hooks";
import { TechnicianPublicInfoCard, type TechnicianFormalContactCardData } from "../../shared/profile-card";
import type { Technician } from "../../types/domain";

export function buildFormalTechnicianInfoCard(detail: CoreTechnicianDetail): {
  technician: Technician;
  formalData: TechnicianFormalContactCardData;
} {
  const profileTags = Array.from(new Set([
    ...detail.reviewSummary.highlights,
    ...detail.services.map((service) => service.category.nameJa ?? service.category.name)
  ].map((value) => value.trim()).filter(Boolean)));
  const serviceAreas = detail.serviceArea
    ? detail.serviceArea.split(/[,，、\n]/).map((value) => value.trim()).filter(Boolean)
    : detail.city ? [detail.city] : [];

  return {
    technician: {
      id: String(detail.id),
      systemId: detail.publicId,
      name: detail.displayName,
      storeId: detail.shop ? String(detail.shop.id) : "",
      role: "therapist",
      status: "available",
      rating: Number(detail.reviewSummary.ratingAverage) || 0,
      orderCount: detail.completedOrderCount,
      income: 0,
      skills: profileTags,
      serviceAreas,
      acceptRate: detail.acceptanceRatePercent,
      cancelRate: 0,
      reviewCount: detail.reviewSummary.reviewCount,
      languages: [],
      avatar: detail.avatarUrl ?? "",
      bio: detail.bio ?? undefined,
      age: detail.age === null ? undefined : String(detail.age),
      identityLabel: detail.shop ? "店铺所属技师" : "个人技师",
      profileTags,
      gallery: detail.mediaAssets.map((asset) => asset.url)
    },
    formalData: {
      metrics: {
        completedOrderCount: detail.completedOrderCount,
        ratingAverage: String(detail.reviewSummary.ratingAverage),
        reviewCount: detail.reviewSummary.reviewCount,
        acceptanceRateBps: Math.round(detail.acceptanceRatePercent * 100)
      },
      contactDetails: {
        bidBudgetMinJpy: null,
        bidBudgetMaxJpy: null,
        paymentMethods: [],
        specialTags: [],
        profileTags,
        services: detail.services.map((service, index) => ({
          id: service.id,
          shopId: service.shop.id,
          name: service.name,
          priceAmount: Number(service.priceAmount) || 0,
          currency: service.currency,
          durationMinutes: service.durationMinutes,
          taxIncluded: true,
          sortOrder: index
        }))
      }
    }
  };
}

function StatusPanel({
  action,
  description,
  title
}: {
  action?: ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <section className="rounded-[24px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-5 text-center">
      <h2 className="text-base font-black text-[color:var(--client-text)]">{title}</h2>
      {description ? <p className="mt-2 text-sm leading-6 text-[color:var(--client-muted)]">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </section>
  );
}

export function TechnicianInfoCardRoutePage({ id }: { id: number }) {
  const navigate = useNavigate();
  const [revision, setRevision] = useState(0);
  const query = useCoreReadQuery(() => coreReadApi.getTechnicianDetail(id), [id, revision]);
  const closePage = () => {
    if (typeof window !== "undefined") {
      const historyState = window.history.state as { idx?: number } | null;

      if (typeof historyState?.idx === "number" && historyState.idx > 0) {
        navigate(-1);
        return;
      }
    }

    navigate("/", { replace: true });
  };
  const presentation = query.data ? buildFormalTechnicianInfoCard(query.data) : null;

  return (
    <MobileFullscreenPage>
      <MobileFullscreenHeader
        backLabel="返回结算页"
        closeLabel="关闭详细信息卡"
        onBack={closePage}
        onClose={closePage}
        showSpacer={false}
        title="详细信息卡"
      />
      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+86px)]">
        {query.data && presentation ? (
          <TechnicianPublicInfoCard
            formalData={presentation.formalData}
            hideUnavailableFields
            technician={presentation.technician}
            themeScope="user"
          />
        ) : query.loading ? (
          <StatusPanel title="正在读取技师详细信息" />
        ) : (
          <StatusPanel
            action={(
              <button
                className="min-h-11 rounded-full bg-[color:var(--client-primary)] px-5 text-sm font-black text-[color:var(--client-primary-contrast)]"
                onClick={() => setRevision((value) => value + 1)}
                type="button"
              >
                重新加载
              </button>
            )}
            description={query.error ?? "当前技师资料不可用"}
            title="技师详细信息读取失败"
          />
        )}
      </main>
    </MobileFullscreenPage>
  );
}
