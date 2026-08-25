from pathlib import Path

from pypdf import PdfReader


FILES = [
    Path("/Users/eason/Downloads/NeeDoBP/NeeDoBP_CN_后3页数字修正版.pdf"),
    Path("/Users/eason/Documents/New project/output/pdf/NeeDoBP_CN_投资人精致版_14页_2026-08-14.pdf"),
    Path("/Users/eason/Documents/New project/output/pdf/NeeDoBP_CN_投资人精致版_V2_14页_2026-08-14.pdf"),
]


for file_path in FILES:
    print(f"FILE {file_path.name}")
    reader = PdfReader(str(file_path))
    seen: set[tuple[str, str, str]] = set()
    for page in reader.pages:
        fonts = ((page.get("/Resources") or {}).get("/Font") or {})
        for ref in fonts.values():
            font = ref.get_object()
            seen.add(
                (
                    str(font.get("/BaseFont")),
                    str(font.get("/Subtype")),
                    str(font.get("/Encoding")),
                )
            )
    for item in sorted(seen):
        print(item)
