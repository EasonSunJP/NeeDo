import { ApiClientError } from "../../api/httpClient";
import { translateText, type Language } from "../../i18n/translations";

const timeoutErrorMessage = "error.network.timeout";

export function describeMerchantReadError(error: unknown, language: Language) {
  let message = "本店经营数据加载失败，请检查网络后重试";

  if (error instanceof ApiClientError) {
    if (error.status === 401) {
      message = "登录状态已失效，请重新登录";
    } else if (error.status === 403) {
      message = "当前身份没有查看本店经营数据的权限";
    } else if (error.status === 408 || error.message === timeoutErrorMessage) {
      message = "网络响应超时，请稍后重试。";
    } else if (error.status >= 500) {
      message = "本店经营数据服务暂时不可用，请稍后重试";
    }
  } else if (error instanceof Error && error.message === timeoutErrorMessage) {
    message = "网络响应超时，请稍后重试。";
  }

  return translateText(message, language);
}
