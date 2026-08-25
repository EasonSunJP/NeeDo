import {
  SIMULATION_END_AT,
  SIMULATION_ORDER_PREFIX,
  SIMULATION_START_AT,
  buildThreeMonthSimulationPlan
} from "../src/simulation/three-month-simulation-plan";

describe("three-month simulation plan", () => {
  const plan = buildThreeMonthSimulationPlan();

  it("creates the requested isolated account cohort", () => {
    expect(plan.shops).toHaveLength(10);
    expect(plan.technicians).toHaveLength(100);
    expect(plan.customers).toHaveLength(100);

    for (const shop of plan.shops) {
      expect(plan.technicians.filter((technician) => technician.shopKey === shop.key)).toHaveLength(
        10
      );
    }

    const accountEmails = [
      ...plan.shops.map((shop) => shop.ownerEmail),
      ...plan.technicians.map((technician) => technician.email),
      ...plan.customers.map((customer) => customer.email)
    ];
    expect(new Set(accountEmails).size).toBe(210);
    expect(accountEmails.every((email) => email.startsWith("sim."))).toBe(true);
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

  it("includes bookings, completed service, cancellations and future reservations", () => {
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
      conversations?: Array<{ key: string; customerKey: string; participantKey: string }>;
      contacts?: Array<{ ownerKey: string; contactKey: string }>;
      messages?: Array<{ conversationKey: string; senderKey: string; createdAt: string }>;
    };

    expect(imPlan.conversations).toHaveLength(210);
    expect(imPlan.contacts).toHaveLength(420);
    expect(imPlan.messages).toHaveLength(860);

    for (const customer of plan.customers) {
      expect(
        imPlan.conversations?.filter((conversation) => conversation.customerKey === customer.key)
      ).toHaveLength(customer.key === "customer-100" ? 12 : 2);
    }

    expect(imPlan.contacts?.filter((contact) => contact.ownerKey === "customer-100")).toHaveLength(
      12
    );
    const focusedConversationKeys = new Set(
      imPlan.conversations
        ?.filter((conversation) => conversation.customerKey === "customer-100")
        .map((conversation) => conversation.key)
    );
    expect(
      imPlan.messages?.filter((message) => focusedConversationKeys.has(message.conversationKey))
    ).toHaveLength(68);

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
