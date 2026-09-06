import { translateText, type Language, type TranslationEntry } from "../../i18n/translations";
const entry = (zhHant: string, ja: string, en: string, ko: string): TranslationEntry => ({ "zh-Hant": zhHant, ja, en, ko });
const bankResumeTranslations: Record<string, TranslationEntry> = {
  "已保存的银行账户": entry("已儲存的銀行帳戶", "保存済みの銀行口座", "Saved bank account", "저장된 은행 계좌"),
  "修改银行账户": entry("修改銀行帳戶", "銀行口座を変更", "Change bank account", "은행 계좌 변경"),
  "继续使用已保存的账户，无需再次填写完整账号。": entry("繼續使用已儲存的帳戶，無需再次填寫完整帳號。", "保存済み口座を引き続き使用できます。口座番号の再入力は不要です。", "Continue with the saved account without entering the full account number again.", "전체 계좌번호를 다시 입력하지 않고 저장된 계좌를 계속 사용할 수 있습니다."),
  "法人登记资料已保存": entry("法人登記資料已儲存", "法人登記資料は保存済みです", "Corporate registration document saved", "법인 등기 자료가 저장되었습니다")
};
export const translateBankResumeText = (source: string, language: Language): string =>
  (language === "zh" ? source : bankResumeTranslations[source]?.[language]) ?? translateText(source, language);
