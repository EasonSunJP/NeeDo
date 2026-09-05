# Merchant Application Page Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the first merchant-application step as seven independent NeeDo containers with formal eKYC status, category-first keywords, a validated yen range, a themed upload control, and fixed mobile chrome.

**Architecture:** Keep the existing identity-application API and database contract. Add a pure price-range presentation module, extend the existing application UI primitives, then compose those pieces in `MerchantApplicationPage` while threading a page-specific header layer through the current shared shell. Continue to reuse the formal taxonomy API and `StoreDetailExperience` preview.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind utility classes, Vitest/jsdom, React Router, existing `/api/v1` client modules.

## Global Constraints

- Execute only this merchant-application UI microstep; do not change the database schema or add a migration.
- Preserve `/api/v1/identity-applications/*`, media upload, bank verification, contract acceptance, and submission behavior.
- Do not add mocks, static taxonomy data, fake eKYC results, placeholders, `TODO`, or `FIXME` comments.
- Every user-visible string must support `zh`, `zh-Hant`, `ja`, `en`, and `ko` through the existing i18n path.
- Keep `StoreDetailExperience` as the preview authority.
- The implementation branch must contain only files named in this plan and the approved design/plan commits already on `main`.
- Treat local merge, remote push, deployment, and staging acceptance as separate outcomes.

---

## File Map

- Create `src/features/identity-applications/merchantPriceRange.ts`: parse, format, and validate optional yen ranges without React state.
- Create `src/features/identity-applications/merchantPriceRange.test.ts`: executable price-range contract.
- Modify `src/features/identity-applications/ApplicationUi.tsx`: titled application containers, themed file chooser, fixed bottom action shell, and page-specific header layer plumbing.
- Modify `src/features/identity-applications/ApplicationPages.test.ts`: page chrome, container, upload, eKYC, fixed-action, and layering guards.
- Modify `src/components/client-ui/SettingsDirectory.tsx`: forward an optional header frame class from settings pages.
- Modify `src/components/client-ui/AppScaffold.tsx`: allow `AppTopBar` callers to override the fixed frame layer without changing the default.
- Modify `src/features/shop-taxonomy/ShopTaxonomyRegistrationField.tsx`: move taxonomy help into `TitleWithInfo` and remove review suffixes.
- Modify `src/features/shop-taxonomy/ShopTaxonomyRegistrationField.test.tsx`: interaction proof for hidden keywords and absent review text.
- Modify `src/features/shop-taxonomy/i18n.ts`: keep the existing taxonomy copy used by other surfaces; registration no longer renders `review`.
- Modify `src/features/identity-applications/MerchantApplicationPage.tsx`: seven-container composition, applicant/eKYC row, price range, custom upload, preview, and fixed next button.
- Modify `src/features/identity-applications/formModel.ts`: validate the renamed applicant field through the existing `responsiblePersonName` contract.
- Modify `src/features/identity-applications/formModel.test.ts`: preserve required applicant validation.
- Modify `src/features/identity-applications/i18n.ts`: localized application-page labels and help text.
- Modify `src/features/identity-applications/i18n.test.ts`: translation coverage for new strings.

---

### Task 1: Yen price-range model

**Files:**
- Create: `src/features/identity-applications/merchantPriceRange.ts`
- Create: `src/features/identity-applications/merchantPriceRange.test.ts`

**Interfaces:**
- Produces: `type MerchantPriceRange = { min: string; max: string }`.
- Produces: `parseMerchantPriceRange(value: string): MerchantPriceRange`.
- Produces: `formatMerchantPriceRange(range: MerchantPriceRange): string`.
- Produces: `validateMerchantPriceRange(range: MerchantPriceRange): string | null`.
- Consumes: no application state or API code.

- [ ] **Step 1: Write the failing pure-model tests**

