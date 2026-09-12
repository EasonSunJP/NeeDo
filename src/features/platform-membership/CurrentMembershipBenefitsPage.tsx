import { useNavigate } from "react-router-dom";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileFullscreenPage } from "../../components/mobile/MobileFullscreenPage";
import { MobileShell } from "../../components/mobile/MobileShell";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";
import {
  currentMembershipBenefitsCopy,
  getCurrentMembershipBenefitStateLabel,
  useCurrentMembershipBenefits
} from "./CurrentMembershipBenefits";
import {
  currentMembershipBenefitsApi,
  type CurrentMembershipBenefitsPayload
} from "./currentMembershipBenefitsApi";

const benefitCardClassName =
  "flex min-h-[72px] items-center gap-3 rounded-[22px] border border-[color:var(--client-line)] bg-[color:var(--client-elevated)] px-4 py-3";

export function CurrentMembershipBenefitsPage({
  load = currentMembershipBenefitsApi.getMine
}: {
  load?: (language: Language) => Promise<CurrentMembershipBenefitsPayload>;
}) {
  const navigate = useNavigate();
  const { language } = useOptionalI18n();
  const { payload, retry, status } = useCurrentMembershipBenefits(language, load);
  const text = currentMembershipBenefitsCopy[language];
  const enabledCount = payload?.list.filter((item) => item.effective).length ?? 0;

  return (
    <MobileShell showBottomNav={false} showTopEdgeMask={false}>
      <MobileFullscreenPage innerClassName="client-glass-page-surface">
        <MobileFullscreenHeader
          action={
            status === "ready" && payload ? (
              <span className="shrink-0 rounded-full bg-[color:var(--client-primary-soft)] px-2.5 py-1.5 text-[11px] font-black text-[color:var(--client-primary-strong)]">
                {enabledCount}/{payload.list.length}{text.enabled}
              </span>
            ) : undefined
          }
          info={text.subtitle}
          infoLabel={text.infoLabel}
          onBack={() => navigate("/me")}
          showSpacer={false}
          title={text.title}
        />

        <main className="client-app-gutter scrollbar-none min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[calc(32px+env(safe-area-inset-bottom))] pt-[calc(env(safe-area-inset-top)+86px)]">
          {status === "loading" ? (
            <section className="rounded-[24px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-4 py-12 text-center text-sm font-black text-[color:var(--client-muted)]">
              {text.loading}
            </section>
          ) : null}

          {status === "error" ? (
            <section className="rounded-[24px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] px-4 py-10 text-center" role="alert">
              <h2 className="text-sm font-black text-[color:var(--client-text)]">{text.loadError}</h2>
              <button
                className="mt-4 min-h-10 rounded-full border border-[color:var(--client-primary)] px-5 text-sm font-black text-[color:var(--client-primary)]"
                onClick={retry}
                type="button"
              >
                {text.retry}
              </button>
            </section>
          ) : null}

          {status === "ready" && payload ? (
            <ul aria-label={text.title} className="grid gap-3">
              {payload.list.map((item) => (
                <li
                  aria-label={`${item.name}，${getCurrentMembershipBenefitStateLabel(item, language)}`}
                  className={benefitCardClassName}
                  key={item.code}
                >
                  <span
                    aria-hidden="true"
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-black ${item.effective ? "bg-[color:var(--client-primary)] text-[color:var(--client-needo-text)]" : "bg-[color:var(--client-line)] text-[color:var(--client-muted)]"}`}
                    data-testid="membership-benefit-state-icon"
                  >
                    {item.effective ? "✓" : "—"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block text-sm text-[color:var(--client-text)]">{item.name}</strong>
                    <span className="mt-1 block text-xs leading-5 text-[color:var(--client-muted)]">{item.description}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </main>
      </MobileFullscreenPage>
    </MobileShell>
  );
}
