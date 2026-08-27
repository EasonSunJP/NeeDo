export const SIMULATION_NAMESPACE = "needo_three_month_v1";
export const SIMULATION_START_AT = "2026-06-01T00:00:00.000Z";
export const SIMULATION_END_AT = "2026-08-31T14:59:59.999Z";
export const SIMULATION_AS_OF_AT = "2026-08-25T00:00:00.000Z";
export const SIMULATION_ORDER_PREFIX = "SIM3M-";
export const LIFEDANCE_SHOP_KEY = "shop-001";
export const LIFEDANCE_ADMIN_EMAIL = "admin@lifedance.com";
export const LIFEDANCE_LEGACY_OWNER_EMAIL = "sim.shop.001@needo.local";
export const LIFEDANCE_SHOP_NAME = "LifeDance Wellness 渋谷";

export type SimulationBookingStatus =
  | "PENDING"
  | "CONFIRMED"
  | "IN_SERVICE"
  | "COMPLETED"
  | "CANCELLED";
export type SimulationOrderStatus = SimulationBookingStatus;

export type SimulationSlotStatus = "AVAILABLE" | "BOOKED";

export interface SimulationShopPlan {
  key: string;
  ownerEmail: string;
  ownerUsername: string;
  name: string;
  city: string;
  address: string;
  phone: string;
  description: string;
  avatarUrl: string;
}

export interface SimulationTechnicianPlan {
  key: string;
  shopKey: string;
  email: string;
  username: string;
  displayName: string;
  city: string;
  serviceArea: string;
  yearsExperience: number;
  avatarUrl: string;
}

export interface SimulationCustomerPlan {
  key: string;
  email: string;
  username: string;
  displayName: string;
  city: string;
  membershipLevel: string;
  avatarUrl: string;
}

export interface SimulationServicePlan {
  key: string;
  shopKey: string;
  name: string;
  description: string;
  serviceMode: "store" | "home_visit";
  priceAmountJpy: number;
  durationMinutes: number;
}

export interface SimulationTechnicianServicePlan {
  key: string;
  technicianKey: string;
  shopKey: string;
  serviceKey: string;
  name: string;
  priceAmountJpy: number;
  durationMinutes: number;
}

export interface SimulationAvailabilityPlan {
  key: string;
  shopKey: string;
  technicianKey: string;
  startsAt: string;
  endsAt: string;
}

export interface SimulationScheduleSlotPlan extends SimulationAvailabilityPlan {
  serviceKey: string;
  technicianServiceKey: string;
  status: SimulationSlotStatus;
  bookedCount: number;
}

export interface SimulationBookingPlan {
  orderNo: string;
  customerKey: string;
  shopKey: string;
  technicianKey: string;
  serviceKey: string;
  technicianServiceKey: string;
  slotKey: string;
  status: SimulationBookingStatus;
  fulfillmentMode: "store" | "home_visit";
  priceAmountJpy: number;
  durationMinutes: number;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  cancelReason: string | null;
}

export interface SimulationOrderHistoryPlan {
  orderNo: string;
  fromStatus: SimulationOrderStatus | null;
  toStatus: SimulationOrderStatus;
  actorType: "customer" | "merchant";
  reason: string;
  createdAt: string;
}

export type SimulationImParticipantType = "customer" | "technician" | "shop_owner";

export interface SimulationConversationPlan {
  key: string;
  customerKey: string;
  participantType: Exclude<SimulationImParticipantType, "customer">;
  participantKey: string;
  createdAt: string;
}

export interface SimulationContactPlan {
  ownerType: SimulationImParticipantType;
  ownerKey: string;
  contactType: SimulationImParticipantType;
  contactKey: string;
}

export interface SimulationMessagePlan {
  key: string;
  conversationKey: string;
  senderType: SimulationImParticipantType;
  senderKey: string;
  content: string;
  createdAt: string;
}

