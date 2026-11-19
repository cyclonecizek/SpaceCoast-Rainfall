/* Space Coast Rainfall — flood situational awareness dashboard.
   Everything runs in the browser except the KSC rain-gauge collector (GitHub Action -> data/ksc_rain.json). */
'use strict';

/* ───────────────────────── configuration (edit here) ───────────────────────── */
const CFG = {
  box: { s: 27.30, n: 29.50, w: -81.70, e: -79.90 },          // MRMS crop / regional view
  cape: { s: 28.38, n: 28.82, w: -80.86, e: -80.48 },          // "Cape/KSC" statistics box
  mrmsBucket: 'https://noaa-mrms-pds.s3.amazonaws.com/',
  mrmsProducts: {                                               // tried in this order when product = auto
    pass2: h => `MultiSensor_QPE_${h}H_Pass2_00.00`,
    pass1: h => `MultiSensor_QPE_${h}H_Pass1_00.00`,
    radar: h => `RadarOnly_QPE_${h}H_00.00`,
  },
  iem: 'https://mesonet.agron.iastate.edu/',
  nws: 'https://api.weather.gov/',
  usgs: 'https://waterservices.usgs.gov/nwis/iv/',
  cartoKey: 'cb1_4mcb_1_ac7cc0264756a5776d9ea703',            // CARTO basemap key (free; request at carto.com/basemaps/apikey)
  dataRepo: 'cyclonecizek/SpaceCoast-Rainfall',                // collector commits to this repo's "data" branch
  kscJson: 'data/ksc_rain.json',
  cocoJson: 'data/cocorahs.json',
  dailyNets: [['CoCoRaHS', ['FL_COCORAHS', 'FLCOCORAHS']], ['COOP', ['FL_COOP']]],   // IEM network ids tried in order
  kscPage: 'https://kscweather.ksc.nasa.gov/wxarchive/Rainfall/Past24hr',
  alertCounties: /Brevard|Volusia|Indian River|Orange|Seminole|Osceola/i,
  alertEvents: /Flood|Hydrologic|Storm Surge|Tropical|Hurricane|Severe Thunderstorm|Tornado|Special Weather/i,
};
// [IEM id, name, lat, lon, key site?]
const ASOS = [
  ['TTS', 'KTTS · Shuttle Landing Facility', 28.6150, -80.6945, 1], ['XMR', 'KXMR · Cape Skid Strip', 28.4676, -80.5666, 1],
  ['COF', 'KCOF · Patrick SFB', 28.2349, -80.6101, 1], ['TIX', 'KTIX · Space Coast Regional', 28.5148, -80.7992, 1],
  ['MLB', 'KMLB · Melbourne', 28.1028, -80.6453, 1], ['COI', 'KCOI · Merritt Island', 28.3416, -80.6855, 0],
  ['VRB', 'KVRB · Vero Beach', 27.6556, -80.4179, 0], ['FPR', 'KFPR · Fort Pierce', 27.4951, -80.3683, 0],
  ['DAB', 'KDAB · Daytona Beach', 29.1799, -81.0581, 0], ['EVB', 'KEVB · New Smyrna Beach', 29.0557, -80.9489, 0],
  ['SFB', 'KSFB · Sanford', 28.7776, -81.2375, 0], ['MCO', 'KMCO · Orlando Intl', 28.4294, -81.3090, 0],
  ['ORL', 'KORL · Orlando Executive', 28.5455, -81.3329, 0], ['ISM', 'KISM · Kissimmee', 28.2898, -81.4371, 0],
  ['DED', 'KDED · DeLand', 29.0670, -81.2837, 0],
];
// KSC/CCSFS tipping-bucket gauges are collocated with the LPLWS field mills (coordinates from the WINDS/EFM placefile repos).
const KSC_RG = {1:[28.70363,-80.66857],2:[28.68755,-80.71951],4:[28.66433,-80.63913],5:[28.65818,-80.69936],6:[28.64397,-80.66639],7:[28.64238,-80.74762],8:[28.63888,-80.62254],9:[28.62142,-80.60797],10:[28.62412,-80.70151],11:[28.60576,-80.67387],12:[28.60226,-80.64094],13:[28.60205,-80.58942],14:[28.57852,-80.60859],15:[28.57676,-80.64310],16:[28.57530,-80.57311],17:[28.56205,-80.67003],18:[28.55518,-80.70212],19:[28.54948,-80.62039],20:[28.54170,-80.64443],21:[28.52575,-80.62210],22:[28.50693,-80.69359],24:[28.47859,-80.67487],25:[28.42474,-80.66380],26:[28.54938,-80.56699],27:[28.50308,-80.55812],28:[28.46024,-80.52722],29:[28.46256,-80.58356],30:[28.47511,-80.55842],31:[28.42033,-80.59116],32:[28.43688,-80.58010],33:[28.41532,-80.60582],34:[28.44982,-80.56350],35:[28.60205,-80.58942]};
// Key sites for the briefing table. Editable in the Sources tab (saved in this browser).
const POI_DEFAULT = [
  ['LC-39A', 'pad', 28.6083, -80.6041], ['LC-39B', 'pad', 28.6272, -80.6208], ['SLC-41', 'pad', 28.5833, -80.5829],
  ['SLC-40', 'pad', 28.5620, -80.5772], ['SLC-37', 'pad', 28.5316, -80.5650], ['SLC-20', 'pad', 28.5122, -80.5567],
  ['SLC-16', 'pad', 28.5017, -80.5518], ['LC-13 / LZ-1', 'pad', 28.4858, -80.5444], ['LC-36', 'pad', 28.4716, -80.5378],
  ['SLC-46', 'pad', 28.4585, -80.5284],
  ['SLF (KTTS)', 'air', 28.6150, -80.6945], ['Skid Strip (KXMR)', 'air', 28.4676, -80.5666], ['Patrick SFB (KCOF)', 'air', 28.2349, -80.6101],
  ['Space Coast Rgnl (KTIX)', 'air', 28.5148, -80.7992], ['Melbourne (KMLB)', 'air', 28.1028, -80.6453], ['Merritt Island (KCOI)', 'air', 28.3416, -80.6855],
  ['Morrell Operations Center', 'ops', 28.4887, -80.5775], ['VAB / LCC', 'ops', 28.5861, -80.6513],
];
const POI_KIND = { pad: 'Launch pads', air: 'Airfields', ops: 'Operations' };
const LEVELS = [0.01, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 15, 20];
const COLORS = ['#cfe8f6', '#9dd0ef', '#5fb0e6', '#2e86d1', '#1e5fae', '#2fb463', '#1e8f48', '#f2e34c', '#f5c02e', '#f39a26', '#ee6a22', '#e03a1f', '#b81c2c', '#d63fb0', '#a23bd0', '#6d34b8', '#f4d9ff'];
const DLEVELS = [-3, -2, -1, -0.5, -0.25, 0.25, 0.5, 1, 2, 3];   // MRMS minus gauges, inches
const DCOLORS = ['#7a4a12', '#a8691f', '#cf9440', '#e3bd7c', '#f0dcb8', '#9aa3ad', '#b5e0dc', '#77c4bd', '#3aa39b', '#147f78', '#075e59'];
const PRESETS = [6, 12, 24, 48, 72, 168];
const H = 3600000, MM = 1 / 25.4;

/* ───────────────────────── small helpers ───────────────────────── */
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fin = v => (v == null || !isFinite(v)) ? '—' : v.toFixed(2);
const store = { get(k, d) { try { const v = localStorage.getItem('scr.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('scr.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } } };
const km = (a, b, c, d) => { const x = (d - b) * Math.cos((a + c) * Math.PI / 360) * 111.195, y = (c - a) * 111.195; return Math.hypot(x, y); };
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const RGB = COLORS.map(hex), DRGB = DCOLORS.map(hex);
function levelIdx(v, L) { let k = -1; for (let i = 0; i < L.length; i++) { if (v >= L[i]) k = i; else break; } return k; }
const colorFor = v => { const k = levelIdx(v, LEVELS); return k < 0 ? null : COLORS[k]; };
const inkFor = c => { if (!c) return '#fff'; const [r, g, b] = hex(c); return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#0b0b0b' : '#fff'; };
function tzOff(ms, tz) { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }).formatToParts(ms).map(x => [x.type, +x.value])); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(ms / 60000) * 60000; }
const TZ = { UTC: 'UTC', ET: 'America/New_York' };
function fmt(ms, tz = S.tz, withDate = true) {
  const d = new Date(ms + (tz === 'UTC' ? 0 : tzOff(ms, TZ.ET))), mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  const hm = String(d.getUTCHours()).padStart(2, '0') + String(d.getUTCMinutes()).padStart(2, '0');
  const z = tz === 'UTC' ? 'Z' : (tzOff(ms, TZ.ET) === -4 * H ? ' EDT' : ' EST');
  return (withDate ? `${d.getUTCDate()} ${mon} ` : '') + hm + z;
}
const toInput = (ms, tz) => new Date(ms + (tz === 'UTC' ? 0 : tzOff(ms, TZ.ET))).toISOString().slice(0, 16);
function fromInput(v, tz) { const g = Date.parse(v + ':00Z'); if (!isFinite(g)) return NaN; if (tz === 'UTC') return g; let ms = g - tzOff(g, TZ.ET); return g - tzOff(ms, TZ.ET); }
const ymd = ms => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');

/* ───────────────────────── state ───────────────────────── */
const S = {
  tz: store.get('tz', 'UTC'), preset: store.get('preset', 24), a: 0, b: 0,
  product: store.get('product', 'auto'), gauges: new Map(), mrms: null, hourly: null, idw: null, diff: null,
  alerts: [], src: {}, sel: store.get('sel', null), poi: store.get('poi', null) || POI_DEFAULT, excludeSuspect: true, loadId: 0, loadedAt: 0,
  kscLocal: store.get('ksc', {}), tl: -1,
  nets: Object.assign({ ASOS: true, KSC: true, USGS: true, DAILY: true }, store.get('nets', {})), kinds: Object.assign({ pad: true, air: true, ops: true }, store.get('kinds', {})),
};
const SRC = { iem: 'ASOS/AWOS gauges (Iowa Environmental Mesonet)', nws: 'ASOS/AWOS backup (api.weather.gov)', ksc: 'KSC/CCSFS rain gauges (Spaceport Weather Archive)', usgs: 'USGS precipitation gauges', daily: 'CoCoRaHS and NWS COOP daily gauges', mrms: 'MRMS radar rainfall (NOAA Open Data, AWS)', alerts: 'NWS watches / warnings / advisories' };
function setSrc(k, state, detail, url) { S.src[k] = { state, detail, url, t: Date.now() }; renderSources(); }

async function getText(url, ms = 30000) { const r = await fetch(url, { signal: AbortSignal.timeout(ms), cache: 'no-store' }); if (!r.ok) throw Error('HTTP ' + r.status); return r.text(); }
async function getJson(url, ms = 30000, headers) { const r = await fetch(url, { signal: AbortSignal.timeout(ms), headers }); if (!r.ok) throw Error('HTTP ' + r.status); return r.json(); }

/* ───────────────────────── gauges ───────────────────────── */
/* METAR hourly precip is a running total that resets after each routine observation.
   Convert it to a cumulative series: finished hours add their peak, the current hour adds its running value. */
function cumulativeFromMetar(obs) {
  obs = obs.filter(o => isFinite(o.t)).sort((x, y) => x.t - y.t); if (!obs.length) return [];
  const cnt = new Array(60).fill(0); for (const o of obs) cnt[new Date(o.t).getUTCMinutes()]++;
  let m = 53, best = 0; for (let i = 45; i < 60; i++) if (cnt[i] > best) { best = cnt[i]; m = i; }
  const edge = (m + 4) * 60000;            // obs up to 4 min after the usual routine minute still close out that hour
  const cyc = t => Math.ceil((t - edge) / H);
  const out = []; let base = 0, cur = cyc(obs[0].t), peak = 0;
  for (const o of obs) { const c = cyc(o.t); if (c !== cur) { base += peak; peak = 0; cur = c; } if (o.p > peak) peak = o.p; out.push({ t: o.t, c: base + peak }); }
  return out;
}
function cumAt(series, t) { let v = null; for (const p of series) { if (p.t <= t) v = p.c; else break; } return v; }
function addGauge(g) { g.series = g.series || []; S.gauges.set(g.id, g); }

