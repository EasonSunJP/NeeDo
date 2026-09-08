#!/usr/bin/env python3
"""Build an applicant-only Chinese guide; no screenshot capture or fabrication.

Use --check while screenshots are still being collected. Default build is a draft.
--final requires finalReady=true in the reviewed manifest. All paths resolve from repo.
Dependencies: reportlab, Pillow, pypdf; pypdfium2 only for optional --render.
"""
from __future__ import annotations

import argparse
from io import BytesIO
import json
import math
from pathlib import Path
import re
import hashlib
from xml.sax.saxutils import escape

from PIL import Image
from pypdf import PdfReader, PdfWriter
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak

ROOT = Path(__file__).resolve().parents[2]
PAGE_W, PAGE_H = A4
FONT = "GuideChinese"


def load_font(path: str | None) -> Path:
    candidates = [Path(path)] if path else [Path("/System/Library/Fonts/STHeiti Light.ttc"), Path("/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc")]
    for candidate in candidates:
        if candidate.is_file():
            pdfmetrics.registerFont(TTFont(FONT, str(candidate), subfontIndex=0))
            return candidate
    raise SystemExit("没有可嵌入的中文 TrueType 字体，请传入 --font（TTF/TTC）。")


def title_for(name: str) -> str:
    mappings = [("basic", "店铺基本资料"), ("bank-dropdown", "银行选择菜单"), ("account-type", "账户类型菜单"), ("bank-filled", "银行资料"), ("contract", "收费规则与合同"), ("under-review", "审核中的申请资料"), ("approved", "审核通过状态"), ("rejected", "审核未通过状态"), ("withdraw", "撤回申请"), ("confirm", "确认申请资料"), ("submit", "提交申请"), ("shop-select", "选择入驻店铺"), ("ekyc", "本人认证资料"), ("tech", "技师申请资料")]
    return next((title for fragment, title in mappings if fragment in name), "申请页面")


