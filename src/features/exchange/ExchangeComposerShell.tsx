import { useState, type ReactNode } from "react";
import { MobileBottomActionBar } from "../../components/mobile/MobileBottomActionBar";
import { MobileFullscreenHeader } from "../../components/mobile/MobileFullscreenHeader";
import { MobileFullscreenPage } from "../../components/mobile/MobileFullscreenPage";
import { ClientActionDialog } from "../../components/ui/ClientActionDialog";
import { TitleWithInfo } from "../../components/ui/TitleWithInfo";
import type { Language } from "../../i18n/translations";
import { exchangeText } from "./i18n";

export type ExchangeComposerStep = "edit" | "review";

function ComposerDiscardDialog({
  open,
  onCancel,
  onDiscard,
  language
}: {
  open: boolean;
  onCancel: () => void;
  onDiscard: () => void;
  language: Language;
}) {
  return (
    <ClientActionDialog
      actions={(
        <div className="grid grid-cols-2 gap-3">
          <button
            className="focus-ring h-11 rounded-full border border-[color:var(--client-line)] font-black"
            onClick={onCancel}
            type="button"
          >
            {exchangeText("continueEditing", language)}
          </button>
          <button
            className="focus-ring h-11 rounded-full bg-[color:var(--client-primary)] font-black text-[color:var(--client-primary-contrast)]"
            onClick={onDiscard}
            type="button"
          >
            {exchangeText("discardChanges", language)}
          </button>
        </div>
      )}
      closeOnBackdrop={false}
      description={exchangeText("discardComposerDescription", language)}
      onClose={onCancel}
      open={open}
      panelClassName="max-w-[360px]"
      title={exchangeText("discardComposerTitle", language)}
    />
  );
}

export function ExchangeComposerShell({
  title,
  introTitle,
  introDescription,
  step,
  dirty,
  pending,
  onBack,
  onClose,
  onNext,
  onPublish,
  language,
  children,
  review
}: {
  title: string;
  introTitle: string;
  introDescription: string;
  step: ExchangeComposerStep;
  dirty: boolean;
  pending: boolean;
  onBack: () => void;
  onClose: () => void;
  onNext: () => void;
  onPublish: () => void;
  language: Language;
  children: ReactNode;
  review: ReactNode;
}) {
  const [discardOpen, setDiscardOpen] = useState(false);
  const requestClose = () => {
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    onClose();
  };

  return (
    <MobileFullscreenPage className="z-[80]" innerClassName="client-glass-page-surface">
      <div data-testid="exchange-composer-shell">
        <MobileFullscreenHeader
          backLabel={exchangeText("back", language)}
          className="needo-composer-glass-header"
          closeLabel={exchangeText("close", language)}
          onBack={step === "review" ? onBack : undefined}
          onClose={requestClose}
          showSpacer={false}
          title={title}
        />
      </div>

      <main
        aria-label={title}
        aria-modal="true"
        className="client-app-gutter scrollbar-none min-h-0 flex-1 space-y-4 overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+9rem)] pt-[calc(env(safe-area-inset-top)+86px)]"
        role="dialog"
      >
        {step === "edit" ? (
          <>
            <section className="rounded-[12px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-4 shadow-panel">
              <TitleWithInfo
                as="h2"
                info={introDescription}
                label={introDescription}
                title={introTitle}
                titleClassName="text-xl font-black"
                variant="client"
              />
            </section>
            {children}
          </>
        ) : review}
      </main>

      <MobileBottomActionBar contentClassName="flex justify-center">
        <button
          className="focus-ring pointer-events-auto min-h-12 min-w-[240px] rounded-full bg-[color:var(--client-primary)] px-8 text-sm font-black text-[color:var(--client-primary-contrast)] shadow-soft disabled:opacity-50"
          data-action={step === "edit" ? "composer-next" : "composer-publish"}
          disabled={pending}
          onClick={step === "edit" ? onNext : onPublish}
          type="button"
        >
          {step === "edit"
            ? exchangeText("next", language)
            : exchangeText(pending ? "publishing" : "publish", language)}
        </button>
      </MobileBottomActionBar>

      <ComposerDiscardDialog
        language={language}
        onCancel={() => setDiscardOpen(false)}
        onDiscard={() => {
          setDiscardOpen(false);
          onClose();
        }}
        open={discardOpen}
      />
    </MobileFullscreenPage>
  );
}
