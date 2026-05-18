import type { ReactNode } from "react";
import { adminLoginQrTokens } from "../../auth/adminLogin";
import { cn } from "../../lib/utils";
import { Button } from "../ui/Button";
import { MyQrCodeDisplay, MyQrCodeIcon, type MyQrCodePurpose } from "./MyQrCodeButton";

const dineInDemoTokens = [
  { label: "点餐二维码", token: "qr-table-a08", caption: "A区 8号桌" },
  { label: "包厢二维码", token: "qr-room-vip3", caption: "VIP 3号包厢" },
  { label: "床位二维码", token: "qr-bed-2", caption: "2号床" },
  { label: "结账二维码", token: "qr-checkout-a08", caption: "桌台账单" }
];

const adminLoginDemoTokens = [
  { label: "运营后台登录码", token: adminLoginQrTokens.admin, caption: "确认 PC 端运营后台登录" },
  { label: "商户后台登录码", token: adminLoginQrTokens["merchant-admin"], caption: "确认 PC 端商户后台登录" }
];

function ScanGlyph() {
  return (
    <svg aria-hidden="true" className="h-9 w-9" fill="none" viewBox="0 0 24 24">
      <path d="M5 5h5v5H5V5ZM14 5h5v5h-5V5ZM5 14h5v5H5v-5ZM14 14h2.5M19 14v5h-5v-2.5M17 17h2" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.9" />
    </svg>
  );
}

function ScanTokenButton({
  caption,
  label,
  onClick,
  token
}: {
  caption: string;
  label: string;
  onClick: () => void;
  token: string;
}) {
  return (
    <button
      className="focus-ring min-h-[104px] rounded-[24px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,var(--client-bg)_12%)] p-4 text-left text-[color:var(--client-text)] shadow-[0_12px_30px_color-mix(in_srgb,var(--client-shadow)_10%,transparent)] transition hover:border-[color:color-mix(in_srgb,var(--client-primary)_42%,var(--client-line))]"
      onClick={onClick}
      type="button"
    >
      <span className="text-xs font-black text-[color:var(--client-primary)]">{label}</span>
      <strong className="mt-1 block truncate text-sm">{caption}</strong>
      <span className="mt-3 block truncate text-[11px] font-bold text-[color:color-mix(in_srgb,var(--client-muted)_72%,transparent)]">{token}</span>
    </button>
  );
}

export function UnifiedScanSimulator({
  className,
  error,
  friendResult,
  friendScanDisabled = false,
  idLabel,
  myQrPurpose,
  onMyQrPurposeChange,
  onResolveToken,
  onScanFriend,
  onTokenChange,
  token
}: {
  className?: string;
  error?: string | null;
  friendResult?: ReactNode;
  friendScanDisabled?: boolean;
  idLabel?: string;
  myQrPurpose: MyQrCodePurpose;
  onMyQrPurposeChange: (purpose: MyQrCodePurpose) => void;
  onResolveToken: (token: string) => void;
  onScanFriend?: () => void;
  onTokenChange: (token: string) => void;
  token: string;
}) {
  return (
    <div className={cn("space-y-4", className)}>
      <MyQrCodeDisplay idLabel={idLabel} onPurposeChange={onMyQrPurposeChange} purpose={myQrPurpose} />

      <section className="rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,var(--client-bg)_12%)] p-4 text-[color:var(--client-text)] shadow-[0_16px_38px_color-mix(in_srgb,var(--client-shadow)_12%,transparent)]">
        <div className="rounded-[24px] border border-dashed border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_76%,transparent)] px-4 py-8 text-center">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-[26px] bg-[color:var(--client-text)] text-[color:var(--client-bg)]">
            <ScanGlyph />
          </div>
        </div>

        <div className="mt-4 grid gap-2 min-[380px]:grid-cols-2">
          {onScanFriend ? (
            <button
              className="focus-ring flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[color:var(--client-primary)] px-3 text-sm font-black text-[color:var(--pin-badge-glyph)] shadow-[0_16px_34px_color-mix(in_srgb,var(--client-primary)_32%,transparent)] disabled:cursor-not-allowed disabled:opacity-45"
              disabled={friendScanDisabled}
              onClick={onScanFriend}
              type="button"
            >
              <MyQrCodeIcon className="h-5 w-5 shrink-0" />
              <span className="min-w-0 truncate">模拟添加好友二维码</span>
            </button>
          ) : null}
          <button
            className="focus-ring flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[color:color-mix(in_srgb,var(--client-primary)_36%,transparent)] bg-[color:color-mix(in_srgb,var(--client-primary)_10%,var(--client-surface))] px-3 text-sm font-black text-[color:var(--client-primary)] shadow-[0_12px_28px_color-mix(in_srgb,var(--client-shadow)_12%,transparent)]"
            onClick={() => onResolveToken("qr-table-a08")}
            type="button"
          >
            <MyQrCodeIcon className="h-5 w-5 shrink-0" />
            <span className="min-w-0 truncate">模拟点餐二维码</span>
          </button>
        </div>
      </section>

      {friendResult}

      <section className="rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,var(--client-bg)_12%)] p-4 text-[color:var(--client-text)] shadow-[0_16px_38px_color-mix(in_srgb,var(--client-shadow)_12%,transparent)]">
        <label className="block">
          <span className="mb-2 block text-xs font-black text-[color:var(--client-muted)]">二维码 Token / Deep Link</span>
          <input
            className="h-12 w-full rounded-2xl border border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_76%,transparent)] px-4 text-sm font-bold text-[color:var(--client-text)] outline-none placeholder:text-[color:var(--client-muted)] focus:border-[color:var(--client-primary)]"
            onChange={(event) => onTokenChange(event.target.value)}
            value={token}
          />
        </label>
        {error ? (
          <p className="mt-3 rounded-2xl bg-coral/10 px-3 py-2 text-sm font-bold text-[#a63f32]">{error}</p>
        ) : null}
        <Button className="mt-4 w-full rounded-2xl" onClick={() => onResolveToken(token)} size="lg">
          解析并打开
        </Button>
      </section>

      <section className="grid grid-cols-2 gap-3">
        {dineInDemoTokens.map((item) => (
          <ScanTokenButton
            caption={item.caption}
            key={item.token}
            label={item.label}
            onClick={() => onResolveToken(item.token)}
            token={item.token}
          />
        ))}
      </section>

      <section className="rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,var(--client-bg)_12%)] p-4 text-[color:var(--client-text)] shadow-[0_16px_38px_color-mix(in_srgb,var(--client-shadow)_12%,transparent)]">
        <p className="text-sm font-black">后台扫码登录</p>
        <p className="mt-1 text-xs font-bold leading-5 text-[color:var(--client-muted)]">从 PC 端后台登录页扫码后，手机端在这里确认对应后台登录。</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {adminLoginDemoTokens.map((item) => (
            <ScanTokenButton
              caption={item.caption}
              key={item.token}
              label={item.label}
              onClick={() => onResolveToken(item.token)}
              token={item.token}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
