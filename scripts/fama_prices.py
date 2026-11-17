"""FAMA "Panduan Harga Harian" (Power BI report) -> CSV, per day / level / state / district.

The FAMA page is a Power BI report on one table, "API Harga (30hari)": every
price record of the last 30 days, with date (tarikh harga), level (peringkat:
Ladang / Borong / Runcit), state, district, commodity, grade, unit and price.
The page shows "Harga Purata" = average of the records that match the slicers.

How it works:
 1. Open the page in a headless browser and record its Power BI queries.
 2. Take the price-table query as a template: keep the report's own filters
    (e.g. which commodities FAMA publishes), drop the slicers (level, state,
    district, date).
 3. Ask Power BI for the average price AND number of records per
    date + level + state + district + commodity + grade + unit,
    one query per level x state (stays under the 30,000-row limit).
 4. Check: rebuild the page's default view (Ladang, all states, all dates)
    and log a few prices, to compare with what the website shows.

Output:
  data/fama/YYYY-MM.csv   one row per date/level/state/district/commodity/grade/unit
                          (rows of the last 30 days are refreshed every run)
  data/raw/fama/DATE/     raw responses (not committed; Actions artifact)

Usage:
  python scripts/fama_prices.py            # normal daily run
  python scripts/fama_prices.py --show     # visible browser (debug)
"""
import argparse
import copy
import csv
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.path.insert(0, str(Path(__file__).resolve().parent))
from powerbi_dsr import decode, truncated  # noqa: E402

PAGE = "https://www.fama.gov.my/harga-pasaran-terkini"
ROOT = Path(__file__).resolve().parent.parent / "data"
OUT_DIR = ROOT / "fama"
MYT = timezone(timedelta(hours=8))
MAX_ROWS = 30000
KEEP_HEADERS = ("x-powerbi-resourcekey", "content-type", "activityid", "requestid")

PRICE_TABLE = "API Harga (30hari)"
GROUP_COLS = ["tarikh harga", "peringkat", "negeri", "daerah", "varieti", "gred MID", "unit", "kategori"]
# Columns the page's slicers filter on; their conditions are removed from the template.
SLICER_PROPS = {"peringkat", "negeri", "daerah", "tarikh harga", "icon", "date", "kawasan", "zon", "lokasi"}
CHECK_ITEMS = ("PISANG BERANGAN", "AYAM HIDUP", "BAYAM", "CILI HIJAU")
CSV_FIELDS = ["tarikh", "peringkat", "negeri", "daerah", "varieti", "gred", "unit", "kategori", "harga", "n"]
KEY = ("tarikh", "peringkat", "negeri", "daerah", "varieti", "gred", "unit")

SCHEMAS: list[dict] = []  # Power BI data model, logged by describe()


# ---------- Power BI query building ----------

def _query(body: dict) -> dict:
    try:
        return body["queries"][0]["Query"]["Commands"][0]["SemanticQueryDataShapeCommand"]["Query"]
    except (KeyError, IndexError, TypeError):
        return {}


def _props(obj) -> set:
    """All column names a condition refers to (lower case)."""
    out = set()
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == "Property" and isinstance(v, str):
                out.add(v.strip().lower())
            else:
                out |= _props(v)
    elif isinstance(obj, list):
        for v in obj:
            out |= _props(v)
    return out


def _col(alias: str, prop: str) -> dict:
    return {"Column": {"Expression": {"SourceRef": {"Source": alias}}, "Property": prop}}


def _in(alias: str, prop: str, values: list[str]) -> dict:
    lits = [[{"Literal": {"Value": "'" + v.replace("'", "''") + "'"}}] for v in values]
    return {"Condition": {"In": {"Expressions": [_col(alias, prop)], "Values": lits}}}


class Template:
    """The page's price-table query, reshaped for our own questions."""

    def __init__(self, call: dict):
        self.call = call
        q = _query(call["body"])
        self.alias = next(f["Name"] for f in q["From"] if f.get("Entity") == PRICE_TABLE)
        self.price = next(s for s in q["Select"] if (s.get("Name") or "").lower().endswith("harga"))
        self.kept = [w for w in q.get("Where", []) if not (_props(w) & SLICER_PROPS)]
        self.dropped = len(q.get("Where", [])) - len(self.kept)

    def body(self, cols: list[str], where: list[dict], count=True) -> dict:
        b = copy.deepcopy(self.call["body"])
        q0 = b["queries"][0]
        q0.pop("CacheKey", None)
        cmd = q0["Query"]["Commands"][0]["SemanticQueryDataShapeCommand"]
        select = [{**_col(self.alias, c), "Name": f"P.{c}"} for c in cols]
        select.append({**copy.deepcopy(self.price), "Name": "harga"})
        if count:  # CountNonNull(harga): how many records the average is built from
            select.append({"Aggregation": {"Expression": _col(self.alias, "harga"), "Function": 5},
                           "Name": "n"})
        q = cmd["Query"]
        q["Select"] = select
        q["Where"] = self.kept + where
        q.pop("OrderBy", None)
        dr = copy.deepcopy(cmd.get("Binding", {}).get("DataReduction", {}))
        dr["Primary"] = {"Window": {"Count": MAX_ROWS}}
        dr.pop("Secondary", None)
        cmd["Binding"] = {"Primary": {"Groupings": [{"Projections": list(range(len(select)))}]},
                          "DataReduction": dr, "Version": 1}
        return b


