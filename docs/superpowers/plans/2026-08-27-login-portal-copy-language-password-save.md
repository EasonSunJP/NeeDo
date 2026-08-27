# NeeDo Login Portal Copy, Language, and Password Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Distinguish operations and merchant backend login copy in five languages, add the backend language selector beside “Welcome back,” and add secure browser-managed password-save switches to both backend and frontend password login forms.

**Architecture:** Add one focused auth helper that stores only a per-surface/per-portal boolean preference and requests the browser password manager after successful password authentication. Keep copy and layout changes inside the two existing shared login pages; preserve their current Auth, Token, RBAC, registration, Google, OTP, QR, and portal-routing behavior.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7, Vitest 4, jsdom, existing `LanguageSwitcher`, `ToggleSwitch`, `AdminToggleSwitch`, `I18nProvider`, and browser Credential Management API when available.

## Global Constraints

- Chinese backend copy must be exactly `请使用运营后台` and `请使用商户/店铺后台`; do not add `账号登录`.
- Support `zh`, `zh-Hant`, `ja`, `en`, and `ko` for every new user-visible string.
- Never persist a password, reversible ciphertext, access token, refresh token, or credential payload in localStorage or sessionStorage.
- Continue purging retired `needo.auth.remember-credentials.*` plaintext records.
- Credential-manager failure or unsupported browsers must never block a successful NeeDo login or portal navigation.
- Do not change backend APIs, RBAC, Token storage, Prisma schema, migrations, or non-password login flows.
- Preserve unrelated dirty-worktree changes and commit only files from the current task.

---

### Task 1: Browser-managed password-save helper

**Files:**
- Create: `src/auth/browserPasswordSave.ts`
- Create: `src/auth/browserPasswordSave.test.ts`

**Interfaces:**
- Consumes: `readBrowserStorage` and `writeBrowserStorage` from `src/lib/browserStorage.ts`.
- Produces: `BrowserPasswordSaveScope`, `readBrowserPasswordSavePreference(scope)`, `writeBrowserPasswordSavePreference(scope, enabled)`, and `requestBrowserPasswordSave({ id, password, name })`.

- [ ] **Step 1: Write failing preference tests**

Create tests that define the exact scope isolation and prove only booleans enter localStorage:

```ts
// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  readBrowserPasswordSavePreference,
  requestBrowserPasswordSave,
  writeBrowserPasswordSavePreference,
} from "./browserPasswordSave";

describe("browser password save preference", () => {
  beforeEach(() => window.localStorage.clear());

  it("defaults off and isolates frontend and backend portal preferences", () => {
    expect(readBrowserPasswordSavePreference("backend:admin")).toBe(false);
    writeBrowserPasswordSavePreference("backend:admin", true);
    writeBrowserPasswordSavePreference("frontend:user", false);
    expect(readBrowserPasswordSavePreference("backend:admin")).toBe(true);
    expect(readBrowserPasswordSavePreference("frontend:user")).toBe(false);
    expect(JSON.stringify(window.localStorage)).not.toContain("password-value");
  });
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- src/auth/browserPasswordSave.test.ts`

Expected: FAIL because `src/auth/browserPasswordSave.ts` does not exist.

- [ ] **Step 3: Add browser save request tests**

Extend the test with a fake `PasswordCredential` and `navigator.credentials.store`:

```ts
it("submits credentials to the browser manager without app storage", async () => {
  const store = vi.fn(async () => undefined);
  class FakePasswordCredential {
    constructor(readonly data: { id: string; password: string; name?: string }) {}
  }
  Object.defineProperty(globalThis, "PasswordCredential", { configurable: true, value: FakePasswordCredential });
  Object.defineProperty(navigator, "credentials", { configurable: true, value: { store } });

  await expect(requestBrowserPasswordSave({ id: "user@example.com", password: "password-value", name: "NeeDo" })).resolves.toBeUndefined();
  expect(store).toHaveBeenCalledTimes(1);
  expect(Object.values(window.localStorage)).not.toContain("password-value");
});

it("silently degrades when the browser rejects saving", async () => {
  Object.defineProperty(navigator, "credentials", {
    configurable: true,
    value: { store: vi.fn(async () => { throw new DOMException("cancelled", "NotAllowedError"); }) },
  });
  await expect(requestBrowserPasswordSave({ id: "user@example.com", password: "secret" })).resolves.toBeUndefined();
});
```

