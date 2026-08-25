from __future__ import annotations

import importlib.util
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import HexColor, white
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfgen import canvas


ROOT = Path("/Users/eason/Documents/New project")
SOURCE_PDF = Path("/Users/eason/Downloads/NeeDoBP/NeeDoBP_CN_后3页数字修正版.pdf")
SOURCE_RENDER_DIR = ROOT / "tmp/pdfs/needo_bp_source"
WORK_DIR = ROOT / "tmp/pdfs/needo_bp_v3"
OUTPUT_DIR = ROOT / "output/pdf"
NEW_PAGES_PDF = WORK_DIR / "replacement_and_new_pages.pdf"
OUTPUT_PDF = OUTPUT_DIR / "NeeDoBP_CN_投资人版_14页_2026-08-14.pdf"

PAGE_W = 960
PAGE_H = 540

GREEN_DARK = HexColor("#075A39")
GREEN = HexColor("#148657")
GREEN_MID = HexColor("#49B77D")
GREEN_LIGHT = HexColor("#E7F4EA")
GREEN_PALE = HexColor("#F4FAF5")
ORANGE = HexColor("#E4A126")
ORANGE_DARK = HexColor("#B46A00")
ORANGE_PALE = HexColor("#FFF5DF")
TEXT = HexColor("#17201D")
MUTED = HexColor("#66736D")
BORDER = HexColor("#DDE7E0")
WARM = HexColor("#FBFAF6")
RED = HexColor("#CB493F")

METI_URL = "https://www.meti.go.jp/press/2025/08/20250826005/20250826005-a.pdf"
RECRUIT_URL = "https://hba.beauty.hotpepper.jp/search/column/c_rela/70640/2/"


