import {
  BookingOrderStatus,
  OrderType,
  PrismaClient,
  ScheduleSlotStatus,
  ServiceOwnerType,
  ShopPricingMode,
  type Category,
  type Prisma
} from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { createHash } from "node:crypto";
import { hash } from "bcryptjs";

import {
  SYSTEM_PERMISSIONS,
  SYSTEM_ROLES,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";
import {
  TEST_USER_ACCOUNTS,
  type TestUserAccountDefinition
} from "../src/constants/test-login.constants";

const BCRYPT_ROUNDS = 12;
const DEFAULT_ADMIN_EMAIL = "admin@example.com";
const DEFAULT_ADMIN_USERNAME = "admin";
const SEED_PRISMA_LOG_LEVELS: Prisma.LogLevel[] = ["error"];
export const DEFAULT_REQUEST_DISPATCH_FEE_NDP = 500;
export const CUSTOMER_REQUEST_WALLET_SEED_NDP = DEFAULT_REQUEST_DISPATCH_FEE_NDP * 2;

export const getRequestDispatchWalletSeedAmount = (
  account: Pick<TestUserAccountDefinition, "identityType">
): number => (account.identityType === "customer" ? CUSTOMER_REQUEST_WALLET_SEED_NDP : 0);

const getSeedWalletTopUpAmount = (availableBalance: number, requiredAvailable: number): number =>
  Math.max(requiredAvailable - availableBalance, 0);

export const getRequestDispatchWalletTopUpAmount = (availableBalance: number): number =>
  getSeedWalletTopUpAmount(availableBalance, CUSTOMER_REQUEST_WALLET_SEED_NDP);

const getDatabaseUrl = (): string => {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl || databaseUrl.trim().length === 0) {
    throw new Error("DATABASE_URL is required before running the User Management seed.");
  }

  return databaseUrl;
};

export interface AdminSeedConfig {
  email: string;
  username: string;
  password: string;
}

export interface SeedUserInput {
  email: string;
  username: string;
  phone?: string;
}

interface SeedIdentityInput {
  userId: number;
  type: string;
  scopeType: string;
  scopeId: number | null;
  displayName: string;
  isDefault?: boolean;
}

interface SeedCoreReadOptions {
  seedRequiredTestAccounts: boolean;
  testUserPasswordHash: string | null;
}

type CoreReadDemoCategorySeed = {
  code: string;
  name: string;
  nameJa: string;
  nameEn: string;
  iconUrl: string;
  sortOrder: number;
};

type CoreReadDemoReviewSeed = {
  ratingAverage: string;
  reviewCount: number;
  highlights: string[];
};

type CoreReadDemoShopSeed = {
  slug: string;
  ownerEmail: string;
  ownerUsername: string;
  ownerPhone: string;
  name: string;
  description: string;
  city: string;
  address: string;
  latitude: string;
  longitude: string;
  phone: string;
  coverUrl: string;
  review: CoreReadDemoReviewSeed;
};

type CoreReadDemoTechnicianSeed = {
  slug: string;
  email: string;
  phone: string;
  displayName: string;
  shopSlug: string;
  categoryCode: string;
  bio: string;
  city: string;
  serviceArea: string;
  yearsExperience: number;
  avatarUrl: string;
  review: CoreReadDemoReviewSeed;
  service: {
    name: string;
    description: string;
    city: string;
    serviceMode: string;
    priceAmount: string;
    durationMinutes: number;
    coverUrl: string;
    review: CoreReadDemoReviewSeed;
  };
};

export const CORE_READ_DEMO_CATEGORY_SEEDS: CoreReadDemoCategorySeed[] = [
  {
    code: "wellness",
    name: "Wellness",
    nameJa: "ウェルネス",
    nameEn: "Wellness",
    iconUrl: "/images/generated/search-category-salon.jpg",
    sortOrder: 10
  },
  {
    code: "beauty",
    name: "Beauty",
    nameJa: "美容",
    nameEn: "Beauty",
    iconUrl: "/images/generated/search-category-beauty.jpg",
    sortOrder: 20
  },
  {
    code: "cleaning",
    name: "Cleaning",
    nameJa: "クリーニング",
    nameEn: "Cleaning",
    iconUrl: "/images/generated/services/service-home-cleaning.jpg",
    sortOrder: 30
  },
  {
    code: "dining",
    name: "Dining",
    nameJa: "飲食予約",
    nameEn: "Dining",
    iconUrl: "/images/generated/stores/store-izakaya-counter.jpg",
    sortOrder: 40
  },
  {
    code: "pet",
    name: "Pet Care",
    nameJa: "ペットケア",
    nameEn: "Pet Care",
    iconUrl: "/images/generated/services/service-pet-care.jpg",
    sortOrder: 50
  },
  {
    code: "repair",
    name: "Repair",
    nameJa: "修理",
    nameEn: "Repair",
    iconUrl: "/images/generated/services/service-plumbing-repair.jpg",
    sortOrder: 60
  },
  {
    code: "care",
    name: "Care",
    nameJa: "ケア",
    nameEn: "Care",
    iconUrl: "/images/generated/services/service-wellness-care.jpg",
    sortOrder: 70
  },
  {
    code: "business",
    name: "Business",
    nameJa: "法人向け",
    nameEn: "Business",
    iconUrl: "/images/generated/stores/store-cafe-consult.jpg",
    sortOrder: 80
  }
];

export const CORE_READ_DEMO_SHOP_SEEDS: CoreReadDemoShopSeed[] = [
  {
    slug: "aoyama-care",
    ownerEmail: "seed.shop-owner@needo.local",
    ownerUsername: "Aoyama Care Owner",
    ownerPhone: "+81300000001",
    name: "Aoyama Care Studio",
    description: "Private care studio for wellness and recovery services in Aoyama.",
    city: "Tokyo",
    address: "3-1 Kita Aoyama, Minato-ku",
    latitude: "35.6721000",
    longitude: "139.7239000",
    phone: "+81300000000",
    coverUrl: "/images/generated/home-merchant-feature.jpg",
    review: {
      ratingAverage: "4.80",
      reviewCount: 128,
      highlights: ["Tokyo", "clean", "kind", "private"]
    }
  },
  {
    slug: "roppongi-recovery",
    ownerEmail: "seed.shop-roppongi@needo.local",
    ownerUsername: "Roppongi Recovery Owner",
    ownerPhone: "+81300000011",
    name: "Roppongi Recovery Lounge",
    description: "Late-night recovery lounge with quiet rooms near Roppongi and Azabu.",
    city: "Tokyo",
    address: "6-8 Roppongi, Minato-ku",
    latitude: "35.6627000",
    longitude: "139.7312000",
    phone: "+81300000010",
    coverUrl: "/images/generated/stores/store-calm-body-room.jpg",
    review: {
      ratingAverage: "4.86",
      reviewCount: 214,
      highlights: ["Roppongi", "night", "recovery", "private"]
    }
  },
  {
    slug: "shibuya-nail",
    ownerEmail: "seed.shop-shibuya-nail@needo.local",
    ownerUsername: "Shibuya Nail Owner",
    ownerPhone: "+81300000021",
    name: "Shibuya Nail Atelier",
    description: "Design-led nail and lash atelier for commuters, visitors, and weekend bookings.",
    city: "Tokyo",
    address: "1-18 Jinnan, Shibuya-ku",
    latitude: "35.6620000",
    longitude: "139.6999000",
    phone: "+81300000020",
    coverUrl: "/images/generated/stores/store-nail-atelier.jpg",
    review: {
      ratingAverage: "4.74",
      reviewCount: 186,
      highlights: ["Shibuya", "nail", "lash", "same-day"]
    }
  },
  {
    slug: "meguro-clean",
    ownerEmail: "seed.shop-meguro-clean@needo.local",
    ownerUsername: "Meguro Clean Owner",
    ownerPhone: "+81300000031",
    name: "Meguro Home Clean Base",
    description: "Home and small-office cleaning team with photo reports and repeat plans.",
    city: "Tokyo",
    address: "2-14 Shimomeguro, Meguro-ku",
    latitude: "35.6313000",
    longitude: "139.7136000",
    phone: "+81300000030",
    coverUrl: "/images/generated/stores/store-clean-base.jpg",
    review: {
      ratingAverage: "4.69",
      reviewCount: 172,
      highlights: ["Meguro", "cleaning", "photo-report", "repeat"]
    }
  },
  {
    slug: "ebisu-dining",
    ownerEmail: "seed.shop-ebisu-dining@needo.local",
    ownerUsername: "Ebisu Dining Owner",
    ownerPhone: "+81300000041",
    name: "Ebisu Private Dining",
    description: "Private dining reservation support for small groups and business visitors.",
    city: "Tokyo",
    address: "2-7 Ebisu Minami, Shibuya-ku",
    latitude: "35.6466000",
    longitude: "139.7101000",
    phone: "+81300000040",
    coverUrl: "/images/generated/stores/store-izakaya-counter.jpg",
    review: {
      ratingAverage: "4.61",
      reviewCount: 305,
      highlights: ["Ebisu", "dining", "private-room", "menu"]
    }
  },
  {
    slug: "daikanyama-skin",
    ownerEmail: "seed.shop-daikanyama-skin@needo.local",
    ownerUsername: "Daikanyama Skin Owner",
    ownerPhone: "+81300000051",
    name: "Daikanyama Skin & Lash",
    description: "Skin care and lash studio for pre-event beauty, hydration, and natural styling.",
    city: "Tokyo",
    address: "18-6 Daikanyamacho, Shibuya-ku",
    latitude: "35.6497000",
    longitude: "139.7021000",
    phone: "+81300000050",
    coverUrl: "/images/generated/stores/store-beauty-reception.jpg",
    review: {
      ratingAverage: "4.83",
      reviewCount: 154,
      highlights: ["Daikanyama", "facial", "lash", "quiet"]
    }
  },
  {
    slug: "toyosu-pet",
    ownerEmail: "seed.shop-toyosu-pet@needo.local",
    ownerUsername: "Toyosu Pet Owner",
    ownerPhone: "+81300000061",
    name: "Toyosu Pet Care House",
    description: "Pet visit, walking, wash, and short-stay support with owner photo reports.",
    city: "Tokyo",
    address: "3-2 Toyosu, Koto-ku",
    latitude: "35.6549000",
    longitude: "139.7969000",
    phone: "+81300000060",
    coverUrl: "/images/generated/stores/store-pet-grooming.jpg",
    review: {
      ratingAverage: "4.78",
      reviewCount: 142,
      highlights: ["Toyosu", "pet", "photo", "friendly"]
    }
  },
  {
    slug: "shinagawa-repair",
    ownerEmail: "seed.shop-shinagawa-repair@needo.local",
    ownerUsername: "Shinagawa Repair Owner",
    ownerPhone: "+81300000071",
    name: "Shinagawa Repair Works",
    description: "Home repair and appliance cleaning dispatch base for Shinagawa and Minato.",
    city: "Tokyo",
    address: "4-5 Konan, Minato-ku",
    latitude: "35.6285000",
    longitude: "139.7419000",
    phone: "+81300000070",
    coverUrl: "/images/generated/stores/store-repair-moving-office.jpg",
    review: {
      ratingAverage: "4.67",
      reviewCount: 196,
      highlights: ["Shinagawa", "repair", "AC", "same-day"]
    }
  },
  {
    slug: "kichijoji-care",
    ownerEmail: "seed.shop-kichijoji-care@needo.local",
    ownerUsername: "Kichijoji Care Owner",
    ownerPhone: "+81300000081",
    name: "Kichijoji Family Care",
    description: "Family care, errand support, and wellness visits for western Tokyo households.",
    city: "Tokyo",
    address: "1-9 Kichijoji Honcho, Musashino-shi",
    latitude: "35.7041000",
    longitude: "139.5797000",
    phone: "+81300000080",
    coverUrl: "/images/generated/services/service-wellness-care.jpg",
    review: {
      ratingAverage: "4.72",
      reviewCount: 118,
      highlights: ["Kichijoji", "family-care", "errand", "kind"]
    }
  },
  {
    slug: "marunouchi-business",
    ownerEmail: "seed.shop-marunouchi-business@needo.local",
    ownerUsername: "Marunouchi Business Owner",
    ownerPhone: "+81300000091",
    name: "Marunouchi Business Wellness",
    description: "Corporate wellness and office visit services for teams around Tokyo Station.",
    city: "Tokyo",
    address: "2-4 Marunouchi, Chiyoda-ku",
    latitude: "35.6811000",
    longitude: "139.7659000",
    phone: "+81300000090",
    coverUrl: "/images/generated/stores/store-cafe-consult.jpg",
    review: {
      ratingAverage: "4.76",
      reviewCount: 166,
      highlights: ["Marunouchi", "business", "team", "invoice"]
    }
  }
];