```ts
import { describe, expect, it } from "vitest";
import {
  formatMerchantPriceRange,
  parseMerchantPriceRange,
  validateMerchantPriceRange
} from "./merchantPriceRange";

describe("merchant price range", () => {
  it("formats and restores the approved yen range", () => {
    expect(formatMerchantPriceRange({ min: "8800", max: "12800" })).toBe("￥8,800 ~ ￥12,800");
    expect(parseMerchantPriceRange("￥8,800 ~ ￥12,800")).toEqual({ min: "8800", max: "12800" });
  });

  it("allows an empty optional range but requires both ordered endpoints", () => {
    expect(validateMerchantPriceRange({ min: "", max: "" })).toBeNull();
    expect(validateMerchantPriceRange({ min: "8800", max: "" })).toBe("请完整填写费用区间");
    expect(validateMerchantPriceRange({ min: "12800", max: "8800" })).toBe("最低费用不能高于最高费用");
    expect(validateMerchantPriceRange({ min: "8800", max: "12800" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the model test and verify RED**

Run:

```bash
npm test -- --run src/features/identity-applications/merchantPriceRange.test.ts
```

Expected: FAIL because `merchantPriceRange.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure functions**

```ts
export type MerchantPriceRange = { min: string; max: string };

const digits = (value: string) => value.replace(/\D/gu, "");

export function parseMerchantPriceRange(value: string): MerchantPriceRange {
  const [min = "", max = ""] = value.split(/\s*[~-]\s*/u).map(digits);
  return { min, max };
}

export function formatMerchantPriceRange({ min, max }: MerchantPriceRange) {
  if (!min && !max) return "";
  if (!min || !max) return "";
  return `￥${Number(min).toLocaleString("ja-JP")} ~ ￥${Number(max).toLocaleString("ja-JP")}`;
}

export function validateMerchantPriceRange({ min, max }: MerchantPriceRange) {
  if (!min && !max) return null;
  if (!min || !max) return "请完整填写费用区间";
  if (Number(min) > Number(max)) return "最低费用不能高于最高费用";
  return null;
}
```

- [ ] **Step 4: Run the model test and verify GREEN**

Run the Step 2 command. Expected: PASS with two tests.

- [ ] **Step 5: Commit the model**

```bash
git add src/features/identity-applications/merchantPriceRange.ts src/features/identity-applications/merchantPriceRange.test.ts
git commit -m "feat(identity): model merchant price range"
```

---

### Task 2: Application containers, upload control, and fixed chrome

**Files:**
- Modify: `src/features/identity-applications/ApplicationUi.tsx`
- Modify: `src/features/identity-applications/ApplicationPages.test.ts`
- Modify: `src/components/client-ui/SettingsDirectory.tsx`
- Modify: `src/components/client-ui/AppScaffold.tsx`

**Interfaces:**
- Produces: `ApplicationSection({ title, info, children, className })`.
- Produces: `ApplicationFileUpload({ accept, file, label, onChange })`.
- Produces: `ApplicationBottomAction({ children })`.
- Produces: `ApplicationShell` with `headerFrameClassName="z-[140]"` and bottom content clearance.
- Extends: `SettingsDetailPage` and `AppTopBar` with optional `headerFrameClassName`/`frameClassName` forwarding; defaults remain `z-40`.

- [ ] **Step 1: Add failing source-contract tests**

Extend `ApplicationPages.test.ts` with exact guards:

```ts
it("provides independent titled containers and a themed file chooser", () => {
  expect(applicationUiSource).toContain("export function ApplicationSection");
  expect(applicationUiSource).toContain("TitleWithInfo");
  expect(applicationUiSource).toContain("export function ApplicationFileUpload");
  expect(applicationUiSource).toContain('type="file"');
  expect(applicationUiSource).toContain("sr-only");
});

it("keeps the application header above preview chrome and fixes the action at home-nav position", () => {
  expect(applicationUiSource).toContain('headerFrameClassName="z-[140]"');
  expect(applicationUiSource).toContain("export function ApplicationBottomAction");
  expect(applicationUiSource).toContain("fixed inset-x-0 bottom-0 z-[100]");
  expect(applicationUiSource).toContain("--client-bottom-nav-inline-gap");
});
```

