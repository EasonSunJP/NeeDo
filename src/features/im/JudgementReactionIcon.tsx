import okIcon from "../../assets/im/judgement-reactions/ok.svg";
import noIcon from "../../assets/im/judgement-reactions/no.svg";
import pendingIcon from "../../assets/im/judgement-reactions/pending.svg";
import plusOneIcon from "../../assets/im/judgement-reactions/plus-one.svg";
import doneIcon from "../../assets/im/judgement-reactions/done.svg";
import coolIcon from "../../assets/im/judgement-reactions/cool.svg";
import goodIcon from "../../assets/im/judgement-reactions/good.svg";
import thanksIcon from "../../assets/im/judgement-reactions/thanks.svg";
import { cn } from "../../lib/utils";
import { getImReactionCategory, IM_JUDGEMENT_REPLIES } from "./reaction-policy";

type JudgementReactionValue = (typeof IM_JUDGEMENT_REPLIES)[number];

const judgementIconUrl: Record<JudgementReactionValue, string> = {
  OK: okIcon,
  NO: noIcon,
  Pending: pendingIcon,
  "+1": plusOneIcon,
  Done: doneIcon,
  Cool: coolIcon,
  Good: goodIcon,
  Thanks: thanksIcon
};

export function JudgementReactionIcon({
  value,
  className
}: {
  value: JudgementReactionValue;
  className?: string;
}) {
  return (
    <img
      alt={value}
      className={cn("block h-auto max-h-[26px] max-w-full", className)}
      src={judgementIconUrl[value]}
    />
  );
}

export function ImReactionValue({ value, className }: { value: string; className?: string }) {
  return getImReactionCategory(value) === "judgement" ? (
    <JudgementReactionIcon className={className} value={value as JudgementReactionValue} />
  ) : (
    <span className={className}>{value}</span>
  );
}
