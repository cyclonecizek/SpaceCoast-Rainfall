#!/usr/bin/env python3
"""Collect KSC/CCSFS rain-gauge hourly totals from the Spaceport Weather Data Archive
"Past 24 Hour" page and merge them into data/ksc_rain.json (hour start UTC -> gauge -> inches).

Run on a schedule (see .github/workflows/ksc-rain.yml). Each run overlaps the previous 24 hours,
so the file grows into a continuous hourly record. Standard library only. TLS is always verified;
set SSL_CERT_FILE to a bundle that includes KSC's intermediate certificate (the workflow does this).
"""
import datetime as dt, html.parser, json, os, re, ssl, sys, urllib.request

URL = "https://kscweather.ksc.nasa.gov/wxarchive/Rainfall/Past24hr"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "ksc_rain.json")
KEEP_DAYS = 45
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
    cut = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=KEEP_DAYS)).strftime("%Y-%m-%dT%H:00Z")
    store = {k: store[k] for k in sorted(store) if k >= cut}
    out = {"source": URL, "units": "inches per hour; key = hour start (UTC)", "updated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "page_as_of": ref.strftime("%Y-%m-%dT%H:%MZ"), "hourly": store}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f: json.dump(out, f, separators=(",", ":"))
    print(f"{n} gauges, page as of {ref:%Y-%m-%d %H:%MZ}; file now holds {len(store)} hours")


if __name__ == "__main__":
    try: main()
    except Exception as e:  # leave the existing file untouched on any failure
        print("KSC collection failed:", e, file=sys.stderr); sys.exit(1)