- [ ] **Step 2: Run the chrome tests and verify RED**

```bash
npm test -- --run src/features/identity-applications/ApplicationPages.test.ts
```

Expected: FAIL because the new application primitives and layer forwarding are absent.

- [ ] **Step 3: Thread the page-specific header frame layer**

Add `frameClassName?: string` to `AppTopBar`, then pass it to the existing header:

```tsx
<FloatingHomeHeader
  className="gap-0"
  frameClassName={cn("z-40", frameClassName)}
  maxWidth="1600px"
  panelClassName={cn(appTopBarPanelClassName, className)}
  showSpacer={!fixed}
  spacerGapPx={0}
>
```

Add `headerFrameClassName?: string` to `SettingsDetailPage` and forward it:

```tsx
<AppTopBar
  frameClassName={headerFrameClassName}
  {...existingProps}
/>
```

In `ApplicationShell`, set the page-only layer and add fixed-action clearance:

```tsx
<SettingsDetailPage
  contentClassName="pb-[calc(env(safe-area-inset-bottom)+10.5rem)]"
  headerFrameClassName="z-[140]"
  {...existingProps}
>
```

- [ ] **Step 4: Add the reusable application primitives**

Use `TitleWithInfo` for section headings and a visually hidden file input:

```tsx
export function ApplicationSection({ title, info, children, className }: {
  title: string;
  info?: string;
  children: ReactNode;
  className?: string;
}) {
  const { language } = useI18n();
  const t = (source: string) => translateText(source, language);
  return (
    <ApplicationCard className={cn("space-y-4", className)}>
      <TitleWithInfo as="h2" info={info ? t(info) : undefined} label={`${t(title)} 说明`} title={t(title)} titleClassName="text-[17px] font-black text-[color:var(--client-text)]" variant="client" />
      {children}
    </ApplicationCard>
  );
}

export function ApplicationFileUpload({ accept, file, label, onChange }: {
  accept: string;
  file: File | null;
  label: string;
  onChange: (file: File | null) => void;
}) {
  return (
    <label className="focus-ring flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-[18px] border border-[color:var(--client-line)] bg-[color:var(--client-elevated)] px-4">
      <span className="truncate text-sm font-bold text-[color:var(--client-text)]">{file?.name ?? label}</span>
      <span className="rounded-full bg-[color:var(--client-primary)] px-4 py-2 text-xs font-black text-[color:var(--client-primary-contrast)]">{label}</span>
      <input accept={accept} className="sr-only" onChange={(event) => onChange(event.target.files?.[0] ?? null)} type="file" />
    </label>
  );
}

export function ApplicationBottomAction({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] mx-auto w-full max-w-[880px] px-[var(--client-bottom-nav-inline-gap,12px)] pb-[calc(max(env(safe-area-inset-bottom),12px)+12px)] pt-8">
      <div className="pointer-events-auto rounded-[28px] border border-[color:var(--client-line)] bg-[color:var(--client-surface)] p-3 shadow-[0_-18px_40px_rgba(0,0,0,0.16)] backdrop-blur-xl">{children}</div>
    </div>
  );
}
```

- [ ] **Step 5: Run the chrome tests and typecheck**

```bash
npm test -- --run src/features/identity-applications/ApplicationPages.test.ts
npm run build
```

Expected: test PASS; build PASS without changing default header layers on other settings pages.

- [ ] **Step 6: Commit the UI primitives**

```bash
git add src/features/identity-applications/ApplicationUi.tsx src/features/identity-applications/ApplicationPages.test.ts src/components/client-ui/SettingsDirectory.tsx src/components/client-ui/AppScaffold.tsx
git commit -m "feat(identity): add application section chrome"
```

