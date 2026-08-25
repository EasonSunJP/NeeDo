from __future__ import annotations

import hashlib
from io import BytesIO
from pathlib import Path

from PIL import Image
from pypdf import PdfReader


ROOT = Path("/Users/eason/Documents/New project")
PDF = ROOT / "output/pdf/NeeDoBP_CN_投资人KeyVisual锁定精致版_V4_14页_2026-08-14.pdf"
SOURCE_DIR = ROOT / "tmp/pdfs/needo_bp_source"
COPYRIGHT_TEXT = "Copyright © 2026 LifeDance Co., Ltd. All Rights Reserved."

# Final page -> immutable original art master.
KV_PAGE_MAP = {1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 9, 8: 7, 10: 8}

SEARCHABLE_KV_TEXT = {
    1: "NeeDo Business Plan",
    2: "市场机会",
    3: "供给侧觉醒与零工经济爆发",
    4: "NeeDo的解决方案",
    5: "双轨交易引擎",
    6: "核心壁垒",
    7: "三步走战略",
    8: "18个月版本迭代路线图",
    10: "东京核心三区试点",
}

REQUIRED = [
    "8.23万亿",
    "7,302亿",
    "+6.54%",
    "59.0%",
    "Y3技师/服务者",
    "Y3完成订单",
    "Y3店铺数",
    "高速增长版Y3数据预测｜仅按摩类",
    "18个月版本迭代路线图",
    "M0–3测试",
    "店铺直连",
    "私聊",
    "群聊",
    "总评价｜分数+理由",
    "HOGUGU",
    "29.8%–40.8%",
    "安心支持费500日元",
    "日付另加10%",
    "按地区/方案个别报价",
    "约2%起",
    "无另列成交抽成",
    "500日元/收费资格订单",
    "试点区域目标",
    "500+服务/日",
    "三年财务预测",
    "*仅按摩类",
    "关键财务假设",
    "融资2亿日元 / 10%",
    "642.2%",
    "WX：EasonSunJP",
]

FORBIDDEN = [
    "平均技师/服务者",
    "V4.2 核心功能口径",
    "Y1现金低于安全线",
    "愿景与退出",
    "Vision & Exit",
    "投前估值",
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
        source = Image.open(SOURCE_DIR / f"page-{source_page:02d}.png").convert("RGB")
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
    assert "18个月版本迭代路线图" in texts[7]
    assert "HOGUGU" in texts[8]
    assert "试点区域目标" in texts[9]
    assert texts[8].find("店铺直连") < texts[8].find("私聊") < texts[8].find("群聊")
    assert texts[8].find("月额") < texts[8].find("成果/单次费") < texts[8].find("抽成/支付费率") < texts[8].find("总评价")
    assert len(page_urls(reader.pages[1])) == 2
    assert len(page_urls(reader.pages[8])) >= 8
    assert REQUIRED_URLS.issubset(all_urls), REQUIRED_URLS - all_urls

    banned_fonts = ("STHeiti", "Noto", "HeiTi", "SimSun")
    assert not any(any(bad in name for bad in banned_fonts) for name in all_fonts), sorted(all_fonts)
    assert any("MiSans-Semibold" in name for name in all_fonts)
    assert any("MiSans-Regular" in name for name in all_fonts)
    assert any("MiSans-Heavy" in name for name in all_fonts)

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
    print("IM_COLUMNS=店铺直连IM|私聊|群聊")
    print("PRICING_COLUMNS=月额|成果/单次费|抽成/支付费率")
    print("EVALUATION_COLUMN=总评价|分数+理由")
    print("COPYRIGHT_STYLE=Roboto-Medium|5.4pt|baseline4.7|14/14")
    print(f"FONT_RESOURCES={len(all_fonts)}")
    print(f"SHA256={digest}")


if __name__ == "__main__":
    main()
