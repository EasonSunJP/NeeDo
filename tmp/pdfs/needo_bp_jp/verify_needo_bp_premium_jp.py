from __future__ import annotations

import hashlib
from io import BytesIO
from pathlib import Path

from PIL import Image
from pypdf import PdfReader


ROOT = Path("/Users/eason/Documents/New project")
PDF = ROOT / "output/pdf/NeeDoBP_JP_投資家向けKeyVisual固定プレミアム版_V4_14ページ_2026-08-14.pdf"
SOURCE_DIR = ROOT / "tmp/pdfs/needo_bp_jp/source"
CN_SOURCE_DIR = ROOT / "tmp/pdfs/needo_bp_source"
COPYRIGHT_TEXT = "Copyright © 2026 LifeDance Co., Ltd. All Rights Reserved."

# Final page -> immutable original art master.
KV_PAGE_MAP = {1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 9, 8: 7, 10: 8}

SEARCHABLE_KV_TEXT = {
    1: "NeeDo Business Plan",
    2: "市場機会",
    3: "供給側の変化が市場を開く",
    4: "NeeDoの解決策",
    5: "デュアル取引エンジン",
    6: "参入障壁",
    7: "3段階成長戦略",
    8: "18カ月プロダクトロードマップ",
    10: "東京主要3区で実証",
}

REQUIRED = [
    "8.23兆円",
    "7,302億円",
    "+6.54%",
    "59.0%",
    "Y3 施術者／サービス提供者",
    "Y3 完了注文数",
    "Y3 店舗数",
    "高成長シナリオのY3予測｜マッサージ事業のみ",
    "18カ月プロダクトロードマップ",
    "M0–3 テスト",
    "店舗直結",
    "個別",
    "グループ",
    "総合評価｜点数＋理由",
    "HOGUGU",
    "29.8〜40.8%",
    "安心サポート料500円",
    "日付指定は＋10%",
    "地域・プラン別見積り",
    "約2%〜",
    "別途売上歩合なし",
    "500円／課金対象注文",
    "試験エリア目標",
    "500件超／日",
    "3カ年財務予測",
    "※マッサージ事業のみ",
    "主要財務前提",
    "2億円 / 10%",
    "642.2%",
    "WX：EasonSunJP",
]

FORBIDDEN = [
    "平均施術者／サービス提供者",
    "V4.2 核心功能口径",
    "Y1现金低于安全线",
    "ビジョンとExit",
    "Vision & Exit",
    "Pre-Money",
    "成约手数料あり",
    "统一率未公开",
    "SaaS月费：保守版1,000日元",
]

REQUIRED_URLS = {
    "https://www.meti.go.jp/press/2025/08/20250826005/20250826005-a.pdf",
    "https://hba.beauty.hotpepper.jp/search/column/c_rela/70640/2/",
    "https://beauty.hotpepper.jp/doc/keisai/keisai.html",
    "https://cdn.p.recruit.co.jp/terms/hpb-t-1009/index.html",
    "https://beauty.hotpepper.jp/doc/info/system_info/info_20251110.html?ctm=c_all_info_03",
    "https://minimodel.jp/info",
    "https://airregi.jp/reserve/",
    "https://faq.curama.jp/docs/shop/fees-and-invoicing/",
    "https://info.hogugu.com/guide.html",
    "https://client-help.line-sukimani.me/hc/ja/articles/13732183183887",
}


def page_urls(page) -> set[str]:
    urls: set[str] = set()
    for annot_ref in page.get("/Annots") or []:
        annot = annot_ref.get_object()
        action = annot.get("/A")
        if action and action.get("/URI"):
            urls.add(str(action.get("/URI")))
    return urls


def font_names(page) -> set[str]:
    resources = page.get("/Resources") or {}
    fonts = resources.get("/Font") or {}
    return {str(font_ref.get_object().get("/BaseFont", "")) for font_ref in fonts.values()}


def rgb_digest(image: Image.Image) -> str:
    image = image.convert("RGB")
    return hashlib.sha256(image.tobytes()).hexdigest()


def largest_page_image(page) -> Image.Image:
    candidates: list[Image.Image] = []
    for item in page.images:
        try:
            candidates.append(Image.open(BytesIO(item.data)).convert("RGB"))
        except Exception:
            continue
    assert candidates, "page has no raster master"
    return max(candidates, key=lambda image: image.width * image.height)


