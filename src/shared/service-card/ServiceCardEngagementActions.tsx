import { useState } from "react";
import { AppIcon } from "../../components/client-ui/AppScaffold";
import {
  entityEngagementApi,
  toggleFavoriteOptimistically,
  type EntityFavoriteState,
  type EntityTarget,
} from "../../features/entity-engagement/api";
import { EntityShareDestinationSheet } from "../entity-share/EntityShareDestinationSheet";

export function ServiceFavoriteAction({
  state,
  targetLabel,
  onChange,
}: {
  state: EntityFavoriteState;
  targetLabel: string;
  onChange: (state: EntityFavoriteState) => void;
}) {
  const [pending, setPending] = useState(false);
  return (
    <button
      aria-label={`${state.isFavorited ? "取消收藏" : "收藏"} ${targetLabel}`}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#b8ff4a] transition hover:bg-[#b8ff4a]/10 disabled:opacity-40 sm:h-9 sm:w-9"
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
}: {
  onShareCountChange: (value: number) => void;
  target: EntityTarget;
  targetLabel: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        aria-label={`分享 ${targetLabel}`}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#b8ff4a] transition hover:bg-[#b8ff4a]/10 sm:h-9 sm:w-9"
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