---

### Task 3: Category-first taxonomy presentation

**Files:**
- Modify: `src/features/shop-taxonomy/ShopTaxonomyRegistrationField.tsx`
- Modify: `src/features/shop-taxonomy/ShopTaxonomyRegistrationField.test.tsx`
- Modify: `src/features/shop-taxonomy/i18n.ts`

**Interfaces:**
- Preserves: `ShopTaxonomyRegistrationField` props and formal API calls.
- Changes: help text moves into `TitleWithInfo`; category buttons render only `category.label`.
- Preserves: keyword requests occur only for selected category IDs.

- [ ] **Step 1: Extend the interaction test to assert the requested presentation**

Use a review-required category so the test catches the old suffix:

```tsx
listCategories: vi.fn(async () => ({
  list: [{ id: 1, code: "massage", label: "按摩", qualificationPolicy: "REVIEW_REQUIRED" }],
  total: 1,
  page: 1,
  page_size: 100
}))
```

Add assertions before and after selection:

```ts
expect(container.textContent).not.toContain("需审核");
expect(container.textContent).not.toContain("上门按摩");
expect(container.querySelector('[aria-label="服务种类与关键词 说明"]')).not.toBeNull();

await act(async () => categoryButton?.click());
expect(onChange).toHaveBeenCalledWith({ serviceCategoryIds: [1], businessKeywordIds: [] });
```

Render again with `serviceCategoryIds: [1]`, flush the keyword request, and assert `上门按摩` appears.

- [ ] **Step 2: Run the taxonomy test and verify RED**

```bash
npm test -- --run src/features/shop-taxonomy/ShopTaxonomyRegistrationField.test.tsx
```

Expected: FAIL because review text is visible and the title has no info control.

- [ ] **Step 3: Replace visible help with `TitleWithInfo` and remove suffix rendering**

```tsx
<TitleWithInfo
  as="h2"
  info={copy.description}
  label={`${copy.title} 说明`}
  title={copy.title}
  titleClassName="text-[17px] font-black text-[color:var(--client-text)]"
  variant="client"
/>
```

Render the category button body as:

```tsx
{category.label}
```

Do not change `qualificationPolicy` in API types, backend validation, review pages, or approval behavior. Remove `review` from the local `Copy` type and language objects only if no remaining taxonomy surface consumes it.

- [ ] **Step 4: Run taxonomy and model tests**

```bash
npm test -- --run src/features/shop-taxonomy/ShopTaxonomyRegistrationField.test.tsx src/features/shop-taxonomy/model.test.ts
```

Expected: PASS; keyword API remains uncalled before a category selection.

- [ ] **Step 5: Commit taxonomy presentation**

```bash
git add src/features/shop-taxonomy/ShopTaxonomyRegistrationField.tsx src/features/shop-taxonomy/ShopTaxonomyRegistrationField.test.tsx src/features/shop-taxonomy/i18n.ts
git commit -m "fix(taxonomy): hide application review suffixes"
```

---

### Task 4: Seven-container merchant application composition

**Files:**
- Modify: `src/features/identity-applications/MerchantApplicationPage.tsx`
- Modify: `src/features/identity-applications/ApplicationPages.test.ts`
- Modify: `src/features/identity-applications/formModel.ts`
- Modify: `src/features/identity-applications/formModel.test.ts`
- Modify: `src/features/identity-applications/i18n.ts`
- Modify: `src/features/identity-applications/i18n.test.ts`

**Interfaces:**
- Consumes: Task 1 price functions and Task 2 application primitives.
- Consumes: `platformMembershipSelfApi.getMine(): Promise<MyPlatformMembership>` as the only eKYC status authority.
- Preserves: `responsiblePersonName` in API payload; UI label becomes “申请人”.
- Preserves: `showcaseDraft.priceLabel`; UI state becomes `{ min, max }`.
- Preserves: `StoreDetailExperience` and current media upload call.

