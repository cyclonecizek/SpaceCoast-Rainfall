import json, sys, time, datetime as dt, random, threading, http.server, functools, os, io
from playwright.sync_api import sync_playwright
from PIL import Image
ROOT=os.path.dirname(os.path.dirname(os.path.abspath(__file__))); LF='/tmp/lf/node_modules/leaflet/dist/'
now=dt.datetime.now(dt.timezone.utc); random.seed(3)
def tile():
    b=io.BytesIO(); Image.new('RGB',(256,256),(22,30,40)).save(b,'PNG'); return b.getvalue()
TILE=tile()
ST={'TTS':(55,1.0),'XMR':(55,0.8),'TIX':(53,0.7),'MLB':(53,0.35),'COI':(55,0.5),'VRB':(53,0.1),'DAB':(53,0.2),'SFB':(53,0.15),'MCO':(53,0.1),'ORL':(53,0.1),'ISM':(56,0.05),'EVB':(55,0.2),'FPR':(53,0.05),'DED':(55,0.1)}
def iem_csv():
    out=['station,valid,p01i']
    for s,(m,k) in ST.items():
        t=(now-dt.timedelta(hours=80)).replace(minute=m,second=0,microsecond=0)
        while t<now:
            wet=18<=((now-t).total_seconds()/3600)<=44
            p=round(random.random()*0.45*k,2) if wet else 0
            if s=='XMR': p=0   # simulate a gauge that is not reporting precip
            if wet and p>0.1: out.append(f"{s},{(t-dt.timedelta(minutes=25)):%Y-%m-%d %H:%M},{p*0.4:.2f}")
            out.append(f"{s},{t:%Y-%m-%d %H:%M},{p:.2f}"); t+=dt.timedelta(hours=1)
    return '\n'.join(out)+'\n'
def nws_obs():
    f=[];t=now.replace(minute=58,second=0,microsecond=0)-dt.timedelta(hours=1)
    for i in range(75):
        h=i; wet=18<=h<=44
        f.append({'properties':{'timestamp':(t-dt.timedelta(hours=i)).strftime('%Y-%m-%dT%H:%M:%S+00:00'),'precipitationLastHour':{'value':(random.random()*4 if wet else None),'unitCode':'wmoUnit:mm'}}})
    return json.dumps({'features':f})
def ksc_json():
    rows=[l.split('\t') for l in open(ROOT+'/test/ksc_past24.txt').read().splitlines()[2:]]
    last=now.replace(minute=0,second=0,microsecond=0); hourly={}
    for rep in range(3):   # 72 h of history by repeating the real 24 h block
        for r in rows:
            for k,v in enumerate(r[1:25]):
                t=last-dt.timedelta(hours=24*rep+23-k); hourly.setdefault(t.strftime('%Y-%m-%dT%H:00Z'),{})[r[0]]=float(v)*(1 if rep==0 else 0.3)
    return json.dumps({'updated':now.strftime('%Y-%m-%dT%H:%M:%SZ'),'hourly':hourly})
ALERTS=json.dumps({'features':[
 {'type':'Feature','geometry':{'type':'Polygon','coordinates':[[[-80.86,28.40],[-80.55,28.38],[-80.52,28.70],[-80.80,28.78],[-80.86,28.40]]]},'properties':{'event':'Flood Warning','areaDesc':'Brevard, FL','headline':'Flood Warning issued by NWS Melbourne FL','ends':(now+dt.timedelta(hours=6)).isoformat(),'senderName':'NWS Melbourne FL'}},
 {'type':'Feature','geometry':None,'properties':{'event':'Flood Watch','areaDesc':'Coastal Volusia; Northern Brevard; Southern Brevard','headline':'Flood Watch through Friday morning','expires':(now+dt.timedelta(hours=20)).isoformat(),'senderName':'NWS Melbourne FL'}},
 {'type':'Feature','geometry':None,'properties':{'event':'Rip Current Statement','areaDesc':'Coastal Brevard','headline':'x','expires':now.isoformat()}}]})
