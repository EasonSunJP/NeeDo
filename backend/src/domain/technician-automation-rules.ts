import type {
  TechnicianAutomationKindValue,
  TechnicianAutomationRules
} from "../validators/technician-automation.validator";

export interface TechnicianAutomationEvaluationContext {
  now: Date;
  startsAt: Date;
  endsAt: Date;
  actualScheduleAvailable: boolean;
  hasBufferedConflict: boolean;
  hardBlockReasons: string[];
  areaCode: string | null;
  distanceKm: number | null;
  grossAmountJpy: number;
  netAmountJpy: number | null;
  prepaidServiceAmountJpy: number;
  prepaymentBaseAmountJpy: number;
  prepaymentConfirmed: boolean;
  customerRating: number | null;
  customerCompletedOrders: number;
  customerHistoricalOrders: number;
  customerCancellationRatePercent: number | null;
  customerEkycVerified: boolean;
  customerIsContact: boolean;
  referralContactIdentityId: number | null;
  completedOrdersWithTechnician: number;
  partyType: "single" | "multiple";
  serviceMode: "store" | "home";
  paymentMethod: "onsite" | "card" | "ndp" | "bank_transfer" | "other";
  serviceId: number;
  technicianOnline: boolean | null;
  tagsMatch: boolean | null;
}

export interface TechnicianAutomationEvaluationResult {
  matched: boolean;
  action: "accept" | "apply" | "manual";
  matchedConditions: string[];
  failedReasons: string[];
}

function tokyoParts(value: Date): { weekday: number; minute: number; date: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Tokyo",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    weekday: weekdays[read("weekday")] ?? -1,
    minute: Number(read("hour")) * 60 + Number(read("minute")),
    date: `${read("year")}-${read("month")}-${read("day")}`
  };
}

