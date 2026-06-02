import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { type PortalScope, useAuth } from "../../auth/AuthProvider";

type AdminAccountMenuProps = {
  accountName: string;
  fallbackEmail?: string;
  loginPath: string;
  portal: Extract<PortalScope, "admin" | "merchant">;
  roleLabel: string;
};

const loginMethodLabels = {
  "frontend-bypass": "前台临时",
  password: "账号密码",
  "verification-code": "验证码",
  gmail: "Gmail",
  qr: "扫码"
} as const;

function GearIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M10.4 4.3 10 6.2a6.9 6.9 0 0 0-1.2.5L7.1 5.7 5.7 7.1l1 1.7a6.9 6.9 0 0 0-.5 1.2l-1.9.4v2l1.9.4c.1.4.3.8.5 1.2l-1 1.7 1.4 1.4 1.7-1c.4.2.8.4 1.2.5l.4 1.9h2l.4-1.9c.4-.1.8-.3 1.2-.5l1.7 1 1.4-1.4-1-1.7c.2-.4.4-.8.5-1.2l1.9-.4v-2l-1.9-.4a6.9 6.9 0 0 0-.5-1.2l1-1.7-1.4-1.4-1.7 1a6.9 6.9 0 0 0-1.2-.5l-.4-1.9h-2Z"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
      <path d="M12 9.2a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6Z" stroke="currentColor" strokeWidth="1.9" />
    </svg>
  );
}

export function AdminAccountMenu({ accountName, fallbackEmail = "admin@example.com", loginPath, portal, roleLabel }: AdminAccountMenuProps) {
  const { logout, session } = useAuth();
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [passwordNoticeVisible, setPasswordNoticeVisible] = useState(false);
  const isCurrentPortalSession = session?.portal === portal;
  const email = isCurrentPortalSession ? session.email : fallbackEmail;
  const username = isCurrentPortalSession ? session.username : fallbackEmail;
  const loginMethod = loginMethodLabels[isCurrentPortalSession ? session.loginMethod : "password"];

  useEffect(() => {
    if (!open) {
      return;
    }

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const handleLogout = () => {
    setOpen(false);
    logout();
    navigate(loginPath, { replace: true });
  };

  return (
    <div className="admin-account-menu-root relative" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-label="账号设置"
        className="admin-account-trigger admin-logo-mark focus-ring grid h-10 w-10 place-items-center rounded-lg text-white"
        onClick={() => {
          setOpen((current) => !current);
          setPasswordNoticeVisible(false);
        }}
        type="button"
      >
        <GearIcon />
      </button>

      {open ? (
        <div className="admin-account-popover">
          <div className="admin-account-popover-header">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-ink/45">账号信息</p>
            <h2 className="mt-2 truncate text-base font-black text-ink">{accountName}</h2>
            <p className="mt-1 text-xs font-semibold text-ink/55">{roleLabel}</p>
          </div>

          <div className="mt-3 space-y-2 text-xs font-bold text-ink/65">
            <div className="admin-account-info-row">
              <span>账号</span>
              <strong>{username}</strong>
            </div>
            <div className="admin-account-info-row">
              <span>邮箱</span>
              <strong>{email}</strong>
            </div>
            <div className="admin-account-info-row">
              <span>登录方式</span>
              <strong>{loginMethod}</strong>
            </div>
          </div>

          {passwordNoticeVisible ? <p className="admin-account-password-note">演示环境暂不保存新密码，正式环境将在账号安全中完成修改。</p> : null}

          <div className="mt-3 grid gap-2">
            <button className="admin-account-action" onClick={() => setPasswordNoticeVisible(true)} type="button">
              修改密码
            </button>
            <button className="admin-account-action is-danger" onClick={handleLogout} type="button">
              登出
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