USGS=json.dumps({'value':{'timeSeries':[{'sourceInfo':{'siteName':'ST. JOHNS RIVER NR COCOA, FL','siteCode':[{'value':'02232400'}],'geoLocation':{'geogLocation':{'latitude':28.369,'longitude':-80.873}}},'values':[{'value':[{'value':'0.03' if 80<i<200 else '0','dateTime':(now-dt.timedelta(minutes=15*(320-i))).strftime('%Y-%m-%dT%H:%M:%S.000+00:00')} for i in range(320)]}]}]}})
GRIB=open(ROOT+'/test/sample.grib2.gz','rb').read()
log=[]
def handle(route):
    u=route.request.url
    if 'network.py' in u:
        if 'FL_ASOS' in u: return route.fulfill(body=json.dumps({'features':[{'id':'X26','properties':{'sid':'X26','sname':'SEBASTIAN MUNI','online':True},'geometry':{'coordinates':[-80.49,27.81]}},{'id':'MIA','properties':{'sid':'MIA','sname':'MIAMI'},'geometry':{'coordinates':[-80.3,25.8]}}]}),content_type='application/json')
        if 'FLCOCORAHS' in u or 'FL_COOP' in u:
            pre='FL-BV-' if 'COCO' in u else 'TITF1'
            return route.fulfill(body=json.dumps({'features':[{'id':pre+str(i),'properties':{'sid':pre+str(i),'sname':'TITUSVILLE %d.1 SW'%i},'geometry':{'coordinates':[-80.85+0.06*i,28.35+0.07*i]}} for i in range(1,6 if 'COCO' in u else 2)]}),content_type='application/json')
        return route.fulfill(body=json.dumps({'features':[]}),content_type='application/json')
    if 'daily.py' in u:
        log.append(u); ids=u.split('stations=')[1].split('&')[0].split(','); rows=['station,day,precip_in']
        for s_ in ids:
            for d in range(4): rows.append(f"{s_},{(now-dt.timedelta(days=d)):%Y-%m-%d},{[2.4,1.1,0.3,'M'][d]}")
        return route.fulfill(body='\n'.join(rows)+'\n',content_type='text/plain')
    if 'cocorahs.json' in u: return route.fulfill(status=404,body='x')
    if 'asos.py' in u: log.append(u); return route.fulfill(body=iem_csv(),content_type='text/plain')
    if 'tile.py' in u: return route.abort()
    if 'api.weather.gov/alerts' in u: return route.fulfill(body=ALERTS,content_type='application/geo+json')
    if 'api.weather.gov/stations' in u: log.append(u); return route.fulfill(body=nws_obs(),content_type='application/geo+json')
    if 'waterservices' in u: return route.fulfill(body=USGS,content_type='application/json')
    if 'noaa-mrms-pds' in u:
        log.append(u.split('/')[-1])
        if 'Pass2' in u: return route.fulfill(status=404,body='nope')
        return route.fulfill(body=GRIB,content_type='application/octet-stream')
    if 'raw.githubusercontent.com' in u: return route.fulfill(status=404,body='x')
    if 'ksc_rain.json' in u: return route.fulfill(body=ksc_json(),content_type='application/json')
    if 'localhost' in u: return route.continue_()
    return route.fulfill(body=TILE,content_type='image/png',headers={'Access-Control-Allow-Origin':'*'})
