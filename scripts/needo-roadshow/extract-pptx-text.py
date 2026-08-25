#!/usr/bin/env python3
"""Extract all visible slide text to a review-friendly UTF-8 file."""

from __future__ import annotations

import argparse
from pathlib import Path

from pptx import Presentation


def iter_text(shape):
    if getattr(shape, "has_text_frame", False):
        text = "\n".join(p.text for p in shape.text_frame.paragraphs).strip()
        if text:
            yield text
    if getattr(shape, "shape_type", None) == 6:
        for child in shape.shapes:
            yield from iter_text(child)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pptx", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    deck = Presentation(args.pptx)
    chunks = []
    for index, slide in enumerate(deck.slides, start=1):
        chunks.append(f"===== SLIDE {index:02d} =====")
        for shape in slide.shapes:
            chunks.extend(iter_text(shape))
        chunks.append("")
    args.output.write_text("\n".join(chunks), encoding="utf-8")
    print(args.output)


if __name__ == "__main__":
    main()
