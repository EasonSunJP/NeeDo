import { useEffect, useRef, useState } from "react";
import { ApiClientError } from "../../api/httpClient";
import { createBookingIdempotencyKey } from "../booking/api";
import { sosApi, type SosAvailability } from "./api";
import { useSosText } from "./i18n";
import { subscribeSosRefresh } from "./refresh";
import { useSosScope } from "./useSosScope";
import "./sos.css";

type Props = { orderId: number; revision?: string };
export function BookingSosButton(props: Props) {
  const scope = useSosScope();
  return scope.canCreate ? <BookingSosControl key={`${scope.ownerKey}:${props.orderId}`} {...props} /> : null;
}

function BookingSosControl({ orderId, revision }: Props) {
  const t = useSosText();
  const [availability, setAvailability] = useState<SosAvailability | null>(null);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "resolved" | "error">("idle");
  const [loadError, setLoadError] = useState(false);
  const key = useRef<string | null>(null);
  const sending = useRef(false);
  const mounted = useRef(true);
  const refreshRef = useRef<() => void>(() => {});
  const mutationVersion = useRef(0);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    let sequence = 0;
    const controller = new AbortController();
    const refresh = async () => {
      const request = ++sequence;
      const version = mutationVersion.current;
      try {
        const value = await sosApi.availability(orderId, controller.signal);
        if (!active || request !== sequence || version !== mutationVersion.current) return;
        setAvailability(value);
        setLoadError(false);
        if (value.activeAlertId) key.current = null;
        if (!sending.current) {
          setStatus(value.activeAlertId ? "sent" : "idle");
        }
      } catch {
        if (active && request === sequence) setLoadError(true);
      }
    };
    refreshRef.current = () => { void refresh(); };
    void refresh();
    const unsubscribe = subscribeSosRefresh(() => { void refresh(); });
    return () => { active = false; controller.abort(); unsubscribe(); };
  }, [orderId, revision]);
  const send = async () => {
    if (sending.current || availability?.activeAlertId) return;
    sending.current = true;
    mutationVersion.current += 1;
    key.current ??= createBookingIdempotencyKey();
    setStatus("sending");
    try {
      const { alert } = await sosApi.send(orderId, key.current);
      if (!mounted.current) return;
      mutationVersion.current += 1;
      key.current = null;
      setAvailability((value) => ({ canSend: true, serverNow: "", expiresAt: null, ...value, activeAlertId: alert.status === "pending" ? alert.id : null }));
      setLoadError(false);
      setStatus(alert.status === "resolved" ? "resolved" : "sent");
    } catch (error) {
      if (!mounted.current) return;
      setStatus("error");
      if (error instanceof ApiClientError && error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status)) {
        key.current = null;
        refreshRef.current();
      }
    } finally { sending.current = false; }
  };
  return (
    <div className="relative shrink-0" data-no-i18n>
      <button aria-label={t("send")} aria-busy={status === "sending"} className="booking-sos-capsule focus-ring" disabled={status === "sending" || Boolean(availability?.activeAlertId)} onClick={() => void send()} type="button">SOS</button>
      {status !== "idle" || loadError ? <span className="booking-sos-feedback" role={status === "error" ? "alert" : "status"}>{loadError ? t("unavailable") : status === "sending" ? t("sending") : status === "sent" ? t("sent") : status === "resolved" ? t("resolved") : t("sendError")}</span> : null}
    </div>
  );
}
