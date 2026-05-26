# Apifox API Contract Audit

Source: `https://s.apifox.cn/308cd366-5ff1-49b7-9017-6ade6633605e`

Checked on: 2026-05-25

## Summary

The shared Apifox project is now broader than the earlier auth-only snapshot. It exposes a legacy-style API surface with module list endpoints, user/member endpoints, auth/register endpoints, verification-code endpoints, order-style endpoints, and content/marketing endpoints.

The current formal NeeDo backend contract still uses `/api/v1/*` for real User Management, Auth, RBAC, Core Read, Booking, Ledger, Backoffice, Realtime, and Observability APIs. The Apifox contract is therefore treated as a legacy integration contract where it overlaps with current frontend login work, not as permission to replace the formal backend or add fake APIs.

## Frontend Auth Compatibility

The frontend auth adapter keeps formal session creation on the NeeDo backend and uses the legacy Apifox contract only where the current login screen still needs a captcha image:

| Purpose | Runtime owner | Frontend path constant | Method | Request |
|---|---|---|---|---|
| Password login | Formal NeeDo backend | `/auth/login` | `POST` | JSON |
| Register | Legacy Apifox contract | `/reg` | `POST` | `multipart/form-data` |
| Captcha image | Legacy Apifox contract | `/captcha` | `GET` | query string |

Formal password login fields:

- `username` or `email`
- `password`
- optional `numcode`
- optional `type=username`

Legacy Apifox username login fields, for contract reference only:

- `username`
- `password`
- `numcode`
- `type=username`

Captcha fields:

- `token`: FingerprintJS visitor/device token
- `r`: random cache buster

Common documented headers:

- `Authorization`: public pre-login bearer token from environment configuration.
- `token`: optional device fingerprint header, enabled only when the legacy integration requires it.
- `User-Agent`: Apifox sample header; browser fetch controls the real user agent.

Implementation notes:

- Formal password login uses JSON against `/api/v1/auth/login`; its access token is the only token accepted by `/api/v1/auth/me`.
- Captcha may return an image response instead of the NeeDo JSON envelope; the frontend converts image responses into a `data:*;base64,...` URL for the login page.
- The same FingerprintJS visitor/device token used in the captcha query may be sent as the `token` request header, but the session token is still issued by the formal backend.
- Local development keeps `VITE_API_BASE_URL=/api/v1` for the formal backend and sends only legacy captcha traffic through `VITE_LEGACY_AUTH_BASE_URL=/legacy-auth`; Vite proxies `/legacy-auth/*` to `VITE_LEGACY_AUTH_PROXY_TARGET` and strips the prefix.
- Legacy Apifox login returns `token不能为空` when `VITE_API_PUBLIC_AUTHORIZATION` is missing. The real bearer value must come from local/deployment environment configuration, not source.
- Do not use the legacy Apifox `/login` response as a formal NeeDo session token; it will fail `/api/v1/auth/me` with `error.auth.token_invalid`.
- The Apifox project still does not publish `/auth/me`, refresh, logout, roles, or permissions. The formal backend keeps owning `/api/v1/auth/me`, `/api/v1/auth/refresh`, `/api/v1/auth/logout`, `/api/v1/users`, `/api/v1/roles`, and `/api/v1/permissions`.

## Published Apifox APIs

Most entries are documented as `POST`; captcha is verified as `GET`.

