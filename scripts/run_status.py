"""Record each scraper's result in data/status.json (for data-freshness display).

data/status.json:
  {"mpob": {"last_attempt": "...", "last_success": "...", "ok": true, "note": ""}, ...}

Times are Malaysia time (ISO 8601). `last_success` only moves when a run succeeds,
so a failing source keeps showing when it last worked.
"""
import json
import sys
import traceback
from datetime import datetime, timezone, timedelta
from pathlib import Path

STATUS = Path(__file__).resolve().parent.parent / "data" / "status.json"
MYT = timezone(timedelta(hours=8))


def record(source: str, ok: bool, note: str = "") -> None:
    now = datetime.now(MYT).isoformat(timespec="seconds")
    try:
        data = json.loads(STATUS.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        data = {}
    s = data.get(source, {})
    s["last_attempt"] = now
    s["ok"] = ok
    s["note"] = note[:300]
    if ok:
        s["last_success"] = now
    data[source] = s
    STATUS.parent.mkdir(parents=True, exist_ok=True)
    STATUS.write_text(json.dumps(data, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
                      encoding="utf-8")


def run_with_status(source: str, main) -> None:
    """Run main(), record the outcome, keep the original exit code."""
    code, note = 0, ""
    try:
        main()
    except SystemExit as e:
        code = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
        note = "" if code == 0 else f"exit {code}"
    except Exception as e:  # noqa: BLE001
        traceback.print_exc()
        code, note = 1, f"{type(e).__name__}: {e}"
    record(source, code == 0, note)
    sys.exit(code)