const inBox = (lat, lon) => lat >= CFG.box.s && lat <= CFG.box.n && lon >= CFG.box.w && lon <= CFG.box.e;
let asosList = ASOS;
/* Every ASOS/AWOS site IEM knows inside the map box, so nothing in the area is missed. Falls back to the built-in list. */
async function findAsos() {
  if (asosList !== ASOS) return;
  try {
    const j = await getJson(CFG.iem + 'geojson/network.py?network=FL_ASOS', 20000), known = new Map(ASOS.map(s => [s[0], s])), out = ASOS.slice();
    for (const f of j.features || []) { const [lon, lat] = f.geometry.coordinates, id = f.properties.sid || f.id; if (!id || known.has(id) || !inBox(lat, lon) || f.properties.online === false) continue; out.push([id, `K${id} · ${String(f.properties.sname || '').replace(/\b(\w)(\w*)/g, (m, x, y) => x + y.toLowerCase())}`, lat, lon, 0]); }
    asosList = out;
  } catch (e) { /* keep the built-in list */ }
}
async function loadIEM(a, b) {
  await findAsos(); const ASOS = asosList;
  const A = new Date(a - 3 * H), B = new Date(b + H), q = new URLSearchParams();
  ASOS.forEach(s => q.append('station', s[0]));
  for (const [k, v] of [['data', 'p01i'], ['year1', A.getUTCFullYear()], ['month1', A.getUTCMonth() + 1], ['day1', A.getUTCDate()], ['hour1', A.getUTCHours()], ['minute1', 0], ['year2', B.getUTCFullYear()], ['month2', B.getUTCMonth() + 1], ['day2', B.getUTCDate()], ['hour2', B.getUTCHours()], ['minute2', 59], ['tz', 'Etc/UTC'], ['format', 'onlycomma'], ['latlon', 'no'], ['missing', 'M'], ['trace', 'T'], ['direct', 'no']]) q.append(k, v);
  q.append('report_type', 3); q.append('report_type', 4);
  const url = CFG.iem + 'cgi-bin/request/asos.py?' + q;
  setSrc('iem', 'load', 'Requesting…', url);
  const by = parseIemCsv(await getText(url, 45000));
  let n = 0;
  for (const s of ASOS) { const obs = by[s[0]]; if (!obs || !obs.length) continue; n++; addGauge({ id: 'K' + s[0], name: s[1], lat: s[2], lon: s[3], net: 'ASOS', key: !!s[4], src: 'IEM', series: cumulativeFromMetar(obs), nobs: obs.length }); }
  setSrc('iem', n ? 'ok' : 'warn', `${n} of ${ASOS.length} stations returned observations`, url);
  return n;
}
function parseIemCsv(text) {
  const lines = text.trim().split(/\r?\n/), head = (lines.shift() || '').split(','), is = head.indexOf('station'), iv = head.indexOf('valid'), ip = head.indexOf('p01i');
  if (is < 0 || iv < 0 || ip < 0) throw Error('Unexpected response format');
  const by = {};
  for (const ln of lines) { const c = ln.split(','), t = Date.parse(c[iv].replace(' ', 'T') + ':00Z'); if (!isFinite(t)) continue; const raw = c[ip], p = raw === 'T' ? 0 : raw === 'M' || raw === '' ? 0 : +raw; (by[c[is]] = by[c[is]] || []).push({ t, p: isFinite(p) ? p : 0 }); }
  return by;
}
async function loadNWS(a, b, ids) {
  setSrc('nws', 'load', `Requesting ${ids.length} stations…`);
  let n = 0; const errs = [];
  await Promise.all(ids.map(async s => {
    const url = `${CFG.nws}stations/K${s[0]}/observations?start=${new Date(a - 3 * H).toISOString().slice(0, 19)}Z&end=${new Date(b + H).toISOString().slice(0, 19)}Z&limit=500`;
    try {
      const j = await getJson(url, 30000, { Accept: 'application/geo+json' });
      const obs = (j.features || []).map(f => ({ t: Date.parse(f.properties.timestamp), p: ((f.properties.precipitationLastHour || {}).value || 0) * MM }));
      if (obs.length) { n++; addGauge({ id: 'K' + s[0], name: s[1], lat: s[2], lon: s[3], net: 'ASOS', key: !!s[4], src: 'NWS API', series: cumulativeFromMetar(obs), nobs: obs.length }); }
    } catch (e) { errs.push('K' + s[0] + ': ' + e.message); }
  }));
  setSrc('nws', n ? 'ok' : 'err', `${n} of ${ids.length} stations filled from api.weather.gov` + (errs.length ? ` · ${errs.slice(0, 3).join('; ')}` : ''), CFG.nws + 'stations/KMLB/observations');
}
/* KSC archive hourly table -> {isoHourStart: {gaugeId: inches}} */
function parseKscTable(text, nowMs = Date.now()) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let asof = null; const m = /as of\s+(\d{1,2})-([A-Za-z]{3})-(\d{4})\s+(\d{1,2}):(\d{2})/i.exec(text);
  if (m) asof = Date.parse(`${m[1]} ${m[2]} ${m[3]} ${m[4]}:${m[5]}:00 UTC`);
  const hi = lines.findIndex(l => /^\|?\s*Gauge\b/i.test(l) && /\d{1,2}:00/.test(l)); if (hi < 0) throw Error('Could not find the "Gauge 11:00 12:00 …" header row.');
  const split = l => l.replace(/^\||\|$/g, '').split(/\s*\|\s*|\t+|\s{1,}/).map(x => x.trim()).filter(x => x !== '');
  const hours = split(lines[hi]).filter(x => /^\d{1,2}:00$/.test(x)).map(x => +x.split(':')[0]);
  if (hours.length < 2) throw Error('No hourly columns found.');
  // last column = most recent occurrence of that clock hour at or before "as of" (or now)
  const ref = asof || nowMs; let last = Math.floor(ref / H) * H; while (new Date(last).getUTCHours() !== hours[hours.length - 1]) last -= H;
  if (!asof) {   // "rainfall for a specific date" report: one calendar day, 00:00 … 23:00, date printed on the page
    const days = new Set(); let d;
    const r1 = /\b(\d{1,2})-([A-Za-z]{3})-(\d{4})\b/g, r2 = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g;
    while ((d = r1.exec(text))) { const t = Date.parse(`${d[1]} ${d[2]} ${d[3]} 00:00:00 UTC`); if (isFinite(t)) days.add(t); }
    while ((d = r2.exec(text))) { const t = Date.UTC(+d[3], +d[1] - 1, +d[2]); if (isFinite(t)) days.add(t); }
    const cand = [...days].filter(t => t <= nowMs && t > nowMs - 400 * 24 * H);
    if (hours[0] === 0 && hours.length === 24 && cand.length === 1) last = cand[0] + 23 * H;
    else if (hours[0] === 0 && hours.length === 24 && cand.length > 1) throw Error('Found more than one date in the pasted text — paste one daily report at a time.');
  }
  const out = {}; let rows = 0;
  for (const l of lines.slice(hi + 1)) {
    const c = split(l); if (!/^\d{1,2}$/.test(c[0])) continue; const vals = c.slice(1, 1 + hours.length).map(Number); if (vals.length < hours.length || vals.some(v => !isFinite(v))) continue; rows++;
    vals.forEach((v, i) => { const k = new Date(last - (hours.length - 1 - i) * H).toISOString().slice(0, 13) + ':00Z'; (out[k] = out[k] || {})[c[0]] = v; });
  }
  if (!rows) throw Error('No gauge rows found under the header.');
  return { hourly: out, rows, asof: asof || null, first: last - (hours.length - 1) * H, last };
}
/* Collector files: prefer the live "data" branch (updated every 5 minutes), fall back to the copy published with the site. */
async function collectorJson(name, localPath) {
  const urls = [`https://raw.githubusercontent.com/${CFG.dataRepo}/data/${name}?t=${Math.floor(Date.now() / 120000)}`, `${localPath}?t=${Math.floor(Date.now() / 60000)}`];
  const got = (await Promise.allSettled(urls.map(u => getJson(u, 15000)))).filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
  if (!got.length) throw Error('not found');
  return got.sort((x, y) => Date.parse(y.updated || 0) - Date.parse(x.updated || 0))[0];
}
async function loadKSC() {
  let remote = {}, note = '';
  let age = null;
  try { const j = await collectorJson('ksc_rain.json', CFG.kscJson); remote = j.hourly || {}; age = j.updated ? (Date.now() - Date.parse(j.updated)) / 60000 : null; note = `collector last ran ${j.updated ? fmt(Date.parse(j.updated)) : 'unknown'}${j.page_as_of ? `, archive page as of ${fmt(Date.parse(j.page_as_of))}` : ''}`; }
  catch (e) { note = 'collector file not found (' + e.message + ')'; }
  const merged = {}; for (const src of [S.kscLocal, remote]) for (const k in src) merged[k] = Object.assign(merged[k] || {}, src[k]);
  const hours = Object.keys(merged).sort(); if (!hours.length) { setSrc('ksc', 'warn', `No KSC gauge data yet — ${note}. Paste the archive table below, or enable the collector.`, CFG.kscPage); return; }
  const ids = new Set(); hours.forEach(h => Object.keys(merged[h]).forEach(i => ids.add(i)));
  for (const id of ids) {
    const ll = KSC_RG[+id]; if (!ll) continue; let c = 0; const series = [];
    for (const h of hours) { const v = merged[h][id]; if (v == null) continue; const t = Date.parse(h); if (!series.length) series.push({ t, c: 0 }); c += v; series.push({ t: t + H, c }); }
    addGauge({ id: 'RG' + String(id).padStart(2, '0'), name: `KSC rain gauge ${id}`, lat: ll[0], lon: ll[1], net: 'KSC', src: 'KSC archive', series, hourly: true });
  }
  S.kscAge = age; const late = age != null && age > 40;
  setSrc('ksc', late ? 'warn' : 'ok', `${late ? `Collector has not updated for ${age >= 120 ? (age / 60).toFixed(1) + ' h' : Math.round(age) + ' min'} — check the Actions tab. ` : ''}${ids.size} gauges · hourly data ${fmt(Date.parse(hours[0]))} → ${fmt(Date.parse(hours[hours.length - 1]) + H)} · ${note}`, CFG.kscPage);
}
async function loadUSGS(a, b) {
  const bx = CFG.box, url = `${CFG.usgs}?format=json&bBox=${bx.w.toFixed(3)},${bx.s.toFixed(3)},${bx.e.toFixed(3)},${bx.n.toFixed(3)}&parameterCd=00045&startDT=${new Date(a - H).toISOString().slice(0, 16)}Z&endDT=${new Date(b).toISOString().slice(0, 16)}Z&siteStatus=active`;
  setSrc('usgs', 'load', 'Requesting…', url);
  const j = await getJson(url, 45000); let n = 0;
  for (const ts of (j.value && j.value.timeSeries) || []) {
    const si = ts.sourceInfo, g = si.geoLocation.geogLocation, vals = (ts.values[0] || {}).value || []; let c = 0; const series = [];
    for (const v of vals) { const x = +v.value, t = Date.parse(v.dateTime); if (!isFinite(t) || !isFinite(x) || x < 0) continue; c += x; series.push({ t, c }); }
    if (series.length < 2) continue; n++;
    addGauge({ id: 'USGS-' + si.siteCode[0].value, name: 'USGS ' + si.siteName.replace(/\s+/g, ' '), lat: g.latitude, lon: g.longitude, net: 'USGS', src: 'USGS NWIS', series });
  }
  setSrc('usgs', n ? 'ok' : 'warn', `${n} precipitation gauges in the region`, url);
}
/* Once-a-day manual gauges. Each report is a 24-hour total read at about 7 AM local; it is credited at the reading time. */
function addDaily(id, name, lat, lon, net, reports) {
  reports = reports.filter(r => isFinite(r.t) && isFinite(r.v) && r.v >= 0).sort((x, y) => x.t - y.t); if (!reports.length) return 0;
  let c = 0; const series = reports.map(r => ({ t: r.t, c: (c += r.v) }));
  addGauge({ id, name, lat, lon, net: 'DAILY', sub: net, src: net, daily: true, series, reports }); return 1;
}
async function loadDaily(a, b) {
  setSrc('daily', 'load', 'Requesting…'); const day = t => new Date(t).toISOString().slice(0, 10), notes = []; let url = '', total = 0;
  // 1) CoCoRaHS reports gathered by the collector (exact reading times)
  let haveCoco = false;
  try {
    const j = await collectorJson('cocorahs.json', CFG.cocoJson), by = {};
    for (const r of j.reports || []) { const t = Date.parse(r.t); if (t < a - 26 * H || t > b + H || !inBox(r.lat, r.lon)) continue; (by[r.id] = by[r.id] || { r, list: [] }).list.push({ t, v: r.in }); }
    let n = 0; for (const id in by) n += addDaily(id, `CoCoRaHS ${by[id].r.name || id}`, by[id].r.lat, by[id].r.lon, 'CoCoRaHS', by[id].list);
    if (n) { haveCoco = true; total += n; notes.push(`CoCoRaHS ${n} stations (collector, updated ${j.updated ? fmt(Date.parse(j.updated)) : '?'})`); }
  } catch (e) { /* no collector file yet */ }
  // 2) IEM daily summaries for CoCoRaHS (if the collector had nothing) and NWS COOP
  for (const [label, ids] of CFG.dailyNets) {
    if (label === 'CoCoRaHS' && haveCoco) continue; let got = 0, err = '';
    for (const net of ids) {
      try {
        const meta = await getJson(`${CFG.iem}geojson/network.py?network=${net}`, 30000), st = new Map();
        for (const f of meta.features || []) { const [lon, lat] = f.geometry.coordinates; if (inBox(lat, lon)) st.set(f.properties.sid || f.id, { name: f.properties.sname || '', lat, lon }); }
        if (!st.size) { err = `${net}: no stations in the area`; continue; }
        url = `${CFG.iem}cgi-bin/request/daily.py?network=${net}&stations=${[...st.keys()].slice(0, 400).join(',')}&sts=${day(a - 24 * H)}&ets=${day(b)}&var=precip_in&format=csv&na=M`;
        const lines = (await getText(url, 45000)).trim().split(/\r?\n/), head = lines.shift().split(','), is = head.indexOf('station'), id2 = head.indexOf('day'), ip = head.indexOf('precip_in');
        if (is < 0 || id2 < 0 || ip < 0) { err = `${net}: unexpected columns (${head.join(',').slice(0, 80)})`; continue; }
        const by = {}; for (const ln of lines) { const c = ln.split(','), v = c[ip] === 'T' ? 0 : +c[ip], t = Date.parse(c[id2] + 'T12:00:00Z'); if (c[ip] === 'M' || c[ip] === '' || !isFinite(v)) continue; (by[c[is]] = by[c[is]] || []).push({ t, v }); }
        for (const sid in by) { const m = st.get(sid); if (m) got += addDaily(`${label === 'COOP' ? 'COOP' : 'CoCo'}-${sid}`, `${label} ${m.name.replace(/\b(\w)(\w*)/g, (x, p, r) => p + r.toLowerCase())}`, m.lat, m.lon, label, by[sid].filter(r => r.t >= a - 26 * H)); }
        if (got) break; err = `${net}: no reports in the period`;
      } catch (e) { err = `${net}: ${e.message}`; }
    }
    total += got; notes.push(got ? `${label} ${got} stations (IEM)` : `${label} unavailable (${err})`);
  }
  setSrc('daily', total ? 'ok' : 'warn', notes.join(' · ') + (total ? ' · 24-hour totals read about 7 AM, so they never line up exactly with the selected period' : ''), url || CFG.iem + 'request/daily.phtml');
}
function computeGaugeTotals() {
  const { a, b } = S;
  for (const g of S.gauges.values()) {
    const s = g.series; g.flags = []; g.total = null; g.last1 = null; if (!s.length) continue;
    // a daily report counts when the middle of its 24 hours falls inside the period
    if (g.daily) { const rs = g.reports.filter(r => r.t - 12 * H >= a && r.t - 12 * H <= b); if (!rs.length) continue; g.total = rs.reduce((x, r) => x + r.v, 0); g.first = rs[0].t - 24 * H; g.lastT = rs[rs.length - 1].t;
      g.flags.push({ k: 'daily', t: `${rs.length} daily report${rs.length > 1 ? 's' : ''} covering about ${fmt(g.first)} → ${fmt(g.lastT)}, not the exact period` }); continue; }
    const c0 = cumAt(s, a), c1 = cumAt(s, b); if (c1 == null) continue;
    g.total = c1 - (c0 == null ? 0 : c0);
    const cH = cumAt(s, b - H); g.last1 = c1 - (cH == null ? (c0 || 0) : Math.max(cH, c0 || 0));
    g.first = s[0].t; g.lastT = s[s.length - 1].t;
    if (g.first > a + 80 * 60000) g.flags.push({ k: 'partial', t: `Data starts ${fmt(g.first)} — total covers only part of the period` });
    if (g.lastT < Math.min(b, Date.now()) - 2.6 * H) g.flags.push({ k: 'stale', t: `Last report ${fmt(g.lastT)}` });
  }
}
function qcGauges() {
  const gs = [...S.gauges.values()].filter(g => g.total != null);
  for (const g of gs) {
    g.mrms = S.mrms ? sample(S.mrms.grid, g.lat, g.lon) : null; g.cmp = g.total;
    if (g.daily) { g.suspect = false; g.cmp = null; continue; }
    if (S.mrms) { const c1 = cumAt(g.series, S.mrms.b), c0 = cumAt(g.series, S.mrms.a); g.cmp = c1 == null ? null : c1 - (c0 || 0); }
    const near = gs.filter(o => o !== g && !o.daily && o.total >= 0.02 && km(g.lat, g.lon, o.lat, o.lon) < 12).map(o => o.total).sort((x, y) => x - y);
    const med = near.length >= 2 ? near[near.length >> 1] : null;
    g.suspect = Math.max(g.total, g.cmp || 0) < 0.02 && ((g.mrms != null && g.mrms >= 0.75) || (med != null && med >= 0.75));
    if (g.suspect) g.flags.push({ k: 'suspect', t: `Reports ${g.total.toFixed(2)}" while ${g.mrms != null ? `radar estimates ${g.mrms.toFixed(2)}"` : ''}${med != null ? ` nearby gauges have ~${med.toFixed(2)}"` : ''} — likely not reporting` });
  }
}
const goodGauges = () => [...S.gauges.values()].filter(g => S.nets[g.net] && g.total != null && !(S.excludeSuspect && g.suspect));
const shownPoi = () => S.poi.filter(p => S.kinds[p[1]]);
const fullGauges = () => goodGauges().filter(g => !g.flags.some(f => f.k === 'partial' || f.k === 'daily'));