- [ ] **Step 1: Add failing form and page tests**

Update `formModel.test.ts` to retain the required API field while asserting the new message:

```ts
expect(validateMerchantShowcase({ ...common, responsiblePersonName: "" })).toBe("请输入申请人姓名");
```

Extend `ApplicationPages.test.ts`:

```ts
it("renders the approved seven independent merchant application sections", () => {
  for (const title of [
    "名义",
    "基础信息",
    "服务种类与关键词",
    "费用区间",
    "店铺简介",
    "上传店铺第一张展示图",
    "主页效果预览"
  ]) expect(merchantApplicationSource).toContain(title);
  expect(merchantApplicationSource).not.toContain('label="负责人姓名"');
  expect(merchantApplicationSource.indexOf('label="申请人"')).toBeLessThan(merchantApplicationSource.indexOf('label="法人或代表者姓名"'));
});

it("uses formal eKYC status and the existing verification route", () => {
  expect(merchantApplicationSource).toContain("platformMembershipSelfApi.getMine()");
  expect(merchantApplicationSource).toContain('/me/settings/verification');
  expect(merchantApplicationSource).toContain("已本人确认");
});

it("keeps the formal payload while formatting the preview price range", () => {
  expect(merchantApplicationSource).toContain("responsiblePersonName: form.responsiblePersonName.trim()");
  expect(merchantApplicationSource).toContain("formatMerchantPriceRange(priceRange)");
  expect(merchantApplicationSource).toContain("ApplicationBottomAction");
  expect(merchantApplicationSource).toContain("ApplicationFileUpload");
});
```

Add new translation assertions to `i18n.test.ts`:

```ts
for (const language of ["zh-Hant", "ja", "en", "ko"] as const) {
  expect(translateText("申请人", language)).not.toBe("申请人");
  expect(translateText("费用区间", language)).not.toBe("费用区间");
  expect(translateText("本人确认（eKYC）", language)).toContain("eKYC");
}
```

- [ ] **Step 2: Run focused tests and verify RED**

```bash
npm test -- --run src/features/identity-applications/merchantPriceRange.test.ts src/features/identity-applications/formModel.test.ts src/features/identity-applications/ApplicationPages.test.ts src/features/identity-applications/i18n.test.ts
```

Expected: FAIL on the old responsible-person message, missing sections, missing formal membership read, and missing translations.

- [ ] **Step 3: Add the formal eKYC read and navigation**

Import `useNavigate` and `platformMembershipSelfApi`, then add state loaded from the formal endpoint:

```tsx
const navigate = useNavigate();
const [ekycVerified, setEkycVerified] = useState(false);

useEffect(() => {
  let active = true;
  platformMembershipSelfApi.getMine()
    .then((membership) => {
      if (active) setEkycVerified(membership.ekycVerified);
    })
    .catch(() => {
      if (active) setEkycVerified(false);
    });
  return () => { active = false; };
}, []);
```

The applicant row must keep the editable input and use the formal route:

```tsx
<ApplicationField label="申请人" required>
  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
    <ApplicationInput onChange={(event) => updateForm("responsiblePersonName", event.target.value)} value={form.responsiblePersonName} />
    <ApplicationButton onClick={() => navigate("/me/settings/verification")} tone={ekycVerified ? "secondary" : "primary"}>
      {t(ekycVerified ? "已本人确认" : "本人确认（eKYC）")}
    </ApplicationButton>
  </div>
</ApplicationField>
```

This step must not mark eKYC verified after navigation or button click.

- [ ] **Step 4: Replace the visible corporate-name duplicates without changing payload keys**

Keep `corporateLegalName` and `corporateLegalNameKana` in internal state for reload compatibility. When preparing a corporate payload, use the visible legal/representative inputs for both existing corporate keys and representative keys:

