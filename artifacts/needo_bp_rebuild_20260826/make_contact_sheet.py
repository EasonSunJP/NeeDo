from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


def make_sheet(source: Path, output: Path, columns: int = 4, thumb_width: int = 480) -> None:
    files = sorted(source.glob("slide-*.jpg"))
    if not files:
        raise SystemExit(f"No slide images found in {source}")

    with Image.open(files[0]) as first:
        ratio = first.height / first.width
    thumb_height = round(thumb_width * ratio)
    label_height = 36
    gap = 18
    rows = (len(files) + columns - 1) // columns
    width = columns * thumb_width + (columns + 1) * gap
    height = rows * (thumb_height + label_height) + (rows + 1) * gap
    canvas = Image.new("RGB", (width, height), "#E8EDF5")
    draw = ImageDraw.Draw(canvas)
    font = ImageFont.load_default(size=20)

    for index, file in enumerate(files):
        row, column = divmod(index, columns)
        x = gap + column * (thumb_width + gap)
        y = gap + row * (thumb_height + label_height + gap)
        with Image.open(file) as slide:
            slide = slide.convert("RGB")
            slide.thumbnail((thumb_width, thumb_height), Image.Resampling.LANCZOS)
            canvas.paste(slide, (x, y + label_height))
        draw.text((x, y + 5), f"Slide {index + 1:02d}", fill="#111827", font=font)

    canvas.save(output, quality=90)


if __name__ == "__main__":
    base = Path(__file__).resolve().parent
    make_sheet(base / "original_render", base / "original_contact.jpg")
    make_sheet(base / "revised_render", base / "revised_contact.jpg")
    final_source = base / "final_render_v2" if (base / "final_render_v2").exists() else base / "final_render"
    if final_source.exists():
        make_sheet(final_source, base / "final_contact.jpg")