/* ───────────────────────── MRMS ───────────────────────── */
const gridCache = new Map();
async function fetchMrmsFile(endMs, hours, products) {
  const d = new Date(endMs), day = ymd(endMs), hh = String(d.getUTCHours()).padStart(2, '0'); let lastErr = 'not found';
  for (const p of products) {
    const name = CFG.mrmsProducts[p](String(hours).padStart(2, '0')), key = `CONUS/${name}/${day}/MRMS_${name}_${day}-${hh}0000.grib2.gz`;
    if (gridCache.has(key)) return gridCache.get(key);
    try {
      const r = await fetch(CFG.mrmsBucket + key, { signal: AbortSignal.timeout(60000) });
      if (!r.ok) { lastErr = `${p}: HTTP ${r.status}`; continue; }
      const g = await MRMS.decode(await r.arrayBuffer(), CFG.box); const res = { grid: g, product: p, key, end: endMs, hours };
      gridCache.set(key, res); if (gridCache.size > 260) gridCache.delete(gridCache.keys().next().value); return res;
    } catch (e) { lastErr = `${p}: ${e.message}`; if (/Failed to fetch|NetworkError|Load failed/i.test(e.message)) throw Error('Browser could not reach the NOAA MRMS bucket (network or CORS): ' + e.message); }
  }
  throw Error(lastErr);
}
const productOrder = () => S.product === 'auto' ? ['pass2', 'pass1', 'radar'] : [S.product];
const PNAME = { pass2: 'Multi-sensor Pass 2 (gauge-corrected)', pass1: 'Multi-sensor Pass 1', radar: 'Radar-only' };
async function loadMRMS(a, b, id) {
  setSrc('mrms', 'load', 'Finding the latest available hour…', CFG.mrmsBucket + 'index.html#CONUS/');
  const nH = Math.max(1, Math.round((b - a) / H)); let bH = Math.floor(Math.min(b, Date.now()) / H) * H, aH = bH - nH * H, first = null, err = null;
  for (let back = 0; back < 4 && !first; back++, bH -= H, aH -= H) { const parts = MRMS.decompose(aH, bH); try { first = { parts, res: await fetchMrmsFile(parts[0].end, parts[0].hours, productOrder()) }; break; } catch (e) { err = e; if (/could not reach/i.test(e.message)) break; } }
  if (!first) throw err || Error('The period is shorter than one hour of MRMS data.');
  const parts = first.parts, results = [first.res];
  for (let i = 1; i < parts.length; i++) { if (id !== S.loadId) return; setSrc('mrms', 'load', `Downloading file ${i + 1} of ${parts.length}…`); results.push(await fetchMrmsFile(parts[i].end, parts[i].hours, productOrder())); }
  const g0 = results[0].grid, sum = new Float32Array(g0.data.length);
  for (const r of results) for (let i = 0; i < sum.length; i++) { const v = r.grid.data[i]; sum[i] += (v >= 0 ? v : NaN) * MM; }
  const used = [...new Set(results.map(r => r.product))];
  S.mrms = { grid: { ...g0, data: sum }, a: parts[0].end - nH * H, b: parts[0].end, products: used, files: results.map(r => r.key), parts };
  setSrc('mrms', 'ok', `${fmt(parts[0].end - nH * H)} → ${fmt(parts[0].end)} · ${used.map(u => PNAME[u]).join(' + ')} · ${parts.map(p => p.hours + 'h').join(' + ')} file${parts.length > 1 ? 's' : ''}`, CFG.mrmsBucket + results[0].key);
}
async function loadHourly() {
  if (!S.mrms) return; const { a, b } = S.mrms, n = Math.round((b - a) / H); if (n > 120) { $('tlInfo').textContent = 'Hourly timeline is limited to 120 hours — shorten the period.'; return; }
  const id = S.loadId, ends = Array.from({ length: n }, (_, i) => a + (i + 1) * H), grids = new Array(n); let done = 0, fail = 0;
  $('btnHourly').disabled = true;
  const work = async () => { while (ends.length) { const k = n - ends.length, e = ends.shift(); try { grids[k] = (await fetchMrmsFile(e, 1, productOrder())).grid; } catch (err) { fail++; grids[k] = null; } done++; $('tlInfo').textContent = `Loading hourly MRMS… ${done} of ${n}`; } };
  await Promise.all([work(), work(), work(), work()]); $('btnHourly').disabled = false; if (id !== S.loadId) return;
  const g0 = grids.find(Boolean); if (!g0) { $('tlInfo').textContent = 'Hourly MRMS files could not be loaded.'; return; }
  const N = g0.data.length, cum = [], run = new Float32Array(N), peak = new Float32Array(N);
  for (let k = 0; k < n; k++) { const g = grids[k]; if (g) for (let i = 0; i < N; i++) { const v = g.data[i] >= 0 ? g.data[i] * MM : 0; run[i] += v; if (v > peak[i]) peak[i] = v; } cum.push(Float32Array.from(run)); }
  S.hourly = { geo: g0, cum, peak, a, n, fail }; S.tl = n - 1;
  $('tlSlider').max = n - 1; $('tlSlider').value = n - 1; $('tlSlider').hidden = false; $('tlPlay').hidden = false; $('btnHourly').hidden = true;
  renderAll();
}
function sample(g, lat, lon, data) { const j = Math.round((g.north - lat) / g.dy), i = Math.round((lon - g.west) / g.dx); if (i < 0 || j < 0 || i >= g.nx || j >= g.ny) return null; const v = (data || g.data)[j * g.nx + i]; return isFinite(v) ? v : null; }
function boxStats(g, bx) { let max = -1, mi = 0, sum = 0, n = 0; for (let j = 0; j < g.ny; j++) { const lat = g.north - j * g.dy; if (lat < bx.s || lat > bx.n) continue; for (let i = 0; i < g.nx; i++) { const lon = g.west + i * g.dx; if (lon < bx.w || lon > bx.e) continue; const v = g.data[j * g.nx + i]; if (!isFinite(v)) continue; sum += v; n++; if (v > max) { max = v; mi = j * g.nx + i; } } } return n ? { max, mean: sum / n, lat: g.north - Math.floor(mi / g.nx) * g.dy, lon: g.west + (mi % g.nx) * g.dx } : null; }
/* Inverse-distance gauge analysis on the MRMS grid, only within reach of gauges (no extrapolation). */
function buildAnalysis() {
  S.idw = null; S.diff = null; const gs = fullGauges(); if (gs.length < 3) return;
  const ref = S.mrms ? S.mrms.grid : { nx: Math.round((CFG.box.e - CFG.box.w) / 0.01), ny: Math.round((CFG.box.n - CFG.box.s) / 0.01), dx: 0.01, dy: 0.01, west: CFG.box.w + 0.005, north: CFG.box.n - 0.005 };
  const out = new Float32Array(ref.nx * ref.ny).fill(NaN), R = 10, cosl = Math.cos(28.5 * Math.PI / 180);
  for (let j = 0; j < ref.ny; j++) { const lat = ref.north - j * ref.dy; for (let i = 0; i < ref.nx; i++) { const lon = ref.west + i * ref.dx; let w = 0, s = 0, near = 1e9; for (const g of gs) { const dy = (g.lat - lat) * 111.195; if (dy > 25 || dy < -25) continue; const dx = (g.lon - lon) * 111.195 * cosl, d2 = dx * dx + dy * dy; if (d2 > 625) continue; if (d2 < near) near = d2; const ww = 1 / (d2 + 0.25); w += ww; s += ww * (g.cmp != null ? g.cmp : g.total); } if (near <= R * R && w > 0) out[j * ref.nx + i] = s / w; } }
  S.idw = { ...ref, data: out };
  if (S.mrms) { const d = new Float32Array(out.length); for (let i = 0; i < d.length; i++) d[i] = S.mrms.grid.data[i] - out[i]; S.diff = { ...ref, data: d }; }
}

