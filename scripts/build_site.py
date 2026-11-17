"""Build the static site: PWA (web/) + JSON API (api/) + CSV copies (data/).

Output goes to site/, which GitHub Pages serves at
  https://<user>.github.io/<repo>/

API (all JSON, UTF-8, CORS open on GitHub Pages):
  api/latest.json        newest MPOB day + FAMA list + PriceCatcher day, in one file
  api/mpob.json          every MPOB day collected
  api/fama.json          newest FAMA day
  api/pricecatcher.json  newest PriceCatcher day, every state
Prices are numbers (RM) or null when missing.

Usage:
  python scripts/build_site.py
"""
import csv
import json
import math
import shutil
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
WEB = ROOT / "web"
OUT = ROOT / "site"
MYT = timezone(timedelta(hours=8))
SCHEMA = 1
REGIONS = ["north", "south", "central", "east_coast", "sabah", "sarawak"]


def num(v, nd=2):
    """'4.2357' -> 4.24 ; '', 'NaN', None -> None"""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) or math.isinf(f) else round(f, nd)


def read_csv(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def mpob() -> dict:
    days = []
    for r in sorted(read_csv(DATA / "mpob_ffb_daily.csv"), key=lambda r: r["date"]):
        days.append({
            "date": r["date"],
            "status": r.get("status") or "ok",  # ok | NT (no trade) | PH (public holiday)
            "prices": {k: num(r.get(k)) for k in REGIONS},
        })
    return {
        "source": "MPOB",
        "unit": "RM per 1% OER (harga pintu kilang)",
        "regions": REGIONS,
        "days": days,
    }


def mpob_latest(m: dict) -> dict | None:
    trade = [d for d in m["days"] if d["status"] == "ok"]
    if not trade:
        return None
    cur = trade[-1]
    prev = trade[-2] if len(trade) > 1 else None
    change = {
        k: (round(cur["prices"][k] - prev["prices"][k], 2)
            if prev and cur["prices"][k] is not None and prev["prices"][k] is not None
            else None)
        for k in REGIONS
    }
    return {
        "date": cur["date"],
        "prices": cur["prices"],
        "previous_date": prev["date"] if prev else None,
        "change": change,
    }


def fama() -> dict:
    rows = read_csv(DATA / "fama_prices.csv")
    if not rows:
        return {"source": "FAMA", "date": None, "verified": False, "items": []}
    date = max(r["scraped_date"] for r in rows)
    items = [
        {
            "item": r.get("varieti", "").strip(),
            "grade": r.get("gred MID", "").strip(),
            "unit": r.get("unit", "").strip(),
            "price": num(r.get("harga")),
        }
        for r in rows
        if r["scraped_date"] == date
    ]
    items.sort(key=lambda x: x["item"])
    return {
        "source": "FAMA",
        "date": date,
        # The FAMA scrape is not yet checked against the FAMA website.
        "verified": False,
        "items": items,
    }


def pricecatcher() -> dict:
    files = sorted((DATA / "pricecatcher").glob("sayur_buah_*.csv"))
    rows = read_csv(files[-1]) if files else []
    if not rows:
        return {"source": "PriceCatcher", "date": None, "items": []}
    date = max(r["date"] for r in rows)
    items = [
        {
            "state": r["state"],
            "item": r["item"],
            "unit": r["unit"],
            "category": r["category"],
            "premises": int(float(r["n_premises"])),
            "median": num(r["median"]),
            "min": num(r["min"]),
            "max": num(r["max"]),
        }
        for r in rows
        if r["date"] == date
    ]
    items.sort(key=lambda x: (x["state"], x["item"]))
    return {"source": "PriceCatcher", "date": date, "price": "runcit (retail)", "items": items}


def write(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")),
                    encoding="utf-8")


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(WEB, OUT)
    if DATA.exists():
        shutil.copytree(DATA, OUT / "data", ignore=shutil.ignore_patterns("raw", "*.png"))

    now = datetime.now(MYT).isoformat(timespec="seconds")
    m, f, p = mpob(), fama(), pricecatcher()
    meta = {"schema": SCHEMA, "generated_at": now}

    write(OUT / "api" / "mpob.json", {**meta, **m})
    write(OUT / "api" / "fama.json", {**meta, **f})
    write(OUT / "api" / "pricecatcher.json", {**meta, **p})
    write(OUT / "api" / "latest.json", {
        **meta,
        "mpob": {"unit": m["unit"], **(mpob_latest(m) or {})},
        "fama": f,
        "pricecatcher": p,
    })
    (OUT / ".nojekyll").write_text("")
    print(f"[site] mpob {len(m['days'])} days, fama {len(f['items'])} items, "
          f"pricecatcher {len(p['items'])} rows -> {OUT}")


if __name__ == "__main__":
    main()
