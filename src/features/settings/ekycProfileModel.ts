export type EkycProfile = {
  familyName: string;
  givenName: string;
  familyNameKana: string;
  givenNameKana: string;
  birthYear: string;
  birthMonth: string;
  birthDay: string;
  sex: string;
  postalCode: string;
  city: string;
  street: string;
  building: string;
  occupation: string;
  otherOccupation: string;
};

export const emptyEkycProfile: EkycProfile = {
  familyName: "", givenName: "", familyNameKana: "", givenNameKana: "",
  birthYear: "", birthMonth: "", birthDay: "", sex: "",
  postalCode: "", city: "", street: "", building: "", occupation: "", otherOccupation: ""
};

export const ekycOccupations = [
  { value: "employee", label: "公司／团体职员" },
  { value: "executive", label: "公司／团体管理人员" },
  { value: "civil_servant", label: "公务员" },
  { value: "self_employed", label: "个体经营／自由职业" },
  { value: "part_time", label: "兼职／临时工" },
  { value: "contract", label: "派遣／合同员工" },
  { value: "homemaker", label: "家庭主妇／主夫" },
  { value: "student", label: "学生" },
  { value: "retired", label: "退休／无业" },
  { value: "other", label: "其他" }
] as const;

export function normalizeEkycProfile(profile: EkycProfile): EkycProfile {
  const normalized = Object.fromEntries(Object.entries(profile).map(([key, value]) => [key, value.trim()])) as EkycProfile;
  normalized.familyNameKana = normalized.familyNameKana.normalize("NFKC");
  normalized.givenNameKana = normalized.givenNameKana.normalize("NFKC");
  normalized.postalCode = normalized.postalCode.normalize("NFKC").replace(/[\s-]/g, "");
  if (normalized.occupation !== "other") normalized.otherOccupation = "";
  return normalized;
}

export function validateEkycProfile(input: EkycProfile, now = new Date()): string {
  const p = normalizeEkycProfile(input);
  if (!p.familyName || !p.givenName) return "请填写姓名";
  const kana = /^[\u30A1-\u30FA\u30FC\u30FD\u30FE\u30FB\s]+$/u;
  if (!kana.test(p.familyNameKana) || !kana.test(p.givenNameKana)) return "姓名读音请使用全角片假名";
  const year = Number(p.birthYear), month = Number(p.birthMonth), day = Number(p.birthDay);
  const date = new Date(year, month - 1, day);
  if (!year || !month || !day || year < now.getFullYear() - 120 || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day || date > now) return "请选择有效的出生日期";
  if (!["male", "female"].includes(p.sex)) return "请选择性别";
  if (!/^\d{7}$/.test(p.postalCode)) return "请输入7位数字的邮政编码";
  if (!p.city || !p.street) return "请填写完整的居住地址";
  if (!ekycOccupations.some(option => option.value === p.occupation)) return "请选择职业";
  if (p.occupation === "other" && !p.otherOccupation) return "请填写其他职业";
  return "";
}
