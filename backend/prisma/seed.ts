import {
  BookingOrderStatus,
  OrderType,
  PrismaClient,
  ScheduleSlotStatus,
  ServicePaymentMethod,
  ServicePaymentStatus,
  ServiceOwnerType,
  ShopPricingMode,
  TechnicianEmploymentType,
  TechnicianShopRelationshipType,
  TechnicianShopWorkStatus,
  type Category,
  type Prisma
} from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { createHash } from "node:crypto";
import { hash } from "bcryptjs";
import { disconnectRedis } from "../src/config/redis";
import {
  RedisAuthSessionStore,
  type AuthSessionStore
} from "../src/services/auth-session.store";
import { PublicIdentifierRepository } from "../src/repositories/public-identifier.repository";
import { IdentifierAllocator } from "../src/services/public-identifier.service";
import { UserBootstrapKeyAllocator } from "../src/services/user-bootstrap-key.service";
import type { TestNdpProvisioningService } from "../src/services/test-ndp-provisioning.service";

import {
  SYSTEM_PERMISSIONS,
  SYSTEM_ROLES,
  buildRolePermissionAssignments
} from "../src/constants/permissions.constants";
import {
  TEST_USER_ACCOUNTS,
  getTestAccountSwitchIdentityTypes,
  type TestUserAccountDefinition
} from "../src/constants/test-login.constants";
import {
  SHOP_SERVICE_TAXONOMY,
  type TaxonomyLocaleCode
} from "./catalogs/shop-service-taxonomy";

const BCRYPT_ROUNDS = 12;
const bootstrapKeyAllocator = new UserBootstrapKeyAllocator();
const DEFAULT_ADMIN_EMAIL = "admin@lifedance.com";
const LEGACY_ADMIN_EMAIL = "admin@example.com";
const DEFAULT_ADMIN_USERNAME = "LifeDance 管理员";
const ADMIN_SEED_AUDIT_NAMESPACE = "lifedance_real_ops_v1";
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

type AdminSeedTransaction = Pick<Prisma.TransactionClient, "user" | "auditLog">;
type AdminSeedSessionRevoker = Pick<AuthSessionStore, "revokeAllRefreshTokens">;

interface MigrateAdminAccountOptions {
  adminConfig: AdminSeedConfig;
  adminPasswordHash: string;
  allocateBootstrapKey: <T>(create: (bootstrapKey: string) => Promise<T>) => Promise<T>;
}

export const migrateAdminAccount = async (
  tx: AdminSeedTransaction,
  options: MigrateAdminAccountOptions
) => {
  const candidates = await tx.user.findMany({
    where: {
      email: { in: [options.adminConfig.email, LEGACY_ADMIN_EMAIL] },
      deletedAt: null
    },
    select: {
      id: true,
      needoId: true,
      email: true,
      isActive: true
    }
  });
  const candidatesById = new Map<number, (typeof candidates)[number]>();

  for (const candidate of candidates) {
    const selected = candidatesById.get(candidate.id);
    if (!selected || candidate.email === options.adminConfig.email) {
      candidatesById.set(candidate.id, candidate);
    }
  }

  if (candidatesById.size > 1) {
    throw new Error("ADMIN_SEED_ACCOUNT_CONFLICT");
  }

  const existing = candidatesById.values().next().value as
    | (typeof candidates)[number]
    | undefined;
  const verifiedAt = new Date();
  const adminUser = existing
    ? await tx.user.update({
        where: { id: existing.id },
        data: {
          email: options.adminConfig.email,
          emailVerifiedAt: verifiedAt,
          passwordHash: options.adminPasswordHash,
          username: options.adminConfig.username,
          isTestAccount: true,
          isActive: true,
          sessionGeneration: { increment: 1 },
          deletedAt: null
        }
      })
    : await options.allocateBootstrapKey((bootstrapKey) =>
        tx.user.create({
          data: {
            needoId: bootstrapKey,
            email: options.adminConfig.email,
            emailVerifiedAt: verifiedAt,
            passwordHash: options.adminPasswordHash,
            username: options.adminConfig.username,
            isTestAccount: true,
            isActive: true
          }
        })
      );

  await tx.auditLog.create({
    data: {
      actorId: adminUser.id,
      action: "seed.admin_account.migrate",
      targetType: "User",
      targetId: adminUser.id,
      metadata: {
        namespace: ADMIN_SEED_AUDIT_NAMESPACE,
        oldEmail: existing?.email ?? null,
        newEmail: options.adminConfig.email,
        preservedNeedoId: adminUser.needoId
      }
    }
  });

  return adminUser;
};

export const revokeAdminSeedSessions = async (
  sessionRevoker: AdminSeedSessionRevoker,
  adminUserId: number,
  sessionGeneration: number
): Promise<void> => {
  await sessionRevoker.revokeAllRefreshTokens(adminUserId, sessionGeneration);
};

export interface SeedUserInput {
  email: string;
  username: string;
  phone?: string;
  avatarUrl?: string;
  createdAt?: Date;
  emailVerifiedAt?: Date;
}

interface SeedIdentityInput {
  userId: number;
  type: string;
  scopeType: string;
  scopeId: number | null;
  displayName: string;
  isDefault?: boolean;
  activeKey?: string;
}

interface SeedCoreReadOptions {
  seedRequiredTestAccounts: boolean;
  testUserPasswordHash: string | null;
}

type CoreReadFormalTestCategorySeed = {
  code: string;
  name: string;
  nameJa: string;
  nameEn: string;
  iconUrl: string;
  sortOrder: number;
};

type CoreReadFormalTestReviewSeed = {
  ratingAverage: string;
  reviewCount: number;
  highlights: string[];
};

type CoreReadFormalTestShopSeed = {
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
  review: CoreReadFormalTestReviewSeed;
};

type CoreReadFormalTestTechnicianSeed = {
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
  review: CoreReadFormalTestReviewSeed;
  service: {
    name: string;
    description: string;
    city: string;
    serviceMode: string;
    priceAmount: string;
    durationMinutes: number;
    coverUrl: string;
    review: CoreReadFormalTestReviewSeed;
  };
};

