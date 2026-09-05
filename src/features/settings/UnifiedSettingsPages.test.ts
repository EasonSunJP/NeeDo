// @vitest-environment jsdom
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FormalAccountSecurityPanel,
  getPortalEntry,
  resolveSettingsSelectedPortal,
  shouldKeepSettingsRoutePortal,
  summarizeAccountStatus,
  summarizeProfileStatus
} from "./UnifiedSettingsPages";
import { translateText, type Language } from "../../i18n/translations";
import backendPortalSource from "./TestOnlyBackendPortalEntries.tsx?raw";
import source from "./UnifiedSettingsPages.tsx?raw";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const accountSecurityMocks = vi.hoisted(() => ({
  getGoogleLinkStatus: vi.fn(),
  initializeGoogleLink: vi.fn(),
  requestGoogleCredential: vi.fn(),
  startGoogleUnlink: vi.fn(),
  startPasswordSetup: vi.fn(),
  submitGoogleLinkCredential: vi.fn(),
  verifyGoogleLink: vi.fn(),
  verifyGoogleUnlink: vi.fn(),
  verifyPasswordSetup: vi.fn()
}));

vi.mock("../../api/auth", () => ({
  authApi: {
    getGoogleLinkStatus: accountSecurityMocks.getGoogleLinkStatus,
    initializeGoogleLink: accountSecurityMocks.initializeGoogleLink,
    startGoogleUnlink: accountSecurityMocks.startGoogleUnlink,
    startPasswordSetup: accountSecurityMocks.startPasswordSetup,
    submitGoogleLinkCredential: accountSecurityMocks.submitGoogleLinkCredential,
    verifyGoogleLink: accountSecurityMocks.verifyGoogleLink,
    verifyGoogleUnlink: accountSecurityMocks.verifyGoogleUnlink,
    verifyPasswordSetup: accountSecurityMocks.verifyPasswordSetup
  }
}));

vi.mock("../../auth/googleIdentity", () => ({
  requestGoogleCredential: accountSecurityMocks.requestGoogleCredential
}));

const serviceRangeSource = source.slice(source.indexOf("export function UnifiedSettingsServiceRangePage"), source.indexOf("export function UnifiedSettingsAccountPage"));

const accountSession = {
  email: "owner@needo.example",
  emailVerifiedAt: "2026-08-27T00:00:00.000Z",
  needoId: "u0000000042",
  primaryPublicId: "u0000000042",
  activePublicId: "u0000000042",
  username: "可编辑昵称"
};
const accountChallenge = {
  challengeId: "91de6957-9290-418d-bc65-fb46322e7b0d",
  cooldownSeconds: 0,
  expiresIn: 600,
  maskedEmail: "ow***@needo.example"
};
let accountContainer: HTMLDivElement | null = null;
let accountRoot: Root | null = null;

async function waitForAccount(assertion: () => void) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => new Promise((resolve) => window.setTimeout(resolve, 0)));
    }
  }
  throw lastError;
}

function accountButton(label: string) {
  const button = Array.from(accountContainer?.querySelectorAll("button") ?? []).find((element) => element.textContent?.includes(label));
  if (!button) throw new Error(`Could not find account-security button: ${label}`);
  return button;
}

