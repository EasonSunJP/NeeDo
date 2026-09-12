import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SettingsSectionHeader } from "./SettingsDirectory";

describe("SettingsSectionHeader", () => {
  it("uses an explicit localized information label without changing the shared default", () => {
    const localized = renderToString(
      <SettingsSectionHeader
        description="表示内容の説明"
        infoLabel="外観とシステムの説明を表示"
        title="外観とシステム"
      />
    );
    const defaultLabel = renderToString(
      <SettingsSectionHeader description="说明" title="通用设置" />
    );

    expect(localized).toContain('aria-label="外観とシステムの説明を表示"');
    expect(defaultLabel).toContain('aria-label="查看通用设置说明"');
  });
});
