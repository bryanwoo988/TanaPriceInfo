"""Build the static site: PWA (web/) + JSON API (api/) + CSV copies (data/).

Output goes to site/, which GitHub Pages serves at
  https://<user>.github.io/<repo>/

API (all JSON, UTF-8, CORS open on GitHub Pages):
  api/latest.json        newest MPOB day + FAMA national prices + PriceCatcher day
  api/mpob.json          every MPOB day collected
  api/fama.json          FAMA 7-day average per level, national + per state
  api/fama_daerah.json   FAMA 7-day average per level and district
  api/fama_trend.json    FAMA daily average, last 30 days, national + per state
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
import hashlib
import json
import math
import shutil
import subprocess
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


FAMA_TREND_DAYS = 30
FAMA_FEW_RECORDS = 3  # fewer records than this: the average is shaky ("rekod sedikit")


def fama() -> tuple[dict, dict, dict]:
    """FAMA prices averaged over the last FAMA_WINDOW_DAYS days of data.

    The CSV holds one average per date/level/state/district/commodity plus `n`,
    the number of price records behind it, so averages are rebuilt exactly as
    FAMA's page does (weighted by n).
    Returns (national + state, district, daily trend for national + state).
    """
    rows = [r for f in sorted((DATA / "fama").glob("[0-9][0-9][0-9][0-9]-[0-9][0-9].csv"))
            for r in read_csv(f)]
    empty = {"source": "FAMA", "date": None, "window": None, "items": []}
    if not rows:
        return empty, {**empty}, {"source": "FAMA", "dates": [], "series": {}}
    end = max(r["tarikh"] for r in rows)
    day = lambda back: (datetime.fromisoformat(end) - timedelta(days=back)).date().isoformat()
    start = day(FAMA_WINDOW_DAYS - 1)
    prev_start, prev_end = day(2 * FAMA_WINDOW_DAYS - 1), day(FAMA_WINDOW_DAYS)
    trend_dates = [day(i) for i in range(FAMA_TREND_DAYS - 1, -1, -1)]
    trend_first = trend_dates[0]

    acc, prev, daily = {}, {}, {}
    for r in rows:
        t = r["tarikh"]
        h, n = num(r["harga"], 6), int(float(r["n"] or 0))
        if h is None or n <= 0:
            continue
        item = (r["varieti"], r["gred"], r["unit"])
        locs = (("", ""), (r["negeri"], ""), (r["negeri"], r["daerah"]))
        if start <= t <= end:
            for loc in locs:
                a = acc.setdefault((r["peringkat"], *loc, *item),
                                   {"sum": 0.0, "n": 0, "latest": "", "category": r["kategori"]})
                a["sum"] += h * n
                a["n"] += n
                a["latest"] = max(a["latest"], t)
        elif prev_start <= t <= prev_end:  # the week before: for "change vs last week"
            for loc in locs:
                a = prev.setdefault((r["peringkat"], *loc, *item), {"sum": 0.0, "n": 0})
                a["sum"] += h * n
                a["n"] += n
        if t >= trend_first:  # daily averages, national + state only (district is too thin)
            for loc in locs[:2]:
                a = daily.setdefault((r["peringkat"], loc[0], *item), {}).setdefault(t, [0.0, 0])
                a[0] += h * n
                a[1] += n

    def entry(k, a):
        level, state, district, item, grade, unit = k
        price = round(a["sum"] / a["n"], 2)
        p = prev.get(k)
        prev_price = round(p["sum"] / p["n"], 2) if p and p["n"] else None
        return {"level": level, "state": state or None, "district": district or None,
                "item": item, "grade": grade, "unit": unit, "category": a["category"],
                "price": price, "records": a["n"], "latest_date": a["latest"],
                "few_records": a["n"] < FAMA_FEW_RECORDS,
                "prev_price": prev_price,
                "change_pct": round((price - prev_price) / prev_price * 100, 1) if prev_price else None}

    order = {lvl: i for i, lvl in enumerate(FAMA_LEVELS)}
    keys = sorted(acc, key=lambda k: (order.get(k[0], 9), k[1], k[2], k[3], k[4]))
    top = [entry(k, acc[k]) for k in keys if not k[2]]
    dist = [entry(k, acc[k]) for k in keys if k[2]]
    states = {}
    for k in keys:
        if k[2]:
            states.setdefault(k[1], set()).add(k[2])
    window = {"from": start, "to": end, "days": FAMA_WINDOW_DAYS,
              "previous_from": prev_start, "previous_to": prev_end,
              "few_records_below": FAMA_FEW_RECORDS,
              "method": "purata ditimbang mengikut bilangan rekod (weighted by records)"}
    meta = {"source": "FAMA", "date": end, "window": window, "levels": FAMA_LEVELS}
    # Trend: key "level|state|item|grade|unit" (state empty = all Malaysia),
    # one [price, records] per date in `dates` (null = no record that day).
    series = {
        "|".join((lvl, st, it, gr, un)): [[round(v[d][0] / v[d][1], 2), v[d][1]] if d in v else None
                                          for d in trend_dates]
        for (lvl, st, it, gr, un), v in sorted(daily.items())
    }
    trend = {"source": "FAMA", "dates": trend_dates, "series": series}
    return ({**meta, "states": {s: sorted(d) for s, d in sorted(states.items())}, "items": top},
            {**meta, "items": dist}, trend)


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


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True,
                          check=True).stdout


def to_myt(iso: str) -> str:
    return datetime.fromisoformat(iso).astimezone(MYT).isoformat(timespec="seconds")


def changelog() -> list[dict]:
    """web/changelog.json with the real release time of each version, from git.

    A version's release time is when it reached the main line: the given
    `commit` (for versions released before this file existed), otherwise the
    first first-parent commit whose web/changelog.json lists the version, which
    on main is the merge commit of its pull request. Never typed by hand.
    """
    entries = json.loads((WEB / "changelog.json").read_text(encoding="utf-8"))
    times: dict[str, str] = {}
    try:
        for e in entries:
            if e.get("commit"):
                times[e["version"]] = to_myt(git("show", "-s", "--format=%cI", e["commit"]).strip())
        log = git("log", "--first-parent", "--reverse", "--format=%H %cI", "HEAD", "--", "web/changelog.json")
        for line in log.splitlines():
            sha, when = line.split()
            try:
                listed = json.loads(git("show", f"{sha}:web/changelog.json"))
            except (subprocess.CalledProcessError, ValueError):
                continue
            for e in listed:
                times.setdefault(e["version"], to_myt(when))
    except (OSError, subprocess.CalledProcessError) as e:
        print(f"[site] WARNING: no git history for release times ({e})")
    out = [{"version": e["version"], "released_at": times.get(e["version"]),
            "title": e["title"], "notes": e.get("notes", []),
            # Chinese text, when written (shown when the app is in Chinese).
            **({"title_zh": e["title_zh"]} if e.get("title_zh") else {}),
            **({"notes_zh": e["notes_zh"]} if e.get("notes_zh") else {})} for e in entries]
    missing = [e["version"] for e in out if not e["released_at"]]
    if missing:
        print(f"[site] WARNING: release time unknown for {missing}")
    return out


def app_build_id() -> str:
    """Short hash of everything in web/: changes exactly when the app changes."""
    h = hashlib.sha256()
    for f in sorted(p for p in WEB.rglob("*") if p.is_file()):
        h.update(f.relative_to(WEB).as_posix().encode())
        h.update(f.read_bytes())
    return h.hexdigest()[:10]


def stamp(values: dict[str, str]) -> None:
    """Write build id / version into sw.js (so browsers see an update) and app.js."""
    for name in ("sw.js", "app.js"):
        f = OUT / name
        text = f.read_text(encoding="utf-8")
        for key, val in values.items():
            if name == "sw.js" and key != "__BUILD__":
                continue
            if key not in text:
                raise SystemExit(f"[site] {key} placeholder missing in {name}")
            text = text.replace(key, val)
        f.write_text(text, encoding="utf-8")


def write(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")),
                    encoding="utf-8")


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(WEB, OUT)
    build = app_build_id()
    log = changelog()
    current = log[0]
    stamp({"__BUILD__": build, "__VERSION__": current["version"],
           "__RELEASED__": current["released_at"] or ""})
    if DATA.exists():
        shutil.copytree(DATA, OUT / "data", ignore=shutil.ignore_patterns("raw", "*.png"))

    now = datetime.now(MYT).isoformat(timespec="seconds")
    m, (f, fd, ft), p = mpob(), fama(), pricecatcher()
    src = sources(m, f, p)
    meta = {"schema": SCHEMA, "generated_at": now}

    write(OUT / "api" / "mpob.json", {**meta, "sources": {"mpob": src["mpob"]}, **m})
    write(OUT / "api" / "fama.json", {**meta, "sources": {"fama": src["fama"]}, **f})
    write(OUT / "api" / "fama_daerah.json", {**meta, "sources": {"fama": src["fama"]}, **fd})
    write(OUT / "api" / "fama_trend.json", {**meta, **ft})
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
    write(OUT / "version.json", {"version": current["version"], "released_at": current["released_at"],
                                 "build": build, "generated_at": now})
    write(OUT / "changelog.json", log)
    try:
        history = json.loads((DATA / "history.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        history = []
    write(OUT / "api" / "history.json", {**meta, "days": 90, "items": history})
    print(f"[site] app {current['version']} released {current['released_at']} build {build}")
    print(f"[site] mpob {len(m['days'])} days, fama {len(f['items'])} national+state "
          f"+ {len(fd['items'])} district entries, "
          f"pricecatcher {len(p['items'])} rows -> {OUT}")


if __name__ == "__main__":
    main()
