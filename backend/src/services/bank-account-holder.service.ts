export type BankAccountApplicantKind = "corporate" | "individual";

export interface BankAccountHolderMatchInput {
  applicantKind: BankAccountApplicantKind;
  bankHolderName: string;
  corporateLegalNameKana?: string;
  eKycNameKana?: string;
}

const SMALL_KATAKANA_TO_LARGE: Readonly<Record<string, string>> = {
  ァ: "ア",
  ィ: "イ",
  ゥ: "ウ",
  ェ: "エ",
  ォ: "オ",
  ッ: "ツ",
  ャ: "ヤ",
  ュ: "ユ",
  ョ: "ヨ",
  ヮ: "ワ",
  ヵ: "カ",
  ヶ: "ケ"
};

const CORPORATE_TYPES = [
  ["カブシキガイシヤ", "カ"],
  ["ユウゲンガイシヤ", "ユ"],
  ["ゴウメイガイシヤ", "メ"],
  ["ゴウシガイシヤ", "シ"],
  ["ゴウドウガイシヤ", "ド"],
  ["イリヨウホウジン", "イ"],
  ["イツパンザイダンホウジン", "ザイ"],
  ["コウエキザイダンホウジン", "ザイ"],
  ["イツパンシヤダンホウジン", "シヤ"],
  ["コウエキシヤダンホウジン", "シヤ"],
  ["シヤカイフクシホウジン", "フク"],
  ["ガツコウホウジン", "ガク"],
  ["トクテイヒエイリカツドウホウジン", "トクヒ"]
] as const;

const hiraganaToKatakana = (value: string): string =>
  Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    return code >= 0x3041 && code <= 0x3096
      ? String.fromCharCode(code + 0x60)
      : character;
  }).join("");

export class BankAccountHolderService {
  public normalizeKatakana(value: string): string {
    const normalized = hiraganaToKatakana(value.normalize("NFKC")).toUpperCase();

    return Array.from(normalized, (character) => SMALL_KATAKANA_TO_LARGE[character] ?? character)
      .join("")
      .replace(/[\s・]/gu, "");
  }

  public matches(input: BankAccountHolderMatchInput): boolean {
    const bankHolder = this.normalizeKatakana(input.bankHolderName);
    if (!bankHolder) {
      return false;
    }

    if (input.applicantKind === "corporate") {
      if (!input.corporateLegalNameKana?.trim()) {
        return false;
      }

      return (
        this.normalizeCorporateName(bankHolder) ===
        this.normalizeCorporateName(input.corporateLegalNameKana)
      );
    }

    if (!input.eKycNameKana?.trim()) {
      return false;
    }

    return bankHolder === this.normalizeKatakana(input.eKycNameKana);
  }

  public assertMatches(input: BankAccountHolderMatchInput): void {
    if (!this.matches(input)) {
      throw new Error("error.bank_account.holder_name_mismatch");
    }
  }

  private normalizeCorporateName(value: string): string {
    let normalized = this.normalizeKatakana(value);

    for (const [fullName, abbreviation] of CORPORATE_TYPES) {
      if (normalized.startsWith(fullName)) {
        normalized = `${abbreviation})${normalized.slice(fullName.length)}`;
        break;
      }
      if (normalized.endsWith(fullName)) {
        normalized = `${normalized.slice(0, -fullName.length)}(${abbreviation}`;
        break;
      }
    }

    return normalized;
  }
}
