# Merchant Account List View Design

## Scope

The operations shop list keeps its current information-card view as the default and adds a second list view. The two compact icon buttons sit at the right side of the Merchant SaaS ledger header and expose accessible labels for information-card and list display.

## List contract

The list is shop-scoped. Merchant groups are expanded into their real child shops and standalone shops remain one row each. Rows use only the existing formal merchant SaaS response:

- ID: shop database ID.
- 店名: shop name, with the parent merchant name as secondary context when present.
- 创建者: the bound owner email; missing owners display 未绑定.
- 地区: shop city.
- 平台抽成: 0%, following the requested current product rule.
- 月费: the persisted SaaS billing profile amount or 免费.
- 状态: persisted shop status and billing state.
- 添加时间: persisted creation timestamp.
- 详情: opens the existing merchant/shop detail drawer.

Agent controls, level, phone, regional commission, profit, withdrawal and revenue columns are excluded because they are outside this shop response or were explicitly excluded.

## Detail and merchant-admin preview

The existing right drawer keeps the SaaS and shop-display tabs. It adds an 打开该店铺后台 button. A group drawer applies the button to the currently selected child shop. The button starts the existing operations read-only merchant preview and opens the merchant portal in a new tab; the existing frontend GET-only guard and backend preview middleware continue to reject writes.

## Responsive and validation

Desktop uses the established dark operations palette and frozen detail action. Mobile uses the shared DataTable card presentation. Tests cover view switching, group flattening, field labels, detail selection, selected-shop preview, and the existing SaaS/shop-display drawer behavior. Local typecheck, focused tests and production build are required before integration into local main.
