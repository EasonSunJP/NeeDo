import { useState } from "react";
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
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#b8ff4a] transition hover:bg-[#b8ff4a]/10 disabled:opacity-40"
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
      <span aria-hidden="true" className="text-[27px] leading-none">♡</span>
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
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#b8ff4a] transition hover:bg-[#b8ff4a]/10"
        onClick={() => setOpen(true)}
        type="button"
      >
        <span aria-hidden="true" className="text-[27px] leading-none">⌯</span>
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
