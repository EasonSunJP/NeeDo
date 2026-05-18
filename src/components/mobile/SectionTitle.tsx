import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { TitleWithInfo } from "../ui/TitleWithInfo";

export function SectionTitle({
  title,
  caption,
  to,
  children
}: {
  title: string;
  caption?: string;
  to?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between gap-3">
        <TitleWithInfo
          as="h2"
          info={caption ?? `${title}板块用于汇总当前页面里的相关信息与操作。`}
          label={`${title} 简介`}
          title={title}
          titleClassName="text-lg font-bold"
          variant="paper"
        />
        <div className="flex items-center gap-2">
          {children}
          {to && (
            <Link className="text-sm font-bold text-moss" to={to}>
              查看全部
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
