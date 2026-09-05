import { useEffect, useRef, useState } from "react";
import { SettingsSection } from "../../components/client-ui/SettingsDirectory";
import { useI18n } from "../../i18n/I18nProvider";
import { translateText } from "../../i18n/translations";
import { getImOpenedMediaCacheService } from "../im/local-cache/service";

export type ImOpenedMediaCacheClearState = "idle" | "confirming" | "clearing";

export function getNextImOpenedMediaCacheClearState(
  state: ImOpenedMediaCacheClearState,
): ImOpenedMediaCacheClearState {
  if (state === "idle") return "confirming";
  if (state === "confirming") return "clearing";
  return "idle";
}

export function formatImOpenedMediaCacheBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** index;
  return `${Number(value.toFixed(value >= 10 || index === 0 ? 0 : 1))} ${units[index]}`;
}

export function ImOpenedMediaCacheSettingsSection({ accountId }: { accountId: string }) {
  const { language } = useI18n();
  const t = (source: string) => translateText(source, language);
  const [usageBytes, setUsageBytes] = useState(0);
  const [state, setState] = useState<ImOpenedMediaCacheClearState>("idle");
  const [error, setError] = useState(false);
  const activeAccountIdRef = useRef(accountId);
  const requestGenerationRef = useRef(0);
  activeAccountIdRef.current = accountId;

  useEffect(() => {
    const generation = ++requestGenerationRef.current;
    setUsageBytes(0);
    setState("idle");
    setError(false);
    void getImOpenedMediaCacheService().getUsage(accountId)
      .then((usage) => {
        if (requestGenerationRef.current !== generation) return;
        setUsageBytes(usage.mediaBytes);
      })
      .catch(() => {
        if (requestGenerationRef.current !== generation) return;
        setError(true);
      });

    return () => {
      if (requestGenerationRef.current === generation) {
        requestGenerationRef.current += 1;
      }
    };
  }, [accountId]);

  const clear = async () => {
    if (state === "idle") {
      setState("confirming");
      return;
    }
    if (state !== "confirming") return;

    const targetAccountId = accountId;
    const generation = requestGenerationRef.current;
    setState("clearing");
    try {
      await getImOpenedMediaCacheService().clearAccount(targetAccountId);
      if (
        activeAccountIdRef.current !== targetAccountId ||
        requestGenerationRef.current !== generation
      ) return;
      setUsageBytes(0);
      setError(false);
    } catch {
      if (
        activeAccountIdRef.current !== targetAccountId ||
        requestGenerationRef.current !== generation
      ) return;
      setError(true);
    } finally {
      if (
        activeAccountIdRef.current === targetAccountId &&
        requestGenerationRef.current === generation
      ) {
        setState("idle");
      }
    }
  };

  return (
    <SettingsSection
      description={t("只有主动打开的聊天图片和视频会加密保存在当前设备；列表缩略图不会保存，清除不会删除服务器消息。")}
      panelClassName="p-4"
      title={t("聊天媒体本地缓存")}
    >
      <div className="space-y-3">
        <div className="rounded-2xl bg-black/4 px-4 py-3 text-sm">
          <span className="text-[color:var(--client-muted)]">{t("已使用")}</span>
          <strong className="float-right">{formatImOpenedMediaCacheBytes(usageBytes)}</strong>
        </div>
        {error ? (
          <p className="text-xs text-[#ef4f3f]" role="alert">
            {t("本地媒体缓存读取失败")}
          </p>
        ) : null}
        <button
          className="min-h-11 w-full rounded-2xl bg-black/6 px-4 text-sm font-black disabled:opacity-50"
          disabled={state === "clearing"}
          onClick={() => void clear()}
          type="button"
        >
          {state === "confirming"
            ? t("再次点击确认清除")
            : state === "clearing"
              ? t("正在清除...")
              : t("清除当前设备聊天媒体缓存")}
        </button>
      </div>
    </SettingsSection>
  );
}
