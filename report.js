/* Leadership PDF report for the selected period. Uses the data already loaded in the dashboard (app.js). */
'use strict';
const REPORT = {
  view: { s: 28.03, n: 28.80, w: -80.99, e: -80.40 },   // map extent in the report: KSC, CCSFS, Patrick, Melbourne
  zoom: 11,
};

function loadTile(url) {
  return new Promise(res => { const im = new Image(); im.crossOrigin = 'anonymous'; const t = setTimeout(() => res(null), 7000); im.onload = () => { clearTimeout(t); res(im); }; im.onerror = () => { clearTimeout(t); res(null); }; im.src = url; });
}
/* Static map drawn on a canvas: basemap tiles (when the tile server allows it), rainfall shading, gauges, numbered key sites. */
async function reportMap(sites) {
  const v = REPORT.view, z = REPORT.zoom, n = 256 * Math.pow(2, z);
  const X = lon => (lon + 180) / 360 * n, Y = lat => (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2 * n;
  const x0 = X(v.w), y0 = Y(v.n), W = Math.round(X(v.e) - x0), Hh = Math.round(Y(v.s) - y0);
  const draw = async tileUrl => {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = Hh; const c = cv.getContext('2d');
    c.fillStyle = '#e9eef2'; c.fillRect(0, 0, W, Hh); let tiles = 0;
    if (tileUrl) {
      const jobs = [];
      for (let tx = Math.floor(x0 / 256); tx <= Math.floor((x0 + W) / 256); tx++) for (let ty = Math.floor(y0 / 256); ty <= Math.floor((y0 + Hh) / 256); ty++)
        jobs.push(loadTile(tileUrl.replace('{z}', z).replace('{x}', tx).replace('{y}', ty).replace('{r}', '')).then(im => { if (im) { c.drawImage(im, tx * 256 - x0, ty * 256 - y0); tiles++; } }));
      await Promise.all(jobs);
    }
    if (!tiles) {   // no backdrop available: light graticule so the map still reads
      c.strokeStyle = '#c9d2da'; c.lineWidth = 1; c.fillStyle = '#7b8794'; c.font = '13px Helvetica, Arial, sans-serif';
      for (let la = Math.ceil(v.s * 10) / 10; la < v.n; la += 0.1) { c.beginPath(); c.moveTo(0, Y(la) - y0); c.lineTo(W, Y(la) - y0); c.stroke(); c.fillText(la.toFixed(1) + '°N', 4, Y(la) - y0 - 3); }
      for (let lo = Math.ceil(v.w * 10) / 10; lo < v.e; lo += 0.1) { c.beginPath(); c.moveTo(X(lo) - x0, 0); c.lineTo(X(lo) - x0, Hh); c.stroke(); c.fillText(Math.abs(lo).toFixed(1) + '°W', X(lo) - x0 + 3, Hh - 5); }
    }
    // rainfall shading
    if (S.mrms) {
      const r = rasterCanvas(S.mrms.grid, S.mrms.grid.data, LEVELS, RGB, true), im = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = r.url; });
      if (im) { const [[s, w], [nn, e]] = r.bounds; c.globalAlpha = tiles ? 0.62 : 0.85; c.drawImage(im, X(w) - x0, Y(nn) - y0, X(e) - X(w), Y(s) - Y(nn)); c.globalAlpha = 1; }
    }
    // flood alert outlines
    for (const f of S.alerts) { const g = f.geometry; if (!g || !/Flood/.test(f.properties.event)) continue; const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
      c.strokeStyle = /Warning/.test(f.properties.event) ? '#0a7d2c' : '#3a7f63'; c.lineWidth = 3; c.setLineDash(/Warning/.test(f.properties.event) ? [] : [10, 7]);
      for (const p of polys) { c.beginPath(); p[0].forEach((q, i) => i ? c.lineTo(X(q[0]) - x0, Y(q[1]) - y0) : c.moveTo(X(q[0]) - x0, Y(q[1]) - y0)); c.closePath(); c.stroke(); } }
    c.setLineDash([]);
    // key sites first (they must all show), then gauge totals, highest first, skipping any that would overlap
    const placed = [], hit = b => placed.some(q => b[0] < q[2] && b[2] > q[0] && b[1] < q[3] && b[3] > q[1]);
    const inView = (lat, lon) => lat > v.s && lat < v.n && lon > v.w && lon < v.e;
    sites.forEach((p, i) => { if (!inView(p.lat, p.lon)) return; const px = X(p.lon) - x0, py = Y(p.lat) - y0; placed.push([px - 13, py - 13, px + 13, py + 13]); });
    c.font = 'bold 17px Helvetica, Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const g of fullGauges().sort((a, b) => b.total - a.total)) {
      if (!inView(g.lat, g.lon)) continue; const px = X(g.lon) - x0, py = Y(g.lat) - y0, txt = g.total.toFixed(2), w = c.measureText(txt).width + 14, box = [px - w / 2 - 2, py - 13, px + w / 2 + 2, py + 13];
      if (hit(box)) continue; placed.push(box); const col = colorFor(g.total) || '#ffffff';
      c.fillStyle = col; c.strokeStyle = '#111'; c.lineWidth = 1.6; c.beginPath(); if (c.roundRect) c.roundRect(px - w / 2, py - 11, w, 22, g.key ? 3 : 11); else c.rect(px - w / 2, py - 11, w, 22); c.fill(); c.stroke(); c.fillStyle = inkFor(col); c.fillText(txt, px, py + 1);
    }
    c.font = 'bold 15px Helvetica, Arial, sans-serif';
    sites.forEach((p, i) => { if (!inView(p.lat, p.lon)) return; const px = X(p.lon) - x0, py = Y(p.lat) - y0; c.beginPath(); c.arc(px, py, 11.5, 0, 6.3); c.fillStyle = '#10151b'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#fff'; c.stroke(); c.fillStyle = '#fff'; c.fillText(String(i + 1), px, py + 1); });
    c.strokeStyle = '#1b2530'; c.lineWidth = 2; c.strokeRect(1, 1, W - 2, Hh - 2);
    return { cv, tiles };
  };
  const bases = [BASES.light[0], BASES.osm[0], null];
  for (const b of bases) { try { const r = await draw(b); if (b && !r.tiles) continue; return { url: r.cv.toDataURL('image/jpeg', 0.9), w: W, h: Hh, backdrop: !!r.tiles }; } catch (e) { /* tainted canvas or tile failure: try the next backdrop */ } }
  const r = await draw(null); return { url: r.cv.toDataURL('image/jpeg', 0.9), w: W, h: Hh, backdrop: false };
}

