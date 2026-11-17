"""Build the static site: PWA (web/) + JSON API (api/) + CSV copies (data/).

Output goes to site/, which GitHub Pages serves at
  https://<user>.github.io/<repo>/

API (all JSON, UTF-8, CORS open on GitHub Pages):
  api/latest.json        newest MPOB day + FAMA national prices + PriceCatcher day
  api/mpob.json          every MPOB day collected
  api/fama.json          FAMA 7-day average per level, national + per state
  api/fama_daerah.json   FAMA 7-day average per level and district
  api/pricecatcher.json  newest PriceCatcher day, every state
Prices are numbers (RM) or null when missing.

Every file has a "sources" block for checking and freshness:
  url           official page to check the price against
  data_date     date of the newest price
  date_kind     "price"
  max_age_days  data older than this (vs today, Malaysia time) is late
  last_attempt / last_success / ok   from the daily collector run

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
SCHEMA = 2  # 2: FAMA entries per level/state/district (7-day average)
REGIONS = ["north", "south", "central", "east_coast", "sabah", "sarawak"]

# Where each price comes from, and how old it may get before we call it late.
# MPOB and PriceCatcher publish with about a day's delay, so they get more slack.
SOURCES = {
    "mpob": {
        "name": "MPOB",
        "title": "Harga BTS harian mengikut wilayah (1% OER)",
        "home": "https://bepi.mpob.gov.my/",
        "date_kind": "price",
        "max_age_days": 2,
    },
    "fama": {
        "name": "FAMA",
        "title": "Panduan Harga Harian (Ladang, Borong, Runcit)",
        "url": "https://www.fama.gov.my/harga-pasaran-terkini",
        "home": "https://www.fama.gov.my/",
        "date_kind": "price",
        "max_age_days": 2,
    },
    "pricecatcher": {
        "name": "PriceCatcher (KPDN, data.gov.my)",
        "title": "Harga runcit harian",
        "url": "https://open.dosm.gov.my/data-catalogue/pricecatcher",
        "home": "https://open.dosm.gov.my/data-catalogue/pricecatcher",
        "date_kind": "price",
        "max_age_days": 3,
    },
}


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


FAMA_WINDOW_DAYS = 7
FAMA_LEVELS = ["Ladang", "Borong", "Runcit"]


def fama() -> tuple[dict, dict]:
    """FAMA prices averaged over the last FAMA_WINDOW_DAYS days of data.

    The CSV holds one average per date/level/state/district/commodity plus `n`,
    the number of price records behind it, so averages are rebuilt exactly as
    FAMA's page does (weighted by n). Returns (national + state, district).
    """
    rows = [r for f in sorted((DATA / "fama").glob("[0-9][0-9][0-9][0-9]-[0-9][0-9].csv"))
            for r in read_csv(f)]
    empty = {"source": "FAMA", "date": None, "window": None, "items": []}
    if not rows:
        return empty, {**empty}
    end = max(r["tarikh"] for r in rows)
    start = (datetime.fromisoformat(end) - timedelta(days=FAMA_WINDOW_DAYS - 1)).date().isoformat()

    acc = {}
    for r in rows:
        if not (start <= r["tarikh"] <= end):
            continue
        h, n = num(r["harga"], 6), int(float(r["n"] or 0))
        if h is None or n <= 0:
            continue
        item = (r["varieti"], r["gred"], r["unit"])
        for loc in (("", ""), (r["negeri"], ""), (r["negeri"], r["daerah"])):
            k = (r["peringkat"], *loc, *item)
            a = acc.setdefault(k, {"sum": 0.0, "n": 0, "latest": "", "category": r["kategori"]})
            a["sum"] += h * n
            a["n"] += n
            a["latest"] = max(a["latest"], r["tarikh"])

    def entry(k, a):
        level, state, district, item, grade, unit = k
        return {"level": level, "state": state or None, "district": district or None,
                "item": item, "grade": grade, "unit": unit, "category": a["category"],
                "price": round(a["sum"] / a["n"], 2), "records": a["n"],
                "latest_date": a["latest"]}

    order = {lvl: i for i, lvl in enumerate(FAMA_LEVELS)}
    keys = sorted(acc, key=lambda k: (order.get(k[0], 9), k[1], k[2], k[3], k[4]))
    top = [entry(k, acc[k]) for k in keys if not k[2]]
    dist = [entry(k, acc[k]) for k in keys if k[2]]
    states = {}
    for k in keys:
        if k[2]:
            states.setdefault(k[1], set()).add(k[2])
    window = {"from": start, "to": end, "days": FAMA_WINDOW_DAYS,
              "method": "purata ditimbang mengikut bilangan rekod (weighted by records)"}
    meta = {"source": "FAMA", "date": end, "window": window, "levels": FAMA_LEVELS}
    return ({**meta, "states": {s: sorted(d) for s, d in sorted(states.items())}, "items": top},
            {**meta, "items": dist})


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


def sources(m: dict, f: dict, p: dict) -> dict:
    try:
        status = json.loads((DATA / "status.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        status = {}
    mpob_last = m["days"][-1]["date"] if m["days"] else None
    dates = {"mpob": mpob_last, "fama": f.get("date"), "pricecatcher": p.get("date")}
    out = {}
    for key, meta in SOURCES.items():
        st = status.get(key, {})
        src = {**meta, "data_date": dates[key],
               "last_attempt": st.get("last_attempt"),
               "last_success": st.get("last_success"),
               "ok": st.get("ok")}
        if key == "mpob":
            # The exact monthly PDF the prices were read from.
            src["url"] = (f"https://price.mpob.gov.my/pdf/daily/ffb/{mpob_last}"
                          if mpob_last else meta["home"])
        out[key] = src
    return out


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
    m, (f, fd), p = mpob(), fama(), pricecatcher()
    src = sources(m, f, p)
    meta = {"schema": SCHEMA, "generated_at": now}

    write(OUT / "api" / "mpob.json", {**meta, "sources": {"mpob": src["mpob"]}, **m})
    write(OUT / "api" / "fama.json", {**meta, "sources": {"fama": src["fama"]}, **f})
    write(OUT / "api" / "fama_daerah.json", {**meta, "sources": {"fama": src["fama"]}, **fd})
    write(OUT / "api" / "pricecatcher.json",
          {**meta, "sources": {"pricecatcher": src["pricecatcher"]}, **p})
    write(OUT / "api" / "latest.json", {
        **meta,
        "sources": src,
        "mpob": {"unit": m["unit"], **(mpob_latest(m) or {})},
        # National prices only; per state: fama.json, per district: fama_daerah.json.
        "fama": {k: v for k, v in f.items() if k not in ("items", "states")}
                | {"items": [e for e in f["items"] if e["state"] is None]},
        "pricecatcher": p,
    })
    (OUT / ".nojekyll").write_text("")
    print(f"[site] mpob {len(m['days'])} days, fama {len(f['items'])} national+state "
          f"+ {len(fd['items'])} district entries, "
          f"pricecatcher {len(p['items'])} rows -> {OUT}")


if __name__ == "__main__":
    main()
