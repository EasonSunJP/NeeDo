import {
  defaultTechnicianAutomationRules,
  technicianAutomationKindParamSchema,
  technicianAutomationSettingsUpdateSchema
} from "../src/validators/technician-automation.validator";

describe("technician automation validators", () => {
  it("provides conservative Booking and Request defaults with automation disabled by the caller", () => {
    expect(defaultTechnicianAutomationRules("booking")).toMatchObject({
      bufferMinutes: 30,
      maxDistanceKm: 5,
      minLeadMinutes: 30,
      acceptNewCustomers: true,
      serviceModes: ["store", "home"]
    });
    expect(defaultTechnicianAutomationRules("request")).toMatchObject({
      bufferMinutes: 30,
      maxDistanceKm: 5,
      minLeadMinutes: 0,
      onlyOnline: true,
      requestStartWindow: "within_3_hours"
    });
  });

  it("accepts complete bounded rule payloads and strips no unknown behavior", () => {
    const rules = defaultTechnicianAutomationRules("booking");
    expect(technicianAutomationSettingsUpdateSchema.parse({
      enabled: true,
      expectedVersion: 3,
      rules: {
        ...rules,
        timeWindows: [{ weekday: 1, startMinute: 540, endMinute: 1080 }],
        source: { mode: "specific_contacts", contactIdentityIds: [31, 32] },
        serviceIds: [101, 102]
      }
    })).toMatchObject({ enabled: true, expectedVersion: 3 });
  });

  it("rejects invalid time ranges, thresholds, duplicate selectors, and incompatible source selections", () => {
    const rules = defaultTechnicianAutomationRules("booking");
    const invalid = [
      { ...rules, timeWindows: [{ weekday: 7, startMinute: 540, endMinute: 600 }] },
      { ...rules, timeWindows: [{ weekday: 1, startMinute: 600, endMinute: 600 }] },
      { ...rules, maxDistanceKm: 0 },
      { ...rules, minCustomerRating: 5.1 },
      { ...rules, maxCancellationRatePercent: 101 },
      { ...rules, serviceIds: [4, 4] },
      { ...rules, source: { mode: "any", contactIdentityIds: [31] } }
    ];
    for (const candidate of invalid) {
      expect(technicianAutomationSettingsUpdateSchema.safeParse({
        enabled: true,
        expectedVersion: 1,
        rules: candidate
      }).success).toBe(false);
    }
  });

  it("accepts only the two public setting kinds", () => {
    expect(technicianAutomationKindParamSchema.parse({ kind: "booking" })).toEqual({ kind: "booking" });
    expect(technicianAutomationKindParamSchema.parse({ kind: "request" })).toEqual({ kind: "request" });
    expect(technicianAutomationKindParamSchema.safeParse({ kind: "schedule" }).success).toBe(false);
  });
});
