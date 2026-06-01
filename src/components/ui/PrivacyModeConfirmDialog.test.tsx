import { describe, expect, it } from "vitest";
import source from "./PrivacyModeConfirmDialog.tsx?raw";

describe("PrivacyModeConfirmDialog", () => {
  it("uses the shared privacy confirmation copy and actions", () => {
    expect(source).toContain("打开隐私模式后，本账号将不会在检索结果中显示，确定要开启吗？");
    expect(source).toContain('data-testid="privacy-mode-confirm-dialog"');
    expect(source).toContain("bg-[#160307]/78");
    expect(source).toContain("border-[#ff4d5e]");
    expect(source).toContain('className="mx-auto mb-3 grid h-16 w-16');
    expect(source).toMatch(/>\s*!\s*<\/div>/);
    expect(source).toContain('cancelLabel = "取消"');
    expect(source).toContain('confirmLabel = "确定"');
    expect(source).toContain("message = privacyModeConfirmMessage");
    expect(source).toContain("showConfirmAction = true");
    expect(source).toContain("showConfirmAction ? \"mt-4 grid grid-cols-2 gap-2\" : \"mt-4 grid gap-2\"");

    const actionsSource = source.slice(source.indexOf("showConfirmAction ? ("));

    expect(actionsSource.indexOf("{confirmLabel}")).toBeLessThan(actionsSource.indexOf("{cancelLabel}"));
    expect(actionsSource.indexOf("onClick={onConfirm ?? onCancel}")).toBeLessThan(actionsSource.indexOf("onClick={onCancel}"));
    expect(source).toContain("取消");
    expect(source).toContain("确定");
  });
});