async function clickAccount(element: Element) {
  await act(async () => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

async function enterAccountValue(element: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    setValue?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function renderAccountSecurity(
  options: {
    onSessionRefresh?: () => Promise<void>;
    onSignedOut?: () => Promise<void>;
    strictMode?: boolean;
  } = {}
) {
  accountContainer = document.createElement("div");
  document.body.appendChild(accountContainer);
  accountRoot = createRoot(accountContainer);
  await act(async () => {
    const panel = createElement(FormalAccountSecurityPanel, {
        autoFocus: false,
        language: "zh",
        onSessionRefresh: options.onSessionRefresh ?? vi.fn(async () => undefined),
        onSignedOut: options.onSignedOut ?? vi.fn(async () => undefined),
        session: accountSession
      });
    accountRoot?.render(options.strictMode ? createElement(StrictMode, null, panel) : panel);
  });
}

describe("FormalAccountSecurityPanel", () => {
  beforeEach(() => {
    for (const mock of Object.values(accountSecurityMocks)) mock.mockReset();
    accountSecurityMocks.getGoogleLinkStatus.mockResolvedValue({
      canUnlink: false,
      hasPassword: true,
      linked: false,
      maskedEmail: null
    });
  });

  afterEach(async () => {
    if (accountRoot) await act(async () => accountRoot?.unmount());
    accountContainer?.remove();
    accountContainer = null;
    accountRoot = null;
  });

  it("shows an explicit loading state while the formal status request is pending", async () => {
    let resolveStatus: ((value: { canUnlink: boolean; hasPassword: boolean; linked: boolean; maskedEmail: null }) => void) | undefined;
    accountSecurityMocks.getGoogleLinkStatus.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStatus = resolve;
      })
    );

    await renderAccountSecurity();
    expect(accountContainer?.textContent).toContain("正在读取账户安全状态");

    await act(async () =>
      resolveStatus?.({
        canUnlink: false,
        hasPassword: true,
        linked: false,
        maskedEmail: null
      })
    );
    await waitForAccount(() => expect(accountContainer?.textContent).toContain("Google 账号未绑定"));
  });

  it("reaches a ready account-security state during StrictMode effect replay", async () => {
    await renderAccountSecurity({ strictMode: true });

    await waitForAccount(() => expect(accountContainer?.textContent).toContain("Google 账号未绑定"));
  });

  it("renders error/retry and keeps immutable identity separate from editable display name", async () => {
    accountSecurityMocks.getGoogleLinkStatus.mockRejectedValueOnce(new Error("error.network"));
    await renderAccountSecurity();
    await waitForAccount(() => expect(accountContainer?.textContent).toContain("账户安全状态读取失败"));
    expect(accountContainer?.textContent).toContain("u0000000042");
    expect(accountContainer?.textContent).toContain("owner@needo.example");
    expect(accountContainer?.textContent).toContain("可编辑昵称");
    await clickAccount(accountButton("重试"));
    await waitForAccount(() => expect(accountContainer?.textContent).toContain("Google 账号未绑定"));
    expect(accountSecurityMocks.getGoogleLinkStatus).toHaveBeenCalledTimes(2);
  });

  it("links a different Google email while verifying the NeeDo email", async () => {
    accountSecurityMocks.initializeGoogleLink.mockResolvedValue({
      clientId: "client.apps.googleusercontent.com",
      expiresIn: 600,
      nonce: "backend-nonce",
      nonceChallengeId: "nonce-challenge"
    });
    accountSecurityMocks.requestGoogleCredential.mockResolvedValue("different-google-user-credential");
    accountSecurityMocks.submitGoogleLinkCredential.mockResolvedValue(accountChallenge);
    accountSecurityMocks.verifyGoogleLink.mockResolvedValue({ linked: true });
    accountSecurityMocks.getGoogleLinkStatus
      .mockResolvedValueOnce({
        canUnlink: false,
        hasPassword: true,
        linked: false,
        maskedEmail: null
      })
      .mockResolvedValueOnce({
        canUnlink: true,
        hasPassword: true,
        linked: true,
        maskedEmail: "ot***@gmail.com"
      });
    await renderAccountSecurity();
    await waitForAccount(() => expect(accountContainer?.textContent).toContain("Google 账号未绑定"));
    await clickAccount(accountButton("绑定 Google 账号"));
    await waitForAccount(() => expect(accountContainer?.querySelector('[data-testid="auth-verification-panel"]')).not.toBeNull());
    expect(accountSecurityMocks.requestGoogleCredential).toHaveBeenCalledWith({
      clientId: "client.apps.googleusercontent.com",
      container: expect.any(HTMLElement),
      nonce: "backend-nonce",
      signal: expect.any(AbortSignal)
    });
    expect(accountSecurityMocks.submitGoogleLinkCredential).toHaveBeenCalledWith({
      credential: "different-google-user-credential",
      nonceChallengeId: "nonce-challenge"
    });
    expect(accountContainer?.textContent).toContain("ow***@needo.example");
    expect(accountContainer?.textContent).toContain("验证码仍发送到你的 NeeDo 邮箱");
    const otp = accountContainer?.querySelector<HTMLInputElement>('[data-testid="auth-verification-code"]');
    await enterAccountValue(otp!, "123456");
    await clickAccount(accountContainer!.querySelector('[data-testid="auth-verification-submit"]')!);
    await waitForAccount(() => expect(accountContainer?.textContent).toContain("ot***@gmail.com"));
    expect(accountSecurityMocks.verifyGoogleLink).toHaveBeenCalledWith({
      challengeId: accountChallenge.challengeId,
      otp: "123456"
    });
  });

  it("lets a Google-only account set a password before unlink becomes available", async () => {
    const onSessionRefresh = vi.fn(async () => undefined);
    accountSecurityMocks.getGoogleLinkStatus
      .mockResolvedValueOnce({
        canUnlink: false,
        hasPassword: false,
        linked: true,
        maskedEmail: "ot***@gmail.com"
      })
      .mockResolvedValueOnce({
        canUnlink: true,
        hasPassword: true,
        linked: true,
        maskedEmail: "ot***@gmail.com"
      });
    accountSecurityMocks.startPasswordSetup.mockResolvedValue(accountChallenge);
    accountSecurityMocks.verifyPasswordSetup.mockResolvedValue({
      hasPassword: true
    });
    await renderAccountSecurity({ onSessionRefresh });
    await waitForAccount(() => expect(accountContainer?.textContent).toContain("先设置密码后才能解除 Google 绑定"));
    expect((accountButton("解除 Google 绑定") as HTMLButtonElement).disabled).toBe(true);
    const newPasswordInput = accountContainer!.querySelector<HTMLInputElement>('[data-testid="account-security-new-password"]')!;
    const confirmPasswordInput = accountContainer!.querySelector<HTMLInputElement>('[data-testid="account-security-confirm-password"]')!;
    expect(newPasswordInput.getAttribute("aria-label")).toBe("输入新密码");
    expect(confirmPasswordInput.getAttribute("aria-label")).toBe("再次输入新密码");
    await enterAccountValue(newPasswordInput, "Stronger.2026!");
    await enterAccountValue(confirmPasswordInput, "Stronger.2026!");
    await clickAccount(accountButton("向 NeeDo 邮箱发送验证码"));
    await waitForAccount(() => expect(accountContainer?.querySelector('[data-testid="auth-verification-panel"]')).not.toBeNull());
    await enterAccountValue(accountContainer!.querySelector('[data-testid="auth-verification-code"]')!, "654321");
    await clickAccount(accountContainer!.querySelector('[data-testid="auth-verification-submit"]')!);
    await waitForAccount(() => expect(onSessionRefresh).toHaveBeenCalledTimes(1));
    expect(accountSecurityMocks.startPasswordSetup).toHaveBeenCalledWith({
      password: "Stronger.2026!"
    });
    expect((accountButton("解除 Google 绑定") as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not start password setup until both password entries match", async () => {
    accountSecurityMocks.getGoogleLinkStatus.mockResolvedValue({
      canUnlink: false,
      hasPassword: false,
      linked: true,
      maskedEmail: "ot***@gmail.com"
    });
    await renderAccountSecurity();
    await waitForAccount(() => expect(accountContainer?.textContent).toContain("先设置密码后才能解除 Google 绑定"));

    await enterAccountValue(accountContainer!.querySelector('[data-testid="account-security-new-password"]')!, "Stronger.2026!");
    await enterAccountValue(accountContainer!.querySelector('[data-testid="account-security-confirm-password"]')!, "Different.2026!");

    expect((accountButton("向 NeeDo 邮箱发送验证码") as HTMLButtonElement).disabled).toBe(true);
    expect(accountContainer?.textContent).toContain("两次输入的密码不一致");
    expect(accountSecurityMocks.startPasswordSetup).not.toHaveBeenCalled();
  });

  it("aborts a pending Google account selection when the security panel unmounts", async () => {
    let requestSignal: AbortSignal | undefined;
    accountSecurityMocks.initializeGoogleLink.mockResolvedValue({
      clientId: "client.apps.googleusercontent.com",
      expiresIn: 600,
      nonce: "backend-nonce",
      nonceChallengeId: "nonce-challenge"
    });
    accountSecurityMocks.requestGoogleCredential.mockImplementation(({ signal }: { signal?: AbortSignal }) => {
      requestSignal = signal;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new Error("error.auth.google_credential_cancelled")), { once: true });
      });
    });

    await renderAccountSecurity();
    await waitForAccount(() => expect(accountContainer?.textContent).toContain("Google 账号未绑定"));
    await clickAccount(accountButton("绑定 Google 账号"));
    await waitForAccount(() => expect(requestSignal).toBeDefined());

    await act(async () => accountRoot?.unmount());
    accountRoot = null;
    expect(requestSignal?.aborted).toBe(true);
    await act(async () => Promise.resolve());
  });

  it("keeps server unlink rejection authoritative and signs out only after explicit success", async () => {
    const onSignedOut = vi.fn(async () => undefined);
    accountSecurityMocks.getGoogleLinkStatus.mockResolvedValue({
      canUnlink: true,
      hasPassword: true,
      linked: true,
      maskedEmail: "ot***@gmail.com"
    });
    accountSecurityMocks.startGoogleUnlink.mockResolvedValue(accountChallenge);
    accountSecurityMocks.verifyGoogleUnlink.mockRejectedValueOnce(new Error("error.auth.google_conflict"));
    await renderAccountSecurity({ onSignedOut });
    await waitForAccount(() => expect(accountContainer?.textContent).toContain("ot***@gmail.com"));
    await clickAccount(accountButton("解除 Google 绑定"));
    await waitForAccount(() => expect(accountContainer?.querySelector('[data-testid="auth-verification-panel"]')).not.toBeNull());
    const otp = accountContainer!.querySelector<HTMLInputElement>('[data-testid="auth-verification-code"]')!;
    await enterAccountValue(otp, "123456");
    await clickAccount(accountContainer!.querySelector('[data-testid="auth-verification-submit"]')!);
    await waitForAccount(() => expect(accountContainer?.querySelector('[role="alert"]')?.textContent).toBeTruthy());
    expect(onSignedOut).not.toHaveBeenCalled();
    accountSecurityMocks.verifyGoogleUnlink.mockResolvedValueOnce({
      signedOut: true
    });
    await clickAccount(accountContainer!.querySelector('[data-testid="auth-verification-submit"]')!);
    await waitForAccount(() => expect(onSignedOut).toHaveBeenCalledTimes(1));
  });

  it("keeps every new account-security label translated in all five languages", () => {
    const sources = ["账户安全状态读取失败，请重试。", "NeeDo ID（不可修改）", "显示名称（可修改）", "可以选择与 NeeDo 邮箱不同的 Google 账号；验证码仍发送到你的 NeeDo 邮箱。", "向 NeeDo 邮箱发送验证码"];
    for (const language of ["zh", "zh-Hant", "ja", "en", "ko"] satisfies Language[]) {
      for (const sourceText of sources) {
        const translated = translateText(sourceText, language);
        expect(translated.trim()).not.toBe("");
        if (language !== "zh") expect(translated).not.toBe(sourceText);
      }
    }
  });

  it("contains no Calendar helper or port-4176 coupling in formal auth settings", () => {
    const accountSource = source.slice(source.indexOf("export function FormalAccountSecurityPanel"));
    expect(accountSource).not.toMatch(/fetchGoogleAccountApi|\/api\/google-account\/|GoogleCalendarAccountBinding|4176/);
  });

  it("wires successful unlink through AuthProvider logout and returns to the current portal login", () => {
    const accountPageSource = source.slice(source.indexOf("export function UnifiedSettingsAccountPage"), source.indexOf("export function UnifiedSettingsNotificationsPage"));
    expect(accountPageSource).toContain("logout");
    expect(accountPageSource).toContain("refreshSession");
    expect(accountPageSource).toContain("navigate(`/login/${portal}`");
    expect(accountPageSource).toContain("session={session}");
    expect(accountPageSource).not.toContain("google-calendar");
  });
});

