from __future__ import annotations

import hashlib
from pathlib import Path

from pypdf import PdfReader


PDF = Path("/Users/eason/Documents/New project/output/pdf/NeeDoBP_CN_投资人版_14页_2026-08-14.pdf")
REQUIRED = [
    "高速增长版Y3数据预测",
    "18个月版本迭代路线图",
    "竞品定位",
    "试点区域目标",
    "500+服务/日",
    "*仅按摩类",
    "Y1广告1.08亿日元，按里程碑分阶段投放",
    "关键财务假设",
    "分阶段释放",
    "三年经营投资回报率",
    "642.2%",
    "WX：EasonSunJP",
]
FORBIDDEN = [
    "愿景与退出",
    "Vision & Exit",
    "Y1现金低于安全线",
    "投前估值",
    "1,200+/日",
    "1,100+/日",
    "1,000+/日",
    "2.3%",
]


def main() -> None:
    reader = PdfReader(str(PDF))
    assert len(reader.pages) == 14, len(reader.pages)
    texts = []
    for idx, page in enumerate(reader.pages, start=1):
        assert abs(float(page.mediabox.width) - 960) < 0.1, (idx, page.mediabox.width)
        assert abs(float(page.mediabox.height) - 540) < 0.1, (idx, page.mediabox.height)
        texts.append(page.extract_text() or "")
    combined = "\n".join(texts)
    for item in REQUIRED:
        assert item in combined, f"missing required: {item}"
    for item in FORBIDDEN:
        assert item not in combined, f"forbidden present: {item}"
    assert "https://www.meti.go.jp/press/2025/08/20250826005/20250826005-a.pdf" in combined
    assert "https://hba.beauty.hotpepper.jp/search/column/c_rela/70640/2/" in combined
    page2_annotations = reader.pages[1].get("/Annots") or []
    assert len(page2_annotations) >= 2, "market page must contain at least two link annotations"
    digest = hashlib.sha256(PDF.read_bytes()).hexdigest()
    print(f"PAGES={len(reader.pages)}")
    print("PAGE_SIZE=960x540")
    print(f"REQUIRED_CHECKS={len(REQUIRED)}")
    print(f"FORBIDDEN_CHECKS={len(FORBIDDEN)}")
    print(f"PAGE2_LINKS={len(page2_annotations)}")
    print(f"SHA256={digest}")


if __name__ == "__main__":
    main()