export const CORE_READ_DEMO_TECHNICIAN_SEEDS: CoreReadDemoTechnicianSeed[] = [
  {
    slug: "mika-tanaka",
    email: "seed.technician@needo.local",
    phone: "+81300000002",
    displayName: "Mika Tanaka",
    shopSlug: "aoyama-care",
    categoryCode: "wellness",
    bio: "Certified body care technician focused on recovery and relaxation.",
    city: "Tokyo",
    serviceArea: "港区, 麻布十番, 六本木, 渋谷",
    yearsExperience: 8,
    avatarUrl: "/images/generated/profile-technician-mika.jpg",
    review: {
      ratingAverage: "4.90",
      reviewCount: 96,
      highlights: ["skilled", "gentle", "private"]
    },
    service: {
      name: "Shiatsu Recovery",
      description: "60 minute recovery session for shoulders, back, and legs.",
      city: "Tokyo",
      serviceMode: "store",
      priceAmount: "8800.00",
      durationMinutes: 60,
      coverUrl: "/images/generated/service-shiatsu-recovery.jpg",
      review: {
        ratingAverage: "4.80",
        reviewCount: 72,
        highlights: ["recovery", "relaxing"]
      }
    }
  },
  {
    slug: "haruka-sato",
    email: "seed.tech-haruka@needo.local",
    phone: "+81300000102",
    displayName: "Haruka Sato",
    shopSlug: "aoyama-care",
    categoryCode: "wellness",
    bio: "Aoyama therapist for shoulder, sleep, and quiet room recovery bookings.",
    city: "Tokyo",
    serviceArea: "青山, 港区, 表参道, 渋谷",
    yearsExperience: 6,
    avatarUrl: "/images/generated/profiles/ai-profile-02.jpg",
    review: {
      ratingAverage: "4.88",
      reviewCount: 88,
      highlights: ["shoulder", "sleep", "bilingual"]
    },
    service: {
      name: "Aoyama Deep Shoulder Care",
      description: "Focused shoulder and neck care with heat and breathing guidance.",
      city: "Tokyo",
      serviceMode: "store",
      priceAmount: "10800.00",
      durationMinutes: 75,
      coverUrl: "/images/generated/services/service-massage-setup.jpg",
      review: {
        ratingAverage: "4.82",
        reviewCount: 69,
        highlights: ["shoulder", "quiet"]
      }
    }
  },
  {
    slug: "ren-kobayashi",
    email: "seed.tech-ren@needo.local",
    phone: "+81300000103",
    displayName: "Ren Kobayashi",
    shopSlug: "roppongi-recovery",
    categoryCode: "wellness",
    bio: "Sports recovery technician for travelers, runners, and desk-work fatigue.",
    city: "Tokyo",
    serviceArea: "六本木, 赤坂, 麻布十番, 港区",
    yearsExperience: 7,
    avatarUrl: "/images/generated/profiles/ai-profile-03.jpg",
    review: {
      ratingAverage: "4.84",
      reviewCount: 104,
      highlights: ["sports", "English", "late-night"]
    },
    service: {
      name: "Roppongi Sports Recovery 90",
      description: "Ninety-minute sports recovery session for back, legs, and mobility.",
      city: "Tokyo",
      serviceMode: "store",
      priceAmount: "14800.00",
      durationMinutes: 90,
      coverUrl: "/images/generated/services/service-wellness-care.jpg",
      review: {
        ratingAverage: "4.79",
        reviewCount: 82,
        highlights: ["mobility", "runner"]
      }
    }
  },
  {
    slug: "yui-mori",
    email: "seed.tech-yui@needo.local",
    phone: "+81300000104",
    displayName: "Yui Mori",
    shopSlug: "roppongi-recovery",
    categoryCode: "wellness",
    bio: "Aroma and sleep-care specialist for hotel guests and evening appointments.",
    city: "Tokyo",
    serviceArea: "六本木, 麻布十番, 虎ノ門, 港区",
    yearsExperience: 5,
    avatarUrl: "/images/generated/profiles/ai-profile-04.jpg",
    review: {
      ratingAverage: "4.87",
      reviewCount: 91,
      highlights: ["aroma", "sleep", "hotel"]
    },
    service: {
      name: "Sleep Aroma Care",
      description: "Gentle aroma care for sleep preparation and shoulder release.",
      city: "Tokyo",
      serviceMode: "store",
      priceAmount: "12800.00",
      durationMinutes: 75,
      coverUrl: "/images/generated/stores/store-calm-body-room.jpg",
      review: {
        ratingAverage: "4.81",
        reviewCount: 63,
        highlights: ["aroma", "sleep"]
      }
    }
  },
  {
    slug: "kana-li",
    email: "seed.tech-kana@needo.local",
    phone: "+81300000105",
    displayName: "Kana Li",
    shopSlug: "shibuya-nail",
    categoryCode: "beauty",
    bio: "Nail designer with Japanese and Chinese support for same-day design booking.",
    city: "Tokyo",
    serviceArea: "渋谷, 原宿, 表参道",
    yearsExperience: 4,
    avatarUrl: "/images/generated/profiles/ai-profile-05.jpg",
    review: {
      ratingAverage: "4.78",
      reviewCount: 76,
      highlights: ["nail", "Chinese", "same-day"]
    },
    service: {
      name: "Gel Nail Design",
      description: "Gel nail care with color consultation and finish photo return.",
      city: "Tokyo",
      serviceMode: "store",
      priceAmount: "7600.00",
      durationMinutes: 90,
      coverUrl: "/images/generated/services/service-beauty-workstation.jpg",
      review: {
        ratingAverage: "4.73",
        reviewCount: 58,
        highlights: ["gel", "design"]
      }
    }
  },
  {
    slug: "sofia-kim",
    email: "seed.tech-sofia@needo.local",
    phone: "+81300000106",
    displayName: "Sofia Kim",
    shopSlug: "shibuya-nail",
    categoryCode: "beauty",
    bio: "Lash artist supporting Korean, Japanese, and English consultation.",
    city: "Tokyo",
    serviceArea: "渋谷, 新大久保, 原宿",
    yearsExperience: 5,
    avatarUrl: "/images/generated/profiles/ai-profile-06.jpg",
    review: {
      ratingAverage: "4.80",
      reviewCount: 81,
      highlights: ["lash", "Korean", "natural"]
    },
    service: {
      name: "Natural Lash Care",
      description: "Natural lash styling with eye-shape consultation and after-care card.",
      city: "Tokyo",
      serviceMode: "store",
      priceAmount: "9800.00",
      durationMinutes: 100,
      coverUrl: "/images/generated/stores/store-nail-atelier.jpg",
      review: {
        ratingAverage: "4.76",
        reviewCount: 61,
        highlights: ["lash", "natural"]
      }
    }
  },
  {
    slug: "shota-yamamoto",
    email: "seed.tech-shota@needo.local",
    phone: "+81300000107",
    displayName: "Shota Yamamoto",
    shopSlug: "meguro-clean",
    categoryCode: "cleaning",
    bio: "Move-out and regular cleaning lead with before-after photo reporting.",
    city: "Tokyo",
    serviceArea: "目黒, 品川, 港区",
    yearsExperience: 9,
    avatarUrl: "/images/generated/profiles/ai-profile-07.jpg",
    review: {
      ratingAverage: "4.77",
      reviewCount: 132,
      highlights: ["clean", "photo", "move-out"]
    },
    service: {
      name: "Move-out Deep Cleaning",
      description: "Move-out deep cleaning for kitchen, bath, flooring, and final photo report.",
      city: "Tokyo",
      serviceMode: "home",
      priceAmount: "16800.00",
      durationMinutes: 180,
      coverUrl: "/images/generated/services/service-home-cleaning.jpg",
      review: {
        ratingAverage: "4.74",
        reviewCount: 98,
        highlights: ["deep-clean", "photo"]
      }
    }
  },
  {
    slug: "an-chen",
    email: "seed.tech-an@needo.local",
    phone: "+81300000108",
    displayName: "An Chen",
    shopSlug: "meguro-clean",
    categoryCode: "cleaning",
    bio: "Kitchen and bath reset specialist for family homes and pet households.",
    city: "Tokyo",
    serviceArea: "目黒, 五反田, 大崎, 品川",
    yearsExperience: 6,
    avatarUrl: "/images/generated/profiles/ai-profile-08.jpg",
    review: {
      ratingAverage: "4.75",
      reviewCount: 109,
      highlights: ["kitchen", "bath", "pet-home"]
    },
    service: {
      name: "Kitchen Bath Reset",
      description: "Focused cleaning for oil stains, bath scale, mirrors, and sink areas.",
      city: "Tokyo",
      serviceMode: "home",
      priceAmount: "11800.00",
      durationMinutes: 150,
      coverUrl: "/images/generated/services/service-kitchen-deep-clean.jpg",
      review: {
        ratingAverage: "4.72",
        reviewCount: 84,
        highlights: ["kitchen", "bath"]
      }
    }
  },
  {
    slug: "takeru-ito",
    email: "seed.tech-takeru@needo.local",
    phone: "+81300000109",
    displayName: "Takeru Ito",
    shopSlug: "ebisu-dining",
    categoryCode: "dining",
    bio: "Dining concierge for private room setup, menu guidance, and guest flow.",
    city: "Tokyo",
    serviceArea: "恵比寿, 代官山, 中目黒",
    yearsExperience: 8,
    avatarUrl: "/images/generated/profiles/ai-profile-09.jpg",
    review: {
      ratingAverage: "4.66",
      reviewCount: 146,
      highlights: ["dining", "private-room", "menu"]
    },
    service: {
      name: "Private Table Concierge",
      description: "Private table reservation support with menu explanation and guest setup.",
      city: "Tokyo",
      serviceMode: "store",
      priceAmount: "5200.00",
      durationMinutes: 60,
      coverUrl: "/images/generated/stores/store-izakaya-counter.jpg",
      review: {
        ratingAverage: "4.62",
        reviewCount: 113,
        highlights: ["private-room", "menu"]
      }
    }
  },
  {
    slug: "mina-park",
    email: "seed.tech-mina@needo.local",
    phone: "+81300000110",
    displayName: "Mina Park",
    shopSlug: "ebisu-dining",
    categoryCode: "dining",
    bio: "Multilingual dining support for visitors who need reservation and menu help.",
    city: "Tokyo",
    serviceArea: "恵比寿, 渋谷, 白金台",
    yearsExperience: 4,
    avatarUrl: "/images/generated/profiles/ai-profile-10.jpg",
    review: {
      ratingAverage: "4.68",
      reviewCount: 97,
      highlights: ["English", "Korean", "visitor"]
    },
    service: {
      name: "Multilingual Dining Support",
      description: "Visitor-friendly reservation and menu interpretation support.",
      city: "Tokyo",
      serviceMode: "store",
      priceAmount: "6800.00",
      durationMinutes: 75,
      coverUrl: "/images/generated/services/service-tutor-cafe.jpg",
      review: {
        ratingAverage: "4.65",
        reviewCount: 73,
        highlights: ["multilingual", "visitor"]
      }
    }
  },
  {
    slug: "rika-arai",
    email: "seed.tech-rika@needo.local",
    phone: "+81300000111",
    displayName: "Rika Arai",
    shopSlug: "daikanyama-skin",
    categoryCode: "beauty",
    bio: "Facial care specialist for hydration, calming, and sensitive skin seasons.",
    city: "Tokyo",
    serviceArea: "代官山, 恵比寿, 広尾",
    yearsExperience: 7,
    avatarUrl: "/images/generated/profiles/ai-profile-11.jpg",
    review: {
      ratingAverage: "4.89",
      reviewCount: 92,
      highlights: ["facial", "hydration", "sensitive"]
    },
    service: {
      name: "Hydration Facial Care",
      description: "Moisture-focused facial care for dry skin seasons.",
      city: "Tokyo",
      serviceMode: "store",
      priceAmount: "12800.00",
      durationMinutes: 75,
      coverUrl: "/images/generated/service-facial-care.jpg",
      review: {
        ratingAverage: "4.70",
        reviewCount: 41,
        highlights: ["hydrating", "calm"]
      }
    }
  },
  {
    slug: "mei-wang",
    email: "seed.tech-mei@needo.local",
    phone: "+81300000112",
    displayName: "Mei Wang",
    shopSlug: "daikanyama-skin",
    categoryCode: "beauty",
    bio: "Bridal and event-prep care with Chinese and Japanese consultation.",
    city: "Tokyo",
    serviceArea: "代官山, 表参道, 銀座",
    yearsExperience: 6,
    avatarUrl: "/images/generated/profiles/ai-profile-12.jpg",
    review: {
      ratingAverage: "4.85",
      reviewCount: 87,
      highlights: ["bridal", "Chinese", "event"]
    },
    service: {
      name: "Bridal Skin Prep",
      description: "Event-ready skin prep with hydration, calming, and finish check.",
      city: "Tokyo",
      serviceMode: "store",
      priceAmount: "15800.00",
      durationMinutes: 90,
      coverUrl: "/images/generated/stores/store-beauty-reception.jpg",
      review: {
        ratingAverage: "4.78",
        reviewCount: 66,
        highlights: ["bridal", "event"]
      }
    }
  },
  {
    slug: "nao-fujita",
    email: "seed.tech-nao@needo.local",
    phone: "+81300000113",
    displayName: "Nao Fujita",
    shopSlug: "toyosu-pet",
    categoryCode: "pet",
    bio: "Cat visit specialist with entry checklist, feeding log, and photo reports.",
    city: "Tokyo",
    serviceArea: "豊洲, 月島, 勝どき",
    yearsExperience: 5,
    avatarUrl: "/images/generated/profiles/ai-profile-13.jpg",
    review: {
      ratingAverage: "4.82",
      reviewCount: 74,
      highlights: ["cat", "photo", "visit"]
    },
    service: {
      name: "Cat Visit Care",
      description: "Feeding, water, litter, and photo report for cat households.",
      city: "Tokyo",
      serviceMode: "home",
      priceAmount: "5200.00",
      durationMinutes: 45,
      coverUrl: "/images/generated/services/service-pet-care.jpg",
      review: {
        ratingAverage: "4.77",
        reviewCount: 52,
        highlights: ["cat", "photo"]
      }
    }
  },
  {
    slug: "leo-chen",
    email: "seed.tech-leo@needo.local",
    phone: "+81300000114",
    displayName: "Leo Chen",
    shopSlug: "toyosu-pet",
    categoryCode: "pet",
    bio: "Dog walk and wash support with bilingual owner communication.",
    city: "Tokyo",
    serviceArea: "豊洲, お台場, 有明",
    yearsExperience: 4,
    avatarUrl: "/images/generated/profiles/ai-profile-14.jpg",
    review: {
      ratingAverage: "4.79",
      reviewCount: 69,
      highlights: ["dog", "walk", "wash"]
    },
    service: {
      name: "Dog Walk & Wash",
      description: "Dog walking and simple wash support with route and photo summary.",
      city: "Tokyo",
      serviceMode: "home",
      priceAmount: "7600.00",
      durationMinutes: 75,
      coverUrl: "/images/generated/stores/store-pet-grooming.jpg",
      review: {
        ratingAverage: "4.75",
        reviewCount: 49,
        highlights: ["dog", "walk"]
      }
    }
  },
  {
    slug: "daichi-suzuki",
    email: "seed.tech-daichi@needo.local",
    phone: "+81300000115",
    displayName: "Daichi Suzuki",
    shopSlug: "shinagawa-repair",
    categoryCode: "repair",
    bio: "Appliance cleaning lead for AC diagnosis, protection, and before-after checks.",
    city: "Tokyo",
    serviceArea: "品川, 港区, 大崎",
    yearsExperience: 10,
    avatarUrl: "/images/generated/profiles/ai-profile-15.jpg",
    review: {
      ratingAverage: "4.73",
      reviewCount: 154,
      highlights: ["AC", "diagnosis", "photo"]
    },
    service: {
      name: "AC Cleaning Diagnostics",
      description: "Wall-mounted AC cleaning with pre-check, protection, and test run.",
      city: "Tokyo",
      serviceMode: "home",
      priceAmount: "13800.00",
      durationMinutes: 120,
      coverUrl: "/images/generated/services/service-ac-cleaning.jpg",
      review: {
        ratingAverage: "4.71",
        reviewCount: 116,
        highlights: ["AC", "test-run"]
      }
    }
  },
  {
    slug: "saki-watanabe",
    email: "seed.tech-saki@needo.local",
    phone: "+81300000116",
    displayName: "Saki Watanabe",
    shopSlug: "shinagawa-repair",
    categoryCode: "repair",
    bio: "Quick repair coordinator for plumbing, small fixtures, and same-day triage.",
    city: "Tokyo",
    serviceArea: "品川, 田町, 泉岳寺",
    yearsExperience: 6,
    avatarUrl: "/images/generated/profiles/ai-profile-16.jpg",
    review: {
      ratingAverage: "4.70",
      reviewCount: 103,
      highlights: ["plumbing", "quick", "same-day"]
    },
    service: {
      name: "Plumbing Quick Fix",
      description: "Sink, hose, and fixture triage with transparent same-day quotation.",
      city: "Tokyo",
      serviceMode: "home",
      priceAmount: "9800.00",
      durationMinutes: 90,
      coverUrl: "/images/generated/services/service-plumbing-repair.jpg",
      review: {
        ratingAverage: "4.68",
        reviewCount: 79,
        highlights: ["plumbing", "quote"]
      }
    }
  },
  {
    slug: "aiko-nakamura",
    email: "seed.tech-aiko@needo.local",
    phone: "+81300000117",
    displayName: "Aiko Nakamura",
    shopSlug: "kichijoji-care",
    categoryCode: "care",
    bio: "Family care supporter for senior day visits, reminders, and household notes.",
    city: "Tokyo",
    serviceArea: "吉祥寺, 三鷹, 荻窪",
    yearsExperience: 9,
    avatarUrl: "/images/generated/profiles/ai-profile-17.jpg",
    review: {
      ratingAverage: "4.83",
      reviewCount: 111,
      highlights: ["senior", "family", "kind"]
    },
    service: {
      name: "Senior Day Support",
      description: "Day visit support for errands, medicine reminders, and family notes.",
      city: "Tokyo",
      serviceMode: "home",
      priceAmount: "9200.00",
      durationMinutes: 120,
      coverUrl: "/images/generated/services/service-wellness-care.jpg",
      review: {
        ratingAverage: "4.80",
        reviewCount: 83,
        highlights: ["senior", "day-support"]
      }
    }
  },
  {
    slug: "jun-wei",
    email: "seed.tech-jun@needo.local",
    phone: "+81300000118",
    displayName: "Jun Wei",
    shopSlug: "kichijoji-care",
    categoryCode: "care",
    bio: "Errand and home organization supporter with Chinese and Japanese communication.",
    city: "Tokyo",
    serviceArea: "吉祥寺, 中野, 杉並",
    yearsExperience: 5,
    avatarUrl: "/images/generated/profiles/ai-profile-18.jpg",
    review: {
      ratingAverage: "4.76",
      reviewCount: 72,
      highlights: ["errand", "Chinese", "organize"]
    },
    service: {
      name: "Family Errand Support",
      description: "Shopping, pickup, light organization, and report-back support.",
      city: "Tokyo",
      serviceMode: "home",
      priceAmount: "6800.00",
      durationMinutes: 90,
      coverUrl: "/images/generated/services/service-home-organization.jpg",
      review: {
        ratingAverage: "4.73",
        reviewCount: 57,
        highlights: ["errand", "organize"]
      }
    }
  },
  {
    slug: "emily-brown",
    email: "seed.tech-emily@needo.local",
    phone: "+81300000119",
    displayName: "Emily Brown",
    shopSlug: "marunouchi-business",
    categoryCode: "business",
    bio: "English-speaking corporate wellness coordinator for office visit bookings.",
    city: "Tokyo",
    serviceArea: "丸の内, 東京駅, 大手町",
    yearsExperience: 7,
    avatarUrl: "/images/generated/profiles/ai-profile-19.jpg",
    review: {
      ratingAverage: "4.81",
      reviewCount: 86,
      highlights: ["English", "corporate", "wellness"]
    },
    service: {
      name: "Office Wellness Visit",
      description: "Team wellness visit with time-slot coordination and invoice support.",
      city: "Tokyo",
      serviceMode: "store",
      priceAmount: "19800.00",
      durationMinutes: 120,
      coverUrl: "/images/generated/stores/store-cafe-consult.jpg",
      review: {
        ratingAverage: "4.77",
        reviewCount: 64,
        highlights: ["corporate", "invoice"]
      }
    }
  },
  {
    slug: "kenta-mori",
    email: "seed.tech-kenta@needo.local",
    phone: "+81300000120",
    displayName: "Kenta Mori",
    shopSlug: "marunouchi-business",
    categoryCode: "business",
    bio: "Office cleaning and facility support technician for business teams.",
    city: "Tokyo",
    serviceArea: "丸の内, 日本橋, 銀座",
    yearsExperience: 8,
    avatarUrl: "/images/generated/profiles/ai-profile-20.jpg",
    review: {
      ratingAverage: "4.74",
      reviewCount: 93,
      highlights: ["office", "facility", "monthly"]
    },
    service: {
      name: "Corporate Cleaning Check",
      description: "Office cleaning check, consumable review, and monthly maintenance report.",
      city: "Tokyo",
      serviceMode: "home",
      priceAmount: "16800.00",
      durationMinutes: 150,
      coverUrl: "/images/generated/stores/store-clean-base.jpg",
      review: {
        ratingAverage: "4.72",
        reviewCount: 71,
        highlights: ["office", "monthly"]
      }
    }
  }
];