srv=http.server.ThreadingHTTPServer(('127.0.0.1',8765),functools.partial(http.server.SimpleHTTPRequestHandler,directory=ROOT)); srv.RequestHandlerClass.log_message=lambda *a:None
threading.Thread(target=srv.serve_forever,daemon=True).start()
with sync_playwright() as p:
    b=p.chromium.launch(channel='chrome',args=['--no-sandbox']); pg=b.new_page(accept_downloads=True,viewport={'width':1680,'height':1050})
    errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m: errs.append(m.text) if m.type=='error' and 'ERR_FAILED' not in m.text else None)
    pg.route('**/*',handle); pg.goto('http://localhost:8765/index.html')
    pg.wait_for_function("S.loadedAt>0",timeout=90000); pg.wait_for_timeout(800)
    pg.screenshot(path='/tmp/s1.png',full_page=True)
    print('src',json.dumps(pg.evaluate("Object.fromEntries(Object.entries(S.src).map(([k,v])=>[k,v.state+': '+v.detail]))"),indent=1))
    print('mrms',pg.evaluate("JSON.stringify({a:new Date(S.mrms.a).toISOString(),b:new Date(S.mrms.b).toISOString(),p:S.mrms.products,files:S.mrms.files.length})"))
    print('gauges',pg.evaluate("[...S.gauges.values()].filter(g=>g.net!='KSC').map(g=>g.id+' '+g.src+' '+(g.total==null?'-':g.total.toFixed(2))+(g.suspect?' SUS':'')+' '+g.flags.map(f=>f.k)).join(' | ')"))
    print('daily',pg.evaluate("[...S.gauges.values()].filter(g=>g.daily).map(g=>g.id+' '+(g.total==null?'-':g.total.toFixed(2))+' '+g.flags.map(f=>f.k)).join(' | ')"),'| X26:',pg.evaluate("S.gauges.has('KX26')"))
    print('ksc',pg.evaluate("[...S.gauges.values()].filter(g=>g.net=='KSC').map(g=>g.id+' '+g.total.toFixed(2)+(g.suspect?' SUS':'')).join(' | ')"))
    print(pg.evaluate("briefText()")); print('sections',pg.evaluate("[...document.querySelectorAll('#tab-sites tr.sec')].map(x=>x.innerText).join(' | ')")); print(pg.evaluate('csvText().split("\\n").slice(0,3).join(" // ")')[:300])
    pg.click('#filters button[data-net="KSC"]'); pg.wait_for_timeout(400)
    print('KSC only ->',pg.evaluate("[S.nets, stats().top.id, document.querySelectorAll('#tab-gauges tr.row').length, document.querySelectorAll('#mapA .gm').length]"))
    pg.click('#filters button[data-kind="air"]'); pg.wait_for_timeout(400); pg.screenshot(path='/tmp/f1.png')
    print('air only ->',pg.evaluate("[S.kinds, document.querySelectorAll('#tab-sites tr.row').length]"))
    pg.click('#filters button[data-net="KSC"]'); pg.click('#filters button[data-kind="air"]'); pg.wait_for_timeout(300); print('reset ->',pg.evaluate('[S.nets,S.kinds]'))
    pg.evaluate('openQuery(M.A,28.6028,-80.6046)'); pg.wait_for_timeout(500); print('query ->',pg.inner_text('.leaflet-popup-content').replace('\n',' | ')[:400]); pg.screenshot(path='/tmp/q1.png')
    pg.click('button[data-q=pin]'); pg.wait_for_timeout(300); print('pinned',pg.evaluate('S.poi[S.poi.length-1]')); pg.evaluate("S.poi=POI_DEFAULT;store.set('poi',null)")
    n0=pg.evaluate("document.querySelectorAll('#mapA .gm.sus').length"); pg.check('#hideSus'); pg.wait_for_timeout(300); print('suspect markers',n0,'->',pg.evaluate("document.querySelectorAll('#mapA .gm.sus').length"),'| total markers',pg.evaluate("document.querySelectorAll('#mapA .gm').length"),'|',pg.inner_text('#legend')[-90:]); pg.uncheck('#hideSus')
    with pg.expect_download(timeout=60000) as dl: pg.click('#btnReport')
    dl.value.save_as('/tmp/report.pdf'); print('report',dl.value.suggested_filename, os.path.getsize('/tmp/report.pdf'))
    # 72 h preset, compare mode, hourly timeline
    pg.click('#presets button[data-h="72"]'); pg.wait_for_function("S.loadedAt>0 && S.mrms && (S.mrms.b-S.mrms.a)>70*36e5",timeout=90000)
    print('72h parts',pg.evaluate("S.mrms.parts.map(p=>p.hours).join('+')"))
    pg.click('#btnCmp'); pg.select_option('#rasterB','diff'); pg.wait_for_timeout(600); pg.screenshot(path='/tmp/s2.png')
    pg.click('#presets button[data-h="6"]'); pg.wait_for_function("S.mrms && (S.mrms.b-S.mrms.a)<7*36e5",timeout=90000); pg.click('#btnHourly'); pg.wait_for_function("S.hourly",timeout=120000)
    pg.evaluate("toggleSel('poi:LC-39A')"); pg.click('#btnTheme'); pg.wait_for_timeout(500); pg.screenshot(path='/tmp/s3.png',full_page=True)
    # custom range in Eastern, sources tab, paste
    pg.click('#tzSeg button[data-tz="ET"]'); pg.click('[data-tab=sources]'); pg.wait_for_timeout(200)
    pg.fill('#kscPaste',open(ROOT+'/test/ksc_past24.txt').read()); pg.click('#kscAdd'); pg.wait_for_timeout(1500); print('paste msg:',pg.inner_text('#kscMsg'))
    pg.screenshot(path='/tmp/s4.png')
    pg.click('#btnTheme'); pg.click('[data-tab=sites]'); pg.click('#btnCmp'); pg.click('#btnBrief'); pg.wait_for_timeout(900); pg.screenshot(path='/tmp/s5.png')
    print('errors',errs[:8]); print('requests',log[:3],len(log))
    b.close()
