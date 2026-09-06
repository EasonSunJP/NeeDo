import request from "supertest";
import { BackofficeRepository } from "../src/repositories/backoffice.repository";
import { BackofficeService } from "../src/services/backoffice.service";
import { createStep06Fixture } from "./helpers/step06-fixture";

const account = { id: 41, displayName: "Staff", avatarUrl: null, createdAt: "2026-09-01T00:00:00.000Z" };
it("authorizes operator posts through the backoffice permission and fixes author to the resolved subject", async () => {
  const findActivityAccount = jest.fn(async () => account);
  const listSocialPosts = jest.fn(async () => ({ list: [], total: 0, page: 1, page_size: 10 }));
  const fixture = await createStep06Fixture({ backofficeRepository: { findActivityAccount }, realtimeRepository: { listSocialPosts } } as never);
  fixture.replaceAdminPermissions(["backoffice:users:read"]);
  const token = await fixture.loginAsAdmin();
  await request(fixture.app).get("/api/v1/backoffice/users/41/posts?page=2&pageSize=10").set("Authorization", `Bearer ${token}`).expect(200);
  expect(findActivityAccount).toHaveBeenCalledWith({ scope: "platform", subject: "users", id: 41 });
  expect(listSocialPosts).toHaveBeenCalledWith(expect.any(Number), { page: 2, pageSize: 10, authorUserId: 41 }, expect.any(Number));
  await request(fixture.app).get("/api/v1/backoffice/technicians/8/posts").set("Authorization", `Bearer ${token}`).expect(403);
  await request(fixture.app).get("/api/v1/backoffice/users/41/posts?pageSize=1001").set("Authorization", `Bearer ${token}`).expect(400);
  await request(fixture.app).get("/api/v1/backoffice/users/41/posts").expect(401);
  for (const query of ["authorUserId=99", "shopId=99"]) await request(fixture.app).get(`/api/v1/backoffice/users/41/posts?${query}`).set("Authorization", `Bearer ${token}`).expect(400);
});
it("resolves merchant staff by technician profile/shop without customer bookings and includes their creation", async () => {
  const findFirst = jest.fn(async () => ({ user: { id: 41, username: "Staff", avatarUrl: null, createdAt: new Date(account.createdAt) } }));
  const findMany = jest.fn(async () => []);
  const repository = new BackofficeRepository({ technicianProfile: { findFirst }, auditLog: { count: jest.fn(async () => 0), findMany } } as never);
  expect(await repository.findActivityAccount({ scope: "merchant", shopId: 7, subject: "technicians", id: 8 })).toEqual(account);
  expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 8, shopId: 7, deletedAt: null, user: { deletedAt: null } } }));
  const log = await repository.getAccountAudit({ scope: "merchant", shopId: 7, account, audit_page: 1, audit_page_size: 10 });
  expect(log).toMatchObject({ total: 1, page: 1, list: [{ action: "account.created", createdAt: account.createdAt }] });
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { deletedAt: null, targetType: "User", targetId: 41, metadata: { path: "$.shopId", equals: 7 } }, skip: 0, take: 9 }));
});
it("does not read another shop's technician log when subject resolution fails", async () => {
  const getAccountAudit = jest.fn();
  const service = new BackofficeService({ findActivityAccount: jest.fn(async () => null), getAccountAudit } as never, { record: jest.fn() } as never, {} as never);
  await expect(service.getTechnicianUserLog(8, true, { currentIdentityType: "merchant", currentIdentityId: 3, currentIdentityScopeType: "shop", currentIdentityScopeId: 7 } as never, {} as never, { audit_page: 1, audit_page_size: 10 })).rejects.toMatchObject({ statusCode: 404 });
  expect(getAccountAudit).not.toHaveBeenCalled();
});

it("documents all scoped activity routes and their directory permissions", async () => {
  const { accountActivityOpenApiPaths } = await import("../src/api/account-activity.openapi");
  const paths = accountActivityOpenApiPaths("/api/v1") as Record<string, { get: { security: unknown; parameters: Array<{ name: string }>; "x-required-permission": string } }>;
  expect(Object.keys(paths)).toHaveLength(6);
  expect(paths["/api/v1/backoffice/users/{id}/posts"].get).toMatchObject({ security: [{ bearerAuth: [] }], "x-required-permission": "backoffice:users:read" });
  expect(paths["/api/v1/merchant-admin/technicians/{id}/user-log"].get).toMatchObject({ "x-required-permission": "merchant-admin:technicians:list" });
  expect(paths["/api/v1/merchant-admin/technicians/{id}/user-log"].get.parameters.map((item) => item.name)).toEqual(["id", "audit_page", "audit_page_size", "audit_from", "audit_to"]);
});
