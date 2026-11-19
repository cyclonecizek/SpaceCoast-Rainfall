# Space Coast Rainfall — flood situational awareness

Static dashboard (no build step, no server). Open `index.html`, or publish the folder with GitHub Pages.

## Put it online (about 5 minutes)

1. Create a repository and upload everything in this folder (keep the `.github` folder).
2. **Settings → Pages → Build and deployment → Deploy from a branch → `main` / root.**
3. **Actions → Collect KSC rain gauges → Run workflow** once. After that it runs every 20 minutes and
   commits `data/ksc_rain.json`, which the page reads automatically.
   (If the repo is under an organization, make sure Actions has *Read and write* workflow permissions.)

## What loads from where

| Data | Source | Loaded by |
|---|---|---|
| MRMS radar rainfall (1 km) | NOAA Open Data bucket `noaa-mrms-pds` on AWS — GRIB2 decoded in the browser | browser |
| Airfield gauges (KTTS, KXMR, KCOF, KTIX, KMLB + every other ASOS/AWOS IEM lists inside the map box) | Iowa Environmental Mesonet `asos.py`; api.weather.gov fills any station IEM does not return | browser |
| KSC/CCSFS tipping-bucket gauges | Spaceport Weather Data Archive "Past 24 Hour" rainfall page | GitHub Action (the archive does not allow browser requests), or paste the table in the **Sources** tab |
| USGS precipitation gauges | USGS NWIS instantaneous values | browser |
| CoCoRaHS daily gauges | CoCoRaHS data export, six counties (GitHub Action → `data/cocorahs.json`); IEM daily summaries if that file is missing | Action, browser fallback |
| NWS COOP daily gauges | Iowa Environmental Mesonet daily summaries | browser |
| Flood watches / warnings | api.weather.gov | browser |

Any custom period works for MRMS and the airfield gauges straight away. KSC gauges cover whatever hours
have been collected. Three ways to get them:

1. **Collector (automatic)** — every 20 minutes the GitHub Action reads the archive's Past 24 Hour page for
   the newest hours and backfills anything older from the archive's *Search Rain Gauges* export (per-tip
   records summed to hours). By default it keeps the last 7 days complete.
2. **Any other period** — Actions → *Collect KSC rain gauges* → **Run workflow**, and enter start and end
   dates (UTC, `YYYY-MM-DD`). The hours are added to `data/ksc_rain.json` (120 days are kept). Then set the
   same period in the dashboard.
3. **Paste (manual)** — in the dashboard's Sources tab paste the Past 24 Hour page or a daily report.

Gauges with only part of the period are flagged and left out of maxima.

The Dark, Light and Voyager basemaps come from CARTO and use the API key set as `cartoKey` at the top of
`app.js` (CARTO watermarks tiles requested without one). OpenStreetMap and Esri imagery need no key. Leaflet
is bundled in `vendor/`. If a basemap is blocked on your network the page tries the others automatically.

## How totals are computed

- **MRMS**: the period is rounded to whole hours ending at the last available hour, then tiled with the fewest
  accumulation files (72/48/24/12/6/3/1 h). Product is chosen in the Sources tab; *Auto* tries Multi-sensor
  Pass 2, then Pass 1, then Radar-only for each file and tells you which it used.
- **METAR gauges**: hourly precipitation (`p01i`) is a running total that resets after each routine observation;
  finished hours contribute their peak, the hour in progress contributes its running value.
- **Daily gauges (CoCoRaHS, COOP)**: each report is a 24-hour total read around 7 AM. A report is counted when the
  middle of its 24 hours falls inside the selected period, so totals never match the period exactly. They are
  drawn as squares and left out of maxima, the gauge analysis and the radar comparison.
- **"Check gauge"**: a gauge reading 0.00" while MRMS over it or neighboring gauges show 0.75" or more.
  These are left out of maxima, the gauge analysis and the radar-vs-gauge bias (toggle in Sources).
- **Gauge analysis**: inverse-distance weighting, shown only within 10 km of a gauge.

## Things to check / edit

- Key-site coordinates (top of `app.js`, or the **Sources** tab) are approximate — the Morrell Operations
  Center position in particular should be confirmed.
- KSC rain-gauge positions assume each gauge sits at the same-numbered field-mill site.
- Station list, map extent and the Cape/KSC statistics box are in the `CFG`/`ASOS` blocks at the top of `app.js`.

## Tests

`node test/parsers.test.js` (parsers) · `python3 test/make_grib.py test/sample.grib2.gz && node test/grib.test.js`
(GRIB decoder vs ecCodes) · `python3 test/e2e.py` (headless browser with simulated feeds).
