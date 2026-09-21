import { readFileSync } from "node:fs";
import { selectPrimaryTechnicianServiceSources } from "../src/repositories/booking.repository";

const repositorySource = readFileSync("src/repositories/booking.repository.ts", "utf8");

describe("booking availability primary technician service", () => {
  it("uses the primary-service selector for unscoped dynamic availability", () => {
    expect(repositorySource).toContain(": selectPrimaryTechnicianServiceSources(technicianServices);");
    expect(repositorySource).not.toContain("technicianServices.map((source) => [source.technicianId, source] as const)");
  });

  it("keeps the first ordered primary service instead of overwriting it with an add-on", () => {
    expect(selectPrimaryTechnicianServiceSources([
      { id: 201, technicianId: 22, name: "全身もみほぐし 60分" },
      { id: 308, technicianId: 22, name: "施術延長 30分" }
    ])).toEqual([{ id: 201, technicianId: 22, name: "全身もみほぐし 60分" }]);
  });

  it("prefers a main service when legacy ordering places an add-on first", () => {
    expect(selectPrimaryTechnicianServiceSources([
      { id: 311, technicianId: 25, name: "施術延長 30分" },
      { id: 204, technicianId: 25, name: "肩・首集中ケア 50分" },
      { id: 312, technicianId: 26, name: "オプション 30分" },
      { id: 205, technicianId: 26, name: "フットリフレクソロジー 60分" }
    ])).toEqual([
      { id: 204, technicianId: 25, name: "肩・首集中ケア 50分" },
      { id: 205, technicianId: 26, name: "フットリフレクソロジー 60分" }
    ]);
  });
});