```ts
corporateLegalName: form.applicantKind === "corporate" ? form.representativeName.trim() : null,
corporateLegalNameKana: form.applicantKind === "corporate" ? form.representativeNameKana.trim() : null,
representativeName: form.representativeName.trim(),
representativeNameKana: form.representativeNameKana.trim(),
responsiblePersonName: form.responsiblePersonName.trim(),
```

Before validation, construct the same normalized candidate so corporate validation still receives non-empty formal keys. Do not remove backend validators, review projections, or audit fields.

- [ ] **Step 5: Wire price-range state, reload, validation, payload, and preview**

```tsx
const [priceRange, setPriceRange] = useState<MerchantPriceRange>({ min: "", max: "" });

// Existing draft load
setPriceRange(parseMerchantPriceRange(readDraftString(detail.showcaseDraft, "priceLabel")));

const priceLabel = formatMerchantPriceRange(priceRange);
const priceError = validateMerchantPriceRange(priceRange);
if (priceError) {
  setError(priceError);
  return;
}
```

Write `priceLabel` to `showcaseDraft` and use the same value in `draftStore.priceLabel`. Strip non-digits in each input `onChange`; keep the underlying state as digit strings.

- [ ] **Step 6: Recompose step zero as seven sibling containers**

Replace the single large `ApplicationCard` with sibling sections in this exact order:

```tsx
<ApplicationSection info="选择以个人或法人主体提交店铺申请。" title="名义">...</ApplicationSection>
<ApplicationSection info="填写申请人与店铺的正式联系资料。" title="基础信息">...</ApplicationSection>
<ShopTaxonomyRegistrationField ... />
<ApplicationSection info="填写主页展示的最低与最高服务费用。" title="费用区间">...</ApplicationSection>
<ApplicationSection info="简介会显示在店铺主页。" title="店铺简介">...</ApplicationSection>
<ApplicationSection info="支持 JPEG 或 PNG，并作为主页第一张展示图。" title="上传店铺第一张展示图">
  <ApplicationFileUpload accept="image/jpeg,image/png" file={showcaseImage} label={t("选择图片")} onChange={setShowcaseImage} />
</ApplicationSection>
<ApplicationSection info="按照店铺主页的正式组件实时预览申请资料。" title="主页效果预览">...</ApplicationSection>
<ApplicationBottomAction>
  <ApplicationButton className="w-full" disabled={busy} onClick={() => void saveShowcase()}>{busy ? t("保存中") : t("下一步：银行与身份")}</ApplicationButton>
</ApplicationBottomAction>
```

The taxonomy component is already its own bordered section; do not wrap it in a second card. Remove visible section-description paragraphs and the browser-native visible file input.

- [ ] **Step 7: Add all translations and update applicant validation copy**

Add exact entries to `identity-applications/i18n.ts` for:

```ts
"名义"
"基础信息"
"申请人"
"请输入申请人姓名"
"本人确认（eKYC）"
"已本人确认"
"费用区间"
"最低费用"
"最高费用"
"请完整填写费用区间"
"最低费用不能高于最高费用"
"店铺简介"
"上传店铺第一张展示图"
"选择图片"
"主页效果预览"
```

Provide meaningful `zh-Hant`, `ja`, `en`, and `ko` values for every entry. Update `validateMerchantShowcase` to return `"请输入申请人姓名"` for an empty `responsiblePersonName`.

- [ ] **Step 8: Run focused tests and verify GREEN**

```bash
npm test -- --run src/features/identity-applications/merchantPriceRange.test.ts src/features/identity-applications/formModel.test.ts src/features/identity-applications/ApplicationPages.test.ts src/features/identity-applications/i18n.test.ts src/features/shop-taxonomy/ShopTaxonomyRegistrationField.test.tsx
```

Expected: PASS for all focused suites.

- [ ] **Step 9: Run broader identity and i18n regressions**

```bash
npm test -- --run src/features/identity-applications/api.test.ts src/features/identity-applications/ReviewPages.test.ts src/features/shop-taxonomy/api.test.ts src/features/shop-taxonomy/model.test.ts src/i18n/translations.test.ts
npm run build
```

