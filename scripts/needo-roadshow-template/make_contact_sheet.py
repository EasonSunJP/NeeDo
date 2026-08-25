#!/usr/bin/env python3
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
PREVIEWS = ROOT / "outputs/needo-roadshow-template-2026-08-23/previews"
OUTPUT = ROOT / "outputs/needo-roadshow-template-2026-08-23/contact-sheet-template.png"

files = sorted(PREVIEWS.glob("slide-*.png"), key=lambda path: int(path.stem.split("-")[-1]))
cols = 4
thumb_w, thumb_h = 480, 270
label_h, gap = 30, 20
rows = (len(files) + cols - 1) // cols
sheet = Image.new("RGB", (cols * thumb_w + (cols + 1) * gap, rows * (thumb_h + label_h) + (rows + 1) * gap), "#EEF1EA")
draw = ImageDraw.Draw(sheet)
font = ImageFont.load_default(size=18)

for index, file in enumerate(files):
    col, row = index % cols, index // cols
    x = gap + col * (thumb_w + gap)
    y = gap + row * (thumb_h + label_h + gap)
    image = Image.open(file).convert("RGB").resize((thumb_w, thumb_h), Image.Resampling.LANCZOS)
    sheet.paste(image, (x, y))
    draw.rectangle((x, y + thumb_h, x + thumb_w, y + thumb_h + label_h), fill="white")
    draw.text((x + 10, y + thumb_h + 5), f"{index + 1:02d}", fill="#455F51", font=font)

sheet.save(OUTPUT)
print(OUTPUT)
