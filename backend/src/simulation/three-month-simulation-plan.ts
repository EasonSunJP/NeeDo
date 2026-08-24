export const SIMULATION_NAMESPACE = "needo_three_month_v1";
export const SIMULATION_START_AT = "2026-06-01T00:00:00.000Z";
export const SIMULATION_END_AT = "2026-08-31T14:59:59.999Z";
export const SIMULATION_AS_OF_AT = "2026-08-25T00:00:00.000Z";
export const SIMULATION_ORDER_PREFIX = "SIM3M-";

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
}

export interface SimulationCustomerPlan {
  key: string;
  email: string;
  username: string;
  displayName: string;
  city: string;
  membershipLevel: string;
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
}

const SHOP_TEMPLATES = [
  ["Tokyo Relax Shibuya", "東京都", "東京都渋谷区道玄坂1-12-1"],
  ["Tokyo Care Shinjuku", "東京都", "東京都新宿区西新宿1-8-1"],
  ["Ginza Wellness Studio", "東京都", "東京都中央区銀座4-6-16"],
  ["Ikebukuro Body Lab", "東京都", "東京都豊島区西池袋1-11-1"],
  ["Yokohama Healing Port", "神奈川県", "神奈川県横浜市西区南幸1-5-1"],
  ["Omiya Refresh Salon", "埼玉県", "埼玉県さいたま市大宮区桜木町1-7-5"],
  ["Chiba Home Care", "千葉県", "千葉県千葉市中央区新町1000"],
  ["Osaka Namba Relax", "大阪府", "大阪府大阪市中央区難波5-1-60"],
  ["Nagoya Sakae Care", "愛知県", "愛知県名古屋市中区栄3-5-1"],
  ["Fukuoka Tenjin Wellness", "福岡県", "福岡県福岡市中央区天神2-11-1"]
] as const;

const pad = (value: number, length = 3): string => value.toString().padStart(length, "0");

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
      return {
        key: `shop-${pad(sequence)}`,
        ownerEmail: `sim.shop.${pad(sequence)}@needo.local`,
        ownerUsername: `Simulation Shop Owner ${pad(sequence)}`,
        name,
        city,
        address,
        phone: `050-91${pad(sequence, 2)}-${pad(1000 + sequence, 4)}`,
        description: `${SIMULATION_NAMESPACE} の正式ローカル検証用店舗データです。`
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
        username: `Simulation Technician ${pad(sequence)}`,
        displayName: `技師 ${pad(sequence)}`,
        city: shop.city,
        serviceArea: `${shop.city}および周辺地域`,
        yearsExperience: 1 + (index % 12)
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
        username: `Simulation Customer ${pad(sequence)}`,
        displayName: `利用者 ${pad(sequence)}`,
        city: shop.city,
        membershipLevel: index % 10 === 0 ? "gold" : index % 4 === 0 ? "silver" : "standard"
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
          cancelReason:
            bookingStatus === "CANCELLED" ? "customer_schedule_changed" : null
        };
        bookings.push(booking);
      }
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
    histories: bookings.flatMap(buildHistories)
  };
};
