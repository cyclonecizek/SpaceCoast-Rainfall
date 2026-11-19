const A=require('../app.js'),fs=require('fs'),assert=require('assert');
// KSC table
const r=A.parseKscTable(fs.readFileSync('test/ksc_past24.txt','utf8'));
assert.equal(r.rows,9);assert.equal(new Date(r.first).toISOString(),'2026-11-18T11:00:00.000Z');assert.equal(new Date(r.last).toISOString(),'2026-11-19T10:00:00.000Z');
const sum=id=>Object.values(r.hourly).reduce((s,h)=>s+(h[id]||0),0);
assert.ok(Math.abs(sum('21')-5.73)<0.006,'gauge 21 total '+sum('21'));assert.ok(Math.abs(sum('11')-3.77)<0.006);assert.equal(r.hourly['2026-11-18T21:00Z']['17'],1.12);
// without the "as of" line, inferred from the clock
const r2=A.parseKscTable(fs.readFileSync('test/ksc_past24.txt','utf8').split('\n').slice(1).join('\n'),Date.parse('2026-11-19T10:40Z'));assert.equal(r2.last,r.last);
// daily report for a specific date
const day='Rainfall Daily Report 17-Nov-2026\nLast Updated: Tuesday, November 10, 2026\nGauge\t'+Array.from({length:24},(_,i)=>String(i).padStart(2,'0')+':00').join('\t')+'\tTotal\n21\t'+Array(24).fill('0.10').join('\t')+'\t2.40\n';
const r3=A.parseKscTable(day,Date.parse('2026-11-19T10:40Z'));assert.equal(new Date(r3.first).toISOString(),'2026-11-17T00:00:00.000Z');assert.equal(new Date(r3.last).toISOString(),'2026-11-17T23:00:00.000Z');
// METAR running totals -> cumulative
const t=s=>Date.parse('2026-11-19T'+s+':00Z');
let c=A.cumulativeFromMetar([{t:t('00:53'),p:0.10},{t:t('01:10'),p:0.05},{t:t('01:30'),p:0.20},{t:t('01:53'),p:0.40},{t:t('02:53'),p:0.40},{t:t('03:53'),p:0},{t:t('04:20'),p:0.3},{t:t('04:55'),p:0.5},{t:t('05:53'),p:0.02}]);
assert.deepEqual(c.map(x=>+x.c.toFixed(2)),[0.10,0.15,0.30,0.50,0.90,0.90,1.20,1.40,1.42]);
assert.equal(+(A.cumAt(c,t('05:00'))-A.cumAt(c,t('01:00'))).toFixed(2),1.30);
// IEM csv
const by=A.parseIemCsv('station,valid,p01i\nMLB,2026-11-19 00:53,0.10\nMLB,2026-11-19 01:53,T\nXMR,2026-11-19 00:55,M\n');assert.equal(by.MLB.length,2);assert.equal(by.MLB[0].p,0.10);assert.equal(by.XMR[0].p,0);
console.log('parser tests passed');
