// Source: Japanese Bankers Association member list, checked 2026-09-07 (list dated 2026-08-03).
// https://www.zenginkyo.or.jp/abstract/outline/organization/member-01/
export type JapanBankGroup = "major" | "online" | "regional" | "trust";
export type JapanBank = { code: string; name: string; group: JapanBankGroup };
export const japanBankGroups: { id: JapanBankGroup; label: string }[] = [
  { id: "major", label: "主要银行" }, { id: "online", label: "网络及新型银行" },
  { id: "regional", label: "地方银行" }, { id: "trust", label: "信托银行" }
];
export const japanBanks: readonly JapanBank[] = [
  {
    "code": "0001",
    "name": "みずほ銀行",
    "group": "major"
  },
  {
    "code": "0005",
    "name": "三菱UFJ銀行",
    "group": "major"
  },
  {
    "code": "0009",
    "name": "三井住友銀行",
    "group": "major"
  },
  {
    "code": "0010",
    "name": "りそな銀行",
    "group": "major"
  },
  {
    "code": "0017",
    "name": "埼玉りそな銀行",
    "group": "major"
  },
  {
    "code": "0034",
    "name": "セブン銀行",
    "group": "online"
  },
  {
    "code": "0116",
    "name": "北海道銀行",
    "group": "regional"
  },
  {
    "code": "0117",
    "name": "青森みちのく銀行",
    "group": "regional"
  },
  {
    "code": "0119",
    "name": "秋田銀行",
    "group": "regional"
  },
  {
    "code": "0120",
    "name": "北都銀行",
    "group": "regional"
  },
  {
    "code": "0121",
    "name": "荘内銀行",
    "group": "regional"
  },
  {
    "code": "0122",
    "name": "山形銀行",
    "group": "regional"
  },
  {
    "code": "0123",
    "name": "岩手銀行",
    "group": "regional"
  },
  {
    "code": "0124",
    "name": "東北銀行",
    "group": "regional"
  },
  {
    "code": "0125",
    "name": "七十七銀行",
    "group": "regional"
  },
  {
    "code": "0126",
    "name": "東邦銀行",
    "group": "regional"
  },
  {
    "code": "0128",
    "name": "群馬銀行",
    "group": "regional"
  },
  {
    "code": "0129",
    "name": "足利銀行",
    "group": "regional"
  },
  {
    "code": "0130",
    "name": "常陽銀行",
    "group": "regional"
  },
  {
    "code": "0131",
    "name": "筑波銀行",
    "group": "regional"
  },
  {
    "code": "0133",
    "name": "武蔵野銀行",
    "group": "regional"
  },
  {
    "code": "0134",
    "name": "千葉銀行",
    "group": "regional"
  },
  {
    "code": "0135",
    "name": "千葉興業銀行",
    "group": "regional"
  },
  {
    "code": "0137",
    "name": "きらぼし銀行",
    "group": "regional"
  },
  {
    "code": "0138",
    "name": "横浜銀行",
    "group": "regional"
  },
  {
    "code": "0140",
    "name": "第四北越銀行",
    "group": "regional"
  },
  {
    "code": "0142",
    "name": "山梨中央銀行",
    "group": "regional"
  },
  {
    "code": "0143",
    "name": "八十二長野銀行",
    "group": "regional"
  },
  {
    "code": "0144",
    "name": "北陸銀行",
    "group": "regional"
  },
  {
    "code": "0145",
    "name": "富山銀行",
    "group": "regional"
  },
  {
    "code": "0146",
    "name": "北國銀行",
    "group": "regional"
  },
  {
    "code": "0147",
    "name": "福井銀行",
    "group": "regional"
  },
  {
    "code": "0149",
    "name": "静岡銀行",
    "group": "regional"
  },
  {
    "code": "0150",
    "name": "スルガ銀行",
    "group": "regional"
  },
  {
    "code": "0151",
    "name": "清水銀行",
    "group": "regional"
  },
  {
    "code": "0152",
    "name": "大垣共立銀行",
    "group": "regional"
  },
  {
    "code": "0153",
    "name": "十六銀行",
    "group": "regional"
  },
  {
    "code": "0154",
    "name": "三十三銀行",
    "group": "regional"
  },
  {
    "code": "0155",
    "name": "百五銀行",
    "group": "regional"
  },
  {
    "code": "0157",
    "name": "滋賀銀行",
    "group": "regional"
  },
  {
    "code": "0158",
    "name": "京都銀行",
    "group": "regional"
  },
  {
    "code": "0159",
    "name": "関西みらい銀行",
    "group": "regional"
  },
  {
    "code": "0161",
    "name": "池田泉州銀行",
    "group": "regional"
  },
  {
    "code": "0162",
    "name": "南都銀行",
    "group": "regional"
  },
  {
    "code": "0163",
    "name": "紀陽銀行",
    "group": "regional"
  },
  {
    "code": "0164",
    "name": "但馬銀行",
    "group": "regional"
  },
  {
    "code": "0166",
    "name": "鳥取銀行",
    "group": "regional"
  },
  {
    "code": "0167",
    "name": "山陰合同銀行",
    "group": "regional"
  },
  {
    "code": "0168",
    "name": "中国銀行",
    "group": "regional"
  },
  {
    "code": "0169",
    "name": "広島銀行",
    "group": "regional"
  },
  {
    "code": "0170",
    "name": "山口銀行",
    "group": "regional"
  },
  {
    "code": "0172",
    "name": "阿波銀行",
    "group": "regional"
  },
  {
    "code": "0173",
    "name": "百十四銀行",
    "group": "regional"
  },
  {
    "code": "0174",
    "name": "伊予銀行",
    "group": "regional"
  },
  {
    "code": "0175",
    "name": "四国銀行",
    "group": "regional"
  },
  {
    "code": "0177",
    "name": "福岡銀行",
    "group": "regional"
  },
  {
    "code": "0178",
    "name": "筑邦銀行",
    "group": "regional"
  },
  {
    "code": "0179",
    "name": "佐賀銀行",
    "group": "regional"
  },
  {
    "code": "0181",
    "name": "十八親和銀行",
    "group": "regional"
  },
  {
    "code": "0182",
    "name": "肥後銀行",
    "group": "regional"
  },
  {
    "code": "0183",
    "name": "大分銀行",
    "group": "regional"
  },
  {
    "code": "0184",
    "name": "宮崎銀行",
    "group": "regional"
  },
  {
    "code": "0185",
    "name": "鹿児島銀行",
    "group": "regional"
  },
  {
    "code": "0187",
    "name": "琉球銀行",
    "group": "regional"
  },
  {
    "code": "0188",
    "name": "沖縄銀行",
    "group": "regional"
  },
  {
    "code": "0190",
    "name": "西日本シティ銀行",
    "group": "regional"
  },
  {
    "code": "0191",
    "name": "北九州銀行",
    "group": "regional"
  },
  {
    "code": "0288",
    "name": "三菱ＵＦＪ信託銀行",
    "group": "trust"
  },
  {
    "code": "0289",
    "name": "みずほ信託銀行",
    "group": "trust"
  },
  {
    "code": "0294",
    "name": "三井住友信託銀行",
    "group": "trust"
  },
  {
    "code": "0304",
    "name": "野村信託銀行",
    "group": "trust"
  },
  {
    "code": "0397",
    "name": "SBI新生銀行",
    "group": "major"
  },
  {
    "code": "0398",
    "name": "あおぞら銀行",
    "group": "major"
  },
  {
    "code": "0501",
    "name": "北洋銀行",
    "group": "regional"
  },
  {
    "code": "0508",
    "name": "きらやか銀行",
    "group": "regional"
  },
  {
    "code": "0509",
    "name": "北日本銀行",
    "group": "regional"
  },
  {
    "code": "0512",
    "name": "仙台銀行",
    "group": "regional"
  },
  {
    "code": "0513",
    "name": "福島銀行",
    "group": "regional"
  },
  {
    "code": "0514",
    "name": "大東銀行",
    "group": "regional"
  },
  {
    "code": "0516",
    "name": "東和銀行",
    "group": "regional"
  },
  {
    "code": "0517",
    "name": "栃木銀行",
    "group": "regional"
  },
  {
    "code": "0522",
    "name": "京葉銀行",
    "group": "regional"
  },
  {
    "code": "0525",
    "name": "東日本銀行",
    "group": "regional"
  },
  {
    "code": "0526",
    "name": "東京スター銀行",
    "group": "regional"
  },
  {
    "code": "0530",
    "name": "神奈川銀行",
    "group": "regional"
  },
  {
    "code": "0532",
    "name": "大光銀行",
    "group": "regional"
  },
  {
    "code": "0534",
    "name": "富山第一銀行",
    "group": "regional"
  },
  {
    "code": "0538",
    "name": "静岡中央銀行",
    "group": "regional"
  },
  {
    "code": "0542",
    "name": "あいち銀行",
    "group": "regional"
  },
  {
    "code": "0543",
    "name": "名古屋銀行",
    "group": "regional"
  },
  {
    "code": "0562",
    "name": "みなと銀行",
    "group": "regional"
  },
  {
    "code": "0565",
    "name": "島根銀行",
    "group": "regional"
  },
  {
    "code": "0566",
    "name": "トマト銀行",
    "group": "regional"
  },
  {
    "code": "0569",
    "name": "もみじ銀行",
    "group": "regional"
  },
  {
    "code": "0570",
    "name": "西京銀行",
    "group": "regional"
  },
  {
    "code": "0572",
    "name": "徳島大正銀行",
    "group": "regional"
  },
  {
    "code": "0573",
    "name": "香川銀行",
    "group": "regional"
  },
  {
    "code": "0576",
    "name": "愛媛銀行",
    "group": "regional"
  },
  {
    "code": "0578",
    "name": "高知銀行",
    "group": "regional"
  },
  {
    "code": "0582",
    "name": "福岡中央銀行",
    "group": "regional"
  },
  {
    "code": "0583",
    "name": "佐賀共栄銀行",
    "group": "regional"
  },
  {
    "code": "0585",
    "name": "長崎銀行",
    "group": "regional"
  },
  {
    "code": "0587",
    "name": "熊本銀行",
    "group": "regional"
  },
  {
    "code": "0590",
    "name": "豊和銀行",
    "group": "regional"
  },
  {
    "code": "0591",
    "name": "宮崎太陽銀行",
    "group": "regional"
  },
  {
    "code": "0594",
    "name": "南日本銀行",
    "group": "regional"
  },
  {
    "code": "0596",
    "name": "沖縄海邦銀行",
    "group": "regional"
  },
  {
    "code": "0033",
    "name": "PayPay銀行",
    "group": "online"
  },
  {
    "code": "0035",
    "name": "ソニー銀行",
    "group": "online"
  },
  {
    "code": "0036",
    "name": "楽天銀行",
    "group": "online"
  },
  {
    "code": "0038",
    "name": "ドコモSMTBネット銀行",
    "group": "online"
  },
  {
    "code": "0039",
    "name": "auじぶん銀行",
    "group": "online"
  },
  {
    "code": "0040",
    "name": "イオン銀行",
    "group": "online"
  },
  {
    "code": "0041",
    "name": "大和ネクスト銀行",
    "group": "online"
  },
  {
    "code": "0042",
    "name": "ローソン銀行",
    "group": "online"
  },
  {
    "code": "0043",
    "name": "みんなの銀行",
    "group": "online"
  },
  {
    "code": "0044",
    "name": "UI銀行",
    "group": "online"
  },
  {
    "code": "0046",
    "name": "０１銀行",
    "group": "online"
  },
  {
    "code": "0300",
    "name": "SMBC信託銀行",
    "group": "trust"
  },
  {
    "code": "0307",
    "name": "オリックス銀行",
    "group": "online"
  },
  {
    "code": "0310",
    "name": "GMOあおぞらネット銀行",
    "group": "online"
  },
  {
    "code": "9900",
    "name": "ゆうちょ銀行",
    "group": "major"
  }
];
