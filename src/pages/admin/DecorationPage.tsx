import { PlatformContentCapabilityGate } from "./PlatformContentCapabilityGate";

const requirements = [
  "PageLayout、PageComponent 与 ContentVersion 表和 migration",
  "平台范围草稿、审核、发布、回滚与版本 API",
  "组件 schema、顺序、链接、媒体与主题校验",
  "三端正式读取、缓存失效、RBAC 与发布审计"
];

export function DecorationPage() {
  return (
    <PlatformContentCapabilityGate
      title="平台 UI 装修"
      description="正式平台装修必须使用版本化布局合同，并由三端读取同一份已发布配置。"
      heading="正式平台 UI 装修尚未启用"
      warning="当前不会展示模拟组件、图片、主题或终端预览，也不会把页面内存中的排序、显隐、文案或样式变化显示为已保存。"
      requirements={requirements}
    />
  );
}
