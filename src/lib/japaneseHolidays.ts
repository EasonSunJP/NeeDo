export type JapaneseHoliday = {
  date: string;
  title: string;
};

export const japaneseHolidaySeeds: JapaneseHoliday[] = [
  { date: "2026-01-01", title: "元日" },
  { date: "2026-01-12", title: "成人の日" },
  { date: "2026-02-11", title: "建国記念の日" },
  { date: "2026-02-23", title: "天皇誕生日" },
  { date: "2026-03-20", title: "春分の日" },
  { date: "2026-04-29", title: "昭和の日" },
  { date: "2026-05-03", title: "憲法記念日" },
  { date: "2026-05-04", title: "みどりの日" },
  { date: "2026-05-05", title: "こどもの日" },
  { date: "2026-05-06", title: "休日" },
  { date: "2026-07-20", title: "海の日" },
  { date: "2026-08-11", title: "山の日" },
  { date: "2026-09-21", title: "敬老の日" },
  { date: "2026-09-22", title: "休日" },
  { date: "2026-09-23", title: "秋分の日" },
  { date: "2026-10-12", title: "スポーツの日" },
  { date: "2026-11-03", title: "文化の日" },
  { date: "2026-11-23", title: "勤労感謝の日" },
  { date: "2027-01-01", title: "元日" },
  { date: "2027-01-11", title: "成人の日" },
  { date: "2027-02-11", title: "建国記念の日" },
  { date: "2027-02-23", title: "天皇誕生日" },
  { date: "2027-03-21", title: "春分の日" },
  { date: "2027-03-22", title: "休日" },
  { date: "2027-04-29", title: "昭和の日" },
  { date: "2027-05-03", title: "憲法記念日" },
  { date: "2027-05-04", title: "みどりの日" },
  { date: "2027-05-05", title: "こどもの日" },
  { date: "2027-07-19", title: "海の日" },
  { date: "2027-08-11", title: "山の日" },
  { date: "2027-09-20", title: "敬老の日" },
  { date: "2027-09-23", title: "秋分の日" },
  { date: "2027-10-11", title: "スポーツの日" },
  { date: "2027-11-03", title: "文化の日" },
  { date: "2027-11-23", title: "勤労感謝の日" }
];

const japaneseHolidayByDate = new Map(japaneseHolidaySeeds.map((holiday) => [holiday.date, holiday]));

export function getJapaneseHoliday(date: string) {
  return japaneseHolidayByDate.get(date) ?? null;
}