const isLocalLikeEnv = (env: NodeJS.ProcessEnv): boolean =>
  env.NODE_ENV === "development" || env.NODE_ENV === "test" || env.DEPLOY_ENV === "local";

export const getTestUserSeedPassword = (env: NodeJS.ProcessEnv = process.env): string => {
  const testUserPassword = env.TEST_USER_DEFAULT_PASSWORD?.trim();
  if (testUserPassword) {
    return testUserPassword;
  }

  const adminPassword = env.ADMIN_DEFAULT_PASSWORD?.trim();
  if (adminPassword && isLocalLikeEnv(env)) {
    return adminPassword;
  }

  if (!adminPassword) {
    throw new Error(
      "TEST_USER_DEFAULT_PASSWORD or ADMIN_DEFAULT_PASSWORD is required before running the User Management seed."
    );
  }

  throw new Error("TEST_USER_DEFAULT_PASSWORD is required for non-local test account seeds.");
};

export const getAdminSeedConfig = (env: NodeJS.ProcessEnv = process.env): AdminSeedConfig => {
  const adminEmail = env.ADMIN_DEFAULT_EMAIL?.trim() || DEFAULT_ADMIN_EMAIL;
  const password =
    shouldSeedRequiredTestAccounts(env) && adminEmail === DEFAULT_ADMIN_EMAIL
      ? getTestUserSeedPassword(env)
      : env.ADMIN_DEFAULT_PASSWORD?.trim();

  if (!password) {
    throw new Error("ADMIN_DEFAULT_PASSWORD is required before running the User Management seed.");
  }

  return {
    email: adminEmail,
    username: env.ADMIN_DEFAULT_USERNAME?.trim() || DEFAULT_ADMIN_USERNAME,
    password
  };
};

export const shouldSeedRequiredTestAccounts = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env.DEPLOY_ENV !== "prod";

const createSeedPrismaClient = (): PrismaClient =>
  new PrismaClient({
    adapter: new PrismaMariaDb(getDatabaseUrl()),
    log: SEED_PRISMA_LOG_LEVELS
  });

