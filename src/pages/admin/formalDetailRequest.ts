export type FormalDetailRequestOptions<
  TDetail,
  TId extends number | string = number,
> = {
  onError: (error: unknown, id: TId) => void;
  onFinally: (id: TId) => void;
  onStart: (id: TId) => void;
  onSuccess: (detail: TDetail, id: TId) => void;
  request: (id: TId) => Promise<TDetail>;
};

export function createFormalDetailRequestCoordinator<
  TDetail,
  TId extends number | string = number,
>(options: FormalDetailRequestOptions<TDetail, TId>) {
  let disposed = false;
  let generation = 0;
  let selectedId: TId | null = null;

  const loadRequest = async (id: TId, rejectCurrentError: boolean) => {
    if (disposed) return;
    selectedId = id;
    const requestGeneration = ++generation;
    options.onStart(id);
    const isCurrent = () =>
      !disposed && generation === requestGeneration && selectedId === id;
    try {
      const detail = await options.request(id);
      if (isCurrent()) options.onSuccess(detail, id);
    } catch (error) {
      const current = isCurrent();
      if (current) options.onError(error, id);
      if (current && rejectCurrentError) throw error;
    } finally {
      if (isCurrent()) options.onFinally(id);
    }
  };

  return {
    activate() {
      disposed = false;
    },
    dispose() {
      disposed = true;
      selectedId = null;
      generation += 1;
    },
    getSelectedId() {
      return selectedId;
    },
    invalidate() {
      selectedId = null;
      generation += 1;
    },
    load(id: TId) {
      return loadRequest(id, false);
    },
    loadOrThrow(id: TId) {
      return loadRequest(id, true);
    },
    retry() {
      return disposed || selectedId === null
        ? Promise.resolve()
        : loadRequest(selectedId, false);
    },
  };
}

export type FormalDetailRefreshStatus =
  | { status: "fulfilled" }
  | { status: "rejected"; reason: unknown }
  | { status: "skipped" };

export type FormalDetailMutationResult = {
  refreshDetail: FormalDetailRefreshStatus;
  refreshList: FormalDetailRefreshStatus;
};

async function settleFormalDetailRefresh(
  refresh: () => Promise<unknown>,
): Promise<FormalDetailRefreshStatus> {
  try {
    await refresh();
    return { status: "fulfilled" };
  } catch (reason) {
    return { status: "rejected", reason };
  }
}

export function hasFormalDetailRefreshFailure(
  result: FormalDetailMutationResult,
) {
  return (
    result.refreshList.status === "rejected" ||
    result.refreshDetail.status === "rejected"
  );
}

export async function runFormalDetailMutationSequence(options: {
  isDetailCurrent: () => boolean;
  mutate: () => Promise<unknown>;
  refreshDetail: () => Promise<unknown>;
  refreshList: () => Promise<unknown>;
}): Promise<FormalDetailMutationResult> {
  await options.mutate();
  const refreshList = settleFormalDetailRefresh(options.refreshList);
  const refreshDetail = options.isDetailCurrent()
    ? settleFormalDetailRefresh(options.refreshDetail)
    : Promise.resolve<FormalDetailRefreshStatus>({ status: "skipped" });
  const [refreshListStatus, refreshDetailStatus] = await Promise.all([
    refreshList,
    refreshDetail,
  ]);

  return {
    refreshDetail: refreshDetailStatus,
    refreshList: refreshListStatus,
  };
}