/* ───────────────────────── alerts ───────────────────────── */
async function loadAlerts() {
  const url = CFG.nws + 'alerts/active?area=FL'; setSrc('alerts', 'load', 'Requesting…', url);
  const j = await getJson(url, 30000, { Accept: 'application/geo+json' }), bx = CFG.box;
  S.alerts = (j.features || []).filter(f => { const p = f.properties; if (!CFG.alertEvents.test(p.event)) return false; if (CFG.alertCounties.test(p.areaDesc || '')) return true; const g = f.geometry; if (!g) return false; const ring = g.type === 'Polygon' ? g.coordinates[0] : (g.coordinates[0] || [])[0] || []; return ring.some(c => c[0] > bx.w && c[0] < bx.e && c[1] > bx.s && c[1] < bx.n); })
    .sort((x, y) => (/Warning/.test(y.properties.event) - /Warning/.test(x.properties.event)) || (/Flood/.test(y.properties.event) - /Flood/.test(x.properties.event)));
  setSrc('alerts', 'ok', `${S.alerts.length} active for Brevard and neighboring counties`, url);
}
const alertColor = ev => /Flash Flood Warning/.test(ev) ? '#ff5a5f' : /Flood Warning/.test(ev) ? '#3ddc5a' : /Flood Advisory/.test(ev) ? '#4be3a6' : /Flood Watch/.test(ev) ? '#58b98a' : /Coastal Flood|Surge/.test(ev) ? '#7fb3ff' : /Tornado/.test(ev) ? '#ff4d4d' : /Thunderstorm/.test(ev) ? '#ffb347' : /Tropical|Hurricane/.test(ev) ? '#ff7ad1' : '#c9c9c9';

/* ───────────────────────── load orchestration ───────────────────────── */
function setRange(a, b, preset) { S.a = a; S.b = b; S.preset = preset || null; store.set('preset', S.preset); if (!preset) store.set('custom', [a, b]); }
async function loadAll() {
  const id = ++S.loadId; if (S.preset) { S.b = Date.now(); S.a = S.b - S.preset * H; }
  if (S.fellBack) { $('rasterA').value = 'mrms'; S.fellBack = false; }
  const { a, b } = S; S.gauges = new Map(); S.mrms = null; S.hourly = null; S.idw = null; S.diff = null; S.tl = -1;
  $('tlSlider').hidden = true; $('tlPlay').hidden = true; $('btnHourly').hidden = false; $('tlInfo').textContent = 'Adds an accumulation slider, peak 1-hour rates and MRMS curves at key sites.';
  syncRangeUi(); renderAll();
  const step = () => { if (id === S.loadId) { computeGaugeTotals(); qcGauges(); buildAnalysis(); renderAll(); } };
  const gaugeJob = (async () => {
    let got = 0; try { got = await loadIEM(a, b); } catch (e) { setSrc('iem', 'err', 'Could not load: ' + e.message, S.src.iem && S.src.iem.url); }
    const missing = asosList.filter(s => !S.gauges.has('K' + s[0])).slice(0, 25);
    if (missing.length) { try { await loadNWS(a, b, missing); } catch (e) { setSrc('nws', 'err', e.message); } } else setSrc('nws', 'idle', 'Not needed — the primary source returned every station');
    step();
  })();
  const jobs = [gaugeJob,
    loadKSC().catch(e => setSrc('ksc', 'err', e.message, CFG.kscPage)).then(step),
    loadDaily(a, b).catch(e => setSrc('daily', 'err', 'Could not load: ' + e.message)).then(step),
    loadUSGS(a, b).catch(e => setSrc('usgs', 'err', 'Could not load: ' + e.message, S.src.usgs && S.src.usgs.url)).then(step),
    loadMRMS(a, b, id).catch(e => { setSrc('mrms', 'err', e.message, CFG.mrmsBucket + 'index.html#CONUS/'); if (id === S.loadId && $('rasterA').value === 'mrms') { const hrs = (b - a) / H; $('rasterA').value = hrs <= 30 ? 'iem24' : hrs <= 60 ? 'iem48' : 'iem72'; S.fellBack = true; } }).then(step),
    loadAlerts().catch(e => setSrc('alerts', 'err', 'Could not load: ' + e.message, CFG.nws + 'alerts/active?area=FL')).then(step)];
  await Promise.all(jobs); if (id === S.loadId) { S.loadedAt = Date.now(); S.allDone = true; step(); }
}

/* ───────────────────────── raster rendering (Web-Mercator-correct) ───────────────────────── */
function rasterCanvas(g, data, L, C, smooth) {
  const SC = 4, W = g.nx * SC, wE = g.west - g.dx / 2, eE = wE + g.nx * g.dx, nE = g.north + g.dy / 2, sE = nE - g.ny * g.dy;
  const my = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)), mN = my(nE), mS = my(sE);
  const Hh = Math.max(1, Math.round(W * (mN - mS) / ((eE - wE) * Math.PI / 180)));
  const cv = document.createElement('canvas'); cv.width = W; cv.height = Hh; const ctx = cv.getContext('2d'), img = ctx.createImageData(W, Hh), px = img.data;
  const at = (i, j) => (i < 0 || j < 0 || i >= g.nx || j >= g.ny) ? NaN : data[j * g.nx + i];
  for (let r = 0; r < Hh; r++) {
    const lat = (2 * Math.atan(Math.exp(mN - (r + 0.5) / Hh * (mN - mS))) - Math.PI / 2) * 180 / Math.PI, fj = (g.north - lat) / g.dy;
    for (let c = 0; c < W; c++) {
      const fi = (c + 0.5) / SC - 0.5; let v;
      if (!smooth) v = at(Math.round(fi), Math.round(fj));
      else { const i0 = Math.floor(fi), j0 = Math.floor(fj), tx = fi - i0, ty = fj - j0; let s = 0, w = 0; for (const [ii, jj, ww] of [[i0, j0, (1 - tx) * (1 - ty)], [i0 + 1, j0, tx * (1 - ty)], [i0, j0 + 1, (1 - tx) * ty], [i0 + 1, j0 + 1, tx * ty]]) { const x = at(ii, jj); if (isFinite(x)) { s += x * ww; w += ww; } } v = w > 0.3 ? s / w : NaN; }
      if (!isFinite(v)) continue; const k = levelIdx(v, L), o = (r * W + c) * 4;
      if (C === DRGB) { const col = C[k + 1]; px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2]; px[o + 3] = k === 4 ? 70 : 255; }
      else if (k >= 0) { const col = C[k]; px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2]; px[o + 3] = 255; }
    }
  }
  ctx.putImageData(img, 0, 0); return { url: cv.toDataURL(), bounds: [[sE, wE], [nE, eE]] };
}

/* ───────────────────────── maps ───────────────────────── */
const BASES = {
  dark: ['https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png?key=' + CFG.cartoKey, '© OpenStreetMap contributors © CARTO'],
  light: ['https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png?key=' + CFG.cartoKey, '© OpenStreetMap contributors © CARTO'],
  voyager: ['https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=' + CFG.cartoKey, '© OpenStreetMap contributors © CARTO'],
  sat: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', 'Imagery © Esri'],
  osm: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png', '© OpenStreetMap'],
};
const LABELS = 'https://basemaps.cartocdn.com/rastertiles/dark_only_labels/{z}/{x}/{y}{r}.png?key=' + CFG.cartoKey;
const RASTERS = [['mrms', 'MRMS radar-estimated rainfall'], ['idw', 'Gauge analysis (interpolated gauges)'], ['diff', 'MRMS minus gauges (difference)'], ['peak', 'Peak 1-hour rainfall (MRMS, needs hourly timeline)'], ['iem24', 'Reference: IEM MRMS image, last 24 h'], ['iem48', 'Reference: IEM MRMS image, last 48 h'], ['iem72', 'Reference: IEM MRMS image, last 72 h'], ['none', 'No rainfall shading']];
const IEMT = { iem24: 'q2-p24h', iem48: 'q2-p48h', iem72: 'q2-p72h' };
const M = {};
function makeMap(key) {
  const map = L.map('map' + key, { zoomControl: key === 'A', attributionControl: true, zoomSnap: 0.25, preferCanvas: false }).setView([28.53, -80.66], 11);
  map.createPane('rast').style.zIndex = 350; map.createPane('lab').style.zIndex = 380; map.getPane('lab').style.pointerEvents = 'none'; map.createPane('alerts').style.zIndex = 390;
  const o = { map, base: null, labels: null, rast: null, rastKey: '', radar: null, gauges: L.layerGroup().addTo(map), pois: L.layerGroup().addTo(map), alerts: L.layerGroup().addTo(map) };
  L.control.scale({ imperial: true, metric: true }).addTo(map); M[key] = o;
  map.on('click', e => openQuery(o, e.latlng.lat, e.latlng.lng)); map.getContainer().style.cursor = 'crosshair'; return o;
}
let syncing = false;
function syncMaps(from, to) { from.map.on('move', () => { if (syncing || $('wrapB').hidden) return; syncing = true; to.map.setView(from.map.getCenter(), from.map.getZoom(), { animate: false }); syncing = false; }); }
function setBase(o, name) { clearTimeout(o.baseTimer); let ok = 0, bad = 0; const order = ['dark', 'osm', 'sat', 'light'];
  o.baseTimer = setTimeout(() => { if (!ok && bad && o === M.A) { const nxt = order[(order.indexOf(name) + 1) % order.length]; S.tried = (S.tried || 0) + 1; if (S.tried < order.length) { $('base').value = nxt; setBase(M.A, nxt); setBase(M.B, nxt); } else { S.noBase = true; renderKpis(); } } }, 6000);
  if (o.base) o.map.removeLayer(o.base); if (o.labels) { o.map.removeLayer(o.labels); o.labels = null; } const b = BASES[name]; o.base = L.tileLayer(b[0], { attribution: b[1], maxZoom: 18, subdomains: 'abcd' }).on('tileload', () => { ok++; }).on('tileerror', () => { bad++; }).addTo(o.map); if (name === 'sat') o.labels = L.tileLayer(LABELS, { pane: 'lab', maxZoom: 18, subdomains: 'abcd' }).addTo(o.map); }