export const buildSeedUserUpdateData = (input: SeedUserInput, passwordHash: string) => ({
  phone: input.phone ?? null,
  passwordHash,
  username: input.username,
  isActive: true,
  deletedAt: null
});

const upsertSeedUser = (tx: Prisma.TransactionClient, input: SeedUserInput, passwordHash: string) =>
  tx.user.upsert({
    where: { email: input.email },
    create: {
      email: input.email,
      phone: input.phone ?? null,
      passwordHash,
      username: input.username,
      isActive: true
    },
    update: buildSeedUserUpdateData(input, passwordHash)
  });

const upsertSeedIdentity = async (
  tx: Prisma.TransactionClient,
  input: SeedIdentityInput
): Promise<void> => {
  const existing = await tx.userIdentity.findFirst({
    where: {
      userId: input.userId,
      type: input.type,
      scopeType: input.scopeType,
      scopeId: input.scopeId
    }
  });

  if (existing) {
    await tx.userIdentity.update({
      where: { id: existing.id },
      data: {
        displayName: input.displayName,
        isDefault: input.isDefault ?? true,
        isActive: true,
        deletedAt: null
      }
    });
    return;
  }

  await tx.userIdentity.create({
    data: {
      userId: input.userId,
      type: input.type,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
      displayName: input.displayName,
      isDefault: input.isDefault ?? true,
      isActive: true
    }
  });
};

const assignSeedRole = async (
  tx: Prisma.TransactionClient,
  input: { userId: number; roleId: number; scopeType: string; scopeId: number | null }
): Promise<void> => {
  const existing = await tx.userRole.findFirst({
    where: {
      userId: input.userId,
      roleId: input.roleId,
      scopeType: input.scopeType,
      scopeId: input.scopeId
    }
  });

  if (existing) {
    await tx.userRole.update({
      where: { id: existing.id },
      data: { deletedAt: null }
    });
    return;
  }

  await tx.userRole.create({
    data: {
      userId: input.userId,
      roleId: input.roleId,
      scopeType: input.scopeType,
      scopeId: input.scopeId
    }
  });
};

const getRequiredRole = (roleByCode: Map<string, { id: number }>, code: string): { id: number } => {
  const role = roleByCode.get(code);

  if (!role) {
    throw new Error(`Test login seed failed: missing role ${code}.`);
  }

  return role;
};

const upsertTestAccountProfile = async (
  tx: Prisma.TransactionClient,
  input: {
    account: TestUserAccountDefinition;
    userId: number;
    username: string;
    shopId: number;
  }
): Promise<{ scopeType: string; scopeId: number | null; displayName: string }> => {
  if (input.account.identityType === "merchant") {
    await tx.shop.update({
      where: { id: input.shopId },
      data: { ownerUserId: input.userId }
    });

    return {
      scopeType: "shop",
      scopeId: input.shopId,
      displayName: input.username
    };
  }

  if (input.account.identityType === "technician") {
    const technician = await tx.technicianProfile.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        shopId: input.shopId,
        displayName: input.username,
        bio: "Dedicated test technician identity for real login smoke checks.",
        city: "Tokyo",
        serviceArea: "Tokyo",
        yearsExperience: 1,
        status: "published",
        isRecommended: false
      },
      update: {
        shopId: input.shopId,
        displayName: input.username,
        bio: "Dedicated test technician identity for real login smoke checks.",
        city: "Tokyo",
        serviceArea: "Tokyo",
        yearsExperience: 1,
        status: "published",
        isRecommended: false,
        deletedAt: null
      }
    });

    return {
      scopeType: "technician_profile",
      scopeId: technician.id,
      displayName: technician.displayName
    };
  }

  if (input.account.identityType === "customer") {
    const customer = await tx.customerProfile.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        displayName: input.username,
        bio: "Dedicated test customer identity for real login smoke checks.",
        city: "Tokyo",
        membershipLevel: "standard",
        isPublic: false
      },
      update: {
        displayName: input.username,
        bio: "Dedicated test customer identity for real login smoke checks.",
        city: "Tokyo",
        membershipLevel: "standard",
        isPublic: false,
        deletedAt: null
      }
    });

    return {
      scopeType: "customer_profile",
      scopeId: customer.id,
      displayName: customer.displayName
    };
  }

  return {
    scopeType: "global",
    scopeId: null,
    displayName: input.username
  };
};

const seedRequiredTestAccounts = async (
  tx: Prisma.TransactionClient,
  input: {
    passwordHash: string;
    roleByCode: Map<string, { id: number }>;
    shopId: number;
  }
): Promise<void> => {
  for (const account of TEST_USER_ACCOUNTS) {
    const user = await upsertSeedUser(
      tx,
      {
        email: account.email,
        username: account.username
      },
      input.passwordHash
    );
    const identity = await upsertTestAccountProfile(tx, {
      account,
      userId: user.id,
      username: account.username,
      shopId: input.shopId
    });

    await upsertSeedIdentity(tx, {
      userId: user.id,
      type: account.identityType,
      scopeType: identity.scopeType,
      scopeId: identity.scopeId,
      displayName: identity.displayName,
      isDefault: true
    });
    await assignSeedRole(tx, {
      userId: user.id,
      roleId: getRequiredRole(input.roleByCode, account.roleCode).id,
      scopeType: identity.scopeType,
      scopeId: identity.scopeId
    });

    const requestDispatchSeedAmount = getRequestDispatchWalletSeedAmount(account);

    if (requestDispatchSeedAmount > 0) {
      await upsertSeedWalletFunding(tx, {
        ownerType: "USER",
        ownerId: user.id,
        actorUserId: user.id,
        amount: requestDispatchSeedAmount,
        idempotencyKey: `seed:wallet:user:${user.id}:request-dispatch-ndp`
      });
    }
  }
};