def load_v2_module():
    path = ROOT / "tmp/pdfs/build_needo_bp_v2.py"
    spec = importlib.util.spec_from_file_location("needo_bp_v2", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


V2 = load_v2_module()


def register_fonts() -> None:
    V2.register_fonts()


def draw_background(c: canvas.Canvas, page_number: int) -> None:
    c.drawImage(
        str(SOURCE_RENDER_DIR / f"page-{page_number:02d}.png"),
        0,
        0,
        width=PAGE_W,
        height=PAGE_H,
    )


def shadow_card(c: canvas.Canvas, x: float, y: float, w: float, h: float, radius: float = 12, fill=white) -> None:
    V2.shadow_card(c, x, y, w, h, radius=radius, fill=fill)


def pill(c: canvas.Canvas, x: float, y: float, w: float, h: float, label: str, fill=GREEN_LIGHT, color=GREEN_DARK, size=8.2) -> None:
    V2.pill(c, x, y, w, h, label, fill, color, size=size)


def draw_wrapped(
    c: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    max_width: float,
    font: str = "CJK",
    size: float = 8,
    leading: float = 12,
    color=TEXT,
    max_lines: int | None = None,
) -> float:
    c.setFont(font, size)
    c.setFillColor(color)
    lines: list[str] = []
    for paragraph in text.split("\n"):
        current = ""
        for char in paragraph:
            proposed = current + char
            if current and pdfmetrics.stringWidth(proposed, font, size) > max_width:
                lines.append(current)
                current = char
            else:
                current = proposed
        if current:
            lines.append(current)
        elif not paragraph:
            lines.append("")
    if max_lines is not None:
        lines = lines[:max_lines]
    yy = y
    for line in lines:
        c.drawString(x, yy, line)
        yy -= leading
    return yy


def page_title(c: canvas.Canvas, cn: str, en: str, kicker: str | None = None) -> None:
    c.setFillColor(GREEN_DARK)
    c.setFont("Roboto-Bold", 20)
    c.drawString(35, 504, "NeeDo")
    c.setFont("Roboto-Medium", 6.4)
    c.drawString(42, 494, "You Need, We Do")
    c.setFillColor(TEXT)
    c.setFont("CJK-Bold", 29)
    c.drawString(39, 451, cn)
    c.setFillColor(GREEN_DARK)
    c.setFont("Roboto-Medium", 13)
    c.drawString(39, 427, en)
    c.setStrokeColor(GREEN_MID)
    c.setLineWidth(2.3)
    c.line(39, 414, 70, 414)
    if kicker:
        pill(c, 760, 460, 165, 24, kicker, GREEN_LIGHT, GREEN_DARK, 8.5)


def footer(c: canvas.Canvas, note: str | None = None) -> None:
    if note:
        c.setFillColor(MUTED)
        c.setFont("CJK", 5.8)
        c.drawString(34, 25, note)
    c.setFillColor(MUTED)
    c.setFont("Roboto-Medium", 5.7)
    c.drawCentredString(PAGE_W / 2, 14, "Copyright © 2026 LifeDance Co., Ltd. All Rights Reserved.")


def metric_card(c: canvas.Canvas, x: float, y: float, w: float, h: float, value: str, label: str, detail: str) -> None:
    shadow_card(c, x, y, w, h, 11, white)
    c.setFillColor(GREEN_DARK)
    value_font = "CJK-Bold" if any("\u3000" <= ch <= "\u9fff" for ch in value) else "Roboto-Bold"
    c.setFont(value_font, 20)
    c.drawCentredString(x + w / 2, y + h - 29, value)
    c.setFillColor(TEXT)
    c.setFont("CJK-Bold", 7.5)
    c.drawCentredString(x + w / 2, y + 25, label)
    c.setFillColor(MUTED)
    c.setFont("CJK", 5.8)
    c.drawCentredString(x + w / 2, y + 10, detail)


def draw_market_page(c: canvas.Canvas) -> None:
    draw_background(c, 2)
    # Replace the unsupported legacy KPI block with traceable, clearly scoped data.
    c.setFillColor(WARM)
    c.roundRect(14, 105, 252, 260, 12, stroke=0, fill=1)
    c.setFillColor(TEXT)
    c.setFont("CJK-Bold", 8)
    c.drawString(29, 346, "市场已在线化，但供给与经营仍然碎片化")
    c.setFillColor(MUTED)
    c.setFont("CJK", 6.1)
    c.drawString(29, 333, "用可核验的数字描述线上需求，不把广义市场冒充NeeDo TAM。")
    pill(c, 29, 306, 218, 20, "官方可核验数字 · 非NeeDo TAM", GREEN_LIGHT, GREEN_DARK, 7.3)
    metric_card(c, 29, 210, 105, 84, "8.23万亿", "服务类B2C-EC", "日本2024年 · 广义口径")
    metric_card(c, 143, 210, 105, 84, "7,302亿", "理美容服务B2C-EC", "含美发/美甲/美容/放松")
    metric_card(c, 29, 116, 105, 84, "+6.54%", "理美容EC同比", "2024 vs. 2023")
    metric_card(c, 143, 116, 105, 84, "59.0%", "放松沙龙网络预约", "Recruit · 2025")

    c.setFillColor(WARM)
    c.rect(25, 17, 900, 42, stroke=0, fill=1)
    c.setFillColor(MUTED)
    c.setFont("CJK", 5.4)
    c.drawString(32, 46, "来源① 经济产业省《令和6年度电子商务市场调查》（2025-08-26）")
    c.setFillColor(GREEN_DARK)
    c.drawString(333, 46, METI_URL)
    c.linkURL(METI_URL, (31, 42, 920, 54), relative=0, thickness=0)
    c.setFillColor(MUTED)
    c.drawString(32, 33, "来源② Recruit / Hot Pepper Beauty Academy《美容センサス2025年上期 リラクゼーションサロン編》")
    c.setFillColor(GREEN_DARK)
    c.drawString(485, 33, RECRUIT_URL)
    c.linkURL(RECRUIT_URL, (31, 29, 920, 41), relative=0, thickness=0)
    c.setFillColor(MUTED)
    c.drawString(32, 20, "口径说明：旧版“2.5万亿/90%电话/50–60%抽佣”因缺少同口径一手依据已删除；中介抽佣仅作为后续访谈验证项。")


def draw_solution_page(c: canvas.Canvas) -> None:
    draw_background(c, 4)
    # Replace the legacy result-looking strip with explicitly labelled Y3 forecasts.
    c.setFillColor(WARM)
    c.roundRect(31, 154, 373, 90, 12, stroke=0, fill=1)
    shadow_card(c, 35, 164, 365, 70, 10, white)
    xs = [43, 161, 279]
    metrics = [
        ("平均技师/服务者", "3万名", "Y3平均"),
        ("年完成订单", "497.2万笔", "含外国用户"),
        ("期末店铺", "4,000家", "Y3期末"),
    ]
    for idx, (label, value, detail) in enumerate(metrics):
        xx = xs[idx]
        if idx:
            c.setStrokeColor(BORDER)
            c.line(xx - 8, 174, xx - 8, 224)
        c.setFillColor(MUTED)
        c.setFont("CJK", 6.2)
        c.drawString(xx, 216, label)
        c.setFillColor(GREEN_DARK)
        c.setFont("CJK-Bold", 14)
        c.drawString(xx, 194, value)
        c.setFillColor(MUTED)
        c.setFont("CJK", 5.8)
        c.drawString(xx, 178, detail)
    c.setFillColor(RED)
    c.setFont("CJK-Bold", 6.7)
    c.drawRightString(398, 151, "*高速增长版Y3数据预测 · 仅按摩类")


def draw_roadmap_page(c: canvas.Canvas) -> None:
    draw_background(c, 7)
    c.setFillColor(white)
    c.rect(23, 387, 560, 105, stroke=0, fill=1)
    c.setFillColor(TEXT)
    c.setFont("CJK-Bold", 27)
    c.drawString(29, 447, "18个月版本迭代路线图")
    c.setFillColor(GREEN_DARK)
    c.setFont("Roboto-Medium", 12.5)
    c.drawString(29, 422, "18-Month Product Roadmap")
    c.setStrokeColor(GREEN_MID)
    c.setLineWidth(2.2)
    c.line(29, 409, 67, 409)
    pill(c, 29, 384, 128, 21, "当前：第0期测试期", GREEN_LIGHT, GREEN_DARK, 7.8)
    c.setFillColor(MUTED)
    c.setFont("CJK", 6.8)
    c.drawString(167, 391, "融资后按验证结果推进；阶段验收后再进入下一期")
    c.setFillColor(white)
    c.roundRect(32, 18, 600, 44, 12, stroke=0, fill=1)
    c.setFillColor(GREEN_DARK)
    c.setFont("CJK-Bold", 7.4)
    c.drawString(49, 45, "时间锚点")
    c.setFillColor(TEXT)
    c.setFont("CJK", 6.5)
    c.drawString(104, 45, "M0–3 密度/履约验证   ·   M4–9 会员与经营闭环   ·   M10–15 在库/酒店入口   ·   M16–18 流量与成果网络")
    c.setFillColor(MUTED)
    c.drawString(49, 29, "验收口径：店铺激活、首单完成、订单密度、复购与服务质量；具体阈值由试点与董事会确认。")


COMPETITORS = [
    ("NeeDo", "交易+SaaS+风控+增长闭环", ["●", "●", "●", "●", "●", "●", "●", "●"]),
    ("HOT PEPPER Beauty", "美容获客媒体", ["●", "—", "△", "—", "△", "●", "△", "—"]),
    ("minimo", "美容技师/模特撮合", ["●", "—", "△", "●", "△", "△", "△", "—"]),
    ("EPARK", "垂直预约门户", ["●", "—", "△", "—", "△", "△", "△", "△"]),
    ("Airリザーブ", "通用预约SaaS", ["●", "△", "△", "—", "△", "●", "—", "—"]),
    ("くらしのマーケット", "上门服务撮合", ["△", "●", "△", "●", "△", "●", "△", "△"]),
    ("LINEスキマニ", "零工匹配/派单", ["△", "N/A", "△", "△", "●", "●", "△", "△"]),
]


def draw_competitor_page(c: canvas.Canvas) -> None:
    c.setFillColor(WARM)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    page_title(c, "竞品定位：NeeDo连接交易、经营与增长", "Competitive Positioning", "V4.2 核心功能口径")
    c.setFillColor(MUTED)
    c.setFont("CJK", 7.2)
    c.drawString(39, 394, "不是把预约工具做得更宽，而是把到店/上门/Request、店铺经营、技师供给、风控与流量增长放进同一闭环。")

    x, y, w, h = 35, 93, 890, 284
    shadow_card(c, x, y, w, h, 14, white)
    service_w, pos_w = 130, 150
    dim_w = (w - service_w - pos_w) / 8
    header_h = 47
    row_h = (h - header_h) / 7
    c.setFillColor(GREEN_DARK)
    c.roundRect(x, y + h - header_h, w, header_h, 14, stroke=0, fill=1)
    c.rect(x, y + h - header_h, w, header_h / 2, stroke=0, fill=1)
    headers = ["服务/App", "核心定位", "预约\n获客", "上门+\n风控", "排班/\n日历", "店铺直连\n/IM", "经营/\n派单", "支付/\n结算", "Boost/\n达人", "eKYC/\n多语言"]
    starts = [x, x + service_w]
    starts += [x + service_w + pos_w + dim_w * i for i in range(8)]
    widths = [service_w, pos_w] + [dim_w] * 8
    for idx, header in enumerate(headers):
        cx = starts[idx] + widths[idx] / 2
        parts = header.split("\n")
        c.setFillColor(white)
        c.setFont("CJK-Bold", 6.4)
        if len(parts) == 1:
            c.drawCentredString(cx, y + h - 28, parts[0])
        else:
            c.drawCentredString(cx, y + h - 20, parts[0])
            c.drawCentredString(cx, y + h - 32, parts[1])

    for row_idx, (name, position, scores) in enumerate(COMPETITORS):
        row_y = y + h - header_h - row_h * (row_idx + 1)
        if row_idx == 0:
            c.setFillColor(GREEN_LIGHT)
            c.rect(x + 1, row_y, w - 2, row_h, stroke=0, fill=1)
        elif row_idx % 2 == 0:
            c.setFillColor(GREEN_PALE)
            c.rect(x + 1, row_y, w - 2, row_h, stroke=0, fill=1)
        c.setStrokeColor(BORDER)
        c.setLineWidth(0.45)
        c.line(x, row_y, x + w, row_y)
        c.setFillColor(GREEN_DARK if row_idx == 0 else TEXT)
        c.setFont("Roboto-Bold" if name in {"NeeDo", "minimo", "EPARK"} else "CJK-Bold", 7.2)
        c.drawString(x + 10, row_y + 12.5, name)
        c.setFillColor(TEXT)
        c.setFont("CJK", 6.4)
        c.drawString(x + service_w + 8, row_y + 12.5, position)
        for idx, score in enumerate(scores):
            color = GREEN_DARK if score == "●" else ORANGE_DARK if score == "△" else MUTED
            c.setFillColor(color)
            c.setFont("Roboto-Bold" if score == "N/A" else "CJK-Bold", 8 if score != "N/A" else 5.4)
            c.drawCentredString(x + service_w + pos_w + dim_w * (idx + 0.5), row_y + 11.8, score)

    for xx in [x + service_w, x + service_w + pos_w] + [x + service_w + pos_w + dim_w * i for i in range(1, 8)]:
        c.setStrokeColor(BORDER)
        c.line(xx, y, xx, y + h)
    c.setFillColor(MUTED)
    c.setFont("CJK", 6.1)
    c.drawString(38, 70, "● 强覆盖   △ 部分覆盖/需组合   — 非核心或未见公开支持   N/A 不适用。")
    c.drawRightString(923, 70, "来源：NeeDo_日本核心功能_简化调整对比_V4.2（公开资料核验版）")
    c.setFillColor(GREEN_PALE)
    c.roundRect(35, 35, 890, 24, 8, stroke=0, fill=1)
    c.setFillColor(GREEN_DARK)
    c.setFont("CJK-Bold", 7.2)
    c.drawCentredString(480, 44, "核心差异：NeeDo同时覆盖“交易场景 + 多模式供给 + 店铺直连 + 经营SaaS + 风控 + 增长工具”。")
    footer(c)


def cover_zone_service_row(c: canvas.Canvas, x: float, y: float, w: float, text: str) -> None:
    c.setFillColor(white)
    c.roundRect(x, y, w, 24, 5, stroke=0, fill=1)
    c.setFillColor(GREEN_DARK)
    c.setFont("CJK-Bold", 6.6)
    c.drawCentredString(x + w / 2, y + 8.4, text)


def draw_pilot_page(c: canvas.Canvas) -> None:
    draw_background(c, 8)
    cover_zone_service_row(c, 584, 429, 128, "酒店/办公/高频到店场景")
    cover_zone_service_row(c, 305, 241, 127, "商圈/夜间/碎片需求场景")
    cover_zone_service_row(c, 821, 216, 118, "酒店/商务/访日客场景")
    c.setFillColor(white)
    c.roundRect(40, 147, 176, 53, 7, stroke=0, fill=1)
    c.setFillColor(MUTED)
    c.setFont("CJK", 7)
    c.drawString(85, 184, "试点区域目标")
    c.setFillColor(GREEN_DARK)
    c.setFont("CJK-Bold", 13)
    c.drawString(85, 160, "500+服务/日")
    c.setFillColor(WARM)
    c.roundRect(34, 351, 242, 40, 8, stroke=0, fill=1)
    c.setFillColor(GREEN_DARK)
    c.setFont("CJK-Bold", 8.4)
    c.drawString(45, 374, "先验证单城密度，再复制全国")
    c.setFillColor(MUTED)
    c.setFont("CJK", 6.3)
    c.drawString(45, 360, "地区卡片不再使用未经验证的日覆盖量。")


def draw_financial_page(c: canvas.Canvas) -> None:
    V2.draw_financial_page(c)
    # Replace the high-growth subtitle with the approved milestone-gated wording.
    c.setFillColor(white)
    c.rect(505, 338, 390, 18, stroke=0, fill=1)
    c.setFillColor(MUTED)
    c.setFont("CJK", 7.2)
    c.drawString(507, 344, "前置投入换取规模；Y1广告1.08亿日元，按里程碑分阶段投放")
    # Show ROI only for the high-growth scenario, per the approved investor narrative.
    c.setFillColor(ORANGE_PALE)
    c.roundRect(507, 79, 403, 26, 8, stroke=0, fill=1)
    c.setFillColor(ORANGE_DARK)
    c.setFont("CJK-Bold", 7.2)
    c.drawCentredString(708.5, 88.7, "三年经营投资回报率 642.2% ＝ 累计营业利润 ÷ 本轮融资额")
    c.setFillColor(MUTED)
    c.setFont("CJK", 5.7)
    c.drawCentredString(480, 62, "经营投资回报率不等同股权退出回报或投资人IRR。")


def assumptions_table(c: canvas.Canvas, x: float, y: float, w: float, high: bool) -> None:
    accent = ORANGE_DARK if high else GREEN_DARK
    pale = ORANGE_PALE if high else GREEN_LIGHT
    title = "方案B · 高速增长" if high else "方案A · 保守增长"
    stores = ["1,000", "2,000", "4,000"] if high else ["500", "1,000", "2,000"]
    avg = ["500", "1,500", "3,000"] if high else ["250", "750", "1,500"]
    paid_months = ["3,375", "15,000", "30,375"] if high else ["1,688", "7,500", "15,188"]
    orders = ["156.1", "134.3", "138.1"] if high else ["47.6", "45.4", "45.8"]
    rows = [
        ("期末店铺数", stores),
        ("年平均活跃店铺", avg),
        ("平均/期末店铺比", ["50%", "75%", "75%"]),
        ("收费店铺月", paid_months),
        ("完成订单/活跃店/月", orders),
    ]
    shadow_card(c, x, y, w, 205, 13, white)
    pill(c, x + 14, y + 166, 120, 24, title, pale, accent, 8.6)
    c.setFillColor(MUTED)
    c.setFont("CJK", 6.4)
    c.drawRightString(x + w - 14, y + 174, "模型V1.4")
    label_w = 144
    value_w = (w - 28 - label_w) / 3
    top = y + 150
    c.setFillColor(pale)
    c.roundRect(x + 14, top - 22, w - 28, 22, 6, stroke=0, fill=1)
    c.setFillColor(accent)
    c.setFont("CJK-Bold", 6.8)
    c.drawString(x + 22, top - 14, "关键规模假设")
    for idx, year in enumerate(["Y1", "Y2", "Y3"]):
        c.drawCentredString(x + 14 + label_w + value_w * (idx + 0.5), top - 14, year)
    for ridx, (label, vals) in enumerate(rows):
        yy = top - 22 - (ridx + 1) * 24
        if ridx % 2:
            c.setFillColor(GREEN_PALE if not high else HexColor("#FFF9ED"))
            c.rect(x + 14, yy, w - 28, 24, stroke=0, fill=1)
        c.setStrokeColor(BORDER)
        c.line(x + 14, yy, x + w - 14, yy)
        c.setFillColor(TEXT)
        c.setFont("CJK", 6.6)
        c.drawString(x + 22, yy + 8.5, label)
        c.setFont("Roboto-Medium", 7.2)
        for idx, val in enumerate(vals):
            c.drawCentredString(x + 14 + label_w + value_w * (idx + 0.5), yy + 8.3, val)


def draw_assumptions_page(c: canvas.Canvas) -> None:
    c.setFillColor(WARM)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    page_title(c, "关键财务假设", "Key Financial Assumptions", "双情景 · 可追溯")
    assumptions_table(c, 35, 188, 435, False)
    assumptions_table(c, 490, 188, 435, True)

    shadow_card(c, 35, 72, 435, 101, 12, white)
    c.setFillColor(GREEN_DARK)
    c.setFont("CJK-Bold", 9.2)
    c.drawString(50, 150, "收入与交易口径")
    lines = [
        "平台收费：500日元/收费资格订单；不是GMV百分比抽成",
        "SaaS月费：保守版1,000日元/店/月；高速版0日元（增长策略）",
        "新店前3个月免费；服务平均客单价：待试点验证，不进入当前收入模型",
        "CAC、复购率：待试点验证，并作为广告预算释放门槛",
    ]
    for idx, line in enumerate(lines):
        c.setFillColor(GREEN if idx < 2 else ORANGE_DARK if idx >= 2 else TEXT)
        c.setFont("CJK-Bold" if idx >= 2 else "CJK", 6.6)
        c.drawString(51, 130 - idx * 17, "• " + line)

    shadow_card(c, 490, 72, 435, 101, 12, white)
    c.setFillColor(ORANGE_DARK)
    c.setFont("CJK-Bold", 9.2)
    c.drawString(505, 150, "外国用户与获客假设")
    foreign = [
        "高速：访日外国人50%按男性估算；渗透率1% / 2% / 4%；2次/人/年",
        "保守：高速版外国男性用户数的10%；1次/人/年",
        "高速外国男性用户：22.84万 / 48.87万 / 104.58万（Y1/Y2/Y3）",
        "渠道假设：多语言SEO/SEM、酒店/OTA/旅媒、在日社群；效果待试点验证",
    ]
    for idx, line in enumerate(foreign):
        c.setFillColor(TEXT if idx < 3 else ORANGE_DARK)
        c.setFont("CJK" if idx < 3 else "CJK-Bold", 6.4)
        c.drawString(506, 130 - idx * 17, "• " + line)

    footer(c, "注：单店月订单=年完成订单÷年平均活跃店铺÷12；“平均/期末店铺比”是模型推导，不等同留存率。")


def allocation_row(c: canvas.Canvas, x: float, y: float, label: str, amount: str, pct: int, color, detail: str) -> None:
    c.setFillColor(TEXT)
    c.setFont("CJK-Bold", 7.1)
    c.drawString(x, y + 6, label)
    c.setFillColor(color)
    c.setFont("Roboto-Bold", 7.5)
    c.drawRightString(x + 245, y + 6, amount)
    c.setFillColor(MUTED)
    c.setFont("CJK", 5.6)
    c.drawString(x, y - 5, detail)
    c.setFillColor(HexColor("#EDF2EE"))
    c.roundRect(x, y - 12, 245, 5, 2.5, stroke=0, fill=1)
    c.setFillColor(color)
    c.roundRect(x, y - 12, 245 * pct / 54, 5, 2.5, stroke=0, fill=1)


def scenario_summary(c: canvas.Canvas, x: float, y: float, w: float, high: bool) -> None:
    accent = ORANGE_DARK if high else GREEN_DARK
    pale = ORANGE_PALE if high else GREEN_LIGHT
    title = "方案B · 高速" if high else "方案A · 保守"
    metrics = [
        ("三年累计营收", "4,526.6 MJPY" if high else "735.8 MJPY"),
        ("三年累计营业利润", "+1,284.3 MJPY" if high else "+4.6 MJPY"),
        ("Y3营业利润", "1,202.0 MJPY" if high else "73.0 MJPY"),
        ("Y3期末现金", "1,484.3 MJPY" if high else "204.6 MJPY"),
    ]
    if high:
        metrics.append(("三年经营投资回报率", "642.2%"))
    shadow_card(c, x, y, w, 142, 12, white)
    pill(c, x + 12, y + 107, 90, 22, title, pale, accent, 8)
    for idx, (label, value) in enumerate(metrics):
        yy = y + 89 - idx * 18
        c.setFillColor(MUTED)
        c.setFont("CJK", 6.2)
        c.drawString(x + 15, yy, label)
        c.setFillColor(accent)
        c.setFont("Roboto-Bold", 8)
        c.drawRightString(x + w - 15, yy, value)


def draw_funding_page(c: canvas.Canvas) -> None:
    c.setFillColor(WARM)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    page_title(c, "融资计划与财务情景", "Funding Plan & Milestone-Gated Deployment", "融资 2亿日元 / 10%")

    lx, ly, lw, lh = 35, 67, 310, 329
    shadow_card(c, lx, ly, lw, lh, 14, white)
    c.setFillColor(MUTED)
    c.setFont("CJK", 7)
    c.drawString(lx + 18, ly + lh - 27, "本轮融资")
    c.setFillColor(GREEN_DARK)
    c.setFont("Roboto-Bold", 25)
    c.drawString(lx + 18, ly + lh - 59, "JPY 200M")
    c.setFillColor(TEXT)
    c.setFont("Roboto-Bold", 16)
    c.drawRightString(lx + lw - 18, ly + lh - 56, "for 10%")
    c.setStrokeColor(BORDER)
    c.line(lx + 18, ly + lh - 73, lx + lw - 18, ly + lh - 73)
    c.setFillColor(TEXT)
    c.setFont("CJK-Bold", 8.5)
    c.drawString(lx + 18, ly + lh - 94, "融资款用途（合计200 MJPY）")
    rows = [
        ("广告及品牌增长", "108M / 54%", 54, GREEN_DARK, "分阶段投放；不在PMF前一次性释放"),
        ("产品开发与研发", "20M / 10%", 10, GREEN, "Y1开发预算；按验证结果控制功能扩张"),
        ("系统与生产基础设施", "40M / 20%", 20, GREEN_MID, "云服务、维护、监控、安全与eKYC等"),
        ("商务拓展及店铺导入", "18M / 9%", 9, ORANGE, "店铺开拓、合同、培训、上线与激活支持"),
        ("运营周转及合规储备", "14M / 7%", 7, HexColor("#8BAA98"), "客服/安全/保险、法务审计、办公行政"),
    ]
    start = ly + lh - 117
    for idx, row in enumerate(rows):
        allocation_row(c, lx + 18, start - idx * 41, *row)

    c.setFillColor(GREEN_PALE)
    c.roundRect(lx + 17, ly + 8, lw - 34, 29, 8, stroke=0, fill=1)
    c.setFillColor(GREEN_DARK)
    c.setFont("CJK-Bold", 6.4)
    c.drawCentredString(lx + lw / 2, ly + 19, "资金用途为融资分配，不等同损益表成本分类")

    c.setFillColor(TEXT)
    c.setFont("CJK-Bold", 10.5)
    c.drawString(366, 380, "广告预算：分阶段释放")
    c.setFillColor(MUTED)
    c.setFont("CJK", 6.7)
    c.drawRightString(925, 380, "未确认的门槛值由试点与董事会共同确认")
    stages = [
        ("01", "PMF验证", "店铺激活率\n首单完成率"),
        ("02", "单城密度", "CAC与复购率\n订单/服务密度"),
        ("03", "规模扩张", "履约质量稳定\n释放剩余预算"),
    ]
    sx = 366
    for idx, (num, title, detail) in enumerate(stages):
        xx = sx + idx * 187
        shadow_card(c, xx, 278, 169, 86, 11, white)
        pill(c, xx + 12, 334, 31, 20, num, GREEN_LIGHT if idx < 2 else ORANGE_PALE, GREEN_DARK if idx < 2 else ORANGE_DARK, 7.6)
        c.setFillColor(TEXT)
        c.setFont("CJK-Bold", 8.2)
        c.drawString(xx + 51, 340, title)
        draw_wrapped(c, detail, xx + 14, 315, 142, "CJK", 6.4, 15, MUTED)
        if idx < 2:
            c.setFillColor(GREEN_MID)
            c.setFont("Roboto-Bold", 12)
            c.drawString(xx + 174, 314, "→")

    c.setFillColor(TEXT)
    c.setFont("CJK-Bold", 10.5)
    c.drawString(366, 253, "双情景三年结果")
    scenario_summary(c, 366, 91, 266, False)
    scenario_summary(c, 650, 91, 275, True)
    c.setFillColor(GREEN_PALE)
    c.roundRect(366, 55, 559, 26, 8, stroke=0, fill=1)
    c.setFillColor(GREEN_DARK)
    c.setFont("CJK-Bold", 6.7)
    c.drawCentredString(645, 65, "决策原则：只有当激活、CAC、复购与订单密度同时过线，才扩大投放。")
    footer(c, "三年经营投资回报率=三年累计营业利润÷本轮融资额2亿日元；不等同股权退出回报或投资人IRR。")


def goal_card(c: canvas.Canvas, x: float, y: float, w: float, h: float, number: str, title: str, detail: str, orange: bool = False) -> None:
    shadow_card(c, x, y, w, h, 13, white)
    accent = ORANGE_DARK if orange else GREEN_DARK
    pale = ORANGE_PALE if orange else GREEN_LIGHT
    pill(c, x + 14, y + h - 38, 34, 23, number, pale, accent, 8.2)
    c.setFillColor(TEXT)
    c.setFont("CJK-Bold", 10)
    c.drawString(x + 58, y + h - 31, title)
    draw_wrapped(c, detail, x + 16, y + h - 58, w - 32, "CJK", 7, 12, MUTED, 3)


def draw_closing_page(c: canvas.Canvas) -> None:
    c.setFillColor(WARM)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    page_title(c, "本轮融资后18个月目标", "18-Month Post-Funding Milestones", "从试点到可复制")
    c.setFillColor(TEXT)
    c.setFont("CJK-Bold", 18)
    c.drawString(39, 384, "把NeeDo从“可用产品”推进到“可复制的单城模型”")
    c.setFillColor(MUTED)
    c.setFont("CJK", 7.8)
    c.drawString(39, 363, "预算不以时间自动释放；每一阶段都以真实激活、成交、复购、履约与安全数据验收。")

    cards = [
        ("01", "产品闭环", "完成预约/Request、排班日历、IM、经营、支付结算与eKYC核心闭环。", False),
        ("02", "东京三区试点", "以新宿、涩谷、港区验证试点区域目标：500+服务/日。", False),
        ("03", "单位经济验证", "得到可审计的店铺激活率、CAC、复购率、订单密度与履约质量。", True),
        ("04", "外国用户增长", "验证多语言获客渠道与外国男性用户使用频次，未过线不放大投放。", True),
    ]
    positions = [(39, 236), (267, 236), (495, 236), (723, 236)]
    for pos, card in zip(positions, cards):
        goal_card(c, pos[0], pos[1], 198, 105, *card)

    c.setFillColor(GREEN_PALE)
    c.roundRect(39, 160, 882, 56, 14, stroke=0, fill=1)
    c.setFillColor(GREEN_DARK)
    c.setFont("CJK-Bold", 9.2)
    c.drawString(58, 193, "18个月验收结果")
    c.setFillColor(TEXT)
    c.setFont("CJK", 7.2)
    c.drawString(58, 176, "形成一套可复制到其他核心城市的“供给导入 → 订单密度 → 复购 → 增长”运营模型，并以真实数据更新下一轮财务计划。")

    shadow_card(c, 225, 70, 510, 67, 16, white)
    c.setFillColor(MUTED)
    c.setFont("CJK", 7.3)
    c.drawCentredString(480, 116, "欢迎就产品、试点合作与本轮融资进一步交流")
    c.setFillColor(GREEN_DARK)
    c.setFont("CJK-Bold", 18)
    c.drawCentredString(480, 88, "WX：EasonSunJP")
    footer(c)


def build_replacement_pages() -> None:
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(NEW_PAGES_PDF), pagesize=(PAGE_W, PAGE_H))
    builders = [
        draw_market_page,
        draw_solution_page,
        draw_roadmap_page,
        draw_competitor_page,
        draw_pilot_page,
        draw_financial_page,
        draw_assumptions_page,
        draw_funding_page,
        draw_closing_page,
    ]
    for builder in builders:
        builder(c)
        c.showPage()
    c.save()