| Method | Path | Title |
|---|---|---|
| `POST` | `{table}/action/{id}` | 统一获取模块表单数据 |
| `POST` | `{table}/add` | 统一新增数据接口 |
| `POST` | `{table}/mod/{id}` | 统一修改数据接口 |
| `POST` | `{table}/del/{id}` | 统一删除数据接口 |
| `POST` | `unit` | 获取单位列表 |
| `POST` | `currency` | 获取币种列表 |
| `POST` | `reg` | 用户名注册 |
| `POST` | `reg` | 短信注册 |
| `POST` | `reg` | 邮箱注册 |
| `POST` | `login` | 用户名登录 |
| `POST` | `login` | 短信登录 |
| `POST` | `login` | 邮箱登录 |
| `GET` | `captcha?token={token}&r={random}` | 图形验证码 |
| `POST` | `sms` | 短信验证码 |
| `POST` | `email` | 邮箱验证码 |
| `POST` | `user/{uid}` | 获取用户数据 |
| `POST` | `user/show` | 获取用户显示数据 |
| `POST` | `user/company` | 获取企业用户数据 |
| `POST` | `user/broker` | 获取经纪人数据 |
| `POST` | `user/distributor` | 获取分销人数据 |
| `POST` | `user/member` | 获取所有会员列表 |
| `POST` | `user/svip` | 获取SVIP会员列表 |
| `POST` | `user/diamond` | 获取钻石会员列表 |
| `POST` | `user/diamond` | 获取铂金会员列表 |
| `POST` | `user/gold` | 获取金卡会员列表 |
| `POST` | `user/silver` | 获取银卡会员列表 |
| `POST` | `user/regular` | 获取普卡会员列表 |
| `POST` | `menu{/id}` | 获取菜单数据 |
| `POST` | `menu/show` | 获取菜单显示数据 |
| `POST` | `supplier` | 获取供应商列表 |
| `POST` | `agent` | 获取代理商列表 |
| `POST` | `agent` | 获取渠道商列表 |
| `POST` | `store` | 获取门店列表 |
| `POST` | `user/sale` | 获取门店业务员 |
| `POST` | `user/arter` | 获取门店技师列表 |
| `POST` | `user/virtual` | 获取门店虚拟技师列表 |
| `POST` | `book` | 获取通讯录列表 |
| `POST` | `sos` | 获取求救通知列表 |
| `POST` | `notice/order` | 获取订单通知列表 |
| `POST` | `suggest` | 获取问题反馈列表 |
| `POST` | `suggest/cate` | 获取反馈分类列表 |
| `POST` | `moments` | 获取动态列表 |
| `POST` | `visitor/stats` | 获取访客概览列表 |
| `POST` | `visitor/profile` | 获取用户画像数据 |
| `POST` | `visitor` | 获取链路数据列表 |
| `POST` | `goods` | 获取服务列表数据 |
| `POST` | `goods/cate` | 获取服务分类数据 |
| `POST` | `goods/part` | 获取服务部位列表 |
| `POST` | `insurance` | 获取保单记录数据 |
| `POST` | `insurer` | 获取保险公司列表 |
| `POST` | `goods/part` | 获取服务部位列表 |
| `POST` | `pendant` | 获取挂件列表 |
| `POST` | `order` | 获取订单数据列表 Copy |
| `POST` | `order/demand` | 获取需求大厅数据列表 Copy |
| `POST` | `order/refuse` | 获取拒单独列表数据 |
| `POST` | `order/more` | 获取加钟订单列表 |
| `POST` | `tags/comment` | 获取退款列表数据 |
| `POST` | `order` | 获取评价列表数据 |
| `POST` | `order/demand` | 获取评价标签列表 |
| `POST` | `coupon` | 获取优惠券列表 |
| `POST` | `coupon/issuance` | 获取优惠券发放记录 |
| `POST` | `gift` | 获取礼品卡列表 |
| `POST` | `article` | 获取文章列表 |
| `POST` | `article/cate` | 获取文章分类列表 |

## Home UI / Production Display Gap

The current user homepage UI is already wired to the formal Core Read REST
contract, not directly to the legacy Apifox module-list endpoints. Copying the
local `dist/` bundle to production can align the visual shell and card layout,
but the live homepage still needs same-origin `/api/v1` to reach a formal NeeDo
backend.

Current production check on `https://needo.dackou.com`:

- `GET /api/v1/home/recommendations?limit=1` returns `404`.
- `GET /api/v1/health` returns `404`.

Minimum formal APIs required for the local homepage/search/detail display:

| Purpose | Formal frontend contract | Current Apifox overlap |
|---|---|---|
| Homepage recommendations | `GET /api/v1/home/recommendations?limit=20` | Related legacy source: `POST application/app`, but response shape is not compatible. |
| Store cards/detail | `GET /api/v1/shops/:id` and aggregated `shops` inside home recommendations | Related legacy source: `POST store`, with `keyword`, `page`, `pagesize`. |
| Technician cards/detail | `GET /api/v1/technicians/:id` and aggregated `technicians` inside home recommendations | Related legacy source: `POST user/arter`; request/response shape is not enough for the formal card DTO. |
| Service cards/detail | `GET /api/v1/services/:id`, `GET /api/v1/services`, `GET /api/v1/search` | Related legacy source: `POST goods`, with `keyword`, `page`, `pagesize`. |
| Categories | `GET /api/v1/categories` | Related legacy source: `POST goods/cate`, with `keyword`, `page`, `pagesize`. |
| Public customer profile | `GET /api/v1/profiles/customers/:id` | Apifox exposes user/member list endpoints, but not the public customer profile DTO. |

The formal homepage response must use the shared NeeDo envelope:

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "categories": [],
    "services": [],
    "shops": [],
    "technicians": []
  }
}
```

The card DTOs are documented in `docs/api.md`. They must include published
shop, technician, service, category, media, and review summary fields from the
real database. Do not satisfy the production homepage by adding frontend fallback
mock data.

For frontend-driven test merchant and technician creation, the current formal
backend has admin `User` CRUD and read-only `Shop` / `TechnicianProfile` public
APIs, but does not yet expose a public or merchant self-service onboarding API
that creates:

- a merchant or technician `UserIdentity`,
- a `Shop`,
- a `TechnicianProfile`,
- related `Service`, `MediaAsset`, and `ReviewSummary` rows,
- review/audit status transitions.

Until that API exists, realistic production test data should be inserted by the
backend seed or an approved admin/onboarding API, then verified through the
frontend. A later onboarding API can still be aligned to the Apifox `reg`,
`store`, `user/arter`, `goods`, and `goods/cate` concepts, but it should return
the formal `/api/v1` DTOs used by the current frontend.

## Gaps Still Open In Apifox

- The successful `login` response shape is still not documented with a real token payload.
- The public pre-login bearer token is shown as an example value in Apifox, but production/staging should provide it through environment configuration rather than source code.
- Current-user, refresh-token, logout, roles, permissions, and identity-switch APIs are still absent from the shared Apifox project.
- Some copied list endpoints in the shared tree have duplicated or suspicious paths, for example the review endpoints currently point to copied order paths. Treat those as Apifox documentation issues until the backend owner confirms them.