describe("UnifiedSettingsServiceRangePage", () => {
  it("uses an isolated settings detail shell with close control and no main nav", () => {
    expect(serviceRangeSource).toContain("navItems={[]}");
    expect(serviceRangeSource).toContain("onClose={closeServiceRangePage}");
  });

  it("keeps search in the header area and removes framed title/location blocks", () => {
    expect(serviceRangeSource).toContain("FloatingHeaderSearchBar");
    expect(serviceRangeSource).toContain("serviceRangeSearchQuery");
    expect(serviceRangeSource).toContain('placeholder={t("搜索地点")}');
    expect(serviceRangeSource).not.toContain("<SurfacePanel>");
    expect(serviceRangeSource).not.toContain("<SectionBlock");
  });

  it("uses a simple two-button bottom action row with the updated save label", () => {
    expect(serviceRangeSource).toContain("simple");
    expect(source).toContain("fixed inset-x-0 bottom-0");
    expect(source).toContain("bg-gradient-to-t");
    expect(serviceRangeSource).toContain('saveLabel={t(serviceRangeSaving ? "保存中" : "保存并关闭")}');
    expect(serviceRangeSource).not.toContain("保存并返回设置中心");
  });

  it("is shared by user, merchant, and technician location settings", () => {
    expect(serviceRangeSource).toContain('portal === "user"');
    expect(serviceRangeSource).toContain("selectHomeLocationManually");
    expect(serviceRangeSource).toContain("updateStoreEntity(store.id");
    expect(serviceRangeSource).toContain("technicianProfileApi.getMine()");
    expect(serviceRangeSource).toContain("technicianProfileApi.updateMine({ serviceAreas: areas })");
    expect(serviceRangeSource).not.toContain("updateTechnicianEntity");
    expect(serviceRangeSource).not.toContain('portal !== "technician"');
    expect(serviceRangeSource).not.toContain("当前不可用");
  });

  it("keeps the area chips compact and removes the duplicate section title", () => {
    expect(serviceRangeSource).toContain("min-h-11");
    expect(serviceRangeSource).not.toContain('label={t("可服务区域")}');
    expect(serviceRangeSource).not.toContain('title={t("可服务区域")}');
    expect(serviceRangeSource).not.toContain("min-h-12 rounded-full px-5");
  });
});

