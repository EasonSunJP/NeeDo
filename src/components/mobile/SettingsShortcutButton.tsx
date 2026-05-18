import { IconButton } from "../client-ui/AppScaffold";

export function SettingsShortcutButton({
  to,
  onClick,
  tone = "paper",
  className,
  label = "打开设置"
}: {
  to?: string;
  onClick?: () => void;
  tone?: "paper" | "inverse";
  className?: string;
  label?: string;
}) {
  void tone;

  return <IconButton className={className} icon="settings" label={label} onClick={onClick} to={to} />;
}
