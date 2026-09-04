import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { pricingModeTranslations } from "./i18n";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const expectedPricingModeTranslations = {
  "切换为店铺定价": { "zh-Hant": "切換為店鋪定價", ja: "店舗価格に切り替え", en: "Switch to store pricing", ko: "매장 가격으로 전환" },
  "切换为技师定价": { "zh-Hant": "切換為技師定價", ja: "スタッフ価格に切り替え", en: "Switch to technician pricing", ko: "스태프 가격으로 전환" },
  "定价模式": { "zh-Hant": "定價模式", ja: "価格モード", en: "Pricing mode", ko: "가격 모드" },
  "店铺定价": { "zh-Hant": "店鋪定價", ja: "店舗価格", en: "Store pricing", ko: "매장 가격" },
  "技师定价": { "zh-Hant": "技師定價", ja: "スタッフ価格", en: "Technician pricing", ko: "스태프 가격" },
  "保存": { "zh-Hant": "儲存", ja: "保存", en: "Save", ko: "저장" },
  "编辑": { "zh-Hant": "編輯", ja: "編集", en: "Edit", ko: "편집" },
  "服务名称": { "zh-Hant": "服務名稱", ja: "サービス名", en: "Service Name", ko: "서비스 이름" },
  "服务信息": { "zh-Hant": "服務資訊", ja: "サービス情報", en: "Service Information", ko: "서비스 정보" },
  "价格": { "zh-Hant": "價格", ja: "価格", en: "Price", ko: "가격" },
  "取消": { "zh-Hant": "取消", ja: "キャンセル", en: "Cancel", ko: "취소" },
  "上移": { "zh-Hant": "上移", ja: "上へ進む", en: "Move up", ko: "위로 이동" },
  "下移": { "zh-Hant": "下移", ja: "下へ移動", en: "Move down", ko: "아래로 이동" },
  "添加服务": { "zh-Hant": "添加服務", ja: "追加サービス", en: "AddService", ko: "추가서비스" },
  "未读取": { "zh-Hant": "未讀取", ja: "未取得", en: "Unavailable", ko: "불러오지 못함" },
  "再次点击确认删除": { "zh-Hant": "再次點擊確認刪除", ja: "もう一度押して削除を確定", en: "Click again to confirm deletion", ko: "삭제하려면 다시 누르세요" },
  "更换图片": { "zh-Hant": "更換圖片", ja: "画像を変更", en: "Change image", ko: "이미지 변경" },
  "移除图片": { "zh-Hant": "移除圖片", ja: "画像を削除", en: "Remove image", ko: "이미지 삭제" },
  "服务封面": { "zh-Hant": "服務封面", ja: "サービスカバー", en: "Service cover", ko: "서비스 커버" },
  "上传服务封面": { "zh-Hant": "上傳服務封面", ja: "サービスカバーをアップロード", en: "Upload service cover", ko: "서비스 커버 업로드" },
  "恢复当前封面": { "zh-Hant": "恢復目前封面", ja: "現在のカバーを復元", en: "Restore current cover", ko: "현재 커버 복원" },
  "JPEG / PNG / WebP，最大 8 MiB": { "zh-Hant": "JPEG / PNG / WebP，最大 8 MiB", ja: "JPEG / PNG / WebP、最大 8 MiB", en: "JPEG / PNG / WebP, up to 8 MiB", ko: "JPEG / PNG / WebP, 최대 8 MiB" },
  "仅支持 JPEG、PNG 或 WebP 图片": { "zh-Hant": "僅支援 JPEG、PNG 或 WebP 圖片", ja: "JPEG、PNG、WebP 画像のみ対応しています", en: "Only JPEG, PNG, or WebP images are supported", ko: "JPEG, PNG 또는 WebP 이미지만 지원합니다" },
  "图片不能超过 8 MiB": { "zh-Hant": "圖片不能超過 8 MiB", ja: "画像は 8 MiB 以下にしてください", en: "The image must not exceed 8 MiB", ko: "이미지는 8 MiB를 초과할 수 없습니다" },
  "服务已保存，封面上传失败，请重试": { "zh-Hant": "服務已儲存，封面上傳失敗，請重試", ja: "サービスは保存されましたが、カバーのアップロードに失敗しました。再試行してください", en: "Service saved, but the cover upload failed. Please retry", ko: "서비스는 저장되었지만 커버 업로드에 실패했습니다. 다시 시도해 주세요" },
  "封面上传失败，请重试": { "zh-Hant": "封面上傳失敗，請重試", ja: "カバーのアップロードに失敗しました。再試行してください", en: "Cover upload failed. Please retry", ko: "커버 업로드에 실패했습니다. 다시 시도해 주세요" },
  "重试上传封面": { "zh-Hant": "重試上傳封面", ja: "カバーのアップロードを再試行", en: "Retry cover upload", ko: "커버 업로드 다시 시도" },
  "服务已保存，封面移除失败，请重试": { "zh-Hant": "服務已儲存，封面移除失敗，請重試", ja: "サービスは保存されましたが、カバーの削除に失敗しました。再試行してください", en: "Service saved, but cover removal failed. Please retry", ko: "서비스는 저장되었지만 커버 삭제에 실패했습니다. 다시 시도해 주세요" },
  "封面移除失败，请重试": { "zh-Hant": "封面移除失敗，請重試", ja: "カバーの削除に失敗しました。再試行してください", en: "Cover removal failed. Please retry", ko: "커버 삭제에 실패했습니다. 다시 시도해 주세요" },
  "重试移除封面": { "zh-Hant": "重試移除封面", ja: "カバーの削除を再試行", en: "Retry cover removal", ko: "커버 삭제 다시 시도" },
  "完成并关闭": { "zh-Hant": "完成並關閉", ja: "完了して閉じる", en: "Finish and close", ko: "완료 후 닫기" }
} as const;

describe("pricing mode translations", () => {
  it("contains the exact 31-key pricing and service-editor translation contract", () => {
    expect(pricingModeTranslations).toEqual(expectedPricingModeTranslations);
  });

  it("keeps both i18n audit loaders compatible with the extracted feature map", () => {
    for (const script of ["scripts/i18n-audit.mjs", "scripts/i18n-quality-audit.mjs"]) {
      expect(() => execFileSync(process.execPath, [script], {
        cwd: workspaceRoot,
        encoding: "utf8",
        stdio: "pipe"
      })).not.toThrow();
    }
  });
});