export const CORE_READ_FORMAL_TEST_CATEGORY_SEEDS: CoreReadFormalTestCategorySeed[] = [
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

export const CORE_READ_FORMAL_TEST_SHOP_SEEDS: CoreReadFormalTestShopSeed[] = [
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

const TAXONOMY_LOCALE_ENUM = {
  "zh-CN": "ZH_CN",
  "zh-TW": "ZH_TW",
  ja: "JA",
  en: "EN",
  ko: "KO"
} as const;

export const seedShopServiceTaxonomyCatalog = async (
  tx: Prisma.TransactionClient
): Promise<void> => {
  for (const categorySeed of SHOP_SERVICE_TAXONOMY) {
    const category = await tx.category.upsert({
      where: { code: categorySeed.code },
      create: {
        code: categorySeed.code,
        name: categorySeed.labels["zh-CN"],
        nameJa: categorySeed.labels.ja,
        nameEn: categorySeed.labels.en,
        qualificationPolicy: categorySeed.qualificationPolicy,
        sortOrder: categorySeed.sortOrder,
        isActive: true
      },
      update: {
        name: categorySeed.labels["zh-CN"],
        nameJa: categorySeed.labels.ja,
        nameEn: categorySeed.labels.en,
        qualificationPolicy: categorySeed.qualificationPolicy,
        sortOrder: categorySeed.sortOrder,
        isActive: true,
        deletedAt: null
      }
    });

    for (const locale of Object.keys(TAXONOMY_LOCALE_ENUM) as TaxonomyLocaleCode[]) {
      const localeEnum = TAXONOMY_LOCALE_ENUM[locale];
      await tx.categoryTranslation.upsert({
        where: {
          categoryId_locale: {
            categoryId: category.id,
            locale: localeEnum
          }
        },
        create: {
          categoryId: category.id,
          locale: localeEnum,
          name: categorySeed.labels[locale]
        },
        update: {
          name: categorySeed.labels[locale],
          deletedAt: null
        }
      });
    }

    for (const keywordSeed of categorySeed.keywords) {
      const keyword = await tx.businessKeyword.upsert({
        where: { code: keywordSeed.code },
        create: {
          code: keywordSeed.code,
          categoryId: category.id,
          qualificationPolicy: keywordSeed.qualificationPolicy,
          sortOrder: keywordSeed.sortOrder,
          isActive: true
        },
        update: {
          categoryId: category.id,
          qualificationPolicy: keywordSeed.qualificationPolicy,
          sortOrder: keywordSeed.sortOrder,
          isActive: true,
          deletedAt: null
        }
      });

      for (const locale of Object.keys(TAXONOMY_LOCALE_ENUM) as TaxonomyLocaleCode[]) {
        const localeEnum = TAXONOMY_LOCALE_ENUM[locale];
        await tx.businessKeywordTranslation.upsert({
          where: {
            businessKeywordId_locale: {
              businessKeywordId: keyword.id,
              locale: localeEnum
            }
          },
          create: {
            businessKeywordId: keyword.id,
            locale: localeEnum,
            label: keywordSeed.labels[locale]
          },
          update: {
            label: keywordSeed.labels[locale],
            deletedAt: null
          }
        });
      }
    }
  }
};

export const CORE_READ_FORMAL_TEST_TECHNICIAN_SEEDS: CoreReadFormalTestTechnicianSeed[] = [
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

const isEnabledSeedFlag = (value: string | undefined): boolean =>
  ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");

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
  env.NODE_ENV !== "production" &&
  (env.DEPLOY_ENV === "local" || env.DEPLOY_ENV === "test") &&
  isEnabledSeedFlag(env.ALLOW_TEST_LOGIN);

export const shouldSeedCoreReadFormalTestData = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env.NODE_ENV !== "production" &&
  (env.DEPLOY_ENV === "local" || env.DEPLOY_ENV === "test") &&
  isEnabledSeedFlag(env.ALLOW_FORMAL_TEST_SEED);

const createSeedPrismaClient = (): PrismaClient =>
  new PrismaClient({
    adapter: new PrismaMariaDb(getDatabaseUrl()),
    log: SEED_PRISMA_LOG_LEVELS
  });

export const buildSeedUserUpdateData = (input: SeedUserInput, passwordHash: string) => ({
  phone: input.phone ?? null,
  emailVerifiedAt: input.emailVerifiedAt ?? new Date(),
  passwordHash,
  username: input.username,
  ...(input.avatarUrl === undefined ? {} : { avatarUrl: input.avatarUrl }),
  isTestAccount: true,
  isActive: true,
  deletedAt: null
});

const ensureSeedCustomerFoundation = async (
  tx: Prisma.TransactionClient,
  input: { userId: number; displayName: string }
) => {
  const customerProfile = await tx.customerProfile.upsert({
    where: { userId: input.userId },
    create: { userId: input.userId, displayName: input.displayName },
    update: { deletedAt: null }
  });
  const existingIdentity = await tx.userIdentity.findFirst({
    where: { userId: input.userId, type: "customer", deletedAt: null },
    include: { publicIdentifier: true }
  });
  const identity = existingIdentity
    ? await tx.userIdentity.update({
        where: { id: existingIdentity.id },
        data: {
          displayName: input.displayName,
          isActive: true,
          isDefault: true,
          scopeId: customerProfile.id,
          scopeType: "customer_profile"
        },
        include: { publicIdentifier: true }
      })
    : await tx.userIdentity.create({
        data: {
          userId: input.userId,
          type: "customer",
          scopeType: "customer_profile",
          scopeId: customerProfile.id,
          displayName: input.displayName,
          isDefault: true,
          isActive: true
        },
        include: { publicIdentifier: true }
      });
  const identifier =
    identity.publicIdentifier?.kind === "U" &&
    identity.publicIdentifier.status === "ACTIVE" &&
    identity.publicIdentifier.deletedAt === null
      ? identity.publicIdentifier
      : await new IdentifierAllocator(new PublicIdentifierRepository(tx)).allocate({
          kind: "U",
          userIdentityId: identity.id
        });
  const customerRole = await tx.role.findFirst({
    where: { code: "customer", deletedAt: null },
    select: { id: true }
  });
  if (!customerRole) throw new Error("Seed requires the customer role before creating accounts.");
  await assignSeedRole(tx, {
    userId: input.userId,
    roleId: customerRole.id,
    scopeType: "customer_profile",
    scopeId: customerProfile.id
  });
  await tx.userExperienceAccount.upsert({
    where: { userId: input.userId },
    create: { userId: input.userId, currentLevel: 1, totalExpUnits: 0n },
    update: { deletedAt: null }
  });
  return tx.user.update({
    where: { id: input.userId },
    data: {
      accountNo: identifier.numberPart,
      needoId: identifier.publicId,
      primaryIdentityType: "U"
    }
  });
};

export const upsertSeedUser = async (
  tx: Prisma.TransactionClient,
  input: SeedUserInput,
  passwordHash: string
) => {
  const existing = await tx.user.findUnique({ where: { email: input.email } });
  if (existing?.primaryIdentityType === "NEEDO") {
    throw new Error(`Company NEEDO account cannot be reused as an ordinary seed user: ${input.email}`);
  }
  const user = existing
    ? await tx.user.update({
        where: { id: existing.id },
        data: buildSeedUserUpdateData(input, passwordHash)
      })
    : await bootstrapKeyAllocator.withNewKey((bootstrapKey) =>
        tx.user.create({
          data: {
            needoId: bootstrapKey,
            email: input.email,
            phone: input.phone ?? null,
            emailVerifiedAt: input.emailVerifiedAt ?? new Date(),
            passwordHash,
            username: input.username,
            avatarUrl: input.avatarUrl ?? null,
            isTestAccount: true,
            isActive: true,
            ...(input.createdAt ? { createdAt: input.createdAt } : {})
          }
        })
      );
  return ensureSeedCustomerFoundation(tx, { userId: user.id, displayName: input.username });
};

const upsertSeedIdentity = async (
  tx: Prisma.TransactionClient,
  input: SeedIdentityInput
) => {
  const existing = await tx.userIdentity.findFirst({
    where: {
      userId: input.userId,
      type: input.type,
      scopeType: input.scopeType,
      scopeId: input.scopeId
    }
  });

  const identity = existing
    ? await tx.userIdentity.update({
      where: { id: existing.id },
      data: {
        displayName: input.displayName,
        isDefault: input.isDefault ?? true,
        isActive: true,
        deletedAt: null,
        ...(input.activeKey ? { activeKey: input.activeKey } : {})
      },
      include: { publicIdentifier: true }
    })
    : await tx.userIdentity.create({
        data: {
          userId: input.userId,
          type: input.type,
          activeKey: input.activeKey,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          displayName: input.displayName,
          isDefault: input.isDefault ?? true,
          isActive: true
        },
        include: { publicIdentifier: true }
      });
  const aliasKind = ["technician", "service", "s"].includes(input.type)
    ? "S"
    : ["merchant", "merchant_owner", "merchant_staff", "business", "b"].includes(input.type)
      ? "B"
      : ["merchant_organization", "owner", "o"].includes(input.type)
        ? "O"
        : null;
  if (!aliasKind) return identity;
  if (identity.publicIdentifier && identity.publicIdentifier.kind !== aliasKind) {
    throw new Error(`Seed identity ${identity.id} has the wrong public identifier kind.`);
  }
  if (!identity.publicIdentifier) {
    await new IdentifierAllocator(new PublicIdentifierRepository(tx)).registerPersonAlias({
      kind: aliasKind,
      userIdentityId: identity.id
    });
  }
  return identity;
};

const ensureSeedShopIdentifiers = async (
  tx: Prisma.TransactionClient,
  shop: { id: number; name: string }
): Promise<void> => {
  const supportAccount = await tx.customerSupportAccount.upsert({
    where: { shopId: shop.id },
    create: { shopId: shop.id, type: "SHOP", displayName: `${shop.name} Customer Support` },
    update: { displayName: `${shop.name} Customer Support`, isActive: true, deletedAt: null },
    include: { publicIdentifier: true }
  });
  const persistedShop = await tx.shop.findUniqueOrThrow({
    where: { id: shop.id },
    include: { publicIdentifier: true }
  });
  if (persistedShop.publicIdentifier || supportAccount.publicIdentifier) {
    if (
      persistedShop.publicIdentifier?.kind !== "SHOP" ||
      supportAccount.publicIdentifier?.kind !== "CUSTOMER_SUPPORT" ||
      persistedShop.publicIdentifier.numberPart !== supportAccount.publicIdentifier.numberPart
    ) {
      throw new Error(`Shop ${shop.id} has an incomplete public identifier pair.`);
    }
    await tx.shop.update({
      where: { id: shop.id },
      data: { shopNo: persistedShop.publicIdentifier.numberPart }
    });
    return;
  }
  const pair = await new IdentifierAllocator(
    new PublicIdentifierRepository(tx)
  ).allocateShopSupportPair({ shopId: shop.id, customerSupportAccountId: supportAccount.id });
  await tx.shop.update({
    where: { id: shop.id },
    data: { shopNo: pair.shopIdentifier.numberPart }
  });
};

const ensureSeedMerchantIdentifier = async (
  tx: Prisma.TransactionClient,
  merchantAccountId: number
): Promise<void> => {
  const merchant = await tx.merchantAccount.findUniqueOrThrow({
    where: { id: merchantAccountId },
    include: { publicIdentifier: true }
  });
  if (merchant.publicIdentifier) {
    if (merchant.publicIdentifier.kind !== "OWNER") {
      throw new Error(`Merchant account ${merchant.id} has the wrong public identifier kind.`);
    }
    await tx.merchantAccount.update({
      where: { id: merchant.id },
      data: { ownerNo: merchant.publicIdentifier.numberPart }
    });
    return;
  }
  const identifier = await new IdentifierAllocator(
    new PublicIdentifierRepository(tx)
  ).allocate({ kind: "OWNER", merchantAccountId: merchant.id });
  await tx.merchantAccount.update({
    where: { id: merchant.id },
    data: { ownerNo: identifier.numberPart }
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

const upsertSeedCompanyUser = async (
  tx: Prisma.TransactionClient,
  input: SeedUserInput,
  passwordHash: string,
  roleByCode: Map<string, { id: number }>
) => {
  const existing = await tx.user.findUnique({ where: { email: input.email } });
  if (existing?.primaryIdentityType === "U") {
    throw new Error(`Ordinary U account cannot be converted into a company NEEDO account by Seed: ${input.email}`);
  }
  const provisional = existing
    ? await tx.user.update({
        where: { id: existing.id },
        data: buildSeedUserUpdateData(input, passwordHash)
      })
    : await bootstrapKeyAllocator.withNewKey((bootstrapKey) =>
        tx.user.create({
          data: {
            needoId: bootstrapKey,
            email: input.email,
            emailVerifiedAt: input.emailVerifiedAt ?? new Date(),
            passwordHash,
            username: input.username,
            avatarUrl: input.avatarUrl ?? null,
            isTestAccount: true,
            isActive: true,
            ...(input.createdAt ? { createdAt: input.createdAt } : {})
          }
        })
      );
  const existingPlatformIdentity = await tx.userIdentity.findFirst({
    where: { userId: provisional.id, type: "platform", deletedAt: null },
    include: { publicIdentifier: true }
  });
  const platformIdentity = existingPlatformIdentity
    ? await tx.userIdentity.update({
        where: { id: existingPlatformIdentity.id },
        data: { displayName: input.username, isActive: true, isDefault: true, deletedAt: null },
        include: { publicIdentifier: true }
      })
    : await tx.userIdentity.create({
        data: {
          userId: provisional.id,
          type: "platform",
          scopeType: "global",
          displayName: input.username,
          isDefault: true,
          isActive: true
        },
        include: { publicIdentifier: true }
      });
  if (platformIdentity.publicIdentifier && platformIdentity.publicIdentifier.kind !== "NEEDO") {
    throw new Error(`Company identity ${platformIdentity.id} has the wrong public identifier kind.`);
  }
  const identifier = platformIdentity.publicIdentifier ??
    await new IdentifierAllocator(new PublicIdentifierRepository(tx)).allocate({
      kind: "NEEDO",
      userIdentityId: platformIdentity.id
    });
  const user = await tx.user.update({
    where: { id: provisional.id },
    data: {
      accountNo: identifier.numberPart,
      needoId: identifier.publicId,
      primaryIdentityType: "NEEDO"
    }
  });
  const customerProfile = await tx.customerProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, displayName: input.username, isPublic: false },
    update: { displayName: input.username, isPublic: false, deletedAt: null }
  });
  await upsertSeedIdentity(tx, {
    userId: user.id,
    type: "customer",
    scopeType: "customer_profile",
    scopeId: customerProfile.id,
    displayName: input.username,
    isDefault: false
  });
  await assignSeedRole(tx, {
    userId: user.id,
    roleId: getRequiredRole(roleByCode, "customer").id,
    scopeType: "customer_profile",
    scopeId: customerProfile.id
  });
  return user;
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
        bio: "福岡で働く会社員です。休日はカフェ巡りと温泉、気になるウェルネスサービスを楽しんでいます。",
        city: "Tokyo",
        membershipLevel: "standard",
        isPublic: true
      },
      update: {
        displayName: input.username,
        bio: "福岡で働く会社員です。休日はカフェ巡りと温泉、気になるウェルネスサービスを楽しんでいます。",
        city: "Tokyo",
        membershipLevel: "standard",
        isPublic: true,
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

export const provisionRequiredTestAccountPortalData = async (
  tx: Prisma.TransactionClient,
  input: {
    identityType: TestUserAccountDefinition["identityType"];
    identityId: number;
    userId: number;
    username: string;
    shopId: number;
    scopeId: number | null;
  }
): Promise<void> => {
  if (input.identityType === "merchant") {
    await tx.merchantIdentityProfile.upsert({
      where: { identityId: input.identityId },
      create: {
        identityId: input.identityId,
        userId: input.userId,
        displayName: input.username,
        gender: "private",
        languages: [],
        bio: "Formal local merchant identity profile for portal acceptance.",
        visibility: "public"
      },
      update: {
        userId: input.userId,
        displayName: input.username,
        deletedAt: null
      }
    });
    return;
  }

  if (input.identityType !== "technician" || input.scopeId === null) return;

  const employmentStartedAt = new Date("2026-04-01T00:00:00.000Z");
  await tx.technicianProfile.update({
    where: { id: input.scopeId },
    data: {
      employmentType: TechnicianEmploymentType.FULL_TIME,
      employmentStartedAt
    }
  });

  const affiliationActiveKey = `technician:${input.scopeId}:shop:${input.shopId}`;
  await tx.technicianShopAffiliation.upsert({
    where: { activeKey: affiliationActiveKey },
    create: {
      technicianProfileId: input.scopeId,
      shopId: input.shopId,
      relationshipType: TechnicianShopRelationshipType.EXCLUSIVE,
      workStatus: TechnicianShopWorkStatus.ACTIVE,
      startsAt: employmentStartedAt,
      activeKey: affiliationActiveKey,
      createdById: input.userId,
      updatedById: input.userId
    },
    update: {
      relationshipType: TechnicianShopRelationshipType.EXCLUSIVE,
      workStatus: TechnicianShopWorkStatus.ACTIVE,
      startsAt: employmentStartedAt,
      endsAt: null,
      updatedById: input.userId,
      deletedAt: null
    }
  });

  const stableName = "Formal test technician income model";
  const existing = await tx.technicianCompensationProfile.findFirst({
    where: {
      shopId: input.shopId,
      technicianProfileId: input.scopeId,
      name: stableName
    },
    orderBy: [{ id: "desc" }]
  });
  const compensationData = {
    name: stableName,
    status: "active",
    version: 1,
    wageMode: "base_plus_commission",
    baseSalaryJpy: 280_000,
    hourlyRateJpy: 0,
    dailyRateJpy: 0,
    fixedOrderPayJpy: 0,
    commissionRateBps: 4_000,
    extensionCommissionRateBps: 5_500,
    nominationFeeJpy: 2_000,
    guaranteedMinimumJpy: 0,
    ndpFeeBearer: "shop",
    technicianNdpShareBps: 0,
    bonusRulesJson: [{ code: "formal_test_completion_bonus", enabled: true }],
    deductionRulesJson: [],
    effectiveFrom: employmentStartedAt,
    effectiveTo: null,
    updatedById: input.userId,
    deletedAt: null
  } satisfies Prisma.TechnicianCompensationProfileUncheckedUpdateInput;

  if (existing) {
    await tx.technicianCompensationProfile.update({
      where: { id: existing.id },
      data: compensationData
    });
    return;
  }
  await tx.technicianCompensationProfile.create({
    data: {
      shopId: input.shopId,
      technicianProfileId: input.scopeId,
      createdById: input.userId,
      ...compensationData
    }
  });
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
    const seedUserInput = {
      email: account.email,
      username: account.username,
      avatarUrl: account.avatarUrl
    };
    const user = account.primaryIdentifierKind === "NEEDO"
      ? await upsertSeedCompanyUser(tx, seedUserInput, input.passwordHash, input.roleByCode)
      : await upsertSeedUser(tx, seedUserInput, input.passwordHash);
    if (account.identityType === "platform") {
      if (account.primaryIdentifierKind === "U") {
        await upsertSeedIdentity(tx, {
          userId: user.id,
          type: "platform",
          scopeType: "global",
          scopeId: null,
          displayName: account.username,
          isDefault: false,
          activeKey: `test-account-identity:${user.id}:platform:global`
        });
      }
      await assignSeedRole(tx, {
        userId: user.id,
        roleId: getRequiredRole(input.roleByCode, account.roleCode).id,
        scopeType: "global",
        scopeId: null
      });
      continue;
    }
    const identity = await upsertTestAccountProfile(tx, {
      account,
      userId: user.id,
      username: account.username,
      shopId: input.shopId
    });

    const switchable = getTestAccountSwitchIdentityTypes(account.identityType).length > 1;
    const portalIdentity = await upsertSeedIdentity(tx, {
      userId: user.id,
      type: account.identityType,
      scopeType: identity.scopeType,
      scopeId: identity.scopeId,
      displayName: identity.displayName,
      isDefault: account.identityType === "customer"
    });
    await provisionRequiredTestAccountPortalData(tx, {
      identityType: account.identityType,
      identityId: portalIdentity.id,
      userId: user.id,
      username: account.username,
      shopId: input.shopId,
      scopeId: identity.scopeId
    });
    await assignSeedRole(tx, {
      userId: user.id,
      roleId: getRequiredRole(input.roleByCode, account.roleCode).id,
      scopeType: identity.scopeType,
      scopeId: identity.scopeId
    });

    if (switchable) {
      const customerProfile = await tx.customerProfile.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          displayName: account.username,
          bio: "Identity-switch acceptance profile for formal local and test accounts.",
          city: "Tokyo",
          membershipLevel: "standard",
          isPublic: true
        },
        update: {
          displayName: account.username,
          bio: "Identity-switch acceptance profile for formal local and test accounts.",
          city: "Tokyo",
          membershipLevel: "standard",
          isPublic: true,
          deletedAt: null
        }
      });
      await upsertSeedIdentity(tx, {
        userId: user.id,
        type: "customer",
        scopeType: "customer_profile",
        scopeId: customerProfile.id,
        displayName: account.username,
        isDefault: true,
        activeKey: `test-account-identity:${user.id}:customer:${customerProfile.id}`
      });
      await assignSeedRole(tx, {
        userId: user.id,
        roleId: getRequiredRole(input.roleByCode, "customer").id,
        scopeType: "customer_profile",
        scopeId: customerProfile.id
      });

      const technicianProfile =
        account.identityType === "technician"
          ? await tx.technicianProfile.findUniqueOrThrow({ where: { userId: user.id } })
          : await tx.technicianProfile.upsert({
              where: { userId: user.id },
              create: {
                userId: user.id,
                shopId: input.shopId,
                displayName: account.username,
                bio: "Identity-switch technician profile for the formal merchant test account.",
                city: "Tokyo",
                serviceArea: "Tokyo",
                yearsExperience: 0,
                status: "private",
                isRecommended: false
              },
              update: {
                shopId: input.shopId,
                displayName: account.username,
                bio: "Identity-switch technician profile for the formal merchant test account.",
                city: "Tokyo",
                serviceArea: "Tokyo",
                yearsExperience: 0,
                status: "private",
                isRecommended: false,
                deletedAt: null
              }
            });
      await upsertSeedIdentity(tx, {
        userId: user.id,
        type: "technician",
        scopeType: "technician_profile",
        scopeId: technicianProfile.id,
        displayName: account.username,
        isDefault: false,
        activeKey: `test-account-identity:${user.id}:technician:${technicianProfile.id}`
      });
      await assignSeedRole(tx, {
        userId: user.id,
        roleId: getRequiredRole(input.roleByCode, "technician").id,
        scopeType: "technician_profile",
        scopeId: technicianProfile.id
      });
      await upsertSeedIdentity(tx, {
        userId: user.id,
        type: "scout",
        scopeType: "global",
        scopeId: null,
        displayName: account.username,
        isDefault: false,
        activeKey: `test-account-identity:${user.id}:scout:global`
      });
      await assignSeedRole(tx, {
        userId: user.id,
        roleId: getRequiredRole(input.roleByCode, "scout").id,
        scopeType: "global",
        scopeId: null
      });
    }

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

const seedMerchantSaasBillingData = async (
  tx: Prisma.TransactionClient,
  input: {
    ownerUserId: number;
    shopBySlug: Map<string, { id: number }>;
  }
): Promise<void> => {
  const startsAt = new Date("2026-07-31T15:00:00.000Z");
  const trialEndsAt = new Date("2026-10-31T15:00:00.000Z");
  const invoicePeriodEndsAt = new Date("2026-11-30T15:00:00.000Z");
  const groupShopSeeds = CORE_READ_FORMAL_TEST_SHOP_SEEDS.slice(0, 4);
  const groupShops = groupShopSeeds.map((shopSeed) => {
    const linkedShop = input.shopBySlug.get(shopSeed.slug);

    if (!linkedShop) {
      throw new Error(`Merchant SaaS billing seed failed: missing shop ${shopSeed.slug}.`);
    }

    return { ...linkedShop, name: shopSeed.name };
  });
  const merchantAccount = await tx.merchantAccount.upsert({
    where: { code: "seed-tokyo-wellness-group" },
    create: {
      code: "seed-tokyo-wellness-group",
      ownerUserId: input.ownerUserId,
      name: "Tokyo Wellness Group",
      status: "active",
      paymentResponsibility: "group_consolidated"
    },
    update: {
      ownerUserId: input.ownerUserId,
      name: "Tokyo Wellness Group",
      status: "active",
      paymentResponsibility: "group_consolidated",
      deletedAt: null
    }
  });
  await ensureSeedMerchantIdentifier(tx, merchantAccount.id);
  await upsertSeedIdentity(tx, {
    userId: input.ownerUserId,
    type: "merchant_organization",
    scopeType: "merchant_account",
    scopeId: merchantAccount.id,
    displayName: "Tokyo Wellness Group",
    isDefault: false
  });

  for (const linkedShop of groupShops) {
    const activeKey = `merchant:${merchantAccount.id}:shop:${linkedShop.id}`;

    await tx.merchantShopMembership.upsert({
      where: { activeKey },
      create: {
        merchantAccountId: merchantAccount.id,
        shopId: linkedShop.id,
        activeKey,
        startsAt,
        createdById: input.ownerUserId
      },
      update: {
        merchantAccountId: merchantAccount.id,
        shopId: linkedShop.id,
        startsAt,
        endsAt: null,
        removedReason: null,
        createdById: input.ownerUserId,
        removedById: null,
        deletedAt: null
      }
    });
  }

  const groupProfile = await tx.saasBillingProfile.upsert({
    where: { activeKey: `merchant:${merchantAccount.id}` },
    create: {
      subjectType: "merchant_account",
      subjectId: merchantAccount.id,
      merchantAccountId: merchantAccount.id,
      activeKey: `merchant:${merchantAccount.id}`,
      billingCadence: "monthly",
      monthlyFeeJpy: 9800,
      trialStatus: "active",
      trialStartedAt: startsAt,
      trialEndsAt,
      trialUsedAt: startsAt,
      paymentProvider: "manual"
    },
    update: {
      merchantAccountId: merchantAccount.id,
      billingCadence: "monthly",
      monthlyFeeJpy: 9800,
      trialStatus: "active",
      trialStartedAt: startsAt,
      trialEndsAt,
      trialUsedAt: startsAt,
      paymentProvider: "manual",
      deletedAt: null
    }
  });

  await tx.saasFreePeriod.upsert({
    where: { idempotencyKey: `seed:free-period:merchant:${merchantAccount.id}:initial` },
    create: {
      billingProfileId: groupProfile.id,
      periodType: "initial_trial",
      startsAt,
      endsAt: trialEndsAt,
      reason: "First three natural-month free trial",
      idempotencyKey: `seed:free-period:merchant:${merchantAccount.id}:initial`,
      createdById: input.ownerUserId
    },
    update: {
      billingProfileId: groupProfile.id,
      startsAt,
      endsAt: trialEndsAt,
      reason: "First three natural-month free trial",
      createdById: input.ownerUserId,
      deletedAt: null
    }
  });

  const billableShopProfiles: Array<{
    shopId: number;
    name: string;
    billingProfileId: number;
  }> = [];

  for (const linkedShop of groupShops) {
    const technicianCount = await tx.technicianProfile.count({
      where: {
        shopId: linkedShop.id,
        status: "published",
        deletedAt: null
      }
    });
    const isBillable = technicianCount >= 2;
    const profile = await tx.saasBillingProfile.upsert({
      where: { activeKey: `shop:${linkedShop.id}` },
      create: {
        subjectType: "shop",
        subjectId: linkedShop.id,
        shopId: linkedShop.id,
        activeKey: `shop:${linkedShop.id}`,
        billingCadence: "monthly",
        monthlyFeeJpy: 9800,
        trialStatus: isBillable ? "active" : "not_started",
        trialStartedAt: isBillable ? startsAt : null,
        trialEndsAt: isBillable ? trialEndsAt : null,
        trialUsedAt: isBillable ? startsAt : null,
        paymentProvider: "manual"
      },
      update: {
        shopId: linkedShop.id,
        billingCadence: "monthly",
        monthlyFeeJpy: 9800,
        trialStatus: isBillable ? "active" : "not_started",
        trialStartedAt: isBillable ? startsAt : null,
        trialEndsAt: isBillable ? trialEndsAt : null,
        trialUsedAt: isBillable ? startsAt : null,
        paymentProvider: "manual",
        deletedAt: null
      }
    });

    if (!isBillable) {
      continue;
    }

    await tx.saasFreePeriod.upsert({
      where: { idempotencyKey: `seed:free-period:shop:${linkedShop.id}:initial` },
      create: {
        billingProfileId: profile.id,
        periodType: "initial_trial",
        startsAt,
        endsAt: trialEndsAt,
        reason: "First three natural-month free trial",
        idempotencyKey: `seed:free-period:shop:${linkedShop.id}:initial`,
        createdById: input.ownerUserId
      },
      update: {
        billingProfileId: profile.id,
        startsAt,
        endsAt: trialEndsAt,
        reason: "First three natural-month free trial",
        createdById: input.ownerUserId,
        deletedAt: null
      }
    });
    billableShopProfiles.push({
      shopId: linkedShop.id,
      name: linkedShop.name,
      billingProfileId: profile.id
    });
  }

  const invoiceAmountJpy = 9800 * (1 + billableShopProfiles.length);
  const invoice = await tx.saasInvoice.upsert({
    where: { idempotencyKey: `seed:invoice:merchant:${merchantAccount.id}:2026-11` },
    create: {
      invoiceNo: `SEED-SAAS-${merchantAccount.id}-202611`,
      payerType: "merchant_account",
      merchantAccountId: merchantAccount.id,
      billingCadence: "monthly",
      periodStartsAt: trialEndsAt,
      periodEndsAt: invoicePeriodEndsAt,
      dueAt: trialEndsAt,
      amountJpy: invoiceAmountJpy,
      status: "pending",
      paymentProvider: "manual",
      idempotencyKey: `seed:invoice:merchant:${merchantAccount.id}:2026-11`
    },
    update: {
      merchantAccountId: merchantAccount.id,
      periodStartsAt: trialEndsAt,
      periodEndsAt: invoicePeriodEndsAt,
      dueAt: trialEndsAt,
      amountJpy: invoiceAmountJpy,
      status: "pending",
      paymentProvider: "manual",
      deletedAt: null
    }
  });

  await tx.saasInvoiceLine.upsert({
    where: { idempotencyKey: `seed:invoice-line:${invoice.id}:merchant:${merchantAccount.id}` },
    create: {
      invoiceId: invoice.id,
      subjectType: "merchant_account",
      merchantAccountId: merchantAccount.id,
      description: merchantAccount.name,
      monthlyFeeJpy: 9800,
      amountJpy: 9800,
      periodStartsAt: trialEndsAt,
      periodEndsAt: invoicePeriodEndsAt,
      idempotencyKey: `seed:invoice-line:${invoice.id}:merchant:${merchantAccount.id}`
    },
    update: {
      description: merchantAccount.name,
      monthlyFeeJpy: 9800,
      amountJpy: 9800,
      periodStartsAt: trialEndsAt,
      periodEndsAt: invoicePeriodEndsAt,
      deletedAt: null
    }
  });

  for (const billableShop of billableShopProfiles) {
    await tx.saasInvoiceLine.upsert({
      where: { idempotencyKey: `seed:invoice-line:${invoice.id}:shop:${billableShop.shopId}` },
      create: {
        invoiceId: invoice.id,
        subjectType: "shop",
        shopId: billableShop.shopId,
        description: billableShop.name,
        monthlyFeeJpy: 9800,
        amountJpy: 9800,
        periodStartsAt: trialEndsAt,
        periodEndsAt: invoicePeriodEndsAt,
        idempotencyKey: `seed:invoice-line:${invoice.id}:shop:${billableShop.shopId}`
      },
      update: {
        description: billableShop.name,
        monthlyFeeJpy: 9800,
        amountJpy: 9800,
        periodStartsAt: trialEndsAt,
        periodEndsAt: invoicePeriodEndsAt,
        deletedAt: null
      }
    });
  }
};


const seedCoreReadData = async (
  tx: Prisma.TransactionClient,
  passwordHash: string,
  roleByCode: Map<string, { id: number }>,
  options: SeedCoreReadOptions
): Promise<void> => {
  const demoCategories: Category[] = [];

  for (const categorySeed of CORE_READ_FORMAL_TEST_CATEGORY_SEEDS) {
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
  const primaryShopSeed = CORE_READ_FORMAL_TEST_SHOP_SEEDS[0];
  const primaryTechnicianSeed = CORE_READ_FORMAL_TEST_TECHNICIAN_SEEDS[0];

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
  await ensureSeedShopIdentifiers(tx, shop);

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

  for (const shopSeed of CORE_READ_FORMAL_TEST_SHOP_SEEDS.slice(1)) {
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
    await ensureSeedShopIdentifiers(tx, demoShop);

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

  for (const [technicianIndex, technicianSeed] of CORE_READ_FORMAL_TEST_TECHNICIAN_SEEDS.slice(1).entries()) {
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

  await seedMerchantSaasBillingData(tx, {
    ownerUserId: shopOwner.id,
    shopBySlug
  });

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
  if (options.seedRequiredTestAccounts) {
    const formalScheduleTechnician = await tx.user.findUnique({
      where: { email: "technician@example.com" },
      include: { technicianProfile: true }
    });

    if (!formalScheduleTechnician?.technicianProfile) {
      throw new Error("Formal schedule seed failed: technician@example.com profile is missing.");
    }

    await upsertSeedTechnicianService(tx, {
      shopId: shop.id,
      technicianId: formalScheduleTechnician.technicianProfile.id,
      sourceShopServiceId: shiatsuService.id,
      name: `${shiatsuService.name} Test Technician Direct`,
      description: "Formal technician schedule service for local and test acceptance.",
      categoryId: shiatsuService.categoryId,
      priceAmount: toSeedJpyAmount(shiatsuService.priceAmount),
      currency: shiatsuService.currency,
      durationMinutes: shiatsuService.durationMinutes,
      coverImageUrl: primaryTechnicianSeed.service.coverUrl,
      createdBy: formalScheduleTechnician.id
    });
  }
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
      paymentMethod: ServicePaymentMethod.ONSITE,
      paymentStatus: ServicePaymentStatus.CONFIRMED,
      paymentAmountJpy: input.serviceAmountJpy,
      paymentConfirmedById: input.merchantUserId,
      paymentConfirmedAt: startsAt,
      paymentReference: "SEED-CASH-0001",
      paymentNote: "Formal seed onsite payment confirmation.",
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
      paymentMethod: ServicePaymentMethod.ONSITE,
      paymentStatus: ServicePaymentStatus.CONFIRMED,
      paymentAmountJpy: input.serviceAmountJpy,
      paymentConfirmedById: input.merchantUserId,
      paymentConfirmedAt: startsAt,
      paymentReference: "SEED-CASH-0001",
      paymentNote: "Formal seed onsite payment confirmation.",
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
      ndpCurrency: "TEST_NDP",
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
      ndpCurrency: "TEST_NDP",
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
        currency: "TEST_NDP"
      }
    },
    create: {
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      currency: "TEST_NDP"
    },
    update: {
      deletedAt: null
    }
  });

const upsertDefaultFinanceRules = async (
  tx: Prisma.TransactionClient,
  actorUserId: number
): Promise<void> => {
  const existingFamily = await tx.platformFeeRuleSet.findFirst({
    where: { familyCode: "booking_default", deletedAt: null },
    orderBy: { version: "desc" },
    select: { id: true }
  });

  if (existingFamily) {
    return;
  }

  const legacyRuleSet = await tx.platformFeeRuleSet.findFirst({
    where: {
      name: "Default Booking NDP Rules",
      familyCode: null,
      deletedAt: null
    },
    orderBy: { id: "asc" },
    select: { id: true }
  });

  if (legacyRuleSet) {
    await tx.platformFeeRuleSet.update({
      where: { id: legacyRuleSet.id },
      data: { familyCode: "booking_default" }
    });
    return;
  }

  const ruleSet = await tx.platformFeeRuleSet.create({
    data: {
      name: "Default Booking NDP Rules",
      description:
        "Default Booking platform fee, customer reward, and merchant cancellation compensation.",
      scopeType: "platform",
      familyCode: "booking_default",
      priority: 100,
      status: "active",
      version: 1,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      createdById: actorUserId,
      updatedById: actorUserId
    }
  });

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

export const calibrateTestNdpUserIds = async (
  userIds: readonly number[],
  service: Pick<TestNdpProvisioningService, "calibrateUser">
): Promise<void> => {
  for (const userId of new Set(userIds)) {
    await service.calibrateUser(userId);
  }
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
      currency: "TEST_NDP",
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
      currency: "TEST_NDP",
      status: "TEST_ONLY"
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
        currency: "TEST_NDP"
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
  prisma: PrismaClient = createSeedPrismaClient(),
  sessionRevoker: AdminSeedSessionRevoker = new RedisAuthSessionStore()
): Promise<void> => {
  const adminConfig = getAdminSeedConfig();
  const adminPasswordHash = await hash(adminConfig.password, BCRYPT_ROUNDS);
  const seedTestAccounts = shouldSeedRequiredTestAccounts();
  const seedCoreReadFormalTest = shouldSeedCoreReadFormalTestData();
  const testUserPasswordHash = seedTestAccounts
    ? await hash(getTestUserSeedPassword(), BCRYPT_ROUNDS)
    : null;
  const rolePermissionAssignments = buildRolePermissionAssignments();

  let adminUserId: number | null = null;
  let adminSessionGeneration: number | null = null;

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

    const provisionalAdmin = await migrateAdminAccount(tx, {
      adminConfig,
      adminPasswordHash,
      allocateBootstrapKey: (create) => bootstrapKeyAllocator.withNewKey(create)
    });

    const existingAdminIdentity = await tx.userIdentity.findFirst({
      where: {
        userId: provisionalAdmin.id,
        type: "platform",
        scopeType: "global",
        scopeId: null
      },
      include: { publicIdentifier: true }
    });
    const adminIdentity = existingAdminIdentity
      ? await tx.userIdentity.update({
        where: { id: existingAdminIdentity.id },
        data: {
          displayName: adminConfig.username,
          isDefault: true,
          isActive: true,
          deletedAt: null
        },
        include: { publicIdentifier: true }
      })
      : await tx.userIdentity.create({
        data: {
          userId: provisionalAdmin.id,
          type: "platform",
          scopeType: "global",
          displayName: adminConfig.username,
          isDefault: true,
          isActive: true
        },
        include: { publicIdentifier: true }
      });
    if (adminIdentity.publicIdentifier && adminIdentity.publicIdentifier.kind !== "NEEDO") {
      throw new Error("Admin platform identity is linked to a non-NEEDO public identifier.");
    }
    const adminIdentifier =
      adminIdentity.publicIdentifier?.status === "ACTIVE" &&
      adminIdentity.publicIdentifier.deletedAt === null
        ? adminIdentity.publicIdentifier
        : await new IdentifierAllocator(new PublicIdentifierRepository(tx)).allocate({
            kind: "NEEDO",
            userIdentityId: adminIdentity.id
          });
    const adminUser = await tx.user.update({
      where: { id: provisionalAdmin.id },
      data: {
        accountNo: adminIdentifier.numberPart,
        needoId: adminIdentifier.publicId,
        primaryIdentityType: "NEEDO"
      }
    });
    adminUserId = adminUser.id;
    adminSessionGeneration = adminUser.sessionGeneration;

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
          bio: "Default local test customer identity.",
          city: "Tokyo",
          membershipLevel: "standard",
          isPublic: false
        },
        update: {
          displayName: adminConfig.username,
          bio: "Default local test customer identity.",
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

    if (seedCoreReadFormalTest || seedTestAccounts) {
      await seedCoreReadData(tx, adminPasswordHash, roleByCode, {
        seedRequiredTestAccounts: seedTestAccounts,
        testUserPasswordHash
      });
    }

    await seedShopServiceTaxonomyCatalog(tx);
  });

  const testUsers = await prisma.user.findMany({
    where: { isTestAccount: true, deletedAt: null },
    select: { id: true },
    orderBy: { id: "asc" }
  });
  const [{ TestNdpProvisioningRepository }, { TestNdpProvisioningService }] = await Promise.all([
    import("../src/repositories/test-ndp-provisioning.repository"),
    import("../src/services/test-ndp-provisioning.service")
  ]);
  await calibrateTestNdpUserIds(
    testUsers.map((user) => user.id),
    new TestNdpProvisioningService(new TestNdpProvisioningRepository(prisma))
  );

  if (adminUserId === null || adminSessionGeneration === null) {
    throw new Error("ADMIN_SEED_ACCOUNT_MIGRATION_MISSING");
  }

  await revokeAdminSeedSessions(sessionRevoker, adminUserId, adminSessionGeneration);
};

const runSeed = async (): Promise<void> => {
  const prisma = createSeedPrismaClient();

  try {
    await seedUserManagement(prisma);
    console.log("User Management seed completed.");
  } finally {
    await Promise.all([prisma.$disconnect(), disconnectRedis()]);
  }
};

if (require.main === module) {
  runSeed().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
