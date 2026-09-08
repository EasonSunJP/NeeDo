import type { ContentLocaleCode } from "../constants/content-locales";
import type { ExchangePostType, ExchangeServiceMode } from "../types/exchange.types";
import {
  EXCHANGE_SIMULATION_COUNTS,
  EXCHANGE_SIMULATION_DEFAULT_SEED,
  EXCHANGE_SIMULATION_NAMESPACE
} from "./exchange-simulation.constants";

export interface ExchangeSimulationActor {
  userId: number;
  identityId: number;
  identityType: string;
  publicId: string;
  displayName: string;
  avatarUrl: string | null;
  intelligenceService?: ExchangeSimulationServiceBinding;
}

export interface ExchangeSimulationServiceBinding {
  serviceRef: `shop:${number}` | `technician:${number}`;
  serviceId: number | null;
  technicianServiceId: number | null;
  serviceName: string;
  serviceDurationMinutes: number;
  catalogPriceJpy: number;
  serviceMode: ExchangeServiceMode;
  addressLabel: string | null;
  serviceAreas: string[];
}

export interface ExchangeSimulationInteraction {
  actor: ExchangeSimulationActor;
  createdAt: string;
}

export interface ExchangeSimulationComment extends ExchangeSimulationInteraction {
  key: string;
  idempotencyKey: string;
  content: string;
}

export interface ExchangeSimulationShare extends ExchangeSimulationInteraction {
  key: string;
  idempotencyKey: string;
}

export interface ExchangeSimulationPost {
  key: string;
  idempotencyKey: string;
  type: ExchangePostType;
  author: ExchangeSimulationActor;
  title: string;
  detail: string;
  contentLocale: ContentLocaleCode;
  areaLabel: string;
  serviceStartAt: string;
  serviceEndAt: string;
  expiresAt: string;
  createdAt: string;
  demand: { budgetMinJpy: number; budgetMaxJpy: number } | null;
  intelligence: {
    serviceRef: ExchangeSimulationServiceBinding["serviceRef"];
    serviceId: number | null;
    technicianServiceId: number | null;
    serviceName: string;
    serviceDurationMinutes: number;
    serviceMode: ExchangeServiceMode;
    addressLabel: string | null;
    serviceAreas: string[];
    originalPriceJpy: number | null;
    campaignPriceJpy: number;
  } | null;
  comments: ExchangeSimulationComment[];
  likes: ExchangeSimulationInteraction[];
  shares: ExchangeSimulationShare[];
}

export interface ExchangeSimulationPlan {
  namespace: typeof EXCHANGE_SIMULATION_NAMESPACE;
  seed: string;
  posts: ExchangeSimulationPost[];
}

interface LocalizedContent {
  demandTitle: string;
  demandDetail: string;
  intelligenceTitle: string;
  intelligenceDetail: string;
  comment: string;
}

const LOCALES: readonly ContentLocaleCode[] = ["ja", "zh-CN", "zh-TW", "en", "ko"];
const AREAS = ["渋谷区", "新宿区", "港区", "目黒区", "世田谷区"] as const;
const LOCALIZED_CONTENT: Record<ContentLocaleCode, LocalizedContent> = {
  ja: {
    demandTitle: "イベント前のヘアセットをお願いしたい",
    demandDetail: "希望時間に相談しながら、自然で崩れにくい仕上がりをお願いしたいです。",
    intelligenceTitle: "平日限定のケア枠をご案内します",
    intelligenceDetail: "事前相談を含む落ち着いた施術枠です。対応範囲と時間をご確認ください。",
    comment: "時間と対応内容について、もう少し詳しく教えてください。"
  },
  "zh-CN": {
    demandTitle: "想预约活动前的造型服务",
    demandDetail: "希望在约定时间沟通细节，完成自然且持久的造型。",
    intelligenceTitle: "工作日限定护理时段开放",
    intelligenceDetail: "提供包含事前沟通的安静服务时段，请确认服务区域和时间。",
    comment: "可以再说明一下时间和具体服务内容吗？"
  },
  "zh-TW": {
    demandTitle: "想預約活動前的造型服務",
    demandDetail: "希望在約定時間溝通細節，完成自然且持久的造型。",
    intelligenceTitle: "平日限定護理時段開放",
    intelligenceDetail: "提供包含事前溝通的安靜服務時段，請確認服務區域和時間。",
    comment: "可以再說明一下時間和具體服務內容嗎？"
  },
  en: {
    demandTitle: "Looking for event-ready styling",
    demandDetail: "I would like a natural, lasting style after confirming the details together.",
    intelligenceTitle: "Weekday care appointments available",
    intelligenceDetail:
      "A quiet service slot with a short consultation is available in the listed areas.",
    comment: "Could you share a little more about the timing and service details?"
  },
  ko: {
    demandTitle: "행사 전 스타일링 서비스를 찾고 있어요",
    demandDetail: "예약 시간에 세부 내용을 상담하고 자연스럽고 오래가는 스타일을 원합니다.",
    intelligenceTitle: "평일 한정 케어 예약 안내",
    intelligenceDetail: "사전 상담이 포함된 편안한 서비스 시간입니다. 지역과 시간을 확인해 주세요.",
    comment: "시간과 서비스 내용을 조금 더 자세히 알려 주실 수 있나요?"
  }
};

