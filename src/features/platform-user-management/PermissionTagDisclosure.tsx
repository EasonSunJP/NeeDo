import { useMemo, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import type { Language } from "../../i18n/translations";

type PermissionRole = {
  code: string;
  name: string;
  scopeType?: string | null;
  scopeId?: number | null;
  permissions: string[];
};

const copy: Record<Language, { empty: string; expand: string; collapse: string }> = {
  zh: { empty: "当前没有正式角色记录", expand: "展开权限", collapse: "收起权限" },
  "zh-Hant": { empty: "目前沒有正式角色記錄", expand: "展開權限", collapse: "收起權限" },
  ja: { empty: "正式なロール記録はありません", expand: "権限を展開", collapse: "権限を折りたたむ" },
  en: { empty: "No formal role records", expand: "Expand permissions", collapse: "Collapse permissions" },
  ko: { empty: "정식 역할 기록이 없습니다", expand: "권한 펼치기", collapse: "권한 접기" }
};

export function PermissionTagDisclosure({ roles }: { roles: PermissionRole[] }) {
  const { language } = useOptionalI18n();
  const labels = copy[language];
  const [expanded, setExpanded] = useState(false);
  const uniquePermissions = useMemo(
    () => roles.map((role) => ({ ...role, permissions: [...new Set(role.permissions)] })),
    [roles]
  );

  if (roles.length === 0) {
    return <p className="text-sm font-bold text-ink/50">{labels.empty}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {roles.map((role) => (
          <Badge key={`${role.code}-${role.name}`} tone="dark">
            {role.name}
          </Badge>
        ))}
      </div>
      <Button
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
        size="sm"
        variant="secondary"
      >
        {expanded ? labels.collapse : labels.expand}
      </Button>
      {expanded ? (
        <div className="grid gap-3">
          {uniquePermissions.map((role) => (
            <article className="rounded-lg border border-line bg-paper p-3" key={`${role.code}-${role.scopeType}-${role.scopeId}`}>
              <div className="mb-2 flex flex-wrap gap-2">
                <Badge tone="dark">{role.code}</Badge>
                <Badge tone="blue">{role.scopeType ?? "global"}{role.scopeId === null || role.scopeId === undefined ? "" : `:${role.scopeId}`}</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {role.permissions.map((permission) => (
                  <Badge key={permission}>{permission}</Badge>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
