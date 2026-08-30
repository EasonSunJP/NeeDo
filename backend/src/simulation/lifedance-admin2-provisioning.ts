export const LIFEDANCE_ADMIN2_PLAN = {
  email: "admina@lifedance.com",
  legacyEmails: ["admin2@lifedance.com"],
  needoId: "needo0000000002",
  numberPart: "0000000002",
  displayName: "LifeDance 管理员 2",
  avatarUrl: "/images/generated/profiles/ai-profile-29.jpg",
  shopName: "麻布十番超级按摩",
  shopDescription:
    "麻布十番駅周辺の予約制マッサージとボディケア店舗です。日本語・中文・Englishでご案内します。",
  shopCity: "東京都",
  shopAddress: "東京都港区麻布十番2丁目",
  shopPhone: "050-9101-1002",
  merchantCode: "lifedance-azabujuban-super-massage",
  friendCount: 20,
  identityTypes: [
    "platform",
    "customer",
    "technician",
    "merchant_owner",
    "merchant_organization",
    "scout"
  ],
  roleCodes: ["admin", "customer", "technician", "merchant_owner", "scout"]
} as const;

export interface Admin2FriendCandidate {
  id: number;
  email: string;
  needoId: string;
}

export interface Admin2AccountCandidate {
  id: number;
  email: string;
  needoId: string;
  accountNo: string | null;
  sessionGeneration: number;
}

export interface LifeDanceAdmin2ProvisioningResult {
  userId: number;
  shopId: number;
  technicianProfileId: number;
  merchantAccountId: number;
  friendUserIds: number[];
  sessionGeneration: number;
}

const FORMAL_SIMULATION_EMAIL_PATTERN = /^sim\.[a-z0-9-]+\.\d{3}@needo\.local$/i;

export const selectAdmin2FriendTargets = (
  candidates: readonly Admin2FriendCandidate[]
): Admin2FriendCandidate[] => {
  const selected = candidates
    .filter((candidate) => FORMAL_SIMULATION_EMAIL_PATTERN.test(candidate.email))
    .sort((left, right) => left.email.localeCompare(right.email, "en"))
    .slice(0, LIFEDANCE_ADMIN2_PLAN.friendCount);

  if (selected.length !== LIFEDANCE_ADMIN2_PLAN.friendCount) {
    throw new Error(
      `LifeDance admin2 provisioning requires ${LIFEDANCE_ADMIN2_PLAN.friendCount} active formal simulation accounts.`
    );
  }

  return selected;
};

