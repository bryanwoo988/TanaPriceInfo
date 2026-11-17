"""MPOB Daily FFB Reference Price Summary by Region (Mill Gate, RM / 1% OER).

Source: https://price.mpob.gov.my/pdf/daily/ffb/YYYY-MM-DD
That PDF holds the whole month: one row per day, 6 regions.
NT = no trade, PH = public holiday.

Usage:
  python scripts/mpob_ffb.py                 # update current month
  python scripts/mpob_ffb.py --backfill 2020-07   # every month from 2020-07 to now
"""
import argparse
import calendar
import csv
import io
import re
import sys
import time
from datetime import date, timedelta
from pathlib import Path

import requests

URL = "https://price.mpob.gov.my/pdf/daily/ffb/{d}"
OUT = Path(__file__).resolve().parent.parent / "data" / "mpob_ffb_daily.csv"
REGIONS = ["north", "south", "central", "east_coast", "sabah", "sarawak"]
FIELDS = ["date", *REGIONS, "status"]
HEADERS = {"User-Agent": "Mozilla/5.0 (daily price logger)"}

TOKEN = r"(?:\d[\d,]*\.\d+|NT|PH|-)"
# Day column: "1", "01/11/2026", "1-11-26", "1-Nov-26", "01 Nov 2026"
DAY = r"(\d{1,2})(?:[/.\-](?:\d{1,2}|[A-Za-z]{3,9})[/.\-]\d{2,4}| [A-Za-z]{3,9} \d{2,4})?"
ROW = re.compile(rf"^\s*{DAY}\s+((?:{TOKEN}\s+){{5}}{TOKEN})\s*$")
# A line that starts like a day and has 3+ prices, but did not match ROW.
NEAR = re.compile(rf"^\s*{DAY}\s+(?:.*?\d+\.\d+){{3,}}")


def parse_text(text: str, year: int, month: int) -> list[dict]:
    rows = []
    for line in text.splitlines():
        m = ROW.match(line)
        if not m:
            if NEAR.match(line):
                print(f"[MPOB] {year}-{month:02d}: skipped unrecognised line: "
                      f"{line.strip()!r}", file=sys.stderr)
            continue
        day = int(m.group(1))
        if not 1 <= day <= calendar.monthrange(year, month)[1]:
            continue
        vals = m.group(2).split()
        status = "ok"
        if all(v == "NT" for v in vals):
            status = "NT"
        elif all(v == "PH" for v in vals):
            status = "PH"
        row = {"date": date(year, month, day).isoformat(), "status": status}
        for r, v in zip(REGIONS, vals):
            row[r] = v.replace(",", "") if re.match(r"\d", v) else ""
        rows.append(row)
    return rows


def pdf_to_text(content: bytes) -> str:
    import pdfplumber

    with pdfplumber.open(io.BytesIO(content)) as pdf:
        return "\n".join(p.extract_text() or "" for p in pdf.pages)


def fetch_month(d: date) -> list[dict]:
    r = requests.get(URL.format(d=d.isoformat()), headers=HEADERS, timeout=60)
    r.raise_for_status()
    if r.content[:4] == b"%PDF":
        text = pdf_to_text(r.content)
    else:  # in case MPOB serves HTML/text instead of PDF
        text = re.sub(r"<[^>]+>", " ", r.text)
        text = re.sub(r"[ \t]+", " ", text)
    rows = parse_text(text, d.year, d.month)
    if not rows:
        raise RuntimeError(f"No rows parsed for {d:%Y-%m}. Format may have changed.")
    return rows


def load() -> dict:
    if not OUT.exists():
        return {}
    with OUT.open(newline="", encoding="utf-8") as f:
        return {r["date"]: r for r in csv.DictReader(f)}


def save(data: dict) -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        for k in sorted(data):
            w.writerow({f: data[k].get(f, "") for f in FIELDS})


def months_from(start: str):
    y, m = map(int, start.split("-"))
    today = date.today()
    while (y, m) <= (today.year, today.month):
        last = date(y, m, calendar.monthrange(y, m)[1])
        yield min(last, today)
        m += 1
        if m == 13:
            y, m = y + 1, 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--backfill", help="start month YYYY-MM")
    a = ap.parse_args()

    data = load()
    if a.backfill:
        targets = list(months_from(a.backfill))
    else:
        today = date.today()
        targets = [today]
        if today.day <= 3:  # also finish last month
            targets.insert(0, today.replace(day=1) - timedelta(days=1))

    errors = 0
    for d in targets:
        try:
            rows = fetch_month(d)
        except Exception as e:
            # today's file may not exist yet early in the day; try yesterday
            if d == date.today():
                try:
                    rows = fetch_month(d - timedelta(days=1))
                except Exception as e2:
                    print(f"[MPOB] {d}: {e2}", file=sys.stderr)
                    errors += 1
                    continue
            else:
                print(f"[MPOB] {d}: {e}", file=sys.stderr)
                errors += 1
                continue
        for r in rows:
            data[r["date"]] = r
        print(f"[MPOB] {d:%Y-%m}: {len(rows)} rows")
        if a.backfill:
            time.sleep(2)  # be polite

    save(data)
    if errors:
        print(f"[MPOB] {errors} of {len(targets)} month(s) failed.", file=sys.stderr)
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    from run_status import run_with_status

    run_with_status("mpob", main)
