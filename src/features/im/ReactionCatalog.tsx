import { cn } from "../../lib/utils";
import { IM_COMMON_EMOJIS } from "./emoji";
import { ImReactionValue } from "./JudgementReactionIcon";
import {
  getImReactionCategory,
  IM_JUDGEMENT_REPLIES,
  isImReactionChoiceDisabled,
  type ImReactionCategory
} from "./reaction-policy";

export type ReactionCatalogProps = {
  disabled?: boolean;
  expanded: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  onSelect: (value: string) => void;
  pendingCategory?: ImReactionCategory;
  recentValues: readonly string[];
  selectedEmoji?: string;
  selectedJudgement?: string;
  visibleRecentCount?: number;
};

function ReactionCatalogButton({
  catalogDisabled,
  onSelect,
  pendingCategory,
  selectedEmoji,
  selectedJudgement,
  value
}: {
  catalogDisabled: boolean;
  onSelect: (value: string) => void;
  pendingCategory?: ImReactionCategory;
  selectedEmoji?: string;
  selectedJudgement?: string;
  value: string;
}) {
  const category = getImReactionCategory(value);
  const selectedValue = category === "judgement" ? selectedJudgement : selectedEmoji;
  const selected = selectedValue === value;
  const itemDisabled =
    catalogDisabled ||
    pendingCategory === category ||
    isImReactionChoiceDisabled(value, selectedValue, false);

  return (
    <button
      aria-label={`选择 ${value}`}
      aria-pressed={selected}
      className={cn(
        "focus-ring grid h-11 min-w-0 place-items-center rounded-xl px-1 text-center text-[24px] transition",
        "hover:bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)]",
        selected &&
          "bg-[color:color-mix(in_srgb,var(--client-primary)_14%,transparent)] ring-1 ring-[color:color-mix(in_srgb,var(--client-primary)_58%,transparent)]",
        itemDisabled &&
          "cursor-not-allowed grayscale opacity-35 hover:bg-transparent"
      )}
      data-im-reaction-category={category}
      data-im-reaction-selected={selected ? "true" : "false"}
      data-im-reaction-value={value}
      disabled={itemDisabled}
      onClick={itemDisabled ? undefined : () => onSelect(value)}
      type="button"
    >
      <ImReactionValue value={value} />
    </button>
  );
}

function ReactionSection({
  catalogDisabled,
  heading,
  onSelect,
  pendingCategory,
  selectedEmoji,
  selectedJudgement,
  type,
  values
}: {
  catalogDisabled: boolean;
  heading: string;
  onSelect: (value: string) => void;
  pendingCategory?: ImReactionCategory;
  selectedEmoji?: string;
  selectedJudgement?: string;
  type: "common" | "judgement" | "general";
  values: readonly string[];
}) {
  return (
    <section data-im-reaction-section={type}>
      <p
        className="mb-1.5 text-[11px] font-black text-[color:var(--client-muted)]"
        data-im-reaction-heading="true"
      >
        {heading}
      </p>
      <div
        className={cn(
          "grid gap-1 text-center",
          type === "judgement" ? "grid-cols-4 sm:grid-cols-8" : "grid-cols-8"
        )}
      >
        {values.map((value) => (
          <ReactionCatalogButton
            catalogDisabled={catalogDisabled}
            key={`${type}-${value}`}
            onSelect={onSelect}
            pendingCategory={pendingCategory}
            selectedEmoji={selectedEmoji}
            selectedJudgement={selectedJudgement}
            value={value}
          />
        ))}
      </div>
    </section>
  );
}

export function ReactionCatalog({
  disabled = false,
  expanded,
  onExpandedChange,
  onSelect,
  pendingCategory,
  recentValues,
  selectedEmoji,
  selectedJudgement,
  visibleRecentCount = 6
}: ReactionCatalogProps) {
  if (!expanded) {
    const visibleRecent = recentValues.slice(0, visibleRecentCount);
    const fullDensity = visibleRecentCount >= 6;

    return (
      <div
        className={cn(
          "grid items-center gap-0.5 px-1 py-1.5",
          fullDensity ? "grid-cols-7" : "grid-cols-5"
        )}
        data-im-message-reaction-density={fullDensity ? "full" : "compact"}
        data-im-message-reaction-row="quick"
        data-im-reaction-catalog="compact"
        data-im-reaction-section="common"
      >
        {visibleRecent.map((value) => (
          <ReactionCatalogButton
            catalogDisabled={disabled}
            key={`compact-${value}`}
            onSelect={onSelect}
            pendingCategory={pendingCategory}
            selectedEmoji={selectedEmoji}
            selectedJudgement={selectedJudgement}
            value={value}
          />
        ))}
        <button
          aria-label="展开更多回复"
          className="focus-ring grid h-11 place-items-center rounded-full bg-[color:color-mix(in_srgb,var(--client-line)_30%,transparent)] text-[20px] font-black tracking-[0.12em] text-[color:var(--client-muted)] transition hover:bg-[color:color-mix(in_srgb,var(--client-primary)_12%,transparent)]"
          disabled={disabled}
          onClick={() => onExpandedChange?.(true)}
          type="button"
        >
          ···
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 px-1 pb-2 pt-1" data-im-reaction-catalog="expanded">
      <div className="flex items-center justify-between gap-2">
        <span aria-hidden="true" className="h-px flex-1 bg-[color:color-mix(in_srgb,var(--client-line)_48%,transparent)]" />
        {onExpandedChange ? (
          <button
            aria-label="收起更多回复"
            className="focus-ring rounded-full px-2.5 py-1 text-[11px] font-black text-[color:var(--client-muted)] transition hover:bg-[color:color-mix(in_srgb,var(--client-primary)_10%,transparent)]"
            onClick={() => onExpandedChange(false)}
            type="button"
          >
            收起
          </button>
        ) : null}
      </div>
      <ReactionSection
        catalogDisabled={disabled}
        heading="常用表情"
        onSelect={onSelect}
        pendingCategory={pendingCategory}
        selectedEmoji={selectedEmoji}
        selectedJudgement={selectedJudgement}
        type="common"
        values={recentValues}
      />
      <ReactionSection
        catalogDisabled={disabled}
        heading="判断表情"
        onSelect={onSelect}
        pendingCategory={pendingCategory}
        selectedEmoji={selectedEmoji}
        selectedJudgement={selectedJudgement}
        type="judgement"
        values={IM_JUDGEMENT_REPLIES}
      />
      <ReactionSection
        catalogDisabled={disabled}
        heading="一般表情"
        onSelect={onSelect}
        pendingCategory={pendingCategory}
        selectedEmoji={selectedEmoji}
        selectedJudgement={selectedJudgement}
        type="general"
        values={IM_COMMON_EMOJIS.filter(
          (value) => getImReactionCategory(value) === "emoji"
        )}
      />
    </div>
  );
}
