"""FAMA "Harga Pasaran Terkini" (Power BI report) -> CSV.

How it works:
 1. Open the FAMA page in a headless browser (Playwright).
 2. Record every Power BI `querydata` request + response the report makes.
 3. Replay each query again with slicer filters removed and a large row
    limit, so we get ALL states and ALL crops, not only the default view.
 4. Decode the Power BI format into rows and save:
      data/raw/fama/YYYY-MM-DD/*.json   (raw, for debugging; not committed,
                                         GitHub Actions keeps it as an artifact)
      data/fama/YYYY-MM-DD.csv           (that day's table)
      data/fama_prices.csv               (all days, appended)

Usage:
  python scripts/fama_prices.py            # normal daily run
  python scripts/fama_prices.py --show     # open a visible browser (debug)
"""
import argparse
import copy
import csv
import json
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from powerbi_dsr import decode, truncated  # noqa: E402

PAGE = "https://www.fama.gov.my/harga-pasaran-terkini"
ROOT = Path(__file__).resolve().parent.parent / "data"
MYT = timezone(timedelta(hours=8))
MAX_ROWS = 30000
KEEP_HEADERS = ("x-powerbi-resourcekey", "content-type", "activityid", "requestid")


def strip_filters(body: dict) -> dict:
    """Remove slicer filters and raise the row limit."""
    b = copy.deepcopy(body)
    for q in b.get("queries", []):
        for cmd in q.get("Query", {}).get("Commands", []):
            sq = cmd.get("SemanticQueryDataShapeCommand", {})
            sq.get("Query", {}).pop("Where", None)
            dr = sq.get("Binding", {}).get("DataReduction", {})
            for k in ("Primary", "Secondary"):
                part = dr.get(k, {})
                for mode in ("Window", "Top", "Sample"):
                    if mode in part:
                        part[mode]["Count"] = MAX_ROWS
    return b


def capture(show: bool) -> list[dict]:
    calls = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not show)
        page = browser.new_page(locale="ms-MY", timezone_id="Asia/Kuala_Lumpur")

        def on_response(resp):
            if "querydata" not in resp.url.lower():
                return
            try:
                calls.append(
                    {
                        "url": resp.url,
                        "headers": {
                            k: v
                            for k, v in resp.request.headers.items()
                            if k.lower() in KEEP_HEADERS
                        },
                        "body": json.loads(resp.request.post_data or "{}"),
                        "response": resp.json(),
                    }
                )
            except Exception as e:
                print(f"[FAMA] could not read a response: {e}", file=sys.stderr)

        page.on("response", on_response)
        page.goto(PAGE, wait_until="domcontentloaded", timeout=90_000)

        # Open the Power BI frame directly: it loads faster and more reliably.
        src = page.eval_on_selector_all(
            "iframe", "els => els.map(e => e.src).filter(s => s.includes('powerbi'))"
        )
        if src:
            page.goto(src[0], wait_until="domcontentloaded", timeout=90_000)
        else:
            print("[FAMA] No Power BI iframe found on the page.", file=sys.stderr)
        page.wait_for_timeout(25_000)  # let the report run its queries

        # Replay without filters to get every state / crop.
        for c in list(calls):
            try:
                r = page.request.post(
                    c["url"],
                    data=json.dumps(strip_filters(c["body"])),
                    headers=c["headers"] | {"content-type": "application/json"},
                    timeout=90_000,
                )
                if r.ok:
                    calls.append({**c, "body": strip_filters(c["body"]),
                                  "response": r.json(), "replayed": True})
            except Exception as e:
                print(f"[FAMA] replay failed: {e}", file=sys.stderr)

        if show:
            page.screenshot(path=str(ROOT / "fama_debug.png"), full_page=True)
        browser.close()
    return calls


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--show", action="store_true")
    a = ap.parse_args()

    today = datetime.now(MYT).date().isoformat()
    raw_dir = ROOT / "raw" / "fama" / today
    raw_dir.mkdir(parents=True, exist_ok=True)

    calls = capture(a.show)
    if not calls:
        print("[FAMA] No Power BI data captured.", file=sys.stderr)
        sys.exit(1)

    best, best_score, best_cut = [], -1, False
    for i, c in enumerate(calls):
        tag = "replay" if c.get("replayed") else "orig"
        (raw_dir / f"{i:02d}_{tag}.json").write_text(
            json.dumps(c, ensure_ascii=False, indent=1), encoding="utf-8"
        )
        try:
            rows = decode(c["response"])
        except Exception as e:
            print(f"[FAMA] decode failed for #{i}: {e}", file=sys.stderr)
            continue
        if not rows:
            continue
        # The price table = the result with the most rows x columns.
        score = len(rows) * len(rows[0])
        if score > best_score:
            best, best_score, best_cut = rows, score, truncated(c["response"])

    if not best:
        print("[FAMA] Captured data but could not decode a table. See raw JSON.",
              file=sys.stderr)
        sys.exit(1)

    cols = list(dict.fromkeys(k for r in best for k in r))
    day_csv = ROOT / "fama" / f"{today}.csv"
    day_csv.parent.mkdir(parents=True, exist_ok=True)
    with day_csv.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        w.writerows(best)

    # Combined file: drop today's old rows (if run twice), then add new ones.
    all_csv = ROOT / "fama_prices.csv"
    old = []
    if all_csv.exists():
        with all_csv.open(encoding="utf-8") as f:
            old = [r for r in csv.DictReader(f) if r.get("scraped_date") != today]
    fields = list(dict.fromkeys(["scraped_date", *(k for r in old for k in r), *cols]))
    with all_csv.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(old)
        w.writerows({"scraped_date": today, **r} for r in best)

    print(f"[FAMA] {len(best)} rows, columns: {cols}")
    if best_cut:
        # Data is saved, but fail the step so GitHub emails you.
        print(f"[FAMA] WARNING: Power BI says the table is incomplete "
              f"(over {MAX_ROWS} rows?). Some rows are missing.", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