def merge_pdf() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    source = PdfReader(str(SOURCE_PDF))
    new = PdfReader(str(NEW_PAGES_PDF))
    writer = PdfWriter()
    # 1 cover, 2 market, 3 why-now, 4 solution, 5 engine, 6 moat, 7 roadmap,
    # 8 competitors, 9 pilot, 10 strategy, 11 financials, 12 assumptions,
    # 13 funding, 14 close.
    sequence = [
        ("source", 0),
        ("new", 0),
        ("source", 2),
        ("new", 1),
        ("source", 4),
        ("source", 5),
        ("new", 2),
        ("new", 3),
        ("new", 4),
        ("source", 8),
        ("new", 5),
        ("new", 6),
        ("new", 7),
        ("new", 8),
    ]
    for origin, index in sequence:
        writer.add_page(source.pages[index] if origin == "source" else new.pages[index])
    writer.add_metadata(
        {
            "/Title": "NeeDo Business Plan CN - Investor Edition 14 Pages",
            "/Author": "LifeDance Co., Ltd.",
            "/Subject": "JPY 200M for 10%; dual-scenario financial model and 18-month milestones",
        }
    )
    with OUTPUT_PDF.open("wb") as stream:
        writer.write(stream)


def main() -> None:
    register_fonts()
    build_replacement_pages()
    merge_pdf()
    result = PdfReader(str(OUTPUT_PDF))
    print(f"OUTPUT={OUTPUT_PDF}")
    print(f"PAGES={len(result.pages)}")
    print(f"SIZE={OUTPUT_PDF.stat().st_size}")


if __name__ == "__main__":
    main()
