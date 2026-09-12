import { useState } from "react";
import { AppIcon } from "../../components/client-ui/AppScaffold";
import {
  entityEngagementApi,
  toggleFavoriteOptimistically,
  type EntityFavoriteState,
  type EntityTarget,
} from "../../features/entity-engagement/api";
import { EntityShareDestinationSheet } from "../entity-share/EntityShareDestinationSheet";
import type { Language } from "../../i18n/translations";
import { getUnifiedCardCopy } from "../info-card-system/copy";

function actionLabel(action: string, targetLabel: string, language: Language) {
  return language === "ja" ? `${targetLabel}を${action}` : `${action} ${targetLabel}`;
}

export function ServiceFavoriteAction({
  state,
  targetLabel,
  onChange,
  language = "zh",
}: {
  state: EntityFavoriteState;
  targetLabel: string;
  onChange: (state: EntityFavoriteState) => void;
  language?: Language;
}) {
  const [pending, setPending] = useState(false);
  const text = getUnifiedCardCopy(language);
  return (
    <button
      aria-label={actionLabel(state.isFavorited ? text.removeFavorite : text.addFavorite, targetLabel, language)}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[color:var(--client-primary)] transition hover:bg-[color:var(--client-primary-soft)] disabled:opacity-40 sm:h-9 sm:w-9"
      disabled={pending}
      onClick={() => {
        setPending(true);
        void toggleFavoriteOptimistically({
          authoritative: state,
          nextIsFavorited: !state.isFavorited,
          onState: onChange,
        }).finally(() => setPending(false));
      }}
      type="button"
    >
      <span aria-hidden="true" className="text-[22px] leading-none sm:text-[27px]">♡</span>
    </button>
  );
}

export function ServiceShareAction({
  onShareCountChange,
  target,
  targetLabel,
  language = "zh",
}: {
  onShareCountChange: (value: number) => void;
  target: EntityTarget;
  targetLabel: string;
  language?: Language;
}) {
  const [open, setOpen] = useState(false);
  const text = getUnifiedCardCopy(language);
  return (
    <>
      <button
        aria-label={actionLabel(text.share, targetLabel, language)}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[color:var(--client-primary)] transition hover:bg-[color:var(--client-primary-soft)] sm:h-9 sm:w-9"
        onClick={() => setOpen(true)}
        type="button"
      >
        <AppIcon className="h-[22px] w-[22px] sm:h-[27px] sm:w-[27px]" name="share" />
      </button>
      {open ? (
        <EntityShareDestinationSheet
          onClose={() => setOpen(false)}
          onShareCountChange={onShareCountChange}
          target={target}
          targetLabel={targetLabel}
        />
      ) : null}
    </>
  );
}

export async function loadServiceFavoriteState(target: EntityTarget) {
  const response = await entityEngagementApi.getFavoriteStatuses([target]);
  return response.list[0] ?? null;
}
