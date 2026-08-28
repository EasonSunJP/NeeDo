import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Button } from "../ui/Button";
import { MyQrCodeDisplay, type MyQrCodePurpose } from "./MyQrCodeButton";

function ScanGlyph() {
  return (
    <svg aria-hidden="true" className="h-9 w-9" fill="none" viewBox="0 0 24 24">
      <path d="M5 5h5v5H5V5ZM14 5h5v5h-5V5ZM5 14h5v5H5v-5ZM14 14h2.5M19 14v5h-5v-2.5M17 17h2" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.9" />
    </svg>
  );
}

export function UnifiedScanSimulator({
  className,
  error,
  friendResult,
  idLabel,
  myQrPurpose,
  onMyQrPurposeChange,
  onResolveToken,
  onTokenChange,
  token
}: {
  className?: string;
  error?: string | null;
  friendResult?: ReactNode;
  idLabel?: string;
  myQrPurpose: MyQrCodePurpose;
  onMyQrPurposeChange: (purpose: MyQrCodePurpose) => void;
  onResolveToken: (token: string) => void;
  onTokenChange: (token: string) => void;
  token: string;
}) {
  return (
    <div className={cn("space-y-4", className)}>
      <MyQrCodeDisplay idLabel={idLabel ?? ""} onPurposeChange={onMyQrPurposeChange} purpose={myQrPurpose} />

      <section className="rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_72%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,var(--client-bg)_12%)] p-4 text-[color:var(--client-text)] shadow-[0_16px_38px_color-mix(in_srgb,var(--client-shadow)_12%,transparent)]">
        <div className="rounded-[24px] border border-dashed border-[color:color-mix(in_srgb,var(--client-line)_76%,transparent)] bg-[color:color-mix(in_srgb,var(--client-bg)_76%,transparent)] px-4 py-8 text-center">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-[26px] bg-[color:var(--client-text)] text-[color:var(--client-bg)]">
            <ScanGlyph />
          </div>
        </div>

        <p className="mt-4 text-center text-xs font-bold leading-5 text-[color:var(--client-muted)]">
          摄像头扫码接入前，仅接受由正式服务端签发的二维码 Token 或 Deep Link。
        </p>
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

    </div>
  );
}
