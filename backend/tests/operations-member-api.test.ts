import request from "supertest";
import { compare } from "bcryptjs";
import { createStep06Fixture } from "./helpers/step06-fixture";

const body = { username: "Operations member", email: "New.Operator@example.com", password: "Strong@1234", reason: "New operations colleague" };

describe("official operations account creation", () => {
  it("creates a server-issued needo account and passes only a password hash to persistence", async () => {
    const createWithAudit = jest.fn(async () => ({ needoId: "needo2059926868", username: body.username, email: body.email.toLowerCase(), avatarUrl: null }));
    const fixture = await createStep06Fixture({ operationsMemberRepository: { createWithAudit } } as never);
    const token = await fixture.loginAsAdmin();
    const response = await request(fixture.app).post("/api/v1/users/operations-members").set("Authorization", `Bearer ${token}`).send(body).expect(201);
    expect(response.body.data.needoId).toMatch(/^needo\d{10}$/);
    const input = (createWithAudit.mock.calls as unknown as Array<[Record<string, unknown>]>)[0][0];
    expect(await compare(body.password, input.passwordHash as string)).toBe(true);
    expect(input.passwordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(input).toMatchObject({ email: body.email.toLowerCase(), reason: body.reason, actorId: 1 });
    expect(JSON.stringify(response.body)).not.toContain(body.password);
    expect(input).not.toHaveProperty("password");
  });

  it("requires authentication and both permissions, and rejects weak passwords or injected IDs/roles", async () => {
    const createWithAudit = jest.fn();
    const fixture = await createStep06Fixture({ operationsMemberRepository: { createWithAudit } } as never);
    await request(fixture.app).post("/api/v1/users/operations-members").send(body).expect(401);
    const token = await fixture.loginAsAdmin();
    for (const invalid of [{ ...body, password: "12345678" }, { ...body, reason: " " }, { ...body, needoId: "needo0000000001" }, { ...body, role: "admin" }]) {
      await request(fixture.app).post("/api/v1/users/operations-members").set("Authorization", `Bearer ${token}`).send(invalid).expect(400);
    }
    for (const permissions of [["user:create"], ["user:assign-role"]]) {
      fixture.replaceAdminPermissions(permissions);
      const restrictedToken = await fixture.loginAsAdmin();
      await request(fixture.app).post("/api/v1/users/operations-members").set("Authorization", `Bearer ${restrictedToken}`).send(body).expect(403);
    }
    expect(createWithAudit).not.toHaveBeenCalled();
  });
});
