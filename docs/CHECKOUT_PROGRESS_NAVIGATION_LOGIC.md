# 确认预约页顶部导航与页面滚动对应逻辑

> 页面：`/checkout/:serviceId`  
> 代码入口：`src/pages/user/CheckoutPage.tsx`  
> 截图区域：页面顶部 `确认预约` 下方的胶囊箭头导航，包含 `套餐 / 到店服务或上门服务 / 时间 / 地址 / 技师 / 备注`。

## 1. 这不是路由导航，是页内进度导航

顶部导航不会切换 URL，也不会进入新页面。它是当前 `CheckoutPage` 内部的页内 progress navigation。

核心关系是：

```text
progressSteps[index]
  ↓ 同一个 index
sectionRefs.current[index]
  ↓ 同一个 index
页面中对应的内容区块
```

也就是说，导航项和页面区块不是靠文字匹配，也不是靠 DOM 查询标题匹配，而是靠数组下标一一对应。

## 2. 当前导航项顺序

`progressSteps` 在 `CheckoutPage` 内定义，当前顺序如下：

| index | key | 顶部显示 | 对应页面区块 |
|---:|---|---|---|
| 0 | `package` | 套餐 | 套餐卡片与套餐选择 |
| 1 | `fulfillment` | 到店服务 / 上门服务 | 服务方式、坐席或上门说明 |
| 2 | `time` | 时间 | 预约日期、时间、人数 |
| 3 | `location` | 地址 | 门店地址 / 上门地址、地图、复制地址 |
| 4 | `technician` | 技师 | 已选技师与技师列表 |
| 5 | `remark` | 备注 | 备注输入框和快捷备注 |

其中第二项的文字是动态的：

```text
fulfillmentMode === "store" ? "到店服务" : "上门服务"
```

所以用户切换服务方式后，顶部第二个导航项会从 `到店服务` 改成 `上门服务`，但它仍然对应同一个 `fulfillment` 区块。

## 3. 顶部导航如何固定在页面上方

页面使用：

```tsx
<AppTopBar fixed footer={...} title="确认预约" />
```

`AppTopBar` 内部通过 `FloatingHomeHeader` 渲染固定顶部浮层。`fixed` 的作用是告诉顶部栏不要自动插入 spacer，因此页面正文需要自己留出顶部空间。

当前正文留白写在 `PageScaffold` 上：

```tsx
contentClassName="space-y-4 pb-36 pt-[calc(env(safe-area-inset-top,0px)+148px)] sm:pt-[calc(env(safe-area-inset-top,0px)+156px)]"
```

这段顶部 padding 的作用是避免页面第一块内容被固定顶部导航挡住。

维护规则：

- 如果顶部导航高度变高，必须同步调大正文 `pt[...]`。
- 如果顶部导航高度变矮，可以同步调小正文 `pt[...]`。
- 不能只改顶部导航视觉高度，否则点击跳转和首屏内容都会出现遮挡。

## 4. 点击导航时如何移动到页面区块

点击顶部某个导航项时，会调用：

```tsx
onClick={() => jumpToSection(index)}
```

`jumpToSection(index)` 做三件事：

1. 用同一个 `index` 找到对应 section：

```tsx
const section = sectionRefs.current[index];
const step = progressSteps[index];
```

2. 打开对应编辑区：

```tsx
setExpandedSection(step.key);
setActiveTimeEditor(step.key === "time" ? "date" : null);
```

因此点击 `时间` 会默认打开日期编辑器；点击其他项会打开对应区块的编辑面板。

3. 平滑滚动到对应 section：

```tsx
section.scrollIntoView({ behavior: "smooth", block: "start" });
```

备注项有额外处理：

```tsx
if (step?.key === "remark") {
  window.setTimeout(() => {
    remarkInputRef.current?.focus();
  }, 320);
}
```

因为滚动是 smooth 动画，备注输入框要等滚动接近完成后再 focus，避免键盘或焦点提前抢布局。

## 5. 页面滚动时如何反向点亮顶部导航

页面滚动时会监听 `window.scroll` 和 `window.resize`。

核心逻辑：

```tsx
const progressBottom = progressBarRef.current?.getBoundingClientRect().bottom ?? 138;
const threshold = progressBottom + Math.max(0, (window.innerHeight - progressBottom) / 2);
let nextStep = 0;

sectionRefs.current.forEach((section, index) => {
  if (section && section.getBoundingClientRect().top <= threshold) {
    nextStep = index;
  }
});

setActiveProgressStep((current) => (current === nextStep ? current : nextStep));
```

可以理解为：

1. 先取顶部进度条底部位置 `progressBottom`。
2. 再取从进度条底部到屏幕底部这段可视区域的中线，作为判断线 `threshold`。
3. 从上到下扫描所有 section。
4. 只要某个 section 的顶部已经进入判断线以上，就认为用户已经滚到这个 section。
5. 最后一个满足条件的 section，就是当前激活 step。