export interface ThreeMonthSimulationPlan {
  shops: SimulationShopPlan[];
  technicians: SimulationTechnicianPlan[];
  customers: SimulationCustomerPlan[];
  services: SimulationServicePlan[];
  technicianServices: SimulationTechnicianServicePlan[];
  availabilities: SimulationAvailabilityPlan[];
  scheduleSlots: SimulationScheduleSlotPlan[];
  bookings: SimulationBookingPlan[];
  histories: SimulationOrderHistoryPlan[];
  conversations: SimulationConversationPlan[];
  contacts: SimulationContactPlan[];
  messages: SimulationMessagePlan[];
}

const SHOP_TEMPLATES = [
  ["渋谷リラクゼーション 凪", "東京都", "東京都渋谷区道玄坂1-12-1"],
  ["新宿コンディショニング 灯", "東京都", "東京都新宿区西新宿1-8-1"],
  ["銀座ウェルネスサロン 澄", "東京都", "東京都中央区銀座4-6-16"],
  ["池袋ボディケア 結", "東京都", "東京都豊島区西池袋1-11-1"],
  ["横浜ヒーリングポート 蒼", "神奈川県", "神奈川県横浜市西区南幸1-5-1"],
  ["大宮リフレッシュサロン 奏", "埼玉県", "埼玉県さいたま市大宮区桜木町1-7-5"],
  ["千葉ホームケア 日和", "千葉県", "千葉県千葉市中央区新町1000"],
  ["なんばリラクゼーション 笑", "大阪府", "大阪府大阪市中央区難波5-1-60"],
  ["栄トータルケア 紬", "愛知県", "愛知県名古屋市中区栄3-5-1"],
  ["天神ウェルネス 月白", "福岡県", "福岡県福岡市中央区天神2-11-1"]
] as const;

const PERSON_FAMILY_NAMES = [
  "佐藤", "鈴木", "高橋", "田中", "伊藤", "渡辺", "山本", "中村", "小林", "加藤",
  "吉田", "山田", "佐々木", "山口", "松本", "井上", "木村", "林", "清水", "斎藤",
  "山崎", "森", "阿部", "池田", "橋本", "石川", "中島", "前田", "藤田", "小川",
  "後藤", "岡田", "長谷川", "村上", "近藤", "石井", "坂本", "遠藤", "青木", "藤井",
  "西村", "福田", "太田", "三浦", "藤原", "岡本", "松田", "中川", "中野", "原田",
  "小野", "田村", "竹内", "金子", "和田", "中山", "石田", "上田", "森田", "原",
  "柴田", "酒井", "工藤", "横山", "宮崎", "宮本", "内田", "高木", "安藤", "谷口",
  "大野", "丸山", "今井", "河野", "藤本", "村田", "武田", "上野", "杉山", "増田",
  "菅原", "平野", "小島", "久保", "松井", "岩崎", "桜井", "木下", "野口", "松尾",
  "野村", "菊地", "佐野", "新井", "渡部", "杉本", "大西", "古川", "浜田", "市川",
  "小松", "高田", "水野", "吉川", "山内", "西田", "菊池", "西川", "北村", "安田"
] as const;

const PERSON_GIVEN_NAMES = [
  "美咲", "陽菜", "葵", "結衣", "七海", "さくら", "凛", "美月", "彩花", "千尋",
  "優奈", "莉子", "真央", "結菜", "美優", "悠真", "蓮", "湊", "大輝", "直樹",
  "拓海", "翔太", "颯太", "健太", "悠斗", "陸", "大和", "海斗", "樹", "航",
  "晴香", "麻衣", "香織", "奈緒", "愛理", "里奈", "明日香", "瑞希", "琴音", "楓",
  "俊介", "和也", "亮介", "誠", "雄大", "圭介", "智也", "健一", "修平", "光希"
] as const;

