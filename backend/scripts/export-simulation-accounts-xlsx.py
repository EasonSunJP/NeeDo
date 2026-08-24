#!/usr/bin/env python3
"""Convert the local-only simulation account CSV into a formatted XLSX workbook."""

from __future__ import annotations

import argparse
import csv
from collections import Counter
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.table import Table, TableStyleInfo


HEADERS = [
    "account_type",
    "shop_name",
    "display_name",
    "email",
    "password",
    "status",
    "notes",
]
HEADER_LABELS = [
    "Account Type",
    "Shop Name",
    "Display Name",
    "Email",
    "Password",
    "Status",
    "Notes",
]
NAVY = "17365D"
LIGHT_BLUE = "D9EAF7"
LIGHT_GRAY = "F3F6F9"
WHITE = "FFFFFF"
TEXT = "1F2937"
WORKBOOK_FONT = "Arial"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("csv_path", type=Path)
    parser.add_argument("xlsx_path", type=Path)
    return parser.parse_args()


def load_rows(csv_path: Path) -> list[dict[str, str]]:
    with csv_path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        if reader.fieldnames != HEADERS:
            raise ValueError(f"unexpected account CSV headers: {reader.fieldnames}")
        rows = list(reader)
    if len(rows) != 210:
        raise ValueError(f"expected 210 account rows, found {len(rows)}")
    return rows


def create_workbook(rows: list[dict[str, str]], output_path: Path) -> None:
    workbook = Workbook()
    accounts = workbook.active
    accounts.title = "Accounts"
    accounts.freeze_panes = "A2"
    accounts.sheet_view.showGridLines = False
    accounts.sheet_properties.pageSetUpPr.fitToPage = True
    accounts.page_setup.orientation = "landscape"
    accounts.page_setup.fitToWidth = 1
    accounts.page_setup.fitToHeight = 0
    accounts.print_title_rows = "1:1"
    accounts.append(HEADER_LABELS)
    for row in rows:
        display_name = row["display_name"]
        sequence = row["email"].split("@", maxsplit=1)[0].rsplit(".", maxsplit=1)[-1]
        if row["account_type"] == "technician":
            display_name = f"Simulation Technician {sequence}"
        elif row["account_type"] == "customer":
            display_name = f"Simulation Customer {sequence}"
        accounts.append(
            [
                row["account_type"],
                row["shop_name"],
                display_name,
                row["email"],
                row["password"],
                row["status"],
                row["notes"],
            ]
        )

    thin = Side(style="thin", color="D5DCE5")
    for cell in accounts[1]:
        cell.font = Font(name=WORKBOOK_FONT, size=10, bold=True, color=WHITE)
        cell.fill = PatternFill("solid", fgColor=NAVY)
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = Border(bottom=thin)
    accounts.row_dimensions[1].height = 24

    for row_index in range(2, accounts.max_row + 1):
        for column_index in range(1, accounts.max_column + 1):
            cell = accounts.cell(row=row_index, column=column_index)
            cell.font = Font(name=WORKBOOK_FONT, size=10, color=TEXT)
            cell.alignment = Alignment(vertical="center")
            cell.number_format = "@"
        accounts.row_dimensions[row_index].height = 20

    widths = {"A": 18, "B": 29, "C": 27, "D": 36, "E": 29, "F": 12, "G": 38}
    for column, width in widths.items():
        accounts.column_dimensions[column].width = width

    table = Table(displayName="SimulationAccounts", ref=f"A1:G{accounts.max_row}")
    table.tableStyleInfo = TableStyleInfo(
        name="TableStyleMedium2",
        showFirstColumn=False,
        showLastColumn=False,
        showRowStripes=True,
        showColumnStripes=False,
    )
    accounts.add_table(table)

    summary = workbook.create_sheet("Read Me")
    summary.sheet_view.showGridLines = False
    summary.sheet_properties.pageSetUpPr.fitToPage = True
    summary.page_setup.orientation = "landscape"
    summary.page_setup.fitToWidth = 1
    summary.page_setup.fitToHeight = 1
    summary.column_dimensions["A"].width = 28
    summary.column_dimensions["B"].width = 58
    summary.append(["Item", "Details"])
    role_counts = Counter(row["account_type"] for row in rows)
    summary_rows = [
        ("Purpose", "NeeDo local/test three-month simulation login accounts"),
        ("Data period", "2026-06-01 to 2026-08-31"),
        ("Merchant owner accounts", str(role_counts["merchant_owner"])),
        ("Technician accounts", str(role_counts["technician"])),
        ("Customer accounts", str(role_counts["customer"])),
        ("Total accounts", str(len(rows))),
        ("Security", "Local/test only. Do not commit, publish, or use in production."),
        ("Passwords", "Each account has a unique password derived from the local seed and email."),
    ]
    for item in summary_rows:
        summary.append(item)
    for cell in summary[1]:
        cell.font = Font(name=WORKBOOK_FONT, size=10, bold=True, color=WHITE)
        cell.fill = PatternFill("solid", fgColor=NAVY)
        cell.alignment = Alignment(horizontal="center", vertical="center")
    for row_index in range(2, summary.max_row + 1):
        summary.cell(row=row_index, column=1).font = Font(
            name=WORKBOOK_FONT, size=10, bold=True, color=TEXT
        )
        summary.cell(row=row_index, column=1).fill = PatternFill("solid", fgColor=LIGHT_BLUE)
        summary.cell(row=row_index, column=2).font = Font(
            name=WORKBOOK_FONT, size=10, color=TEXT
        )
        summary.cell(row=row_index, column=2).fill = PatternFill("solid", fgColor=LIGHT_GRAY)
        for column_index in (1, 2):
            summary.cell(row=row_index, column=column_index).alignment = Alignment(
                vertical="top", wrap_text=True
            )
            summary.cell(row=row_index, column=column_index).border = Border(bottom=thin)
        summary.row_dimensions[row_index].height = 30
    summary.freeze_panes = "A2"

    workbook.properties.title = "NeeDo Three-Month Simulation Accounts"
    workbook.properties.subject = "Local and test simulation accounts"
    workbook.properties.creator = "NeeDo"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    workbook.save(output_path)


def verify_workbook(output_path: Path) -> None:
    workbook = load_workbook(output_path, read_only=False, data_only=False)
    if workbook.sheetnames != ["Accounts", "Read Me"]:
        raise ValueError(f"unexpected workbook sheets: {workbook.sheetnames}")
    accounts = workbook["Accounts"]
    if accounts.max_row != 211 or accounts.max_column != 7:
        raise ValueError(
            f"unexpected account sheet shape: {accounts.max_row} rows x {accounts.max_column} columns"
        )
    if [accounts.cell(1, column).value for column in range(1, 8)] != HEADER_LABELS:
        raise ValueError("account workbook headers do not match the approved export contract")


def main() -> None:
    args = parse_args()
    rows = load_rows(args.csv_path)
    create_workbook(rows, args.xlsx_path)
    verify_workbook(args.xlsx_path)
    print(
        f'{{"xlsx":"{args.xlsx_path.resolve()}","accountRows":{len(rows)},"status":"ok"}}'
    )


if __name__ == "__main__":
    main()