async function generateReport() {
  if (!window.jspdf) throw Error('PDF library did not load.');
  const { jsPDF } = window.jspdf, doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' }), PW = 792, PH = 612, M = 30;
  const order = AREAS.map(a => a[0]), s = stats(), sites = poiRows().map(r => ({ ...r, area: siteArea(r) })).sort((a, b) => order.indexOf(a.area) - order.indexOf(b.area)), now = Date.now(), ink = [16, 21, 27], mut = [95, 107, 120];
  const hrs = (S.b - S.a) / H, span = hrs >= 48 && hrs % 24 === 0 ? `${hrs / 24} days` : `${+hrs.toFixed(1)} hours`;
  const header = title => {
    doc.setFillColor(16, 21, 27); doc.rect(0, 0, PW, 46, 'F'); doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.text(title, M, 29);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.text(`${fmt(S.a, 'ET')} to ${fmt(S.b, 'ET')}   (${fmt(S.a, 'UTC')} to ${fmt(S.b, 'UTC')})   ·   ${span}`, PW - M, 20, { align: 'right' });
    doc.text(`Generated ${fmt(now, 'ET')} / ${fmt(now, 'UTC')}`, PW - M, 34, { align: 'right' });
  };
  const footer = () => { const n = doc.getNumberOfPages(); for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...mut); doc.text('Unofficial decision aid. Gauge data are not quality controlled. Radar estimates are NOAA MRMS. Key-site values are the radar estimate for the 1-km cell over the site.', M, PH - 16); doc.text(`Page ${i} of ${n}`, PW - M, PH - 16, { align: 'right' }); } };
  const shade = (data, cols) => { if (data.section !== 'body' || !cols.includes(data.column.index)) return; const v = parseFloat(data.cell.raw); if (!isFinite(v)) return; const c = colorFor(v); if (c) { data.cell.styles.fillColor = hex(c); data.cell.styles.textColor = inkFor(c) === '#fff' ? 255 : 20; data.cell.styles.fontStyle = 'bold'; } };

  /* ── page 1: map + bottom line + key sites ── */
  header('Space Coast Rainfall Summary');
  const map = await reportMap(sites), mh = PH - 46 - 20 - 56, mw = mh * map.w / map.h, mx = M, my = 58;
  doc.addImage(map.url, 'JPEG', mx, my, mw, mh);
  // legend under the map
  const lw = mw / COLORS.length, ly = my + mh + 6; COLORS.forEach((c, i) => { doc.setFillColor(...hex(c)); doc.rect(mx + i * lw, ly, lw + 0.3, 7, 'F'); });
  doc.setFontSize(6); doc.setTextColor(...mut); LEVELS.forEach((l, i) => { if (i) doc.text(String(l), mx + i * lw, ly + 14, { align: 'center' }); });
  doc.setFontSize(7); doc.text(`Shading: MRMS radar-estimated rainfall (in)${S.mrms ? `, ${fmt(S.mrms.a, 'UTC')}–${fmt(S.mrms.b, 'UTC')}` : ' — not available'}. Pills: gauge totals. Numbered dots: key sites.`, mx, ly + 23);

  const rx = mx + mw + 18, rw = PW - M - rx; let y = 58;
  const base = { theme: 'plain', styles: { font: 'helvetica', fontSize: 8, cellPadding: { top: 2.1, bottom: 2.1, left: 4, right: 4 }, textColor: ink, lineColor: [215, 222, 229], lineWidth: { bottom: 0.5 } }, headStyles: { fontSize: 7, textColor: mut, fontStyle: 'bold' } };
  const gAll = [...S.gauges.values()].filter(g => S.nets[g.net] && g.total != null).map(g => Object.assign(g, { area: gaugeArea(g) })), gFull = topPool();
  const out = S.kscOut && S.b > S.kscOut.t + 90 * 60000 ? S.kscOut : null, outTxt = out ? `${out.exact ? '' : 'about '}${fmt(out.t, 'UTC')} (${fmt(out.t, 'ET')})` : '';
  if (out) {   // outage callout
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    const msg = doc.splitTextToSize(`KSC/CCSFS RAIN GAUGES DOWN — no gauge in the network has recorded rain since ${outTxt}, while nearby airfield gauges recorded up to ${out.ev[0].v.toFixed(2)}" after that (${out.ev.slice(0, 3).map(e => `${e.g.id} ${e.v.toFixed(2)}"`).join(', ')}). KSC/CCSFS gauge totals below count rain only up to that time (shown with "+"). Use the radar estimate for rain after it.`, rw - 16);
    doc.setFillColor(253, 236, 236); doc.setDrawColor(200, 48, 44); doc.setLineWidth(1); doc.rect(rx, y, rw, msg.length * 9.6 + 10, 'FD'); doc.setTextColor(140, 20, 18); doc.text(msg, rx + 8, y + 12); y += msg.length * 9.6 + 18; doc.setDrawColor(0);
  }
  // by installation
  const inst = AREAS.slice(0, 3).map(([k, name]) => {
    const gs = gFull.filter(g => g.area === k).sort((a, b) => b.total - a.total), ps = sites.filter(p => p.area === k && p.mrms != null).map(p => p.mrms), l1 = gs.filter(g => g.last1 != null && !isOut(g)).sort((a, b) => b.last1 - a.last1)[0];
    return [name, gs.length ? gs[0].total.toFixed(2) + (isOut(gs[0]) ? '+' : '') : '—', gs.length ? gs[0].id : '', ps.length ? (Math.min(...ps).toFixed(1) === Math.max(...ps).toFixed(1) ? Math.max(...ps).toFixed(2) : `${Math.min(...ps).toFixed(1)}–${Math.max(...ps).toFixed(1)}`) : '—', l1 ? l1.last1.toFixed(2) : '—'];
  });
  doc.autoTable({ ...base, startY: y, margin: { left: rx, right: M }, tableWidth: rw, head: [['Installation', 'Highest gauge (in)', 'at', 'Radar est. at key sites (in)', 'Last hour, max (in)']], body: inst,
    styles: { ...base.styles, fontSize: 9, cellPadding: { top: 3.5, bottom: 3.5, left: 4, right: 4 } }, columnStyles: { 0: { fontStyle: 'bold' }, 1: { halign: 'center', cellWidth: 62 }, 2: { cellWidth: 40, textColor: mut }, 3: { halign: 'center' }, 4: { halign: 'center', cellWidth: 62 } }, didParseCell: d => shade(d, [1]) });
  y = doc.lastAutoTable.finalY + 14;
  doc.setTextColor(...ink); doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('Bottom line', rx, y); y += 4;
  const bullets = [];
  if (s.cape) bullets.push(`Highest radar estimate over the Cape/KSC: ${s.cape.max.toFixed(2)}" (${nearPoi(s.cape.lat, s.cape.lon)}); area average ${s.cape.mean.toFixed(2)}".`);
  if (s.ratio) bullets.push(`Radar estimates are running ${Math.abs((s.ratio - 1) * 100).toFixed(0)}% ${s.ratio >= 1 ? 'above' : 'below'} ${s.pairs.length} gauges overall.`);
  bullets.push(s.floods.length ? `Active: ${[...new Set(s.floods.map(f => f.properties.event))].join(', ')}${s.floods[0].properties.ends || s.floods[0].properties.expires ? ` (until ${fmt(Date.parse(s.floods[0].properties.ends || s.floods[0].properties.expires), 'ET')})` : ''}.` : (S.src.alerts && S.src.alerts.state === 'ok' ? 'No active flood alerts for Brevard and neighboring counties.' : 'Flood alert status was not available.'));
  if (!s.top && !s.cape) bullets.unshift('Rainfall data were not available when this report was generated.');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  for (const b of bullets) { const lines = doc.splitTextToSize(b, rw - 12); doc.setFillColor(...ink); doc.circle(rx + 3, y + 7.5, 1.5, 'F'); doc.text(lines, rx + 11, y + 10.5); y += lines.length * 10.8 + 2.5; }
  y += 5;
  const body = []; let estY = 0;
  for (const [k, name] of AREAS) { const rs = sites.filter(r => r.area === k); if (!rs.length) continue; body.push([{ content: name, colSpan: 5, styles: { fillColor: [232, 237, 242], textColor: [60, 72, 86], fontStyle: 'bold', fontSize: 7.5 } }]);
    for (const r of rs) body.push([String(sites.indexOf(r) + 1), r.name, r.mrms == null ? '—' : r.mrms.toFixed(2), r.an == null ? '—' : '~' + r.an.toFixed(2), r.ng ? `${r.ng.g.id}  ${r.ng.g.total.toFixed(2)}"  (${r.ng.d < 0.3 ? 'on site' : r.ng.d.toFixed(0) + ' km'})` : '—']); }
  doc.autoTable({ ...base, startY: y, margin: { left: rx, right: M, bottom: 30 }, tableWidth: rw, head: [['#', 'Key site', 'Radar estimate (in)', 'Est. from nearby gauges* (in)', 'Nearest gauge (measured)']], body,
    styles: { ...base.styles, fontSize: 7.6, cellPadding: { top: 1.7, bottom: 1.7, left: 4, right: 4 } }, columnStyles: { 0: { cellWidth: 18, halign: 'center' }, 2: { halign: 'center', cellWidth: 54 }, 3: { halign: 'center', cellWidth: 62, fontStyle: 'italic', textColor: [70, 82, 96] } }, didParseCell: d => shade(d, [2]),
    didDrawCell: d => { if (d.section === 'body' && d.column.index === 4 && d.row.index === body.length - 1) estY = d.cell.y + d.cell.height; },
    didDrawPage: d => { if (d.pageNumber > 1) header('Rainfall Summary — Key Sites (cont.)'); } });
  if (estY && estY < PH - 44 && doc.getNumberOfPages() === 1) { doc.setFont('helvetica', 'italic'); doc.setFontSize(7); doc.setTextColor(...mut); doc.text(doc.splitTextToSize('* Not a measurement at the site: a distance-weighted average of rain gauges within 10 km (blank if none). Radar estimate is MRMS for the 1-km cell over the site.', rw), rx, estY + 10); }

  /* ── page 2: gauges by installation ── */
  doc.addPage(); header('Rainfall Summary — Gauges by Installation');
  const tag = g => isOut(g) ? (!g.lastRain ? 'No rain recorded in the stored record' : S.kscOut.t - g.lastRain.t > 6 * H ? `Last rain recorded ${fmt(g.lastRain.t, 'UTC')}` : `No data after ${fmt(S.kscOut.t, 'UTC')}`) : g.suspect ? 'Check gauge — likely not reporting' : g.flags.some(f => f.k === 'partial') ? 'Partial period' : g.daily ? 'Daily 7 AM reading' : g.flags.some(f => f.k === 'stale') ? 'Stale' : '';
  const colW = (PW - 2 * M - 20) / 2, x2 = M + colW + 20, label = g => g.net === 'ASOS' ? g.name.replace(' · ', '  ') : g.net === 'KSC' ? `${g.id}  KSC archive gauge ${+g.id.slice(2)}` : `${g.id}  ${g.name.replace(/^(USGS|CoCoRaHS|COOP) /, '').slice(0, 26)}`;
  const gTable = (title, list, x, y0, max) => {
    list = list.slice().sort((a, b) => (!!b.key - !!a.key) || (b.total - a.total)); const show = list.slice(0, max);
    doc.setTextColor(...ink); doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(title + (list.length > show.length ? `  (top ${show.length} of ${list.length})` : ''), x, y0);
    doc.autoTable({ ...base, styles: { ...base.styles, fontSize: 7.6, cellPadding: { top: 1.7, bottom: 1.7, left: 4, right: 4 } }, startY: y0 + 6, margin: { left: x, bottom: 30 }, tableWidth: colW, pageBreak: 'avoid', head: [['Gauge', 'Total (in)', 'Last 1 h', 'Radar est.', 'Note']],
      body: show.length ? show.map(g => [label(g), g.total.toFixed(2) + (isOut(g) && g.total > 0 ? '+' : ''), isOut(g) ? '—' : fin(g.last1), fin(g.mrms), tag(g)]) : [['No gauge data for this period', '', '', '', '']],
      columnStyles: { 1: { halign: 'center', cellWidth: 46 }, 2: { halign: 'center', cellWidth: 40 }, 3: { halign: 'center', cellWidth: 46 }, 4: { fontSize: 6.5, textColor: mut } }, didParseCell: d => shade(d, [1]) });
    return doc.lastAutoTable.finalY;
  };
  gTable('Kennedy Space Center', gAll.filter(g => g.area === 'KSC'), M, 66, 36);
  const yC = gTable('Cape Canaveral SFS', gAll.filter(g => g.area === 'CCSFS'), x2, 66, 24);
  if (yC < PH - 110) gTable('Patrick SFB', gAll.filter(g => g.area === 'PSFB'), x2, yC + 22, 6);

  /* ── page 3: surrounding area, alerts, notes ── */
  doc.addPage(); header('Rainfall Summary — Surrounding Area');
  gTable('Surrounding area gauges', gAll.filter(g => g.area === 'OTHER'), M, 66, 36);
  let yL = 66;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...ink); doc.text('Watches, warnings and advisories', x2, yL); yL += 6; doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  const al = S.alerts.slice(0, 8).map(f => `${f.properties.event} — ${(f.properties.areaDesc || '').split(';').slice(0, 3).join(';')}${f.properties.ends || f.properties.expires ? ` — until ${fmt(Date.parse(f.properties.ends || f.properties.expires), 'ET')}` : ''}`);
  for (const a of (al.length ? al : [S.src.alerts && S.src.alerts.state === 'ok' ? 'None active for Brevard and neighboring counties.' : 'Alert status was not available.'])) { const lines = doc.splitTextToSize(a, colW - 10); doc.text(lines, x2 + 8, yL + 10); doc.circle(x2 + 2.5, yL + 7, 1.4, 'F'); yL += lines.length * 10.5 + 3; }
  yL += 14; const notes = [];
  if (S.mrms) notes.push(`Radar estimate: MRMS ${S.mrms.products.map(p => PNAME[p]).join(' + ')}, whole hours ${fmt(S.mrms.a, 'UTC')} to ${fmt(S.mrms.b, 'UTC')}.`); else notes.push('Radar estimate (MRMS) was not available; key-site values are blank.');
  if (s.sus.length) notes.push(`${s.sus.length} gauge${s.sus.length > 1 ? 's' : ''} read zero while radar or neighbors show rain and ${S.excludeSuspect ? 'are excluded from maxima' : 'are included'}: ${s.sus.map(g => g.id).join(', ')}.`);
  if (out) notes.push(`KSC/CCSFS gauge network: last rain recorded by any gauge at ${outTxt}. Nearby airfield gauges recorded up to ${out.ev[0].v.toFixed(2)}" after that, so the network is treated as down from then; its totals are lower bounds and are left out of the gauge analysis and radar comparison.`);
  else if (S.kscLast) notes.push(`KSC/CCSFS gauge network: last rain recorded by any gauge at ${S.kscLast.exact ? '' : 'about '}${fmt(S.kscLast.t, 'UTC')}.`);
  if (S.src.ksc && S.src.ksc.state === 'err') notes.push('KSC/CCSFS gauge data could not be loaded.');
  const bad = Object.keys(SRC).filter(k => S.src[k] && S.src[k].state === 'err'); if (bad.length) notes.push(`Not loaded: ${bad.map(k => SRC[k].split(' (')[0]).join('; ')}.`);
  notes.push('Installation grouping: key sites are assigned by name; archive gauges are assigned by position (east of the Banana River = Cape Canaveral SFS) and may be approximate near the boundary. Public gauges (USGS, CoCoRaHS, COOP) are listed under the surrounding area.');
  notes.push('Highest gauge and last-hour values by installation use gauges with complete data for the period; gauges that look offline and once-a-day gauges are left out.');
  notes.push('Tipping-bucket gauges under-report in very heavy rain and wind. "Est. from nearby gauges" at key sites is a distance-weighted average of gauges within 10 km, not a measurement at the site.');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...ink); doc.text('Notes', x2, yL); yL += 6; doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...mut);
  for (const nt of notes) { const lines = doc.splitTextToSize(nt, colW - 4); if (yL + lines.length * 9.6 > PH - 30) break; doc.text(lines, x2, yL + 9); yL += lines.length * 9.6 + 4; }
  footer();
  const stamp = new Date(S.b).toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '_');
  const name = `Space-Coast-Rainfall-Report_${stamp}Z_${Math.round(hrs)}h.pdf`, url = URL.createObjectURL(doc.output('blob'));
  try { const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); } catch (e) { /* download blocked: the caller still offers the link */ }
  return { name, url };
}
