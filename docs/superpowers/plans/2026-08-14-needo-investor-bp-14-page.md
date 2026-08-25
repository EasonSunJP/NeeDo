# NeeDo Investor BP 14-Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a verified 14-page Chinese investor BP with sourced market data, Y3 forecast labels, a concise competitive-positioning page, transparent financial assumptions, milestone-gated advertising spend, and an 18-month closing page.

**Architecture:** Keep the source BP's first-party visual style by rendering page-specific replacement layers with ReportLab, merging unchanged source pages with pypdf, and validating every final page through text extraction plus Poppler PNG review. Use the existing V1.4 financial workbook and V4.2 competitor workbook as structured inputs; use current official web sources only for market evidence that is time-sensitive.

**Tech Stack:** Python 3.12, ReportLab, pypdf, pdfplumber, Poppler, artifact_tool/xlsx inspection, official web sources.

## Global Constraints

- Final PDF must contain exactly 14 pages at 960×540 points.
- Preserve the original cream background, dark-green palette, rounded cards, and footer treatment.
- All forecast values must be marked as forecasts or targets; external data must carry direct supporting sources.
- Do not invent CAC, repurchase-rate, activation-rate, or density thresholds that are not present in the approved financial model.
- Competitive claims must be limited to evidence in V4.2 or freshly verified official sources.
- The final page must show `WX：EasonSunJP`.

---

### Task 1: Source and Input Audit

**Files:**
- Read: `/Users/eason/Downloads/NeeDoBP/NeeDoBP_CN_后3页数字修正版.pdf`
- Read: `/Users/eason/Documents/New project/outputs/019fcda7-2369-7940-9583-4820c263797d/NeeDo_三年财务模型_V1.4_外国用户保守化及广告强化版_2026-08-14.xlsx`
- Locate/read: `NeeDo_日本核心功能_簡化調整對比_V4.2_2026-08-13.xlsx`
- Create: `/Users/eason/Documents/New project/tmp/pdfs/needo_bp_v3/source_manifest.json`

- [ ] Locate and reopen the actual V4.2 workbook, not the memory summary.
- [ ] Extract the selected competitor rows and the eight agreed comparison dimensions.
- [ ] Extract V1.4 high/conservative financial assumptions and verify the Y3 forecast figures used on page 4.
- [ ] Research official/primary sources for every market number and record URL, publisher, year, exact supported claim, and whether the original number must be relabeled as an industry estimate.
- [ ] Save the reconciled source manifest and reject unsupported precision.

### Task 2: Build the 14-Page PDF

**Files:**
- Create: `/Users/eason/Documents/New project/tmp/pdfs/needo_bp_v3/build_needo_bp_v3.py`
- Create: `/Users/eason/Documents/New project/output/pdf/NeeDoBP_CN_投资人版_14页_2026-08-14.pdf`

- [ ] Preserve pages 1, 3, 5, 6, and 10-equivalent content without changing their business narrative.
- [ ] Rebuild market page with human-readable source lines and PDF link annotations.
- [ ] Rebuild page 4 KPI strip with high-growth Y3 forecast values and explicit forecast label.
- [ ] Retitle the roadmap as `18个月版本迭代路线图`.
- [ ] Insert the concise seven-service competitive-positioning page after the roadmap.
- [ ] Rebuild the Tokyo pilot page without zone-level service-coverage numbers and with `试点区域目标 500+服务/日`.
- [ ] Keep the two-scenario financial page, add `*仅按摩类`, and replace the high-growth advertising note with `Y1广告为分阶段投放`.
- [ ] Insert the financial-assumptions page with all requested variables and explicit `待试点验证` labels where the model has no approved value.
- [ ] Rebuild the financing page with milestone-gated ad release and no premoney valuation.
- [ ] Add the 18-month goals/contact closing page with `WX：EasonSunJP`.

### Task 3: Automated Structural and Text Verification

**Files:**
- Create: `/Users/eason/Documents/New project/tmp/pdfs/needo_bp_v3/verify_needo_bp_v3.py`

- [ ] Reopen the final PDF with pypdf.
- [ ] Assert 14 pages and 960×540 point media boxes.
- [ ] Assert required strings: `高速增长版Y3数据预测`, `18个月版本迭代路线图`, `竞品定位`, `试点区域目标`, `500+服务/日`, `*仅按摩类`, `Y1广告为分阶段投放`, `关键财务假设`, `分阶段释放`, and `WX：EasonSunJP`.
- [ ] Assert forbidden strings are absent: `愿景与退出`, `Vision & Exit`, `Y1现金低于安全线`, and `投前估值`.
- [ ] Assert page 9-equivalent no longer contains `1,200+/日`, `1,100+/日`, or `1,000+/日`.
- [ ] Confirm market source URLs are embedded as link annotations or printed in full.

### Task 4: Visual QA and Delivery

**Files:**
- Create: `/Users/eason/Documents/New project/tmp/pdfs/needo_bp_v3/rendered/page-*.png`

- [ ] Render all 14 pages at 144 DPI with Poppler.
- [ ] Inspect every page for clipping, overlap, unreadable sources, broken CJK glyphs, inconsistent margins, and footer artifacts.
- [ ] Fix every identified defect and rerun Tasks 2-4.
- [ ] Run the final verifier and record page count, required-string checks, forbidden-string checks, and SHA-256 hash.
- [ ] Deliver the final PDF with a concise change summary and note any assumptions explicitly labeled for trial validation.
