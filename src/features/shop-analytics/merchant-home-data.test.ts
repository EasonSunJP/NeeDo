import { describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({dashboard:vi.fn(),orders:vi.fn()}));
vi.mock("../../api/backofficeRealData",()=>({backofficeRealDataApi:{dashboard:mocks.dashboard}}));
vi.mock("../scheduling/window-loader",()=>({loadEveryScopedOrder:mocks.orders}));
import { loadFormalMerchantHome } from "./merchant-home-data";
it("loads the authoritative Tokyo today window and only persisted non-cancelled orders",async()=>{
 const dashboard={filter:{from:"2026-09-06",to:"2026-09-06"},summary:{serviceGmvJpy:0,activeTechnicians:{current:10},availableScheduleSlots:{current:200}}};
 mocks.dashboard.mockResolvedValue(dashboard);mocks.orders.mockResolvedValue([{id:1,status:"confirmed"},{id:2,status:"cancelled"},{id:3,status:"pending"}]);
 const result=await loadFormalMerchantHome();expect(mocks.dashboard).toHaveBeenCalledWith("merchant-admin",{period:"today"});expect(mocks.orders).toHaveBeenCalledWith({from:"2026-09-06T00:00:00+09:00",to:"2026-09-06T15:00:00.000Z",dateMode:"overlaps"});expect(result.orders.map(x=>x.id)).toEqual([1,3]);expect(result.dashboard.summary.serviceGmvJpy).toBe(0);
});
describe("fail closed",()=>{it("propagates API failures instead of generating statistics",async()=>{mocks.dashboard.mockRejectedValueOnce(new Error("unavailable"));await expect(loadFormalMerchantHome()).rejects.toThrow("unavailable")})});