describe("UnifiedSettingsPortalPage", () => {
  const portalPageSource = source.slice(
    source.indexOf("export function UnifiedSettingsPortalPage"),
    source.indexOf("function UserProfileSettingsPage")
  );

  it("uses the current settings route as the selected frontend identity", () => {
    expect(resolveSettingsSelectedPortal("technician", "user")).toBe("technician");
    expect(resolveSettingsSelectedPortal("merchant", "user")).toBe("merchant");
    expect(resolveSettingsSelectedPortal("business", "user")).toBe("business");
  });

  it("keeps technician and merchant settings routes when a user session can enter them", () => {
    expect(
      shouldKeepSettingsRoutePortal({
        activePortal: "user",
        canEnterRoutePortal: true,
        routePortal: "technician"
      })
    ).toBe(true);
    expect(
      shouldKeepSettingsRoutePortal({
        activePortal: "user",
        canEnterRoutePortal: true,
        routePortal: "merchant"
      })
    ).toBe(true);
  });

  it("moves portal helper captions behind inline info triggers", () => {
    expect(source).toContain("function SettingsPortalActionRow");
    expect(source).toContain('className="h-4 w-4 text-[10px]"');
    expect(portalPageSource).toContain("t(compactPortalLabels[row.portal].caption)");
    expect(backendPortalSource).toContain("content={t(entry.subtitle)}");
    expect(backendPortalSource).toContain('<SettingsArrow className="pointer-events-none relative z-20" />');
    expect(portalPageSource).not.toContain("{t(compactPortalLabels[item].caption)}</p>");
    expect(backendPortalSource).not.toContain("subtitle={t(entry.subtitle)}");
  });

  it("waits for a formal identity switch before navigating", () => {
    expect(portalPageSource).toContain("const selectPortal = async (nextPortal: SwitchableSettingsPortal) => {");
    expect(portalPageSource).toContain("const nextEntry = getPortalEntry(nextPortal);");
    expect(portalPageSource).toContain("const result = await switchPortal(nextPortal);");
    expect(portalPageSource).toContain("if (!result.ok)");
    expect(portalPageSource).toContain("navigate(nextEntry");
  });

  it("renders inactive identities as applications instead of selectable radios", () => {
    expect(portalPageSource).toContain("buildIdentityRows(session?.identityAvailability");
    expect(portalPageSource).toContain('row.action === "pending"');
    expect(portalPageSource).toContain('row.action === "retry"');
    expect(portalPageSource).toContain("getIdentityApplicationPath(row.kind)");
    expect(portalPageSource).toContain('t("申请")');
    expect(portalPageSource).toContain('const disabled = row.action === "current" || switchingPortal !== null;');
    expect(portalPageSource).not.toContain('row.action === "current" || row.action === "pending"');
  });

  it("keeps merchant identity switching on the merchant app instead of technician", () => {
    expect(getPortalEntry("merchant")).toBe("/merchant");
    expect(getPortalEntry("technician")).toBe("/technician");
    expect(backendPortalSource).toContain('href: "/store-admin.html#/login/merchant-admin"');
  });

  it("keeps temporary backend entries behind one removable component boundary", () => {
    expect(source).toContain('import { TestOnlyBackendPortalEntries } from "./TestOnlyBackendPortalEntries";');
    expect(portalPageSource).toContain("<TestOnlyBackendPortalEntries t={t} />");
    expect(source).not.toContain("const backendSettingsPortalEntries");
    expect(portalPageSource).not.toContain("window.location.assign");
    expect(portalPageSource).not.toContain("openBackendPortal");
  });
});