const seedCoreReadData = async (
  tx: Prisma.TransactionClient,
  passwordHash: string,
  roleByCode: Map<string, { id: number }>,
  options: SeedCoreReadOptions
): Promise<void> => {
  const demoCategories: Category[] = [];

  for (const categorySeed of CORE_READ_DEMO_CATEGORY_SEEDS) {
    demoCategories.push(
      await tx.category.upsert({
        where: { code: categorySeed.code },
        create: {
          code: categorySeed.code,
          name: categorySeed.name,
          nameJa: categorySeed.nameJa,
          nameEn: categorySeed.nameEn,
          iconUrl: categorySeed.iconUrl,
          sortOrder: categorySeed.sortOrder,
          isActive: true
        },
        update: {
          name: categorySeed.name,
          nameJa: categorySeed.nameJa,
          nameEn: categorySeed.nameEn,
          iconUrl: categorySeed.iconUrl,
          sortOrder: categorySeed.sortOrder,
          isActive: true,
          deletedAt: null
        }
      })
    );
  }

  const categoryByCode = new Map(demoCategories.map((category) => [category.code, category]));
  const getDemoCategory = (code: string): Category => {
    const category = categoryByCode.get(code);

    if (!category) {
      throw new Error(`Core read demo seed failed: missing category ${code}.`);
    }

    return category;
  };
  const wellnessCategory = getDemoCategory("wellness");
  const beautyCategory = getDemoCategory("beauty");
  const primaryShopSeed = CORE_READ_DEMO_SHOP_SEEDS[0];
  const primaryTechnicianSeed = CORE_READ_DEMO_TECHNICIAN_SEEDS[0];

  if (!primaryShopSeed || !primaryTechnicianSeed) {
    throw new Error("Core read demo seed requires at least one shop and one technician seed.");
  }

  const shopOwner = await upsertSeedUser(
    tx,
    {
      email: primaryShopSeed.ownerEmail,
      username: primaryShopSeed.ownerUsername,
      phone: primaryShopSeed.ownerPhone
    },
    passwordHash
  );
  const technicianUser = await upsertSeedUser(
    tx,
    {
      email: primaryTechnicianSeed.email,
      username: primaryTechnicianSeed.displayName,
      phone: primaryTechnicianSeed.phone
    },
    passwordHash
  );
  const customerUser = await upsertSeedUser(
    tx,
    {
      email: "seed.customer@needo.local",
      username: "Aya Customer",
      phone: "+81300000003"
    },
    passwordHash
  );

  const existingShop = await tx.shop.findFirst({
    where: { name: primaryShopSeed.name }
  });
  const shop = existingShop
    ? await tx.shop.update({
        where: { id: existingShop.id },
        data: {
          ownerUserId: shopOwner.id,
          description: primaryShopSeed.description,
          city: primaryShopSeed.city,
          address: primaryShopSeed.address,
          latitude: primaryShopSeed.latitude,
          longitude: primaryShopSeed.longitude,
          phone: primaryShopSeed.phone,
          status: "published",
          isRecommended: true,
          deletedAt: null
        }
      })
    : await tx.shop.create({
        data: {
          ownerUserId: shopOwner.id,
          name: primaryShopSeed.name,
          description: primaryShopSeed.description,
          city: primaryShopSeed.city,
          address: primaryShopSeed.address,
          latitude: primaryShopSeed.latitude,
          longitude: primaryShopSeed.longitude,
          phone: primaryShopSeed.phone,
          status: "published",
          isRecommended: true
        }
      });

  await upsertSeedShopFinanceRuleSet(tx, {
    shopId: shop.id,
    actorUserId: shopOwner.id
  });

  const technician = await tx.technicianProfile.upsert({
    where: { userId: technicianUser.id },
    create: {
      userId: technicianUser.id,
      shopId: shop.id,
      displayName: primaryTechnicianSeed.displayName,
      bio: primaryTechnicianSeed.bio,
      city: primaryTechnicianSeed.city,
      serviceArea: primaryTechnicianSeed.serviceArea,
      yearsExperience: primaryTechnicianSeed.yearsExperience,
      status: "published",
      isRecommended: true,
      verifiedAt: new Date("2026-05-01T00:00:00.000Z")
    },
    update: {
      shopId: shop.id,
      displayName: primaryTechnicianSeed.displayName,
      bio: primaryTechnicianSeed.bio,
      city: primaryTechnicianSeed.city,
      serviceArea: primaryTechnicianSeed.serviceArea,
      yearsExperience: primaryTechnicianSeed.yearsExperience,
      status: "published",
      isRecommended: true,
      verifiedAt: new Date("2026-05-01T00:00:00.000Z"),
      deletedAt: null
    }
  });
  const customer = await tx.customerProfile.upsert({
    where: { userId: customerUser.id },
    create: {
      userId: customerUser.id,
      displayName: "Aya Customer",
      bio: "Prefers evening appointments and quiet private rooms.",
      city: "Tokyo",
      membershipLevel: "standard",
      isPublic: true
    },
    update: {
      displayName: "Aya Customer",
      bio: "Prefers evening appointments and quiet private rooms.",
      city: "Tokyo",
      membershipLevel: "standard",
      isPublic: true,
      deletedAt: null
    }
  });

  await upsertSeedIdentity(tx, {
    userId: shopOwner.id,
    type: "merchant_owner",
    scopeType: "shop",
    scopeId: shop.id,
    displayName: primaryShopSeed.ownerUsername
  });
  await upsertSeedIdentity(tx, {
    userId: technicianUser.id,
    type: "technician",
    scopeType: "technician_profile",
    scopeId: technician.id,
    displayName: technician.displayName
  });
  await upsertSeedIdentity(tx, {
    userId: customerUser.id,
    type: "customer",
    scopeType: "customer_profile",
    scopeId: customer.id,
    displayName: customer.displayName
  });

  const merchantOwnerRole = roleByCode.get("merchant_owner");
  const technicianRole = roleByCode.get("technician");
  const customerRole = roleByCode.get("customer");
  if (merchantOwnerRole) {
    await assignSeedRole(tx, {
      userId: shopOwner.id,
      roleId: merchantOwnerRole.id,
      scopeType: "shop",
      scopeId: shop.id
    });
  }
  if (technicianRole) {
    await assignSeedRole(tx, {
      userId: technicianUser.id,
      roleId: technicianRole.id,
      scopeType: "technician_profile",
      scopeId: technician.id
    });
  }
  if (customerRole) {
    await assignSeedRole(tx, {
      userId: customerUser.id,
      roleId: customerRole.id,
      scopeType: "customer_profile",
      scopeId: customer.id
    });
  }

  const shopBySlug = new Map<string, { id: number }>([[primaryShopSeed.slug, shop]]);

  for (const shopSeed of CORE_READ_DEMO_SHOP_SEEDS.slice(1)) {
    const owner = await upsertSeedUser(
      tx,
      {
        email: shopSeed.ownerEmail,
        username: shopSeed.ownerUsername,
        phone: shopSeed.ownerPhone
      },
      passwordHash
    );
    const existingDemoShop = await tx.shop.findFirst({
      where: { name: shopSeed.name }
    });
    const demoShop = existingDemoShop
      ? await tx.shop.update({
          where: { id: existingDemoShop.id },
          data: {
            ownerUserId: owner.id,
            description: shopSeed.description,
            city: shopSeed.city,
            address: shopSeed.address,
            latitude: shopSeed.latitude,
            longitude: shopSeed.longitude,
            phone: shopSeed.phone,
            status: "published",
            isRecommended: true,
            deletedAt: null
          }
        })
      : await tx.shop.create({
          data: {
            ownerUserId: owner.id,
            name: shopSeed.name,
            description: shopSeed.description,
            city: shopSeed.city,
            address: shopSeed.address,
            latitude: shopSeed.latitude,
            longitude: shopSeed.longitude,
            phone: shopSeed.phone,
            status: "published",
            isRecommended: true
          }
        });

    await upsertSeedShopFinanceRuleSet(tx, {
      shopId: demoShop.id,
      actorUserId: owner.id
    });

    await upsertSeedIdentity(tx, {
      userId: owner.id,
      type: "merchant_owner",
      scopeType: "shop",
      scopeId: demoShop.id,
      displayName: shopSeed.ownerUsername
    });
    if (merchantOwnerRole) {
      await assignSeedRole(tx, {
        userId: owner.id,
        roleId: merchantOwnerRole.id,
        scopeType: "shop",
        scopeId: demoShop.id
      });
    }
    await upsertSeedMedia(tx, {
      entityType: "shop",
      entityId: demoShop.id,
      shopId: demoShop.id,
      usageType: "cover",
      url: shopSeed.coverUrl,
      altText: `${shopSeed.name} cover`
    });
    await upsertSeedReviewSummary(tx, {
      targetType: "shop",
      targetId: demoShop.id,
      shopId: demoShop.id,
      ratingAverage: shopSeed.review.ratingAverage,
      reviewCount: shopSeed.review.reviewCount,
      highlights: shopSeed.review.highlights
    });

    shopBySlug.set(shopSeed.slug, demoShop);
  }

  for (const [technicianIndex, technicianSeed] of CORE_READ_DEMO_TECHNICIAN_SEEDS.slice(1).entries()) {
    const demoShop = shopBySlug.get(technicianSeed.shopSlug);
    const category = getDemoCategory(technicianSeed.categoryCode);

    if (!demoShop) {
      throw new Error(`Core read demo seed failed: missing shop ${technicianSeed.shopSlug}.`);
    }

    const user = await upsertSeedUser(
      tx,
      {
        email: technicianSeed.email,
        username: technicianSeed.displayName,
        phone: technicianSeed.phone
      },
      passwordHash
    );
    const demoTechnician = await tx.technicianProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        shopId: demoShop.id,
        displayName: technicianSeed.displayName,
        bio: technicianSeed.bio,
        city: technicianSeed.city,
        serviceArea: technicianSeed.serviceArea,
        yearsExperience: technicianSeed.yearsExperience,
        status: "published",
        isRecommended: true,
        verifiedAt: new Date("2026-05-01T00:00:00.000Z")
      },
      update: {
        shopId: demoShop.id,
        displayName: technicianSeed.displayName,
        bio: technicianSeed.bio,
        city: technicianSeed.city,
        serviceArea: technicianSeed.serviceArea,
        yearsExperience: technicianSeed.yearsExperience,
        status: "published",
        isRecommended: true,
        verifiedAt: new Date("2026-05-01T00:00:00.000Z"),
        deletedAt: null
      }
    });

    await upsertSeedIdentity(tx, {
      userId: user.id,
      type: "technician",
      scopeType: "technician_profile",
      scopeId: demoTechnician.id,
      displayName: demoTechnician.displayName
    });
    if (technicianRole) {
      await assignSeedRole(tx, {
        userId: user.id,
        roleId: technicianRole.id,
        scopeType: "technician_profile",
        scopeId: demoTechnician.id
      });
    }
    await upsertSeedMedia(tx, {
      entityType: "technician",
      entityId: demoTechnician.id,
      technicianProfileId: demoTechnician.id,
      usageType: "avatar",
      url: technicianSeed.avatarUrl,
      altText: `${technicianSeed.displayName} portrait`
    });
    await upsertSeedReviewSummary(tx, {
      targetType: "technician",
      targetId: demoTechnician.id,
      technicianProfileId: demoTechnician.id,
      ratingAverage: technicianSeed.review.ratingAverage,
      reviewCount: technicianSeed.review.reviewCount,
      highlights: technicianSeed.review.highlights
    });

    const service = await upsertSeedService(tx, {
      name: technicianSeed.service.name,
      categoryId: category.id,
      shopId: demoShop.id,
      technicianProfileId: demoTechnician.id,
      description: technicianSeed.service.description,
      city: technicianSeed.service.city,
      serviceMode: technicianSeed.service.serviceMode,
      priceAmount: technicianSeed.service.priceAmount,
      durationMinutes: technicianSeed.service.durationMinutes,
      isRecommended: true,
      sortOrder: 30 + technicianIndex * 10
    });

    await upsertSeedMedia(tx, {
      entityType: "service",
      entityId: service.id,
      serviceId: service.id,
      usageType: "cover",
      url: technicianSeed.service.coverUrl,
      altText: `${technicianSeed.service.name} cover`
    });
    await upsertSeedReviewSummary(tx, {
      targetType: "service",
      targetId: service.id,
      serviceId: service.id,
      ratingAverage: technicianSeed.service.review.ratingAverage,
      reviewCount: technicianSeed.service.review.reviewCount,
      highlights: technicianSeed.service.review.highlights
    });
  }

  if (options.seedRequiredTestAccounts) {
    if (!options.testUserPasswordHash) {
      throw new Error("TEST_USER_DEFAULT_PASSWORD is required before seeding test accounts.");
    }

    await seedRequiredTestAccounts(tx, {
      passwordHash: options.testUserPasswordHash,
      roleByCode,
      shopId: shop.id
    });
  }

  await upsertSeedWalletFunding(tx, {
    ownerType: "SHOP",
    ownerId: shop.id,
    actorUserId: shopOwner.id,
    amount: 5000,
    idempotencyKey: `seed:wallet:shop:${shop.id}:initial-ndp`
  });
  await upsertSeedWalletFunding(tx, {
    ownerType: "USER",
    ownerId: customerUser.id,
    actorUserId: customerUser.id,
    amount: CUSTOMER_REQUEST_WALLET_SEED_NDP,
    idempotencyKey: `seed:wallet:user:${customerUser.id}:request-dispatch-ndp`
  });
  await upsertDefaultFinanceRules(tx, shopOwner.id);

  const shiatsuService = await upsertSeedService(tx, {
    name: primaryTechnicianSeed.service.name,
    categoryId: wellnessCategory.id,
    shopId: shop.id,
    technicianProfileId: technician.id,
    description: primaryTechnicianSeed.service.description,
    city: primaryTechnicianSeed.service.city,
    serviceMode: primaryTechnicianSeed.service.serviceMode,
    priceAmount: primaryTechnicianSeed.service.priceAmount,
    durationMinutes: primaryTechnicianSeed.service.durationMinutes,
    isRecommended: true,
    sortOrder: 10
  });
  const facialService = await upsertSeedService(tx, {
    name: "Hydration Facial Care",
    categoryId: beautyCategory.id,
    shopId: shop.id,
    technicianProfileId: technician.id,
    description: "Moisture-focused facial care for dry skin seasons.",
    city: "Tokyo",
    serviceMode: "store",
    priceAmount: "12800.00",
    durationMinutes: 75,
    isRecommended: true,
    sortOrder: 20
  });
  const requestSmokeTechnicianService = await upsertSeedTechnicianService(tx, {
    shopId: shop.id,
    technicianId: technician.id,
    sourceShopServiceId: shiatsuService.id,
    name: `${shiatsuService.name} Technician Direct`,
    description: "Technician-pricing seed service for Request finance smoke checks.",
    categoryId: shiatsuService.categoryId,
    priceAmount: toSeedJpyAmount(shiatsuService.priceAmount),
    currency: shiatsuService.currency,
    durationMinutes: shiatsuService.durationMinutes,
    coverImageUrl: primaryTechnicianSeed.service.coverUrl,
    createdBy: shopOwner.id
  });
  const seedSlotStarts = [
    new Date("2026-05-26T01:00:00.000Z"),
    new Date("2026-05-26T02:30:00.000Z"),
    new Date("2026-05-27T01:00:00.000Z")
  ];
  const requestSmokeSlotStarts = [
    new Date("2026-05-28T01:00:00.000Z"),
    new Date("2026-05-28T02:30:00.000Z")
  ];

  for (const startsAt of seedSlotStarts) {
    const endsAt = new Date(startsAt.getTime() + shiatsuService.durationMinutes * 60 * 1000);
    const availability = await upsertSeedAvailability(tx, {
      shopId: shop.id,
      technicianProfileId: technician.id,
      startsAt,
      endsAt,
      capacity: 1
    });

    await upsertSeedScheduleSlot(tx, {
      availabilityId: availability.id,
      serviceId: shiatsuService.id,
      shopId: shop.id,
      technicianProfileId: technician.id,
      startsAt,
      endsAt,
      capacity: 1
    });
  }

  for (const startsAt of requestSmokeSlotStarts) {
    const endsAt = new Date(
      startsAt.getTime() + requestSmokeTechnicianService.durationMinutes * 60 * 1000
    );
    const availability = await upsertSeedAvailability(tx, {
      shopId: shop.id,
      technicianProfileId: technician.id,
      startsAt,
      endsAt,
      capacity: 1
    });

    await upsertSeedScheduleSlot(tx, {
      availabilityId: availability.id,
      technicianServiceId: requestSmokeTechnicianService.id,
      shopId: shop.id,
      technicianProfileId: technician.id,
      startsAt,
      endsAt,
      capacity: 1
    });
  }

  const facialStartsAt = new Date("2026-05-27T03:00:00.000Z");
  const facialEndsAt = new Date(facialStartsAt.getTime() + facialService.durationMinutes * 60 * 1000);
  const facialAvailability = await upsertSeedAvailability(tx, {
    shopId: shop.id,
    technicianProfileId: technician.id,
    startsAt: facialStartsAt,
    endsAt: facialEndsAt,
    capacity: 1
  });

  await upsertSeedScheduleSlot(tx, {
    availabilityId: facialAvailability.id,
    serviceId: facialService.id,
    shopId: shop.id,
    technicianProfileId: technician.id,
    startsAt: facialStartsAt,
    endsAt: facialEndsAt,
    capacity: 1
  });

  await upsertSeedMedia(tx, {
    entityType: "shop",
    entityId: shop.id,
    shopId: shop.id,
    usageType: "cover",
    url: primaryShopSeed.coverUrl,
    altText: `${primaryShopSeed.name} cover`
  });
  await upsertSeedMedia(tx, {
    entityType: "technician",
    entityId: technician.id,
    technicianProfileId: technician.id,
    usageType: "avatar",
    url: primaryTechnicianSeed.avatarUrl,
    altText: `${primaryTechnicianSeed.displayName} portrait`
  });
  await upsertSeedMedia(tx, {
    entityType: "customer",
    entityId: customer.id,
    customerProfileId: customer.id,
    usageType: "avatar",
    url: "/images/generated/profile-customer-aya.jpg",
    altText: "Aya Customer avatar"
  });
  await upsertSeedMedia(tx, {
    entityType: "service",
    entityId: shiatsuService.id,
    serviceId: shiatsuService.id,
    usageType: "cover",
    url: primaryTechnicianSeed.service.coverUrl,
    altText: `${primaryTechnicianSeed.service.name} cover`
  });
  await upsertSeedMedia(tx, {
    entityType: "service",
    entityId: facialService.id,
    serviceId: facialService.id,
    usageType: "cover",
    url: "/images/generated/service-facial-care.jpg",
    altText: "Hydration facial care"
  });

  await upsertSeedReviewSummary(tx, {
    targetType: "shop",
    targetId: shop.id,
    shopId: shop.id,
    ratingAverage: primaryShopSeed.review.ratingAverage,
    reviewCount: primaryShopSeed.review.reviewCount,
    highlights: primaryShopSeed.review.highlights
  });
  await upsertSeedReviewSummary(tx, {
    targetType: "technician",
    targetId: technician.id,
    technicianProfileId: technician.id,
    ratingAverage: primaryTechnicianSeed.review.ratingAverage,
    reviewCount: primaryTechnicianSeed.review.reviewCount,
    highlights: primaryTechnicianSeed.review.highlights
  });
  await upsertSeedReviewSummary(tx, {
    targetType: "customer",
    targetId: customer.id,
    customerProfileId: customer.id,
    ratingAverage: "5.00",
    reviewCount: 12,
    highlights: ["punctual", "respectful"]
  });
  await upsertSeedReviewSummary(tx, {
    targetType: "service",
    targetId: shiatsuService.id,
    serviceId: shiatsuService.id,
    ratingAverage: primaryTechnicianSeed.service.review.ratingAverage,
    reviewCount: primaryTechnicianSeed.service.review.reviewCount,
    highlights: primaryTechnicianSeed.service.review.highlights
  });
  await upsertSeedReviewSummary(tx, {
    targetType: "service",
    targetId: facialService.id,
    serviceId: facialService.id,
    ratingAverage: "4.70",
    reviewCount: 41,
    highlights: ["hydrating", "calm"]
  });

  await seedFormalFinancePayrollDemoData(tx, {
    shopId: shop.id,
    shopName: shop.name,
    merchantUserId: shopOwner.id,
    customerUserId: customerUser.id,
    fallbackTechnicianProfileId: technician.id,
    serviceId: shiatsuService.id,
    serviceName: shiatsuService.name,
    serviceAmountJpy: 8800,
    durationMinutes: shiatsuService.durationMinutes
  });
};

