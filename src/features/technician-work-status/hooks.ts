import { useCallback, useEffect, useRef, useState } from "react";
import {
  workStatusApi,
  workStatusBase,
  type WorkStatusSnapshot,
  type WorkStatusTarget,
} from "./api";
import { subscribeWorkStatusRefresh } from "./refresh";
export function useWorkStatus(target: WorkStatusTarget) {
  const key = workStatusBase(target);
  const [snapshot, setSnapshot] = useState<WorkStatusSnapshot | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const request = useRef(0);
  const targetRef = useRef(target);
  targetRef.current = target;
  const reload = useCallback(async () => {
    const seq = ++request.current;
    setLoading(true);
    try {
      const value = await workStatusApi.snapshot(targetRef.current);
      if (seq === request.current) {
        setSnapshot((current) =>
          current?.technicianProfileId === value.technicianProfileId &&
          current.version > value.version
            ? current
            : value,
        );
        setError(false);
      }
    } catch {
      if (seq === request.current) setError(true);
    } finally {
      if (seq === request.current) setLoading(false);
    }
  }, [key]);
  useEffect(() => {
    setSnapshot(null);
    void reload();
    const unsubscribe = subscribeWorkStatusRefresh(() => void reload());
    return () => {
      ++request.current;
      unsubscribe();
    };
  }, [reload]);
  const accept = useCallback((value: WorkStatusSnapshot) => {
    setSnapshot((current) =>
      current?.technicianProfileId === value.technicianProfileId &&
      current.version > value.version
        ? current
        : value,
    );
    setLoading(false);
    setError(false);
  }, []);
  return { snapshot, error, loading, reload, accept };
}
