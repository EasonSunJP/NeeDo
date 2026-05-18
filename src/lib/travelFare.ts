export type TravelFareMode = "taxi" | "train" | "bus";

export type FareBand = {
  uptoKm: number;
  fare: number;
};

export type TaxiFareRule = {
  initialDistanceKm: number;
  initialFare: number;
  incrementDistanceKm: number;
  incrementFare: number;
  dispatchFee: number;
  nightSurchargeRate: number;
};

export type TrainFareRule = {
  bands: FareBand[];
  overflowFarePerKm: number;
};

export type BusFareRule = {
  flatFare: number;
  flatDistanceKm: number;
  additionalFarePerBlock: number;
  additionalBlockKm: number;
  dayPassCap?: number;
};

export type AreaTravelFareRule = {
  id: string;
  region: string;
  prefecture: string;
  cityTier: "major-metro" | "metro" | "regional-core" | "regional";
  baseVisitFee: number;
  taxi: TaxiFareRule;
  train: TrainFareRule;
  bus: BusFareRule;
  enabled: boolean;
  note: string;
};

export type DistanceFarePreview = {
  distanceKm: number;
  taxi: number;
  lateNightTaxi: number;
  train: number;
  bus: number;
  recommendedMode: "打车" | "电车" | "公交";
};

const jrEast2026ShortDistanceBands: FareBand[] = [
  { uptoKm: 3, fare: 160 },
  { uptoKm: 6, fare: 200 },
  { uptoKm: 10, fare: 220 },
  { uptoKm: 15, fare: 260 },
  { uptoKm: 20, fare: 350 },
  { uptoKm: 25, fare: 440 },
  { uptoKm: 30, fare: 530 },
  { uptoKm: 40, fare: 720 },
  { uptoKm: 50, fare: 910 },
  { uptoKm: 60, fare: 1040 }
];

const kansaiShortDistanceBands: FareBand[] = [
  { uptoKm: 3, fare: 180 },
  { uptoKm: 6, fare: 220 },
  { uptoKm: 10, fare: 260 },
  { uptoKm: 15, fare: 330 },
  { uptoKm: 20, fare: 420 },
  { uptoKm: 30, fare: 620 },
  { uptoKm: 40, fare: 820 },
  { uptoKm: 50, fare: 1020 },
  { uptoKm: 60, fare: 1190 }
];

const nagoyaShortDistanceBands: FareBand[] = [
  { uptoKm: 3, fare: 210 },
  { uptoKm: 7, fare: 240 },
  { uptoKm: 11, fare: 270 },
  { uptoKm: 15, fare: 310 },
  { uptoKm: 20, fare: 340 },
  { uptoKm: 30, fare: 500 },
  { uptoKm: 40, fare: 680 },
  { uptoKm: 50, fare: 860 },
  { uptoKm: 60, fare: 1040 }
];

const kyushuShortDistanceBands: FareBand[] = [
  { uptoKm: 3, fare: 210 },
  { uptoKm: 7, fare: 260 },
  { uptoKm: 11, fare: 300 },
  { uptoKm: 15, fare: 340 },
  { uptoKm: 20, fare: 390 },
  { uptoKm: 30, fare: 580 },
  { uptoKm: 40, fare: 780 },
  { uptoKm: 50, fare: 980 },
  { uptoKm: 60, fare: 1180 }
];

const sapporoShortDistanceBands: FareBand[] = [
  { uptoKm: 3, fare: 210 },
  { uptoKm: 6, fare: 250 },
  { uptoKm: 10, fare: 290 },
  { uptoKm: 15, fare: 340 },
  { uptoKm: 20, fare: 390 },
  { uptoKm: 30, fare: 570 },
  { uptoKm: 40, fare: 760 },
  { uptoKm: 50, fare: 960 },
  { uptoKm: 60, fare: 1160 }
];

