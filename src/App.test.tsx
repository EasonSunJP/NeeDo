import { describe, expect, it } from "vitest";
import appSource from "./App.tsx?raw";
import settingsSource from "./features/settings/UnifiedSettingsPages.tsx?raw";

function sliceBetween(source: string, startToken: string, endToken: string) {
  return source.slice(source.indexOf(startToken), source.indexOf(endToken));
}

describe("portal identity switching boundaries", () => {
  const requirePortalAuthSource = sliceBetween(appSource, "function RequirePortalAuth", "function LegacyBusinessRedirect");
  const settingsPortalPageSource = sliceBetween(
    settingsSource,
    "export function UnifiedSettingsPortalPage",
    "function UserProfileSettingsPage"
  );

  it("does not switch the active identity from ordinary protected route navigation", () => {
    expect(requirePortalAuthSource).not.toContain("switchPortal");
    expect(requirePortalAuthSource).not.toContain("needsPortalSync");
  });

  it("keeps explicit identity switching inside the settings identity page", () => {
    expect(settingsPortalPageSource).toContain("void switchPortal(nextPortal);");
    expect(settingsPortalPageSource).toContain("settingsPortalTarget: nextPortal");
  });
});
