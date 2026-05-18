import { Fragment } from "react";
import { cn } from "../../lib/utils";

const hashtagRegex = /#[\w\u4e00-\u9fff-]+/g;

type TextSegment =
  | { type: "text"; value: string }
  | { type: "tag"; value: string };

function splitTagSegments(text: string) {
  const segments: TextSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(hashtagRegex)) {
    const offset = match.index ?? 0;

    if (offset > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, offset) });
    }

    segments.push({ type: "tag", value: match[0] });
    lastIndex = offset + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }

  if (segments.length === 0) {
    segments.push({ type: "text", value: text });
  }

  return segments;
}

export function HighlightedTagText({
  text,
  className,
  tagClassName
}: {
  text: string;
  className?: string;
  tagClassName?: string;
}) {
  return (
    <span className={cn("whitespace-pre-wrap break-words", className)}>
      {splitTagSegments(text).map((segment, index) => {
        if (segment.type === "tag") {
          return (
            <span className={cn("font-black text-[color:var(--client-primary)]", tagClassName)} key={`${segment.value}-${index}`}>
              {segment.value}
            </span>
          );
        }

        return <Fragment key={`${segment.value}-${index}`}>{segment.value}</Fragment>;
      })}
    </span>
  );
}
