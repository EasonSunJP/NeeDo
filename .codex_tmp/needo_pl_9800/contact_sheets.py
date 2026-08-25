from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

root = Path("/Users/eason/Documents/New project/.codex_tmp/needo_pl_9800")
font = ImageFont.load_default(size=20)

for phase in ("before", "after"):
    source_dir = root / f"previews_{phase}"
    output_dir = root / f"contact_{phase}"
    output_dir.mkdir(parents=True, exist_ok=True)
    for locale in ("jp", "cn"):
        paths = sorted(source_dir.glob(f"{locale}_*.png"))
        for page, start in enumerate(range(0, len(paths), 4), start=1):
            canvas = Image.new("RGB", (2400, 1600), "#E5E7EB")
            draw = ImageDraw.Draw(canvas)
            for slot, image_path in enumerate(paths[start : start + 4]):
                x = (slot % 2) * 1200
                y = (slot // 2) * 800
                image = Image.open(image_path).convert("RGB")
                image.thumbnail((1140, 710), Image.Resampling.LANCZOS)
                framed = ImageOps.expand(image, border=2, fill="#94A3B8")
                left = x + (1200 - framed.width) // 2
                top = y + 50 + (710 - framed.height) // 2
                canvas.paste(framed, (left, top))
                draw.text((x + 25, y + 15), image_path.stem, fill="#111827", font=font)
            canvas.save(output_dir / f"{locale}_{page}.jpg", quality=88)
