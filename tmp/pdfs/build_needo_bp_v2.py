from __future__ import annotations

from pathlib import Path

from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import Color, HexColor, white
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path("/Users/eason/Documents/New project")
SOURCE_PDF = Path("/Users/eason/Downloads/NeeDoBP/NeeDoBP_CN_后3页数字修正版.pdf")
SOURCE_RENDER_DIR = ROOT / "tmp/pdfs/needo_bp_source"
WORK_DIR = ROOT / "tmp/pdfs/needo_bp_v2"
OUTPUT_DIR = ROOT / "output/pdf"
NEW_PAGES_PDF = WORK_DIR / "new_pages_10_11.pdf"
OUTPUT_PDF = OUTPUT_DIR / "NeeDoBP_CN_双情景财务及融资修正版_V2_2026-08-14.pdf"

PAGE_W = 960
PAGE_H = 540

GREEN_DARK = HexColor("#075A39")
GREEN = HexColor("#148657")
GREEN_MID = HexColor("#49B77D")
GREEN_LIGHT = HexColor("#E7F4EA")
GREEN_PALE = HexColor("#F4FAF5")
ORANGE = HexColor("#E4A126")
ORANGE_PALE = HexColor("#FFF5DF")
TEXT = HexColor("#17201D")
MUTED = HexColor("#66736D")
BORDER = HexColor("#DDE7E0")
WARM = HexColor("#FBFAF6")
RED = HexColor("#CB493F")


def register_fonts() -> None:
    pdfmetrics.registerFont(
        TTFont(
            "CJK",
            "/System/Library/Fonts/STHeiti Light.ttc",
            subfontIndex=0,
        )
    )
    pdfmetrics.registerFont(
        TTFont(
            "CJK-Bold",
            "/System/Library/Fonts/STHeiti Medium.ttc",
            subfontIndex=0,
        )
    )
    pdfmetrics.registerFont(TTFont("Roboto", "/Library/Fonts/Roboto-Regular.ttf"))
    pdfmetrics.registerFont(TTFont("Roboto-Medium", "/Library/Fonts/Roboto-Medium.ttf"))
    pdfmetrics.registerFont(TTFont("Roboto-Bold", "/Library/Fonts/Roboto-Bold.ttf"))


def shadow_card(c: canvas.Canvas, x: float, y: float, w: float, h: float, radius: float = 12, fill=white) -> None:
    c.saveState()
    c.setFillColor(Color(0.1, 0.2, 0.15, alpha=0.09))
    c.roundRect(x + 2.2, y - 3.2, w, h, radius, stroke=0, fill=1)
    c.setFillColor(fill)
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.7)
    c.roundRect(x, y, w, h, radius, stroke=1, fill=1)
    c.restoreState()


def pill(c: canvas.Canvas, x: float, y: float, w: float, h: float, label: str, fill, color=GREEN_DARK, font="CJK-Bold", size=9) -> None:
    c.setFillColor(fill)
    c.roundRect(x, y, w, h, h / 2, stroke=0, fill=1)
    c.setFillColor(color)
    c.setFont(font, size)
    c.drawCentredString(x + w / 2, y + (h - size) / 2 + 1.5, label)


def label_value(c: canvas.Canvas, x: float, y: float, label: str, value: str, accent=GREEN_DARK, value_size=19) -> None:
    c.setFillColor(MUTED)
    c.setFont("CJK", 7.2)
    c.drawString(x, y + 19, label)
    c.setFillColor(accent)
    c.setFont("Roboto-Bold", value_size)
    c.drawString(x, y, value)


