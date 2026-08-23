# Task 1 實現報告：新版資料與披露鎖定

## 狀態

完成。Task 1 只新增 premium roadshow 的資料層與聚焦測試，沒有修改頁面設計、既有 PPT builder 或任何輸出 PPT。

## 修改文件

- `scripts/needo-roadshow-premium/content.mjs`
  - 從 `scripts/needo-roadshow/data.mjs` 匯入 `financing`、`scenarios`、`economics`、`market`、`sources` 與既有 34 頁標題。
  - 匯出 `premiumSlides`，每筆固定包含 `page`、`title`、`statement`、`mode`、`source`。
  - 鎖定 34 頁順序與七頁深色頁：2、10、16、19、26、31、34。
  - 將融資條件、三種情境、單位經濟、市場數據、合規邊界、內部資料披露與來源標記放入相應頁面的 statement/source。
  - 加入 34 頁數量與既有標題數量不一致時的明確錯誤檢查。
- `scripts/needo-roadshow-premium/data.test.mjs`
  - 新增資料鎖定測試，覆蓋 34 頁、深色頁位置、融資條件與一般／激進店鋪情境。

## TDD 證據

1. 先建立測試並執行 `npm test -- scripts/needo-roadshow-premium/data.test.mjs`。
2. RED 已確認：Vitest 報告 `Cannot find module './content.mjs'`。
3. 建立 `content.mjs` 後再次執行聚焦測試，結果為 2 tests passed。
4. 最終完整測試僅執行一次，結果如下：

   - `Test Files 112 passed (112)`
   - `Tests 578 passed (578)`

## 範圍與顧慮

- 未生成、修改或驗證任何 PPT/PDF 輸出，符合本任務不得越界修改頁面設計或輸出的限制。
- `S5`、`S6`、`S7` 仍明確標示為 NeeDo 內部模型／重算／商談資料，不被表述為第三方審計或已實現收入。
- `100+ 店鋪使用意向` 保留為商談訊號，statement 明確說明不等同簽約、付費或 GMV。
- 工作區原有無關未提交修改已保留，未被暫存。