export function evaluateTechnicianAutomationRules(
  kind: TechnicianAutomationKindValue,
  rules: TechnicianAutomationRules,
  context: TechnicianAutomationEvaluationContext
): TechnicianAutomationEvaluationResult {
  const matchedConditions: string[] = [];
  const failedReasons = context.hardBlockReasons.map((reason) => `platform:${reason}`);
  const pass = (key: string, condition: boolean, reason: string) => {
    if (condition) matchedConditions.push(key);
    else failedReasons.push(reason);
  };

  pass("schedule:available", context.actualScheduleAvailable, "schedule:unavailable");
  pass("schedule:no_buffered_conflict", !context.hasBufferedConflict, "schedule:conflict");
  pass("online:available", context.technicianOnline === true, context.technicianOnline === null ? "online:unavailable" : "online:offline");

  const leadMinutes = Math.floor((context.startsAt.getTime() - context.now.getTime()) / 60_000);
  pass("time:lead", leadMinutes >= rules.minLeadMinutes, "time:lead_too_short");

  if (rules.timeWindows.length > 0) {
    const start = tokyoParts(context.startsAt);
    const end = tokyoParts(context.endsAt);
    pass(
      "time:window",
      start.date === end.date && rules.timeWindows.some((window) =>
        window.weekday === start.weekday && start.minute >= window.startMinute && end.minute <= window.endMinute
      ),
      "time:outside_window"
    );
  }

  if (kind === "request") {
    const startLimitMinutes = {
      immediate: 15,
      within_1_hour: 60,
      within_3_hours: 180,
      today: Number.POSITIVE_INFINITY,
      any: Number.POSITIVE_INFINITY
    }[rules.requestStartWindow];
    const withinRequestWindow = rules.requestStartWindow === "today"
      ? tokyoParts(context.now).date === tokyoParts(context.startsAt).date
      : leadMinutes >= 0 && leadMinutes <= startLimitMinutes;
    pass("request:start_window", withinRequestWindow, "request:outside_start_window");
  }

  if (rules.areaCodes.length > 0) {
    pass("area:allowed", context.areaCode !== null && rules.areaCodes.includes(context.areaCode), context.areaCode === null ? "area:unavailable" : "area:not_allowed");
  }
  if (rules.maxDistanceKm !== null) {
    pass("distance:maximum", context.distanceKm !== null && context.distanceKm <= rules.maxDistanceKm, context.distanceKm === null ? "distance:unavailable" : "distance:too_far");
  }
  if (rules.minOrderAmountJpy !== null) {
    pass("amount:gross_minimum", context.grossAmountJpy >= rules.minOrderAmountJpy, "amount:gross_too_low");
  }
  if (kind === "request" && rules.minNetAmountJpy !== null) {
    pass("amount:net_minimum", context.netAmountJpy !== null && context.netAmountJpy >= rules.minNetAmountJpy, context.netAmountJpy === null ? "amount:net_unavailable" : "amount:net_too_low");
  }
  if (rules.minimumPrepaymentPercent > 0) {
    const requiredPrepaymentJpy = Math.ceil(
      context.prepaymentBaseAmountJpy * rules.minimumPrepaymentPercent / 100
    );
    pass(
      "payment:prepayment_minimum",
      context.prepaymentConfirmed && context.prepaidServiceAmountJpy >= requiredPrepaymentJpy,
      context.prepaymentConfirmed
        ? "payment:prepayment_too_low"
        : "payment:prepayment_unconfirmed"
    );
  }
  if (rules.minCustomerRating !== null) {
    pass("customer:rating", context.customerRating !== null && context.customerRating >= rules.minCustomerRating, context.customerRating === null ? "customer:rating_unavailable" : "customer:rating_too_low");
  }
  const isNewCustomer = context.customerCompletedOrders === 0;
  if (!rules.acceptNewCustomers) pass("customer:not_new", !isNewCustomer, "customer:new_not_allowed");
  pass("customer:completed_orders", context.customerCompletedOrders >= rules.minCompletedOrders, "customer:completed_orders_too_low");
  if (rules.requireEkyc) pass("customer:ekyc", context.customerEkycVerified, "customer:ekyc_required");
  if (rules.maxCancellationRatePercent !== null && context.customerHistoricalOrders >= 3) {
    pass(
      "customer:cancellation_rate",
      context.customerCancellationRatePercent !== null && context.customerCancellationRatePercent <= rules.maxCancellationRatePercent,
      context.customerCancellationRatePercent === null ? "customer:cancellation_rate_unavailable" : "customer:cancellation_rate_too_high"
    );
  }

  if (rules.source.mode === "existing_contacts") {
    pass("source:contact", context.customerIsContact, "source:contact_required");
  } else if (rules.source.mode === "specific_contacts") {
    pass("source:specific_contact", context.customerIsContact && context.referralContactIdentityId !== null && rules.source.contactIdentityIds.includes(context.referralContactIdentityId), "source:specific_contact_required");
  } else if (rules.source.mode === "existing_contact_referrals") {
    pass("source:contact_referral", context.referralContactIdentityId !== null, "source:contact_referral_required");
  } else if (rules.source.mode === "specific_contact_referrals") {
    pass("source:specific_referral", context.referralContactIdentityId !== null && rules.source.contactIdentityIds.includes(context.referralContactIdentityId), "source:specific_referral_required");
  }

  if (rules.customerType === "returning") pass("customer:returning", context.completedOrdersWithTechnician > 0, "customer:returning_required");
  if (rules.customerType === "new") pass("customer:new", context.completedOrdersWithTechnician === 0, "customer:new_required");
  pass("order:party_type", rules.partyTypes.includes(context.partyType), "order:party_type_not_allowed");
  pass("order:service_mode", rules.serviceModes.includes(context.serviceMode), "order:service_mode_not_allowed");
  pass("order:payment_method", rules.paymentMethods.includes(context.paymentMethod), "order:payment_method_not_allowed");
  if (rules.serviceIds.length > 0) pass("service:enabled", rules.serviceIds.includes(context.serviceId), "service:not_selected");
  if (kind === "request" && rules.requireMatchingTags) {
    pass("tags:match", context.tagsMatch === true, context.tagsMatch === null ? "tags:unavailable" : "tags:mismatch");
  }

  const matched = failedReasons.length === 0;
  return {
    matched,
    action: matched ? (kind === "booking" ? "accept" : "apply") : "manual",
    matchedConditions,
    failedReasons
  };
}