- [ ] **Step 4: Implement the minimal safe helper**

Create the explicit scope union and silent browser boundary:

```ts
import { readBrowserStorage, writeBrowserStorage } from "../lib/browserStorage";

export type BrowserPasswordSaveScope =
  | "backend:admin"
  | "backend:merchant-admin"
  | "backend:afirieito-admin"
  | "frontend:admin"
  | "frontend:business"
  | "frontend:merchant"
  | "frontend:technician"
  | "frontend:user";

const preferencePrefix = "needo.auth.browser-password-save.";

export function readBrowserPasswordSavePreference(scope: BrowserPasswordSaveScope) {
  return readBrowserStorage(`${preferencePrefix}${scope}`, { silent: true }) === "true";
}

export function writeBrowserPasswordSavePreference(scope: BrowserPasswordSaveScope, enabled: boolean) {
  return writeBrowserStorage(`${preferencePrefix}${scope}`, String(enabled), { silent: true });
}

type PasswordCredentialConstructor = new (data: { id: string; password: string; name?: string }) => Credential;

export async function requestBrowserPasswordSave(input: { id: string; password: string; name?: string }) {
  const PasswordCredentialType = (globalThis as typeof globalThis & { PasswordCredential?: PasswordCredentialConstructor }).PasswordCredential;
  if (!input.id || !input.password || !PasswordCredentialType || typeof navigator === "undefined" || !navigator.credentials?.store) return;
  try {
    await navigator.credentials.store(new PasswordCredentialType(input));
  } catch {
    // Browser policy, cancellation, or unsupported storage must not block login.
  }
}
```

- [ ] **Step 5: Run helper tests and verify GREEN**

Run: `npm test -- src/auth/browserPasswordSave.test.ts`

Expected: PASS with all preference, supported-browser, and rejected-browser cases green.

- [ ] **Step 6: Commit Task 1 only**

```bash
git add src/auth/browserPasswordSave.ts src/auth/browserPasswordSave.test.ts
git commit -m "feat: add browser-managed password save helper"
```

---

### Task 2: Backend portal copy, language selector, and password-save switch

**Files:**
- Modify: `src/pages/auth/AdminLoginPage.tsx`
- Modify: `src/pages/auth/AdminLoginPage.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: Task 1 helper functions, `LanguageSwitcher`, `AdminToggleSwitch`, and `isDarkAdminTheme(theme)`.
- Produces: five-language portal-specific subtitles and the backend password-save interaction.

- [ ] **Step 1: Write failing copy and UI tests**

Make the I18n mock language mutable, render both backend portals, and assert exact copy:

```ts
it.each([
  ["zh", "admin", "请使用运营后台"],
  ["zh", "merchant-admin", "请使用商户/店铺后台"],
  ["zh-Hant", "admin", "請使用營運後台"],
  ["zh-Hant", "merchant-admin", "請使用商戶／店鋪後台"],
  ["ja", "admin", "運営管理画面をご利用ください"],
  ["ja", "merchant-admin", "店舗管理画面をご利用ください"],
  ["en", "admin", "Please use Operations Admin"],
  ["en", "merchant-admin", "Please use Merchant / Store Admin"],
  ["ko", "admin", "운영 관리자 화면을 이용해 주세요"],
  ["ko", "merchant-admin", "가맹점/매장 관리자 화면을 이용해 주세요"],
])("renders %s %s copy", async (language, portal, subtitle) => {
  mocked.language = language;
  await renderPortal(portal);
  expect(container.textContent).toContain(subtitle);
});

it("shows language selection beside the heading and a password-save switch", () => {
  expect(container.querySelector('button[aria-label="Language selector"]')).not.toBeNull();
  expect(container.querySelector('[role="switch"]')?.getAttribute("aria-checked")).toBe("false");
});
```

- [ ] **Step 2: Run backend login tests and verify RED**

Run: `npm test -- src/pages/auth/AdminLoginPage.test.tsx`

Expected: FAIL because subtitles are still generic and both controls are absent.

- [ ] **Step 3: Implement portal copy and title-row language control**

Change `BackendLoginCopy.pageSubtitle` to `Record<AdminLoginPortal, string>` and provide all three portal values per language. Use the approved operations/merchant strings; keep the affiliate value semantically equivalent to the current generic copy. Render:

```tsx
<div className="admin-login-heading-row">
  <h1 className="admin-login-title text-3xl font-black leading-tight">{copy.pageTitle}</h1>
  <LanguageSwitcher dark={isDarkAdminTheme(theme)} iconOnly />
