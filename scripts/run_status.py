"""Record each scraper's result (for data-freshness display and history).

data/status.json   latest result per source
data/history.json  every result of the last HISTORY_DAYS days (newest last):
  {"source": "fama", "time": "...", "ok": true, "note": "", "run": "123", "trigger": "auto"}


data/status.json:
  {"mpob": {"last_attempt": "...", "last_success": "...", "ok": true, "note": ""}, ...}

Times are Malaysia time (ISO 8601). `last_success` only moves when a run succeeds,
so a failing source keeps showing when it last worked.
"""
import json
import os
import sys
import traceback
from datetime import datetime, timezone, timedelta
from pathlib import Path

STATUS = Path(__file__).resolve().parent.parent / "data" / "status.json"
HISTORY = STATUS.with_name("history.json")
HISTORY_DAYS = 90
MYT = timezone(timedelta(hours=8))
TRIGGERS = {"schedule": "auto", "workflow_dispatch": "manual"}


def append_history(source: str, now: datetime, ok: bool, note: str) -> None:
    try:
        hist = json.loads(HISTORY.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        hist = []
    hist.append({
        "source": source,
        "time": now.isoformat(timespec="seconds"),
        "ok": ok,
        "note": note,
        # GitHub Actions run: groups the three sources of one daily run together.
        "run": os.environ.get("GITHUB_RUN_ID"),
        "trigger": TRIGGERS.get(os.environ.get("GITHUB_EVENT_NAME", ""), "local"),
    })
    cutoff = (now - timedelta(days=HISTORY_DAYS)).isoformat()
    hist = [h for h in hist if h.get("time", "") >= cutoff]
    HISTORY.write_text(json.dumps(hist, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def record(source: str, ok: bool, note: str = "") -> None:
    now_dt = datetime.now(MYT)
    now = now_dt.isoformat(timespec="seconds")
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
    append_history(source, now_dt, ok, s["note"])


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
