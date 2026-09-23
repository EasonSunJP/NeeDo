import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { AvatarImage } from "../../components/ui/AvatarImage";
import { useOptionalI18n } from "../../i18n/I18nProvider";
import { languageLocales, type Language } from "../../i18n/translations";
import { type RealtimeSocialPost } from "../realtime/api";
import { mapFormalSocialPost } from "../social/formal-adapter";
import { platformUserManagementApi } from "./api";
import type { AccountActivitySubject } from "./types";
const copy: Record<Language, string[]> = {
  zh: ["动态", "正在读取动态…", "动态读取失败，请重试", "暂无可查看的动态", "重试", "上一页", "下一页"],
  "zh-Hant": ["動態", "正在讀取動態…", "動態讀取失敗，請重試", "暫無可查看的動態", "重試", "上一頁", "下一頁"],
  ja: ["投稿", "投稿を読み込み中…", "投稿の読み込みに失敗しました", "表示できる投稿はありません", "再試行", "前へ", "次へ"],
  en: ["Posts", "Loading posts…", "Could not load posts", "No posts available", "Retry", "Previous", "Next"],
  ko: ["게시물", "게시물 불러오는 중…", "게시물을 불러오지 못했습니다", "표시할 게시물이 없습니다", "다시 시도", "이전", "다음"]
};
export function UserPublishedPosts({ account }: { account: AccountActivitySubject }) {
  const { scope, subject, id } = account;
  const { language } = useOptionalI18n(); const text = copy[language];
  const [page, setPage] = useState(1); const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ loading: boolean; error: boolean; list: RealtimeSocialPost[]; total: number }>({ loading: true, error: false, list: [], total: 0 });
  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true, error: false, list: [], total: 0 });
    platformUserManagementApi.listAccountPosts({ scope, subject, id }, page, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setState({ loading: false, error: false, list: data.list, total: data.total }); })
      .catch(() => { if (!controller.signal.aborted) setState({ loading: false, error: true, list: [], total: 0 }); });
    return () => controller.abort();
  }, [page, revision, scope, subject, id]);
  return <section className="min-w-0 space-y-3" aria-label={text[0]} aria-busy={state.loading}>
    {state.loading ? <p className="p-4 text-sm text-ink/50">{text[1]}</p> : state.error ? <div role="alert" className="flex flex-wrap items-center gap-3 p-4 text-sm text-coral">{text[2]}<Button size="sm" variant="secondary" onClick={() => setRevision((value) => value + 1)}>{text[4]}</Button></div> : !state.list.length ? <p className="p-4 text-sm text-ink/50">{text[3]}</p> : state.list.map((item) => {
      const post = mapFormalSocialPost(item);
      return <article key={item.id} className="min-w-0 rounded-xl border border-line bg-white p-4">
        <div className="mb-3 flex items-center gap-3">{item.author ? <AvatarImage alt="" className="h-9 w-9 rounded-full object-cover" src={item.author.avatarUrl ?? undefined} /> : null}<div className="min-w-0"><p className="break-words text-sm font-bold">{item.author?.displayName}</p><time className="text-xs text-ink/50" dateTime={item.createdAt}>{new Intl.DateTimeFormat(languageLocales[language], { dateStyle: "medium", timeStyle: "medium" }).format(new Date(item.createdAt))}</time></div></div>
        <p className="whitespace-pre-wrap break-words text-sm leading-6">{item.content}</p>
        {post.media.length ? <div className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2">{post.media.map((media) => media.type === "video" ? <video key={media.id} controls preload="metadata" className="max-h-96 w-full rounded-lg" src={media.url} /> : <a key={media.id} href={media.url} target="_blank" rel="noreferrer"><img alt={media.alt ?? ""} loading="lazy" className="max-h-96 w-full rounded-lg object-contain" src={media.url} /></a>)}</div> : null}
      </article>;
    })}
    {!state.loading && !state.error && (state.total > 10 || page > 1) ? <div className="flex items-center justify-end gap-3"><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>{text[5]}</Button><span className="text-xs">{page} / {Math.max(1, Math.ceil(state.total / 10))}</span><Button size="sm" variant="secondary" disabled={page * 10 >= state.total} onClick={() => setPage((value) => value + 1)}>{text[6]}</Button></div> : null}
  </section>;
}
