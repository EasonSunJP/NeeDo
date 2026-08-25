export type FormalDetailRequestOptions<TDetail> = {
  onError: (error: unknown, id: number) => void;
  onFinally: (id: number) => void;
  onStart: (id: number) => void;
  onSuccess: (detail: TDetail, id: number) => void;
  request: (id: number) => Promise<TDetail>;
};

export function createFormalDetailRequestCoordinator<TDetail>(options: FormalDetailRequestOptions<TDetail>) {
  let disposed = false;
  let generation = 0;
  let selectedId: number | null = null;

  const load = async (id: number) => {
    if (disposed) return;
    selectedId = id;
    const requestGeneration = ++generation;
    options.onStart(id);
    const isCurrent = () => !disposed && generation === requestGeneration && selectedId === id;
    try {
      const detail = await options.request(id);
      if (isCurrent()) options.onSuccess(detail, id);
    } catch (error) {
      if (isCurrent()) options.onError(error, id);
    } finally {
      if (isCurrent()) options.onFinally(id);
    }
  };

  return {
    activate() { disposed = false; },
    dispose() { disposed = true; selectedId = null; generation += 1; },
    getSelectedId() { return selectedId; },
    invalidate() { selectedId = null; generation += 1; },
    load,
    retry() { return disposed || selectedId === null ? Promise.resolve() : load(selectedId); }
  };
}

export async function runFormalDetailMutationSequence(options: {
  isDetailCurrent: () => boolean;
  mutate: () => Promise<unknown>;
  refreshDetail: () => Promise<unknown>;
  refreshList: () => Promise<unknown>;
}) {
  await options.mutate();
  await options.refreshList();
  if (options.isDetailCurrent()) await options.refreshDetail();
}
