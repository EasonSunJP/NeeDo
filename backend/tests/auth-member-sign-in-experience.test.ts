import request from "supertest";
import type { UserExperienceRecordEventInput } from "../src/domain/user-experience";
import { createStep06Fixture } from "./helpers/step06-fixture";

describe("successful login member sign-in experience", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("uses one idempotency key per Asia/Tokyo date and retries harmlessly", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-09-01T14:59:00.000Z"));
    const seen = new Set<string>();
    const recordEvent = jest.fn(async (input: UserExperienceRecordEventInput) => {
      const duplicate = seen.has(input.idempotencyKey);
      seen.add(input.idempotencyKey);
      return {
        status: duplicate ? ("duplicate" as const) : ("awarded" as const),
        account: {
          publicId: "experience-account-1",
          userId: input.userId,
          totalUnits: 10_000n,
          currentLevel: 1,
          lockVersion: 2
        },
        entry: null
      };
    });
    const fixture = await createStep06Fixture({
      userExperienceService: { recordEvent }
    } as never);

    await fixture.loginAsAdmin();
    await fixture.loginAsAdmin();
    expect(recordEvent.mock.calls.slice(0, 2).map(([input]) => input)).toEqual([
      expect.objectContaining({
        eventType: "member_sign_in",
        idempotencyKey: "member-sign-in:needo0000000001:2026-09-01",
        sourcePublicId: "2026-09-01",
        baseUnits: 10_000n,
        requiredBenefit: "member_sign_in"
      }),
      expect.objectContaining({
        idempotencyKey: "member-sign-in:needo0000000001:2026-09-01"
      })
    ]);

    jest.setSystemTime(new Date("2026-09-01T15:00:00.000Z"));
    await fixture.loginAsAdmin();
    expect(recordEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        idempotencyKey: "member-sign-in:needo0000000001:2026-09-02",
        sourcePublicId: "2026-09-02"
      })
    );
  });

  it("does not award on refresh-token rotation", async () => {
    const recordEvent = jest.fn(async () => ({
      status: "ineligible" as const,
      account: null
    }));
    const fixture = await createStep06Fixture({
      userExperienceService: { recordEvent }
    } as never);
    const login = await request(fixture.app)
      .post("/api/v1/auth/login")
      .send({ loginIdentifier: "admin@example.com", password: "Abcd@1234" })
      .expect(200);
    expect(recordEvent).toHaveBeenCalledTimes(1);

    await request(fixture.app)
      .post("/api/v1/auth/refresh")
      .send({ refreshToken: login.body.data.refreshToken })
      .expect(200);
    expect(recordEvent).toHaveBeenCalledTimes(1);
  });

  it("keeps a completed login available when experience recording temporarily fails", async () => {
    const fixture = await createStep06Fixture({
      userExperienceService: {
        recordEvent: jest.fn(async () => {
          throw new Error("temporary experience persistence failure");
        })
      }
    } as never);
    await fixture.loginAsAdmin();
  });
});
