from __future__ import annotations

from pathlib import Path

from PIL import Image
from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import Color, HexColor, white
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader


ROOT = Path("/Users/eason/Documents/New project")
ASSET_DIR = ROOT / "tmp/pdfs/needo_bp_premium/assets"
SOURCE_DIR = ROOT / "tmp/pdfs/needo_bp_source"
WORK_DIR = ROOT / "tmp/pdfs/needo_bp_premium"
PAGES_PDF = WORK_DIR / "premium_pages_v4_key_visual_locked.pdf"
OUTPUT = ROOT / "output/pdf/NeeDoBP_CN_投资人KeyVisual锁定精致版_V4_14页_2026-08-14.pdf"
PAGE_W, PAGE_H = 960, 540

IVORY = HexColor("#FAF8F2")
IVORY_2 = HexColor("#F6F2E9")
GREEN_900 = HexColor("#075B3B")
GREEN_800 = HexColor("#0B6845")
GREEN_600 = HexColor("#2F9A69")
GREEN_400 = HexColor("#69C596")
MINT_100 = HexColor("#E7F3EA")
MINT_050 = HexColor("#F1F8F2")
ORANGE_700 = HexColor("#B66B00")
ORANGE_100 = HexColor("#FFF1D6")
INK = HexColor("#17201D")
MUTED = HexColor("#65716B")
LINE = HexColor("#D8E4DA")
SOFT_LINE = HexColor("#E8EEE9")
RED = HexColor("#C7463A")
COPYRIGHT_COLOR = HexColor("#747A77")
COPYRIGHT_TEXT = "Copyright © 2026 LifeDance Co., Ltd. All Rights Reserved."

METI_URL = "https://www.meti.go.jp/press/2025/08/20250826005/20250826005-a.pdf"
RECRUIT_URL = "https://hba.beauty.hotpepper.jp/search/column/c_rela/70640/2/"
HPB_LISTING_URL = "https://beauty.hotpepper.jp/doc/keisai/keisai.html"
HPB_TERMS_URL = "https://cdn.p.recruit.co.jp/terms/hpb-t-1009/index.html"
HPB_POINT_URL = "https://beauty.hotpepper.jp/doc/info/system_info/info_20251110.html?ctm=c_all_info_03"
HOGUGU_FAQ_URL = "https://info.hogugu.com/guide.html"
HOGUGU_TERMS_URL = "https://info.hogugu.com/information/terms-of-use/index.html"
MINIMO_PRICE_URL = "https://minimodel.jp/info"
AIR_RESERVE_PRICE_URL = "https://airregi.jp/reserve/"
CURAMA_PRICE_URL = "https://faq.curama.jp/docs/shop/fees-and-invoicing/"
LINE_SUKIMANI_PRICE_URL = "https://client-help.line-sukimani.me/hc/ja/articles/13732183183887"


def register_fonts() -> None:
    # Match the original deck. Its embedded Chinese titles use MiSans
    # Semibold/Demibold; STHeiti made the regenerated pages visibly thinner.
    font_dir = Path("/Users/eason/Library/Fonts")
    pdfmetrics.registerFont(TTFont("CN", str(font_dir / "MiSans-Regular.ttf")))
    pdfmetrics.registerFont(TTFont("CN-Medium", str(font_dir / "MiSans-Medium.ttf")))
    pdfmetrics.registerFont(TTFont("CN-Demibold", str(font_dir / "MiSans-Demibold.ttf")))
    pdfmetrics.registerFont(TTFont("CN-Bold", str(font_dir / "MiSans-Semibold.ttf")))
    pdfmetrics.registerFont(TTFont("CN-Heavy", str(font_dir / "MiSans-Heavy.ttf")))
    pdfmetrics.registerFont(TTFont("CJK", str(font_dir / "MiSans-Regular.ttf")))
    pdfmetrics.registerFont(TTFont("CJK-Bold", str(font_dir / "MiSans-Semibold.ttf")))
    pdfmetrics.registerFont(TTFont("EN", "/Library/Fonts/Roboto-Regular.ttf"))
    pdfmetrics.registerFont(TTFont("EN-Medium", "/Library/Fonts/Roboto-Medium.ttf"))
    pdfmetrics.registerFont(TTFont("EN-Bold", "/Library/Fonts/Roboto-Bold.ttf"))
    pdfmetrics.registerFont(TTFont("Roboto", "/Library/Fonts/Roboto-Regular.ttf"))
    pdfmetrics.registerFont(TTFont("Roboto-Medium", "/Library/Fonts/Roboto-Medium.ttf"))
    pdfmetrics.registerFont(TTFont("Roboto-Bold", "/Library/Fonts/Roboto-Bold.ttf"))


def word_width(text: str, font: str, size: float) -> float:
    return pdfmetrics.stringWidth(text, font, size)


def text_lines(text: str, font: str, size: float, max_width: float) -> list[str]:
    lines: list[str] = []
    for paragraph in text.split("\n"):
        current = ""
        for ch in paragraph:
            proposed = current + ch
            if current and word_width(proposed, font, size) > max_width:
                lines.append(current)
                current = ch
            else:
                current = proposed
        lines.append(current)
    return lines


def draw_wrapped(c: canvas.Canvas, text: str, x: float, y: float, max_width: float, font="CN", size=7, leading=11, color=MUTED, max_lines=None) -> float:
    lines = text_lines(text, font, size, max_width)
    if max_lines:
        lines = lines[:max_lines]
    c.setFont(font, size)
    c.setFillColor(color)
    yy = y
    for line in lines:
        c.drawString(x, yy, line)
        yy -= leading
    return yy


def shadow_card(c: canvas.Canvas, x: float, y: float, w: float, h: float, radius=14, fill=white, stroke=LINE) -> None:
    c.saveState()
    c.setFillColor(Color(0.06, 0.18, 0.12, alpha=0.075))
    c.roundRect(x + 2.2, y - 3, w, h, radius, fill=1, stroke=0)
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(0.6)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1)
    c.restoreState()


def pill(c: canvas.Canvas, x: float, y: float, w: float, h: float, text: str, fill=MINT_100, color=GREEN_900, font="CN-Bold", size=7.5) -> None:
    c.setFillColor(fill)
    c.roundRect(x, y, w, h, h / 2, fill=1, stroke=0)
    c.setFillColor(color)
    c.setFont(font, size)
    c.drawCentredString(x + w / 2, y + (h - size) / 2 + 1.2, text)


def logo(c: canvas.Canvas) -> None:
    c.setFillColor(GREEN_900)
    c.setFont("EN-Bold", 20)
    c.drawString(36, 501, "NeeDo")
    c.setFont("EN-Medium", 5.8)
    c.drawString(43, 491, "You Need, We Do")


def footer(c: canvas.Canvas, note: str | None = None) -> None:
    if note:
        c.setFillColor(MUTED)
        c.setFont("CN", 5.4)
        c.drawString(35, 25, note)


def standard_copyright(c: canvas.Canvas, source_page: int | None = None) -> None:
    """Normalize the copyright line without leaving a visible repair patch.

    Art-led pages already contain a raster copyright.  A narrow source-matched
    strip is inpainted only across the old text, then the same vector copyright
    is drawn on every page with one font, size, color and baseline.
    """
    if source_page is not None:
        source = Image.open(SOURCE_DIR / f"page-{source_page:02d}.png").convert("RGB")
        left, top, right, bottom = 460, 1052, 1460, 1080
        patch = source.crop((left, top, right, bottom))
        pixels = patch.load()
        top_samples = [source.getpixel((left + x, top - 2)) for x in range(right - left)]
        bottom_samples = [source.getpixel((left + x, bottom - 1)) for x in range(right - left)]
        for x in range(190, 810):
            start = top_samples[x]
            end = bottom_samples[x]
            for y in range(bottom - top):
                ratio = y / max(1, bottom - top - 1)
                pixels[x, y] = tuple(round(start[i] * (1 - ratio) + end[i] * ratio) for i in range(3))
        c.drawImage(ImageReader(patch), 230, 0, 500, 14, preserveAspectRatio=False, mask="auto")
    else:
        c.setFillColor(IVORY)
        c.rect(230, 0, 500, 14, fill=1, stroke=0)

    c.setFillColor(COPYRIGHT_COLOR)
    c.setFont("EN-Medium", 5.4)
    c.drawCentredString(PAGE_W / 2, 4.7, COPYRIGHT_TEXT)


def clean_page(c: canvas.Canvas) -> None:
    c.setFillColor(IVORY)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)


def master_page(c: canvas.Canvas, source_page: int) -> None:
    """Place an original 1920×1080 art master at an exact 0.5 scale.

    The source art is never recolored, stretched, regenerated or washed with
    an opacity overlay.  Page-specific vector information layers are drawn on
    top only where the approved copy or numbers changed.
    """
    path = SOURCE_DIR / f"page-{source_page:02d}.png"
    if not path.exists():
        raise FileNotFoundError(path)
    c.drawImage(str(path), 0, 0, PAGE_W, PAGE_H, preserveAspectRatio=True, mask="auto")


def searchable_text_layer(c: canvas.Canvas, lines: list[str]) -> None:
    """Add an invisible, selectable text layer without changing the Key Visual.

    The approved art masters already contain the visible typography.  This
    layer only restores search/copy accessibility for investor due diligence.
    """
    c.saveState()
    c.setFillAlpha(0)
    text = c.beginText(2, 2)
    text.setFont("CN", 1)
    text.setLeading(1.2)
    for line in lines:
        text.textLine(line)
    c.drawText(text)
    c.restoreState()


def master_metric_card(c: canvas.Canvas, x: float, y: float, value: str, label: str, detail: str, source_id: str) -> None:
    shadow_card(c, x, y, 112, 62, 12, white, HexColor("#D7E3DA"))
    c.setFillColor(GREEN_900)
    c.setFont("CN-Bold", 16.5)
    c.drawCentredString(x + 56, y + 37, value)
    c.setFillColor(MINT_100)
    c.circle(x + 99, y + 50, 7, fill=1, stroke=0)
    c.setFillColor(GREEN_900)
    c.setFont("EN-Bold", 4.8)
    c.drawCentredString(x + 99, y + 48.3, source_id)
    c.setFillColor(INK)
    c.setFont("CN-Bold", 6.1)
    c.drawCentredString(x + 56, y + 20, label)
    c.setFillColor(MUTED)
    c.setFont("CN", 4.7)
    c.drawCentredString(x + 56, y + 8, detail)


def page_title(c: canvas.Canvas, cn: str, en: str, subtitle: str | None = None, title_size=29) -> None:
    logo(c)
    c.setFillColor(INK)
    c.setFont("CN-Bold", title_size)
    c.drawString(38, 444, cn)
    c.setFillColor(GREEN_900)
    c.setFont("EN-Medium", 12.4)
    c.drawString(38, 419, en)
    c.setStrokeColor(GREEN_400)
    c.setLineWidth(2.2)
    c.line(38, 405, 69, 405)
    if subtitle:
        c.setFillColor(MUTED)
        c.setFont("CN", 6.5)
        c.drawString(38, 388, subtitle)