def find_template(calls: list[dict]) -> Template:
    for c in calls:
        q = _query(c["body"])
        names = [(s.get("Name") or "").lower() for s in q.get("Select", [])]
        tables = [f.get("Entity") for f in q.get("From", [])]
        if PRICE_TABLE in tables and any(n.endswith("varieti") for n in names) \
                and any(n.endswith("harga") for n in names):
            return Template(c)
    raise RuntimeError("Price table query not found on the page (report changed?)")


# ---------- browser ----------

def post(page, call: dict, body: dict) -> dict:
    r = page.request.post(call["url"], data=json.dumps(body),
                          headers=call["headers"] | {"content-type": "application/json"},
                          timeout=90_000)
    if not r.ok:
        raise RuntimeError(f"Power BI HTTP {r.status}")
    return r.json()


def describe(calls: list[dict]) -> None:
    """Log the data model and the page's queries (for debugging report changes)."""
    for sch in SCHEMAS:
        for model in sch.get("schemas", []):
            for ent in model.get("schema", {}).get("Entities", []):
                if ent.get("Name") == PRICE_TABLE:
                    print(f"[FAMA] table {ent['Name']!r}: {[p.get('Name') for p in ent.get('Properties', [])]}")
    for i, c in enumerate(calls):
        q = _query(c["body"])
        print(f"[FAMA] page query #{i:02d}: tables={[f.get('Entity') for f in q.get('From', [])]} "
              f"fields={[s.get('Name') for s in q.get('Select', [])]}")


def as_date(v) -> str | None:
    if v is None:
        return None
    if isinstance(v, (int, float)):  # Power BI sends dates as epoch milliseconds
        return datetime.fromtimestamp(v / 1000, tz=timezone.utc).date().isoformat()
    return str(v)[:10]


def num(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if f != f else f  # NaN -> None


def collect(show: bool, raw_dir: Path) -> tuple[list[dict], list[str]]:
    calls, problems = [], []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not show)
        page = browser.new_page(locale="ms-MY", timezone_id="Asia/Kuala_Lumpur")

        def on_response(resp):
            u = resp.url.lower()
            try:
                if "conceptualschema" in u:
                    SCHEMAS.append(resp.json())
                elif "querydata" in u:
                    calls.append({
                        "url": resp.url,
                        "headers": {k: v for k, v in resp.request.headers.items()
                                    if k.lower() in KEEP_HEADERS},
                        "body": json.loads(resp.request.post_data or "{}"),
                    })
            except Exception as e:  # noqa: BLE001
                print(f"[FAMA] could not read a response: {e}", file=sys.stderr)

        page.on("response", on_response)
        page.goto(PAGE, wait_until="domcontentloaded", timeout=90_000)
        src = page.eval_on_selector_all(
            "iframe", "els => els.map(e => e.src).filter(s => s.includes('powerbi'))")
        if src:
            page.goto(src[0], wait_until="domcontentloaded", timeout=90_000)
        else:
            print("[FAMA] No Power BI iframe found on the page.", file=sys.stderr)
        page.wait_for_timeout(25_000)
        describe(calls)

        tpl = find_template(calls)
        print(f"[FAMA] template: alias={tpl.alias} price={tpl.price.get('Name')} "
              f"kept {len(tpl.kept)} report filter(s), dropped {tpl.dropped} slicer filter(s)")

        def run(name: str, body: dict) -> list[dict]:
            resp = post(page, tpl.call, body)
            (raw_dir / f"{name}.json").write_text(
                json.dumps({"body": body, "response": resp}, ensure_ascii=False), encoding="utf-8")
            if truncated(resp):
                problems.append(f"{name}: incomplete (over {MAX_ROWS} rows)")
            return decode(resp)

        # 1. How many records per level x state (also tells us which exist).
        combos = run("combos", tpl.body(["peringkat", "negeri"], []))
        combos = [c for c in combos if c.get("peringkat") and c.get("negeri")]
        print(f"[FAMA] {len(combos)} level x state groups: "
              + ", ".join(f"{c['peringkat']}/{c['negeri']}={c.get('n')}" for c in combos))

        # 2. Grouped prices, one query per level x state.
        rows = []
        for c in combos:
            name = f"{c['peringkat']}_{c['negeri']}".replace(" ", "_").replace("/", "-")
            try:
                got = run(name, tpl.body(GROUP_COLS, [
                    _in(tpl.alias, "peringkat", [c["peringkat"]]),
                    _in(tpl.alias, "negeri", [c["negeri"]]),
                ]))
            except Exception as e:  # noqa: BLE001
                problems.append(f"{name}: {e}")
                continue
            rows.extend(got)
            page.wait_for_timeout(300)  # be polite

        # 3. Check against the page's default view: Ladang, all states, all dates.
        try:
            check = run("check_ladang_all", tpl.body(["varieti", "gred MID", "unit"],
                                                       [_in(tpl.alias, "peringkat", ["Ladang"])]))
            for r in check:
                if r.get("varieti") in CHECK_ITEMS:
                    print(f"[FAMA] CHECK Ladang/All/All {r['varieti']} {r.get('gred MID')}: "
                          f"harga={num(r.get('harga'))} n={r.get('n')}")
        except Exception as e:  # noqa: BLE001
            print(f"[FAMA] check query failed: {e}", file=sys.stderr)

        if show:
            page.screenshot(path=str(ROOT / "fama_debug.png"), full_page=True)
        browser.close()
    return rows, problems


