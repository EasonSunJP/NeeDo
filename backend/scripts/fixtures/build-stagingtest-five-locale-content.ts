import { CONTENT_LOCALES, type ContentLocaleCode } from "../../src/constants/content-locales";
import { shopPresentationContentSchema, type ShopPresentationContent } from "../../src/validators/shop-presentation.validator";
import baseline from "./stagingtest-public-source-20260924.json";
import {
  stagingTestBioCopy,
  stagingTestEmptyBioCopy,
  stagingTestEmptyBioPublicIds,
  stagingTestServiceCopy,
  stagingTestShopCopy,
  stagingTestShopPublicId,
  stagingTestSourceDescription,
  stagingTestSourceShopName
} from "./stagingtest-five-locale-copy";

type TechnicianSource = {
  id: number;
  publicId: string;
  name: string;
  bio: string | null;
  services: Array<{ id: number; name: string; description: string }>;
};

export type StagingTestSource = {
  shop: {
    id: number;
    publicId: string;
    name: string;
    description: string;
    presentationContent: ShopPresentationContent;
  };
  technicians: TechnicianSource[];
};

const translatedLocales = CONTENT_LOCALES.filter((locale) => locale !== "ja") as Exclude<ContentLocaleCode, "ja">[];

function requireSource(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`StagingTest source changed: ${message}`);
}

export function buildStagingTestFiveLocaleContent(source: StagingTestSource) {
  const { shop, technicians } = source;
  requireSource(shop.publicId === stagingTestShopPublicId, "shop public ID");
  requireSource(shop.name === stagingTestSourceShopName, "shop name");
  requireSource(shop.description === stagingTestSourceDescription, "shop description");
  const japanese = shopPresentationContentSchema.parse(shop.presentationContent);
  requireSource(japanese.storeName === shop.name && japanese.description === shop.description, "Japanese presentation");
  requireSource(japanese.serviceMenus.length === 3, "shop service menu count");
  requireSource(technicians.length === 26, "technician count");
  requireSource(technicians.every((technician) => technician.services.length === 2), "technician service count");
  for (const menu of japanese.serviceMenus) {
    const original = baseline.shop.presentationContent.serviceMenus.find((item) => item.serviceId === menu.serviceId);
    requireSource(original && JSON.stringify({ name: menu.name, description: menu.description, audience: menu.audience, tags: menu.tags, highlights: menu.highlights }) ===
      JSON.stringify({ name: original.name, description: original.description, audience: original.audience, tags: original.tags, highlights: original.highlights }),
    `shop menu ${menu.serviceId} text`);
  }

  const menuNames = japanese.serviceMenus.map((menu) => menu.name);
  requireSource(new Set(menuNames).size === 3, "shop menu names");
  for (const locale of translatedLocales) {
    requireSource(Object.keys(stagingTestShopCopy[locale].menus).length === menuNames.length, `${locale} menu catalog count`);
    for (const menu of japanese.serviceMenus) {
      requireSource(menu.name in stagingTestShopCopy[locale].menus, `${locale} menu ${menu.name}`);
    }
  }

  const shopLocales = { ja: japanese } as Record<ContentLocaleCode, ShopPresentationContent>;
  for (const locale of translatedLocales) {
    const copy = stagingTestShopCopy[locale];
    const menus: Record<string, (typeof copy.menus)[keyof typeof copy.menus]> = copy.menus;
    shopLocales[locale] = shopPresentationContentSchema.parse({
      ...japanese,
      storeName: shop.name,
      description: copy.description,
      address: copy.address,
      area: copy.area,
      businessHours: copy.businessHours,
      subtitle: copy.subtitle,
      station: copy.station,
      distance: copy.distance,
      parking: copy.parking,
      routeGuide: copy.routeGuide,
      paymentMethods: copy.paymentMethods,
      equipment: copy.equipment,
      carousel: japanese.carousel.map((slide) => ({
        ...slide,
        altText: menus[slide.altText]?.name ?? slide.altText
      })),
      serviceMenus: japanese.serviceMenus.map((menu) => ({
        ...menu,
        ...menus[menu.name]
      }))
    });
  }

  const seenServiceNames = new Set<string>();
  const seenBioTexts = new Set<string>();
  const seenEmptyBioIds = new Set<string>();
  const technicianLocales = technicians.map((technician) => {
    const original = baseline.technicians.find((item) => item.publicId === technician.publicId);
    requireSource(original && original.bio === technician.bio && original.name === technician.name, `technician ${technician.publicId} identity/bio`);
    requireSource(technician.services.every((service) => original.services.some((item) => item.id === service.id && item.name === service.name && item.description === service.description)),
      `technician ${technician.publicId} service text`);
    if (technician.bio) {
      seenBioTexts.add(technician.bio);
      requireSource(technician.bio in stagingTestBioCopy, `technician bio for ${technician.publicId}`);
    } else {
      seenEmptyBioIds.add(technician.publicId);
      requireSource(stagingTestEmptyBioPublicIds.includes(technician.publicId as typeof stagingTestEmptyBioPublicIds[number]), `empty bio for ${technician.publicId}`);
    }
    const bioLocales: Partial<Record<ContentLocaleCode, string>> = technician.bio
      ? { ja: technician.bio, ...stagingTestBioCopy[technician.bio as keyof typeof stagingTestBioCopy] }
      : { ...stagingTestEmptyBioCopy };
    const services = technician.services.map((service) => {
      seenServiceNames.add(service.name);
      requireSource(service.name in stagingTestServiceCopy, `technician service ${service.name}`);
      const copy = stagingTestServiceCopy[service.name as keyof typeof stagingTestServiceCopy];
      return {
        id: service.id,
        sourceName: service.name,
        localizedContent: {
          ja: { name: service.name, description: service.description },
          ...copy
        }
      };
    });
    return { id: technician.id, publicId: technician.publicId, name: technician.name, bioLocales, services };
  });
  requireSource(seenServiceNames.size === Object.keys(stagingTestServiceCopy).length, "technician service catalog count");
  requireSource(seenBioTexts.size === Object.keys(stagingTestBioCopy).length, "technician bio catalog count");
  requireSource(seenEmptyBioIds.size === stagingTestEmptyBioPublicIds.length, "empty bio profile count");

  return {
    shopId: shop.id,
    shopPublicId: shop.publicId,
    shopLocales,
    technicians: technicianLocales,
    counts: {
      shopLocales: CONTENT_LOCALES.length,
      shopMenus: japanese.serviceMenus.length,
      technicians: technicians.length,
      techniciansWithBio: technicians.filter((technician) => Boolean(technician.bio)).length,
      techniciansWithoutBio: technicians.filter((technician) => !technician.bio).length,
      technicianServices: technicianLocales.reduce((sum, technician) => sum + technician.services.length, 0)
    }
  };
}