</div>
<p className="admin-login-muted mt-2 text-sm font-semibold">{copy.pageSubtitle[portal]}</p>
```

- [ ] **Step 4: Implement the backend switch and successful-login save request**

Add the scoped preference state and password label row:

```tsx
const passwordSaveScope = `backend:${portal}` as BrowserPasswordSaveScope;
const [savePassword, setSavePassword] = useState(() => readBrowserPasswordSavePreference(passwordSaveScope));

const updateSavePassword = (enabled: boolean) => {
  setSavePassword(enabled);
  writeBrowserPasswordSavePreference(passwordSaveScope, enabled);
};

<div className="mb-2 flex items-center justify-between gap-3">
  <span className="admin-login-label text-sm font-black">{copy.passwordLabel}</span>
  <span className="inline-flex items-center gap-2 text-xs font-bold text-[color:var(--admin-muted)]">
    {copy.savePassword}
    <AdminToggleSwitch ariaLabel={copy.savePassword} checked={savePassword} onChange={updateSavePassword} />
  </span>
</div>
```

After `loginWithFormalPassword` succeeds and before navigation:

```ts
if (savePassword) {
  await requestBrowserPasswordSave({ id: account.trim(), password, name: copy.portalName[portal] });
}
```

Set username/password autocomplete to `username`/`current-password` only when enabled and to `off` otherwise.

- [ ] **Step 5: Add narrow responsive styles**

Add only login-specific styles:

```css
.admin-login-heading-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
```

Use existing admin tokens and existing switch styles; do not introduce fixed screenshot colors.

- [ ] **Step 6: Run backend tests and verify GREEN**

Run: `npm test -- src/pages/auth/AdminLoginPage.test.tsx src/auth/browserPasswordSave.test.ts`

Expected: PASS; no legacy plaintext credential read/write API is reintroduced.

- [ ] **Step 7: Commit Task 2 only**

```bash
git add src/pages/auth/AdminLoginPage.tsx src/pages/auth/AdminLoginPage.test.tsx src/styles.css
git commit -m "feat: distinguish backend login portals"
```

---

### Task 3: Frontend shared password-login switch

**Files:**
- Modify: `src/pages/auth/LoginPage.tsx`
- Modify: `src/pages/auth/LoginPage.test.ts`
- Modify: `src/i18n/translations.ts`
- Modify: `src/i18n/translations.test.ts`

**Interfaces:**
- Consumes: Task 1 helper and existing client `ToggleSwitch`.
- Produces: a shared switch for user, merchant, technician, business, and typed admin frontend portal scopes.

- [ ] **Step 1: Add failing five-language translation tests**

Add exact assertions:

```ts
expect(translateText("保存密码", "zh-Hant")).toBe("儲存密碼");
expect(translateText("保存密码", "ja")).toBe("パスワードを保存");
expect(translateText("保存密码", "en")).toBe("Save password");
expect(translateText("保存密码", "ko")).toBe("비밀번호 저장");
```

- [ ] **Step 2: Add failing frontend switch tests**

Replace the old “no switch” assertion with behavior checks:

```ts
it("keeps browser password saving opt-in and portal-scoped", async () => {
  await openPasswordLogin();
  const toggle = container.querySelector<HTMLButtonElement>('[role="switch"]')!;
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  expect(loginIdentifier().autocomplete).toBe("off");
  expect(loginPassword().autocomplete).toBe("off");
  await act(async () => toggle.click());
  expect(toggle.getAttribute("aria-checked")).toBe("true");
  expect(window.localStorage.getItem("needo.auth.browser-password-save.frontend:user")).toBe("true");
  expect(loginIdentifier().autocomplete).toBe("username");
  expect(loginPassword().autocomplete).toBe("current-password");
});
```

Mock `requestBrowserPasswordSave`; assert it is called only after an `ok: true` password login with the switch enabled, and that a rejected save request does not suppress `navigateToPortal`.

- [ ] **Step 3: Run frontend and translation tests and verify RED**

Run: `npm test -- src/pages/auth/LoginPage.test.ts src/i18n/translations.test.ts`

Expected: FAIL because the translation and switch do not exist.

- [ ] **Step 4: Add the five-language translation and login copy field**

Add the translation entry:

```ts
"保存密码": {
  "zh-Hant": "儲存密碼",
  ja: "パスワードを保存",
  en: "Save password",
  ko: "비밀번호 저장",
},
```

Add `savePassword: text("保存密码")` to `buildLoginCopy`.

- [ ] **Step 5: Implement portal-scoped state and switch UI**

Map the current portal into the helper scope and update it whenever `activePortal` changes:

```ts
const passwordSaveScope = `frontend:${activePortal}` as BrowserPasswordSaveScope;
const [savePassword, setSavePassword] = useState(() => readBrowserPasswordSavePreference(passwordSaveScope));

