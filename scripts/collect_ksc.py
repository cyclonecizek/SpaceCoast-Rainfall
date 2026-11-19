#!/usr/bin/env python3
"""Collect KSC/CCSFS rain-gauge hourly totals from the Spaceport Weather Data Archive
"Past 24 Hour" page and merge them into data/ksc_rain.json (hour start UTC -> gauge -> inches).

Older hours are backfilled from the archive's "Search Rain Gauges" export (one record per second/tip,
columns Date, Time, RainGauge, Inches), summed to hours. By default the last KSC_BACKFILL_DAYS (7) days;
set KSC_BACKFILL_START / KSC_BACKFILL_END (YYYY-MM-DD) to pull any other period. To change which gauges
are requested, put a different export link in data/ksc_export_example.txt.

Run on a schedule (see .github/workflows/ksc-rain.yml). Each run overlaps the previous 24 hours,
so the file grows into a continuous hourly record. Standard library only. TLS is always verified;
set SSL_CERT_FILE to a bundle that includes KSC's intermediate certificate (the workflow does this).
"""
import datetime as dt, html.parser, json, os, re, ssl, sys, urllib.request

URL = "https://kscweather.ksc.nasa.gov/wxarchive/Rainfall/Past24hr"
OUT = os.path.join(os.environ.get("DATA_DIR") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data"), "ksc_rain.json")
KEEP_DAYS = 120
MONTHS = {m: i + 1 for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split())}


class Rows(html.parser.HTMLParser):
    """Flatten the page to text and table rows."""
    def __init__(self):
        super().__init__(); self.rows = []; self.row = None; self.cell = None; self.text = []
    def handle_starttag(self, tag, attrs):
        if tag == "tr": self.row = []
        elif tag in ("td", "th") and self.row is not None: self.cell = []
    def handle_endtag(self, tag):
        if tag in ("td", "th") and self.cell is not None and self.row is not None:
            self.row.append(" ".join("".join(self.cell).split())); self.cell = None
        elif tag == "tr" and self.row is not None:
            self.rows.append(self.row); self.row = None
    def handle_data(self, data):
        self.text.append(data)
        if self.cell is not None: self.cell.append(data)


def parse(page, now=None):
    p = Rows(); p.feed(page)
    text = " ".join(" ".join(p.text).split())
    now = now or dt.datetime.now(dt.timezone.utc)
    m = re.search(r"as of\s+(\d{1,2})-([A-Za-z]{3})-(\d{4})\s+(\d{1,2}):(\d{2})", text, re.I)
    ref = dt.datetime(int(m[3]), MONTHS[m[2].lower()], int(m[1]), int(m[4]), int(m[5]), tzinfo=dt.timezone.utc) if m else now
    head = next((r for r in p.rows if r and r[0].strip().lower() == "gauge" and sum(bool(re.fullmatch(r"\d{1,2}:00", c)) for c in r) >= 2), None)
    if not head: raise ValueError("hourly header row not found - page layout may have changed")
    cols = [i for i, c in enumerate(head) if re.fullmatch(r"\d{1,2}:00", c)]
    hours = [int(head[i].split(":")[0]) for i in cols]
    last = ref.replace(minute=0, second=0, microsecond=0)
    for _ in range(24):
        if last.hour == hours[-1]: break
        last -= dt.timedelta(hours=1)
    hourly, n = {}, 0
    for r in p.rows:
        if not r or not re.fullmatch(r"\d{1,2}", r[0].strip()) or len(r) <= cols[-1]: continue
        try: vals = [float(r[i]) for i in cols]
        except ValueError: continue
        n += 1
        for k, v in enumerate(vals):
            t = last - dt.timedelta(hours=len(vals) - 1 - k)
            hourly.setdefault(t.strftime("%Y-%m-%dT%H:00Z"), {})[r[0].strip()] = v
    if not n: raise ValueError("no gauge rows found")
    return hourly, n, ref


ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz01234567"
EXAMPLE = os.path.join(os.path.dirname(OUT), "ksc_export_example.txt")
DEBUG = os.path.join(os.path.dirname(OUT), "ksc_export_debug.txt")
BACKFILL_DAYS = int(os.environ.get("KSC_BACKFILL_DAYS") or "7")
# Search Rain Gauges export, all gauges selected. Layout: <start token><end token><gauge list>.
DEFAULT_EXPORT = "https://kscweather.ksc.nasa.gov/wxarchive/Rainfall/Export/BaLSLStBaLTLStAABCEFGHIJKLMNOPQRSTUVWXYZabcdefghijkl"


def token(t):
    """Archive date token: B + year-2000, month, day, hour, minute, second, one character each."""
    return "B" + "".join(ALPHABET[n] for n in (t.year - 2000, t.month, t.day, t.hour, t.minute, t.second))


def export_url(example, a, b):
    m = re.match(r"(.*?/Export/)(B[A-Za-z0-7]{6})(B[A-Za-z0-7]{6})(.*)$", example.strip())
    if not m: raise ValueError("example link does not look like .../Export/<start><end><gauges>")
    return f"{m[1]}{token(a)}{token(b)}{m[4]}"


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "space-coast-rainfall-dashboard (GitHub Actions collector)", "Accept": "text/csv,text/plain,text/html,*/*"})
    with urllib.request.urlopen(req, timeout=240, context=ssl.create_default_context()) as r:
        return r.read().decode("utf-8", "replace")


