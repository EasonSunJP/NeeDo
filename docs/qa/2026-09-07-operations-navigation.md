# Operations navigation update

The shared desktop/mobile operations navigation uses the requested order and labels:

运营 → 用户 → 技师 → 订单 → 店铺 → 营销 → 财务 → 联盟营销 → 代理商 → 加盟商 → 供货商 → 设置 → 文档

TEST badges appear on 营销、联盟营销、代理商、加盟商、供货商. Existing route keys, links, permission filtering, and disabled states are preserved. The new 代理商 label has Traditional Chinese, Japanese, English and Korean translations in the existing dictionary; the other labels reuse existing translations.

The operations layout/integration tests and the PWA/composer regression suites pass 45 tests across five files. Combined frontend lint and production build passed. Local main verification is performed when integrating the two corrections.

User requested local changes only while other tasks finish. No remote push or staging deployment is part of this change.
