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

  it("restores remembered frontend portal authorization from protected route navigation", () => {
    expect(requirePortalAuthSource).toContain("hasRememberedPortalAuthorization(portal)");
    expect(requirePortalAuthSource).toContain("switchPortal(portal)");
    expect(requirePortalAuthSource).not.toContain("needsPortalSync");
  });

  it("keeps backend and formal finance routes on direct portal access instead of remembered frontend authorization", () => {
    expect(requirePortalAuthSource).toContain('const isTechnicianPayrollRoute = portal === "technician" && location.pathname.startsWith("/technician/payroll");');
    expect(requirePortalAuthSource).toContain("const requiresDirectPortalAccess = isBackendPortalRoute || isTechnicianPayrollRoute;");
    expect(requirePortalAuthSource).toContain("const hasAccess = hasDirectAccess || (!requiresDirectPortalAccess && canEnterPortal(portal));");
    expect(requirePortalAuthSource).toContain("const canRestoreRememberedPortal = !requiresDirectPortalAccess && hasRememberedPortalAuthorization(portal);");
  });

  it("does not let a temporary frontend bypass session enter direct-access routes", () => {
    expect(requirePortalAuthSource).toContain("const hasBlockedFrontendBypass = requiresDirectPortalAccess && isFrontendBypassSession(session);");
    expect(requirePortalAuthSource).toContain("!isAuthenticated || !hasAccess || hasBlockedFrontendBypass");
  });

  it("keeps explicit identity switching inside the settings identity page", () => {
    expect(settingsPortalPageSource).toContain("void switchPortal(nextPortal);");
    expect(settingsPortalPageSource).not.toContain("await switchPortal(nextPortal)");
    expect(settingsPortalPageSource).toContain("settingsPortalTarget: nextPortal");
  });
});
