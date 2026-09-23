import source from "./fixtures/stagingtest-public-source-20260924.json";
import { buildStagingTestFiveLocaleContent } from "./fixtures/build-stagingtest-five-locale-content";
import { CONTENT_LOCALES } from "../src/constants/content-locales";
import { prisma } from "../src/prisma/client";
import { ShopPresentationRepository } from "../src/repositories/shop-presentation.repository";

async function main() {
  if (!process.env.DATABASE_URL?.includes("/needo_localized_content_qa_")) {
    throw new Error("This check only writes to an isolated needo_localized_content_qa_ database.");
  }
  const content = buildStagingTestFiveLocaleContent(source);
  const shop = await prisma.shop.findUniqueOrThrow({ where: { id: 1 }, include: { services: { where: { deletedAt: null }, orderBy: { id: "asc" } } } });
  if (shop.shopNo !== "7473790479" || shop.services.length !== 3 || shop.ownerUserId !== 34) {
    throw new Error("The isolated seed shop does not match the expected local fixture.");
  }
  const serviceIds = shop.services.map((service) => service.id);
  const sourceMenus = source.shop.presentationContent.serviceMenus;
  const assets = await prisma.mediaAsset.findMany({ where: { serviceId: { in: serviceIds } }, orderBy: { id: "asc" } });
  if (assets.length !== 3) throw new Error("The isolated seed shop needs three service images.");

  await prisma.$transaction(async (transaction) => {
    await transaction.shop.update({
      where: { id: shop.id },
      data: {
        name: source.shop.name,
        description: source.shop.description,
        city: source.shop.presentationContent.area,
        address: source.shop.presentationContent.address,
        pricingMode: "TECHNICIAN"
      }
    });
    for (let index = 0; index < sourceMenus.length; index += 1) {
      const menu = sourceMenus[index]!;
      const localServiceId = serviceIds[index]!;
      const durationMinutes = Number(menu.name.match(/(\d+)分/u)?.[1]);
      if (!Number.isInteger(durationMinutes) || durationMinutes < 1) throw new Error(`Invalid source duration: ${menu.name}`);
      await transaction.service.update({ where: { id: localServiceId }, data: { name: menu.name, description: menu.description, durationMinutes } });
      const asset = assets.find((row) => row.serviceId === localServiceId)!;
      await transaction.mediaAsset.update({
        where: { id: asset.id },
        data: { shopId: shop.id, checksumSha256: menu.coverMediaAssetPublicId, altText: menu.name }
      });
    }
    const technician = content.technicians[0]!;
    const firstService = technician.services[0]!;
    await transaction.technicianProfile.update({
      where: { id: 1 },
      data: { bio: source.technicians[0]!.bio, bioLocalesJson: technician.bioLocales }
    });
    await transaction.technicianService.update({
      where: { id: 1 },
      data: {
        name: firstService.sourceName,
        description: source.technicians[0]!.services[0]!.description,
        localizedContentJson: firstService.localizedContent
      }
    });
    const blankBioTechnician = content.technicians.find((item) => item.id === 145)!;
    const blankBioService = blankBioTechnician.services[0]!;
    await transaction.technicianProfile.update({
      where: { id: 22 },
      data: { bio: null, bioLocalesJson: blankBioTechnician.bioLocales }
    });
    await transaction.technicianService.update({
      where: { id: 2 },
      data: {
        name: blankBioService.sourceName,
        description: source.technicians.find((item) => item.id === 145)!.services[0]!.description,
        localizedContentJson: blankBioService.localizedContent
      }
    });
  });

  const ownerIdentity = await prisma.userIdentity.findFirstOrThrow({ where: { userId: 34, type: "merchant", isActive: true } });
  const repository = new ShopPresentationRepository(prisma);
  for (const locale of CONTENT_LOCALES) {
    const original = content.shopLocales[locale];
    const mapped = {
      ...original,
      serviceMenus: original.serviceMenus.map((menu, index) => ({ ...menu, serviceId: serviceIds[index]! }))
    };
    const workspace = await repository.getWorkspace(shop.id);
    await repository.updateLocale({
      shopId: shop.id,
      locale,
      expectedLockVersion: workspace.locales[locale].lockVersion,
      content: mapped,
      actorUserId: 34,
      actorIdentityId: ownerIdentity.id,
      context: { ip: "127.0.0.1", userAgent: "localized-content-local-check" },
      updatedAt: new Date()
    });
  }
  const saved = await repository.getWorkspace(shop.id);
  for (const locale of CONTENT_LOCALES) {
    if (saved.locales[locale].lockVersion < 1 || saved.locales[locale].content.serviceMenus.length !== 3) {
      throw new Error(`Local shop locale ${locale} was not saved`);
    }
  }
  console.log(JSON.stringify({ shopId: shop.id, shopNo: shop.shopNo, locales: CONTENT_LOCALES, technicianProfileIds: [1, 22], technicianServiceIds: [1, 2] }));
}

main().finally(() => prisma.$disconnect());