const hashSeed = (seed: string): number => {
  let value = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
};

const createSeededGenerator = (seed: string) => {
  let state = hashSeed(seed);
  return (): number => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const randomInteger = (next: () => number, minimum: number, maximum: number): number =>
  minimum + Math.floor(next() * (maximum - minimum + 1));

const sampleUnique = <T>(values: readonly T[], count: number, next: () => number): T[] => {
  if (values.length < count) {
    throw new Error(`Cannot sample ${count} unique actors from ${values.length} candidates.`);
  }
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = randomInteger(next, 0, index);
    [shuffled[index], shuffled[target]] = [shuffled[target]!, shuffled[index]!];
  }
  return shuffled.slice(0, count);
};

const distinctActorsByUser = (
  values: readonly ExchangeSimulationActor[]
): ExchangeSimulationActor[] => {
  const seenUserIds = new Set<number>();
  return values.filter((actor) => {
    if (seenUserIds.has(actor.userId)) return false;
    seenUserIds.add(actor.userId);
    return true;
  });
};

const atMinutes = (base: Date, minutes: number): string =>
  new Date(base.getTime() + minutes * 60_000).toISOString();

const assertActorCapacity = (actors: readonly ExchangeSimulationActor[]): void => {
  if (actors.length < 67) {
    throw new Error("Exchange simulation requires at least 67 eligible real test actors.");
  }
  if (!actors.some((actor) => actor.identityType === "customer")) {
    throw new Error("Exchange simulation requires at least one customer demand publisher.");
  }
  if (!actors.some((actor) => actor.intelligenceService)) {
    throw new Error(
      "Exchange simulation requires at least one formal intelligence publisher service."
    );
  }
};

const interactionTime = (createdAt: Date, sequence: number, next: () => number): string =>
  atMinutes(createdAt, 5 + sequence * 3 + randomInteger(next, 0, 7));

