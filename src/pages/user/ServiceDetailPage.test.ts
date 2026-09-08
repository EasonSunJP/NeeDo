import { beforeEach, describe, expect, it, vi } from "vitest";
import { httpClient } from "../../api/httpClient";
import { coreReadApi, coreReadIdFromRoute } from "../../features/core-read/api";
import { buildServiceTagLabels } from "./ServiceDetailPage";
import serviceDetailSource from "./ServiceDetailPage.tsx?raw";

vi.mock("../../api/httpClient", () => ({
  httpClient: { request: vi.fn() }
}));

describe("ServiceDetailPage formal service routes", () => {
  beforeEach(() => {
    vi.mocked(httpClient.request).mockReset().mockResolvedValue({});
  });

  it("keeps legacy positive numeric service IDs on the typed core-read API", async () => {
    const id = coreReadIdFromRoute("17", { allowUuid: true });

    expect(id).toBe(17);
    await coreReadApi.getServiceDetail(id!);
    expect(httpClient.request).toHaveBeenCalledWith("/services/17", { auth: false });
  });

  it("preserves a valid service UUID instead of coercing it to NaN", async () => {
    const uuid = "46969a0f-2c2c-4b7b-b986-88e406393255";
    const id = coreReadIdFromRoute(uuid, { allowUuid: true });

    expect(id).toBe(uuid);
    await coreReadApi.getServiceDetail(id!);
    expect(httpClient.request).toHaveBeenCalledWith(`/services/${uuid}`, { auth: false });
    expect(httpClient.request).not.toHaveBeenCalledWith("/services/NaN", expect.anything());
  });

  it("keeps UUID support scoped to services and rejects other invalid legacy IDs", () => {
    expect(coreReadIdFromRoute("46969a0f-2c2c-4b7b-b986-88e406393255")).toBeNull();
    expect(serviceDetailSource).not.toContain("data/mock");
    expect(serviceDetailSource).toContain('coreReadIdFromRoute(id, { allowUuid: true })');
    expect(serviceDetailSource).toContain("if (!apiId)");
    expect(serviceDetailSource).toContain("serviceQuery.data ? mapCoreServiceToServiceItem(serviceQuery.data) : null");
    expect(serviceDetailSource).toContain("服务链接不可用");
  });

  it("opens a formal technician through the canonical public profile path", () => {
    expect(serviceDetailSource).toContain("getTechnicianDynamicPath(technician)");
    expect(serviceDetailSource).not.toContain('to={`/profiles/technician/${technician.id}`}');
  });

  it("deduplicates overlapping service areas and tags before rendering keyed chips", () => {
    expect(buildServiceTagLabels(["Tokyo", "Minato"], ["Tokyo", "cleaning"])).toEqual([
      "Tokyo",
      "Minato",
      "cleaning"
    ]);
  });

  it("uses the shared glass header with only favorite, forward, and close actions", () => {
    const content = serviceDetailSource.slice(
      serviceDetailSource.indexOf("function ServiceDetailContent"),
      serviceDetailSource.indexOf("export function ServiceDetailPage")
    );

    expect(serviceDetailSource).toMatch(/import \{[^}]*MobileFullscreenHeader[^}]*\} from "\.\.\/\.\.\/components\/mobile\/MobileFullscreenHeader"/);
    expect(content).toContain("<MobileFullscreenHeader");
    expect(content).toContain('title="服务详情"');
    expect(content).toContain("onBack={() => navigate(-1)}");
    expect(content).toContain("onClose={() => navigate(-1)}");
    expect(content.indexOf('label="收藏"')).toBeLessThan(content.indexOf('label="转发"'));
    expect(content.indexOf('label="转发"')).toBeLessThan(content.indexOf('closeLabel="关闭服务详情"'));
    expect(serviceDetailSource).toContain('favorite: "heart"');
    expect(serviceDetailSource).toContain('forward: "share"');
    expect(serviceDetailSource).not.toContain('like: "heart"');
    expect(serviceDetailSource).not.toContain('favorite: "star"');
    expect(serviceDetailSource).not.toContain('translate: "globe"');
    expect(content).not.toContain("safe-header-top");
  });
});