这不是用 section 顶部是否贴到屏幕最上方判断，而是用“顶部导航下方可视区域的中线”判断。这样用户刚看到下一个 section 的主体内容时，顶部导航就会比较自然地切到下一项。

## 6. 为什么截图里前两个导航都高亮

顶部导航渲染时使用：

```tsx
active={index <= activeProgressStep}
```

所以它不是只高亮当前一个，而是高亮“已经经过的步骤”。

例如：

| `activeProgressStep` | 高亮结果 |
|---:|---|
| 0 | 只高亮 `套餐` |
| 1 | 高亮 `套餐` + `到店服务 / 上门服务` |
| 2 | 高亮 `套餐` + `服务方式` + `时间` |
| 5 | 六项全部高亮 |

截图里页面已经滚到 `服务方式` 区块附近，所以 `activeProgressStep = 1`，顶部 `套餐` 和 `到店服务` 同时高亮。

如果产品希望只高亮当前步骤，把渲染条件改成：

```tsx
active={index === activeProgressStep}
```

但当前设计是进度条语义，所以使用 `<=`。

## 7. 为什么每个 section 都有 `scroll-mt-[170px]`

每个可跳转区块都写了：

```tsx
className="scroll-mt-[170px] ..."
```

`scroll-mt` 是给 `scrollIntoView({ block: "start" })` 用的滚动偏移量。

它的作用是：点击顶部导航跳到某个区块时，不让区块标题被固定顶部导航压住，而是让区块顶部停在顶部导航下方约 170px 的位置。

维护规则：

- 顶部固定栏高度变化时，`scroll-mt-[170px]` 要跟着校准。
- `PageScaffold` 的顶部 padding 和 section 的 `scroll-mt` 要一起看。
- 如果只改其中一个，会出现“首屏不挡，但点击跳转挡住”或“点击不挡，但首屏空白过大”的问题。

## 8. 新增、删除或调整导航项时必须同步修改

因为当前机制靠 index 对齐，所以修改时必须同时改三处。

### 8.1 修改 `CheckoutEditorSection` 类型

例如新增 `coupon`：

```ts
type CheckoutEditorSection =
  | "package"
  | "fulfillment"
  | "time"
  | "location"
  | "technician"
  | "remark"
  | "coupon";
```

### 8.2 修改 `progressSteps`

把新项插入正确位置：

```ts
{ key: "coupon", label: "优惠", icon: "package" as const }
```

如果需要新图标，还要扩展 `CheckoutProgressIcon` 和 `CheckoutProgressGlyph`。

### 8.3 修改页面 section 的 ref 下标

页面中每个 section 的 ref 必须和 `progressSteps` 顺序一致：

```tsx
ref={(node) => void (sectionRefs.current[0] = node)} // package
ref={(node) => void (sectionRefs.current[1] = node)} // fulfillment
ref={(node) => void (sectionRefs.current[2] = node)} // time
ref={(node) => void (sectionRefs.current[3] = node)} // location
ref={(node) => void (sectionRefs.current[4] = node)} // technician
ref={(node) => void (sectionRefs.current[5] = node)} // remark
```

如果中间插入新 section，后面的下标都必须顺延。

## 9. 推荐维护方式

当前实现可运行，但维护成本主要来自“手写 index”。后续如果要更稳，可以改成 key-based ref。

推荐方向：

```ts
const sectionRefs = useRef<Record<CheckoutEditorSection, HTMLDivElement | null>>({
  package: null,
  fulfillment: null,
  time: null,
  location: null,
  technician: null,
  remark: null
});
```

然后 section 写成：

```tsx
ref={(node) => {
  sectionRefs.current.package = node;
}}
```

导航点击时用：

```ts
const section = sectionRefs.current[step.key];
```

这样以后新增或调整顺序时，只需要改 `progressSteps` 顺序，不容易因为 ref 下标漏改导致跳错区块。

## 10. 验收检查清单

改这块逻辑后，至少检查以下场景：

- 进入 `/checkout/:serviceId` 后，首屏 `套餐` 不被顶部导航遮挡。
- 点击 `套餐 / 服务方式 / 时间 / 地址 / 技师 / 备注` 都能滚到对应区块。
- 点击 `时间` 后默认展开日期编辑器。
- 点击 `备注` 后滚动完成并聚焦备注输入框。
- 手动向下滚动时，顶部高亮能随着 section 前进。
- 手动向上滚动时，顶部高亮能随着 section 回退。
- 切换 `到店服务 / 上门服务` 后，顶部第二项文案同步变化，但仍然跳到服务方式区块。
- 移动端安全区、不同屏高下，点击跳转后 section 标题不被顶部固定栏遮挡。