def parse_export(text):
    """Export CSV -> {hour: {gauge: inches}}. Column names are detected, not assumed."""
    import csv, io
    rows = list(csv.reader(io.StringIO(text.lstrip("\ufeff"))))
    if not rows or text.lstrip().startswith("<"): raise ValueError("export did not return CSV")
    head = [h.strip() for h in rows[0]]; low = [h.lower() for h in head]
    def col(*pats, skip=()):
        for i, h in enumerate(low):
            if i not in skip and any(re.search(p, h) for p in pats): return i
        return None
    i_dt = col(r"date.*time", r"timestamp"); i_d = col(r"^date", r"date"); i_t = col(r"^time", r"time", skip=(i_d,) if i_d is not None else ())
    i_g = col(r"gauge", r"\brg\b", r"site", r"sensor", r"mill", r"station")
    i_v = col(r"rain", r"inch", r"amount", r"precip", r"total", r"tip", skip=tuple(x for x in (i_g, i_d, i_t, i_dt) if x is not None))
    if i_g is None or (i_dt is None and (i_d is None or i_t is None)): raise ValueError("unrecognised export columns: " + ", ".join(head))
    tips = i_v is None or "tip" in low[i_v]
    out, n = {}, 0
    for r in rows[1:]:
        try:
            stamp = r[i_dt] if i_dt is not None else r[i_d] + " " + r[i_t]
            stamp = stamp.strip().split(".")[0]
            for f in ("%m/%d/%Y %H:%M:%S", "%m/%d/%Y %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%m/%d/%y %H:%M:%S", "%d-%b-%Y %H:%M:%S", "%m/%d/%Y %I:%M:%S %p"):
                try: t = dt.datetime.strptime(stamp, f); break
                except ValueError: t = None
            g = re.search(r"(\d{1,2})", r[i_g]); v = 1.0 if i_v is None else float(r[i_v])
            if t is None or not g or v < 0: continue
            if tips: v *= 0.01          # each tip is 0.01 inch
            hour = out.setdefault(t.strftime("%Y-%m-%dT%H:00Z"), {}); gid = str(int(g[1])); hour[gid] = round(hour.get(gid, 0.0) + v, 4); n += 1
        except (IndexError, ValueError):
            continue
    return out, n, head


def backfill(store, done, notes):
    """Fill hours the Past-24-Hour page no longer shows, from the archive search export (per-tip records).
    Never overwrites hours already stored. Range: KSC_BACKFILL_START/END (YYYY-MM-DD, UTC) or the last KSC_BACKFILL_DAYS."""
    try: example = open(EXAMPLE).read().strip() or DEFAULT_EXPORT
    except OSError: example = DEFAULT_EXPORT
    now = dt.datetime.now(dt.timezone.utc).replace(minute=0, second=0, microsecond=0, tzinfo=None)
    s, e = os.environ.get("KSC_BACKFILL_START", "").strip(), os.environ.get("KSC_BACKFILL_END", "").strip()
    start = dt.datetime.strptime(s, "%Y-%m-%d") if s else now - dt.timedelta(days=BACKFILL_DAYS)
    end = min(dt.datetime.strptime(e, "%Y-%m-%d") + dt.timedelta(days=1) if e else now, now)   # current hour comes from the Past-24-Hour page
    gauges = {g for h in store.values() for g in h}
    key = lambda t: t.strftime("%Y-%m-%dT%H:00Z")
    a = start
    while a < end:
        b = min(a + dt.timedelta(days=2), end)          # archive allows 7 days per search; 2 keeps downloads small
        hours = [a + dt.timedelta(hours=i) for i in range(int((b - a).total_seconds() // 3600))]
        if any(key(t) not in store for t in hours):
            text = ""
            try:
                text = fetch(export_url(example, a, b)); hourly, n, head = parse_export(text)
            except Exception as ex:
                notes.append(f"backfill {a:%Y-%m-%d %H}Z-{b:%Y-%m-%d %H}Z failed: {ex}")
                try:
                    with open(DEBUG, "w") as f: f.write(f"{a} to {b}\n{ex}\n\n{text[:3000]}")
                except OSError: pass
                return
            gauges |= {g for h in hourly.values() for g in h}
            for t in hours:                               # an hour with no tips is a dry hour
                if key(t) not in store: store[key(t)] = {g: round(hourly.get(key(t), {}).get(g, 0.0), 2) for g in gauges}
            done.append(f"{a:%Y-%m-%dT%H}/{b:%Y-%m-%dT%H}"); notes.append(f"backfill {a:%Y-%m-%d %H}Z-{b:%Y-%m-%d %H}Z: {n} records")
        a = b


def main():
    req = urllib.request.Request(URL, headers={"User-Agent": "space-coast-rainfall-dashboard (GitHub Actions collector)", "Accept": "text/html"})
    with urllib.request.urlopen(req, timeout=60, context=ssl.create_default_context()) as r:
        page = r.read().decode("utf-8", "replace")
    hourly, n, ref = parse(page)
    try:
        with open(OUT) as f: doc = json.load(f)
    except (OSError, ValueError):
        doc = {}
    store = doc.get("hourly", {})
    for k, v in hourly.items(): store.setdefault(k, {}).update(v)   # newer scrape wins; the current hour keeps growing
    done, notes = doc.get("backfilled", [])[-60:], []
    backfill(store, done, notes)
    cut = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=KEEP_DAYS)).strftime("%Y-%m-%dT%H:00Z")
    store = {k: store[k] for k in sorted(store) if k >= cut}
    out = {"source": URL, "units": "inches per hour; key = hour start (UTC)", "updated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "page_as_of": ref.strftime("%Y-%m-%dT%H:%MZ"), "backfilled": done, "notes": notes, "hourly": store}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f: json.dump(out, f, separators=(",", ":"))
    print(f"{n} gauges, page as of {ref:%Y-%m-%d %H:%MZ}; file now holds {len(store)} hours")
    for x in notes: print(x)


if __name__ == "__main__":
    try: main()
    except Exception as e:  # leave the existing file untouched on any failure
        print("KSC collection failed:", e, file=sys.stderr); sys.exit(1)