def source_chip(c: canvas.Canvas, x: float, y: float, w: float, number: str, publisher: str, label: str, url: str) -> None:
    c.setFillColor(Color(1, 1, 1, alpha=0.96))
    c.setStrokeColor(LINE)
    c.roundRect(x, y, w, 38, 10, fill=1, stroke=1)
    c.setFillColor(GREEN_900)
    c.circle(x + 18, y + 19, 10, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("EN-Bold", 6.7)
    c.drawCentredString(x + 18, y + 16.4, number)
    c.setFillColor(INK)
    c.setFont("CN-Bold", 6.1)
    c.drawString(x + 35, y + 23.5, publisher)
    c.setFillColor(MUTED)
    c.setFont("CN", 5.4)
    c.drawString(x + 35, y + 9.5, label)
    c.linkURL(url, (x, y, x + w, y + 38), relative=0, thickness=0)


def icon_badge(c: canvas.Canvas, cx: float, cy: float, symbol: str, accent=GREEN_900, pale=MINT_100, radius=15, font="CN-Bold", size=10) -> None:
    c.setFillColor(pale)
    c.circle(cx, cy, radius, fill=1, stroke=0)
    c.setFillColor(accent)
    c.setFont(font, size)
    c.drawCentredString(cx, cy - size * 0.35, symbol)


def draw_check(c: canvas.Canvas, cx: float, cy: float, radius=6, accent=GREEN_600) -> None:
    c.setFillColor(accent)
    c.circle(cx, cy, radius, fill=1, stroke=0)
    c.setStrokeColor(white)
    c.setLineWidth(1.25)
    c.line(cx - 2.8, cy - 0.1, cx - 0.6, cy - 2.3)
    c.line(cx - 0.6, cy - 2.3, cx + 3.3, cy + 2.6)


def section_label(c: canvas.Canvas, x: float, y: float, number: str, title: str, subtitle: str, orange=False) -> None:
    accent = ORANGE_700 if orange else GREEN_900
    pale = ORANGE_100 if orange else MINT_100
    icon_badge(c, x + 17, y + 17, number, accent, pale, 17, "EN-Bold", 8)
    c.setFillColor(INK)
    c.setFont("CN-Bold", 9.2)
    c.drawString(x + 44, y + 21, title)
    c.setFillColor(MUTED)
    c.setFont("CN", 5.6)
    c.drawString(x + 44, y + 7, subtitle)


def metric_card(c: canvas.Canvas, x: float, y: float, w: float, value: str, label: str, detail: str, accent=GREEN_900, source_id: str | None = None) -> None:
    shadow_card(c, x, y, w, 76, 12, white)
    c.setFillColor(accent)
    c.setFont("CN-Bold" if any("\u3000" <= ch <= "\u9fff" for ch in value) else "EN-Bold", 16.5)
    c.drawString(x + 13, y + 46, value)
    if source_id:
        icon_badge(c, x + w - 17, y + 58, source_id, accent, MINT_100, 8, "EN-Bold", 5.2)
    c.setFillColor(INK)
    c.setFont("CN-Bold", 6.4)
    c.drawString(x + 13, y + 26, label)
    c.setFillColor(MUTED)
    c.setFont("CN", 5.1)
    c.drawString(x + 13, y + 10, detail)


def top_rule(c: canvas.Canvas, x: float, y: float, w: float, accent=GREEN_600) -> None:
    c.setStrokeColor(accent)
    c.setLineWidth(2)
    c.line(x, y, x + w, y)


def market_metric(c: canvas.Canvas, x: float, y: float, value: str, label: str, detail: str, source_id: str) -> None:
    shadow_card(c, x, y, 105, 72, 12, Color(1, 1, 1, alpha=0.97))
    has_cn = any("\u3000" <= ch <= "\u9fff" for ch in value)
    c.setFillColor(GREEN_900)
    c.setFont("CN-Bold" if has_cn else "EN-Bold", 17)
    c.drawString(x + 12, y + 44, value)
    c.setFillColor(MINT_100)
    c.circle(x + 91, y + 57, 8, fill=1, stroke=0)
    c.setFillColor(GREEN_900)
    c.setFont("EN-Bold", 5.4)
    c.drawCentredString(x + 91, y + 55.2, source_id)
    c.setFillColor(INK)
    c.setFont("CN-Bold", 6.2)
    c.drawString(x + 12, y + 25, label)
    c.setFillColor(MUTED)
    c.setFont("CN", 5.2)
    c.drawString(x + 12, y + 10, detail)


def draw_cover(c: canvas.Canvas) -> None:
    c.drawImage(str(ASSET_DIR / "market-ecosystem.png"), 0, 0, PAGE_W, PAGE_H)
    c.setFillColor(Color(0.985, 0.976, 0.946, alpha=0.40))
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setFillColor(Color(0.985, 0.976, 0.946, alpha=0.94))
    c.roundRect(22, 22, 424, 496, 22, fill=1, stroke=0)
    logo(c)
    pill(c, 37, 454, 108, 22, "2026 INVESTOR DECK", MINT_100, GREEN_900, "EN-Bold", 6.5)
    c.setFillColor(INK)
    c.setFont("EN-Bold", 39)
    c.drawString(37, 389, "Business Plan")
    c.setFillColor(GREEN_900)
    c.setFont("CN-Bold", 15)
    c.drawString(39, 347, "本地生活服务撮合平台 × 商家SaaS")
    c.setFillColor(MUTED)
    c.setFont("CN", 7.2)
    c.drawString(39, 326, "连接消费者、店铺与服务者，让分散供给成为可经营、可增长的网络。")
    top_rule(c, 39, 307, 45)

    shadow_card(c, 38, 164, 352, 118, 14, Color(1, 1, 1, alpha=0.93))
    rows = [
        ("01", "SaaS冷启动与供给组织化", "月额Free，降低商家与技师加入门槛"),
        ("02", "双轨交易与规模化增长", "Booking做流量底盘，Request承接即时需求"),
        ("03", "增长工具与生态变现", "Boost、会员、达人匹配与S2B2C延展"),
    ]
    for idx, (num, title, detail) in enumerate(rows):
        yy = 248 - idx * 35
        if idx:
            c.setStrokeColor(LINE); c.setLineWidth(.45); c.line(51, yy + 25, 376, yy + 25)
        icon_badge(c, 56, yy + 6, num, GREEN_900, MINT_100, 10, "EN-Bold", 5.6)
        c.setFillColor(INK); c.setFont("CN-Bold", 7.2); c.drawString(76, yy + 10, title)
        c.setFillColor(MUTED); c.setFont("CN", 5.5); c.drawString(76, yy - 3, detail)

    pill(c, 38, 119, 164, 25, "本轮融资：2亿日元 / 10%", GREEN_900, white, "CN-Bold", 7.7)
    c.setFillColor(MUTED); c.setFont("CN", 5.9); c.drawString(39, 96, "东京试点 · 18个月产品与密度验证 · 仅按摩类财务模型")
    c.setFillColor(GREEN_900); c.setFont("EN-Medium", 6.4); c.drawString(39, 65, "LifeDance Co., Ltd.  |  August 2026")
    footer(c)


def draw_market(c: canvas.Canvas) -> None:
    clean_page(c)
    page_title(c, "市场机会：线上需求增长，供给经营仍然碎片化", "Market Opportunity", "数据为广义市场与预约行为证据，不直接等同NeeDo TAM；来源可点击。", 23)

    c.setFillColor(INK); c.setFont("CN-Bold", 8.2); c.drawString(38, 366, "可核验市场信号")
    c.setFillColor(MUTED); c.setFont("CN", 5.6); c.drawString(38, 352, "服务线上化已经发生，但供给组织和经营工具仍未形成统一基础设施。")
    metric_card(c, 38, 261, 126, "8.23万亿", "服务类B2C-EC", "日本2024年 · 广义口径", GREEN_900, "01")
    metric_card(c, 176, 261, 126, "7,302亿", "理美容B2C-EC", "美发/美甲/美容/放松", GREEN_900, "01")
    metric_card(c, 38, 171, 126, "+6.54%", "理美容EC同比", "2024 vs. 2023", GREEN_600, "01")
    metric_card(c, 176, 171, 126, "59.0%", "放松沙龙网络预约", "Recruit · 2025", GREEN_600, "02")

    shadow_card(c, 326, 155, 388, 205, 18, white)
    c.setFillColor(MUTED); c.setFont("CN-Bold", 6.4); c.drawCentredString(520, 336, "高度分散的本地服务供给")
    c.setFillColor(GREEN_900); c.circle(520, 251, 45, fill=1, stroke=0)
    c.setFillColor(white); c.setFont("EN-Bold", 13); c.drawCentredString(520, 255, "NeeDo")
    c.setFont("CN", 5.5); c.drawCentredString(520, 239, "连接与经营基础设施")
    nodes = [
        (398, 294, "按摩/美容", 266), (520, 326, "家政保洁", 298), (641, 294, "家电维修", 266),
        (398, 208, "搬家货运", 180), (520, 172, "宠物服务", 196), (641, 208, "到店服务", 180),
    ]
    for idx, (cx, cy, label, label_y) in enumerate(nodes, start=1):
        c.setStrokeColor(GREEN_400); c.setLineWidth(.8); c.setDash(3, 3); c.line(520, 251, cx, cy); c.setDash()
        icon_badge(c, cx, cy, f"0{idx}", GREEN_900, MINT_100, 17, "EN-Bold", 6.2)
        c.setFillColor(INK); c.setFont("CN-Bold", 5.7); c.drawCentredString(cx, label_y, label)

    pain_points = [
        ("需求高频", "本地生活与日常消费相关，复购与即时需求并存。", "01"),
        ("供给分散", "小微商家与个人技师并存，缺少组织与协同。", "02"),
        ("数字化不足", "预约、排班、沟通、经营与结算工具割裂。", "03"),
        ("获客成本高", "曝光分散且难复用，经营者难形成用户资产。", "04"),
    ]
    for idx, (title, detail, num) in enumerate(pain_points):
        yy = 292 - idx * 58
        shadow_card(c, 738, yy, 184, 48, 11, white)
        icon_badge(c, 758, yy + 24, num, GREEN_900, MINT_100, 12, "EN-Bold", 5.5)
        c.setFillColor(INK); c.setFont("CN-Bold", 6.8); c.drawString(779, yy + 28, title)
        draw_wrapped(c, detail, 779, yy + 14, 130, "CN", 4.8, 7, MUTED, 2)

    c.setFillColor(MINT_100); c.roundRect(38, 83, 884, 36, 11, fill=1, stroke=0)
    c.setFillColor(GREEN_900); c.setFont("CN-Bold", 7.3); c.drawString(55, 98, "NeeDo的机会：")
    c.setFillColor(INK); c.setFont("CN-Medium", 6.6); c.drawString(126, 98, "用数字化基础设施连接本地服务供给与需求，提升匹配效率、降低获客成本、沉淀经营数据。")
    source_chip(c, 38, 29, 430, "01", "经济产业省｜令和6年度电子商务市场调查｜2025-08-26", "服务类与理美容B2C-EC｜meti.go.jp", METI_URL)
    source_chip(c, 492, 29, 430, "02", "Recruit / Hot Pepper Beauty Academy｜美容センサス2025上期", "リラクゼーションサロン网络预约率｜hba.beauty.hotpepper.jp", RECRUIT_URL)
    footer(c)


def draw_why_now(c: canvas.Canvas) -> None:
    clean_page(c)
    page_title(c, "供给侧觉醒与零工经济增长", "Why Now?", "宏观压力、灵活就业、传统中介解体与数字平台成熟正在同一时间发生。", 27)

    shadow_card(c, 38, 169, 270, 200, 16, white)
    c.setFillColor(GREEN_900); c.setFont("CN-Bold", 10.5); c.drawString(58, 337, "服务者开始主动选择平台")
    draw_wrapped(c, "通胀压力、副业刚需与传统高抽佣中介的解体，正在推动专业服务者寻找低抽佣、自主定价、灵活接单的新平台。", 58, 313, 228, "CN", 6.5, 12, INK, 4)
    c.setStrokeColor(LINE); c.setLineWidth(.6); c.line(58, 260, 287, 260)
    c.setFillColor(MUTED); c.setFont("CN", 5.6); c.drawString(58, 248, "供给侧驱动力")
    drivers = [("生活成本", 0.70), ("灵活就业", 0.82), ("中介解体", 0.62), ("平台成熟", 0.88)]
    for idx, (label, pct) in enumerate(drivers):
        yy = 234 - idx * 14
        c.setFillColor(INK); c.setFont("CN-Medium", 5.5); c.drawString(58, yy + 3, label)
        c.setFillColor(SOFT_LINE); c.roundRect(119, yy, 148, 7, 3.5, fill=1, stroke=0)
        c.setFillColor(GREEN_600 if idx != 2 else ORANGE_700); c.roundRect(119, yy, 148 * pct, 7, 3.5, fill=1, stroke=0)
    c.setFillColor(MINT_050); c.roundRect(58, 171, 229, 16, 7, fill=1, stroke=0)
    c.setFillColor(GREEN_900); c.setFont("CN-Bold", 5.6); c.drawCentredString(172.5, 176.5, "低月额＋固定单笔费，比高抽佣更适合供给冷启动")

    shadow_card(c, 333, 169, 589, 200, 16, white)
    c.setFillColor(MUTED); c.setFont("CN-Bold", 6.5); c.drawCentredString(627.5, 344, "四股力量汇合，形成NeeDo进入窗口")
    center_x, center_y = 627, 256
    c.setFillColor(GREEN_900); c.circle(center_x, center_y, 49, fill=1, stroke=0)
    c.setFillColor(white); c.setFont("EN-Bold", 14); c.drawCentredString(center_x, center_y + 4, "NeeDo")
    c.setFont("CN", 5.5); c.drawCentredString(center_x, center_y - 13, "低抽佣·自主定价·灵活接单")
    why_nodes = [
        (424, 300, "宏观红利", "成本上涨推动额外收入需求", "01", False),
        (424, 215, "副业刚需", "专业服务者进入灵活就业", "02", False),
        (829, 300, "中介解体", "传统高抽佣模式吸引力下降", "03", True),
        (829, 215, "新平台机会", "移动支付与身份验证已成熟", "04", False),
    ]
    for cx, cy, title, detail, num, orange in why_nodes:
        accent = ORANGE_700 if orange else GREEN_900
        pale = ORANGE_100 if orange else MINT_100
        c.setStrokeColor(accent); c.setLineWidth(.8); c.setDash(3, 3); c.line(center_x + (49 if cx > center_x else -49), center_y, cx + (-34 if cx > center_x else 34), cy); c.setDash()
        icon_badge(c, cx, cy, num, accent, pale, 17, "EN-Bold", 6.2)
        c.setFillColor(INK); c.setFont("CN-Bold", 6.6); c.drawCentredString(cx, cy - 27, title)
        c.setFillColor(MUTED); c.setFont("CN", 4.9); c.drawCentredString(cx, cy - 40, detail)

    bottom_cards = [
        ("需求端", "高频/即时/到店与上门并存", "订单场景扩大"),
        ("供给端", "店铺＋个人技师＋多店兼职", "供给弹性提升"),
        ("经营端", "排班、IM、会员、财务碎片化", "SaaS整合空间"),
        ("增长端", "流量购买与达人推广工具成熟", "平台变现窗口"),
    ]
    for idx, (title, detail, result) in enumerate(bottom_cards):
        xx = 38 + idx * 225
        shadow_card(c, xx, 65, 207, 82, 12, white)
        icon_badge(c, xx + 24, 118, f"0{idx+1}", GREEN_900, MINT_100, 12, "EN-Bold", 5.5)
        c.setFillColor(INK); c.setFont("CN-Bold", 7.2); c.drawString(xx + 45, 120, title)
        c.setFillColor(MUTED); c.setFont("CN", 5.3); c.drawString(xx + 17, 94, detail)
        c.setFillColor(GREEN_900); c.setFont("CN-Bold", 5.8); c.drawString(xx + 17, 76, "→ " + result)
    footer(c)


def kpi_column(c: canvas.Canvas, x: float, label: str, value: str) -> None:
    c.setFillColor(MUTED)
    c.setFont("CN", 6.8)
    c.drawString(x, 208, label)
    c.setFillColor(GREEN_900)
    c.setFont("CN-Bold", 17)
    c.drawString(x, 180, value)


def draw_solution(c: canvas.Canvas) -> None:
    clean_page(c)
    page_title(c, "NeeDo：从获客到复购的完整交易与经营闭环", "Solution & Flywheel", "不是单一预约工具，而是连接消费者、店铺与服务者的本地服务基础设施。", 24)

    shadow_card(c, 38, 310, 884, 70, 13, white)
    pill(c, 758, 350, 145, 18, "高速增长版Y3预测｜仅按摩类", MINT_100, GREEN_900, "CN-Bold", 5.8)
    metrics = [("Y3技师/服务者", "3万名"), ("Y3完成订单", "497.2万笔"), ("Y3店铺数", "4,000家")]
    for idx, (label, value) in enumerate(metrics):
        xx = 58 + idx * 219
        if idx:
            c.setStrokeColor(LINE); c.setLineWidth(.6); c.line(xx - 22, 325, xx - 22, 365)
        c.setFillColor(MUTED); c.setFont("CN-Medium", 6.3); c.drawString(xx, 355, label)
        c.setFillColor(GREEN_900); c.setFont("CN-Bold", 15); c.drawString(xx, 327, value)

    fly_x, fly_y = 480, 218
    c.setStrokeColor(GREEN_400); c.setLineWidth(12); c.setLineCap(1)
    c.circle(fly_x, fly_y, 73, fill=0, stroke=1)
    c.setStrokeColor(white); c.setLineWidth(1.5); c.setDash(5, 7); c.circle(fly_x, fly_y, 73, fill=0, stroke=1); c.setDash()
    c.setFillColor(GREEN_900); c.circle(fly_x, fly_y, 39, fill=1, stroke=0)
    c.setFillColor(white); c.setFont("EN-Bold", 11); c.drawCentredString(fly_x, fly_y + 4, "NeeDo")
    c.setFont("CN", 5.4); c.drawCentredString(fly_x, fly_y - 12, "交易 × 经营 × 增长")
    loop_nodes = [
        (480, 291, "01", "获客/预约"), (549, 240, "02", "智能匹配"),
        (523, 153, "03", "履约风控"), (437, 153, "04", "结算返点"), (411, 240, "05", "会员复购"),
    ]
    for cx, cy, num, label in loop_nodes:
        icon_badge(c, cx, cy, num, GREEN_900, white, 15, "EN-Bold", 6)
        c.setFillColor(INK); c.setFont("CN-Bold", 5.4); c.drawCentredString(cx, cy - 24, label)

    left_steps = [
        ("需求进入", "到店预约｜上门Request｜优惠信息"),
        ("供给响应", "店铺接单｜技师抢单｜多店兼职"),
        ("履约沉淀", "统一日历｜IM留痕｜评价与风控"),
    ]
    for idx, (title, detail) in enumerate(left_steps):
        yy = 265 - idx * 55
        shadow_card(c, 38, yy, 280, 43, 10, white)
        icon_badge(c, 57, yy + 21, f"0{idx+1}", GREEN_900, MINT_100, 11, "EN-Bold", 5.2)
        c.setFillColor(INK); c.setFont("CN-Bold", 6.5); c.drawString(77, yy + 25, title)
        c.setFillColor(MUTED); c.setFont("CN", 5.1); c.drawString(77, yy + 11, detail)
        c.setStrokeColor(GREEN_400); c.setLineWidth(.8); c.setDash(3, 3); c.line(318, yy + 21, 383, fly_y + (38 - idx * 38)); c.setDash()

    right_steps = [
        ("经营提效", "排班、员工、会员、点餐、财务与在库"),
        ("增长变现", "竞价排名、达人匹配、购买流量"),
        ("信任闭环", "eKYC、支付结算、SOS与行程留痕"),
    ]
    for idx, (title, detail) in enumerate(right_steps):
        yy = 265 - idx * 55
        shadow_card(c, 642, yy, 280, 43, 10, white)
        icon_badge(c, 661, yy + 21, f"0{idx+4}", ORANGE_700 if idx == 1 else GREEN_900, ORANGE_100 if idx == 1 else MINT_100, 11, "EN-Bold", 5.2)
        c.setFillColor(INK); c.setFont("CN-Bold", 6.5); c.drawString(681, yy + 25, title)
        c.setFillColor(MUTED); c.setFont("CN", 5.1); c.drawString(681, yy + 11, detail)
        c.setStrokeColor(GREEN_400); c.setLineWidth(.8); c.setDash(3, 3); c.line(577, fly_y + (38 - idx * 38), 642, yy + 21); c.setDash()

    capabilities = [
        ("C端消费者", "到店/上门/Request · 优惠 · 多语言", "预约前后都可与店铺/技师沟通"),
        ("B端店铺", "多模式排班 · 会员 · 员工 · 财务", "店铺直连IM · 私聊 · 群聊"),
        ("P端服务者", "自主排班 · 多店兼职 · 接单派单", "eKYC · 行程共享 · SOS · 结算"),
    ]
    for idx, (title, line1, line2) in enumerate(capabilities):
        xx = 38 + idx * 300
        shadow_card(c, xx, 52, 284, 64, 12, MINT_050 if idx == 1 else white)
        icon_badge(c, xx + 27, 84, ["C", "B", "P"][idx], GREEN_900, MINT_100, 14, "EN-Bold", 7.5)
        c.setFillColor(GREEN_900); c.setFont("CN-Bold", 7); c.drawString(xx + 51, 96, title)
        c.setFillColor(INK); c.setFont("CN", 5.4); c.drawString(xx + 51, 80, line1)
        c.setFillColor(MUTED); c.setFont("CN", 5.1); c.drawString(xx + 51, 65, line2)
    footer(c)


def engine_flow(c: canvas.Canvas, x: float, y: float, w: float, orange: bool) -> None:
    accent = ORANGE_700 if orange else GREEN_900
    pale = ORANGE_100 if orange else MINT_100
    labels = [("用户下单", "广播急单" if orange else "选择时段"), ("接单确认", "抢单并确认" if orange else "商家/技师接单"), ("订单完成", "服务完成")]
    for idx, (title, detail) in enumerate(labels):
        cx = x + 67 + idx * (w - 134) / 2
        icon_badge(c, cx, y + 118, f"0{idx+1}", accent, pale, 20, "EN-Bold", 7)
        c.setFillColor(INK); c.setFont("CN-Bold", 6.8); c.drawCentredString(cx, y + 84, title)
        c.setFillColor(MUTED); c.setFont("CN", 5.2); c.drawCentredString(cx, y + 68, detail)
        if idx < 2:
            c.setStrokeColor(accent); c.setLineWidth(1.8); c.line(cx + 31, y + 118, cx + (w - 134) / 2 - 31, y + 118)
            c.line(cx + (w - 134) / 2 - 37, y + 122, cx + (w - 134) / 2 - 31, y + 118)
            c.line(cx + (w - 134) / 2 - 37, y + 114, cx + (w - 134) / 2 - 31, y + 118)


def draw_dual_engine(c: canvas.Canvas) -> None:
    clean_page(c)
    page_title(c, "双轨交易引擎：Booking做底盘，Request做高毛利", "Dual Transaction Engine", "计划性需求与即时急单分层承接，统一进入履约、积分与风控账本。", 25)

    panels = [
        (38, False, "轨1 · Booking普通预约", "计划性需求 · C端免费预约", "平台单笔净确认约400 NDP"),
        (496, True, "轨2 · Request极速发单", "深夜/3小时内/筛选急单", "平台单笔净确认约1,400 NDP"),
    ]
    for x, orange, title, subtitle, net in panels:
        accent = ORANGE_700 if orange else GREEN_900
        pale = ORANGE_100 if orange else MINT_100
        shadow_card(c, x, 128, 426, 254, 15, white)
        pill(c, x + 17, 342, 139, 24, title, pale, accent, "CN-Bold", 7.6)
        c.setFillColor(MUTED); c.setFont("CN", 5.8); c.drawRightString(x + 408, 350, subtitle)
        engine_flow(c, x + 15, 175, 396, orange)
        c.setFillColor(pale); c.roundRect(x + 22, 162, 382, 42, 10, fill=1, stroke=0)
        c.setFillColor(accent); c.setFont("CN-Bold", 6.5)
        if orange:
            c.drawString(x + 39, 185, "C端预付1,000 NDP（调度费）")
            c.drawRightString(x + 387, 185, "B端完单扣500 NDP（履约费）")
        else:
            c.drawString(x + 39, 185, "B端完单扣500 NDP（履约费）")
            c.drawRightString(x + 387, 185, "C端返100 NDP（完单奖励）")
        c.setFillColor(accent); c.roundRect(x + 22, 139, 382, 18, 8, fill=1, stroke=0)
        c.setFillColor(white); c.setFont("CN-Bold", 6.4); c.drawCentredString(x + 213, 145, net)

    c.setFillColor(MINT_050); c.roundRect(38, 66, 884, 44, 12, fill=1, stroke=0)
    c.setFillColor(GREEN_900); c.setFont("CN-Bold", 8.2); c.drawString(58, 88, "长尾做流量，急单做利润，点数账本让履约、返点与风控同审计。")
    pillars = [("双轨分层", "覆盖全场景需求"), ("利益闭环", "防跳单·促留存"), ("点数结算", "透明可追溯"), ("风控可审计", "安全合规可靠")]
    for idx, (title, detail) in enumerate(pillars):
        xx = 470 + idx * 108
        c.setFillColor(white); c.roundRect(xx, 75, 100, 27, 7, fill=1, stroke=0)
        c.setFillColor(INK); c.setFont("CN-Bold", 5.4); c.drawCentredString(xx + 50, 90, title)
        c.setFillColor(MUTED); c.setFont("CN", 4.6); c.drawCentredString(xx + 50, 80, detail)
    footer(c, "NDP为产品内点数账本口径；当前三年财务模型按500日元/收费资格订单确认平台收入。")


def moat_card(c: canvas.Canvas, x: float, y: float, w: float, title: str, tag: str, detail: str, number: str, orange=False) -> None:
    accent = ORANGE_700 if orange else GREEN_900
    pale = ORANGE_100 if orange else MINT_100
    shadow_card(c, x, y, w, 80, 12, white)
    icon_badge(c, x + 24, y + 55, number, accent, pale, 13, "EN-Bold", 5.8)
    pill(c, x + 47, y + 50, 64, 17, tag, pale, accent, "EN-Bold", 5.4)
    c.setFillColor(INK); c.setFont("CN-Bold", 7.4); c.drawString(x + 18, y + 29, title)
    draw_wrapped(c, detail, x + 18, y + 15, w - 36, "CN", 4.9, 7, MUTED, 2)


def draw_moat(c: canvas.Canvas) -> None:
    clean_page(c)
    page_title(c, "核心壁垒：本地服务基础设施，而不是单一功能", "Defensible Local-Service Infrastructure", "密度、工具、供给、信用、数据与增长互相强化，形成复合型护城河。", 24)

    center_x, center_y = 480, 235
    c.setFillColor(MINT_100); c.circle(center_x, center_y, 83, fill=1, stroke=0)
    c.setFillColor(GREEN_900); c.circle(center_x, center_y, 58, fill=1, stroke=0)
    c.setFillColor(white); c.setFont("EN-Bold", 16); c.drawCentredString(center_x, center_y + 8, "NeeDo")
    c.setFont("CN-Bold", 6.1); c.drawCentredString(center_x, center_y - 10, "本地服务基础设施")
    c.setFont("CN", 5); c.drawCentredString(center_x, center_y - 25, "交易 × 经营 × 信任 × 增长")

    cards = [
        (38, 276, 250, "时空密度", "Density", "局部订单与供给越密，响应越快，体验越稳定。", "01", False),
        (672, 276, 250, "SaaS粘性", "MRR", "排班、会员、员工与财务深入日常经营。", "02", False),
        (38, 171, 250, "组织化供给", "B2B2C", "店铺、个人技师与多店兼职形成弹性供给。", "03", False),
        (672, 171, 250, "信用履约系统", "eKYC", "身份、支付、评价、行程与风控统一留痕。", "04", False),
        (355, 82, 250, "数据复利与增长变现", "Data / Growth", "订单、位置、复购与Boost数据持续优化匹配和收益。", "05", True),
    ]
    for x, y, w, title, tag, detail, num, orange in cards:
        moat_card(c, x, y, w, title, tag, detail, num, orange)
        cx = x + w / 2
        cy = y + 40
        c.setStrokeColor(ORANGE_700 if orange else GREEN_400); c.setLineWidth(.7); c.setDash(3, 3)
        c.line(cx + (50 if cx < center_x else -50 if cx > center_x else 0), cy, center_x, center_y + (-58 if cy < center_y else 58))
        c.setDash()

    c.setFillColor(MINT_050); c.roundRect(38, 37, 884, 31, 10, fill=1, stroke=0)
    chain = ["局部密度", "SaaS锁供给", "交易与返点", "Boost与会员", "数据复利", "提高平台收益"]
    for idx, item in enumerate(chain):
        xx = 66 + idx * 145
        c.setFillColor(GREEN_900 if idx < 5 else ORANGE_700); c.setFont("CN-Bold", 5.8); c.drawCentredString(xx, 49, item)
        if idx < 5:
            c.setStrokeColor(GREEN_400); c.setLineWidth(1); c.line(xx + 43, 52, xx + 97, 52)
            c.line(xx + 92, 55, xx + 97, 52); c.line(xx + 92, 49, xx + 97, 52)
    footer(c)


def roadmap_stage(c: canvas.Canvas, x: float, y: float, number: str, month: str, title: str, details: tuple[str, str], current=False) -> None:
    w, h = 115, 103
    fill = GREEN_900 if current else Color(1, 1, 1, alpha=0.95)
    shadow_card(c, x, y, w, h, 13, fill)
    pill(c, x + 11, y + 76, 28, 17, number, white if current else MINT_100, GREEN_900, "EN-Bold", 6.5)
    c.setFillColor(Color(1, 1, 1, alpha=0.78) if current else MUTED)
    c.setFont("EN-Medium", 5.3)
    c.drawRightString(x + w - 11, y + 82, month)
    c.setFillColor(white if current else INK)
    c.setFont("CN-Bold", 8.6)
    c.drawString(x + 12, y + 57, title)
    c.setFillColor(Color(1, 1, 1, alpha=0.82) if current else MUTED)
    c.setFont("CN", 5.6)
    c.drawString(x + 12, y + 36, details[0])
    c.drawString(x + 12, y + 20, details[1])


def draw_roadmap(c: canvas.Canvas) -> None:
    c.drawImage(str(ASSET_DIR / "roadmap-city.png"), 0, 0, PAGE_W, PAGE_H)
    c.setFillColor(Color(0.98, 0.97, 0.93, alpha=0.62))
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setFillColor(Color(0.98, 0.97, 0.93, alpha=0.94))
    c.roundRect(23, 360, 565, 154, 20, fill=1, stroke=0)
    logo(c)
    c.setFillColor(INK)
    c.setFont("CN-Bold", 29)
    c.drawString(38, 438, "18个月版本迭代路线图")
    c.setFillColor(GREEN_900)
    c.setFont("EN-Medium", 12.5)
    c.drawString(38, 414, "18-Month Product Roadmap")
    c.setStrokeColor(GREEN_400); c.setLineWidth(2.2); c.line(38, 401, 70, 401)
    c.setFillColor(INK); c.setFont("CN-Medium", 6.6)
    c.drawString(38, 384, "从3个月试点起步，依次推进正式上线、会员、在库/酒店、多语言与成果交易网络。")
    c.setFillColor(MUTED); c.setFont("CN", 5.8)
    c.drawString(38, 370, "每一期均以店铺激活、订单密度、复购、履约与安全KPI验收；未过线不进入下一期。")

    # A continuous route keeps the original Phase 0–6 narrative while the AI
    # Tokyo illustration supplies depth instead of replacing information.
    c.setLineCap(1)
    c.setStrokeColor(Color(0.03, 0.36, 0.23, alpha=0.22)); c.setLineWidth(19)
    c.bezier(55, 259, 190, 261, 330, 281, 480, 292)
    c.bezier(480, 292, 635, 301, 770, 334, 910, 353)
    c.setStrokeColor(GREEN_600); c.setLineWidth(11)
    c.bezier(55, 259, 190, 261, 330, 281, 480, 292)
    c.bezier(480, 292, 635, 301, 770, 334, 910, 353)
    c.setStrokeColor(white); c.setLineWidth(2.1); c.setDash(8, 7)
    c.bezier(55, 259, 190, 261, 330, 281, 480, 292)
    c.bezier(480, 292, 635, 301, 770, 334, 910, 353)
    c.setDash()

    stages = [
        ("0", "M0–3", "测试期", ("MVP/密度验证", "履约与安全闭环"), True),
        ("1", "M3–6", "正式上线", ("SaaS基础功能", "前三个月免费"), False),
        ("2", "M6–9", "VIP系统", ("会员权益与订阅", "分层特权启动"), False),
        ("3", "M9–12", "在库管理", ("供应库存可视化", "S2B2C经营闭环"), False),
        ("4", "M12–15", "酒店预约", ("多语言与酒店入口", "一条龙预约系统"), False),
        ("5", "M15–17", "NeedUp", ("短时间获取流量", "自助增长加速"), False),
        ("6", "M17–18", "NeeDoAffi", ("成果报酬型", "自助交易网络"), False),
    ]
    xs = [32, 159, 286, 413, 540, 667, 794]
    ys = [116, 139, 111, 136, 109, 134, 111]
    road_ys = [259, 266, 278, 288, 302, 327, 350]
    for x, y, road_y, data in zip(xs, ys, road_ys, stages):
        cx = x + 57.5
        c.setStrokeColor(GREEN_600); c.setLineWidth(0.8); c.setDash(3, 3)
        c.line(cx, road_y - 16, cx, y + 103)
        c.setDash()
        c.setFillColor(white); c.circle(cx, road_y, 16, fill=1, stroke=0)
        c.setFillColor(GREEN_900); c.circle(cx, road_y, 13, fill=1, stroke=0)
        c.setFillColor(white); c.setFont("EN-Bold", 8.5); c.drawCentredString(cx, road_y - 3, data[0])
        roadmap_stage(c, x, y, *data)

    c.setFillColor(Color(0.94, 0.98, 0.95, alpha=0.96)); c.roundRect(32, 35, 877, 52, 14, fill=1, stroke=0)
    c.setFillColor(GREEN_900); c.setFont("CN-Bold", 7.2); c.drawString(49, 68, "融资后18个月验收框架")
    milestones = ["店铺激活/首单", "单城订单密度", "CAC/复购率", "履约/安全质量", "外国用户渠道"]
    for idx, item in enumerate(milestones):
        xx = 188 + idx * 142
        c.setFillColor(white); c.roundRect(xx, 50, 128, 22, 7, fill=1, stroke=0)
        c.setFillColor(INK); c.setFont("CN-Medium", 5.8); c.drawCentredString(xx + 64, 58, item)
    footer(c)


COMPETITORS = [
    ("NeeDo", "交易+SaaS+风控+增长", ["●","●","●","●","●","●","●","●","●"], "Free\n（月额0）", "500日元/单", "0%\n固定500日元"),
    ("HOT PEPPER Beauty", "美容获客媒体", ["●","—","●","—","—","—","△","●","△"], "个别报价\n展示越多越高", "约2%起\n预约1%＋积分原资", "无GMV式抽成"),
    ("minimo", "技师个人集客/预约", ["●","—","△","△","●","—","△","△","△"], "0日元", "110/440/660/880日元\n按施术价分段", "0%\n固定成果费"),
    ("EPARK", "垂直到店预约门户", ["●","—","△","—","—","—","△","△","△"], "询价", "来店成果费\n金额未公开", "统一费率未公开"),
    ("Airリザーブ", "通用预约SaaS", ["●","—","△","—","—","—","△","●","—"], "0–11,000日元", "无固定预约费", "在线支付3.24%"),
    ("くらしのマーケット", "上门服务撮合", ["△","●","△","△","●","—","△","●","△"], "0日元\n有料Plan 10,000日元", "最低2,000日元/预约", "标准预约手续费20%"),
    ("HOGUGU", "按摩上门预约撮合", ["●","△","●","—","●","—","△","●","△"], "0日元\n注册/月额免费", "成约手数料あり\n统一率未公开", "按技师等级\n官方未公开"),
    ("LINEスキマニ", "零工匹配/派单", ["△","—","△","—","△","—","●","●","△"], "0日元", "180日元/次\n立替支付", "工资+交通费30%"),
]


def cell_text(c: canvas.Canvas, text: str, x: float, y: float, w: float, h: float, size=5.1, color=INK, bold=False, max_lines=3) -> None:
    lines = text_lines(text, "CN-Bold" if bold else "CN", size, w - 8)[:max_lines]
    leading = size + 2.2
    baseline = y + h / 2 + (len(lines) - 1) * leading / 2 - size * 0.34
    c.setFillColor(color)
    c.setFont("CN-Bold" if bold else "CN", size)
    for idx, line in enumerate(lines):
        c.drawCentredString(x + w / 2, baseline - idx * leading, line)


def draw_competitor(c: canvas.Canvas) -> None:
    clean_page(c)
    page_title(c, "竞品定位：NeeDo同时连接交易、IM、经营与增长", "Competitive Positioning", "功能与费用按公开资料核验；●强覆盖，△部分覆盖/需组合，—未见公开支持。", 22)
    x, y, w, h = 25, 100, 910, 270
    shadow_card(c, x, y, w, h, 14, white)
    service_w, pos_w = 74, 82
    dim_w = 40
    month_w, unit_w, rate_w = 118, 135, 141
    header_h, row_h = 52, (h - 52) / 8
    c.setFillColor(GREEN_900); c.roundRect(x, y+h-header_h, w, header_h, 14, fill=1, stroke=0); c.rect(x, y+h-header_h, w, header_h/2, fill=1, stroke=0)
    headers = ["服务/App", "核心定位", "预约\n获客", "上门\n风控", "排班\n日历", "店铺直连\nIM", "私聊", "群聊", "经营\n派单", "支付\n结算", "Boost/\neKYC", "月额", "成果/单次费", "抽成/支付费率"]
    widths = [service_w, pos_w] + [dim_w]*9 + [month_w, unit_w, rate_w]
    starts=[]; cur=x
    for width in widths: starts.append(cur); cur += width
    for idx, head in enumerate(headers):
        parts=head.split("\n"); cx=starts[idx]+widths[idx]/2
        c.setFillColor(white); c.setFont("CN-Bold", 5.1 if idx < 11 else 5.4)
        if len(parts)==1: c.drawCentredString(cx, y+h-30, parts[0])
        else:
            c.drawCentredString(cx, y+h-21, parts[0]); c.drawCentredString(cx, y+h-34, parts[1])
    for ridx,(name,pos,scores,monthly,unit_fee,rate) in enumerate(COMPETITORS):
        yy=y+h-header_h-row_h*(ridx+1)
        if ridx==0: c.setFillColor(MINT_100); c.rect(x+1,yy,w-2,row_h,fill=1,stroke=0)
        elif ridx%2==0: c.setFillColor(MINT_050); c.rect(x+1,yy,w-2,row_h,fill=1,stroke=0)
        c.setStrokeColor(LINE); c.setLineWidth(.35); c.line(x,yy,x+w,yy)
        cell_text(c,name,x,yy,service_w,row_h,4.8,GREEN_900 if ridx==0 else INK,True,2)
        cell_text(c,pos,x+service_w,yy,pos_w,row_h,4.3,INK,False,2)
        for idx,score in enumerate(scores):
            c.setFillColor(GREEN_900 if score=="●" else ORANGE_700 if score=="△" else MUTED)
            c.setFont("EN-Bold" if score=="N/A" else "CN-Bold",4.8 if score=="N/A" else 6.7)
            c.drawCentredString(x+service_w+pos_w+dim_w*(idx+.5),yy+row_h/2-2.4,score)
        fee_color = GREEN_900 if ridx == 0 else ORANGE_700
        cell_text(c,monthly,starts[-3],yy,month_w,row_h,4.4,fee_color,True,3)
        cell_text(c,unit_fee,starts[-2],yy,unit_w,row_h,4.25,fee_color,True,3)
        cell_text(c,rate,starts[-1],yy,rate_w,row_h,4.4,fee_color,True,3)
    for xx in starts[1:]: c.setStrokeColor(LINE); c.setLineWidth(.35); c.line(xx,y,xx,y+h)
    c.setFillColor(MINT_050); c.roundRect(25,72,910,20,8,fill=1,stroke=0)
    c.setFillColor(GREEN_900); c.setFont("CN-Bold",5.8); c.drawCentredString(480,79.5,"NeeDo：月额Free｜500日元/单｜0%固定收费；店铺直连IM、私聊、群聊与经营SaaS在同一系统。")

    sources = [
        (38, "03", "HPB掲載案内", "展示/内容方案个别报价", HPB_LISTING_URL),
        (258, "04", "HPB利用约款", "预约费1%＋积分原资另计", HPB_TERMS_URL),
        (478, "05", "HPBポイント改定", "现行积分付与率1%", HPB_POINT_URL),
        (698, "06", "HOGUGU官方", "月额0；成约费率未公开", HOGUGU_TERMS_URL),
    ]
    for sx, num, publisher, detail, url in sources:
        c.setFillColor(white); c.setStrokeColor(LINE); c.roundRect(sx, 31, 204, 32, 8, fill=1, stroke=1)
        icon_badge(c, sx + 16, 47, num, GREEN_900, MINT_100, 8, "EN-Bold", 4.8)
        c.setFillColor(INK); c.setFont("CN-Bold", 5.1); c.drawString(sx + 31, 51, publisher)
        c.setFillColor(MUTED); c.setFont("CN", 4.4); c.drawString(sx + 31, 39, detail)
        if num == "06":
            c.linkURL(HOGUGU_FAQ_URL, (sx, 31, sx + 102, 63), relative=0, thickness=0)
            c.linkURL(HOGUGU_TERMS_URL, (sx + 102, 31, sx + 204, 63), relative=0, thickness=0)
        else:
            c.linkURL(url, (sx, 31, sx + 204, 63), relative=0, thickness=0)
    c.setFillColor(MUTED); c.setFont("CN",4.5); c.drawString(28,19,"注：HPB“约2%起”为现行预约费1%＋现行积分1%原资的推导，实际以个别合同为准；HOGUGU统一成约费率未公开。")
    c.drawRightString(932,19,"公开资料核验日：2026-08-14")
    footer(c)


def district_card(c: canvas.Canvas, x: float, y: float, title: str, en: str, density: str, scene: str) -> None:
    shadow_card(c,x,y,145,78,12,Color(1,1,1,alpha=.94))
    c.setFillColor(GREEN_900); c.setFont("CN-Bold",9.5); c.drawString(x+13,y+52,title)
    c.setFont("EN-Medium",6.5); c.drawString(x+13,y+40,en)
    c.setFillColor(MUTED); c.setFont("CN-Medium",5.4); c.drawString(x+13,y+24,"人口密度  "+density)
    c.setFillColor(GREEN_900); c.setFont("CN",5.2); c.drawString(x+13,y+10,scene)


def draw_pilot(c: canvas.Canvas) -> None:
    c.drawImage(str(ASSET_DIR/"tokyo-pilot.png"),0,0,PAGE_W,PAGE_H)
    c.setFillColor(Color(0.99,0.98,0.95,alpha=.26)); c.rect(0,0,PAGE_W,PAGE_H,fill=1,stroke=0)
    logo(c)
    c.setFillColor(INK); c.setFont("CN-Bold",31); c.drawString(36,430,"东京核心三区试点")
    c.setFillColor(GREEN_900); c.setFont("EN-Medium",12.8); c.drawString(38,402,"Tokyo Core 3 Zones Pilot")
    c.setStrokeColor(GREEN_400); c.setLineWidth(2.2); c.line(38,389,70,389)
    draw_wrapped(c,"先验证密度、响应、完单、留存，\n再决定全国复制。",38,357,265,"CN-Bold",9.2,18,INK,3)

    shadow_card(c,36,186,238,145,14,Color(1,1,1,alpha=.94))
    pilot_rows = [
        ("试点区域", "3个核心行政区"),
        ("覆盖人口", "约230万"),
        ("初期品类", "按摩类"),
        ("试点区域目标", "500+服务/日"),
    ]
    for idx,(label,value) in enumerate(pilot_rows):
        yy=302-idx*30
        if idx: c.setStrokeColor(LINE); c.setLineWidth(.45); c.line(50,yy+16,259,yy+16)
        c.setFillColor(MUTED); c.setFont("CN",5.8); c.drawString(54,yy,label)
        c.setFillColor(GREEN_900); c.setFont("CN-Bold",8.5 if idx<3 else 11.5); c.drawRightString(256,yy,value)

    district_card(c,629,412,"新宿","Shinjuku","20,000+/km²","酒店/办公/高频到店场景")
    district_card(c,386,250,"涩谷","Shibuya","18,000+/km²","商圈/夜间/碎片需求场景")
    district_card(c,770,245,"港区","Minato","16,000+/km²","酒店/商务/访日客场景")

    validations=[("验证密度","服务供给与订单密度"),("验证响应","需求响应速度与体验"),("验证完单","履约效率与服务质量"),("验证留存","用户满意度与复购率")]
    for idx,(title,detail) in enumerate(validations):
        xx=38+idx*103
        c.setFillColor(Color(1,1,1,alpha=.9)); c.circle(xx+23,132,22,fill=1,stroke=0)
        c.setFillColor(GREEN_900); c.setFont("EN-Bold",11); c.drawCentredString(xx+23,128,str(idx+1).zfill(2))
        c.setFillColor(INK); c.setFont("CN-Bold",6.3); c.drawCentredString(xx+23,96,title)
        c.setFillColor(MUTED); c.setFont("CN",4.9); c.drawCentredString(xx+23,82,detail)
    c.setFillColor(Color(1,1,1,alpha=.9)); c.roundRect(521,53,366,60,14,fill=1,stroke=0)
    c.setFillColor(GREEN_900); c.setFont("CN-Bold",7.4); c.drawString(540,88,"试点目的")
    c.setFillColor(INK); c.setFont("CN",5.9); c.drawString(540,72,"以三区为起点，沉淀供给导入 → 订单密度 → 复购 → 增长模型，")
    c.drawString(540,59,"用真实数据决定全国复制与下一阶段投放。")
    footer(c)


def draw_strategy(c: canvas.Canvas) -> None:
    clean_page(c)
    page_title(c, "三步走战略：从冷启动到高毛利增值变现", "3-Step Growth Strategy", "先建立供给与交易密度，再延展S2B2C，最后用会员、Boost与达人广告提高利润率。", 25)
    phases = [
        (38, "01", "Y1", "SaaS冷启动", "先吸引商家，再吸引技师和用户", ["优质商家入驻，降低服务供给门槛", "个人技师自主排班与多店兼职", "前三个月免费，验证激活与首单"], False),
        (342, "02", "Y2", "S2B2C延伸", "提升库存管理与采购效率", ["打通耗材供应链与在库/发注", "拓展酒店与访日客预约入口", "用统一结算提高履约与利润空间"], False),
        (646, "03", "Y3", "高毛利增值变现", "多元增值服务形成第二增长曲线", ["VIP会员提升复购和生命周期价值", "竞价排名、NeedUp与购买流量", "达人匹配与店铺定向广告变现"], True),
    ]
    for x, num, year, title, subtitle, bullets, orange in phases:
        accent = ORANGE_700 if orange else GREEN_900
        pale = ORANGE_100 if orange else MINT_100
        shadow_card(c, x, 115, 276, 258, 15, white)
        icon_badge(c, x + 31, 338, num, accent, pale, 19, "EN-Bold", 7.4)
        pill(c, x + 205, 328, 50, 21, year, pale, accent, "EN-Bold", 7.5)
        c.setFillColor(INK); c.setFont("CN-Bold", 11); c.drawString(x + 58, 342, title)
        c.setFillColor(MUTED); c.setFont("CN", 5.8); c.drawString(x + 20, 313, subtitle)

        # A compact vector scene gives each phase a visual anchor without
        # embedding rasterized labels or old-page text.
        c.setFillColor(pale); c.roundRect(x + 20, 205, 236, 90, 13, fill=1, stroke=0)
        if num == "01":
            c.setFillColor(white); c.roundRect(x + 49, 226, 58, 48, 8, fill=1, stroke=0)
            c.setFillColor(accent); c.rect(x + 56, 234, 44, 30, fill=1, stroke=0)
            c.setFillColor(pale); c.rect(x + 64, 234, 10, 18, fill=1, stroke=0); c.rect(x + 82, 245, 10, 7, fill=1, stroke=0)
            for cx, label in [(x + 145, "店"), (x + 195, "技")]:
                icon_badge(c, cx, 252, label, accent, white, 18, "CN-Bold", 8)
            c.setStrokeColor(accent); c.setLineWidth(1.2); c.line(x + 107, 250, x + 127, 250); c.line(x + 163, 250, x + 177, 250)
        elif num == "02":
            for idx, height in enumerate([22, 34, 47, 29]):
                c.setFillColor(accent if idx == 2 else GREEN_400); c.roundRect(x + 49 + idx * 35, 226, 24, height, 4, fill=1, stroke=0)
            c.setFillColor(white); c.roundRect(x + 190, 229, 44, 38, 7, fill=1, stroke=0)
            c.setFillColor(accent); c.setFont("CN-Bold", 8); c.drawCentredString(x + 212, 243, "仓")
            c.setStrokeColor(accent); c.setLineWidth(1.2); c.line(x + 169, 246, x + 188, 246)
        else:
            c.setFillColor(white); c.roundRect(x + 62, 220, 72, 57, 10, fill=1, stroke=0)
            c.setFillColor(accent); c.setFont("EN-Bold", 9); c.drawCentredString(x + 98, 251, "BOOST")
            c.setFont("EN-Bold", 16); c.drawCentredString(x + 98, 230, "↗")
            icon_badge(c, x + 184, 252, "VIP", accent, white, 22, "EN-Bold", 6.5)
            c.setFillColor(white); c.roundRect(x + 158, 218, 52, 18, 7, fill=1, stroke=0)
            c.setFillColor(accent); c.setFont("CN-Bold", 5.2); c.drawCentredString(x + 184, 224, "达人匹配")

        for idx, bullet in enumerate(bullets):
            yy = 177 - idx * 22
            draw_check(c, x + 28, yy + 2, 5, accent)
            c.setFillColor(INK); c.setFont("CN", 5.7); c.drawString(x + 41, yy, bullet)

    for x in [326, 630]:
        c.setStrokeColor(GREEN_400); c.setLineWidth(2); c.line(x - 5, 245, x + 10, 245)
        c.line(x + 5, 249, x + 10, 245); c.line(x + 5, 241, x + 10, 245)
    c.setFillColor(MINT_050); c.roundRect(38, 59, 884, 37, 11, fill=1, stroke=0)
    c.setFillColor(GREEN_900); c.setFont("CN-Bold", 7); c.drawString(58, 75, "三步走战略：")
    c.setFillColor(INK); c.setFont("CN-Medium", 6.2); c.drawString(128, 75, "供给丰富化  →  场景多元化  →  变现高毛利化  →  增长可持续化")
    footer(c)


def compact_metric_table(c: canvas.Canvas, x: float, y: float, w: float, rows: list[tuple[str, list[str]]], accent=GREEN_900, pale=MINT_100) -> None:
    label_w = 116
    val_w = (w - label_w) / 3
    header_h, row_h = 23, 23
    total_h = header_h + len(rows) * row_h
    c.setFillColor(white); c.setStrokeColor(LINE); c.roundRect(x, y, w, total_h, 9, fill=1, stroke=1)
    c.setFillColor(pale); c.roundRect(x, y + total_h - header_h, w, header_h, 9, fill=1, stroke=0); c.rect(x, y+total_h-header_h, w, header_h/2, fill=1, stroke=0)
    c.setFillColor(accent); c.setFont("CN-Bold", 6.7); c.drawString(x+10, y+total_h-15, "核心指标")
    for idx, year in enumerate(["Y1","Y2","Y3"]): c.drawCentredString(x+label_w+val_w*(idx+.5),y+total_h-15,year)
    for ridx,(label,vals) in enumerate(rows):
        yy=y+total_h-header_h-row_h*(ridx+1)
        if ridx%2: c.setFillColor(MINT_050); c.rect(x+.5,yy,w-1,row_h,fill=1,stroke=0)
        c.setStrokeColor(LINE); c.setLineWidth(.35); c.line(x,yy,x+w,yy)
        c.setFillColor(INK); c.setFont("CN",6.1); c.drawString(x+10,yy+8,label)
        for idx,val in enumerate(vals):
            color=RED if val.startswith("-") else accent if ridx in [1,2] else INK
            c.setFillColor(color); c.setFont("EN-Medium",7.2); c.drawCentredString(x+label_w+val_w*(idx+.5),yy+8,val)


def financial_scenario(c: canvas.Canvas, x: float, y: float, high: bool) -> None:
    w,h=428,316; accent=ORANGE_700 if high else GREEN_900; pale=ORANGE_100 if high else MINT_100
    shadow_card(c,x,y,w,h,15,white)
    pill(c,x+16,y+h-39,112 if high else 104,24,"方案B · 高速增长" if high else "方案A · 保守增长",pale,accent,"CN-Bold",8.2)
    c.setFillColor(INK); c.setFont("CN-Bold",10.5); c.drawString(x+140,y+h-32,"1,000 → 2,000 → 4,000家" if high else "500 → 1,000 → 2,000家")
    c.setFillColor(MUTED); c.setFont("CN",6.3); c.drawString(x+16,y+h-57,"Y1广告1.08亿日元，按里程碑分阶段投放" if high else "月额Free；研发与投放随里程碑弹性收缩")
    metrics=[("三年累计营收","4,526.6" if high else "711.4"),("三年累计营业利润","+1,284.3" if high else "+4.6"),("Y3营业利润率","39.7%" if high else "15.2%")]
    for idx,(label,value) in enumerate(metrics):
        xx=x+18+idx*138
        c.setFillColor(MUTED); c.setFont("CN",5.8); c.drawString(xx,y+h-87,label)
        c.setFillColor(accent); c.setFont("EN-Bold",15 if idx<2 else 14); c.drawString(xx,y+h-111,value)
    compact_metric_table(c,x+16,y+55,w-32,[
        ("营业收入（MJPY）",["263.5","1,233.7","3,029.4"] if high else ["40.2","192.5","478.8"]),
        ("营业利润（MJPY）",["-177.7","260.0","1,202.0"] if high else ["-56.0","-12.5","73.0"]),
        ("期末现金（MJPY）",["22.3","282.3","1,484.3"] if high else ["144.0","131.6","204.6"]),
        ("期末店铺数",["1,000","2,000","4,000"] if high else ["500","1,000","2,000"]),
        ("外国男性用户（千人）",["228.4","488.7","1,045.8"] if high else ["22.8","48.9","104.6"]),
    ],accent,pale)
    c.setFillColor(pale); c.roundRect(x+16,y+13,w-32,29,9,fill=1,stroke=0)
    c.setFillColor(accent); c.setFont("CN-Bold",6.2)
    if high: c.drawCentredString(x+w/2,y+23,"三年经营投资回报率 642.2% ＝ 累计营业利润 ÷ 本轮融资额")
    else: c.drawCentredString(x+w/2,y+23,"月额Free｜500日元/单｜新店前三个月免费｜外国用户为高速版10%")


def draw_financial(c: canvas.Canvas) -> None:
    clean_page(c)
    title = "三年财务预测"
    page_title(c,title,"3-Year Financial Projections · Conservative vs. High Growth",None,29)
    note_x = 38 + word_width(title, "CN-Bold", 29) + 8
    c.setFillColor(RED); c.setFont("CN-Bold",7); c.drawString(note_x,449,"*仅按摩类")
    financial_scenario(c,38,70,False); financial_scenario(c,494,70,True)
    footer(c,"金额单位为百万日元（MJPY）；累计值按未四舍五入明细计算；经营投资回报率不等同股权退出回报或投资人IRR。")


def assumptions_scenario(c: canvas.Canvas,x:float,y:float,high:bool) -> None:
    w,h=430,193; accent=ORANGE_700 if high else GREEN_900; pale=ORANGE_100 if high else MINT_100
    shadow_card(c,x,y,w,h,14,white); pill(c,x+14,y+h-37,116,23,"方案B · 高速增长" if high else "方案A · 保守增长",pale,accent,"CN-Bold",8)
    c.setFillColor(MUTED); c.setFont("CN",5.7); c.drawRightString(x+w-14,y+h-28,"模型V1.4")
    rows=[("期末店铺数",["1,000","2,000","4,000"] if high else ["500","1,000","2,000"]),("年平均活跃店铺",["500","1,500","3,000"] if high else ["250","750","1,500"]),("平均/期末店铺比",["50%","75%","75%"]),("可计费店铺月",["3,375","15,000","30,375"] if high else ["1,688","7,500","15,188"]),("完成订单/活跃店/月",["156.1","134.3","138.1"] if high else ["47.6","45.4","45.8"])]
    compact_metric_table(c,x+14,y+12,w-28,rows,accent,pale)


def notes_card(c:canvas.Canvas,x:float,y:float,w:float,title:str,lines:list[str],orange=False) -> None:
    shadow_card(c,x,y,w,99,13,white); accent=ORANGE_700 if orange else GREEN_900
    c.setFillColor(accent); c.setFont("CN-Bold",8.5); c.drawString(x+15,y+76,title)
    for idx,line in enumerate(lines):
        c.setFillColor(accent if idx==len(lines)-1 else INK); c.setFont("CN-Bold" if idx==len(lines)-1 else "CN",5.8)
        c.drawString(x+15,y+57-idx*15,"• "+line)


def draw_assumptions(c: canvas.Canvas) -> None:
    clean_page(c); page_title(c,"关键财务假设","Key Financial Assumptions",None,29)
    assumptions_scenario(c,38,188,False); assumptions_scenario(c,492,188,True)
    notes_card(c,38,73,430,"收入、激活与获客口径",["平台收费500日元/收费资格订单；不是GMV百分比抽成","SaaS月费0日元；新店前3个月免单笔费","暂定门槛：30日店铺激活≥60%；首单率≥40%","暂定门槛：用户CAC≤1,000日元；90日复购≥25%"])
    notes_card(c,492,73,430,"外国用户与获客假设",["高速渗透率1%/2%/4%；2次/人/年","保守为高速外国男性用户数的10%；1次/人/年","高速用户22.84万/48.87万/104.58万","渠道：多语言SEO/SEM、酒店/OTA/旅媒、在日社群"],True)
    footer(c,"单店月订单=年完成订单÷年平均活跃店铺÷12；CAC/激活/复购为投放验收门槛，不是已实现业绩，试点后按真实数据更新。")


def allocation_row(c:canvas.Canvas,x:float,y:float,label:str,value:str,pct:int,color,detail:str)->None:
    c.setFillColor(INK); c.setFont("CN-Bold",6.8); c.drawString(x,y+5,label)
    c.setFillColor(color); c.setFont("EN-Bold",7); c.drawRightString(x+245,y+5,value)
    c.setFillColor(MUTED); c.setFont("CN",5); c.drawString(x,y-5,detail)
    c.setFillColor(SOFT_LINE); c.roundRect(x,y-12,245,5,2.5,fill=1,stroke=0)
    c.setFillColor(color); c.roundRect(x,y-12,245*pct/54,5,2.5,fill=1,stroke=0)


def fund_stage(c:canvas.Canvas,x:float,num:str,title:str,detail1:str,detail2:str,orange=False)->None:
    shadow_card(c,x,278,166,86,12,white); accent=ORANGE_700 if orange else GREEN_900; pale=ORANGE_100 if orange else MINT_100
    pill(c,x+12,334,31,20,num,pale,accent,"EN-Bold",7.4)
    c.setFillColor(INK); c.setFont("CN-Bold",8); c.drawString(x+52,340,title)
    c.setFillColor(MUTED); c.setFont("CN",5.8); c.drawString(x+14,313,detail1); c.drawString(x+14,297,detail2)


def result_card(c:canvas.Canvas,x:float,high:bool)->None:
    w=270; accent=ORANGE_700 if high else GREEN_900; pale=ORANGE_100 if high else MINT_100
    shadow_card(c,x,92,w,140,12,white); pill(c,x+12,199,96,22,"方案B · 高速" if high else "方案A · 保守",pale,accent,"CN-Bold",8)
    rows=[("三年累计营收","4,526.6 MJPY" if high else "711.4 MJPY"),("三年累计营业利润","+1,284.3 MJPY" if high else "+4.6 MJPY"),("Y3营业利润","1,202.0 MJPY" if high else "73.0 MJPY"),("Y3期末现金","1,484.3 MJPY" if high else "204.6 MJPY")]
    if high: rows.append(("三年经营投资回报率","642.2%"))
    for idx,(label,value) in enumerate(rows):
        yy=180-idx*20; c.setFillColor(MUTED); c.setFont("CN",5.7); c.drawString(x+15,yy,label); c.setFillColor(accent); c.setFont("EN-Bold",7.4); c.drawRightString(x+w-15,yy,value)


def draw_funding(c: canvas.Canvas) -> None:
    clean_page(c); page_title(c,"融资计划与财务情景","Funding Plan & Milestone-Gated Deployment",None,29); pill(c,776,462,146,24,"融资2亿日元 / 10%",MINT_100,GREEN_900,"CN-Bold",8)
    shadow_card(c,38,65,300,322,14,white); c.setFillColor(MUTED); c.setFont("CN",6); c.drawString(56,360,"本轮融资")
    c.setFillColor(GREEN_900); c.setFont("EN-Bold",23); c.drawString(56,329,"JPY 200M"); c.setFillColor(INK); c.setFont("EN-Bold",14); c.drawRightString(318,332,"for 10%")
    c.setStrokeColor(LINE); c.line(56,315,320,315); c.setFillColor(INK); c.setFont("CN-Bold",7.8); c.drawString(56,293,"融资款用途（合计200 MJPY）")
    uses=[("广告及品牌增长","108M / 54%",54,GREEN_900,"原预算8M＋新增100M；按里程碑释放"),("产品开发与研发","20M / 10%",10,GREEN_600,"Y1开发预算；不含维护与服务器"),("系统与生产基础设施","40M / 20%",20,GREEN_400,"云服务、维护、监控、安全与备份"),("商务拓展及店铺导入","18M / 9%",9,ORANGE_700,"BD人力、拜访、培训、开店配置、上线激活"),("运营周转及合规储备","14M / 7%",7,HexColor("#8BAA98"),"客服、风控、保险、法务、会计、人事与办公")]
    for idx,row in enumerate(uses): allocation_row(c,56,270-idx*42,*row)
    c.setFillColor(MINT_050); c.roundRect(56,68,264,18,7,fill=1,stroke=0); c.setFillColor(GREEN_900); c.setFont("CN-Bold",5.8); c.drawCentredString(188,74,"资金用途为融资分配，不等同损益表成本分类")
    c.setFillColor(INK); c.setFont("CN-Bold",10); c.drawString(360,373,"广告预算：分阶段释放")
    fund_stage(c,360,"01","PMF验证","店铺激活率","首单完成率"); fund_stage(c,546,"02","单城密度","CAC与复购率","订单/服务密度"); fund_stage(c,732,"03","规模扩张","履约质量稳定","释放剩余预算",True)
    c.setFillColor(INK); c.setFont("CN-Bold",10); c.drawString(360,249,"双情景三年结果")
    result_card(c,360,False); result_card(c,648,True)
    c.setFillColor(MINT_050); c.roundRect(360,55,558,24,8,fill=1,stroke=0); c.setFillColor(GREEN_900); c.setFont("CN-Bold",6.2); c.drawCentredString(639,64,"只有当激活、CAC、复购与订单密度同时过线，才扩大投放。")
    footer(c,"三年经营投资回报率=三年累计营业利润÷本轮融资额2亿日元；不等同股权退出回报或投资人IRR。")


def closing_goal(c:canvas.Canvas,x:float,num:str,title:str,detail:str,orange=False)->None:
    shadow_card(c,x,232,198,105,13,white); accent=ORANGE_700 if orange else GREEN_900; pale=ORANGE_100 if orange else MINT_100
    pill(c,x+14,299,34,23,num,pale,accent,"EN-Bold",8); c.setFillColor(INK); c.setFont("CN-Bold",9.5); c.drawString(x+58,306,title); draw_wrapped(c,detail,x+15,274,168,"CN",6.2,11,MUTED,3)


def draw_closing(c: canvas.Canvas) -> None:
    clean_page(c); page_title(c,"本轮融资后18个月目标","18-Month Post-Funding Milestones",None,29); pill(c,790,462,132,24,"从试点到可复制",MINT_100,GREEN_900,"CN-Bold",8)
    c.setFillColor(INK); c.setFont("CN-Bold",17); c.drawString(38,373,"把NeeDo从“可用产品”推进到“可复制的单城模型”")
    c.setFillColor(MUTED); c.setFont("CN",6.8); c.drawString(38,354,"预算不以时间自动释放；每一阶段都以真实激活、成交、复购、履约与安全数据验收。")
    closing_goal(c,38,"01","产品闭环","完成预约/Request、排班日历、IM、经营、支付结算与eKYC核心闭环。")
    closing_goal(c,266,"02","东京三区试点","以新宿、涩谷、港区验证试点区域目标：500+服务/日。")
    closing_goal(c,494,"03","单位经济验证","得到可审计的店铺激活率、CAC、复购率、订单密度与履约质量。",True)
    closing_goal(c,722,"04","外国用户增长","验证多语言获客渠道与外国男性用户使用频次，未过线不放大投放。",True)
    c.setFillColor(MINT_050); c.roundRect(38,151,882,55,14,fill=1,stroke=0); c.setFillColor(GREEN_900); c.setFont("CN-Bold",8.4); c.drawString(57,183,"18个月验收结果")
    c.setFillColor(INK); c.setFont("CN",6.3); c.drawString(57,166,"形成可复制到其他核心城市的“供给导入 → 订单密度 → 复购 → 增长”运营模型，并以真实数据更新下一轮财务计划。")
    shadow_card(c,225,69,510,61,15,white); c.setFillColor(MUTED); c.setFont("CN",6.4); c.drawCentredString(480,109,"欢迎就产品、试点合作与本轮融资进一步交流")
    c.setFillColor(GREEN_900); c.setFont("CN-Bold",17); c.drawCentredString(480,84,"WX：EasonSunJP"); footer(c)


# ---------------------------------------------------------------------------
# V4 Key Visual locked narrative pages
# ---------------------------------------------------------------------------

def v4_draw_cover(c: canvas.Canvas) -> None:
    master_page(c, 1)
    searchable_text_layer(c, [
        "NeeDo Business Plan",
        "本地生活服务撮合平台 × SaaS × 供应链 × 生态变现",
        "SaaS为基础的店铺组织化、交易撮合与增长闭环、S2B2C扩展",
    ])


def v4_draw_market(c: canvas.Canvas) -> None:
    master_page(c, 2)
    searchable_text_layer(c, [
        "市场机会",
        "本地生活服务市场规模庞大，但供给高度分散、数字化程度低、获客效率低下。",
        "NeeDo以数字化基础设施连接本地服务供给与需求。",
    ])

    # Replace the four obsolete market cards as complete components, keeping
    # the original ecosystem illustration, phone, icons, mascot and layout.
    master_metric_card(c, 16, 209, "8.23万亿", "服务类B2C-EC", "日本2024年 · 广义口径", "01")
    master_metric_card(c, 142, 209, "7,302亿", "理美容B2C-EC", "美发/美甲/美容/放松", "01")
    master_metric_card(c, 16, 126, "+6.54%", "理美容EC同比", "2024 vs. 2023", "01")
    master_metric_card(c, 142, 126, "59.0%", "放松沙龙网络预约", "Recruit · 2025", "02")

    # Integrate sources into the original quiet footer rather than adding a
    # full-width repair strip.
    c.setFillColor(Color(0.985, 0.979, 0.956, alpha=0.985))
    c.rect(28, 12, 655, 26, fill=1, stroke=0)
    c.setFillColor(MUTED)
    c.setFont("CN", 4.2)
    note_1 = "① 经济产业省《令和6年度电子商务市场调查》2025-08-26｜服务类与理美容B2C-EC"
    note_2 = "② Recruit《美容センサス2025上期・リラクゼーションサロン編》"
    c.drawString(32, 27, note_1)
    c.drawString(32, 17, note_2)
    c.setFillColor(GREEN_900)
    c.setFont("EN-Medium", 3.8)
    url_1_x = 32 + pdfmetrics.stringWidth(note_1, "CN", 4.2) + 8
    url_2_x = 32 + pdfmetrics.stringWidth(note_2, "CN", 4.2) + 8
    c.drawString(url_1_x, 27, "meti.go.jp")
    c.drawString(url_2_x, 17, "hba.beauty.hotpepper.jp")
    c.linkURL(METI_URL, (32, 22, url_1_x + 42, 36), relative=0, thickness=0)
    c.linkURL(RECRUIT_URL, (32, 12, url_2_x + 96, 23), relative=0, thickness=0)


def v4_draw_why_now(c: canvas.Canvas) -> None:
    master_page(c, 3)
    searchable_text_layer(c, [
        "供给侧觉醒与零工经济爆发",
        "市场压力、就业转型、中介解体与新手危机共同推动供给重构。",
    ])


def v4_draw_solution(c: canvas.Canvas) -> None:
    master_page(c, 4)
    searchable_text_layer(c, [
        "NeeDo的解决方案",
        "以生活服务为核心的一体化SaaS管理、交易撮合与增长解决方案。",
        "用户、技师/服务者、商家/店铺与平台/SaaS形成可持续增长飞轮。",
    ])

    # The original card is replaced as one whole card, avoiding pasted labels.
    shadow_card(c, 35, 168, 360, 68, 12, white, HexColor("#E5E1D8"))
    metrics = [
        ("Y3技师/服务者", "3万名"),
        ("Y3完成订单", "497.2万笔"),
        ("Y3店铺数", "4,000家"),
    ]
    for idx, (label, value) in enumerate(metrics):
        xx = 47 + idx * 115
        if idx:
            c.setStrokeColor(LINE)
            c.setLineWidth(0.55)
            c.line(xx - 9, 181, xx - 9, 224)
        c.setFillColor(MUTED)
        c.setFont("CN-Medium", 5.8)
        c.drawString(xx, 217, label)
        c.setFillColor(GREEN_900)
        c.setFont("CN-Bold", 14.2)
        c.drawString(xx, 191, value)
    c.setFillColor(RED)
    c.setFont("CN-Bold", 4.7)
    c.drawRightString(383, 175, "高速增长版Y3数据预测｜仅按摩类")


def v4_draw_dual_engine(c: canvas.Canvas) -> None:
    master_page(c, 5)
    searchable_text_layer(c, [
        "双轨交易引擎",
        "Booking普通预约与Request极速发单并行，统一进入履约、积分与风控账本。",
    ])


def v4_draw_moat(c: canvas.Canvas) -> None:
    master_page(c, 6)
    searchable_text_layer(c, [
        "核心壁垒",
        "SaaS粘性、履约密度、数据复利、供给组织化、增长变现与NDP共同构成壁垒。",
    ])


def v4_draw_strategy(c: canvas.Canvas) -> None:
    master_page(c, 9)
    searchable_text_layer(c, [
        "三步走战略",
        "SaaS冷启动、S2B2C延伸、高毛利增值变现。",
    ])


def v4_draw_roadmap(c: canvas.Canvas) -> None:
    master_page(c, 7)
    searchable_text_layer(c, [
        "18个月版本迭代路线图",
        "从测试期、正式上线、VIP、在库管理、酒店预约、NeedUp到NeeDoAffi。",
    ])

    # Rebuild the complete title field below the original logo.  It occupies
    # the source page's existing white editorial space and never crosses the
    # logo safe area.
    c.setFillColor(white)
    c.rect(24, 376, 456, 110, fill=1, stroke=0)
    c.setFillColor(INK)
    c.setFont("CN-Heavy", 27)
    c.drawString(29, 432, "18个月版本迭代路线图")
    c.setFillColor(GREEN_900)
    c.setFont("EN-Medium", 12.2)
    c.drawString(29, 404, "18-Month Product Roadmap")
    c.setStrokeColor(GREEN_400)
    c.setLineWidth(2.2)
    c.line(29, 390, 75, 390)
    # Replace the original principle strip as one integrated timeline ribbon.
    shadow_card(c, 27, 22, 579, 49, 13, white, HexColor("#D9E5DB"))
    c.setFillColor(GREEN_900)
    c.setFont("CN-Bold", 5.2)
    c.drawString(43, 56, "当前：第0期测试期｜责任：产品/工程/运营｜每期未过KPI不扩张")
    c.setFillColor(INK)
    c.setFont("CN-Medium", 4.9)
    c.drawString(43, 42, "M0–3测试 → M3–6上线 → M6–9 VIP → M9–12在库 → M12–15酒店")
    c.drawString(43, 29, "M15–17 NeedUp → M17–18 NeeDoAffi｜验收：激活、首单、密度、复购、履约与安全")


def v4_district_card(c: canvas.Canvas, x: float, y: float, w: float, h: float, title: str, en: str, density: str, scene: str) -> None:
    shadow_card(c, x, y, w, h, 11, white, HexColor("#E2E1DA"))
    c.setFillColor(GREEN_900)
    c.circle(x + 17, y + h - 21, 7, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("EN-Bold", 6)
    c.drawCentredString(x + 17, y + h - 23, "•")
    c.setFillColor(INK)
    c.setFont("CN-Bold", 8.8)
    c.drawString(x + 29, y + h - 22, title)
    c.setFillColor(GREEN_900)
    c.setFont("EN-Medium", 5.9)
    c.drawString(x + 29, y + h - 35, en)
    c.setStrokeColor(LINE)
    c.setLineWidth(0.45)
    c.line(x + 10, y + h - 45, x + w - 10, y + h - 45)
    c.setFillColor(MUTED)
    c.setFont("CN", 4.5)
    c.drawString(x + 11, y + 23, "人口密度  " + density)
    c.setFillColor(GREEN_900)
    c.setFont("CN-Medium", 4.5)
    c.drawString(x + 11, y + 9, scene)


def v4_draw_pilot(c: canvas.Canvas) -> None:
    master_page(c, 8)
    searchable_text_layer(c, [
        "东京核心三区试点",
        "先验证密度、响应、完单与留存，再决定全国复制。",
        "新宿、涩谷、港区试点区域总体目标为500+服务/日。",
    ])

    # Replace the full scope card, not individual labels.
    shadow_card(c, 36, 145, 179, 129, 13, white, HexColor("#E3E0D8"))
    rows = [
        ("试点区域", "3个核心行政区"),
        ("覆盖人口", "约230万"),
        ("初期品类", "按摩类"),
        ("试点区域目标", "500+服务/日"),
    ]
    for idx, (label, value) in enumerate(rows):
        yy = 251 - idx * 28
        if idx:
            c.setStrokeColor(LINE)
            c.setLineWidth(0.45)
            c.line(49, yy + 15, 201, yy + 15)
        c.setFillColor(MUTED)
        c.setFont("CN", 5.2)
        c.drawString(50, yy, label)
        c.setFillColor(GREEN_900)
        c.setFont("CN-Bold", 7.7 if idx < 3 else 10.5)
        c.drawRightString(200, yy, value)

    # Remove every old per-district service-volume figure; replace each
    # complete bubble with population density and scenario only.
    v4_district_card(c, 584, 430, 126, 82, "新宿", "Shinjuku", "20,000+/km²", "酒店/办公/高频到店")
    v4_district_card(c, 305, 234, 123, 82, "涩谷", "Shibuya", "18,000+/km²", "商圈/夜间/碎片需求")
    v4_district_card(c, 820, 207, 119, 87, "港区", "Minato", "16,000+/km²", "酒店/商务/访日客")


V4_COMPETITORS = [
    ("NeeDo", "交易+SaaS+风控+增长", ["●","●","●","●","●","●","●","●"], "Free｜月额0", "500日元/收费资格订单\n新店3个月0", "0%\n非GMV抽成", "9.4/10｜闭环最全\n交易+三IM+经营+风控"),
    ("HOT PEPPER Beauty", "美容获客媒体", ["●","—","●","△","—","—","●","△"], "按地区/方案个别报价\n展示越多越贵", "约2%起\n预约1%＋积分1%", "无另列成交抽成\n以合同为准", "6.8/10｜获客强\n无上门灵活供给"),
    ("minimo", "技师个人集客/预约", ["●","—","△","△","●","—","△","△"], "0日元", "110–880日元/单\n按施术价分段", "固定成果费\n非百分比", "6.2/10｜私聊强\n经营/群聊弱"),
    ("EPARK", "垂直到店预约门户", ["●","—","△","—","—","—","△","△"], "个别询价", "来店成果计费\n金额未公开", "费率未公开", "4.9/10｜到店获客\n经营/IM较弱"),
    ("Airリザーブ", "通用预约SaaS", ["●","△","●","—","—","—","●","—"], "0/5,500/11,000\n日元/月", "无预约従量费", "在线支付3.24%", "5.8/10｜预约强\n无获客/Boost"),
    ("くらしのマーケット", "上门服务撮合", ["△","●","△","△","●","—","●","△"], "初期/月额0", "最低2,000日元\n低价订单", "预约20%＋税", "6.7/10｜上门强\n经营/群聊弱"),
    ("HOGUGU", "按摩上门预约撮合", ["●","△","△","△","●","—","●","△"], "注册/月额/广告0", "安心支持费500日元\n/结算期", "预约29.8%–40.8%\n日付另加10%", "6.5/10｜匹配强\n未见SOS/群聊"),
    ("LINEスキマニ", "零工匹配/派单", ["△","—","△","—","△","—","●","△"], "初期/月额0", "立替支付180日元/次", "工资+交通费30%", "5.4/10｜零工支付\n非预约平台"),
]


def v4_draw_competitor(c: canvas.Canvas) -> None:
    clean_page(c)
    page_title(c, "竞品定位：NeeDo连接交易、三种IM、经营与增长", "Competitive Positioning & Pricing", "综合匹配度为相对NeeDo目标场景的产品适配评分，不代表企业价值评价。", 21)

    # Split the comparison into two synchronized tables.  This retains every
    # requested function and fee field while keeping the page readable on a
    # 1080p meeting-room screen.
    y, h, header_h = 91, 296, 38
    left_x, left_w = 20, 400
    right_x, right_w = 430, 510
    row_h = (h - header_h) / 8
    left_widths = [88, 37, 42, 37, 44, 26, 26, 48, 52]
    left_headers = [
        "服务/App", "预约\n获客", "上门\n+风控", "排班\n日历", "店铺直连\nIM",
        "私聊", "群聊", "经营\n+支付", "Boost\n+eKYC",
    ]
    right_widths = [85, 95, 115, 100, 115]
    right_headers = ["服务/App", "月额", "成果/单次费", "抽成/支付费率", "总评价｜分数+理由"]

    def draw_header(x: float, w: float, widths: list[float], headers: list[str]) -> list[float]:
        shadow_card(c, x, y, w, h, 13, white)
        starts: list[float] = []
        cur = x
        for width in widths:
            starts.append(cur)
            cur += width
        c.setFillColor(GREEN_900)
        c.roundRect(x, y + h - header_h, w, header_h, 13, fill=1, stroke=0)
        c.rect(x, y + h - header_h, w, header_h / 2, fill=1, stroke=0)
        for idx, head in enumerate(headers):
            parts = head.split("\n")
            cx = starts[idx] + widths[idx] / 2
            c.setFillColor(white)
            c.setFont("CN-Bold", 4.55 if len(headers) > 5 else 5.8)
            if len(parts) == 1:
                c.drawCentredString(cx, y + h - 24, parts[0])
            else:
                c.drawCentredString(cx, y + h - 15, parts[0])
                c.drawCentredString(cx, y + h - 28, parts[1])
        return starts

    left_starts = draw_header(left_x, left_w, left_widths, left_headers)
    right_starts = draw_header(right_x, right_w, right_widths, right_headers)

    source_by_name = {
        "HOT PEPPER Beauty": HPB_LISTING_URL,
        "minimo": MINIMO_PRICE_URL,
        "Airリザーブ": AIR_RESERVE_PRICE_URL,
        "くらしのマーケット": CURAMA_PRICE_URL,
        "HOGUGU": HOGUGU_FAQ_URL,
        "LINEスキマニ": LINE_SUKIMANI_PRICE_URL,
    }
    for ridx, (name, position, scores, monthly, unit_fee, rate, evaluation) in enumerate(V4_COMPETITORS):
        yy = y + h - header_h - row_h * (ridx + 1)
        for xx, ww in ((left_x, left_w), (right_x, right_w)):
            if ridx == 0:
                c.setFillColor(MINT_100)
                c.rect(xx + 1, yy, ww - 2, row_h, fill=1, stroke=0)
            elif ridx % 2 == 0:
                c.setFillColor(MINT_050)
                c.rect(xx + 1, yy, ww - 2, row_h, fill=1, stroke=0)
            c.setStrokeColor(LINE)
            c.setLineWidth(0.35)
            c.line(xx, yy, xx + ww, yy)
        c.setFillColor(GREEN_900 if ridx == 0 else INK)
        c.setFont("CN-Bold", 4.7)
        c.drawCentredString(left_starts[0] + left_widths[0] / 2, yy + row_h / 2 + 2.5, name)
        c.setFillColor(MUTED)
        c.setFont("CN", 3.45)
        c.drawCentredString(left_starts[0] + left_widths[0] / 2, yy + row_h / 2 - 7.2, position)
        for idx, score in enumerate(scores):
            c.setFillColor(GREEN_900 if score == "●" else ORANGE_700 if score == "△" else MUTED)
            c.setFont("CN-Bold", 7.5)
            c.drawCentredString(left_starts[1 + idx] + left_widths[1 + idx] / 2, yy + row_h / 2 - 2.8, score)
        cell_text(c, name, right_starts[0], yy, right_widths[0], row_h, 5.7, GREEN_900 if ridx == 0 else INK, True, 2)
        fee_color = GREEN_900 if ridx == 0 else ORANGE_700
        cell_text(c, monthly, right_starts[1], yy, right_widths[1], row_h, 6.0, fee_color, True, 2)
        cell_text(c, unit_fee, right_starts[2], yy, right_widths[2], row_h, 6.0, fee_color, True, 2)
        cell_text(c, rate, right_starts[3], yy, right_widths[3], row_h, 6.0, fee_color, True, 2)
        cell_text(c, evaluation, right_starts[4], yy, right_widths[4], row_h, 5.8, GREEN_900 if ridx == 0 else INK, ridx == 0, 2)
        if name in source_by_name:
            c.linkURL(source_by_name[name], (right_starts[0], yy, right_starts[0] + right_widths[0], yy + row_h), relative=0, thickness=0)

    for starts, widths in ((left_starts, left_widths), (right_starts, right_widths)):
        for xx in starts[1:]:
            c.setStrokeColor(LINE)
            c.setLineWidth(0.35)
            c.line(xx, y, xx, y + h)

    source_chips = [
        ("① HPB 刊登/约款/积分", HPB_LISTING_URL),
        ("② minimo 官方价格", MINIMO_PRICE_URL),
        ("③ Airリザーブ价格", AIR_RESERVE_PRICE_URL),
        ("④ くらし手数料", CURAMA_PRICE_URL),
        ("⑤ HOGUGU官方FAQ", HOGUGU_FAQ_URL),
        ("⑥ LINEスキマニ价格", LINE_SUKIMANI_PRICE_URL),
    ]
    for idx, (label, url) in enumerate(source_chips):
        xx = 21 + idx * 153
        c.setFillColor(MINT_050)
        c.roundRect(xx, 54, 144, 19, 7, fill=1, stroke=0)
        c.setFillColor(GREEN_900)
        c.setFont("CN-Medium", 4.7)
        c.drawCentredString(xx + 72, 61, label)
        if idx == 0:
            c.linkURL(HPB_LISTING_URL, (xx, 54, xx + 48, 73), relative=0, thickness=0)
            c.linkURL(HPB_TERMS_URL, (xx + 48, 54, xx + 96, 73), relative=0, thickness=0)
            c.linkURL(HPB_POINT_URL, (xx + 96, 54, xx + 144, 73), relative=0, thickness=0)
        else:
            c.linkURL(url, (xx, 54, xx + 144, 73), relative=0, thickness=0)
    c.setFillColor(MUTED)
    c.setFont("CN", 4.15)
    c.drawString(23, 37, "HPB约2%起＝现行网络预约费1%＋基本积分1%原资，实际依个别合同；HOGUGU未见行程共享/SOS公开支持。公开资料核验日：2026-08-14")
    c.setFillColor(GREEN_900)
    c.setFont("CN-Bold", 5.1)
    c.drawCentredString(480, 24, "NeeDo差异：多模式排班｜店铺直连IM（预约前/中/后）＋私聊/群聊｜上门行程共享＋一键SOS｜增长与经营闭环")
    footer(c)


def build_pages() -> None:
    WORK_DIR.mkdir(parents=True,exist_ok=True)
    c=canvas.Canvas(str(PAGES_PDF),pagesize=(PAGE_W,PAGE_H))
    builders = [
        v4_draw_cover,
        v4_draw_market,
        v4_draw_why_now,
        v4_draw_solution,
        v4_draw_dual_engine,
        v4_draw_moat,
        v4_draw_strategy,
        v4_draw_roadmap,
        v4_draw_competitor,
        v4_draw_pilot,
        draw_financial,
        draw_assumptions,
        draw_funding,
        draw_closing,
    ]
    copyright_sources = {1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 9, 8: 7, 10: 8}
    for page_number, builder in enumerate(builders, start=1):
        builder(c)
        standard_copyright(c, copyright_sources.get(page_number))
        c.showPage()
    c.save()


def merge() -> None:
    new=PdfReader(str(PAGES_PDF)); writer=PdfWriter()
    for page in new.pages:
        writer.add_page(page)
    writer.add_metadata({"/Title":"NeeDo Business Plan CN - Key Visual Locked Premium Investor Edition V4","/Author":"LifeDance Co., Ltd.","/Subject":"14-page Key Visual locked investor edition V4; JPY 200M for 10%"})
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    with OUTPUT.open("wb") as stream: writer.write(stream)


def main() -> None:
    register_fonts(); build_pages(); merge()
    print(f"OUTPUT={OUTPUT}"); print(f"PAGES={len(PdfReader(str(OUTPUT)).pages)}"); print(f"SIZE={OUTPUT.stat().st_size}")


if __name__=="__main__": main()
