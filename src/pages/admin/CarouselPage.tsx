import { PlatformContentCapabilityGate } from "./PlatformContentCapabilityGate";

const requirements = [
  "CarouselScene、CarouselSlide 与 ContentVersion 表和 migration",
  "MediaAsset 对象存储、上传、排序与删除审计",
  "草稿、审核、定时发布、停用与回滚 API",
  "用户端正式读取、目标校验、RBAC 与发布审计"
];

export function CarouselPage() {
  return (
    <PlatformContentCapabilityGate
      title="轮播图"
      description="正式轮播必须通过版本化内容、媒体资产生命周期和可回滚发布流程管理。"
      heading="正式轮播图发布尚未启用"
      warning="当前不会展示模拟轮播、门店、技师或生效数量，也不会把只保存在浏览器里的分组配置显示为已发布。"
      requirements={requirements}
    />
  );
}
