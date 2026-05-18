import type { ReactNode } from "react";
import { hasLocalizedTitleText } from "../../lib/utils";
import { Button } from "./Button";
import { TitleWithInfo } from "./TitleWithInfo";

export function PageHeader({
  eyebrow,
  title,
  description,
  children
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && hasLocalizedTitleText(eyebrow) ? <p className="text-xs font-bold uppercase text-moss">{eyebrow}</p> : null}
        <TitleWithInfo
          as="h1"
          className="mt-1"
          info={description ?? `${title}页当前展示与本模块相关的数据、入口和主要动作。`}
          label={`${title}说明`}
          title={title}
          titleClassName="text-2xl font-bold text-ink md:text-3xl"
          variant="paper"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {children ?? (
          <>
            <Button variant="secondary">导出</Button>
            <Button>新建</Button>
          </>
        )}
      </div>
    </div>
  );
}