const seedFormalFinancePayrollDemoData = async (
  tx: Prisma.TransactionClient,
  input: {
    shopId: number;
    shopName: string;
    merchantUserId: number;
    customerUserId: number;
    fallbackTechnicianProfileId: number;
    serviceId: number;
    serviceName: string;
    serviceAmountJpy: number;
    durationMinutes: number;
  }
): Promise<void> => {
  const periodStart = new Date("2026-06-01T00:00:00.000Z");
  const periodEnd = new Date("2026-06-30T23:59:59.000Z");
  const startsAt = new Date("2026-06-04T01:00:00.000Z");
  const endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60 * 1000);
  const technicianUser = await tx.user.findUnique({
    where: { email: "technician@example.com" },
    include: { technicianProfile: true }
  });
  const technicianProfileId =
    technicianUser?.technicianProfile?.id ?? input.fallbackTechnicianProfileId;
  const technicianUserId = technicianUser?.id ?? null;
  const availability = await upsertSeedAvailability(tx, {
    shopId: input.shopId,
    technicianProfileId,
    startsAt,
    endsAt,
    capacity: 1
  });
  const slot = await upsertSeedScheduleSlot(tx, {
    availabilityId: availability.id,
    serviceId: input.serviceId,
    shopId: input.shopId,
    technicianProfileId,
    startsAt,
    endsAt,
    capacity: 1
  });

  await tx.scheduleSlot.update({
    where: { id: slot.id },
    data: {
      bookedCount: 1,
      status: ScheduleSlotStatus.BOOKED,
      deletedAt: null
    }
  });

  const order = await tx.bookingOrder.upsert({
    where: { orderNo: "SEED-FINANCE-0001" },
    create: {
      orderNo: "SEED-FINANCE-0001",
      orderType: OrderType.BOOKING,
      customerUserId: input.customerUserId,
      serviceId: input.serviceId,
      shopId: input.shopId,
      technicianProfileId,
      scheduleSlotId: slot.id,
      status: BookingOrderStatus.COMPLETED,
      fulfillmentMode: "store",
      priceAmount: input.serviceAmountJpy,
      currency: "JPY",
      pricingModeSnapshot: ShopPricingMode.MERCHANT,
      serviceOwnerType: ServiceOwnerType.SHOP,
      serviceOwnerId: input.shopId,
      serviceNameSnapshot: input.serviceName,
      servicePriceSnapshot: input.serviceAmountJpy,
      serviceDurationSnapshot: input.durationMinutes,
      startsAt,
      endsAt,
      note: "Formal finance/payroll seed order"
    },
    update: {
      customerUserId: input.customerUserId,
      serviceId: input.serviceId,
      shopId: input.shopId,
      technicianProfileId,
      scheduleSlotId: slot.id,
      status: BookingOrderStatus.COMPLETED,
      fulfillmentMode: "store",
      priceAmount: input.serviceAmountJpy,
      currency: "JPY",
      pricingModeSnapshot: ShopPricingMode.MERCHANT,
      serviceOwnerType: ServiceOwnerType.SHOP,
      serviceOwnerId: input.shopId,
      serviceNameSnapshot: input.serviceName,
      servicePriceSnapshot: input.serviceAmountJpy,
      serviceDurationSnapshot: input.durationMinutes,
      startsAt,
      endsAt,
      note: "Formal finance/payroll seed order",
      deletedAt: null
    }
  });
  const existingHistory = await tx.orderStatusHistory.findFirst({
    where: {
      bookingOrderId: order.id,
      toStatus: BookingOrderStatus.COMPLETED,
      reason: "formal_finance_payroll_seed"
    }
  });

  if (existingHistory) {
    await tx.orderStatusHistory.update({
      where: { id: existingHistory.id },
      data: {
        actorUserId: input.merchantUserId,
        metadata: { seed: "formal_finance_payroll" },
        deletedAt: null
      }
    });
  } else {
    await tx.orderStatusHistory.create({
      data: {
        bookingOrderId: order.id,
        fromStatus: BookingOrderStatus.CONFIRMED,
        toStatus: BookingOrderStatus.COMPLETED,
        actorUserId: input.merchantUserId,
        reason: "formal_finance_payroll_seed",
        metadata: { seed: "formal_finance_payroll" }
      }
    });
  }

  await tx.orderFinancial.upsert({
    where: { bookingOrderId: order.id },
    create: {
      bookingOrderId: order.id,
      orderType: "booking",
      customerUserId: input.customerUserId,
      shopId: input.shopId,
      technicianProfileId,
      serviceAmountJpy: input.serviceAmountJpy,
      offlineReportedServiceAmountJpy: input.serviceAmountJpy,
      paymentChannel: "offline_card",
      serviceIncomeStatus: "confirmed",
      bPlatformFeeHoldNdp: 500,
      bPlatformFeeActualNdp: 500,
      userRewardNdp: 100,
      platformFeeBearerForPayroll: "split",
      completedOrderOrdinalInPeriod: 1,
      appliedFeeRuleIdsJson: ["seed:b_platform_fee", "seed:user_reward"],
      moneyTimelineJson: [
        { type: "service_income_confirmed", amountJpy: input.serviceAmountJpy },
        { type: "b_platform_fee_captured", amountNdp: 500 },
        { type: "user_reward_granted", amountNdp: 100 },
        { type: "technician_income_estimated", amountJpy: 4250 }
      ],
      serviceIncomeReportedById: input.merchantUserId,
      serviceIncomeReportedAt: endsAt,
      serviceIncomeConfirmedById: input.merchantUserId,
      serviceIncomeConfirmedAt: endsAt,
      serviceIncomeNote: "Formal seed service income confirmed for payroll demo.",
      settlementStatus: "ready_for_payroll"
    },
    update: {
      customerUserId: input.customerUserId,
      shopId: input.shopId,
      technicianProfileId,
      serviceAmountJpy: input.serviceAmountJpy,
      offlineReportedServiceAmountJpy: input.serviceAmountJpy,
      unknownOrUnreportedServiceAmountJpy: 0,
      paymentChannel: "offline_card",
      serviceIncomeStatus: "confirmed",
      bPlatformFeeHoldNdp: 500,
      bPlatformFeeActualNdp: 500,
      cRequestFeeHoldNdp: 0,
      cRequestFeeActualNdp: 0,
      userRewardNdp: 100,
      releasedNdp: 0,
      platformFeeBearerForPayroll: "split",
      completedOrderOrdinalInPeriod: 1,
      appliedFeeRuleIdsJson: ["seed:b_platform_fee", "seed:user_reward"],
      moneyTimelineJson: [
        { type: "service_income_confirmed", amountJpy: input.serviceAmountJpy },
        { type: "b_platform_fee_captured", amountNdp: 500 },
        { type: "user_reward_granted", amountNdp: 100 },
        { type: "technician_income_estimated", amountJpy: 4250 }
      ],
      serviceIncomeReportedById: input.merchantUserId,
      serviceIncomeReportedAt: endsAt,
      serviceIncomeConfirmedById: input.merchantUserId,
      serviceIncomeConfirmedAt: endsAt,
      serviceIncomeNote: "Formal seed service income confirmed for payroll demo.",
      settlementStatus: "ready_for_payroll",
      deletedAt: null
    }
  });

  const payRunData = {
    shopId: input.shopId,
    periodStart,
    periodEnd,
    status: "paid",
    totalBaseSalaryJpy: 1000,
    totalCommissionJpy: 4400,
    totalBonusJpy: 0,
    totalAllowanceJpy: 0,
    totalDeductionJpy: 1150,
    totalNetPayJpy: 4250,
    paidAmountJpy: 4250,
    unpaidAmountJpy: 0,
    generatedById: input.merchantUserId,
    approvedById: input.merchantUserId,
    lockedAt: null,
    deletedAt: null
  };
  const existingPayRun = await tx.payRun.findFirst({
    where: {
      shopId: input.shopId,
      periodStart,
      periodEnd,
      generatedById: input.merchantUserId
    }
  });
  const payRun = existingPayRun
    ? await tx.payRun.update({
        where: { id: existingPayRun.id },
        data: payRunData
      })
    : await tx.payRun.create({ data: payRunData });
  const payslipData = {
    payRunId: payRun.id,
    shopId: input.shopId,
    technicianProfileId,
    technicianUserId,
    periodStart,
    periodEnd,
    status: "paid",
    disputeStatus: "none",
    disputeReason: null,
    baseSalaryJpy: 1000,
    commissionJpy: 4400,
    bonusJpy: 0,
    allowanceJpy: 0,
    deductionJpy: 1000,
    platformFeeShareDeductionJpy: 150,
    netPayJpy: 4250,
    paidAmountJpy: 4250,
    unpaidAmountJpy: 0,
    confirmedAt: new Date("2026-06-05T02:00:00.000Z"),
    disputedAt: null,
    disputeResolvedAt: null,
    disputeResolvedById: null,
    disputeResolutionNote: null,
    deletedAt: null
  };
  const existingPayslip = await tx.payslip.findFirst({
    where: {
      payRunId: payRun.id,
      technicianProfileId,
      periodStart,
      periodEnd
    }
  });
  const payslip = existingPayslip
    ? await tx.payslip.update({
        where: { id: existingPayslip.id },
        data: payslipData
      })
    : await tx.payslip.create({ data: payslipData });

  await tx.payslipLine.updateMany({
    where: { payslipId: payslip.id, sourceType: "order", orderId: order.id, deletedAt: null },
    data: { deletedAt: new Date() }
  });
  await tx.payslipLine.createMany({
    data: [
      {
        payslipId: payslip.id,
        lineType: "base_salary",
        title: "Seed base pay",
        amountJpy: 1000,
        quantity: 1,
        unitAmountJpy: 1000,
        sourceType: "order",
        orderId: order.id,
        explanation: "Formal seed payroll base pay.",
        createdById: input.merchantUserId
      },
      {
        payslipId: payslip.id,
        lineType: "commission",
        title: "Seed service commission",
        amountJpy: 4400,
        quantity: 1,
        unitAmountJpy: 4400,
        sourceType: "order",
        orderId: order.id,
        explanation: "50 percent commission on confirmed service income.",
        createdById: input.merchantUserId
      },
      {
        payslipId: payslip.id,
        lineType: "platform_fee_share_deduction",
        title: "Seed NDP split deduction",
        amountJpy: -150,
        quantity: 1,
        unitAmountJpy: -150,
        sourceType: "order",
        orderId: order.id,
        explanation: "Technician share of Booking NDP platform fee.",
        createdById: input.merchantUserId
      },
      {
        payslipId: payslip.id,
        lineType: "deduction",
        title: "Seed attendance deduction",
        amountJpy: -1000,
        quantity: 1,
        unitAmountJpy: -1000,
        sourceType: "order",
        orderId: order.id,
        explanation: "Seed deduction to exercise payroll CSV totals.",
        createdById: input.merchantUserId
      }
    ]
  });

  const existingPayout = await tx.payoutRecord.findFirst({
    where: {
      payslipId: payslip.id,
      referenceNo: "SEED-PAYOUT-0001"
    }
  });
  const payoutData = {
    shopId: input.shopId,
    technicianProfileId,
    amountJpy: 4250,
    payoutMethod: "bank_transfer",
    payoutDate: new Date("2026-06-06T00:00:00.000Z"),
    referenceNo: "SEED-PAYOUT-0001",
    note: "Formal finance payroll seed payout.",
    status: "completed",
    confirmedByTechnician: true,
    technicianConfirmedAt: new Date("2026-06-06T02:00:00.000Z"),
    createdById: input.merchantUserId,
    deletedAt: null
  };

  if (existingPayout) {
    await tx.payoutRecord.update({
      where: { id: existingPayout.id },
      data: payoutData
    });
  } else {
    await tx.payoutRecord.create({
      data: {
        ...payoutData,
        payslipId: payslip.id
      }
    });
  }

  const existingAudit = await tx.auditLog.findFirst({
    where: {
      action: "seed.finance_payroll.formal_demo",
      targetType: "pay_run",
      targetId: payRun.id
    }
  });

  if (!existingAudit) {
    await tx.auditLog.create({
      data: {
        actorId: input.merchantUserId,
        action: "seed.finance_payroll.formal_demo",
        targetType: "pay_run",
        targetId: payRun.id,
        metadata: {
          orderNo: order.orderNo,
          shopName: input.shopName,
          payslipId: payslip.id
        }
      }
    });
  }
};

