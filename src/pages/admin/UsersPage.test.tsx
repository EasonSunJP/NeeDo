import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./UsersPage.tsx", import.meta.url), "utf8");

describe("operations customer profiles resilience", () => {
  it("retries transient formal reads and never renders an empty success table after an error", () => {
    expect(source).toContain("loadCoreReadWithTransientRetry");
    expect(source).toMatch(
      /loadCoreReadWithTransientRetry\(\s*\(\) => backofficeRealDataApi\.customers\("backoffice", query\)\s*\)/
    );
    expect(source).toContain("describeBackofficeReadError(loadError, languageRef.current)");
    expect(source).toContain("!loading && !error ? <DataTable");
    expect(source).not.toContain(
      "setError(loadError instanceof Error ? loadError.message : String(loadError))"
    );
  });

  it("offers an explicit retry when the bounded automatic retry still fails", () => {
    expect(source).toContain("onClick={() => void load()}");
    expect(source).toContain('translateText("重试", language)');
  });

  it("uses the paginated formal timeline and dedicated membership grant API", () => {
    expect(source).toContain('backofficeRealDataApi.customerTimeline(\n          "backoffice"');
    expect(source).toContain("customerTimelinePageSizeRef");
    expect(source).toContain("onTimelinePageSizeChange={changeCustomerTimelinePageSize}");
    expect(source).toContain("backofficeRealDataApi.assignCustomerMembership(customerId");
    expect(source).toContain('grantMode: "operator_complimentary"');
    expect(source).toContain('aria-label="运营会员赋予表单"');
  });

  it("keeps basic profile writes separate from membership assignment", () => {
    expect(source).toContain('const [draft, setDraft] = useState({ displayName: "", city: "", isPublic: true })');
    expect(source).not.toContain("{ ...draft, membershipLevel:");
  });
});
