import { useNavigate, useParams } from "react-router-dom";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileFullscreenPage } from "../../components/mobile/MobileFullscreenPage";
import { MobileShell } from "../../components/mobile/MobileShell";
import { ServiceBookingActionBar } from "../../components/mobile/ServiceBookingActionBar";
import { ServiceDetailHeaderFade } from "../../components/mobile/ServiceDetailHeaderFade";
import { Badge } from "../../components/ui/Badge";
import { bookingApi, isBookingApiId } from "../../features/booking/api";
import { useCoreReadQuery } from "../../features/core-read/hooks";
import type { SocialPortalScope } from "../../features/social/types";
import { getGeneratedImageThumbnailUrl } from "../../lib/imageThumbnails";
import { yen } from "../../lib/utils";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { contentLocaleForLanguage } from "../../shared/localized-content/localizedText";
import { buildTechnicianServiceCheckoutRoute } from "./formal-checkout/checkoutServiceRoute";

export function TechnicianServiceDetailPage({ scope = "user" }: { scope?: SocialPortalScope } = {}) {
  const { language } = useOptionalI18n();
  const { id } = useParams();
  const navigate = useNavigate();
  const serviceId = isBookingApiId(id) ? Number(id) : null;
  const query = useCoreReadQuery(
    () => serviceId ? bookingApi.getTechnicianServiceBookingContext(serviceId) : null,
    [serviceId],
    {
      enabled: Boolean(serviceId),
      key: `technician-service:${serviceId ?? "invalid"}:detail`,
      scope: null
    }
  );
  const context = query.data;
  const service = context?.serviceCard;
  const localized = service?.localizedContent?.[contentLocaleForLanguage(language)];
  const serviceName = localized?.name?.trim() || service?.name || "";
  const serviceDescription = localized?.description?.trim() || service?.description;
  const closePage = () => navigate(scope === "user" ? "/" : `/${scope}`);

  return (
    <MobileShell showBottomNav={false}>
      <MobileFullscreenPage>
        <MobileFullscreenHeader
          className="service-detail-header"
          info={service ? `${service.durationMinutes}分钟 · ${context.shopCard.name}` : "技师服务详情"}
          onBack={() => navigate(-1)}
          onClose={closePage}
          overlay={<ServiceDetailHeaderFade />}
          title="服务详情"
        />
        <main className="client-app-gutter scrollbar-none min-h-0 flex-1 space-y-4 overflow-y-auto pb-[calc(env(safe-area-inset-bottom,0px)+112px)] pt-4">
          {query.loading ? (
            <p className="rounded-[24px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-5 text-sm font-bold text-[color:var(--client-muted)]" role="status">正在读取服务详情…</p>
          ) : query.error || !service || !context ? (
            <p className="rounded-[24px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-5 text-sm font-bold text-[color:var(--client-muted)]" role="alert">当前服务详情暂不可用。</p>
          ) : (
            <>
              <section className="relative h-[230px] overflow-hidden rounded-[28px] bg-black text-white shadow-soft">
                {service.coverUrl ? <img alt={serviceName} className="absolute inset-0 h-full w-full object-cover opacity-72" src={getGeneratedImageThumbnailUrl(service.coverUrl)} /> : null}
                <div className="absolute inset-0 bg-gradient-to-b from-black/18 via-black/20 to-black/84" />
                <div className="relative flex h-full flex-col justify-end p-5">
                  <div className="mb-3 flex flex-wrap gap-2">
                    <Badge tone="green">技师服务</Badge>
                    <Badge tone="blue">{service.durationMinutes}分钟</Badge>
                  </div>
                  <h1 className="text-[26px] font-black leading-tight" data-no-i18n>{serviceName}</h1>
                  <strong className="mt-2 text-[22px] font-black text-[color:var(--client-primary)]">{yen(service.catalogPriceJpy)}</strong>
                </div>
              </section>
              <section className="rounded-[24px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-5 shadow-panel">
                <h2 className="text-base font-black">服务介绍</h2>
                <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-7 text-[color:var(--client-muted)]" data-no-i18n={Boolean(serviceDescription)}>{serviceDescription || "当前服务暂未填写公开介绍。"}</p>
                {service.tags.length > 0 ? <div className="mt-4 flex flex-wrap gap-2">{service.tags.map((tag) => <span className="rounded-full border border-[color:color-mix(in_srgb,var(--client-primary)_42%,var(--client-line))] px-3 py-1.5 text-xs font-black text-[color:var(--client-primary)]" key={tag}>{tag}</span>)}</div> : null}
              </section>
              <section className="rounded-[24px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-5 shadow-panel">
                <h2 className="text-base font-black">服务提供方</h2>
                <p className="mt-3 text-sm font-black">{context.technicianCard.displayName}</p>
                <p className="mt-1 text-sm font-semibold text-[color:var(--client-muted)]">{context.shopCard.name} · {context.shopCard.address}</p>
              </section>
            </>
          )}
        </main>
        {scope === "user" && serviceId && service ? (
          <ServiceBookingActionBar
            amountJpy={service.catalogPriceJpy}
            confirmTo={buildTechnicianServiceCheckoutRoute(serviceId)}
            contactTo="/messages"
            contactTechnicianPublicId={context.technicianCard.publicId}
          />
        ) : null}
      </MobileFullscreenPage>
    </MobileShell>
  );
}
