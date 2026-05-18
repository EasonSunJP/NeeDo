import type { ReactNode } from "react";
import { PageHeader } from "../ui/PageHeader";

export function ModuleShell({
  title,
  description,
  children,
  actions
}: {
  title: string;
  description: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="space-y-5">
      <PageHeader title={title} description={description}>
        {actions}
      </PageHeader>
      {children}
    </div>
  );
}