def metric_table(
    c: canvas.Canvas,
    x: float,
    y: float,
    w: float,
    rows: list[tuple[str, list[str], str]],
    header_fill,
    accent,
) -> None:
    label_w = 116
    value_w = (w - label_w) / 3
    header_h = 24
    row_h = 23
    total_h = header_h + row_h * len(rows)

    c.setFillColor(white)
    c.setStrokeColor(BORDER)
    c.roundRect(x, y, w, total_h, 9, stroke=1, fill=1)
    c.setFillColor(header_fill)
    c.roundRect(x, y + total_h - header_h, w, header_h, 9, stroke=0, fill=1)
    c.rect(x, y + total_h - header_h, w, header_h / 2, stroke=0, fill=1)

    c.setFillColor(accent)
    c.setFont("CJK-Bold", 8.2)
    c.drawString(x + 11, y + total_h - 16, "核心指标")
    for idx, year in enumerate(("Y1", "Y2", "Y3")):
        c.drawCentredString(x + label_w + value_w * (idx + 0.5), y + total_h - 16, year)

    for row_idx, (label, values, kind) in enumerate(rows):
        row_y = y + total_h - header_h - row_h * (row_idx + 1)
        if row_idx % 2 == 1:
            c.setFillColor(GREEN_PALE)
            c.rect(x + 0.5, row_y, w - 1, row_h, stroke=0, fill=1)
        c.setStrokeColor(BORDER)
        c.setLineWidth(0.4)
        c.line(x, row_y, x + w, row_y)
        c.setFillColor(TEXT)
        c.setFont("CJK", 7.3)
        c.drawString(x + 11, row_y + 7.4, label)
        for idx, value in enumerate(values):
            value_color = TEXT
            if kind == "profit" and value.startswith("-"):
                value_color = RED
            elif kind in {"profit", "cash"}:
                value_color = accent
            c.setFillColor(value_color)
            c.setFont("Roboto-Medium", 8.3)
            c.drawCentredString(x + label_w + value_w * (idx + 0.5), row_y + 7.1, value)

    c.setStrokeColor(BORDER)
    c.setLineWidth(0.5)
    c.line(x + label_w, y, x + label_w, y + total_h)
    for idx in (1, 2):
        xx = x + label_w + value_w * idx
        c.line(xx, y, xx, y + total_h)


