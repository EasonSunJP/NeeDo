// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EkycProfileForm } from "./EkycProfileForm";
import { ekycApplicationsApi } from "./ekycApplicationsApi";
import pageSource from "./UnifiedSettingsPages.tsx?raw";
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ session: { id: 41 } }) }));
vi.mock("../../i18n/I18nProvider", () => ({ useI18n: () => ({ language: "zh" }) }));
let container: HTMLDivElement, root: Root;
let onError = vi.fn();
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("scrollTo", vi.fn());
  vi.spyOn(ekycApplicationsApi, "listMine").mockResolvedValue({ list: [], total: 0, page: 1, page_size: 20 });
  onError = vi.fn();
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  await act(async () => root.render(<EkycProfileForm onError={onError} />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const button = (text: string) => Array.from(container.querySelectorAll("button")).find(el => el.textContent === text)!;
async function fill(label: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function select(label: string, value: string) {
  await act(async () => container.querySelector<HTMLButtonElement>(`[role="combobox"][aria-label="${label}"]`)!.click());
  await act(async () => container.querySelector<HTMLButtonElement>(`[role="option"][data-value="${value}"]`)!.click());
}
it("contains only requested fields and uses the shared close and no bottom navigation", () => {
  for (const label of ["姓", "名", "姓（片假名）", "名（片假名）", "邮政编码", "都道府县／市区町村", "街道门牌", "楼栋／房间号"]) {
    expect(container.querySelector(`input[aria-label="${label}"]`)).not.toBeNull();
  }
  for (const excluded of ["居住形态", "联络先", "邮件", "银行卡", "交易目的"]) expect(container.textContent).not.toContain(excluded);
  const page = pageSource.slice(pageSource.indexOf("export function UnifiedSettingsVerificationPage"), pageSource.indexOf("export function UnifiedSettingsServiceRangePage"));
  expect(page).toContain("hideNavigation");
  expect(page).not.toContain("PersonalVerificationStatus");
  expect(page).toContain("closeTo={getSettingsBasePath(portal)}");
});
it("keeps incomplete entries on input and forwards validation to the floating error", async () => {
  await act(async () => button("确认填写内容").click());
  expect(onError).toHaveBeenLastCalledWith("请填写姓名");
  expect(container.querySelector('input[aria-label="姓"]')).not.toBeNull();
});
it("reviews normalized entries and retains them when returning to edit, without claiming verification", async () => {
  for (const [label, value] of [["姓", "山田"], ["名", "太郎"], ["姓（片假名）", "ﾔﾏﾀﾞ"], ["名（片假名）", "タロウ"], ["邮政编码", "１６０００２２"], ["都道府县／市区町村", "東京都新宿区"], ["街道门牌", "新宿1-1"]]) await fill(label, value);
  await select("出生年", "1992"); await select("出生月", "2"); await select("出生日", "29"); await select("职业", "employee");
  await act(async () => container.querySelector<HTMLInputElement>('input[value="male"]')!.click());
  await act(async () => button("确认填写内容").click());
  expect(container.textContent).toContain("ヤマダ タロウ");
  expect(container.textContent).toContain("资料尚未提交");
  expect(button("提交审核").disabled).toBe(false);
  await act(async () => button("上一步").click());
  expect(container.querySelector<HTMLInputElement>('input[aria-label="姓"]')!.value).toBe("山田");
  expect(container.querySelector<HTMLInputElement>('input[aria-label="邮政编码"]')!.value).toBe("1600022");
});

it("restores a submitted snapshot, never submits on entry, and withdraws with its version", async () => {
  const profile = { familyName: "山田", givenName: "太郎", familyNameKana: "ヤマダ", givenNameKana: "タロウ", birthYear: "1992", birthMonth: "2", birthDay: "29", sex: "male", postalCode: "1600022", city: "東京都", street: "新宿1", building: "", occupation: "employee", otherOccupation: "" };
  const application = { id: 7, userId: 41, userPublicId: "u0000000041", status: "submitted" as const, version: 3, createdAt: "2026-09-07", updatedAt: "2026-09-07", reviewedAt: null, reviewNote: null, rejectionReason: null, profile };
  vi.mocked(ekycApplicationsApi.listMine).mockResolvedValue({ list: [application], total: 1, page: 1, page_size: 20 });
  vi.spyOn(ekycApplicationsApi, "getMine").mockResolvedValue(application);
  const submit = vi.spyOn(ekycApplicationsApi, "submit");
  const withdraw = vi.spyOn(ekycApplicationsApi, "withdraw").mockResolvedValue({ ...application, status: "withdrawn", version: 4 });
  await act(async () => root.render(<EkycProfileForm key="restored" onError={onError} />));
  expect(container.textContent).toContain("山田 太郎");
  expect(button("审核中").disabled).toBe(true);
  expect(container.querySelector('input[aria-label="姓"]')).toBeNull();
  expect(submit).not.toHaveBeenCalled();
  await act(async () => button("撤回").click());
  expect(withdraw).toHaveBeenCalledWith(7, 3);
  expect(container.querySelector<HTMLInputElement>('input[aria-label="姓"]')!.value).toBe("山田");
});