const buildPersonName = (index: number): string => {
  const family = PERSON_FAMILY_NAMES[index % PERSON_FAMILY_NAMES.length];
  const generation = Math.floor(index / PERSON_FAMILY_NAMES.length);
  const given = PERSON_GIVEN_NAMES[(index * 17 + generation * 11) % PERSON_GIVEN_NAMES.length];
  return `${family} ${given}`;
};

const pad = (value: number, length = 3): string => value.toString().padStart(length, "0");

const SHOP_AVATAR_URLS = [
  "/images/generated/stores/store-calm-body-room.jpg",
  "/images/generated/stores/store-beauty-reception.jpg",
  "/images/generated/stores/store-nail-atelier.jpg",
  "/images/generated/stores/store-clean-base.jpg",
  "/images/generated/stores/store-izakaya-counter.jpg",
  "/images/generated/stores/store-cafe-consult.jpg",
  "/images/generated/stores/store-pet-grooming.jpg",
  "/images/generated/stores/store-repair-moving-office.jpg",
  "/images/generated/stores/store-family-care-front.png",
  "/images/generated/stores/store-business-wellness-reception.png"
] as const;

const CARTOON_PROFILE_AVATAR_URLS = Array.from(
  { length: 6 },
  (_, index) => `/images/generated/profiles/cartoon-profile-${pad(index + 1, 2)}.png`
);
const REAL_PROFILE_AVATAR_URLS = [
  ...Array.from(
    { length: 16 },
    (_, index) => `/images/generated/profiles/profile-${pad(index + 1, 2)}.jpg`
  ),
  ...Array.from(
    { length: 48 },
    (_, index) => `/images/generated/profiles/ai-profile-${pad(index + 1, 2)}.jpg`
  )
];

const buildProfileAvatarUrl = (sequence: number, salt: number): string => {
  if ((sequence + salt) % 3 === 0) {
    return CARTOON_PROFILE_AVATAR_URLS[(sequence * 5 + salt) % CARTOON_PROFILE_AVATAR_URLS.length]!;
  }

  return REAL_PROFILE_AVATAR_URLS[(sequence * 37 + salt * 11) % REAL_PROFILE_AVATAR_URLS.length]!;
};

const addMinutes = (iso: string, minutes: number): string =>
  new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();

const addDaysAndHours = (baseIso: string, days: number, hours: number): string =>
  new Date(new Date(baseIso).getTime() + (days * 24 + hours) * 60 * 60_000).toISOString();

const buildHistories = (booking: SimulationBookingPlan): SimulationOrderHistoryPlan[] => {
  const requestedAt = booking.createdAt;
  const confirmedAt = addMinutes(requestedAt, 30);
  const inServiceAt = addMinutes(booking.startsAt, 5);
  const completedAt = addMinutes(booking.endsAt, 5);
  const base: SimulationOrderHistoryPlan[] = [
    {
      orderNo: booking.orderNo,
      fromStatus: null,
      toStatus: "PENDING",
      actorType: "customer",
      reason: "simulation_booking_created",
      createdAt: requestedAt
    }
  ];

  if (booking.status === "PENDING") {
    return base;
  }

  if (booking.status === "CANCELLED") {
    return [
      ...base,
      {
        orderNo: booking.orderNo,
        fromStatus: "PENDING",
        toStatus: "CANCELLED",
        actorType: "customer",
        reason: booking.cancelReason ?? "customer_schedule_changed",
        createdAt: addMinutes(requestedAt, 120)
      }
    ];
  }

  const confirmed: SimulationOrderHistoryPlan = {
    orderNo: booking.orderNo,
    fromStatus: "PENDING",
    toStatus: "CONFIRMED",
    actorType: "merchant",
    reason: "simulation_booking_confirmed",
    createdAt: confirmedAt
  };

  if (booking.status === "CONFIRMED") {
    return [...base, confirmed];
  }

  const inService: SimulationOrderHistoryPlan = {
    orderNo: booking.orderNo,
    fromStatus: "CONFIRMED",
    toStatus: "IN_SERVICE",
    actorType: "merchant",
    reason: "simulation_service_started",
    createdAt: inServiceAt
  };

  if (booking.status === "IN_SERVICE") {
    return [...base, confirmed, inService];
  }

  return [
    ...base,
    confirmed,
    inService,
    {
      orderNo: booking.orderNo,
      fromStatus: "IN_SERVICE",
      toStatus: "COMPLETED",
      actorType: "merchant",
      reason: "simulation_service_completed",
      createdAt: completedAt
    }
  ];
};

