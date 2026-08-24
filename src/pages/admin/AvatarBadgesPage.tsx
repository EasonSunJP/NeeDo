import { PlatformContentCapabilityGate } from "./PlatformContentCapabilityGate";

const requirements = [
  "OrnamentDefinition、OrnamentGrant 与 RuleEvaluation 表和 migration",
  "创建、审核、启停、发放、撤销与过期状态机 API",
  "受众范围、规则版本、幂等发放与权限校验",
  "使用统计、自动复核、审计、分页与导出合同"
];

export function AvatarBadgesPage() {
  return (
    <PlatformContentCapabilityGate
      title="头像框与特殊标签"
      description="正式挂件必须有定义、发放、撤销、过期和规则复核的完整审计链路。"
      heading="正式头像框与标签尚未启用"
      warning="当前不会展示模拟挂件、发放记录、对象头像、使用数量或达标规则，也不会开放只修改页面内存的启停和发放操作。"
      requirements={requirements}
    />
  );
}