describe("UnifiedSettingsPage Xiaobai asset gate", () => {
  const settingsHomeSource = source.slice(
    source.indexOf("export function UnifiedSettingsPage"),
    source.indexOf("export function UnifiedSettingsThemePage")
  );

  it("uses the switch slot for download progress until Xiaobai assets are ready", () => {
    expect(settingsHomeSource).toContain("petAssetReadiness.ready ? (");
    expect(settingsHomeSource).toContain("<SettingsPetAssetProgress");
    expect(settingsHomeSource).not.toContain("disabled={!petAssetReadiness.ready}");
  });

  it("renders honest empty summaries when retired entity cache has no records", () => {
    expect(
      summarizeProfileStatus("user", {
        customer: undefined,
        technician: undefined,
        store: undefined
      })
    ).toBe("未完善");
    expect(
      summarizeProfileStatus("technician", {
        customer: undefined,
        technician: undefined,
        store: undefined
      })
    ).toBe("未完善");
    expect(
      summarizeProfileStatus("merchant", {
        customer: undefined,
        technician: undefined,
        store: undefined
      })
    ).toBe("未完善");
    expect(summarizeAccountStatus("user", undefined, undefined)).toBe("需要完善");
    expect(summarizeAccountStatus("merchant", undefined, undefined)).toBe("待完善");
  });

  it("never dereferences retired entity rows on the settings home", () => {
    expect(settingsHomeSource).toContain("technicianProfileApi.getMine()");
    expect(settingsHomeSource).toContain("technicianProfileQuery.data?.serviceAreas ?? []");
    expect(settingsHomeSource).toContain('store?.area?.trim() ?? ""');
    expect(settingsHomeSource).not.toContain("technicians.find");
    expect(settingsHomeSource).not.toContain("store.area : getHomeLocationAreaLabel");
  });
});