def inventory(manifest: dict) -> list[dict]:
    folder = ROOT / manifest["screenshotRoot"]
    entries = manifest.get("screenshots") or [
        {"file": file.name, "section": group["section"]}
        for group in manifest["groups"] for file in sorted(folder.glob(group["glob"]))
    ]
    result, seen = [], set()
    forbidden = re.compile(manifest.get("excludePattern", "(?!)"))
    for entry in entries:
        path = (folder / entry["file"]).resolve()
        if not path.is_relative_to(folder.resolve()):
            raise SystemExit(f"截图必须位于 screenshotRoot 内：{entry['file']}")
        if forbidden.search(path.name):
            raise SystemExit(f"拒绝纳入审核人员页面：{path.name}")
        if path in seen:
            continue
        seen.add(path)
        if not path.is_file():
            raise SystemExit(f"截图缺失：{path}")
        with Image.open(path) as image:
            width, height = image.size
            image.verify()
        result.append({**entry, "file": path.name, "path": str(path), "title": entry.get("title", title_for(path.name)), "sourceEnvironment": entry.get("sourceEnvironment", manifest["sourceEnvironment"]), "width": width, "height": height, "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    return result


def footer(c: canvas.Canvas, label: str, number: int) -> None:
    c.setFont(FONT, 8)
    c.setFillColor(colors.HexColor("#64716F"))
    c.drawString(42, 25, label)
    c.drawRightString(PAGE_W - 42, 25, str(number))


def body_pdf(markdown: str, label: str) -> bytes:
    output = BytesIO()
    styles = {
        "title": ParagraphStyle("title", fontName=FONT, fontSize=26, leading=35, textColor=colors.HexColor("#174D43"), spaceAfter=22, wordWrap="CJK"),
        "heading": ParagraphStyle("heading", fontName=FONT, fontSize=20, leading=29, textColor=colors.HexColor("#174D43"), spaceAfter=20, wordWrap="CJK"),
        "body": ParagraphStyle("body", fontName=FONT, fontSize=11.5, leading=21, spaceAfter=13, wordWrap="CJK")
    }
    flow = []
    for block in re.split(r"\n\s*\n", markdown.strip()):
        if block.startswith("## "):
            flow.extend([PageBreak(), Paragraph(escape(block[3:]), styles["heading"])])
        elif block.startswith("# "):
            flow.extend([Paragraph(escape(block[2:]), styles["title"]), Spacer(1, 12)])
        else:
            flow.append(Paragraph(escape(block.replace("\n", " ")), styles["body"]))
    doc = SimpleDocTemplate(output, pagesize=A4, leftMargin=48, rightMargin=48, topMargin=50, bottomMargin=48)
    doc.build(flow, onFirstPage=lambda c, d: footer(c, label, d.page), onLaterPages=lambda c, d: footer(c, label, d.page))
    return output.getvalue()


def appendix_pdf(entries: list[dict], label: str, offset: int) -> tuple[bytes, list[dict]]:
    output = BytesIO()
    c = canvas.Canvas(output, pagesize=A4)
    slices = []
    # 380 px screenshot -> 380 pt: preserve legibility; large screenshots cap at 430 pt.
    # Long captures are cropped into contiguous, slightly overlapping segments.
    for index, entry in enumerate(entries, 1):
        with Image.open(entry["path"]) as source:
            source = source.convert("RGB")
            width, height = source.size
            display_w = min(430.0, float(width))
            scale = display_w / width
            max_pixels = max(1, math.floor((PAGE_H - 145) / scale))
            overlap = min(24, max_pixels // 10)
            start, part = 0, 0
            while start < height:
                end = min(height, start + max_pixels)
                part += 1
                c.setFillColor(colors.HexColor("#174D43")); c.setFont(FONT, 15)
                c.drawString(42, PAGE_H - 42, f"截图 {index:02d} · {entry['section']} · {entry['title']}")
                c.setFillColor(colors.HexColor("#64716F")); c.setFont(FONT, 8.5)
                c.drawString(42, PAGE_H - 61, f"{entry['sourceEnvironment']}｜连续分段 {part}｜原图 {width} × {height} px｜第 {start + 1}–{end} 行")
                tile = source.crop((0, start, width, end))
                display_h = tile.height * scale
                c.drawImage(ImageReader(tile), (PAGE_W - display_w) / 2, PAGE_H - 79 - display_h, width=display_w, height=display_h)
                page = offset + len(slices) + 1
                footer(c, label, page)
                slices.append({"file": entry["file"], "page": page, "part": part, "top": start, "bottom": end})
                c.showPage()
                if end == height:
                    break
                start = end - overlap
    c.save()
    return output.getvalue(), slices


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", default="docs/guides/application-guide-manifest.json")
    parser.add_argument("--source", default="docs/guides/application-guide-zh.md")
    parser.add_argument("--out-dir", default="exports/application-guide-2026-09-07")
    parser.add_argument("--font")
    parser.add_argument("--check", action="store_true", help="Validate sources/fonts/screenshots without producing PDF")
    parser.add_argument("--final", action="store_true")
    parser.add_argument("--render", action="store_true", help="Render every generated page at 120 dpi for visual review")
    args = parser.parse_args()
    manifest = json.loads((ROOT / args.manifest).read_text())
    source = (ROOT / args.source).read_text()
    font_path = load_font(args.font)
    entries = inventory(manifest)
    if args.final and not manifest.get("finalReady"):
        raise SystemExit("最终截图清单未确认（finalReady=false）；只允许 --check 或草稿生成。")
    if args.final and (not entries or {e["section"] for e in entries} != {"店铺申请", "本人认证", "技师申请"}):
        raise SystemExit("最终清单必须包含店铺、本人认证与技师三个申请流程截图。")
    all_text = source + json.dumps(entries, ensure_ascii=False) + "截图连续分段原图第行本地示例草稿附录审核預金×–｜"
    missing = sorted({c for c in all_text if ord(c) > 127 and ord(c) not in pdfmetrics.getFont(FONT).face.charToGlyph})
    if missing:
        raise SystemExit(f"字体缺少字符：{''.join(missing)}")
    out = ROOT / args.out_dir
    out.mkdir(parents=True, exist_ok=True)
    report = {"mode": "check" if args.check else "final" if args.final else "draft", "font": str(font_path), "screenshots": entries, "sourceEnvironment": manifest["sourceEnvironment"], "missingSections": sorted({"店铺申请", "本人认证", "技师申请"} - {e["section"] for e in entries})}
    if not args.check:
        label = f"NeeDo 申请者教程｜{manifest['version']}" + ("｜草稿" if not args.final else "")
        body = body_pdf(source, label)
        writer = PdfWriter()
        body_reader = PdfReader(BytesIO(body))
        writer.append(body_reader)
        appendix, slices = appendix_pdf(entries, label, len(body_reader.pages))
        if entries:
            writer.append(PdfReader(BytesIO(appendix)))
        name = "NeeDo-申请者操作教程-中文" + ("" if args.final else "-草稿") + ".pdf"
        pdf_path = out / name
        writer.add_metadata({"/Title": manifest["title"], "/Subject": "Applicant-only guide; TEST screenshot examples", "/Author": "NeeDo"})
        with pdf_path.open("wb") as file:
            writer.write(file)
        report.update({"pdf": str(pdf_path), "pages": len(writer.pages), "slices": slices})
        if args.render:
            import pypdfium2 as pdfium
            render_dir = out / ("rendered-final" if args.final else "rendered-draft")
            render_dir.mkdir(exist_ok=True)
            doc = pdfium.PdfDocument(pdf_path)
            for number, page in enumerate(doc, 1):
                page.render(scale=120 / 72).to_pil().save(render_dir / f"page-{number:03d}.png")
            doc.close()
            report["renderDirectory"] = str(render_dir)
    report_path = out / ("check-report.json" if args.check else "build-report.json")
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"report": str(report_path), "screenshots": len(entries), "missingSections": report["missingSections"], "pdf": report.get("pdf")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
