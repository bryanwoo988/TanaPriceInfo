"""Backup source: KPDN PriceCatcher open data (data.gov.my, CC BY 4.0).

Retail prices collected daily at shops/markets, by state. Official open
data with direct download, so it does not break like scraping does.
Note: this is RETAIL price, FAMA's is market price. Use as backup/compare.

Output: data/pricecatcher/sayur_buah_YYYY-MM.csv
  date, state, item, unit, category, n_premises, median, min, max

Usage:
  python scripts/pricecatcher_sayur.py              # this month (+ last month on days 1-3)
  python scripts/pricecatcher_sayur.py --month 2026-10
"""
import argparse
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from urllib.error import HTTPError

import pandas as pd

BASE = "https://storage.data.gov.my/pricecatcher"
OUT = Path(__file__).resolve().parent.parent / "data" / "pricecatcher"
MYT = timezone(timedelta(hours=8))
KEEP = r"SAYUR|BUAH"  # vegetable and fruit categories


def build(month: str, items: pd.DataFrame, shops: pd.DataFrame, cat_col: str) -> None:
    prices = pd.read_parquet(f"{BASE}/pricecatcher_{month}.parquet")
    df = (
        prices.merge(items[["item_code", "item", "unit", cat_col]], on="item_code")
        .merge(shops[["premise_code", "state"]], on="premise_code")
    )
    out = (
        df.groupby(["date", "state", "item", "unit", cat_col])["price"]
        .agg(n_premises="count", median="median", min="min", max="max")
        .reset_index()
        .rename(columns={cat_col: "category"})
        .sort_values(["date", "state", "item"])
    )
    out["date"] = pd.to_datetime(out["date"]).dt.date
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"sayur_buah_{month}.csv"
    out.round(2).to_csv(path, index=False, encoding="utf-8")
    print(f"[PriceCatcher] {month}: {len(out)} rows -> {path.name}")


def main():
    now = datetime.now(MYT)
    ap = argparse.ArgumentParser()
    ap.add_argument("--month")
    a = ap.parse_args()

    if a.month:
        months = [a.month]
    else:
        months = [now.strftime("%Y-%m")]
        if now.day <= 3:  # finish last month; this month's file may not exist yet
            months.insert(0, (now.replace(day=1) - timedelta(days=1)).strftime("%Y-%m"))

    items = pd.read_parquet(f"{BASE}/lookup_item.parquet")
    shops = pd.read_parquet(f"{BASE}/lookup_premise.parquet")
    cat_col = "item_category" if "item_category" in items else "item_group"
    items = items[items[cat_col].astype(str).str.upper().str.contains(KEEP, na=False)]

    errors = 0
    for m in months:
        try:
            build(m, items, shops, cat_col)
        except HTTPError as e:
            if e.code == 404 and not a.month and now.day <= 3 and m == months[-1]:
                print(f"[PriceCatcher] {m}: not published yet, skipped")
                continue
            print(f"[PriceCatcher] {m}: {e}", file=sys.stderr)
            errors += 1
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