export const areaTravelFareRules: AreaTravelFareRule[] = [
  {
    id: "tokyo-special-ward",
    region: "东京23区 / 武三",
    prefecture: "東京都",
    cityTier: "major-metro",
    baseVisitFee: 600,
    taxi: {
      initialDistanceKm: 1,
      initialFare: 500,
      incrementDistanceKm: 0.232,
      incrementFare: 100,
      dispatchFee: 400,
      nightSurchargeRate: 0.2
    },
    train: {
      bands: jrEast2026ShortDistanceBands,
      overflowFarePerKm: 18
    },
    bus: {
      flatFare: 210,
      flatDistanceKm: 6,
      additionalFarePerBlock: 210,
      additionalBlockKm: 8,
      dayPassCap: 500
    },
    enabled: true,
    note: "东京中心区：打车按 2026 年 4 月后普通车上限，电车按 JR 东日本 2026 改定后的短距分段近似，公交按 23 区均一运价。"
  },
  {
    id: "kanagawa-yokohama-kawasaki",
    region: "横滨 / 川崎 / 横须贺",
    prefecture: "神奈川県",
    cityTier: "metro",
    baseVisitFee: 650,
    taxi: {
      initialDistanceKm: 1,
      initialFare: 500,
      incrementDistanceKm: 0.214,
      incrementFare: 100,
      dispatchFee: 400,
      nightSurchargeRate: 0.2
    },
    train: {
      bands: jrEast2026ShortDistanceBands,
      overflowFarePerKm: 18
    },
    bus: {
      flatFare: 220,
      flatDistanceKm: 6,
      additionalFarePerBlock: 220,
      additionalBlockKm: 8,
      dayPassCap: 600
    },
    enabled: true,
    note: "神奈川京滨区：打车按 2026 年 3 月后横滨・川崎・横须贺普通车上限，公交按横滨市区常见均一单程处理。"
  },
  {
    id: "osaka-city",
    region: "大阪市域",
    prefecture: "大阪府",
    cityTier: "major-metro",
    baseVisitFee: 650,
    taxi: {
      initialDistanceKm: 1.2,
      initialFare: 600,
      incrementDistanceKm: 0.231,
      incrementFare: 100,
      dispatchFee: 400,
      nightSurchargeRate: 0.2
    },
    train: {
      bands: kansaiShortDistanceBands,
      overflowFarePerKm: 20
    },
    bus: {
      flatFare: 210,
      flatDistanceKm: 6,
      additionalFarePerBlock: 210,
      additionalBlockKm: 8,
      dayPassCap: 600
    },
    enabled: true,
    note: "大阪市域：打车按大阪地区普通车上限，电车按关西都市短距通勤票价近似，公交按市内均一单程处理。"
  },
  {
    id: "nagoya-city",
    region: "名古屋市域",
    prefecture: "愛知県",
    cityTier: "metro",
    baseVisitFee: 650,
    taxi: {
      initialDistanceKm: 0.91,
      initialFare: 500,
      incrementDistanceKm: 0.232,
      incrementFare: 100,
      dispatchFee: 200,
      nightSurchargeRate: 0.2
    },
    train: {
      bands: nagoyaShortDistanceBands,
      overflowFarePerKm: 18
    },
    bus: {
      flatFare: 210,
      flatDistanceKm: 6,
      additionalFarePerBlock: 210,
      additionalBlockKm: 8,
      dayPassCap: 620
    },
    enabled: true,
    note: "名古屋市域：打车按 2025 年 10 月后普通车上限，电车按名古屋市内短距票价近似，公交按市内均一单程处理。"
  },
  {
    id: "fukuoka-city",
    region: "福冈市域",
    prefecture: "福岡県",
    cityTier: "regional-core",
    baseVisitFee: 750,
    taxi: {
      initialDistanceKm: 1.064,
      initialFare: 670,
      incrementDistanceKm: 0.268,
      incrementFare: 80,
      dispatchFee: 300,
      nightSurchargeRate: 0.2
    },
    train: {
      bands: kyushuShortDistanceBands,
      overflowFarePerKm: 20
    },
    bus: {
      flatFare: 240,
      flatDistanceKm: 7,
      additionalFarePerBlock: 80,
      additionalBlockKm: 5,
      dayPassCap: 700
    },
    enabled: true,
    note: "福冈市域：打车按福冈市普通车示例运价，公交按西铁等都市圈常见单程区间做运营补贴估算。"
  },
  {
    id: "sapporo-city",
    region: "札幌市域",
    prefecture: "北海道",
    cityTier: "regional-core",
    baseVisitFee: 800,
    taxi: {
      initialDistanceKm: 1.05,
      initialFare: 600,
      incrementDistanceKm: 0.272,
      incrementFare: 100,
      dispatchFee: 300,
      nightSurchargeRate: 0.2
    },
    train: {
      bands: sapporoShortDistanceBands,
      overflowFarePerKm: 20
    },
    bus: {
      flatFare: 240,
      flatDistanceKm: 7,
      additionalFarePerBlock: 80,
      additionalBlockKm: 5,
      dayPassCap: 800
    },
    enabled: true,
    note: "札幌市域：打车按 2025 年 12 月后札幌普通车运价趋势，冬季或雪天可在调度侧追加风险补贴。"
  },
  {
    id: "regional-standard",
    region: "地方都市基准",
    prefecture: "全国",
    cityTier: "regional",
    baseVisitFee: 900,
    taxi: {
      initialDistanceKm: 1.2,
      initialFare: 650,
      incrementDistanceKm: 0.26,
      incrementFare: 100,
      dispatchFee: 300,
      nightSurchargeRate: 0.2
    },
    train: {
      bands: kyushuShortDistanceBands,
      overflowFarePerKm: 22
    },
    bus: {
      flatFare: 250,
      flatDistanceKm: 6,
      additionalFarePerBlock: 80,
      additionalBlockKm: 5,
      dayPassCap: 900
    },
    enabled: false,
    note: "没有单独城市规则时使用的保守基准：公交和电车比大都市略高，打车按地方普通车中位水平估算。"
  }
];