const upsertSeedService = async (
  tx: Prisma.TransactionClient,
  input: {
    name: string;
    categoryId: number;
    shopId: number;
    technicianProfileId: number;
    description: string;
    city: string;
    serviceMode: string;
    priceAmount: string;
    durationMinutes: number;
    isRecommended: boolean;
    sortOrder: number;
  }
) => {
  const existing = await tx.service.findFirst({
    where: { name: input.name, shopId: input.shopId }
  });
  const data = {
    categoryId: input.categoryId,
    shopId: input.shopId,
    technicianProfileId: input.technicianProfileId,
    description: input.description,
    city: input.city,
    serviceMode: input.serviceMode,
    priceAmount: input.priceAmount,
    currency: "JPY",
    durationMinutes: input.durationMinutes,
    status: "published",
    isRecommended: input.isRecommended,
    sortOrder: input.sortOrder,
    deletedAt: null
  };

  return existing
    ? tx.service.update({
        where: { id: existing.id },
        data
      })
    : tx.service.create({
        data: {
          ...data,
          name: input.name
        }
      });
};

const toSeedJpyAmount = (value: { toString: () => string } | string | number): number =>
  Math.round(Number(value.toString()));

const upsertSeedTechnicianService = async (
  tx: Prisma.TransactionClient,
  input: {
    shopId: number;
    technicianId: number;
    sourceShopServiceId: number;
    name: string;
    description: string;
    categoryId: number;
    priceAmount: number;
    currency: string;
    durationMinutes: number;
    coverImageUrl: string;
    createdBy: number;
  }
) => {
  const existing = await tx.technicianService.findFirst({
    where: {
      shopId: input.shopId,
      technicianId: input.technicianId,
      sourceShopServiceId: input.sourceShopServiceId,
      name: input.name
    }
  });
  const data = {
    shopId: input.shopId,
    technicianId: input.technicianId,
    sourceShopServiceId: input.sourceShopServiceId,
    name: input.name,
    description: input.description,
    categoryId: input.categoryId,
    priceAmount: input.priceAmount,
    currency: input.currency,
    durationMinutes: input.durationMinutes,
    coverImageUrl: input.coverImageUrl,
    isActive: true,
    isBookable: true,
    isRecommended: true,
    sortOrder: 10,
    reviewStatus: "APPROVED" as const,
    updatedBy: input.createdBy,
    deletedAt: null
  };

  return existing
    ? tx.technicianService.update({
        where: { id: existing.id },
        data
      })
    : tx.technicianService.create({
        data: {
          ...data,
          createdBy: input.createdBy
        }
      });
};

const upsertSeedAvailability = async (
  tx: Prisma.TransactionClient,
  input: {
    shopId: number;
    technicianProfileId: number;
    startsAt: Date;
    endsAt: Date;
    capacity: number;
  }
) => {
  const existing = await tx.availability.findFirst({
    where: {
      shopId: input.shopId,
      technicianProfileId: input.technicianProfileId,
      startsAt: input.startsAt,
      endsAt: input.endsAt
    }
  });
  const data = {
    shopId: input.shopId,
    technicianProfileId: input.technicianProfileId,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    capacity: input.capacity,
    isActive: true,
    deletedAt: null
  };

  return existing
    ? tx.availability.update({
        where: { id: existing.id },
        data
      })
    : tx.availability.create({ data });
};

const upsertSeedScheduleSlot = async (
  tx: Prisma.TransactionClient,
  input: {
    availabilityId: number;
    serviceId?: number | null;
    technicianServiceId?: number | null;
    shopId: number;
    technicianProfileId: number;
    startsAt: Date;
    endsAt: Date;
    capacity: number;
  }
) => {
  const existing = await tx.scheduleSlot.findFirst({
    where: {
      serviceId: input.serviceId ?? null,
      technicianServiceId: input.technicianServiceId ?? null,
      shopId: input.shopId,
      technicianProfileId: input.technicianProfileId,
      startsAt: input.startsAt,
      endsAt: input.endsAt
    }
  });
  const data = {
    availabilityId: input.availabilityId,
    serviceId: input.serviceId ?? null,
    technicianServiceId: input.technicianServiceId ?? null,
    shopId: input.shopId,
    technicianProfileId: input.technicianProfileId,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    capacity: input.capacity,
    bookedCount: 0,
    status: "AVAILABLE" as const,
    deletedAt: null
  };

  return existing
    ? tx.scheduleSlot.update({
        where: { id: existing.id },
        data
      })
    : tx.scheduleSlot.create({ data });
};

const upsertSeedWallet = (
  tx: Prisma.TransactionClient,
  input: { ownerType: "USER" | "SHOP" | "PLATFORM"; ownerId: number }
) =>
  tx.wallet.upsert({
    where: {
      ownerType_ownerId_currency: {
        ownerType: input.ownerType,
        ownerId: input.ownerId,
        currency: "NDP"
      }
    },
    create: {
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      currency: "NDP"
    },
    update: {
      deletedAt: null
    }
  });

const upsertDefaultFinanceRules = async (
  tx: Prisma.TransactionClient,
  actorUserId: number
): Promise<void> => {
  const existing = await tx.platformFeeRuleSet.findFirst({
    where: { name: "Default Booking NDP Rules" },
    select: { id: true }
  });
  const ruleSet = existing
    ? await tx.platformFeeRuleSet.update({
        where: { id: existing.id },
        data: {
          description: "Default Booking platform fee, customer reward, and merchant cancellation compensation.",
          scopeType: "platform",
          priority: 100,
          status: "active",
          version: 1,
          effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
          effectiveTo: null,
          updatedById: actorUserId,
          deletedAt: null
        }
      })
    : await tx.platformFeeRuleSet.create({
        data: {
          name: "Default Booking NDP Rules",
          description: "Default Booking platform fee, customer reward, and merchant cancellation compensation.",
          scopeType: "platform",
          priority: 100,
          status: "active",
          version: 1,
          effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
          createdById: actorUserId,
          updatedById: actorUserId
        }
      });
  const previousRules = await tx.platformFeeRule.findMany({
    where: { ruleSetId: ruleSet.id, deletedAt: null },
    select: { id: true }
  });
  const previousRuleIds = previousRules.map((rule) => rule.id);
  const deletedAt = new Date();

  if (previousRuleIds.length > 0) {
    await Promise.all([
      tx.platformFeeTier.updateMany({
        where: { ruleId: { in: previousRuleIds }, deletedAt: null },
        data: { deletedAt }
      }),
      tx.platformFeeTimeWindow.updateMany({
        where: { ruleId: { in: previousRuleIds }, deletedAt: null },
        data: { deletedAt }
      })
    ]);
    await tx.platformFeeRule.updateMany({
      where: { id: { in: previousRuleIds }, deletedAt: null },
      data: { deletedAt }
    });
  }

  await tx.platformFeeRule.createMany({
    data: [
      {
        ruleSetId: ruleSet.id,
        feeType: "b_platform_fee",
        orderType: "booking",
        payerType: "shop",
        baseAmountNdp: 500,
        calculationMode: "fixed",
        holdStrategy: "max_possible_fee",
        pricingLockMode: "recalculate_at_complete",
        stackingMode: "sum",
        priority: 100,
        status: "active",
        createdById: actorUserId,
        updatedById: actorUserId
      },
      {
        ruleSetId: ruleSet.id,
        feeType: "user_reward",
        orderType: "booking",
        payerType: "platform",
        baseAmountNdp: 100,
        calculationMode: "fixed",
        holdStrategy: "exact_estimate",
        pricingLockMode: "recalculate_at_complete",
        stackingMode: "sum",
        priority: 110,
        status: "active",
        createdById: actorUserId,
        updatedById: actorUserId
      },
      {
        ruleSetId: ruleSet.id,
        feeType: "c_request_dispatch_fee",
        orderType: "request",
        payerType: "user",
        baseAmountNdp: DEFAULT_REQUEST_DISPATCH_FEE_NDP,
        calculationMode: "fixed",
        holdStrategy: "exact_estimate",
        pricingLockMode: "recalculate_at_complete",
        stackingMode: "sum",
        priority: 115,
        status: "active",
        createdById: actorUserId,
        updatedById: actorUserId
      },
      {
        ruleSetId: ruleSet.id,
        feeType: "penalty",
        orderType: "booking",
        payerType: "shop",
        baseAmountNdp: 500,
        calculationMode: "fixed",
        holdStrategy: "exact_estimate",
        pricingLockMode: "recalculate_at_complete",
        stackingMode: "sum",
        priority: 120,
        status: "active",
        createdById: actorUserId,
        updatedById: actorUserId
      }
    ]
  });
};

const upsertSeedWalletFunding = async (
  tx: Prisma.TransactionClient,
  input: {
    ownerType: "USER" | "SHOP" | "PLATFORM";
    ownerId: number;
    actorUserId: number;
    amount: number;
    idempotencyKey: string;
  }
): Promise<void> => {
  const wallet = await upsertSeedWallet(tx, input);
  const existing = await tx.ledgerTransaction.findUnique({
    where: { idempotencyKey: input.idempotencyKey }
  });

  if (existing) {
    const topUpAmount = getSeedWalletTopUpAmount(wallet.availableBalance, input.amount);

    if (topUpAmount <= 0) {
      return;
    }

    await createSeedWalletFundingTransaction(tx, wallet, {
      ...input,
      amount: topUpAmount,
      idempotencyKey: createSeedWalletTopUpIdempotencyKey(input, wallet, topUpAmount)
    });
    return;
  }

  await createSeedWalletFundingTransaction(tx, wallet, input);
};

