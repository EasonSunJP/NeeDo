import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import type { BankAccountInput } from "./api";
import { ApplicationDropdown } from "./ApplicationDropdown";

const options = [
  { value: "ordinary", label: "普通預金" },
  { value: "current", label: "当座預金" },
  { value: "savings", label: "貯蓄預金" },
  { value: "other", label: "その他" }
] as const;

export function MerchantAccountTypeSelect({ value, onChange }: {
  value: BankAccountInput["accountType"];
  onChange: (value: BankAccountInput["accountType"]) => void;
}) {
  const { language } = useI18n();
  return <ApplicationDropdown label={translateText("账户类型", language)} onChange={(next) => onChange(next as BankAccountInput["accountType"])} options={options} value={value} />;
}
