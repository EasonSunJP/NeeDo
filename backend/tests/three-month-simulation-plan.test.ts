import {
  LIFEDANCE_ADMIN_EMAIL,
  LIFEDANCE_SHOP_KEY,
  LIFEDANCE_SHOP_NAME,
  SIMULATION_AS_OF_AT,
  SIMULATION_END_AT,
  SIMULATION_NAMESPACE,
  SIMULATION_ORDER_PREFIX,
  SIMULATION_START_AT,
  buildThreeMonthSimulationPlan
} from "../src/simulation/three-month-simulation-plan";

describe("three-month simulation plan", () => {
  const plan = buildThreeMonthSimulationPlan();

  it("uses the stable LifeDance operating dataset namespace", () => {
    expect(SIMULATION_NAMESPACE).toBe("lifedance_real_ops_v1");
  });

  it("creates the requested isolated account cohort", () => {
    expect(plan.shops).toHaveLength(10);
    expect(plan.technicians).toHaveLength(100);
    expect(plan.customers).toHaveLength(100);

    const technicianCounts = plan.shops.map(
      (shop) => plan.technicians.filter((technician) => technician.shopKey === shop.key).length
    );
    expect(technicianCounts[0]).toBe(20);
    expect(technicianCounts.slice(1).every((count) => count === 8 || count === 9)).toBe(true);

    const accountEmails = [
      ...plan.shops.map((shop) => shop.ownerEmail),
      ...plan.technicians.map((technician) => technician.email),
      ...plan.customers.map((customer) => customer.email)
    ];
    expect(new Set(accountEmails).size).toBe(210);
    expect(accountEmails.filter((email) => !email.startsWith("sim."))).toEqual([
      LIFEDANCE_ADMIN_EMAIL
    ]);
  });

  it("assigns technicians 001-020 to LifeDance with persisted employment contracts", () => {
    const lifeDanceStaff = plan.technicians.filter(
      (technician) => technician.shopKey === LIFEDANCE_SHOP_KEY
    );

    expect(lifeDanceStaff).toHaveLength(20);
    expect(
      lifeDanceStaff.slice(0, 10).every((technician) => technician.employmentType === "FULL_TIME")
    ).toBe(true);
    expect(
      lifeDanceStaff.slice(10).every((technician) => technician.employmentType === "TEMPORARY")
    ).toBe(true);
    expect(
      lifeDanceStaff.every(
        (technician) => technician.employmentStartedAt === "2026-06-01T00:00:00.000Z"
      )
    ).toBe(true);
    expect(
      plan.technicians.slice(20).every(
        (technician) =>
          technician.employmentType === "FULL_TIME" ||
          technician.employmentType === "TEMPORARY"
      )
    ).toBe(true);
  });

  it("updates the first stable shop slot into the administrator-owned LifeDance shop", () => {
    expect(plan.shops[0]).toMatchObject({
      key: LIFEDANCE_SHOP_KEY,
      ownerEmail: LIFEDANCE_ADMIN_EMAIL,
      ownerUsername: "LifeDance 管理员",
      name: LIFEDANCE_SHOP_NAME,
      city: "東京都",
      address: "東京都渋谷区道玄坂1-12-1",
      phone: "050-9101-1001",
      description:
        "渋谷のボディケア、ヘッドケア、訪問リラクゼーションを提供するウェルネス店舗です。"
    });
  });

  it("assigns stable generated avatars to every simulated account", () => {
    const repeatedPlan = buildThreeMonthSimulationPlan();
    const shopAvatars = plan.shops.map((shop) => shop.avatarUrl);
    const peopleAvatars = [
      ...plan.technicians.map((technician) => technician.avatarUrl),
      ...plan.customers.map((customer) => customer.avatarUrl)
    ];

    expect(shopAvatars).toHaveLength(10);
    expect(new Set(shopAvatars).size).toBe(10);
    expect(shopAvatars.every((avatar) => avatar.startsWith("/images/generated/stores/"))).toBe(
      true
    );
    expect(peopleAvatars).toHaveLength(200);
    expect(peopleAvatars.every((avatar) => avatar.startsWith("/images/generated/profiles/"))).toBe(
      true
    );
    expect(peopleAvatars.some((avatar) => avatar.includes("cartoon-profile-"))).toBe(true);
    expect(
      peopleAvatars.some((avatar) => avatar.includes("ai-profile-") || avatar.includes("/profile-"))
    ).toBe(true);
    expect(repeatedPlan.shops.map((shop) => shop.avatarUrl)).toEqual(shopAvatars);
    expect(repeatedPlan.technicians.map((technician) => technician.avatarUrl)).toEqual(
      plan.technicians.map((technician) => technician.avatarUrl)
    );
    expect(repeatedPlan.customers.map((customer) => customer.avatarUrl)).toEqual(
      plan.customers.map((customer) => customer.avatarUrl)
    );
  });

  it("uses realistic shop and person names instead of simulation labels", () => {
    const displayNames = [
      ...plan.shops.map((shop) => shop.name),
      ...plan.technicians.map((technician) => technician.displayName),
      ...plan.customers.map((customer) => customer.displayName)
    ];

    expect(displayNames.some((name) => /Simulation|技師 \d|利用者 \d/.test(name))).toBe(false);
    expect(new Set(displayNames).size).toBe(displayNames.length);

    const personNames = [
      ...plan.technicians.map((technician) => technician.displayName),
      ...plan.customers.map((customer) => customer.displayName)
    ];
    const familyNameCounts = new Map<string, number>();
    for (const name of personNames) {
      const familyName = name.split(" ")[0]!;
      familyNameCounts.set(familyName, (familyNameCounts.get(familyName) ?? 0) + 1);
    }
    expect(familyNameCounts.size).toBeGreaterThanOrEqual(90);
    expect(Math.max(...familyNameCounts.values())).toBeLessThanOrEqual(2);
  });

  it("creates three service types per shop and a service assignment for every technician", () => {
    expect(plan.services).toHaveLength(30);
    expect(plan.technicianServices).toHaveLength(100);
    expect(new Set(plan.technicianServices.map((service) => service.technicianKey)).size).toBe(100);
  });

  it("covers three calendar months with deterministic schedules", () => {
    expect(plan.availabilities).toHaveLength(2_600);
    expect(plan.scheduleSlots).toHaveLength(2_600);
    expect(new Set(plan.scheduleSlots.map((slot) => slot.key)).size).toBe(2_600);

    const start = new Date(SIMULATION_START_AT).getTime();
    const end = new Date(SIMULATION_END_AT).getTime();
    for (const slot of plan.scheduleSlots) {
      expect(new Date(slot.startsAt).getTime()).toBeGreaterThanOrEqual(start);
      expect(new Date(slot.endsAt).getTime()).toBeLessThanOrEqual(end);
    }
  });

  it("gives every LifeDance employee non-overlapping work, completed monthly orders and a future reservation", () => {
    const toTokyoMonth = (iso: string): string =>
      new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1_000).toISOString().slice(0, 7);
    const lifeDanceStaff = plan.technicians.filter(
      (technician) => technician.shopKey === LIFEDANCE_SHOP_KEY
    );
    const technicianServiceByTechnician = new Map(
      plan.technicianServices.map((service) => [service.technicianKey, service])
    );
    const serviceByKey = new Map(plan.services.map((service) => [service.key, service]));

    for (const technician of lifeDanceStaff) {
      const slots = plan.scheduleSlots
        .filter((slot) => slot.technicianKey === technician.key)
        .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
      const bookings = plan.bookings.filter(
        (booking) => booking.technicianKey === technician.key
      );
      expect(slots.length).toBeGreaterThanOrEqual(26);
      expect(bookings.length).toBeGreaterThanOrEqual(12);
      expect(bookings.filter((booking) => booking.status === "COMPLETED").length).toBeGreaterThanOrEqual(6);
      expect(
        bookings.some(
          (booking) =>
            booking.status === "CONFIRMED" && booking.startsAt > SIMULATION_AS_OF_AT
        )
      ).toBe(true);
      for (const month of ["2026-06", "2026-07", "2026-08"]) {
        expect(
          bookings.some(
            (booking) =>
              booking.status === "COMPLETED" && toTokyoMonth(booking.endsAt) === month
          )
        ).toBe(true);
      }
      for (let index = 1; index < slots.length; index += 1) {
        expect(new Date(slots[index]!.startsAt).getTime()).toBeGreaterThanOrEqual(
          new Date(slots[index - 1]!.endsAt).getTime()
        );
      }

      const technicianService = technicianServiceByTechnician.get(technician.key);
      expect(technicianService).toBeDefined();
      for (const booking of bookings) {
        const service = serviceByKey.get(booking.serviceKey);
        expect(booking.shopKey).toBe(technician.shopKey);
        expect(booking.technicianServiceKey).toBe(technicianService?.key);
        expect(technicianService?.shopKey).toBe(booking.shopKey);
        expect(service?.shopKey).toBe(booking.shopKey);
      }
    }
  });

  it("includes bookings, completed service, cancellations and future reservations", () => {
    expect(SIMULATION_ORDER_PREFIX).toBe("LD2026-");
    expect(plan.bookings.length).toBeGreaterThan(1_000);
    expect(new Set(plan.bookings.map((booking) => booking.orderNo)).size).toBe(
      plan.bookings.length
    );
    expect(
      plan.bookings.every((booking) => booking.orderNo.startsWith(SIMULATION_ORDER_PREFIX))
    ).toBe(true);

    const statuses = new Set(plan.bookings.map((booking) => booking.status));
    expect(statuses).toEqual(
      expect.objectContaining({
        has: expect.any(Function)
      })
    );
    expect(statuses.has("COMPLETED")).toBe(true);
    expect(statuses.has("CANCELLED")).toBe(true);
    expect(statuses.has("CONFIRMED")).toBe(true);
    expect(statuses.has("PENDING")).toBe(true);
    expect(statuses.has("IN_SERVICE")).toBe(true);

    const bookingSlotKeys = new Set(plan.bookings.map((booking) => booking.slotKey));
    expect(bookingSlotKeys.size).toBe(plan.bookings.length);
    expect(
      plan.scheduleSlots.some(
        (slot) => !bookingSlotKeys.has(slot.key) && slot.status === "AVAILABLE"
      )
    ).toBe(true);
  });

  it("builds a valid status history ending at each booking status", () => {
    const historyByOrder = new Map<string, typeof plan.histories>();
    for (const history of plan.histories) {
      const current = historyByOrder.get(history.orderNo) ?? [];
      current.push(history);
      historyByOrder.set(history.orderNo, current);
    }

    for (const booking of plan.bookings) {
      const histories = historyByOrder.get(booking.orderNo) ?? [];
      expect(histories.length).toBeGreaterThan(0);
      expect(histories.at(-1)?.toStatus).toBe(booking.status);
    }
  });

  it("creates real IM replacement data for every simulated customer", () => {
    const imPlan = plan as typeof plan & {
      conversations?: Array<{
        key: string;
        firstType: string;
        firstKey: string;
        secondType: string;
        secondKey: string;
      }>;
      contacts?: Array<{ key: string; ownerKey: string; contactKey: string }>;
      messages?: Array<{
        conversationKey: string;
        senderType: string;
        senderKey: string;
        createdAt: string;
      }>;
    };

    expect(imPlan.conversations).toHaveLength(230);
    expect(imPlan.contacts).toHaveLength(460);
    expect(imPlan.messages).toHaveLength(1_060);

    for (const customer of plan.customers) {
      expect(
        imPlan.conversations?.filter(
          (conversation) =>
            conversation.firstType === "customer" && conversation.firstKey === customer.key
        )
      ).toHaveLength(customer.key === "customer-100" ? 12 : 2);
    }

    expect(imPlan.contacts?.filter((contact) => contact.ownerKey === "customer-100")).toHaveLength(
      12
    );
    const focusedConversationKeys = new Set(
      imPlan.conversations
        ?.filter(
          (conversation) =>
            conversation.firstType === "customer" && conversation.firstKey === "customer-100"
        )
        .map((conversation) => conversation.key)
    );
    expect(
      imPlan.messages?.filter((message) => focusedConversationKeys.has(message.conversationKey))
    ).toHaveLength(68);

    const staffConversations = imPlan.conversations?.filter((conversation) =>
      conversation.key.startsWith("lifedance-staff-")
    );
    const staffContacts = imPlan.contacts?.filter((contact) =>
      contact.key.startsWith("lifedance-staff-")
    );
    const staffMessages = imPlan.messages?.filter((message) =>
      message.conversationKey.startsWith("lifedance-staff-")
    );
    expect(staffConversations).toHaveLength(20);
    expect(staffContacts).toHaveLength(40);
    expect(staffMessages).toHaveLength(200);
    for (const conversation of staffConversations ?? []) {
      expect(conversation.firstType).toBe("admin");
      expect(conversation.secondType).toBe("technician");
      const conversationMessages = (staffMessages ?? []).filter(
        (message) => message.conversationKey === conversation.key
      );
      expect(conversationMessages).toHaveLength(10);
      expect(new Set(conversationMessages.map((message) => message.senderType))).toEqual(
        new Set(["admin", "technician"])
      );
      for (let index = 1; index < conversationMessages.length; index += 1) {
        expect(new Date(conversationMessages[index]!.createdAt).getTime()).toBeGreaterThan(
          new Date(conversationMessages[index - 1]!.createdAt).getTime()
        );
      }
    }

    const conversationKeys = new Set(imPlan.conversations?.map((conversation) => conversation.key));
    const periodStart = new Date(SIMULATION_START_AT).getTime();
    const periodEnd = new Date(SIMULATION_END_AT).getTime();
    for (const message of imPlan.messages ?? []) {
      expect(conversationKeys.has(message.conversationKey)).toBe(true);
      expect(new Date(message.createdAt).getTime()).toBeGreaterThanOrEqual(periodStart);
      expect(new Date(message.createdAt).getTime()).toBeLessThanOrEqual(periodEnd);
    }
  });
});
