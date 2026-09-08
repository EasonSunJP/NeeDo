import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { AdminThemeMenu } from "../../components/admin/AdminThemeMenu";
import { LanguageSwitcher } from "../../components/ui/LanguageSwitcher";
import { NotificationBadge } from "../../components/ui/NotificationBadge";
import type { AdminTheme, AdminThemeOption } from "../../theme/AdminTheme";
import { SosAlertsButton } from "./SosAlertsButton";
import { useSosText } from "./i18n";

export function BackofficeHeaderActions({ theme, onThemeChange, themeOptions, messageCount = 0, messagesTo = "", messageAction, supportTo }: {
  theme: AdminTheme; onThemeChange: (theme: AdminTheme) => void;
  themeOptions: readonly AdminThemeOption[]; messageCount?: number; messagesTo?: string; messageAction?: ReactNode; supportTo: string;
}) {
  const t = useSosText();
  return <div className="backoffice-header-actions">
    <SosAlertsButton />
    <LanguageSwitcher className="shrink-0" iconOnly />
    <AdminThemeMenu onThemeChange={onThemeChange} options={themeOptions} theme={theme} />
    {messageAction ? <span className="backoffice-message-action">{messageAction}</span> : <NavLink aria-label={t("messages")} className="backoffice-action focus-ring" to={messagesTo} data-no-i18n>
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24"><path d="M12 4a6 6 0 0 0-6 6v2.5L4.7 15a1 1 0 0 0 .7 1.7H18.6a1 1 0 0 0 .7-1.7L18 12.5V10a6 6 0 0 0-6-6ZM9.5 19a2.5 2.5 0 0 0 5 0" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" /></svg>
      {messageCount > 0 ? <NotificationBadge className="absolute right-1 top-1" count={messageCount} size="sm" /> : null}
    </NavLink>}
    <NavLink aria-label={t("support")} className="backoffice-action focus-ring" to={supportTo} data-no-i18n>
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24"><path d="M4 13.5a8 8 0 0 1 16 0v3a2 2 0 0 1-2 2h-1.2a1.8 1.8 0 0 1-1.8-1.8v-1.4a1.8 1.8 0 0 1 1.8-1.8H18v-.2a6 6 0 0 0-12 0v.2h1.2A1.8 1.8 0 0 1 9 15.3v1.4a1.8 1.8 0 0 1-1.8 1.8H6a2 2 0 0 1-2-2v-3ZM12 18.5h2.5a2 2 0 0 0 2-2" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" /></svg>
    </NavLink>
  </div>;
}