export const assertLocalAdmin2ProvisioningTarget = (env: {
  NODE_ENV?: string;
  DEPLOY_ENV?: string;
  DATABASE_URL?: string;
}): void => {
  const fail = (): never => {
    throw new Error("LifeDance admin2 provisioning is allowed only for local needo_dev MySQL.");
  };

  if (env.NODE_ENV === "production" || env.DEPLOY_ENV === "prod") {
    fail();
  }
  const databaseUrlValue = env.DATABASE_URL;
  if (!databaseUrlValue) return fail();

  let databaseUrl: URL | null = null;
  try {
    databaseUrl = new URL(databaseUrlValue);
  } catch {
    fail();
  }

  if (
    !databaseUrl ||
    databaseUrl.protocol !== "mysql:" ||
    !["127.0.0.1", "localhost", "::1"].includes(databaseUrl.hostname) ||
    databaseUrl.pathname.replace(/^\//, "") !== "needo_dev"
  ) {
    fail();
  }
};

const activeIdentityKey = (
  userId: number,
  type: string,
  scopeType: string,
  scopeId: number | null
): string => ["lifedance-admin2-identity", userId, type, scopeType, scopeId ?? "global"].join(":");

const assert: (condition: unknown, message: string) => asserts condition = (
  condition,
  message
) => {
  if (!condition) throw new Error(message);
};

export const selectAdmin2AccountCandidate = (
  candidates: readonly Admin2AccountCandidate[]
): Admin2AccountCandidate | null => {
  const uniqueCandidates = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  assert(
    uniqueCandidates.size <= 1,
    "LifeDance admin2 canonical and legacy emails belong to different users."
  );
  const candidate = [...uniqueCandidates.values()][0] ?? null;
  if (candidate) {
    assert(
      candidate.needoId === LIFEDANCE_ADMIN2_PLAN.needoId &&
        candidate.accountNo === LIFEDANCE_ADMIN2_PLAN.numberPart,
      "LifeDance admin2 email belongs to a different fixed account."
    );
  }
  return candidate;
};

export const resolveLifeDanceAdmin2Password = (env: {
  LIFEDANCE_ADMIN2_PASSWORD?: string;
  TEST_USER_DEFAULT_PASSWORD?: string;
}): string => {
  const password = env.LIFEDANCE_ADMIN2_PASSWORD?.trim();
  assert(password, "LIFEDANCE_ADMIN2_PASSWORD is required for LifeDance admin2.");
  return password;
};

export const buildLifeDanceAdmin2UserData = (
  passwordHash: string,
  sessionGeneration: number
) => ({
  email: LIFEDANCE_ADMIN2_PLAN.email,
  needoId: LIFEDANCE_ADMIN2_PLAN.needoId,
  accountNo: LIFEDANCE_ADMIN2_PLAN.numberPart,
  primaryIdentityType: PrimaryIdentityType.NEEDO,
  passwordHash,
  username: LIFEDANCE_ADMIN2_PLAN.displayName,
  avatarUrl: LIFEDANCE_ADMIN2_PLAN.avatarUrl,
  emailVerifiedAt: new Date("2026-08-29T00:00:00.000Z"),
  isTestAccount: true,
  isActive: true,
  sessionGeneration,
  deletedAt: null
});

export const calibrateLifeDanceAdmin2TestNdp = async (
  userId: number,
  service: { calibrateUser(userId: number): Promise<unknown> }
): Promise<void> => {
  await service.calibrateUser(userId);
};

const ensureIdentity = async (
  tx: Prisma.TransactionClient,
  input: {
    userId: number;
    type: string;
    scopeType: string;
    scopeId: number | null;
    displayName: string;
    isDefault: boolean;
  }
) => {
  const existing = await tx.userIdentity.findFirst({
    where: {
      userId: input.userId,
      type: input.type,
      scopeType: input.scopeType,
      scopeId: input.scopeId
    }
  });
  const data = {
    displayName: input.displayName,
    isDefault: input.isDefault,
    isActive: true,
    activeKey: activeIdentityKey(
      input.userId,
      input.type,
      input.scopeType,
      input.scopeId
    ),
    deletedAt: null
  };

  return existing
    ? tx.userIdentity.update({ where: { id: existing.id }, data })
    : tx.userIdentity.create({
        data: {
          userId: input.userId,
          type: input.type,
          scopeType: input.scopeType,
          scopeId: input.scopeId,
          ...data
        }
      });
};

const ensureRole = async (
  tx: Prisma.TransactionClient,
  input: {
    userId: number;
    roleId: number;
    scopeType: string;
    scopeId: number | null;
  }
): Promise<void> => {
  const existing = await tx.userRole.findFirst({ where: input });
  if (existing) {
    await tx.userRole.update({ where: { id: existing.id }, data: { deletedAt: null } });
    return;
  }
  await tx.userRole.create({ data: input });
};

const ensureFixedIdentifier = async (
  tx: Prisma.TransactionClient,
  input: {
    kind: PublicIdentifierKind;
    publicId: string;
    numberPart: string;
    userIdentityId: number;
  }
): Promise<void> => {
  const existing = await tx.publicIdentifier.findFirst({
    where: {
      OR: [
        { publicId: input.publicId },
        { kind: input.kind, numberPart: input.numberPart },
        { userIdentityId: input.userIdentityId }
      ]
    }
  });

  if (existing) {
    assert(
      existing.publicId === input.publicId &&
        existing.kind === input.kind &&
        existing.numberPart === input.numberPart &&
        existing.userIdentityId === input.userIdentityId,
      `Identifier conflict while provisioning ${input.publicId}.`
    );
    await tx.publicIdentifier.update({
      where: { id: existing.id },
      data: {
        loginAllowed: true,
        searchable: true,
        status: PublicIdentifierStatus.ACTIVE,
        deletedAt: null
      }
    });
    return;
  }

  await tx.publicIdentifier.create({
    data: {
      publicId: input.publicId,
      numberPart: input.numberPart,
      kind: input.kind,
      userIdentityId: input.userIdentityId,
      loginAllowed: true,
      searchable: true,
      status: PublicIdentifierStatus.ACTIVE
    }
  });
};

const ensureBidirectionalContact = async (
  tx: Prisma.TransactionClient,
  leftUserId: number,
  rightUserId: number
): Promise<void> => {
  for (const [ownerUserId, contactUserId] of [
    [leftUserId, rightUserId],
    [rightUserId, leftUserId]
  ] as const) {
    const [ownerIdentity, contactIdentity] = await Promise.all([
      tx.userIdentity.findFirst({
        where: { userId: ownerUserId, isActive: true, deletedAt: null },
        orderBy: [{ isDefault: "desc" }, { id: "asc" }],
        select: { id: true }
      }),
      tx.userIdentity.findFirst({
        where: { userId: contactUserId, isActive: true, deletedAt: null },
        orderBy: [{ isDefault: "desc" }, { id: "asc" }],
        select: { id: true }
      })
    ]);
    if (!ownerIdentity || !contactIdentity) {
      throw new Error("LifeDance admin contact identities are missing");
    }
    await tx.contact.upsert({
      where: {
        ownerIdentityId_contactIdentityId: {
          ownerIdentityId: ownerIdentity.id,
          contactIdentityId: contactIdentity.id
        }
      },
      create: {
        ownerUserId,
        ownerIdentityId: ownerIdentity.id,
        contactUserId,
        contactIdentityId: contactIdentity.id,
        source: "lifedance_admin2_seed"
      },
      update: {
        source: "lifedance_admin2_seed",
        blockedAt: null,
        deletedAt: null
      }
    });
  }
};

export const provisionLifeDanceAdmin2 = async (
  tx: Prisma.TransactionClient,
  passwordHash: string
): Promise<LifeDanceAdmin2ProvisioningResult> => {
  assert(passwordHash.length > 0, "LifeDance admin2 password hash is required.");

  const admin = await tx.user.findUnique({
    where: { email: "admin@lifedance.com" },
    select: { id: true, isActive: true, deletedAt: true }
  });
  assert(admin?.isActive && !admin.deletedAt, "Active LifeDance administrator is required.");

  const accountCandidates = await tx.user.findMany({
    where: {
      email: {
        in: [LIFEDANCE_ADMIN2_PLAN.email, ...LIFEDANCE_ADMIN2_PLAN.legacyEmails]
      }
    },
    select: {
      id: true,
      email: true,
      needoId: true,
      accountNo: true,
      sessionGeneration: true
    }
  });
  const existingUser = selectAdmin2AccountCandidate(accountCandidates);

  const conflictingUser = await tx.user.findFirst({
    where: {
      OR: [
        { needoId: LIFEDANCE_ADMIN2_PLAN.needoId },
        { accountNo: LIFEDANCE_ADMIN2_PLAN.numberPart }
      ],
      ...(existingUser ? { id: { not: existingUser.id } } : {})
    },
    select: { id: true }
  });
  assert(!conflictingUser, "The requested LifeDance admin2 NeeDo ID is already assigned.");

  const sessionGeneration = existingUser ? existingUser.sessionGeneration + 1 : 0;
  const userData = buildLifeDanceAdmin2UserData(passwordHash, sessionGeneration);
  const user = existingUser
    ? await tx.user.update({
        where: { id: existingUser.id },
        data: userData
      })
    : await tx.user.create({
        data: userData
      });

  const existingShop = await tx.shop.findFirst({
    where: { name: LIFEDANCE_ADMIN2_PLAN.shopName },
    select: { id: true, ownerUserId: true }
  });
  assert(
    !existingShop?.ownerUserId || existingShop.ownerUserId === user.id,
    "The requested LifeDance admin2 shop belongs to another user."
  );
  const shopData = {
    ownerUserId: user.id,
    name: LIFEDANCE_ADMIN2_PLAN.shopName,
    description: LIFEDANCE_ADMIN2_PLAN.shopDescription,
    city: LIFEDANCE_ADMIN2_PLAN.shopCity,
    address: LIFEDANCE_ADMIN2_PLAN.shopAddress,
    latitude: 35.6546,
    longitude: 139.7366,
    phone: LIFEDANCE_ADMIN2_PLAN.shopPhone,
    status: "published",
    isRecommended: true,
    pricingMode: ShopPricingMode.MERCHANT,
    pricingModeUpdatedBy: user.id,
    pricingModeUpdatedAt: new Date("2026-08-29T00:00:00.000Z"),
    deletedAt: null
  } as const;
  const shop = existingShop
    ? await tx.shop.update({ where: { id: existingShop.id }, data: shopData })
    : await tx.shop.create({ data: shopData });

  const customerProfile = await tx.customerProfile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      displayName: LIFEDANCE_ADMIN2_PLAN.displayName,
      bio: "LifeDance の運営、店舗予約、サービス品質確認に使用する正式テストプロフィールです。",
      city: LIFEDANCE_ADMIN2_PLAN.shopCity,
      membershipLevel: "standard",
      isPublic: true,
      languages: ["ja", "zh", "en"],
      visibility: "public"
    },
    update: {
      displayName: LIFEDANCE_ADMIN2_PLAN.displayName,
      bio: "LifeDance の運営、店舗予約、サービス品質確認に使用する正式テストプロフィールです。",
      city: LIFEDANCE_ADMIN2_PLAN.shopCity,
      membershipLevel: "standard",
      isPublic: true,
      languages: ["ja", "zh", "en"],
      visibility: "public",
      deletedAt: null
    }
  });
  const technicianProfile = await tx.technicianProfile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      shopId: shop.id,
      displayName: LIFEDANCE_ADMIN2_PLAN.displayName,
      bio: "ボディケアとリラクゼーションの施術、店舗運営、日中英での接客に対応します。",
      city: LIFEDANCE_ADMIN2_PLAN.shopCity,
      serviceArea: "港区・麻布十番",
      yearsExperience: 8,
      employmentType: TechnicianEmploymentType.FULL_TIME,
      employmentStartedAt: new Date("2026-08-29T00:00:00.000Z"),
      status: "published",
      isRecommended: true,
      verifiedAt: new Date("2026-08-29T00:00:00.000Z")
    },
    update: {
      shopId: shop.id,
      displayName: LIFEDANCE_ADMIN2_PLAN.displayName,
      bio: "ボディケアとリラクゼーションの施術、店舗運営、日中英での接客に対応します。",
      city: LIFEDANCE_ADMIN2_PLAN.shopCity,
      serviceArea: "港区・麻布十番",
      yearsExperience: 8,
      employmentType: TechnicianEmploymentType.FULL_TIME,
      employmentStartedAt: new Date("2026-08-29T00:00:00.000Z"),
      status: "published",
      isRecommended: true,
      verifiedAt: new Date("2026-08-29T00:00:00.000Z"),
      deletedAt: null
    }
  });

  const merchantAccount = await tx.merchantAccount.upsert({
    where: { code: LIFEDANCE_ADMIN2_PLAN.merchantCode },
    create: {
      code: LIFEDANCE_ADMIN2_PLAN.merchantCode,
      ownerUserId: user.id,
      name: LIFEDANCE_ADMIN2_PLAN.shopName,
      status: "active",
      paymentResponsibility: "shop_individual"
    },
    update: {
      ownerUserId: user.id,
      name: LIFEDANCE_ADMIN2_PLAN.shopName,
      status: "active",
      paymentResponsibility: "shop_individual",
      deletedAt: null
    }
  });
  const membershipActiveKey = `merchant:${merchantAccount.id}:shop:${shop.id}`;
  await tx.merchantShopMembership.upsert({
    where: { activeKey: membershipActiveKey },
    create: {
      merchantAccountId: merchantAccount.id,
      shopId: shop.id,
      activeKey: membershipActiveKey,
      startsAt: new Date("2026-08-29T00:00:00.000Z"),
      createdById: user.id
    },
    update: {
      endsAt: null,
      removedReason: null,
      removedById: null,
      deletedAt: null
    }
  });
  const billingActiveKey = `merchant:${merchantAccount.id}`;
  await tx.saasBillingProfile.upsert({
    where: { activeKey: billingActiveKey },
    create: {
      subjectType: "merchant_account",
      subjectId: merchantAccount.id,
      merchantAccountId: merchantAccount.id,
      activeKey: billingActiveKey,
      billingCadence: "monthly",
      monthlyFeeJpy: 9800,
      trialStatus: "not_started",
      paymentProvider: "manual"
    },
    update: {
      subjectType: "merchant_account",
      subjectId: merchantAccount.id,
      merchantAccountId: merchantAccount.id,
      shopId: null,
      deletedAt: null
    }
  });

  const affiliationActiveKey = `technician:${technicianProfile.id}:shop:${shop.id}`;
  await tx.technicianShopAffiliation.upsert({
    where: { activeKey: affiliationActiveKey },
    create: {
      technicianProfileId: technicianProfile.id,
      shopId: shop.id,
      relationshipType: TechnicianShopRelationshipType.EXCLUSIVE,
      workStatus: TechnicianShopWorkStatus.ACTIVE,
      startsAt: new Date("2026-08-29T00:00:00.000Z"),
      activeKey: affiliationActiveKey,
      createdById: user.id,
      updatedById: user.id
    },
    update: {
      relationshipType: TechnicianShopRelationshipType.EXCLUSIVE,
      workStatus: TechnicianShopWorkStatus.ACTIVE,
      endsAt: null,
      updatedById: user.id,
      deletedAt: null
    }
  });
  await tx.affiliateProfile.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      status: AffiliateProfileStatus.ACTIVE,
      cooperationStatus: AffiliateCooperationStatus.AVAILABLE,
      bio: "麻布十番エリアのウェルネス、店舗予約、地域サービスの紹介に対応します。",
      strengths: ["wellness", "local_business", "multilingual"],
      serviceAreas: ["港区", "麻布十番", "東京都"]
    },
    update: {
      status: AffiliateProfileStatus.ACTIVE,
      cooperationStatus: AffiliateCooperationStatus.AVAILABLE,
      bio: "麻布十番エリアのウェルネス、店舗予約、地域サービスの紹介に対応します。",
      strengths: ["wellness", "local_business", "multilingual"],
      serviceAreas: ["港区", "麻布十番", "東京都"],
      suspendedReason: null,
      deletedAt: null
    }
  });

  const platformIdentity = await ensureIdentity(tx, {
    userId: user.id,
    type: "platform",
    scopeType: "global",
    scopeId: null,
    displayName: LIFEDANCE_ADMIN2_PLAN.displayName,
    isDefault: true
  });
  const customerIdentity = await ensureIdentity(tx, {
    userId: user.id,
    type: "customer",
    scopeType: "customer_profile",
    scopeId: customerProfile.id,
    displayName: LIFEDANCE_ADMIN2_PLAN.displayName,
    isDefault: false
  });
  const technicianIdentity = await ensureIdentity(tx, {
    userId: user.id,
    type: "technician",
    scopeType: "technician_profile",
    scopeId: technicianProfile.id,
    displayName: LIFEDANCE_ADMIN2_PLAN.displayName,
    isDefault: false
  });
  const merchantOwnerIdentity = await ensureIdentity(tx, {
    userId: user.id,
    type: "merchant_owner",
    scopeType: "shop",
    scopeId: shop.id,
    displayName: LIFEDANCE_ADMIN2_PLAN.shopName,
    isDefault: false
  });
  const merchantOrganizationIdentity = await ensureIdentity(tx, {
    userId: user.id,
    type: "merchant_organization",
    scopeType: "merchant_account",
    scopeId: merchantAccount.id,
    displayName: LIFEDANCE_ADMIN2_PLAN.shopName,
    isDefault: false
  });
  await ensureIdentity(tx, {
    userId: user.id,
    type: "scout",
    scopeType: "global",
    scopeId: null,
    displayName: LIFEDANCE_ADMIN2_PLAN.displayName,
    isDefault: false
  });

  await ensureFixedIdentifier(tx, {
    kind: PublicIdentifierKind.NEEDO,
    publicId: LIFEDANCE_ADMIN2_PLAN.needoId,
    numberPart: LIFEDANCE_ADMIN2_PLAN.numberPart,
    userIdentityId: platformIdentity.id
  });
  await ensureFixedIdentifier(tx, {
    kind: PublicIdentifierKind.S,
    publicId: `s${LIFEDANCE_ADMIN2_PLAN.numberPart}`,
    numberPart: LIFEDANCE_ADMIN2_PLAN.numberPart,
    userIdentityId: technicianIdentity.id
  });
  await ensureFixedIdentifier(tx, {
    kind: PublicIdentifierKind.B,
    publicId: `b${LIFEDANCE_ADMIN2_PLAN.numberPart}`,
    numberPart: LIFEDANCE_ADMIN2_PLAN.numberPart,
    userIdentityId: merchantOwnerIdentity.id
  });
  await ensureFixedIdentifier(tx, {
    kind: PublicIdentifierKind.O,
    publicId: `o${LIFEDANCE_ADMIN2_PLAN.numberPart}`,
    numberPart: LIFEDANCE_ADMIN2_PLAN.numberPart,
    userIdentityId: merchantOrganizationIdentity.id
  });

  const allocator = new IdentifierAllocator(new PublicIdentifierRepository(tx));
  const persistedShop = await tx.shop.findUniqueOrThrow({
    where: { id: shop.id },
    include: { publicIdentifier: true, customerSupportAccount: { include: { publicIdentifier: true } } }
  });
  const supportAccount = persistedShop.customerSupportAccount
    ? await tx.customerSupportAccount.update({
        where: { id: persistedShop.customerSupportAccount.id },
        data: {
          displayName: `${shop.name} Customer Support`,
          isActive: true,
          deletedAt: null
        },
        include: { publicIdentifier: true }
      })
    : await tx.customerSupportAccount.create({
        data: {
          shopId: shop.id,
          type: "SHOP",
          displayName: `${shop.name} Customer Support`
        },
        include: { publicIdentifier: true }
      });
  if (!persistedShop.publicIdentifier && !supportAccount.publicIdentifier) {
    const pair = await allocator.allocateShopSupportPair({
      shopId: shop.id,
      customerSupportAccountId: supportAccount.id
    });
    await tx.shop.update({
      where: { id: shop.id },
      data: { shopNo: pair.shopIdentifier.numberPart }
    });
  } else {
    assert(
      persistedShop.publicIdentifier?.kind === PublicIdentifierKind.SHOP &&
        supportAccount.publicIdentifier?.kind === PublicIdentifierKind.CUSTOMER_SUPPORT &&
        persistedShop.publicIdentifier.numberPart === supportAccount.publicIdentifier.numberPart,
      "LifeDance admin2 shop identifier pair is incomplete."
    );
    await tx.shop.update({
      where: { id: shop.id },
      data: { shopNo: persistedShop.publicIdentifier.numberPart }
    });
  }
  const persistedMerchant = await tx.merchantAccount.findUniqueOrThrow({
    where: { id: merchantAccount.id },
    include: { publicIdentifier: true }
  });
  if (!persistedMerchant.publicIdentifier) {
    const identifier = await allocator.allocate({
      kind: "OWNER",
      merchantAccountId: merchantAccount.id
    });
    await tx.merchantAccount.update({
      where: { id: merchantAccount.id },
      data: { ownerNo: identifier.numberPart }
    });
  } else {
    assert(
      persistedMerchant.publicIdentifier.kind === PublicIdentifierKind.OWNER,
      "LifeDance admin2 merchant identifier kind is invalid."
    );
    await tx.merchantAccount.update({
      where: { id: merchantAccount.id },
      data: { ownerNo: persistedMerchant.publicIdentifier.numberPart }
    });
  }

  const roles = await tx.role.findMany({
    where: { code: { in: [...LIFEDANCE_ADMIN2_PLAN.roleCodes] }, deletedAt: null },
    select: { id: true, code: true }
  });
  const roleIds = new Map(roles.map((role) => [role.code, role.id]));
  assert(roleIds.size === LIFEDANCE_ADMIN2_PLAN.roleCodes.length, "LifeDance admin2 roles are incomplete.");
  for (const grant of [
    { code: "admin", scopeType: "global", scopeId: null },
    { code: "customer", scopeType: "customer_profile", scopeId: customerProfile.id },
    { code: "technician", scopeType: "technician_profile", scopeId: technicianProfile.id },
    { code: "merchant_owner", scopeType: "shop", scopeId: shop.id },
    { code: "scout", scopeType: "global", scopeId: null }
  ] as const) {
    const roleId = roleIds.get(grant.code);
    assert(roleId, `LifeDance admin2 role is missing: ${grant.code}`);
    await ensureRole(tx, { userId: user.id, roleId, scopeType: grant.scopeType, scopeId: grant.scopeId });
  }

  const friendCandidates = await tx.user.findMany({
    where: {
      email: { endsWith: "@needo.local" },
      isActive: true,
      deletedAt: null,
      customerProfile: { isNot: null },
      identities: {
        some: { type: "customer", isActive: true, deletedAt: null }
      }
    },
    select: { id: true, email: true, needoId: true }
  });
  const selectedFriends = selectAdmin2FriendTargets(friendCandidates);
  await ensureBidirectionalContact(tx, user.id, admin.id);
  for (const friend of selectedFriends) {
    await ensureBidirectionalContact(tx, user.id, friend.id);
  }

  await tx.auditLog.create({
    data: {
      actorId: admin.id,
      action: "seed.lifedance_admin2.provision",
      targetType: "User",
      targetId: user.id,
      metadata: {
        email: LIFEDANCE_ADMIN2_PLAN.email,
        needoId: LIFEDANCE_ADMIN2_PLAN.needoId,
        shopId: shop.id,
        merchantAccountId: merchantAccount.id,
        friendUserIds: [admin.id, ...selectedFriends.map((friend) => friend.id)]
      }
    }
  });

  void customerIdentity;
  return {
    userId: user.id,
    shopId: shop.id,
    technicianProfileId: technicianProfile.id,
    merchantAccountId: merchantAccount.id,
    friendUserIds: [admin.id, ...selectedFriends.map((friend) => friend.id)],
    sessionGeneration
  };
};
import {
  AffiliateCooperationStatus,
  AffiliateProfileStatus,
  PrimaryIdentityType,
  PublicIdentifierKind,
  PublicIdentifierStatus,
  ShopPricingMode,
  TechnicianEmploymentType,
  TechnicianShopRelationshipType,
  TechnicianShopWorkStatus,
  type Prisma
} from "@prisma/client";

import { PublicIdentifierRepository } from "../repositories/public-identifier.repository";
import { IdentifierAllocator } from "../services/public-identifier.service";
