# NeeDo Investor Deck Rebuild Implementation Plan

> **For agentic workers:** Execute inline in the current session; no delegated workers are authorized for this task.

**Goal:** Build a validated 20-slide editable PPTX that combines the original NeeDo art direction with the revised investor content.

**Architecture:** Use the 34-slide original PPTX as the OOXML base. Retain the 20 mapped original slide relationships in revised order, copy matching text bodies from the revised deck, add the two unmatched text boxes, and rebuild the team slide from the original four-card slide.

**Tech Stack:** Python 3.12, python-pptx, OOXML, LibreOffice, Poppler, PPTX validator.

## Global Constraints

- Do not overwrite either source file.
- Do not invent claims, names, forecasts, or financial assumptions.
- Preserve editable native charts and text.
- Use the revised 20-slide deck as the sole content authority.

### Task 1: Generate the PPTX

**Files:**
- Create: `build_deck.py`
- Create: `NeeDo_BP_投资人精简优化_美术重制版.pptx`

- [ ] Load both source decks and verify their slide sizes match.
- [ ] Retain and reorder the mapped original slides.
- [ ] Copy exact matching text/table bodies from each revised slide.
- [ ] Add the two revised-only explanatory text boxes to slides 5 and 7.
- [ ] Rebuild slide 19 with the original four-card visual language.
- [ ] Save without modifying the two source decks.

### Task 2: Structural and Content QA

**Files:**
- Create: `qa_report.txt`

- [ ] Run ZIP integrity and PPTX schema/relationship validation.
- [ ] Extract slide text and compare all 20 slides with the revised source.
- [ ] Confirm page numbers are 01–20 and no timeline labels remain on slide 19.

### Task 3: Visual QA and Delivery

**Files:**
- Create: `NeeDo_BP_投资人精简优化_美术重制版.pdf`
- Create: `final_contact.jpg`

- [ ] Render all 20 slides to PDF and JPEG.
- [ ] Inspect every page for overflow, overlap, contrast, alignment, and missing art.
- [ ] Fix any defects and rerender changed slides.
- [ ] Copy the verified PPTX to `/Users/eason/Documents/NeeDo/` when filesystem authorization permits.
