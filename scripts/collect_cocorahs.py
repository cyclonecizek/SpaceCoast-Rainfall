#!/usr/bin/env python3
"""Collect CoCoRaHS daily precipitation reports for the Space Coast counties from the CoCoRaHS data export
and keep a rolling record in data/cocorahs.json. Standard library only.

Each report is a 24-hour gauge reading (usually near 7 AM local). Reading times are stored in UTC.
If the export changes shape, the response is saved to data/cocorahs_debug.txt and the existing file is left alone.
"""
import csv, datetime as dt, io, json, os, sys, urllib.parse, urllib.request
from zoneinfo import ZoneInfo

OUT = os.path.join(os.environ.get("DATA_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data"), "cocorahs.json")
DEBUG = os.path.join(os.path.dirname(OUT), "cocorahs_debug.txt")
BASE = "https://data.cocorahs.org/export/exportreports.aspx"
COUNTIES = os.environ.get("COCORAHS_COUNTIES", "BV,VL,IR,OR,SM,OS").split(",")   # Brevard, Volusia, Indian River, Orange, Seminole, Osceola
DAYS = int(os.environ.get("COCORAHS_DAYS") or "10")
KEEP_DAYS = 120
TZ = ZoneInfo("America/New_York")


def pick(head, *names):
    low = [h.strip().lower() for h in head]
    for n in names:
        for i, h in enumerate(low):
            if n in h: return i
    return None


def parse(text):
    rows = list(csv.reader(io.StringIO(text.lstrip("\ufeff"))))
    if not rows or text.lstrip().startswith("<"): raise ValueError("export did not return CSV")
    head = rows[0]
    i_d, i_t, i_id, i_nm = pick(head, "observationdate"), pick(head, "observationtime"), pick(head, "stationnumber"), pick(head, "stationname")
    i_la, i_lo, i_p = pick(head, "latitude"), pick(head, "longitude"), pick(head, "totalprecipamt")
    if None in (i_d, i_id, i_la, i_lo, i_p): raise ValueError("unrecognised columns: " + ", ".join(head))
    out = []
    for r in rows[1:]:
        try:
            raw = r[i_p].strip().upper()
            if raw in ("", "NA", "M"): continue
            val = 0.0 if raw == "T" else float(raw)
            day = None
            for f in ("%Y-%m-%d", "%m/%d/%Y"):
                try: day = dt.datetime.strptime(r[i_d].strip(), f); break
                except ValueError: pass
            if day is None or val < 0: continue
            hh, mm = 7, 0
            if i_t is not None and r[i_t].strip():
                for f in ("%I:%M %p", "%H:%M", "%I:%M:%S %p", "%H:%M:%S"):
                    try: t = dt.datetime.strptime(r[i_t].strip(), f); hh, mm = t.hour, t.minute; break
                    except ValueError: pass
            when = day.replace(hour=hh, minute=mm, tzinfo=TZ).astimezone(dt.timezone.utc)
            out.append({"id": r[i_id].strip(), "name": r[i_nm].strip() if i_nm is not None else "", "lat": round(float(r[i_la]), 4), "lon": round(float(r[i_lo]), 4),
                        "t": when.strftime("%Y-%m-%dT%H:%MZ"), "in": round(val, 2)})
        except (IndexError, ValueError):
            continue
    return out


def main():
    today = dt.datetime.now(TZ).date(); start = today - dt.timedelta(days=DAYS)
    got, errors = [], []
    for county in COUNTIES:
        q = urllib.parse.urlencode({"ReportType": "Daily", "dtf": "1", "Format": "CSV", "State": "FL", "County": county.strip(), "ReportDateType": "reportdate",
                                    "StartDate": f"{start.month}/{start.day}/{start.year}", "EndDate": f"{today.month}/{today.day}/{today.year}", "TimesInGMT": "False"})
        text = ""
        try:
            req = urllib.request.Request(BASE + "?" + q, headers={"User-Agent": "space-coast-rainfall-dashboard (GitHub Actions collector)"})
            with urllib.request.urlopen(req, timeout=90) as r: text = r.read().decode("utf-8", "replace")
            got += parse(text)
        except Exception as e:
            errors.append(f"{county}: {e}")
            try:
                with open(DEBUG, "w") as f: f.write(f"{BASE}?{q}\n{e}\n\n{text[:3000]}")
            except OSError: pass
    if not got:
        print("CoCoRaHS: nothing collected;", "; ".join(errors), file=sys.stderr); return 1
    try:
        with open(OUT) as f: old = json.load(f).get("reports", [])
    except (OSError, ValueError):
        old = []
    cut = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=KEEP_DAYS)).strftime("%Y-%m-%dT%H:%MZ")
    merged = {(r["id"], r["t"][:10]): r for r in old if r["t"] >= cut}
    merged.update({(r["id"], r["t"][:10]): r for r in got})
    reports = sorted(merged.values(), key=lambda r: (r["t"], r["id"]))
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump({"source": "CoCoRaHS data export (cocorahs.org)", "updated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "errors": errors, "reports": reports}, f, separators=(",", ":"))
    print(f"CoCoRaHS: {len(got)} reports fetched, {len(reports)} kept" + (f"; errors: {errors}" if errors else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