def draw_financial_page(c: canvas.Canvas) -> None:
    bg = SOURCE_RENDER_DIR / "page-10.png"
    c.drawImage(str(bg), 0, 0, width=PAGE_W, height=PAGE_H)

    # Refresh subtitle while preserving the original title and page atmosphere.
    c.setFillColor(WARM)
    c.rect(25, 412, 650, 38, stroke=0, fill=1)
    c.setFillColor(white)
    c.rect(239, 448, 150, 24, stroke=0, fill=1)
    c.setFillColor(RED)
    c.setFont("CJK-Bold", 9.2)
    c.drawString(243, 456, "*仅按摩类")
    pill(c, 306, 452, 59, 17, "双情景版", GREEN_LIGHT, GREEN_DARK, size=8.2)
    c.setFillColor(GREEN_DARK)
    c.setFont("Roboto-Medium", 14)
    c.drawString(31, 428, "3-Year Financial Projections · Conservative vs. High Growth")
    c.setStrokeColor(GREEN_MID)
    c.setLineWidth(2.2)
    c.line(31, 416, 68, 416)

    # Opaque content canvas over the old base-case graphics.
    c.setFillColor(WARM)
    c.roundRect(25, 42, 910, 374, 14, stroke=0, fill=1)

    # Scenario A.
    ax, ay, aw, ah = 34, 70, 435, 330
    shadow_card(c, ax, ay, aw, ah, radius=15, fill=white)
    pill(c, ax + 16, ay + ah - 39, 94, 24, "方案A  保守增长", GREEN_LIGHT, GREEN_DARK, size=9.2)
    c.setFillColor(TEXT)
    c.setFont("CJK-Bold", 11.5)
    c.drawString(ax + 121, ay + ah - 32, "500 → 1,000 → 2,000 家店")
    c.setFillColor(MUTED)
    c.setFont("CJK", 7.2)
    c.drawString(ax + 16, ay + ah - 56, "控制开发与投放节奏；外国用户人数为高速版10%")

    label_value(c, ax + 18, ay + ah - 104, "三年累计营收（MJPY）", "735.8")
    label_value(c, ax + 158, ay + ah - 104, "三年累计营业利润（MJPY）", "+4.6")
    label_value(c, ax + 331, ay + ah - 104, "Y3营业利润率", "14.8%", value_size=18)

    metric_table(
        c,
        ax + 16,
        ay + 55,
        aw - 32,
        [
            ("营业收入（MJPY）", ["41.9", "200.0", "494.0"], "revenue"),
            ("营业利润（MJPY）", ["-56.0", "-12.5", "73.0"], "profit"),
            ("期末现金（MJPY）", ["144.0", "131.6", "204.6"], "cash"),
            ("期末店铺数", ["500", "1,000", "2,000"], "stores"),
            ("外国男性用户（千人）", ["22.8", "48.9", "104.6"], "users"),
        ],
        GREEN_LIGHT,
        GREEN_DARK,
    )
    c.setFillColor(GREEN_PALE)
    c.roundRect(ax + 16, ay + 14, aw - 32, 29, 10, stroke=0, fill=1)
    c.setFillColor(GREEN_DARK)
    c.setFont("CJK", 7.1)
    c.drawString(ax + 29, ay + 24, "外国用户：高速版人数 × 10%；1次/人/年  ｜  新店前三个月免费")

    # Scenario B.
    bx, by, bw, bh = 491, 70, 435, 330
    shadow_card(c, bx, by, bw, bh, radius=15, fill=white)
    pill(c, bx + 16, by + bh - 39, 112, 24, "方案B  高速增长", ORANGE_PALE, HexColor("#B46A00"), size=9.2)
    c.setFillColor(TEXT)
    c.setFont("CJK-Bold", 11.5)
    c.drawString(bx + 139, by + bh - 32, "1,000 → 2,000 → 4,000 家店")
    c.setFillColor(MUTED)
    c.setFont("CJK", 7.2)
    c.drawString(bx + 16, by + bh - 56, "前置投入换取规模；Y1广告及品牌推广1.08亿日元")

    label_value(c, bx + 18, by + bh - 104, "三年累计营收（MJPY）", "4,526.6", HexColor("#B46A00"), 18)
    label_value(c, bx + 174, by + bh - 104, "三年累计营业利润（MJPY）", "+1,284.3", HexColor("#B46A00"), 18)
    label_value(c, bx + 347, by + bh - 104, "Y3营业利润率", "39.7%", HexColor("#B46A00"), 18)

    metric_table(
        c,
        bx + 16,
        by + 55,
        bw - 32,
        [
            ("营业收入（MJPY）", ["263.5", "1,233.7", "3,029.4"], "revenue"),
            ("营业利润（MJPY）", ["-177.7", "260.0", "1,202.0"], "profit"),
            ("期末现金（MJPY）", ["22.3", "282.3", "1,484.3"], "cash"),
            ("期末店铺数", ["1,000", "2,000", "4,000"], "stores"),
            ("外国男性用户（千人）", ["228.4", "488.7", "1,045.8"], "users"),
        ],
        ORANGE_PALE,
        HexColor("#B46A00"),
    )
    c.setFillColor(ORANGE_PALE)
    c.roundRect(bx + 16, by + 14, bw - 32, 29, 10, stroke=0, fill=1)
    c.setFillColor(HexColor("#9B5A00"))
    c.setFont("CJK", 7.1)
    c.drawString(bx + 29, by + 24, "外国用户渗透率1%/2%/4%；2次/人/年")

    c.setFillColor(MUTED)
    c.setFont("CJK", 6.4)
    c.drawString(34, 49, "注：金额单位为百万日元（MJPY）；营业利润作为简化现金流口径。详细假设与公式以三年财务模型V1.4为准。")
    c.setFillColor(WARM)
    c.rect(25, 18, 910, 23, stroke=0, fill=1)


def funding_use_row(c: canvas.Canvas, x: float, y: float, label: str, amount: str, percent: int, color) -> None:
    c.setFillColor(TEXT)
    c.setFont("CJK", 8.2)
    c.drawString(x, y + 4, label)
    c.setFillColor(MUTED)
    c.setFont("Roboto-Medium", 7.7)
    c.drawRightString(x + 244, y + 4, amount)
    c.setFillColor(HexColor("#EDF2EE"))
    c.roundRect(x, y - 6, 244, 5, 2.5, stroke=0, fill=1)
    c.setFillColor(color)
    c.roundRect(x, y - 6, 244 * percent / 54, 5, 2.5, stroke=0, fill=1)