def main() -> None:
    reader = PdfReader(str(PDF))
    assert len(reader.pages) == 14
    texts: list[str] = []
    all_fonts: set[str] = set()
    all_urls: set[str] = set()
    for idx, page in enumerate(reader.pages, start=1):
        assert abs(float(page.mediabox.width) - 960) < 0.1, (idx, page.mediabox.width)
        assert abs(float(page.mediabox.height) - 540) < 0.1, (idx, page.mediabox.height)
        text = page.extract_text() or ""
        texts.append(text)
        all_fonts.update(font_names(page))
        all_urls.update(page_urls(page))

        copyright_runs: list[tuple[float, float, str]] = []

        def visit_text(text, _cm, tm, font_dict, font_size) -> None:
            if COPYRIGHT_TEXT in text:
                base_font = str(font_dict.get("/BaseFont", "")) if font_dict else ""
                copyright_runs.append((float(font_size), float(tm[5]), base_font))

        page.extract_text(visitor_text=visit_text)
        assert len(copyright_runs) == 1, (idx, copyright_runs)
        size, baseline, base_font = copyright_runs[0]
        assert abs(size - 5.4) < 0.01, (idx, size)
        assert abs(baseline - 4.7) < 0.01, (idx, baseline)
        assert "Roboto-Medium" in base_font, (idx, base_font)

    # Prove that every art-led page contains the original master pixels, not a
    # regenerated substitute.  Vector overlays do not affect this comparison.
    for final_page, source_page in KV_PAGE_MAP.items():
        embedded = largest_page_image(reader.pages[final_page - 1])
        source_root = CN_SOURCE_DIR if final_page == 10 else SOURCE_DIR
        source = Image.open(source_root / f"page-{source_page:02d}.png").convert("RGB")
        assert embedded.size == source.size == (1920, 1080), (final_page, embedded.size, source.size)
        assert rgb_digest(embedded) == rgb_digest(source), f"Key Visual drift on final page {final_page}"
        assert SEARCHABLE_KV_TEXT[final_page] in texts[final_page - 1], f"missing searchable narrative on page {final_page}"

    full_text = "\n".join(texts)
    for value in REQUIRED:
        assert value in full_text, f"missing required: {value}"
    for value in FORBIDDEN:
        assert value not in full_text, f"forbidden present: {value}"

    # Sequence is verified by immutable art hashes: strategy master p09 before
    # roadmap master p07; competitor remains p09; Tokyo pilot remains p10.
    assert "18カ月プロダクトロードマップ" in texts[7]
    assert "HOGUGU" in texts[8]
    assert "試験エリア目標" in texts[9]
    assert texts[8].find("店舗直結") < texts[8].find("個別") < texts[8].find("グループ")
    fee_header_start = texts[8].find("月額")
    assert fee_header_start < texts[8].find("成果／従量課金", fee_header_start) < texts[8].find("歩合／決済手数料", fee_header_start) < texts[8].find("総合評価", fee_header_start)
    assert len(page_urls(reader.pages[1])) == 2
    assert len(page_urls(reader.pages[8])) >= 8
    assert REQUIRED_URLS.issubset(all_urls), REQUIRED_URLS - all_urls

    banned_fonts = ("STHeiti", "MiSans", "HeiTi", "SimSun")
    assert not any(any(bad in name for bad in banned_fonts) for name in all_fonts), sorted(all_fonts)
    assert any("ZenKakuGothicAntique-Bold" in name for name in all_fonts)
    assert any("ZenKakuGothicAntique-Regular" in name for name in all_fonts)
    assert any("ZenKakuGothicAntique-Medium" in name for name in all_fonts)

    simplified_chinese_markers = ["融资", "财务", "预测", "用户", "店铺", "服务", "订单", "增长", "广告", "金额", "仅按摩类"]
    assert not any(marker in full_text for marker in simplified_chinese_markers), [marker for marker in simplified_chinese_markers if marker in full_text]

    digest = hashlib.sha256(PDF.read_bytes()).hexdigest()
    print(f"PAGES={len(reader.pages)}")
    print("PAGE_SIZE=960x540")
    print(f"KV_LOCKED_PAGES={len(KV_PAGE_MAP)}")
    print("KV_PIXEL_DIGESTS=PASS")
    print("KV_SEARCHABLE_TEXT=PASS")
    print(f"REQUIRED_CHECKS={len(REQUIRED)}")
    print(f"FORBIDDEN_CHECKS={len(FORBIDDEN)}")
    print(f"MARKET_LINKS={len(page_urls(reader.pages[1]))}")
    print(f"COMPETITOR_LINKS={len(page_urls(reader.pages[8]))}")
    print("PAGE_ORDER=STRATEGY_THEN_ROADMAP_THEN_COMPETITOR_THEN_PILOT")
    print("IM_COLUMNS=店舗直結IM|個別|グループ")
    print("PRICING_COLUMNS=月額|成果／従量課金|歩合／決済手数料")
    print("EVALUATION_COLUMN=総合評価|点数＋理由")
    print("SIMPLIFIED_CHINESE_MARKERS=0")
    print("COPYRIGHT_STYLE=Roboto-Medium|5.4pt|baseline4.7|14/14")
    print(f"FONT_RESOURCES={len(all_fonts)}")
    print(f"SHA256={digest}")


if __name__ == "__main__":
    main()