export const buildExchangeSimulationPlan = (
  inputActors: readonly ExchangeSimulationActor[],
  seed = EXCHANGE_SIMULATION_DEFAULT_SEED,
  referenceTime = new Date()
): ExchangeSimulationPlan => {
  const actors = [...inputActors].sort(
    (left, right) => left.userId - right.userId || left.identityId - right.identityId
  );
  assertActorCapacity(actors);
  const customers = actors.filter((actor) => actor.identityType === "customer");
  const intelligencePublishers = actors.filter((actor) => actor.intelligenceService);
  const next = createSeededGenerator(seed);
  const referenceDay = Date.UTC(
    referenceTime.getUTCFullYear(),
    referenceTime.getUTCMonth(),
    referenceTime.getUTCDate()
  );
  const publishedBase = new Date(referenceDay - 24 * 60 * 60_000);
  const serviceBase = new Date(referenceDay + 25 * 60 * 60_000);
  const totalPosts =
    EXCHANGE_SIMULATION_COUNTS.demandPosts + EXCHANGE_SIMULATION_COUNTS.intelligencePosts;

  const posts = Array.from({ length: totalPosts }, (_, index): ExchangeSimulationPost => {
    const type: ExchangePostType =
      index < EXCHANGE_SIMULATION_COUNTS.demandPosts ? "demand" : "intelligence";
    const typeIndex = type === "demand" ? index : index - EXCHANGE_SIMULATION_COUNTS.demandPosts;
    const authorPool = type === "demand" ? customers : intelligencePublishers;
    const author = authorPool[typeIndex % authorPool.length]!;
    const locale = LOCALES[typeIndex % LOCALES.length]!;
    const content = LOCALIZED_CONTENT[locale];
    const sequence = typeIndex + 1;
    const key = `${type}:${String(sequence).padStart(2, "0")}`;
    const idempotencyKey = `${EXCHANGE_SIMULATION_NAMESPACE}post:${key}`;
    const createdAt = new Date(publishedBase.getTime() + index * 30 * 60_000);
    const serviceStartAt = new Date(
      serviceBase.getTime() + typeIndex * 20 * 60 * 60_000 + (index % 3) * 60 * 60_000
    );
    const serviceEndAt = new Date(serviceStartAt.getTime() + (60 + (index % 3) * 30) * 60_000);
    const expiresAt = new Date(serviceEndAt.getTime() + 6 * 60 * 60_000);
    const interactionActors = distinctActorsByUser(
      actors.filter((candidate) => candidate.userId !== author.userId)
    );
    const commentCount = randomInteger(
      next,
      EXCHANGE_SIMULATION_COUNTS.comments.minimum,
      EXCHANGE_SIMULATION_COUNTS.comments.maximum
    );
    const likeCount = randomInteger(
      next,
      EXCHANGE_SIMULATION_COUNTS.likes.minimum,
      EXCHANGE_SIMULATION_COUNTS.likes.maximum
    );
    const shareCount = randomInteger(
      next,
      EXCHANGE_SIMULATION_COUNTS.shares.minimum,
      EXCHANGE_SIMULATION_COUNTS.shares.maximum
    );
    const commentActors = sampleUnique(interactionActors, commentCount, next);
    const likeActors = sampleUnique(interactionActors, likeCount, next);
    const shareActors = sampleUnique(interactionActors, shareCount, next);
    const intelligenceService = author.intelligenceService;

    return {
      key,
      idempotencyKey,
      type,
      author,
      title: `${type === "demand" ? content.demandTitle : content.intelligenceTitle} ${sequence}`,
      detail: `${type === "demand" ? content.demandDetail : content.intelligenceDetail} (${sequence})`,
      contentLocale: locale,
      areaLabel: AREAS[typeIndex % AREAS.length]!,
      serviceStartAt: serviceStartAt.toISOString(),
      serviceEndAt: serviceEndAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      createdAt: createdAt.toISOString(),
      demand:
        type === "demand"
          ? {
              budgetMinJpy: 6_000 + (typeIndex % 5) * 1_000,
              budgetMaxJpy: 10_000 + (typeIndex % 5) * 1_500
            }
          : null,
      intelligence:
        type === "intelligence"
          ? {
              serviceRef: intelligenceService!.serviceRef,
              serviceId: intelligenceService!.serviceId,
              technicianServiceId: intelligenceService!.technicianServiceId,
              serviceName: intelligenceService!.serviceName,
              serviceDurationMinutes: intelligenceService!.serviceDurationMinutes,
              serviceMode: intelligenceService!.serviceMode,
              addressLabel: intelligenceService!.addressLabel,
              serviceAreas: intelligenceService!.serviceAreas,
              originalPriceJpy: intelligenceService!.catalogPriceJpy,
              campaignPriceJpy: Math.max(1, intelligenceService!.catalogPriceJpy - 2_000)
            }
          : null,
      comments: commentActors.map((commentActor, commentIndex) => ({
        key: `${key}:comment:${String(commentIndex + 1).padStart(2, "0")}`,
        idempotencyKey: `${EXCHANGE_SIMULATION_NAMESPACE}comment:${key}:${String(commentIndex + 1).padStart(2, "0")}`,
        actor: commentActor,
        content: `${content.comment} ${commentIndex + 1}`,
        createdAt: interactionTime(createdAt, commentIndex + 1, next)
      })),
      likes: likeActors.map((likeActor, likeIndex) => ({
        actor: likeActor,
        createdAt: interactionTime(createdAt, likeIndex + 1, next)
      })),
      shares: shareActors.map((shareActor, shareIndex) => ({
        key: `${key}:share:${String(shareIndex + 1).padStart(2, "0")}`,
        idempotencyKey: `${EXCHANGE_SIMULATION_NAMESPACE}share:${key}:actor:${shareActor.userId}`,
        actor: shareActor,
        createdAt: interactionTime(createdAt, shareIndex + 1, next)
      }))
    };
  });

  return { namespace: EXCHANGE_SIMULATION_NAMESPACE, seed, posts };
};