export const buildThreeMonthSimulationPlan = (): ThreeMonthSimulationPlan => {
  const shops: SimulationShopPlan[] = SHOP_TEMPLATES.map(
    ([name, city, address], index): SimulationShopPlan => {
      const sequence = index + 1;
      if (sequence === 1) {
        return {
          key: LIFEDANCE_SHOP_KEY,
          ownerEmail: LIFEDANCE_ADMIN_EMAIL,
          ownerUsername: "LifeDance 管理员",
          name: LIFEDANCE_SHOP_NAME,
          city: "東京都",
          address: "東京都渋谷区道玄坂1-12-1",
          phone: "050-9101-1001",
          description:
            "渋谷のボディケア、ヘッドケア、訪問リラクゼーションを提供するウェルネス店舗です。",
          avatarUrl: SHOP_AVATAR_URLS[index]!
        };
      }
      return {
        key: `shop-${pad(sequence)}`,
        ownerEmail: `sim.shop.${pad(sequence)}@needo.local`,
        ownerUsername: `${name} 公式受付`,
        name,
        city,
        address,
        phone: `050-91${pad(sequence, 2)}-${pad(1000 + sequence, 4)}`,
        description: `${SIMULATION_NAMESPACE} の正式ローカル検証用店舗データです。`,
        avatarUrl: SHOP_AVATAR_URLS[index]!
      };
    }
  );

  const technicians: SimulationTechnicianPlan[] = Array.from(
    { length: 100 },
    (_, index): SimulationTechnicianPlan => {
      const sequence = index + 1;
      const shop = shops[Math.floor(index / 10)];
      if (!shop) {
        throw new Error(`Simulation shop assignment is missing for technician ${sequence}.`);
      }
      return {
        key: `technician-${pad(sequence)}`,
        shopKey: shop.key,
        email: `sim.tech.${pad(sequence)}@needo.local`,
        username: buildPersonName(index),
        displayName: buildPersonName(index),
        city: shop.city,
        serviceArea: `${shop.city}および周辺地域`,
        yearsExperience: 1 + (index % 12),
        avatarUrl: buildProfileAvatarUrl(sequence, 7)
      };
    }
  );

  const customers: SimulationCustomerPlan[] = Array.from(
    { length: 100 },
    (_, index): SimulationCustomerPlan => {
      const sequence = index + 1;
      const shop = shops[index % shops.length];
      if (!shop) {
        throw new Error(`Simulation city assignment is missing for customer ${sequence}.`);
      }
      return {
        key: `customer-${pad(sequence)}`,
        email: `sim.customer.${pad(sequence)}@needo.local`,
        username: buildPersonName(100 + index),
        displayName: buildPersonName(100 + index),
        city: shop.city,
        membershipLevel: index % 10 === 0 ? "gold" : index % 4 === 0 ? "silver" : "standard",
        avatarUrl: buildProfileAvatarUrl(sequence, 19)
      };
    }
  );

  const services: SimulationServicePlan[] = shops.flatMap((shop, shopIndex) => [
    {
      key: `${shop.key}-service-store`,
      shopKey: shop.key,
      name: "ボディケア 60分",
      description: "店舗で受ける全身ボディケアの標準コースです。",
      serviceMode: "store" as const,
      priceAmountJpy: 8_000 + shopIndex * 200,
      durationMinutes: 60
    },
    {
      key: `${shop.key}-service-home`,
      shopKey: shop.key,
      name: "訪問リラクゼーション 90分",
      description: "指定場所へ訪問する90分のリラクゼーションコースです。",
      serviceMode: "home_visit" as const,
      priceAmountJpy: 12_000 + shopIndex * 300,
      durationMinutes: 90
    },
    {
      key: `${shop.key}-service-head`,
      shopKey: shop.key,
      name: "ヘッドケア 45分",
      description: "店舗で受ける頭部・首・肩を中心とした短時間ケアです。",
      serviceMode: "store" as const,
      priceAmountJpy: 6_500 + shopIndex * 150,
      durationMinutes: 45
    }
  ]);

  const serviceByShop = new Map<string, SimulationServicePlan[]>();
  for (const service of services) {
    serviceByShop.set(service.shopKey, [...(serviceByShop.get(service.shopKey) ?? []), service]);
  }

  const technicianServices: SimulationTechnicianServicePlan[] = technicians.map(
    (technician, index): SimulationTechnicianServicePlan => {
      const candidates = serviceByShop.get(technician.shopKey) ?? [];
      const service = candidates[index % 3];
      if (!service) {
        throw new Error(`Simulation service assignment is missing for ${technician.key}.`);
      }
      return {
        key: `${technician.key}-service`,
        technicianKey: technician.key,
        shopKey: technician.shopKey,
        serviceKey: service.key,
        name: service.name,
        priceAmountJpy: service.priceAmountJpy + (index % 3) * 300,
        durationMinutes: service.durationMinutes
      };
    }
  );

  const technicianServiceByTechnician = new Map(
    technicianServices.map((service) => [service.technicianKey, service])
  );
  const serviceByKey = new Map(services.map((service) => [service.key, service]));
  const availabilities: SimulationAvailabilityPlan[] = [];
  const scheduleSlots: SimulationScheduleSlotPlan[] = [];
  const bookings: SimulationBookingPlan[] = [];
  let slotSequence = 0;
  let bookingSequence = 0;

  for (const [technicianIndex, technician] of technicians.entries()) {
    const technicianService = technicianServiceByTechnician.get(technician.key);
    if (!technicianService) {
      throw new Error(`Technician service is missing for ${technician.key}.`);
    }
    const service = serviceByKey.get(technicianService.serviceKey);
    if (!service) {
      throw new Error(`Source service is missing for ${technicianService.key}.`);
    }

    for (let weekIndex = 0; weekIndex < 13; weekIndex += 1) {
      for (let weeklySlotIndex = 0; weeklySlotIndex < 2; weeklySlotIndex += 1) {
        slotSequence += 1;
        const dayWithinWeek = (technicianIndex % 3) + weeklySlotIndex * 3;
        const startHourUtc = technicianIndex % 9;
        const startsAt = addDaysAndHours(
          SIMULATION_START_AT,
          weekIndex * 7 + dayWithinWeek,
          startHourUtc
        );
        const endsAt = addMinutes(startsAt, technicianService.durationMinutes);
        const slotKey = `slot-${pad(slotSequence, 6)}`;
        const isHistorical = startsAt < SIMULATION_AS_OF_AT;
        const isServiceDay =
          startsAt >= SIMULATION_AS_OF_AT && startsAt < "2026-08-26T00:00:00.000Z";
        const shouldBook = isServiceDay
          ? true
          : isHistorical
            ? slotSequence % 10 < 7
            : slotSequence % 4 < 2;
        let bookingStatus: SimulationBookingStatus | null = null;

        if (shouldBook) {
          if (isServiceDay) {
            bookingStatus =
              slotSequence % 3 === 0
                ? "IN_SERVICE"
                : slotSequence % 3 === 1
                  ? "CONFIRMED"
                  : "PENDING";
          } else if (isHistorical) {
            bookingStatus = slotSequence % 10 < 5 ? "COMPLETED" : "CANCELLED";
          } else {
            bookingStatus = slotSequence % 4 === 0 ? "PENDING" : "CONFIRMED";
          }
        }

        const slotStatus: SimulationSlotStatus =
          bookingStatus && bookingStatus !== "CANCELLED" ? "BOOKED" : "AVAILABLE";
        availabilities.push({
          key: `availability-${pad(slotSequence, 6)}`,
          shopKey: technician.shopKey,
          technicianKey: technician.key,
          startsAt,
          endsAt
        });
        scheduleSlots.push({
          key: slotKey,
          shopKey: technician.shopKey,
          technicianKey: technician.key,
          serviceKey: technicianService.serviceKey,
          technicianServiceKey: technicianService.key,
          startsAt,
          endsAt,
          status: slotStatus,
          bookedCount: slotStatus === "BOOKED" ? 1 : 0
        });

        if (!bookingStatus) {
          continue;
        }

        bookingSequence += 1;
        const customer = customers[(slotSequence * 17 + technicianIndex) % customers.length];
        if (!customer) {
          throw new Error(`Simulation customer assignment is missing for slot ${slotKey}.`);
        }
        const createdAt = addMinutes(startsAt, -(2 + (slotSequence % 18)) * 24 * 60);
        const booking: SimulationBookingPlan = {
          orderNo: `${SIMULATION_ORDER_PREFIX}${pad(bookingSequence, 6)}`,
          customerKey: customer.key,
          shopKey: technician.shopKey,
          technicianKey: technician.key,
          serviceKey: technicianService.serviceKey,
          technicianServiceKey: technicianService.key,
          slotKey,
          status: bookingStatus,
          fulfillmentMode: service.serviceMode,
          priceAmountJpy: technicianService.priceAmountJpy,
          durationMinutes: technicianService.durationMinutes,
          startsAt,
          endsAt,
          createdAt,
          cancelReason: bookingStatus === "CANCELLED" ? "customer_schedule_changed" : null
        };
        bookings.push(booking);
      }
    }
  }

  const conversations: SimulationConversationPlan[] = [];
  const contacts: SimulationContactPlan[] = [];
  const messages: SimulationMessagePlan[] = [];
  const messageScripts = {
    technician: [
      "予約前に施術時間について確認したいです。",
      "お問い合わせありがとうございます。ご希望の時間帯を確認します。",
      "夕方の時間帯を希望します。よろしくお願いします。",
      "承知しました。空き枠を確保しましたので、予約画面をご確認ください。"
    ],
    shop_owner: [
      "予約当日の受付方法を教えてください。",
      "ご予約名を受付でお伝えください。ご来店をお待ちしております。",
      "支払い方法も事前に確認できますか。",
      "店頭で現金またはカードをご利用いただけます。"
    ]
  } as const;

  for (const [customerIndex, customer] of customers.entries()) {
    const technician = technicians[customerIndex];
    const shop = shops[customerIndex % shops.length];
    if (!technician || !shop) {
      throw new Error(`Simulation IM assignment is missing for ${customer.key}.`);
    }

    const counterparts = [
      {
        type: "technician" as const,
        key: technician.key,
        conversationKey: `conversation-${customer.key}-${technician.key}`,
        dayOffset: 1 + (customerIndex % 20)
      },
      {
        type: "shop_owner" as const,
        key: shop.key,
        conversationKey: `conversation-${customer.key}-${shop.key}-owner`,
        dayOffset: 3 + (customerIndex % 20)
      }
    ];

    for (const counterpart of counterparts) {
      const createdAt = addDaysAndHours(
        SIMULATION_START_AT,
        counterpart.dayOffset,
        customerIndex % 10
      );
      conversations.push({
        key: counterpart.conversationKey,
        customerKey: customer.key,
        participantType: counterpart.type,
        participantKey: counterpart.key,
        createdAt
      });
      contacts.push(
        {
          ownerType: "customer",
          ownerKey: customer.key,
          contactType: counterpart.type,
          contactKey: counterpart.key
        },
        {
          ownerType: counterpart.type,
          ownerKey: counterpart.key,
          contactType: "customer",
          contactKey: customer.key
        }
      );

      const script = messageScripts[counterpart.type];
      const messageDayOffsets = [0, 28, 55, 65];
      for (const [messageIndex, content] of script.entries()) {
        const senderIsCustomer = messageIndex % 2 === 0;
        messages.push({
          key: `${counterpart.conversationKey}-message-${messageIndex + 1}`,
          conversationKey: counterpart.conversationKey,
          senderType: senderIsCustomer ? "customer" : counterpart.type,
          senderKey: senderIsCustomer ? customer.key : counterpart.key,
          content,
          createdAt: addDaysAndHours(createdAt, messageDayOffsets[messageIndex] ?? 0, 0)
        });
      }
    }
  }

  const focusedCustomer = customers.find((customer) => customer.key === "customer-100");
  if (!focusedCustomer) {
    throw new Error("Focused simulation customer customer-100 is missing.");
  }
  const focusedCounterparts = [
    ...technicians.slice(0, 6).map((technician) => ({
      type: "technician" as const,
      key: technician.key
    })),
    ...shops.slice(0, 4).map((shop) => ({
      type: "shop_owner" as const,
      key: shop.key
    }))
  ];
  const focusedMessageScripts = {
    technician: [
      "您好，我想确认本周可以预约的时间。",
      "お問い合わせありがとうございます。今週の空き時間を確認します。",
      "周六下午或周日晚上都可以，麻烦您了。",
      "土曜日の15時でしたら対応できます。",
      "好的，我会从预约页面提交，地址稍后发给您。",
      "承知しました。前日にこちらのチャットでもう一度ご案内します。"
    ],
    shop_owner: [
      "您好，请问到店后在哪里办理登记？",
      "ご来店後、受付で予約番号をお見せください。",
      "如果临时晚到十分钟，可以在这里联系吗？",
      "はい、このチャットは店舗スタッフと共有されています。",
      "明白了，付款方式我选择现场刷卡。",
      "カード決済で承りました。当日はお気をつけてお越しください。"
    ]
  } as const;
  const focusedMessageDayOffsets = [0, 8, 24, 43, 61, 78];

  for (const [counterpartIndex, counterpart] of focusedCounterparts.entries()) {
    const conversationKey = `conversation-${focusedCustomer.key}-focused-${counterpart.type}-${counterpart.key}`;
    const createdAt = addDaysAndHours(
      SIMULATION_START_AT,
      counterpartIndex + 2,
      counterpartIndex % 6
    );
    conversations.push({
      key: conversationKey,
      customerKey: focusedCustomer.key,
      participantType: counterpart.type,
      participantKey: counterpart.key,
      createdAt
    });
    contacts.push(
      {
        ownerType: "customer",
        ownerKey: focusedCustomer.key,
        contactType: counterpart.type,
        contactKey: counterpart.key
      },
      {
        ownerType: counterpart.type,
        ownerKey: counterpart.key,
        contactType: "customer",
        contactKey: focusedCustomer.key
      }
    );

    for (const [messageIndex, content] of focusedMessageScripts[counterpart.type].entries()) {
      const senderIsCustomer = messageIndex % 2 === 0;
      messages.push({
        key: `${conversationKey}-message-${messageIndex + 1}`,
        conversationKey,
        senderType: senderIsCustomer ? "customer" : counterpart.type,
        senderKey: senderIsCustomer ? focusedCustomer.key : counterpart.key,
        content,
        createdAt: addDaysAndHours(createdAt, focusedMessageDayOffsets[messageIndex] ?? 0, 0)
      });
    }
  }

  return {
    shops,
    technicians,
    customers,
    services,
    technicianServices,
    availabilities,
    scheduleSlots,
    bookings,
    histories: bookings.flatMap(buildHistories),
    conversations,
    contacts,
    messages
  };
};
