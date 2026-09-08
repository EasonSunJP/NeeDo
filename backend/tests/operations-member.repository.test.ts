import { Prisma } from "@prisma/client";
import { OperationsMemberRepository } from "../src/repositories/operations-member.repository";
const input = { username: "Staff", email: "staff@example.test", passwordHash: "test-hash", reason: "Assigned", actorId: 1, ip: "127.0.0.1" };
it.each([
  { target: ["email"] },
  { driverAdapterError: { cause: { constraint: { index: "users_email_key" } } } },
  { driverAdapterError: { cause: { constraint: { fields: ["email"] } } } }
])("maps only confirmed Prisma email collisions to the safe 409 response", async (meta) => {
  const collision = new Prisma.PrismaClientKnownRequestError("duplicate", { code: "P2002", clientVersion: "7.8.0", meta });
  const repository = new OperationsMemberRepository({ $transaction: jest.fn(async () => { throw collision; }) } as never);
  await expect(repository.createWithAudit(input)).rejects.toMatchObject({ statusCode: 409, message: "error.user.email_already_exists" });
});
it("preserves non-email database failures", async () => {
  const failure = new Error("database unavailable");
  const repository = new OperationsMemberRepository({ $transaction: jest.fn(async () => { throw failure; }) } as never);
  await expect(repository.createWithAudit(input)).rejects.toBe(failure);
});
