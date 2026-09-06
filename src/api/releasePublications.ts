import { httpClient } from "./httpClient";
export type ReleasePublication = {
  id: number;
  deploymentId: string;
  environment: "local" | "test" | "staging" | "prod";
  version: string;
  sourceRevision: string;
  previousRevision: string | null;
  kind: "release" | "rollback" | "baseline" | "redeploy";
  publishedAt: string;
  changes: string[];
};
export type ReleasePublicationPage = {
  list: ReleasePublication[];
  total: number;
  page: number;
  page_size: number;
};
export const releasePublicationsApi = {
  async list(
    page: number,
    pageSize: number,
    signal?: AbortSignal,
  ): Promise<ReleasePublicationPage> {
    const result = await httpClient.request<ReleasePublicationPage>(
      "/backoffice/releases",
      { query: { page, pageSize }, signal },
    );
    if (
      result.page !== page ||
      result.page_size !== pageSize ||
      !Number.isSafeInteger(result.total) ||
      result.total < 0 ||
      !Array.isArray(result.list) ||
      result.list.length > pageSize ||
      result.list.some(
        (row) =>
          !Number.isSafeInteger(row.id) ||
          row.id <= 0 ||
          typeof row.version !== "string" ||
          !["release", "rollback", "baseline", "redeploy"].includes(row.kind) ||
          !["local", "test", "staging", "prod"].includes(row.environment) ||
          typeof row.sourceRevision !== "string" ||
          !/^[0-9a-f]{40}$/.test(row.sourceRevision) ||
          !Number.isFinite(Date.parse(row.publishedAt)) ||
          !Array.isArray(row.changes) ||
          row.changes.some((text) => typeof text !== "string"),
      )
    ) {
      throw new Error("release.invalid_response");
    }
    return result;
  },
};
