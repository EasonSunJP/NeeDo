// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EkycProfileForm } from "./EkycProfileForm";
import pageSource from "./UnifiedSettingsPages.tsx?raw";
vi.mock("../../i18n/I18nProvider", () => ({ useI18n: () => ({ language: "zh" }) }));
let container: HTMLDivElement, root: Root;
let onError = vi.fn();
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("scrollTo", vi.fn());
  onError = vi.fn();
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
  await act(async () => root.render(<EkycProfileForm onError={onError} />));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
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
  expect(button("认证提交暂未开放").disabled).toBe(true);
  await act(async () => button("上一步").click());
  expect(container.querySelector<HTMLInputElement>('input[aria-label="姓"]')!.value).toBe("山田");
  expect(container.querySelector<HTMLInputElement>('input[aria-label="邮政编码"]')!.value).toBe("1600022");
});