function shownEnd() { return S.hourly && S.tl >= 0 && S.tl < S.hourly.n - 1 ? S.hourly.a + (S.tl + 1) * H : null; }
function gaugeShown(g) { const t = shownEnd(); if (t == null || g.daily) return g.total; const c1 = cumAt(g.series, t), c0 = cumAt(g.series, S.a); return c1 == null ? null : c1 - (c0 || 0); }
function rasterFor(type) {
  if (type === 'mrms') { if (S.hourly && S.tl >= 0) return { g: S.hourly.geo, d: S.hourly.cum[S.tl], L: LEVELS, C: RGB }; return S.mrms ? { g: S.mrms.grid, d: S.mrms.grid.data, L: LEVELS, C: RGB } : null; }
  if (type === 'idw') return S.idw ? { g: S.idw, d: S.idw.data, L: LEVELS, C: RGB } : null;
  if (type === 'diff') return S.diff ? { g: S.diff, d: S.diff.data, L: DLEVELS, C: DRGB } : null;
  if (type === 'peak') return S.hourly ? { g: S.hourly.geo, d: S.hourly.peak, L: LEVELS, C: RGB } : null;
  return null;
}
function tagFor(type) {
  const end = shownEnd();
  if (type === 'mrms') return S.mrms ? [`MRMS radar-estimated rainfall`, `${fmt(S.mrms.a)} → ${fmt(end || S.mrms.b)} · ${S.mrms.products.map(p => PNAME[p]).join(' + ')}`] : ['MRMS radar-estimated rainfall', S.src.mrms && S.src.mrms.state === 'err' ? 'Not available — see Sources' : 'Loading…'];
  if (type === 'idw') return ['Gauge analysis', S.idw ? `Interpolated from ${fullGauges().length} gauges${S.mrms ? ' over the MRMS hours' : ''}, shown only within 10 km of a gauge` : 'Needs at least 3 gauges with full-period data'];
  if (type === 'diff') return ['MRMS minus gauge analysis', S.diff ? 'Brown: radar lower than gauges · Teal: radar higher' : 'Needs both MRMS and gauges'];
  if (type === 'peak') return ['Peak 1-hour rainfall (MRMS)', S.hourly ? `Highest single clock-hour total, ${fmt(S.hourly.a)} → ${fmt(S.hourly.a + S.hourly.n * H)}` : 'Load the hourly timeline first'];
  if (IEMT[type]) return [`IEM MRMS image · last ${type.slice(3)} h ending now`, 'Reference picture with IEM\'s own color scale — not tied to the selected period'];
  return ['', ''];
}
function drawRaster(o, type) {
  const key = [type, S.ver, S.tl, $('smooth').checked].join('|'), op = $('opac').value / 100;
  if (key !== o.rastKey) {
    if (o.rast) { o.map.removeLayer(o.rast); o.rast = null; } o.rastKey = key;
    if (IEMT[type]) o.rast = L.tileLayer(`${CFG.iem}cache/tile.py/1.0.0/${IEMT[type]}/{z}/{x}/{y}.png?_=${Math.floor(Date.now() / 300000)}`, { pane: 'rast', maxZoom: 18, attribution: 'MRMS tiles: Iowa Environmental Mesonet' }).addTo(o.map);
    else { const r = rasterFor(type); if (r) { const c = rasterCanvas(r.g, r.d, r.L, r.C, $('smooth').checked); o.rast = L.imageOverlay(c.url, c.bounds, { pane: 'rast' }).addTo(o.map); } }
  }
  if (o.rast) o.rast.setOpacity(op);
}
function drawPoints(o) {
  o.gauges.clearLayers(); o.pois.clearLayers(); o.alerts.clearLayers();
  if ($('lyA').checked) for (const f of S.alerts) { if (!f.geometry) continue; const col = alertColor(f.properties.event); L.geoJSON(f, { pane: 'alerts', style: { color: col, weight: 2.5, fillColor: col, fillOpacity: 0.07, dashArray: /Watch|Advisory/.test(f.properties.event) ? '6 5' : null }, interactive: false }).addTo(o.alerts); }
  {
    const z = o.map.getZoom(), t0 = shownEnd();
    for (const g of [...S.gauges.values()].filter(g => S.nets[g.net] && !(g.suspect && $('hideSus').checked)).sort((x, y) => (x.total || 0) - (y.total || 0))) {
      const v = gaugeShown(g); if (v == null) continue; const col = colorFor(v) || '#eef3f8', part = g.flags.some(f => f.k === 'partial'); if (g.daily && t0 != null) continue;
      const lab = (g.key && z >= 9.5 ? g.id + ' ' : '') + v.toFixed(2);
      const icon = L.divIcon({ className: '', html: `<div class="gm${g.key ? ' key' : ''}${g.suspect ? ' sus' : ''}${part ? ' part' : ''}${g.daily ? ' day' : ''}" style="background:${col};color:${inkFor(col)}">${g.suspect ? (g.key ? g.id + ' ?' : '?') : lab}</div>`, iconSize: [g.key ? 74 : 40, 22], iconAnchor: [g.key ? 82 : 20, 11] });
      L.marker([g.lat, g.lon], { icon, zIndexOffset: (g.key ? 500 : 0) + Math.round(v * 10), title: g.name }).on('click', () => toggleSel(g.id)).bindPopup(gaugePopup(g)).addTo(o.gauges);
    }
  }
  {
    const placed = [], hit = b => placed.some(q => b[0] < q[2] && b[2] > q[0] && b[1] < q[3] && b[3] > q[1]);
    for (const g of S.gauges.values()) { if (!S.nets[g.net] || gaugeShown(g) == null || (g.suspect && $('hideSus').checked)) continue; const q = o.map.latLngToContainerPoint([g.lat, g.lon]); placed.push(g.key ? [q.x - 84, q.y - 12, q.x - 6, q.y + 12] : [q.x - 22, q.y - 12, q.x + 22, q.y + 12]); }
    for (const p of shownPoi()) {
      const v = poiMrms(p), txt = p[0] + (v != null ? ' ' + v.toFixed(2) + '"' : ''), w = txt.length * 6.6 + 16, pt = o.map.latLngToContainerPoint([p[2], p[3]]);
      const R = [pt.x + 8, pt.y - 10, pt.x + 12 + w, pt.y + 10], Lf = [pt.x - 12 - w, pt.y - 10, pt.x - 8, pt.y + 10], side = !hit(R) ? 'r' : !hit(Lf) ? 'l' : '';
      if (side) placed.push(side === 'r' ? R : Lf); placed.push([pt.x - 8, pt.y - 8, pt.x + 8, pt.y + 8]);
      const lab = side ? `<span>${esc(p[0])}${v != null ? `<b>${v.toFixed(2)}"</b>` : ''}</span>` : '';
      const icon = L.divIcon({ className: '', html: `<div class="poi ${side}"><i class="${p[1]}"></i>${lab}</div>`, iconSize: [14, 14], iconAnchor: [7, 7] });
      L.marker([p[2], p[3]], { icon, zIndexOffset: 1500, title: txt }).on('click', () => toggleSel('poi:' + p[0])).addTo(o.pois);
    }
  }
  if (o.radar && !$('lyR').checked) { o.map.removeLayer(o.radar); o.radar = null; }
  if (!o.radar && $('lyR').checked) o.radar = L.tileLayer(`${CFG.iem}cache/tile.py/1.0.0/nexrad-n0q-900913/{z}/{x}/{y}.png?_=${Math.floor(Date.now() / 300000)}`, { pane: 'lab', opacity: 0.7, maxZoom: 18, attribution: 'NEXRAD: IEM' }).addTo(o.map);
}
function poiMrms(p) { if (S.hourly && S.tl >= 0) return sample(S.hourly.geo, p[2], p[3], S.hourly.cum[S.tl]); return S.mrms ? sample(S.mrms.grid, p[2], p[3]) : null; }
function gaugePopup(g) {
  return () => `<b>${esc(g.name)}</b><br><b class="big">${fin(g.total)}"</b> gauge total<br>` + (g.mrms != null ? `MRMS at this spot: <b>${g.mrms.toFixed(2)}"</b><br>` : '') + (g.daily ? g.reports.filter(r => r.t - 12 * H >= S.a && r.t - 12 * H <= S.b).map(r => `${fmt(r.t)}: ${r.v.toFixed(2)}"<br>`).join('') : `Last hour: ${fin(g.last1)}"<br>`) + `<span class="muted">${esc(g.src)} · last report ${g.lastT ? fmt(g.lastT) : '—'}</span>` + g.flags.map(f => `<br><span style="color:var(--warn)">⚠ ${esc(f.t)}</span>`).join('');
}
/* Click anywhere on a map: everything known about that spot. */
function inRing(lat, lon, ring) { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > lat) !== (b[1] > lat) && lon < (b[0] - a[0]) * (lat - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
function alertsAt(lat, lon) { return S.alerts.filter(f => { const g = f.geometry; if (!g) return false; const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []; return polys.some(p => p[0] && inRing(lat, lon, p[0])); }); }
function queryHtml(lat, lon) {
  const end = shownEnd(), mr = S.hourly && S.tl >= 0 ? sample(S.hourly.geo, lat, lon, S.hourly.cum[S.tl]) : S.mrms ? sample(S.mrms.grid, lat, lon) : null;
  const an = S.idw ? sample(S.idw, lat, lon) : null, pk = S.hourly ? sample(S.hourly.geo, lat, lon, S.hourly.peak) : null;
  const near = fullGauges().map(g => ({ g, d: km(lat, lon, g.lat, g.lon) })).sort((x, y) => x.d - y.d).slice(0, 4);
  const row = (l, v) => `<tr><td style="border:0;padding:1px 10px 1px 0" class="muted">${l}</td><td style="border:0;padding:1px 0;text-align:right">${v}</td></tr>`;
  let h = `<b>${lat.toFixed(4)}°N, ${Math.abs(lon).toFixed(4)}°W</b><br><span class="muted">${esc(nearPoi(lat, lon))}</span><table style="margin:6px 0;width:auto">`;
  h += row(`MRMS radar estimate${end ? ' (to ' + fmt(end, S.tz, false) + ')' : ''}`, mr != null ? `<b class="big">${mr.toFixed(2)}"</b>` : S.mrms ? 'outside coverage' : 'not loaded');
  h += row('Gauge analysis here', an != null ? `<b>${an.toFixed(2)}"</b>` : '<span class="muted">no gauge within 10 km</span>');
  if (mr != null && an != null && !end) h += row('Radar minus gauges', `<b>${mr - an >= 0 ? '+' : '−'}${Math.abs(mr - an).toFixed(2)}"</b>`);
  if (pk != null) h += row('Peak 1-hour (MRMS)', `<b>${pk.toFixed(2)}"</b>`);
  h += '</table>';
  if (near.length) h += '<span class="lbl">Nearest gauges</span><table style="width:auto">' + near.map(n => row(`${esc(n.g.id)} · ${n.d.toFixed(1)} km`, `<b>${n.g.total.toFixed(2)}"</b>`)).join('') + '</table>';
  for (const f of alertsAt(lat, lon)) h += `<div style="margin-top:5px"><span class="ev" style="background:${alertColor(f.properties.event)};color:#0b0b0b;border-radius:4px;padding:1px 6px;font-weight:650;font-size:11.5px">${esc(f.properties.event)}</span> <span class="muted">until ${fmt(Date.parse(f.properties.ends || f.properties.expires))}</span></div>`;
  h += `<div style="margin-top:8px;display:flex;gap:6px"><button data-q="pin">Save as key site</button><button data-q="copy">Copy</button></div>`;
  return h;
}
function openQuery(o, lat, lon) {
  S.query = { lat, lon, key: o === M.A ? 'A' : 'B' };
  o.qpop = (o.qpop || L.popup({ maxWidth: 330, autoPan: true })).setLatLng([lat, lon]).setContent(queryHtml(lat, lon)).openOn(o.map);
  o.qpop.off('remove').on('remove', () => { if (S.query && M[S.query.key] === o) S.query = null; });
  const el = o.qpop.getElement(); if (el) el.onclick = e => { const a = e.target.dataset.q; if (!a) return;
    if (a === 'pin') { const n = S.poi.filter(p => /^Point /.test(p[0])).length + 1; S.poi = S.poi.concat([[`Point ${n}`, 'ops', +lat.toFixed(4), +lon.toFixed(4)]]); store.set('poi', S.poi); S.kinds.ops = true; o.map.closePopup(); renderAll(); renderSources(); }
    if (a === 'copy') { const t = el.querySelector('.leaflet-popup-content').innerText.replace(/\n?Save as key site\s*Copy\s*$/, '').trim(); navigator.clipboard.writeText(t).then(() => { e.target.textContent = 'Copied'; }, () => { e.target.textContent = 'Copy blocked'; }); } };
}
function renderMaps() {
  if (S.query && M[S.query.key].qpop && M[S.query.key].qpop.isOpen()) M[S.query.key].qpop.setContent(queryHtml(S.query.lat, S.query.lon));
  drawRaster(M.A, $('rasterA').value); drawPoints(M.A); const ta = tagFor($('rasterA').value); $('tagA').innerHTML = ta[0] ? `<b>${esc(ta[0])}</b>${esc(ta[1])}` : ''; $('tagA').hidden = !ta[0];
  if (!$('wrapB').hidden) { drawRaster(M.B, $('rasterB').value); drawPoints(M.B); const tb = tagFor($('rasterB').value); $('tagB').innerHTML = tb[0] ? `<b>${esc(tb[0])}</b>${esc(tb[1])}` : ''; $('tagB').hidden = !tb[0]; }
  const types = [$('rasterA').value].concat($('wrapB').hidden ? [] : [$('rasterB').value]); let h = '';
  const bar = (Lv, Cs, title, lead) => `<div class="lgwrap"><div class="small muted">${title}</div><div class="lgbar">${Cs.map(c => `<i style="background:${c}"></i>`).join('')}</div><div class="lgticks">${lead ? '<span></span>' : ''}${Lv.map(v => `<span>${v}</span>`).join('')}${lead ? '' : ''}</div></div>`;
  if (types.some(t => t !== 'diff' && t !== 'none' && !IEMT[t]) || Object.values(S.nets).some(Boolean)) h += bar(LEVELS.slice(1), COLORS, 'Rainfall, inches (each color starts at the value under its left edge; first band starts at 0.01")', true);
  if (types.includes('diff')) h += bar(DLEVELS, DCOLORS, 'MRMS minus gauges, inches', true);
  h += `<div class="small muted" style="min-width:210px">Click the map for values at any point · Pills = gauge totals · square = once-a-day gauge (CoCoRaHS/COOP) · ${$('hideSus').checked ? `${[...S.gauges.values()].filter(g => S.nets[g.net] && g.suspect).length} non-reporting gauges hidden` : '<span style="border:1px dashed currentColor;border-radius:8px;padding:0 5px">?</span> = gauge likely not reporting'} · ◆ pads ● airfields</div>`;
  $('legend').innerHTML = h;
}

/* ───────────────────────── panels ───────────────────────── */
function nearestGauge(lat, lon) { let best = null, bd = 1e9; for (const g of fullGauges()) { const d = km(lat, lon, g.lat, g.lon); if (d < bd) { bd = d; best = g; } } return best ? { g: best, d: bd } : null; }
function poiRows() { return shownPoi().map(p => { const mr = S.mrms ? sample(S.mrms.grid, p[2], p[3]) : null, an = S.idw ? sample(S.idw, p[2], p[3]) : null, ng = nearestGauge(p[2], p[3]), pk = S.hourly ? sample(S.hourly.geo, p[2], p[3], S.hourly.peak) : null; return { name: p[0], kind: p[1], lat: p[2], lon: p[3], mrms: mr, an, ng, pk }; }); }
const swatch = v => v == null ? '<span class="muted">—</span>' : `<span class="sw" style="background:${colorFor(v) || 'transparent'};color:${colorFor(v) ? inkFor(colorFor(v)) : 'inherit'}">${v.toFixed(2)}</span>`;
function renderSites() {
  const rows = poiRows(); let h = `<table><thead><tr><th>Site</th><th class="n" title="MRMS radar estimate at the site">MRMS</th><th class="n" title="Interpolated from surrounding gauges (within 10 km)">Gauges</th><th>Nearest gauge</th>${S.hourly ? '<th class="n" title="Highest single-hour MRMS total">Peak 1 h</th>' : ''}</tr></thead><tbody>`;
  for (const k of Object.keys(POI_KIND)) { const rs = rows.filter(r => r.kind === k); if (!rs.length) continue; h += `<tr class="sec"><td colspan="${S.hourly ? 5 : 4}">${POI_KIND[k]}</td></tr>`; for (const r of rs) h += `<tr class="row${S.sel.includes('poi:' + r.name) ? ' sel' : ''}" data-id="poi:${esc(r.name)}" data-ll="${r.lat},${r.lon}"><td>${esc(r.name)}</td><td class="n">${swatch(r.mrms)}</td><td class="n">${swatch(r.an)}</td><td class="nw">${r.ng ? `${esc(r.ng.g.id)} <b>${r.ng.g.total.toFixed(2)}"</b> <span class="muted">${r.ng.d < 0.3 ? 'on site' : r.ng.d.toFixed(0) + ' km'}</span>` : '<span class="muted">—</span>'}</td>${S.hourly ? `<td class="n">${fin(r.pk)}</td>` : ''}</tr>`; }
  h += '</tbody></table><div class="box small muted">MRMS = radar estimate in the 1-km cell over the site. Gauges = distance-weighted from surrounding gauges; blank when no gauge is within 10 km. Inches.</div>';
  $('tab-sites').innerHTML = h;
}
function renderGauges() {
  const gs = [...S.gauges.values()].filter(g => S.nets[g.net] && g.total != null).sort((x, y) => y.total - x.total), max = Math.max(0.01, ...gs.map(g => g.total));
  let h = `<table><thead><tr><th>Gauge</th><th class="n">Total</th><th class="n" title="Accumulation in the final hour of the period">Last 1 h</th><th class="n" title="MRMS estimate at the gauge">MRMS</th></tr></thead><tbody>`;
  for (const g of gs) h += `<tr class="row${S.sel.includes(g.id) ? ' sel' : ''}" data-id="${esc(g.id)}" data-ll="${g.lat},${g.lon}"><td><b>${esc(g.id)}</b> <span class="muted">${esc(g.name.replace(/^K\w+ · /, '').replace('KSC rain gauge ', 'KSC gauge ').replace(/^(USGS|CoCoRaHS|COOP) /, ''))}</span>${g.flags.map(f => `<span class="flag${f.k === 'daily' ? '' : ' w'}" title="${esc(f.t)}">${f.k === 'suspect' ? 'check gauge' : f.k === 'partial' ? 'partial period' : f.k === 'daily' ? 'daily' : 'stale'}</span>`).join('')}<div class="bar" style="width:${Math.round(g.total / max * 100)}%;background:${colorFor(g.total) || 'var(--line)'}"></div></td><td class="n">${swatch(g.total)}</td><td class="n">${fin(g.last1)}</td><td class="n">${fin(g.mrms)}</td></tr>`;
  if (!gs.length) h += '<tr><td colspan="4" class="muted">No gauge data loaded yet.</td></tr>';
  $('tab-gauges').innerHTML = h + '</tbody></table>';
}
function renderAlerts() {
  $('alertN').hidden = !S.alerts.length; $('alertN').textContent = S.alerts.length;
  $('tab-alerts').innerHTML = S.alerts.length ? S.alerts.map(f => { const p = f.properties; return `<div class="alert"><span class="ev" style="background:${alertColor(p.event)}">${esc(p.event)}</span><b>${esc((p.areaDesc || '').slice(0, 140))}</b><span class="muted">Until ${p.ends || p.expires ? fmt(Date.parse(p.ends || p.expires)) : '—'} · ${esc(p.senderName || '')}</span><div class="small">${esc(p.headline || '')}</div>${f.geometry ? '' : '<div class="small muted">County/zone-based — no polygon to draw</div>'}</div>`; }).join('') : `<div class="box muted">${S.src.alerts && S.src.alerts.state === 'err' ? 'Alerts could not be loaded.' : 'No active flood, tropical or severe alerts for Brevard and neighboring counties.'}</div>`;
}
function renderSources() {
  const el = $('tab-sources'); if (!el) return; const keep = el.querySelector('#kscPaste') ? el.querySelector('#kscPaste').value : '';
  let h = Object.keys(SRC).map(k => { const s = S.src[k] || { state: 'idle', detail: 'Waiting' }; return `<div class="src"><span class="dot ${s.state === 'ok' ? 'ok' : s.state === 'err' ? 'err' : s.state === 'warn' ? 'warn' : s.state === 'load' ? 'load' : ''}" title="${s.state}"></span><div><b>${SRC[k]}</b><div class="small ${s.state === 'err' ? '' : 'muted'}">${s.state === 'err' ? '✕ ' : s.state === 'ok' ? '✓ ' : ''}${esc(s.detail || '')}</div>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">Open source request</a>` : ''}</div></div>`; }).join('');
  h += `<div class="box"><h3>MRMS product</h3><select id="product"><option value="auto">Auto — best available (Pass 2 → Pass 1 → Radar-only)</option><option value="pass2">Multi-sensor Pass 2 (gauge-corrected, ~2 h behind)</option><option value="pass1">Multi-sensor Pass 1 (~1 h behind)</option><option value="radar">Radar-only (fastest)</option></select>
  <div style="margin-top:8px"><label class="chk"><input type="checkbox" id="exSus" ${S.excludeSuspect ? 'checked' : ''}> Leave "check gauge" sites out of maxima, analysis and bias</label></div></div>
  <div class="box"><h3>KSC rain gauges — paste from the archive</h3><div class="small muted">Open the <a href="${CFG.kscPage}" target="_blank" rel="noopener" style="color:var(--acc)">Past 24 Hour page</a>, or a daily report for one date from the <a href="https://kscweather.ksc.nasa.gov/wxarchive/Reports/Rainfall" target="_blank" rel="noopener" style="color:var(--acc)">Rainfall Reports page</a>. Select the whole page (Ctrl+A), copy, paste here. Repeat for each day you need — hours are kept in this browser and merged with the automatic collector.</div>
  <textarea id="kscPaste" placeholder="Gauge  11:00  12:00  …  Total">${esc(keep)}</textarea><div style="display:flex;gap:8px;margin-top:6px;align-items:center"><button id="kscAdd" class="primary">Add pasted table</button><button id="kscClear">Clear pasted data</button><span id="kscMsg" class="small muted">${esc(S.kscMsg || '')}</span></div></div>
  <div class="box"><h3>Key sites</h3><div class="small muted">One per line: name, type (pad / air / ops), latitude, longitude. Saved in this browser.</div><textarea id="poiEdit" style="min-height:120px">${esc(S.poi.map(p => p.join(', ')).join('\n'))}</textarea><div style="display:flex;gap:8px;margin-top:6px"><button id="poiSave" class="primary">Save sites</button><button id="poiReset">Restore defaults</button><span id="poiMsg" class="small muted"></span></div></div>`;
  el.innerHTML = h; $('product').value = S.product;
}
function stats() {
  const full = fullGauges(), top = full.slice().sort((x, y) => y.total - x.total)[0], cape = S.mrms ? boxStats(S.mrms.grid, CFG.cape) : null, pr = poiRows().filter(r => r.mrms != null);
  const pairs = full.filter(g => g.mrms != null && g.cmp != null && g.cmp >= 0.25), sg = pairs.reduce((s, g) => s + g.cmp, 0), sm = pairs.reduce((s, g) => s + g.mrms, 0);
  const rate = goodGauges().filter(g => g.last1 != null && !g.flags.some(f => f.k === 'stale')).sort((x, y) => y.last1 - x.last1)[0];
  const sus = [...S.gauges.values()].filter(g => S.nets[g.net] && g.suspect);
  return { full, top, cape, pr, pairs, ratio: sg > 0 && pairs.length >= 3 ? sm / sg : null, rate, sus, prMax: pr.slice().sort((x, y) => y.mrms - x.mrms)[0], prMin: pr.slice().sort((x, y) => x.mrms - y.mrms)[0], floods: S.alerts.filter(f => /Flood/.test(f.properties.event)) };
}
const nearPoi = (lat, lon) => { let b = null, bd = 1e9; for (const p of S.poi) { const d = km(lat, lon, p[2], p[3]); if (d < bd) { bd = d; b = p; } } return b ? `${bd.toFixed(0)} km from ${b[0]}` : ''; };
function renderKpis() {
  const s = stats(), k = (l, v, u, d) => `<div class="kpi"><div class="lbl">${l}</div><div class="v">${v}${u ? `<small>${u}</small>` : ''}</div><div class="d" title="${esc(d)}">${esc(d)}</div></div>`;
  $('kpis').innerHTML =
    k('Highest gauge total', s.top ? s.top.total.toFixed(2) : '—', s.top ? 'in' : '', s.top ? `${s.top.id} · ${s.top.name.replace(/^K\w+ · /, '')}` : 'Waiting for gauges') +
    k('Highest radar estimate, Cape/KSC', s.cape ? s.cape.max.toFixed(2) : '—', s.cape ? 'in' : '', s.cape ? `${nearPoi(s.cape.lat, s.cape.lon)} · area average ${s.cape.mean.toFixed(2)}"` : 'Waiting for MRMS') +
    k('Key sites (radar estimate)', s.pr.length ? `${s.prMin.mrms.toFixed(1)}–${s.prMax.mrms.toFixed(1)}` : '—', s.pr.length ? 'in' : '', s.pr.length ? `Most: ${s.prMax.name} · least: ${s.prMin.name}` : 'Waiting for MRMS') +
    k('Heaviest in final hour', s.rate ? s.rate.last1.toFixed(2) : '—', s.rate ? 'in/h' : '', s.rate ? `${s.rate.id} · hour ending ${fmt(S.b, S.tz, false)}` : 'Waiting for gauges') +
    k('Radar vs. gauges', s.ratio ? `${s.ratio >= 1 ? '+' : '−'}${Math.abs((s.ratio - 1) * 100).toFixed(0)}` : '—', s.ratio ? '%' : '', s.ratio ? `MRMS reads ${s.ratio >= 1 ? 'higher' : 'lower'} than ${s.pairs.length} gauges overall` : 'Needs MRMS and 3+ gauges') +
    k('Active flood alerts', String(s.floods.length), '', s.floods.length ? [...new Set(s.floods.map(f => f.properties.event))].join(' · ') : (S.src.alerts && S.src.alerts.state === 'ok' ? 'None for Brevard and neighbors' : 'Waiting for NWS'));
  const notes = [];
  if (S.mrms && Math.abs(S.mrms.a - S.a) + Math.abs(S.mrms.b - S.b) > 20 * 60000) notes.push(`MRMS covers whole hours ${fmt(S.mrms.a)} → ${fmt(S.mrms.b)}; gauge totals cover the exact period. Radar-vs-gauge comparisons use the MRMS hours.`);
  if (s.sus.length) notes.push(`${s.sus.length} gauge${s.sus.length > 1 ? 's' : ''} read zero while radar or neighbors show rain (${s.sus.slice(0, 8).map(g => g.id).join(', ')}${s.sus.length > 8 ? '…' : ''}) — ${S.excludeSuspect ? 'left out of maxima and analysis' : 'included'}`);
  if (S.kscAge != null && S.kscAge > 40 && S.b > Date.now() - 2 * H) notes.push(`KSC gauge data is ${S.kscAge >= 120 ? (S.kscAge / 60).toFixed(1) + ' hours' : Math.round(S.kscAge) + ' minutes'} old — the collector has stopped updating. KSC totals do not include the most recent rain.`);
  const dl = [...S.gauges.values()].filter(g => S.nets.DAILY && g.daily && g.total != null); if (dl.length) notes.push(`${dl.length} once-a-day gauges (CoCoRaHS/COOP) are shown as squares. Their totals are 7 AM-to-7 AM readings that fall inside the period, so they are left out of maxima, the gauge analysis and the radar comparison.`);
  const part = [...S.gauges.values()].filter(g => g.flags.some(f => f.k === 'partial')); if (part.length) notes.push(`${part.length} gauge${part.length > 1 ? 's have' : ' has'} data for only part of the period (left out of maxima)`);
  if (S.fellBack && IEMT[$('rasterA').value]) notes.push('MRMS numbers could not be loaded, so the map is showing the IEM reference picture (fixed look-back ending now, IEM colors). Key-site MRMS values are unavailable.');
  if (S.noBase) notes.push('Background map tiles are blocked on this network (CARTO, OpenStreetMap and Esri were all tried). Rainfall shading, gauges and key sites still plot correctly; only the street/imagery backdrop is missing.');
  const bad = Object.keys(SRC).filter(x => S.src[x] && S.src[x].state === 'err'); if (bad.length) notes.push(`Not loaded: ${bad.map(x => SRC[x].split(' (')[0]).join('; ')} — see Sources tab`);
  $('banner').hidden = !notes.length; $('banner').innerHTML = notes.map(esc).join('<br>');
}

/* ───────────────────────── charts ───────────────────────── */
const SERIES = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6', '--s7', '--s8'];
const slots = store.get('slots', {});
function slotFor(id) { if (slots[id] == null) { const used = new Set(S.sel.map(x => slots[x]).filter(x => x != null)); let k = 0; while (used.has(k) && k < 8) k++; slots[id] = k % 8; store.set('slots', slots); } return slots[id]; }
function toggleSel(id) { const i = S.sel.indexOf(id); if (i >= 0) { S.sel.splice(i, 1); delete slots[id]; } else { if (S.sel.length >= 8) { delete slots[S.sel.shift()]; } S.sel.push(id); slotFor(id); } store.set('sel', S.sel); store.set('slots', slots); renderSites(); renderGauges(); renderChart(); }
function chartSeries() {
  const out = [];
  for (const id of S.sel) {
    if (id.startsWith('poi:')) { const p = S.poi.find(x => 'poi:' + x[0] === id); if (!p || !S.hourly) { if (p) out.push({ id, name: p[0] + ' (MRMS — load hourly timeline)', pts: [], dash: true }); continue; } const pts = [{ t: S.hourly.a, v: 0 }]; S.hourly.cum.forEach((c, k) => { const v = sample(S.hourly.geo, p[2], p[3], c); if (v != null) pts.push({ t: S.hourly.a + (k + 1) * H, v }); }); out.push({ id, name: p[0] + ' (MRMS)', pts, dash: true }); continue; }
    const g = S.gauges.get(id); if (!g || !g.series.length) continue; const c0 = cumAt(g.series, S.a) || 0, pts = [];
    if (g.series[0].t <= S.a) pts.push({ t: S.a, v: 0 });
    for (const p of g.series) if (p.t > S.a && p.t <= S.b) { if (!g.hourly && pts.length) pts.push({ t: p.t, v: pts[pts.length - 1].v }); pts.push({ t: p.t, v: p.c - c0 }); }
    out.push({ id, name: g.id + ' · ' + g.name.replace(/^K\w+ · /, '').replace('KSC rain gauge ', 'gauge '), pts });
  }
  return out;
}
function svgEl(w, h) { return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="none" style="display:block;overflow:visible">`; }
function niceMax(v) { const steps = [0.1, 0.25, 0.5, 1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40]; return steps.find(s => s >= v * 1.05) || Math.ceil(v / 10) * 10; }
function renderChart() {
  const el = $('chart'), W = Math.max(420, el.clientWidth - 16), Hh = 280, m = { l: 40, r: 14, t: 10, b: 24 }, ser = chartSeries(), a = S.a, b = S.b;
  const ymax = niceMax(Math.max(0.1, ...ser.flatMap(s => s.pts.map(p => p.v)))), x = t => m.l + (t - a) / (b - a) * (W - m.l - m.r), y = v => Hh - m.b - v / ymax * (Hh - m.t - m.b);
  let h = svgEl(W, Hh); for (let i = 0; i <= 4; i++) { const v = ymax * i / 4; h += `<line class="gl" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${+v.toFixed(2)}"</text>`; }
  const span = (b - a) / H, stepH = span <= 12 ? 2 : span <= 30 ? 6 : span <= 80 ? 12 : 24, off = S.tz === 'UTC' ? 0 : tzOff(b, TZ.ET);
  for (let t = Math.ceil((a + off) / (stepH * H)) * stepH * H - off; t <= b; t += stepH * H) { const d = new Date(t + off), midnight = d.getUTCHours() === 0; h += `<line class="gl" x1="${x(t)}" x2="${x(t)}" y1="${m.t}" y2="${Hh - m.b}" ${midnight ? 'style="stroke:var(--line);stroke-width:1.5"' : ''}/><text x="${x(t)}" y="${Hh - 7}" text-anchor="middle">${midnight || stepH >= 24 ? `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}` : String(d.getUTCHours()).padStart(2, '0') + (S.tz === 'UTC' ? 'Z' : '')}</text>`; }
  for (const s of ser) { if (!s.pts.length) continue; const col = `var(${SERIES[slotFor(s.id)]})`; h += `<polyline fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" ${s.dash ? 'stroke-dasharray="6 4"' : ''} points="${s.pts.map(p => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')}"/>`; const L2 = s.pts[s.pts.length - 1]; h += `<circle cx="${x(L2.t)}" cy="${y(L2.v)}" r="4" fill="${col}" stroke="var(--panel)" stroke-width="2"/>`; }
  h += `<line id="xh" x1="0" x2="0" y1="${m.t}" y2="${Hh - m.b}" stroke="var(--mut)" stroke-width="1" visibility="hidden"/></svg>`;
  el.innerHTML = ser.length ? h : '<div class="box muted">Click a gauge or key site to plot it.</div>';
  $('chartLegend').innerHTML = ser.map(s => `<span data-id="${esc(s.id)}" title="Click to remove" style="color:var(${SERIES[slotFor(s.id)]})"><i class="${s.dash ? 'dash' : ''}" style="background:var(${SERIES[slotFor(s.id)]})"></i><span style="color:var(--ink2)">${esc(s.name)}${s.pts.length ? ` — <b>${s.pts[s.pts.length - 1].v.toFixed(2)}"</b>` : ''}</span></span>`).join('');
  const svg = el.querySelector('svg'); if (!svg) return;
  svg.onmousemove = ev => { const r = svg.getBoundingClientRect(), t = a + ((ev.clientX - r.left) / r.width * W - m.l) / (W - m.l - m.r) * (b - a); if (t < a || t > b) return hideTip(); const xh = svg.querySelector('#xh'); xh.setAttribute('x1', x(t)); xh.setAttribute('x2', x(t)); xh.setAttribute('visibility', 'visible');
    const rows = ser.map(s => { let v = null; for (const p of s.pts) { if (p.t <= t) v = p.v; else break; } return { s, v }; }).filter(r2 => r2.v != null).sort((p, q) => q.v - p.v);
    showTip(ev, `<div class="muted">${fmt(t)}</div>` + rows.map(r2 => `<div><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:var(${SERIES[slotFor(r2.s.id)]});margin-right:6px"></span>${esc(r2.s.name)} <b>${r2.v.toFixed(2)}"</b></div>`).join('')); };
  svg.onmouseleave = () => { hideTip(); const xh = svg.querySelector('#xh'); if (xh) xh.setAttribute('visibility', 'hidden'); };
}
const NETCOL = { ASOS: '--s1', KSC: '--s2', USGS: '--s3', DAILY: '--s4' }, NETNAME = { ASOS: 'Airfield ASOS/AWOS', KSC: 'KSC/CCSFS gauges', USGS: 'USGS gauges', DAILY: 'Daily gauges' };
function renderScatter() {
  const el = $('scatter'), W = Math.max(300, el.clientWidth - 16), Hh = 280, m = { l: 54, r: 12, t: 10, b: 30 }, gs = [...S.gauges.values()].filter(g => S.nets[g.net] && g.cmp != null && g.mrms != null && !g.flags.some(f => f.k === 'partial'));
  if (!gs.length) { el.innerHTML = '<div class="box muted">Needs MRMS and gauge totals for the same period.</div>'; $('scatterNote').textContent = ''; return; }
  const mx = niceMax(Math.max(0.5, ...gs.map(g => Math.max(g.cmp, g.mrms)))), x = v => m.l + v / mx * (W - m.l - m.r), y = v => Hh - m.b - v / mx * (Hh - m.t - m.b);
  let h = svgEl(W, Hh); for (let i = 0; i <= 4; i++) { const v = mx * i / 4; h += `<line class="gl" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/><line class="gl" x1="${x(v)}" x2="${x(v)}" y1="${m.t}" y2="${Hh - m.b}"/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end">${+v.toFixed(2)}</text><text x="${x(v)}" y="${Hh - 14}" text-anchor="middle">${+v.toFixed(2)}</text>`; }
  h += `<line x1="${x(0)}" y1="${y(0)}" x2="${x(mx)}" y2="${y(mx)}" stroke="var(--mut)" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${(W + m.l) / 2}" y="${Hh - 1}" text-anchor="middle">Gauge total over the MRMS hours (in)</text><text transform="translate(11 ${Hh / 2}) rotate(-90)" text-anchor="middle">MRMS at gauge (in)</text>`;
  for (const g of gs) h += `<circle data-id="${esc(g.id)}" cx="${x(g.cmp)}" cy="${y(g.mrms)}" r="5" fill="${g.suspect ? 'none' : `var(${NETCOL[g.net]})`}" stroke="${g.suspect ? `var(${NETCOL[g.net]})` : 'var(--panel)'}" stroke-width="2" ${g.suspect ? 'stroke-dasharray="3 2"' : ''} style="cursor:pointer"/>`;
  el.innerHTML = h + '</svg>';
  el.querySelectorAll('circle').forEach(c => { const g = S.gauges.get(c.dataset.id); c.onmousemove = ev => showTip(ev, `<b>${esc(g.id)}</b> ${esc(g.name.replace(/^K\w+ · /, ''))}<br>Gauge <b>${g.cmp.toFixed(2)}"</b> · MRMS <b>${g.mrms.toFixed(2)}"</b>${g.suspect ? '<br>Likely not reporting' : ''}`); c.onmouseleave = hideTip; c.onclick = () => toggleSel(g.id); });
  const s = stats(), nets = [...new Set(gs.map(g => g.net))];
  $('scatterNote').innerHTML = nets.map(n => `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:var(${NETCOL[n]});margin:0 5px 0 0"></span>${NETNAME[n]}&nbsp;&nbsp; `).join('') + (s.ratio ? `<br>Across ${s.pairs.length} gauges with 0.25" or more, MRMS totals ${(s.ratio * 100).toFixed(0)}% of what the gauges caught. Dashed outlines are gauges that look offline.` : '');
}
function showTip(ev, html) { const t = $('tip'); t.innerHTML = html; t.hidden = false; const w = t.offsetWidth, hh = t.offsetHeight; t.style.left = Math.min(window.innerWidth - w - 8, ev.clientX + 14) + 'px'; t.style.top = Math.max(8, ev.clientY - hh - 10) + 'px'; }
function hideTip() { $('tip').hidden = true; }

/* ───────────────────────── summary / export ───────────────────────── */
function briefText() {
  const s = stats(), L2 = [`SPACE COAST RAINFALL — ${fmt(S.a, 'UTC')} to ${fmt(S.b, 'UTC')} (${fmt(S.a, 'ET')} to ${fmt(S.b, 'ET')})`];
  if (s.top) L2.push(`Highest gauge: ${s.top.total.toFixed(2)}" at ${s.top.id} (${s.top.name.replace(/^K\w+ · /, '')}).`);
  if (s.cape) L2.push(`Highest MRMS radar estimate over the Cape/KSC: ${s.cape.max.toFixed(2)}" (${nearPoi(s.cape.lat, s.cape.lon)}); area average ${s.cape.mean.toFixed(2)}".`);
  const key = [...S.gauges.values()].filter(g => g.key && g.total != null); if (key.length) L2.push('Airfield gauges: ' + key.map(g => `${g.id} ${g.total.toFixed(2)}"${g.suspect ? ' (check gauge)' : ''}`).join(', ') + '.');
  const pr = poiRows(); if (pr.some(r => r.mrms != null)) for (const k of Object.keys(POI_KIND)) { const rs = pr.filter(r => r.kind === k && r.mrms != null); if (rs.length) L2.push(`${POI_KIND[k]} (MRMS): ` + rs.map(r => `${r.name} ${r.mrms.toFixed(2)}"`).join(', ') + '.'); }
  if (s.rate) L2.push(`Heaviest gauge rate in the final hour: ${s.rate.last1.toFixed(2)}" at ${s.rate.id}.`);
  if (s.ratio) L2.push(`MRMS is running ${Math.abs((s.ratio - 1) * 100).toFixed(0)}% ${s.ratio >= 1 ? 'above' : 'below'} ${s.pairs.length} gauges overall.`);
  L2.push(s.floods.length ? 'Active flood alerts: ' + s.floods.map(f => `${f.properties.event} (${(f.properties.areaDesc || '').split(';')[0]}) until ${fmt(Date.parse(f.properties.ends || f.properties.expires), 'ET')}`).join('; ') + '.' : 'No active flood alerts for Brevard and neighboring counties.');
  if (s.sus.length) L2.push(`Gauges likely not reporting (excluded): ${s.sus.map(g => g.id).join(', ')}.`);
  if (S.mrms) L2.push(`MRMS: ${S.mrms.products.map(p => PNAME[p]).join(' + ')}, ${fmt(S.mrms.a, 'UTC')}–${fmt(S.mrms.b, 'UTC')}. Gauge data are not quality controlled.`);
  return L2.join('\n');
}
function csvText() {
  const q = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`, rows = [['type', 'id', 'name', 'lat', 'lon', 'gauge_total_in', 'last_1h_in', 'mrms_in', 'gauge_analysis_in', 'peak_1h_mrms_in', 'flags', 'source', 'period_start_utc', 'period_end_utc']];
  const A = new Date(S.a).toISOString(), B = new Date(S.b).toISOString();
  for (const r of poiRows()) rows.push(['key site', r.name, POI_KIND[r.kind], r.lat, r.lon, '', '', r.mrms == null ? '' : r.mrms.toFixed(2), r.an == null ? '' : r.an.toFixed(2), r.pk == null ? '' : r.pk.toFixed(2), '', 'MRMS', A, B]);
  for (const g of [...S.gauges.values()].filter(g => g.total != null).sort((x, y) => y.total - x.total)) rows.push(['gauge', g.id, g.name, g.lat, g.lon, g.total.toFixed(2), g.last1 == null ? '' : g.last1.toFixed(2), g.mrms == null ? '' : g.mrms.toFixed(2), '', '', g.flags.map(f => f.k).join(' '), g.src, A, B]);
  return rows.map(r => r.map(q).join(',')).join('\r\n');
}

/* ───────────────────────── render + events ───────────────────────── */
S.ver = 0;
function syncRangeUi() {
  $('presets').querySelectorAll('button').forEach(bn => bn.classList.toggle('on', +bn.dataset.h === S.preset));
  $('tzSeg').querySelectorAll('button').forEach(bn => bn.classList.toggle('on', bn.dataset.tz === S.tz));
  $('tA').value = toInput(S.a, S.tz); $('tB').value = toInput(S.b, S.tz);
  const hrs = (S.b - S.a) / H; $('rangeNote').innerHTML = `<b>${fmt(S.a)} → ${fmt(S.b)}</b> · ${hrs >= 48 && hrs % 24 === 0 ? hrs / 24 + ' days' : +hrs.toFixed(1) + ' h'}${S.preset ? ' · rolling' : ' · fixed'} <span class="muted">(${fmt(S.a, S.tz === 'UTC' ? 'ET' : 'UTC')} → ${fmt(S.b, S.tz === 'UTC' ? 'ET' : 'UTC')})</span>`;
}
function renderAll() {
  S.ver++; if (!S.sel) S.sel = []; if (!S.sel.length && S.allDone && S.gauges.size) { const top = [...S.gauges.values()].filter(g => g.net === 'KSC' && g.total != null && !g.suspect).sort((x, y) => y.total - x.total).slice(0, 3).map(g => g.id); const keys = [...S.gauges.values()].filter(g => g.key).map(g => g.id); S.sel = keys.concat(top).slice(0, 8); S.sel.forEach(slotFor); }
  renderKpis(); renderMaps(); renderSites(); renderGauges(); renderAlerts(); renderChart(); renderScatter();
  if (S.hourly) { const e = S.hourly.a + (S.tl + 1) * H; $('tlInfo').textContent = `Accumulation ${fmt(S.hourly.a)} → ${fmt(e)}${S.hourly.fail ? ` · ${S.hourly.fail} hourly file(s) missing` : ''}`; }
  $('clkR').textContent = S.loadedAt ? fmt(S.loadedAt, S.tz, false) : 'loading…';
  $('foot').innerHTML = `Radar rainfall: NOAA/NSSL Multi-Radar Multi-Sensor (MRMS) QPE, 1-km grid, from the NOAA Open Data bucket on AWS; totals are built from the fewest accumulation files that tile the period. Airfield gauges: METAR hourly precipitation via the Iowa Environmental Mesonet, with api.weather.gov as backup. KSC/CCSFS gauges: Spaceport Weather Data Archive tipping buckets (hourly, collocated with the field-mill sites). Gauge data are not quality controlled; tipping buckets under-catch in very heavy rain and wind. Flood alerts: National Weather Service. Key-site coordinates are approximate — edit them in the Sources tab. Unofficial decision aid.`;
}
function tick() { const n = Date.now(); $('clkZ').textContent = fmt(n, 'UTC'); $('clkL').textContent = fmt(n, 'ET'); }
function init() {
  if (!Array.isArray(S.sel)) S.sel = [];
  document.documentElement.dataset.theme = store.get('theme', 'dark'); $('btnTheme').textContent = document.documentElement.dataset.theme === 'dark' ? 'Light' : 'Dark';
  $('presets').innerHTML = PRESETS.map(h => `<button data-h="${h}">${h < 168 ? 'Last ' + h + ' h' : 'Last 7 days'}</button>`).join('');
  for (const id of ['rasterA', 'rasterB']) $(id).innerHTML = RASTERS.map(r => `<option value="${r[0]}">${r[1]}</option>`).join(''); $('rasterB').value = 'idw';
  makeMap('A'); makeMap('B'); syncMaps(M.A, M.B); syncMaps(M.B, M.A); $('base').value = store.get('base', 'dark'); setBase(M.A, $('base').value); setBase(M.B, $('base').value);
  M.A.map.on('zoomend', () => drawPoints(M.A)); M.B.map.on('zoomend', () => { if (!$('wrapB').hidden) drawPoints(M.B); });
  if (S.preset) setRange(Date.now() - S.preset * H, Date.now(), S.preset); else { const c = store.get('custom', null); if (c && c[1] > c[0]) setRange(c[0], c[1], null); else setRange(Date.now() - 24 * H, Date.now(), 24); }
  renderSources(); tick(); setInterval(tick, 10000);
  $('presets').onclick = e => { const h = +e.target.dataset.h; if (!h) return; setRange(Date.now() - h * H, Date.now(), h); loadAll(); };
  $('tzSeg').onclick = e => { const z = e.target.dataset.tz; if (!z) return; S.tz = z; store.set('tz', z); syncRangeUi(); renderAll(); };
  $('btnApply').onclick = () => { const a = fromInput($('tA').value, S.tz), b = fromInput($('tB').value, S.tz); if (!isFinite(a) || !isFinite(b) || b <= a) { $('rangeNote').innerHTML = '<span style="color:var(--crit)">End must be after start.</span>'; return; } if (b - a > 31 * 24 * H) { $('rangeNote').innerHTML = '<span style="color:var(--crit)">Choose a period of 31 days or less.</span>'; return; } setRange(a, Math.min(b, Date.now()), null); loadAll(); };
  $('btnRefresh').onclick = loadAll; setInterval(() => { if ($('auto').checked && S.preset && !document.hidden) loadAll(); }, 300000);
  $('btnBrief').onclick = () => { document.body.classList.toggle('brief'); $('btnBrief').textContent = document.body.classList.contains('brief') ? 'Exit brief mode' : 'Brief mode'; setTimeout(() => { M.A.map.invalidateSize(); M.B.map.invalidateSize(); renderChart(); renderScatter(); }, 60); };
  $('btnTheme').onclick = () => { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = t; store.set('theme', t); $('btnTheme').textContent = t === 'dark' ? 'Light' : 'Dark'; };
  $('btnCopy').onclick = async () => { const t = briefText(); try { await navigator.clipboard.writeText(t); $('btnCopy').textContent = 'Copied'; } catch (e) { const w = $('tab-sources'); document.querySelector('[data-tab=sources]').click(); w.insertAdjacentHTML('afterbegin', `<div class="box"><h3>Summary (select and copy)</h3><textarea style="min-height:200px">${esc(t)}</textarea></div>`); } setTimeout(() => $('btnCopy').textContent = 'Copy summary', 1500); };
  $('btnCsv').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csvText()], { type: 'text/csv' })); a.download = `space-coast-rainfall_${ymd(S.a)}-${ymd(S.b)}.csv`; document.body.appendChild(a); a.click(); a.remove(); };
  for (const id of ['rasterA', 'rasterB', 'smooth', 'lyA', 'lyR']) $(id).onchange = renderMaps;
  $('hideSus').checked = store.get('hideSus', false); $('hideSus').onchange = () => { store.set('hideSus', $('hideSus').checked); renderMaps(); }; $('opac').oninput = renderMaps;
  $('base').onchange = () => { store.set('base', $('base').value); setBase(M.A, $('base').value); setBase(M.B, $('base').value); };
  $('btnCmp').onclick = () => { const on = $('wrapB').hidden; $('wrapB').hidden = !on; $('grpB').hidden = !on; $('btnCmp').classList.toggle('on', on); M.A.map.invalidateSize(); if (on) { M.B.map.invalidateSize(); M.B.map.setView(M.A.map.getCenter(), M.A.map.getZoom(), { animate: false }); } renderMaps(); };
  $('btnHome').onclick = () => M.A.map.setView([28.53, -80.66], 11); $('btnWide').onclick = () => M.A.map.fitBounds([[CFG.box.s + 0.2, CFG.box.w + 0.3], [CFG.box.n - 0.2, CFG.box.e - 0.1]]);
  const allOn = g => Object.values(g).every(Boolean);
  const syncChips = () => document.querySelectorAll('#filters button').forEach(bn => { const g = bn.dataset.net ? S.nets : S.kinds, k = bn.dataset.net || bn.dataset.kind; bn.classList.toggle('on', k === '*' ? allOn(g) : !allOn(g) && !!g[k]); });
  $('filters').onclick = e => { const bn = e.target.closest('button'); if (!bn) return; const g = bn.dataset.net ? S.nets : S.kinds, k = bn.dataset.net || bn.dataset.kind;
    if (k === '*') for (const x in g) g[x] = true;
    else if (e.shiftKey || e.ctrlKey || e.metaKey) { if (allOn(g)) for (const x in g) g[x] = x === k; else g[k] = !g[k]; if (!Object.values(g).some(Boolean)) for (const x in g) g[x] = true; }
    else { const only = !allOn(g) && Object.keys(g).every(x => g[x] === (x === k)); for (const x in g) g[x] = only ? true : x === k; }
    store.set('nets', S.nets); store.set('kinds', S.kinds); syncChips(); buildAnalysis(); renderAll(); };
  syncChips();
  $('btnHourly').onclick = loadHourly; $('tlSlider').oninput = () => { S.tl = +$('tlSlider').value; S.ver++; renderMaps(); $('tlInfo').textContent = `Accumulation ${fmt(S.hourly.a)} → ${fmt(S.hourly.a + (S.tl + 1) * H)}`; };
  let play = null; $('tlPlay').onclick = () => { if (play) { clearInterval(play); play = null; $('tlPlay').textContent = 'Play'; return; } $('tlPlay').textContent = 'Pause'; if (S.tl >= S.hourly.n - 1) S.tl = -1; play = setInterval(() => { if (!S.hourly || S.tl >= S.hourly.n - 1) { clearInterval(play); play = null; $('tlPlay').textContent = 'Play'; return; } S.tl++; $('tlSlider').value = S.tl; $('tlSlider').oninput(); }, 450); };
  document.querySelector('.tabs').onclick = e => { const bn = e.target.closest('button'); if (!bn) return; document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === bn)); document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x.id === 'tab-' + bn.dataset.tab)); };
  document.querySelector('.side').addEventListener('click', e => {
    const row = e.target.closest('tr.row'); if (row) { toggleSel(row.dataset.id); const ll = row.dataset.ll.split(',').map(Number); M.A.map.panTo(ll); return; }
    const id = e.target.id;
    if (id === 'kscAdd') { try { const r = parseKscTable($('kscPaste').value); for (const k in r.hourly) S.kscLocal[k] = Object.assign(S.kscLocal[k] || {}, r.hourly[k]); const keys = Object.keys(S.kscLocal).sort(); while (keys.length > 24 * 40) delete S.kscLocal[keys.shift()]; store.set('ksc', S.kscLocal); $('kscPaste').value = ''; S.kscMsg = `Added ${r.rows} gauges, ${fmt(r.first)} → ${fmt(r.last + H)}.`; loadAll(); } catch (err) { S.kscMsg = err.message; $('kscMsg').textContent = err.message; } }
    if (id === 'kscClear') { S.kscMsg = 'Pasted data cleared.'; S.kscLocal = {}; store.set('ksc', {}); loadAll(); }
    if (id === 'poiSave') { const out = []; for (const ln of $('poiEdit').value.split('\n')) { if (!ln.trim()) continue; const c = ln.split(',').map(x => x.trim()), la = +c[c.length - 2], lo = +c[c.length - 1], kind = c[c.length - 3]; if (c.length < 4 || !POI_KIND[kind] || !isFinite(la) || !isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) { $('poiMsg').textContent = 'Could not read: ' + ln; return; } out.push([c.slice(0, c.length - 3).join(', '), kind, la, lo]); } S.poi = out; store.set('poi', out); renderAll(); renderSources(); }
    if (id === 'poiReset') { S.poi = POI_DEFAULT; store.set('poi', null); renderAll(); renderSources(); }
  });
  document.querySelector('.side').addEventListener('change', e => { if (e.target.id === 'product') { S.product = e.target.value; store.set('product', S.product); loadAll(); } if (e.target.id === 'exSus') { S.excludeSuspect = e.target.checked; buildAnalysis(); renderAll(); } });
  $('chartLegend').onclick = e => { const sp = e.target.closest('[data-id]'); if (sp) toggleSel(sp.dataset.id); };
  window.addEventListener('resize', () => { renderChart(); renderScatter(); });
  loadAll();
}
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', init);
if (typeof module !== 'undefined') module.exports = { cumulativeFromMetar, parseIemCsv, parseKscTable, cumAt };