function roundUpTo(value: number, unit: number) {
  return Math.ceil(value / unit) * unit;
}

function normalizeDistance(distanceKm: number) {
  return Number.isFinite(distanceKm) ? Math.max(0, distanceKm) : 0;
}

export function estimateTaxiFare(rule: AreaTravelFareRule, distanceKm: number, options: { lateNight?: boolean; includeDispatch?: boolean } = {}) {
  const safeDistance = normalizeDistance(distanceKm);

  if (safeDistance === 0) {
    return 0;
  }

  const extraDistance = Math.max(0, safeDistance - rule.taxi.initialDistanceKm);
  const extraUnits = Math.ceil(extraDistance / rule.taxi.incrementDistanceKm);
  const dispatchFee = options.includeDispatch ? rule.taxi.dispatchFee : 0;
  const normalFare = rule.taxi.initialFare + extraUnits * rule.taxi.incrementFare + dispatchFee;
  const surgedFare = options.lateNight ? normalFare * (1 + rule.taxi.nightSurchargeRate) : normalFare;

  return roundUpTo(surgedFare, 10);
}

export function estimateTrainFare(rule: AreaTravelFareRule, distanceKm: number) {
  const safeDistance = normalizeDistance(distanceKm);

  if (safeDistance === 0) {
    return 0;
  }

  const matchingBand = rule.train.bands.find((band) => safeDistance <= band.uptoKm);

  if (matchingBand) {
    return matchingBand.fare;
  }

  const lastBand = rule.train.bands[rule.train.bands.length - 1];

  if (!lastBand) {
    return 0;
  }

  return roundUpTo(lastBand.fare + (safeDistance - lastBand.uptoKm) * rule.train.overflowFarePerKm, 10);
}

export function estimateBusFare(rule: AreaTravelFareRule, distanceKm: number) {
  const safeDistance = normalizeDistance(distanceKm);

  if (safeDistance === 0) {
    return 0;
  }

  const extraDistance = Math.max(0, safeDistance - rule.bus.flatDistanceKm);
  const extraBlocks = rule.bus.additionalFarePerBlock > 0 ? Math.ceil(extraDistance / rule.bus.additionalBlockKm) : 0;
  const fare = rule.bus.flatFare + extraBlocks * rule.bus.additionalFarePerBlock;

  return rule.bus.dayPassCap ? Math.min(fare, rule.bus.dayPassCap) : fare;
}

export function estimateTravelFare(rule: AreaTravelFareRule, mode: TravelFareMode, distanceKm: number) {
  if (mode === "taxi") {
    return estimateTaxiFare(rule, distanceKm);
  }

  if (mode === "train") {
    return estimateTrainFare(rule, distanceKm);
  }

  return estimateBusFare(rule, distanceKm);
}

export function pickRecommendedTravelMode(rule: AreaTravelFareRule, distanceKm: number): DistanceFarePreview["recommendedMode"] {
  const taxi = estimateTaxiFare(rule, distanceKm);
  const train = estimateTrainFare(rule, distanceKm);
  const bus = estimateBusFare(rule, distanceKm);
  const cheapestTransitMode = train <= bus ? "电车" : "公交";
  const cheapestTransitFare = Math.min(train, bus);

  if (distanceKm <= 2 && taxi <= cheapestTransitFare * 2.2) {
    return "打车";
  }

  return cheapestTransitMode;
}

export function buildDistanceFarePreview(rule: AreaTravelFareRule, distancesKm: number[] = [3, 8, 15]) {
  return distancesKm.map((distanceKm) => ({
    distanceKm,
    taxi: estimateTaxiFare(rule, distanceKm),
    lateNightTaxi: estimateTaxiFare(rule, distanceKm, { lateNight: true }),
    train: estimateTrainFare(rule, distanceKm),
    bus: estimateBusFare(rule, distanceKm),
    recommendedMode: pickRecommendedTravelMode(rule, distanceKm)
  }));
}