def scenario_finance_card(c: canvas.Canvas, x: float, y: float, w: float, h: float, title: str, subtitle: str, high: bool) -> None:
    accent = HexColor("#B46A00") if high else GREEN_DARK
    pale = ORANGE_PALE if high else GREEN_LIGHT
    shadow_card(c, x, y, w, h, radius=13, fill=white)
    pill(c, x + 14, y + h - 36, 102 if high else 92, 23, title, pale, accent, size=9)
    c.setFillColor(MUTED)
    c.setFont("CJK", 7)
    c.drawRightString(x + w - 14, y + h - 29, subtitle)

    if high:
        rows = [
            ("Y1期末现金", "22.3 MJPY"),
            ("三年累计营业利润", "+1,284.3 MJPY"),
            ("Y3期末现金", "1,484.3 MJPY"),
            ("安全线追加资金", "27.7 MJPY"),
        ]
    else:
        rows = [
            ("Y1期末现金", "144.0 MJPY"),
            ("三年累计营业利润", "+4.6 MJPY"),
            ("Y3期末现金", "204.6 MJPY"),
            ("安全线追加资金", "0 MJPY"),
        ]
    start_y = y + h - 69
    for idx, (label, value) in enumerate(rows):
        yy = start_y - idx * 24
        if idx % 2 == 1:
            c.setFillColor(GREEN_PALE if not high else HexColor("#FFF9ED"))
            c.roundRect(x + 13, yy - 7, w - 26, 23, 6, stroke=0, fill=1)
        c.setFillColor(MUTED)
        c.setFont("CJK", 7.4)
        c.drawString(x + 20, yy, label)
        c.setFillColor(RED if (high and idx == 3) else accent)
        c.setFont("Roboto-Bold", 9.1)
        c.drawRightString(x + w - 20, yy, value)

    banner_y = y + 8
    c.setFillColor(pale)
    c.roundRect(x + 13, banner_y, w - 26, 29, 9, stroke=0, fill=1)
    c.setFillColor(accent)
    c.setFont("CJK-Bold", 7.7)
    message = "Y1需补足安全线或下调投放" if high else "首轮资金可覆盖当前三年路径"
    c.drawCentredString(x + w / 2, banner_y + 10.5, message)


def draw_funding_page(c: canvas.Canvas) -> None:
    bg = SOURCE_RENDER_DIR / "page-11.png"
    c.drawImage(str(bg), 0, 0, width=PAGE_W, height=PAGE_H)

    c.setFillColor(WARM)
    c.rect(25, 408, 910, 110, stroke=0, fill=1)
    c.setFillColor(GREEN_DARK)
    c.setFont("Roboto-Bold", 20)
    c.drawString(35, 504, "NeeDo")
    c.setFont("Roboto-Medium", 6.4)
    c.drawString(42, 494, "You Need, We Do")
    c.setFillColor(TEXT)
    c.setFont("CJK-Bold", 31)
    c.drawString(39, 451, "融资计划与财务情景")
    c.setFillColor(GREEN_DARK)
    c.setFont("Roboto-Medium", 14)
    c.drawString(39, 425, "Funding Plan & Scenario Analysis")
    pill(c, 754, 453, 160, 25, "融资 2亿日元 / 10%", GREEN_LIGHT, GREEN_DARK, size=9.2)
    c.setStrokeColor(GREEN_MID)
    c.setLineWidth(2.3)
    c.line(39, 412, 68, 412)

    c.setFillColor(WARM)
    c.roundRect(25, 42, 910, 364, 14, stroke=0, fill=1)

    # Financing terms and use of funds.
    lx, ly, lw, lh = 35, 80, 310, 305
    shadow_card(c, lx, ly, lw, lh, radius=15, fill=white)
    c.setFillColor(MUTED)
    c.setFont("CJK", 8)
    c.drawString(lx + 18, ly + lh - 28, "PRE-A 融资计划")
    c.setFillColor(GREEN_DARK)
    c.setFont("Roboto-Bold", 27)
    c.drawString(lx + 18, ly + lh - 63, "JPY 200M")
    c.setFillColor(TEXT)
    c.setFont("Roboto-Bold", 17)
    c.drawRightString(lx + lw - 18, ly + lh - 59, "for 10%")
    c.setStrokeColor(BORDER)
    c.line(lx + 18, ly + lh - 77, lx + lw - 18, ly + lh - 77)

    values = [
        ("投后估值", "JPY 2.0B"),
        ("投资人持股", "10.0%"),
    ]
    card_w = 128
    for idx, (label, value) in enumerate(values):
        xx = lx + 18 + idx * 136
        c.setFillColor(GREEN_PALE)
        c.roundRect(xx, ly + lh - 133, card_w, 43, 8, stroke=0, fill=1)
        c.setFillColor(MUTED)
        c.setFont("CJK", 6.6)
        c.drawCentredString(xx + card_w / 2, ly + lh - 107, label)
        c.setFillColor(GREEN_DARK)
        c.setFont("Roboto-Bold", 10.5)
        c.drawCentredString(xx + card_w / 2, ly + lh - 124, value)

    c.setFillColor(TEXT)
    c.setFont("CJK-Bold", 9.3)
    c.drawString(lx + 18, ly + lh - 157, "融资款用途（合计200 MJPY）")
    uses = [
        ("广告及品牌增长", "108 M / 54%", 54, GREEN_DARK),
        ("产品开发与研发", "20 M / 10%", 10, GREEN),
        ("系统与生产基础设施", "40 M / 20%", 20, GREEN_MID),
        ("商务拓展及店铺导入", "18 M / 9%", 9, ORANGE),
        ("运营周转及合规储备", "14 M / 7%", 7, HexColor("#8BAA98")),
    ]
    for idx, row in enumerate(uses):
        funding_use_row(c, lx + 18, ly + lh - 172 - idx * 21, *row)

    c.setFillColor(GREEN_PALE)
    c.roundRect(lx + 18, ly + 4, lw - 36, 25, 8, stroke=0, fill=1)
    c.setFillColor(GREEN_DARK)
    c.setFont("CJK", 6.6)
    c.drawCentredString(lx + lw / 2, ly + 13.5, "资金用途是融资分配，不等同全年损益表成本分类")

    # Financial scenario cards.
    c.setFillColor(TEXT)
    c.setFont("CJK-Bold", 11)
    c.drawString(365, 369, "首轮融资后的三年现金情景")
    c.setFillColor(MUTED)
    c.setFont("CJK", 7.2)
    c.drawRightString(925, 369, "现金安全线：50 MJPY")
    scenario_finance_card(c, 365, 165, 270, 190, "方案A  保守", "稳健路径", False)
    scenario_finance_card(c, 653, 165, 270, 190, "方案B  高速", "扩张路径", True)

    # Decision strip.
    c.setFillColor(GREEN_PALE)
    c.roundRect(365, 80, 558, 68, 12, stroke=0, fill=1)
    c.setFillColor(GREEN_DARK)
    c.setFont("CJK-Bold", 9.2)
    c.drawString(382, 126, "融资判断")
    c.setFillColor(TEXT)
    c.setFont("CJK", 7.5)
    c.drawString(382, 107, "保守版：2亿日元可覆盖现有三年计划，并维持现金安全线。")
    c.drawString(382, 91, "高速版：Y1因1.08亿广告投入，需追加约2,770万日元或分阶段释放投放预算。")

    c.setFillColor(MUTED)
    c.setFont("CJK", 6.4)
    c.drawString(365, 55, "注：第二轮融资在模型中暂按0计算；27.7 MJPY为维持50 MJPY现金安全线的缺口，而非期末现金为负。")
    c.setFillColor(WARM)
    c.rect(25, 18, 910, 32, stroke=0, fill=1)


