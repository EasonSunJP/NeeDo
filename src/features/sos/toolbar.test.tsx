// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { BackofficeHeaderActions } from "./BackofficeHeaderActions";
vi.mock("./SosAlertsButton", () => ({ SosAlertsButton: () => <button>SOS</button> }));
vi.mock("../../components/ui/LanguageSwitcher", () => ({ LanguageSwitcher: () => <button>Language</button> }));
vi.mock("../../components/admin/AdminThemeMenu", () => ({ AdminThemeMenu: () => <button>Theme</button> }));
vi.mock("../../i18n/I18nProvider", () => ({ useOptionalI18n: () => ({ language: "zh" }) }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it("keeps the formal inbox action, unread badge and navigation between theme and support", async () => {
  const container = document.createElement("div"); const root = createRoot(container);
  try {
    await act(async () => root.render(<MemoryRouter><BackofficeHeaderActions
      theme={"blue-black"} themeOptions={[]} onThemeChange={() => {}}
      messageAction={<a href="/admin/notifications/inbox">Inbox <span>3</span></a>}
      supportTo="/admin/support"
    /></MemoryRouter>));
    const actions = [...container.querySelectorAll("button,a")];
    expect(actions.map(a => a.textContent)).toEqual(["SOS", "Language", "Theme", "Inbox 3", ""]);
    expect(actions[3].getAttribute("href")).toBe("/admin/notifications/inbox");
    expect(actions[4].getAttribute("href")).toBe("/admin/support");
  } finally { await act(async () => root.unmount()); }
});