const createSeedWalletFundingTransaction = async (
  tx: Prisma.TransactionClient,
  wallet: Awaited<ReturnType<typeof upsertSeedWallet>>,
  input: {
    ownerType: "USER" | "SHOP" | "PLATFORM";
    ownerId: number;
    actorUserId: number;
    amount: number;
    idempotencyKey: string;
  }
): Promise<void> => {
  const transaction = await tx.ledgerTransaction.create({
    data: {
      transactionNo: createSeedLedgerTransactionNo(input),
      idempotencyKey: input.idempotencyKey,
      type: "SEED_CREDIT",
      referenceType: "seed_wallet",
      referenceId: wallet.id,
      actorUserId: input.actorUserId,
      amount: input.amount,
      currency: "NDP",
      metadata: {
        ownerType: input.ownerType,
        ownerId: input.ownerId
      }
    }
  });
  const updatedWallet = await tx.wallet.update({
    where: { id: wallet.id },
    data: {
      availableBalance: { increment: input.amount }
    }
  });

  await tx.walletLedger.create({
    data: {
      walletId: wallet.id,
      transactionId: transaction.id,
      direction: "AVAILABLE_CREDIT",
      amount: input.amount,
      availableDelta: input.amount,
      frozenDelta: 0,
      availableBalanceAfter: updatedWallet.availableBalance,
      frozenBalanceAfter: updatedWallet.frozenBalance,
      reason: "seed_wallet_initial_ndp"
    }
  });
  await tx.financeReconciliation.create({
    data: {
      transactionId: transaction.id,
      referenceType: "seed_wallet",
      referenceId: wallet.id,
      expectedAmount: input.amount,
      actualAmount: input.amount,
      differenceAmount: 0,
      currency: "NDP"
    }
  });
  await tx.auditLog.create({
    data: {
      actorId: input.actorUserId,
      action: "ledger.seed_wallet.credit",
      targetType: "ledger_transaction",
      targetId: transaction.id,
      metadata: {
        walletId: wallet.id,
        amount: input.amount,
        currency: "NDP"
      }
    }
  });
};

const createSeedWalletTopUpIdempotencyKey = (
  input: { idempotencyKey: string },
  wallet: Awaited<ReturnType<typeof upsertSeedWallet>>,
  topUpAmount: number
): string =>
  `${input.idempotencyKey}:top-up:${wallet.availableBalance}:${wallet.frozenBalance}:${topUpAmount}:${wallet.updatedAt.getTime()}`;

const createSeedLedgerTransactionNo = (input: {
  ownerType: string;
  ownerId: number;
  amount: number;
  idempotencyKey: string;
}): string => {
  const digest = createHash("sha1").update(input.idempotencyKey).digest("hex").slice(0, 12).toUpperCase();

  return `LTSEED${digest}${Math.abs(input.amount)}`.slice(0, 40);
};

const upsertSeedMedia = async (
  tx: Prisma.TransactionClient,
  input: {
    entityType: string;
    entityId: number;
    categoryId?: number;
    serviceId?: number;
    shopId?: number;
    technicianProfileId?: number;
    customerProfileId?: number;
    usageType: string;
    url: string;
    altText: string;
  }
): Promise<void> => {
  const existing = await tx.mediaAsset.findFirst({
    where: {
      entityType: input.entityType,
      entityId: input.entityId,
      usageType: input.usageType,
      url: input.url
    }
  });
  const data = {
    categoryId: input.categoryId ?? null,
    serviceId: input.serviceId ?? null,
    shopId: input.shopId ?? null,
    technicianProfileId: input.technicianProfileId ?? null,
    customerProfileId: input.customerProfileId ?? null,
    mimeType: "image/jpeg",
    usageType: input.usageType,
    width: 1200,
    height: 800,
    altText: input.altText,
    sortOrder: 10,
    isActive: true,
    deletedAt: null
  };

  if (existing) {
    await tx.mediaAsset.update({
      where: { id: existing.id },
      data
    });
    return;
  }

  await tx.mediaAsset.create({
    data: {
      ...data,
      entityType: input.entityType,
      entityId: input.entityId,
      url: input.url
    }
  });
};

const upsertSeedReviewSummary = (
  tx: Prisma.TransactionClient,
  input: {
    targetType: string;
    targetId: number;
    shopId?: number;
    serviceId?: number;
    technicianProfileId?: number;
    customerProfileId?: number;
    ratingAverage: string;
    reviewCount: number;
    highlights: string[];
  }
) =>
  tx.reviewSummary.upsert({
    where: {
      targetType_targetId: {
        targetType: input.targetType,
        targetId: input.targetId
      }
    },
    create: {
      targetType: input.targetType,
      targetId: input.targetId,
      shopId: input.shopId ?? null,
      serviceId: input.serviceId ?? null,
      technicianProfileId: input.technicianProfileId ?? null,
      customerProfileId: input.customerProfileId ?? null,
      ratingAverage: input.ratingAverage,
      reviewCount: input.reviewCount,
      latestReviewAt: new Date("2026-05-20T00:00:00.000Z"),
      highlights: input.highlights
    },
    update: {
      shopId: input.shopId ?? null,
      serviceId: input.serviceId ?? null,
      technicianProfileId: input.technicianProfileId ?? null,
      customerProfileId: input.customerProfileId ?? null,
      ratingAverage: input.ratingAverage,
      reviewCount: input.reviewCount,
      latestReviewAt: new Date("2026-05-20T00:00:00.000Z"),
      highlights: input.highlights,
      deletedAt: null
    }
  });

const upsertSeedShopFinanceRuleSet = async (
  tx: Prisma.TransactionClient,
  input: {
    shopId: number;
    actorUserId: number;
  }
): Promise<void> => {
  const existing = await tx.shopFinanceRuleSet.findFirst({
    where: {
      shopId: input.shopId,
      status: "active",
      deletedAt: null
    },
    orderBy: { id: "desc" }
  });
  const data = {
    name: "商户财务规则中心 v1",
    status: "active",
    wageMode: "base_plus_commission",
    baseSalaryJpy: 0,
    hourlyRateJpy: 0,
    dailyRateJpy: 0,
    fixedOrderPayJpy: 1000,
    commissionRateBps: 5000,
    guaranteedMinimumJpy: 0,
    ndpFeeBearer: "split",
    technicianNdpShareBps: 3000,
    bonusRulesJson: [
      {
        id: "monthly-100",
        name: "月 100 单突破奖金",
        triggerType: "monthly_order_count",
        threshold: 100,
        amountJpy: 3000,
        active: true
      }
    ],
    deductionRulesJson: [],
    effectiveFrom: new Date("2026-06-01T00:00:00.000Z"),
    effectiveTo: null,
    updatedById: input.actorUserId,
    deletedAt: null
  };

  if (existing) {
    await tx.shopFinanceRuleSet.update({
      where: { id: existing.id },
      data
    });
    return;
  }

  await tx.shopFinanceRuleSet.create({
    data: {
      ...data,
      shopId: input.shopId,
      createdById: input.actorUserId
    }
  });
};

export const seedUserManagement = async (
  prisma: PrismaClient = createSeedPrismaClient()
): Promise<void> => {
  const adminConfig = getAdminSeedConfig();
  const adminPasswordHash = await hash(adminConfig.password, BCRYPT_ROUNDS);
  const seedTestAccounts = shouldSeedRequiredTestAccounts();
  const testUserPasswordHash = seedTestAccounts
    ? await hash(getTestUserSeedPassword(), BCRYPT_ROUNDS)
    : null;
  const rolePermissionAssignments = buildRolePermissionAssignments();

  await prisma.$transaction(async (tx) => {
    for (const role of SYSTEM_ROLES) {
      await tx.role.upsert({
        where: { code: role.code },
        create: {
          code: role.code,
          name: role.name,
          description: role.description,
          isSystem: role.isSystem
        },
        update: {
          name: role.name,
          description: role.description,
          isSystem: role.isSystem,
          deletedAt: null
        }
      });
    }

    for (const permission of SYSTEM_PERMISSIONS) {
      await tx.permission.upsert({
        where: { code: permission.code },
        create: {
          code: permission.code,
          name: permission.name,
          type: permission.type,
          module: permission.module,
          description: permission.description,
          isSystem: permission.isSystem
        },
        update: {
          name: permission.name,
          type: permission.type,
          module: permission.module,
          description: permission.description,
          isSystem: permission.isSystem,
          deletedAt: null
        }
      });
    }

    const roles = await tx.role.findMany({
      where: {
        code: { in: SYSTEM_ROLES.map((role) => role.code) },
        deletedAt: null
      }
    });
    const permissions = await tx.permission.findMany({
      where: {
        code: { in: SYSTEM_PERMISSIONS.map((permission) => permission.code) },
        deletedAt: null
      }
    });
    const roleByCode = new Map(roles.map((role) => [role.code, role]));
    const permissionByCode = new Map(
      permissions.map((permission) => [permission.code, permission])
    );

    for (const [roleCode, permissionCodes] of Object.entries(rolePermissionAssignments)) {
      const role = roleByCode.get(roleCode);
      if (!role) {
        throw new Error(`Role seed failed: missing role ${roleCode}.`);
      }

      for (const permissionCode of permissionCodes) {
        const permission = permissionByCode.get(permissionCode);
        if (!permission) {
          throw new Error(`Permission seed failed: missing permission ${permissionCode}.`);
        }

        await tx.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: permission.id
            }
          },
          create: {
            roleId: role.id,
            permissionId: permission.id
          },
          update: {
            deletedAt: null
          }
        });
      }
    }

    const adminUser = await tx.user.upsert({
      where: { email: adminConfig.email },
      create: {
        email: adminConfig.email,
        passwordHash: adminPasswordHash,
        username: adminConfig.username,
        isActive: true
      },
      update: {
        passwordHash: adminPasswordHash,
        username: adminConfig.username,
        isActive: true,
        deletedAt: null
      }
    });

    const adminIdentity = await tx.userIdentity.findFirst({
      where: {
        userId: adminUser.id,
        type: "platform",
        scopeType: "global",
        scopeId: null
      }
    });

    if (adminIdentity) {
      await tx.userIdentity.update({
        where: { id: adminIdentity.id },
        data: {
          displayName: adminConfig.username,
          isDefault: true,
          isActive: true,
          deletedAt: null
        }
      });
    } else {
      await tx.userIdentity.create({
        data: {
          userId: adminUser.id,
          type: "platform",
          scopeType: "global",
          displayName: adminConfig.username,
          isDefault: true,
          isActive: true
        }
      });
    }

    const adminRole = roleByCode.get("admin");
    if (!adminRole) {
      throw new Error("Admin user seed failed: missing admin role.");
    }

    const adminUserRole = await tx.userRole.findFirst({
      where: {
        userId: adminUser.id,
        roleId: adminRole.id,
        scopeType: "global",
        scopeId: null
      }
    });

    if (adminUserRole) {
      await tx.userRole.update({
        where: { id: adminUserRole.id },
        data: { deletedAt: null }
      });
    } else {
      await tx.userRole.create({
        data: {
          userId: adminUser.id,
          roleId: adminRole.id,
          scopeType: "global"
        }
      });
    }

    const customerRole = roleByCode.get("customer");
    if (!customerRole) {
      throw new Error("Admin user seed failed: missing customer role.");
    }

    const adminCustomerProfile = await tx.customerProfile.upsert({
      where: { userId: adminUser.id },
      create: {
        userId: adminUser.id,
        displayName: adminConfig.username,
        bio: "Default test customer identity for the shared local and staging test account.",
        city: "Tokyo",
        membershipLevel: "standard",
        isPublic: false
      },
      update: {
        displayName: adminConfig.username,
        bio: "Default test customer identity for the shared local and staging test account.",
        city: "Tokyo",
        membershipLevel: "standard",
        isPublic: false,
        deletedAt: null
      }
    });

    await upsertSeedIdentity(tx, {
      userId: adminUser.id,
      type: "customer",
      scopeType: "customer_profile",
      scopeId: adminCustomerProfile.id,
      displayName: adminCustomerProfile.displayName,
      isDefault: false
    });

    await assignSeedRole(tx, {
      userId: adminUser.id,
      roleId: customerRole.id,
      scopeType: "customer_profile",
      scopeId: adminCustomerProfile.id
    });

    await seedCoreReadData(tx, adminPasswordHash, roleByCode, {
      seedRequiredTestAccounts: seedTestAccounts,
      testUserPasswordHash
    });
  });
};

const runSeed = async (): Promise<void> => {
  const prisma = createSeedPrismaClient();

  try {
    await seedUserManagement(prisma);
    console.log("User Management and Step 08 core read seed completed.");
  } finally {
    await prisma.$disconnect();
  }
};

if (require.main === module) {
  runSeed().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
