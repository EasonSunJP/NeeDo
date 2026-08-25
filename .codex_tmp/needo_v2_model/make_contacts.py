from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

root = Path("/Users/eason/Documents/New project/.codex_tmp/needo_v2_model")
source = root / "previews_v21"
out = root / "contact_v21"
out.mkdir(parents=True, exist_ok=True)
font = ImageFont.load_default(size=18)

for locale in ("jp", "cn"):
    paths = sorted(source.glob(f"{locale}_*.png"))
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
            top = y + 54 + (710 - framed.height) // 2
            canvas.paste(framed, (left, top))
            draw.text((x + 24, y + 14), image_path.stem, fill="#111827", font=font)
        canvas.save(out / f"{locale}_{page}.jpg", quality=90)
