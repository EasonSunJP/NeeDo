# NeeDo Investor BP V4 Key Visual Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a 14-page investor-grade V4 PDF that preserves the original NeeDo Key Visuals while replacing every important title, number, table, source and condition with clear MiSans vector information layers.

**Architecture:** Use the 1920×1080 source-page renders as immutable visual masters for art-led pages. The ReportLab builder places the master art, creates integrated clean information surfaces only inside existing whitespace/cards, and redraws all business-critical text as vectors. Later data-led pages remain fully vector and share the same master typography, palette, footer and source-link system.

**Tech Stack:** Python 3.12, ReportLab, pypdf, Poppler, Pillow for exact-resolution raster handling, official primary-source URLs.

## Global Constraints

- Exactly 14 pages at 960×540 points.
- Original Key Visual characters, smartphones, 3D scenes, maps, orbit systems, rail graphics and object positions are immutable.
- Use MiSans Semibold/Demibold/Regular for all Chinese information text; no STHeiti or Noto.
- Important business text must be vector and extractable; device-screen microcopy may remain decorative raster texture.
- No floating white repair strips; cleanup surfaces must align to original whitespace or full card interiors.
- Preserve original information density and all approved financial numbers.
- Competitor table includes store-direct IM, private chat, group chat, monthly fee, per-result fee and commission/payment rate.
- Only the high-growth scenario shows operating ROI 642.2%.

---

### Task 1: Add Immutable Key Visual Master Support

**Files:**
- Modify: `/Users/eason/Documents/New project/tmp/pdfs/needo_bp_premium/build_needo_bp_premium.py`

- [ ] Add source-page asset paths and a helper that places each original 1920×1080 master without stretching or recoloring.
- [ ] Add page-specific integrated cleanup surfaces tied to original whitespace/card geometry.
- [ ] Rename output and intermediate files from V3 full-vector to V4 Key Visual locked.
- [ ] Render pages 1–7 and 9 for visual comparison against the original masters.

### Task 2: Rebuild Narrative Information Layers

**Files:**
- Modify: `/Users/eason/Documents/New project/tmp/pdfs/needo_bp_premium/build_needo_bp_premium.py`

- [ ] Rebuild cover, market, Why Now, solution, dual-engine, moat and three-step strategy information layers on the locked masters.
- [ ] Preserve page 2 data/source completeness and page 4 full flywheel, five steps, three user-side capability blocks and exact Y3 labels.
- [ ] Keep the original three-step strategy art before the 18-month roadmap.
- [ ] Keep the Tokyo pilot art and restore all trial scope, three-zone details, four validation metrics and 500+ services/day trial target.

### Task 3: Finalize Roadmap, Competitor and Financial Pages

**Files:**
- Modify: `/Users/eason/Documents/New project/tmp/pdfs/needo_bp_premium/build_needo_bp_premium.py`

- [ ] Keep the accepted Tokyo roadmap background and restore phase 0–6 details with a logo-safe title.
- [ ] Rebuild competitor table with eight services, explicit IM/chat columns and exact fee wording including HOGUGU and HOT PEPPER Beauty.
- [ ] Preserve the approved financial assumptions, dual-scenario P&L, funding terms, milestone-gated Y1 advertising and high-growth ROI only.
- [ ] Keep `*仅按摩类` immediately beside the three-year projection title.

### Task 4: Verify and Package V4

**Files:**
- Modify: `/Users/eason/Documents/New project/tmp/pdfs/needo_bp_premium/verify_needo_bp_premium.py`
- Create: `/Users/eason/Documents/New project/output/pdf/NeeDoBP_CN_投资人KeyVisual锁定精致版_V4_14页_2026-08-14.pdf`

- [ ] Assert page count, 960×540 boxes, required labels, fee columns, HOGUGU, 500日元, 2亿日元/10% and 642.2%.
- [ ] Assert the original source-page raster masters are embedded on the art-led pages and forbidden V3 pure-chart headings are absent.
- [ ] Assert important text is extractable, links are present and no STHeiti/Noto font resource is embedded.
- [ ] Render all 14 pages at 144 DPI, inspect every page, fix clipping/overlap/patch-feel defects and rerun verification.
- [ ] Package the final PDF plus a 14-page contact sheet for delivery.
