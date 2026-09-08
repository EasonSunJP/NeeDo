import type { ReactNode } from "react";
import {
  MobileFullscreenBackButton,
  MobileFullscreenCloseButton
} from "../mobile/MobileFullscreenHeader";
import { FloatingHomeHeader } from "../mobile/FloatingHomeHeader";
import { ScheduleSearchField } from "./ScheduleSearchField";

export function SchedulePageHeader({
  ariaLabel,
  backLabel = "返回",
  closeLabel = "关闭",
  footer,
  onBack,
  onChange,
  onClose,
  placeholder = "搜索日程",
  value
}: {
  ariaLabel?: string;
  backLabel?: string;
  closeLabel?: string;
  footer?: ReactNode;
  onBack: () => void;
  onChange: (value: string) => void;
  onClose: () => void;
  placeholder?: string;
  value: string;
}) {
  const searchLabel = ariaLabel ?? placeholder;

  return (
    <FloatingHomeHeader className="relative z-10" panelClassName="relative overflow-hidden">
      <div className="flex items-center gap-2" data-page-drag-ignore="true">
        <MobileFullscreenBackButton label={backLabel} onBack={onBack} />
        <ScheduleSearchField
          ariaLabel={searchLabel}
          className="min-w-0 flex-1"
          onChange={onChange}
          placeholder={placeholder}
          showSubmitAction={false}
          value={value}
        />
        <MobileFullscreenCloseButton label={closeLabel} onClose={onClose} />
      </div>
      {footer ? <div className="mt-3">{footer}</div> : null}
    </FloatingHomeHeader>
  );
}
