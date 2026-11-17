"""Turn a Power BI `querydata` JSON response into flat rows.

Power BI compresses rows:
  C  = values that are present in this row
  R  = bitmask: column i repeats the value from the previous row
  Ø  = bitmask: column i is null
  S  = schema (first row of a group only); DN points to a ValueDicts list
  M  = child groups (matrix visuals): {"DM1": [...]} rows nested under a row
"""


def _columns(result: dict) -> dict:
    """Map G0/M0 ids to readable names from the descriptor."""
    names = {}
    for sel in result.get("descriptor", {}).get("Select", []):
        names[sel.get("Value")] = sel.get("Name") or sel.get("Value")
    return names


def _clean(name: str) -> str:
    # "Sum(Harga.Harga Runcit)" -> "Harga Runcit"
    if "(" in name and name.endswith(")"):
        name = name[name.index("(") + 1 : -1]
    return name.split(".")[-1]


def _walk(key, rows, vdicts, state, inherited, out):
    """Decode one DMn list. `state` keeps schema/previous row per level,
    because a nested level's schema is sent only once for the whole result."""
    st = state.setdefault(key, {"schema": None, "prev": {}})
    for row in rows:
        if "S" in row:
            st["schema"] = row["S"]
        schema = st["schema"]
        if not schema:
            continue
        C = row.get("C", [])
        R = row.get("R", 0)
        N = row.get("Ø", 0)
        vals, ci = {}, 0
        for i, col in enumerate(schema):
            cid = col["N"]
            if (R >> i) & 1:
                v = st["prev"].get(cid)
            elif (N >> i) & 1:
                v = None
            else:
                v = C[ci] if ci < len(C) else None
                ci += 1
                if "DN" in col and isinstance(v, int):
                    d = vdicts.get(col["DN"], [])
                    v = d[v] if 0 <= v < len(d) else v
            vals[cid] = v
        st["prev"] = vals
        merged = {**inherited, **vals}

        children = False
        for group in row.get("M", []) or []:
            for ckey, crows in group.items():
                if ckey.startswith("DM") and isinstance(crows, list):
                    children = True
                    _walk(ckey, crows, vdicts, state, merged, out)
        if not children:
            out.append(merged)


def decode(resp: dict) -> list[dict]:
    out = []
    for res in resp.get("results", []):
        data = res.get("result", {}).get("data", {})
        names = _columns(data)
        for ds in data.get("dsr", {}).get("DS", []):
            vdicts = ds.get("ValueDicts", {})
            raw = []
            for ph in ds.get("PH", []):
                state = {}
                for key, rows in ph.items():
                    if key.startswith("DM") and isinstance(rows, list):
                        _walk(key, rows, vdicts, state, {}, raw)
            out.extend({_clean(names.get(k, k)): v for k, v in r.items()} for r in raw)
    return out


def truncated(resp: dict) -> bool:
    """True if Power BI says the result is incomplete (row limit hit)."""
    for res in resp.get("results", []):
        data = res.get("result", {}).get("data", {})
        for ds in data.get("dsr", {}).get("DS", []):
            if ds.get("IC") is False or "RT" in ds:
                return True
    return False