describe("UnifiedSettingsThemePage", () => {
  it("describes the six shared client themes", () => {
    expect(source).toContain("三端统一切换活力黑白 / 冷酷黑灰 / 白绿 / 黑绿 / 霓虹粉紫 / 黑金主题");
  });
});

describe("UnifiedSettingsProfilePage", () => {
  const userProfileSource = source.slice(
    source.indexOf("function UserProfileSettingsPage"),
    source.indexOf("function TechnicianProfileSettingsPage")
  );
  const technicianProfileSource = source.slice(
    source.indexOf("function TechnicianProfileSettingsPage"),
    source.indexOf("function MerchantProfileSettingsPage")
  );

  it("keeps profile visibility controls out of user and technician profile edit pages", () => {
    expect(userProfileSource).not.toContain("InfoCardVisibilityEditor");
    expect(userProfileSource).not.toContain("信息卡可见范围");
    expect(technicianProfileSource).not.toContain("InfoCardVisibilityEditor");
    expect(technicianProfileSource).not.toContain("信息卡可见范围");
    expect(technicianProfileSource).not.toContain("技师名片预览");
    expect(technicianProfileSource).not.toContain("实时预览");
  });

  it("opens the technician profile edit page without the main bottom navigation", () => {
    expect(technicianProfileSource).toContain("navItems={[]}");
  });

  it("loads and saves the user profile through the formal customer profile API", () => {
    const profileRouteSource = source.slice(
      source.indexOf("function FormalUserProfileSettingsPage"),
      source.indexOf("export function UnifiedSettingsVerificationPage")
    );

    expect(profileRouteSource).toContain("useCustomerSelfProfile()");
    expect(userProfileSource).toContain("customerProfileApi.updateMine");
    expect(userProfileSource).not.toContain("updateCustomerEntity(customer.id");
    expect(profileRouteSource).toContain("SettingsProfileResourceState");
  });

  it("loads and saves the technician profile through the formal technician profile API", () => {
    const profileRouteSource = source.slice(
      source.indexOf("function FormalTechnicianProfileSettingsPage"),
      source.indexOf("export function UnifiedSettingsVerificationPage")
    );

    expect(profileRouteSource).toContain("technicianProfileApi.getMine()");
    expect(technicianProfileSource).toContain("technicianProfileApi.updateMine");
    expect(technicianProfileSource).not.toContain("updateTechnicianEntity");
    expect(profileRouteSource).toContain("SettingsProfileResourceState");
  });

  it("guards the merchant profile route when its formal entity is absent", () => {
    const profileRouteSource = source.slice(
      source.indexOf("export function UnifiedSettingsProfilePage"),
      source.indexOf("export function UnifiedSettingsVerificationPage")
    );

    expect(profileRouteSource).toContain('if (!store)');
    expect(profileRouteSource).toContain("SettingsProfileResourceState");
  });
});
