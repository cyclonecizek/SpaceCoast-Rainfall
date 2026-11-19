const MRMS=require('../mrms.js'),fs=require('fs');
(async()=>{
 const buf=fs.readFileSync('test/sample.grib2.gz'),exp=JSON.parse(fs.readFileSync('test/sample.grib2.gz.json'));
 const t=Date.now();const g=await MRMS.decode(buf,{s:27.3,n:29.5,w:-81.7,e:-79.9});
 console.log('decoded',g.nx,g.ny,'west',g.west.toFixed(3),'north',g.north.toFixed(3),new Date(g.ref).toISOString(),(Date.now()-t)+'ms');
 let bad=0;for(const [la,lo,v] of exp){const j=Math.round((g.north-la)/g.dy),i=Math.round((lo-g.west)/g.dx),got=g.data[j*g.nx+i];const ok=Math.abs(got-v)<0.051;if(!ok)bad++;console.log(la,lo,'expected',v,'got',got.toFixed(2),ok?'OK':'MISMATCH');}
 console.log(JSON.stringify(MRMS.decompose(0,71*36e5).map(x=>x.hours)),JSON.stringify(MRMS.decompose(0,168*36e5).map(x=>x.hours)));
 process.exit(bad?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
