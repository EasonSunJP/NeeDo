# Staging 店铺公共编号修复

`repair:staging-shop-public-identifier` 只用于修复旧版审核流程已经批准、但没有生成店铺公共编号与店铺客服账号的单个 staging 店铺。新申请由审核事务直接生成这些记录，不需要运行此命令。

## 运行边界

命令会同时校验以下条件，任一条件不满足都会退出且不写入：

- `NODE_ENV=production` 且 `DEPLOY_ENV=staging`；
- 数据库必须是 Docker 网络内 `mysql/needo_staging`；
- `ADMIN_DEFAULT_EMAIL` 对应启用中的全局 `admin`；
- `STAGING_REPAIR_SHOP_ID` 是启用或已发布店铺；
- 店铺所有者、`NEEDO-APP-{applicationId}` 商户账号、有效店铺 membership、已批准申请和该店铺作用域的 `merchant_owner` 身份属于同一审批链；
- `shopNo`、店铺公共编号、客服账号三者必须全部缺失，或已经全部完整且一致。部分状态会拒绝修复。

## 运行准备

1. 记录目标店铺 ID、所有者、批准申请 ID 和对应商户账号。
2. 对 staging 数据库执行可恢复备份并确认备份完成。
3. 在部署环境通过安全配置注入下列变量，不要把数据库地址或凭据写入命令历史或仓库：

```text
NODE_ENV=production
DEPLOY_ENV=staging
ALLOW_STAGING_SHOP_PUBLIC_IDENTIFIER_REPAIR=true
DATABASE_URL=<staging database url>
ADMIN_DEFAULT_EMAIL=<global admin email>
STAGING_REPAIR_SHOP_ID=<single numeric shop id>
```

4. 在已构建的 backend 容器中运行：

```bash
npm run repair:staging-shop-public-identifier
```

首次成功修复返回 `changed: true`。再次对同一完整店铺运行返回 `changed: false`，不会重复创建数据。公共编号、客服账号、`shopNo` 和审计记录位于同一数据库事务中；事务失败时不会保留部分写入。遇到部分状态或审批链不一致时先停止并核对数据，不要手工补齐剩余字段。

## 回滚

运行后先验证店铺公共编号、客服公共编号、身份切换和审计记录。若验证失败，停止后续操作并从运行前的 staging 数据库备份恢复；不要在生产数据库运行本命令。