Expected: all tests PASS and production build exits 0.

- [ ] **Step 10: Commit the page composition**

```bash
git add src/features/identity-applications/MerchantApplicationPage.tsx src/features/identity-applications/ApplicationPages.test.ts src/features/identity-applications/formModel.ts src/features/identity-applications/formModel.test.ts src/features/identity-applications/i18n.ts src/features/identity-applications/i18n.test.ts
git commit -m "feat(identity): rebuild merchant application page"
```

---

### Task 5: Runtime acceptance and local-main integration

**Files:**
- Verify only; modify production files only if a reproduced defect is covered by a new failing test first.

**Interfaces:**
- Consumes: completed Tasks 1–4.
- Produces: browser evidence, clean feature branch, and a local `main` merge.

- [ ] **Step 1: Prove the formal runtime before browser acceptance**

From the isolated implementation worktree, start or safely reuse the formal runtime and record:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:5180 -sTCP:LISTEN
curl -s http://127.0.0.1:3000/api/v1/health
curl -s http://127.0.0.1:3000/api/v1/ready
```

For each listener, verify PID cwd and branch with `ps`, `lsof -a -p <PID> -d cwd`, and `git -C <cwd> branch --show-current`. Verify the frontend proxy target is the same formal backend. If a port belongs to another worktree, stop and start the feature worktree runtime on explicit alternate ports; report that as alternate-port evidence only.

- [ ] **Step 2: Browser-check the mobile page**

Use an authenticated formal user session and an iPhone 14 Pro Max-sized viewport. Open `/me/identity/merchant/apply` and verify:

```text
1. Seven sibling containers appear in the approved order.
2. Each section title has a circle-i explanation and no visible subtitle paragraph.
3. Applicant precedes legal/representative name; the eKYC button opens /me/settings/verification.
4. The button text reflects platformMembershipSelfApi, not a click-local flag.
5. No category displays a review-required suffix.
6. Keywords are absent before selection and appear after selecting a category.
7. 8800 and 12800 preview as ￥8,800 ~ ￥12,800.
8. Partial or reversed ranges block next-step save with localized errors.
9. The themed upload button opens a chooser and shows the selected file name.
10. StoreDetailExperience remains visible and maps the draft values.
11. The application header remains above preview tabs/content while scrolling.
12. The next button remains fixed at the home-navigation bottom position.
13. No horizontal overflow or browser-console error appears.
```

- [ ] **Step 3: Verify repository cleanliness and commit ancestry**

```bash
git status --short --branch
git log --oneline --decorate -8
git diff main...HEAD --check
git diff --stat main...HEAD
```

Expected: clean feature worktree; diff contains only approved design/plan ancestry and Task 1–4 files.

- [ ] **Step 4: Merge into the clean local `main` worktree**

Before merging:

```bash
git -C "/Users/eason/Documents/New project/.worktrees/dashboard-real-db-closure" status --short --branch
```

Expected: clean `main`. Then merge the feature branch non-destructively:

```bash
git -C "/Users/eason/Documents/New project/.worktrees/dashboard-real-db-closure" merge --no-ff codex/merchant-application-page-refactor
```

Do not reset, clean, or overwrite either the user's root worktree or any unrelated worktree. If `main` became dirty, stop before merging and report the exact files.

- [ ] **Step 5: Verify the merged `main`**

```bash
git -C "/Users/eason/Documents/New project/.worktrees/dashboard-real-db-closure" status --short --branch
git -C "/Users/eason/Documents/New project/.worktrees/dashboard-real-db-closure" log -5 --oneline --decorate
git -C "/Users/eason/Documents/New project/.worktrees/dashboard-real-db-closure" diff HEAD^ --check
```

Expected: clean local `main` containing a merge commit. Do not push or deploy unless the user separately requests it.
