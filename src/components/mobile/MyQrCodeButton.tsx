import { cn } from "../../lib/utils";

export type MyQrCodePurpose = "friend" | "payment";

const myQrCodePurposeOptions: Array<{
  value: MyQrCodePurpose;
  label: string;
  title: string;
  idPrefix: string;
  caption: string;
}> = [
  {
    value: "friend",
    label: "加好友用",
    title: "我的二维码",
    idPrefix: "NeeDo ID",
    caption: "对方扫码后可以添加好友并开始聊天。"
  },
  {
    value: "payment",
    label: "付款用",
    title: "我的付款码",
    idPrefix: "Pay ID",
    caption: "对方扫码后可以向我付款或发起收款确认。"
  }
];

export function MyQrCodeIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={cn("h-6 w-6", className)} fill="none" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" />
      <rect fill="currentColor" height="3.25" rx="0.75" width="3.25" x="6.15" y="6.15" />
      <rect fill="currentColor" height="3.25" rx="0.75" width="3.25" x="14.6" y="6.15" />
      <rect fill="currentColor" height="3.25" rx="0.75" width="3.25" x="6.15" y="14.6" />
      <path d="M11 6.9h2.15v2.15H11V6.9ZM10.95 10.95h2.15v2.15h-2.15v-2.15ZM13.1 13.1h2.15v2.15H13.1V13.1ZM15.25 10.95h2.15v2.15h-2.15v-2.15ZM10.95 15.25h2.15v2.15h-2.15v-2.15ZM15.25 15.25h2.15v2.15h-2.15v-2.15ZM8.8 10.95h2.15v2.15H8.8v-2.15Z" fill="currentColor" />
    </svg>
  );
}

export function MyQrCodeDisplay({
  className,
  idLabel = "USER-DEMO-001",
  onPurposeChange,
  purpose
}: {
  className?: string;
  idLabel?: string;
  onPurposeChange: (purpose: MyQrCodePurpose) => void;
  purpose: MyQrCodePurpose;
}) {
  const activeOption = myQrCodePurposeOptions.find((option) => option.value === purpose) ?? myQrCodePurposeOptions[0];

  return (
    <section
      className={cn(
        "rounded-[28px] border border-[color:color-mix(in_srgb,var(--client-line)_70%,transparent)] bg-[color:color-mix(in_srgb,var(--client-surface)_88%,var(--client-bg)_12%)] p-5 text-center text-[color:var(--client-text)] shadow-[0_18px_44px_color-mix(in_srgb,var(--client-shadow)_16%,transparent)]",
        className
      )}
    >
      <p className="text-xs font-black uppercase text-[color:var(--client-muted)]">{activeOption.title}</p>
      <div className="mx-auto mt-4 grid aspect-square w-full max-w-[260px] place-items-center rounded-[34px] border-[10px] border-black bg-white text-black shadow-[0_20px_42px_rgba(0,0,0,0.16)]">
        <MyQrCodeIcon className="h-[68%] w-[68%]" />
      </div>
      <p className="mt-4 text-sm font-black text-[color:var(--client-text)]">
        {activeOption.idPrefix}: {idLabel}
      </p>
      <p className="mt-1 text-xs font-semibold leading-5 text-[color:var(--client-muted)]">{activeOption.caption}</p>
      <div aria-label="二维码用途" className="mt-4 grid grid-cols-2 gap-2 rounded-[22px] bg-[color:color-mix(in_srgb,var(--client-bg)_68%,transparent)] p-1" role="group">
        {myQrCodePurposeOptions.map((option) => {
          const active = option.value === purpose;

          return (
            <button
              aria-pressed={active}
              className={cn(
                "focus-ring min-h-11 rounded-[18px] px-3 text-sm font-black transition",
                active
                  ? "bg-[color:var(--client-primary)] text-[color:var(--pin-badge-glyph)] shadow-[0_12px_28px_color-mix(in_srgb,var(--client-primary)_30%,transparent)]"
                  : "text-[color:var(--client-muted)]"
              )}
              key={option.value}
              onClick={() => onPurposeChange(option.value)}
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