useEffect(() => {
  setSavePassword(readBrowserPasswordSavePreference(passwordSaveScope));
}, [passwordSaveScope]);
```

Render the password label and switch in one row with existing client theme tokens:

```tsx
<div className="flex items-center justify-between gap-3">
  <span className="text-sm font-black text-[color:var(--client-muted)]">{copy.passwordLabel}</span>
  <span className="inline-flex items-center gap-2 text-xs font-bold text-[color:var(--client-muted)]">
    {copy.savePassword}
    <ToggleSwitch ariaLabel={copy.savePassword} checked={savePassword} onChange={updateSavePassword} />
  </span>
</div>
```

Do not add the switch to registration or Google panels.

- [ ] **Step 6: Save through the browser only after successful frontend password login**

Before `navigateToPortal` in `handleAccountLogin`:

```ts
if (savePassword) {
  await requestBrowserPasswordSave({ id: identifier, password: loginPassword, name: "NeeDo" });
}
```

Use conditional autocomplete values exactly as in Task 2.

- [ ] **Step 7: Run frontend tests and verify GREEN**

Run: `npm test -- src/pages/auth/LoginPage.test.ts src/i18n/translations.test.ts src/auth/browserPasswordSave.test.ts`

Expected: PASS; registration, Google, verification, portal routing, and password-byte preservation tests remain green.

- [ ] **Step 8: Commit Task 3 only**

```bash
git add src/pages/auth/LoginPage.tsx src/pages/auth/LoginPage.test.ts src/i18n/translations.ts src/i18n/translations.test.ts
git commit -m "feat: add frontend password save control"
```

---

### Task 4: Full verification and acceptance evidence

**Files:**
- Verify only; do not modify unrelated files.

**Interfaces:**
- Consumes: all prior task deliverables.
- Produces: current test, type-check, build, diff, and manual layout evidence.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- src/auth/browserPasswordSave.test.ts src/pages/auth/AdminLoginPage.test.tsx src/pages/auth/LoginPage.test.ts src/i18n/translations.test.ts
```

Expected: all focused test files pass with zero failures.

- [ ] **Step 2: Run complete frontend tests**

Run: `npm test`

Expected: all frontend tests pass with zero failures.

- [ ] **Step 3: Run TypeScript lint**

Run: `npm run lint`

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 4: Run the formal production build**

Run: `npm run build -- --mode formal`

Expected: exit code 0 and Vite production bundles emitted successfully. Use formal mode because the repository intentionally rejects unsafe legacy/bypass environment variables in normal production mode.

- [ ] **Step 5: Check task diff integrity**

Run:

```bash
git diff --check HEAD~3..HEAD
git status --short
```

Expected: no whitespace errors; status may still contain pre-existing unrelated user changes, which must remain untouched.

- [ ] **Step 6: Perform local visual acceptance if the formal app is available**

Open the operations, merchant, and frontend password-login routes and verify:

- Operations subtitle is portal-specific.
- Merchant subtitle is portal-specific.
- Backend language menu sits to the right of the title and switches all visible copy.
- Backend and frontend password labels each keep the switch aligned at desktop and narrow widths.
- Switch settings do not leak between frontend/backend or portal scopes.
- Browser password confirmation is native; the app never claims success itself.

If the local backend/database is unavailable, report automated verification separately and do not claim browser acceptance.

