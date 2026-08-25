#!/usr/bin/env python3
"""Build a numbered contact sheet from rendered slide PNG files."""

from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def slide_number(path: Path) -> int:
    digits = "".join(ch for ch in path.stem if ch.isdigit())
    return int(digits or 0)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_dir", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--columns", type=int, default=3)
    parser.add_argument("--thumb-width", type=int, default=640)
    args = parser.parse_args()

    files = sorted(args.input_dir.glob("*.png"), key=slide_number)
    if not files:
        raise SystemExit(f"No PNG files found in {args.input_dir}")

    with Image.open(files[0]) as first:
        ratio = first.height / first.width
    thumb_h = round(args.thumb_width * ratio)
    label_h = 38
    gap = 18
    rows = math.ceil(len(files) / args.columns)
    sheet_w = args.columns * args.thumb_width + (args.columns + 1) * gap
    sheet_h = rows * (thumb_h + label_h) + (rows + 1) * gap
    sheet = Image.new("RGB", (sheet_w, sheet_h), "#EEEDE8")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=24)

    for index, path in enumerate(files):
        row, col = divmod(index, args.columns)
        x = gap + col * (args.thumb_width + gap)
        y = gap + row * (thumb_h + label_h + gap)
        with Image.open(path) as image:
            thumb = image.convert("RGB").resize((args.thumb_width, thumb_h), Image.Resampling.LANCZOS)
        sheet.paste(thumb, (x, y))
        draw.rectangle((x, y, x + args.thumb_width - 1, y + thumb_h - 1), outline="#C9C8C2", width=2)
        draw.text((x + 8, y + thumb_h + 6), f"P{slide_number(path):02d}", fill="#0B5943", font=font)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(args.output, quality=94)


if __name__ == "__main__":
    main()
