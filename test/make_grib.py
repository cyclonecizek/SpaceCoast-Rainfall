import eccodes as ec, numpy as np, gzip, json, sys
out=sys.argv[1]
# MRMS-like grid, reduced width for speed but same conventions: N->S, 0.01 deg, lon 0-360
Ni,Nj=7000,3500
lat1,lon1=54.995,230.005
rng=np.random.default_rng(1)
jj,ii=np.mgrid[0:Nj,0:Ni]
lat=lat1-0.01*jj; lon=lon1+0.01*ii-360
vals=np.full((Nj,Ni),-3.0)
cov=(lat<50)&(lat>24)
blob=120*np.exp(-(((lat-28.5)/0.25)**2+((lon+80.6)/0.3)**2))+rng.random((Nj,Ni))*2
vals[cov]=np.round(blob[cov],1)
h=ec.codes_grib_new_from_samples("regular_ll_sfc_grib2")
for k,v in dict(Ni=Ni,Nj=Nj,latitudeOfFirstGridPointInDegrees=lat1,longitudeOfFirstGridPointInDegrees=lon1,
  latitudeOfLastGridPointInDegrees=lat1-0.01*(Nj-1),longitudeOfLastGridPointInDegrees=lon1+0.01*(Ni-1),
  iDirectionIncrementInDegrees=0.01,jDirectionIncrementInDegrees=0.01,dataDate=20261119,dataTime=600).items(): ec.codes_set(h,k,v)
ec.codes_set(h,"decimalScaleFactor",1)
ec.codes_set(h,"bitsPerValue",16)
ec.codes_set(h,"packingType","grid_png")
ec.codes_set_values(h,vals.ravel())
msg=ec.codes_get_message(h)
print("packing",ec.codes_get(h,"packingType"),"bits",ec.codes_get(h,"bitsPerValue"),"scan",ec.codes_get(h,"scanningMode"),len(msg))
back=ec.codes_get_values(h).reshape(Nj,Ni)
open(out,"wb").write(gzip.compress(msg))
pts=[(28.6083,-80.6041),(28.2349,-80.6101),(28.1028,-80.6453),(29.0,-81.0),(27.5,-80.2)]
exp=[]
for la,lo in pts:
    j=int(round((lat1-la)/0.01)); i=int(round((lo+360-lon1)/0.01)); exp.append([la,lo,float(back[j,i])])
json.dump(exp,open(out+".json","w"))
print(exp)