# ---------- saving ----------

def to_record(r: dict) -> dict | None:
    rec = {
        "tarikh": as_date(r.get("tarikh harga")),
        "peringkat": r.get("peringkat"),
        "negeri": r.get("negeri"),
        "daerah": r.get("daerah"),
        "varieti": r.get("varieti"),
        "gred": r.get("gred MID"),
        "unit": r.get("unit"),
        "kategori": r.get("kategori"),
        "harga": num(r.get("harga")),
        "n": r.get("n"),
    }
    if not rec["tarikh"] or not rec["varieti"] or rec["harga"] is None:
        return None
    rec["harga"] = round(rec["harga"], 4)
    return rec


def save(records: list[dict]) -> None:
    by_month = defaultdict(list)
    for r in records:
        by_month[r["tarikh"][:7]].append(r)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for month, new in sorted(by_month.items()):
        path = OUT_DIR / f"{month}.csv"
        merged = {}
        if path.exists():
            with path.open(newline="", encoding="utf-8") as f:
                for r in csv.DictReader(f):
                    merged[tuple(r[k] for k in KEY)] = r
        for r in new:  # newer run wins (FAMA can correct recent prices)
            merged[tuple(str(r[k] or "") for k in KEY)] = r
        with path.open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=CSV_FIELDS)
            w.writeheader()
            for k in sorted(merged):
                w.writerow({fld: merged[k].get(fld, "") for fld in CSV_FIELDS})
        print(f"[FAMA] {month}: {len(new)} rows from this run, {len(merged)} rows in {path.name}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--show", action="store_true")
    a = ap.parse_args()

    today = datetime.now(MYT).date().isoformat()
    raw_dir = ROOT / "raw" / "fama" / today
    raw_dir.mkdir(parents=True, exist_ok=True)

    rows, problems = collect(a.show, raw_dir)
    records = [r for r in (to_record(x) for x in rows) if r]
    if not records:
        print("[FAMA] No price rows decoded. See raw JSON artifact.", file=sys.stderr)
        sys.exit(1)

    dates = sorted({r["tarikh"] for r in records})
    levels = defaultdict(int)
    for r in records:
        levels[r["peringkat"]] += 1
    print(f"[FAMA] {len(records)} rows, dates {dates[0]}..{dates[-1]}, per level {dict(levels)}, "
          f"{len({r['negeri'] for r in records})} states, "
          f"{len({(r['negeri'], r['daerah']) for r in records})} districts, "
          f"{len({r['varieti'] for r in records})} commodities")
    for r in records[:5]:
        print(f"[FAMA] sample: {r}")
    save(records)

    if problems:
        for p in problems:
            print(f"[FAMA] PROBLEM: {p}", file=sys.stderr)
        sys.exit(2)  # data saved, but tell GitHub (email) that something is missing


if __name__ == "__main__":
    from run_status import run_with_status

    run_with_status("fama", main)