def build_new_pages() -> None:
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(NEW_PAGES_PDF), pagesize=(PAGE_W, PAGE_H))
    draw_financial_page(c)
    c.showPage()
    draw_funding_page(c)
    c.showPage()
    c.save()


def merge_pdf() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    source = PdfReader(str(SOURCE_PDF))
    replacement = PdfReader(str(NEW_PAGES_PDF))
    writer = PdfWriter()
    for page in source.pages[:9]:
        writer.add_page(page)
    writer.add_page(replacement.pages[0])
    writer.add_page(replacement.pages[1])
    writer.add_metadata(
        {
            "/Title": "NeeDo Business Plan CN - Dual Scenario Financial Revision",
            "/Author": "LifeDance Co., Ltd.",
            "/Subject": "Conservative and high-growth financial scenarios; JPY 200M for 10% financing plan",
        }
    )
    with OUTPUT_PDF.open("wb") as stream:
        writer.write(stream)


def verify_pdf() -> None:
    result = PdfReader(str(OUTPUT_PDF))
    assert len(result.pages) == 11, f"expected 11 pages, got {len(result.pages)}"
    for idx, page in enumerate(result.pages, start=1):
        box = page.mediabox
        width = float(box.width)
        height = float(box.height)
        assert abs(width - PAGE_W) < 0.1, (idx, width)
        assert abs(height - PAGE_H) < 0.1, (idx, height)
    print(f"OUTPUT={OUTPUT_PDF}")
    print(f"PAGES={len(result.pages)}")
    print(f"SIZE={OUTPUT_PDF.stat().st_size}")


if __name__ == "__main__":
    register_fonts()
    build_new_pages()
    merge_pdf()
    verify_pdf()
