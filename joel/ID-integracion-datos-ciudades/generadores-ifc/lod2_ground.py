import json, struct, urllib.request, numpy as np, math
from pyproj import Transformer
BASE='https://kartta.hel.fi/3d/datasource-data/16fc3fd5-df6d-4f48-bfd5-9aeee430a02f/'
ecef2geo=Transformer.from_crs(4978,4979,always_xy=True)
geo2ecef=Transformer.from_crs(4979,4978,always_xy=True)
LON,LAT=24.93957,60.17176
px,py,pz=geo2ecef.transform(LON,LAT,20)
P=np.array([px,py,pz])
def get(rel): return urllib.request.urlopen(BASE+rel).read()
def contains(bv,M):
    if 'region' in bv:
        w,s,e,n=bv['region'][:4]; return w-0.0005<math.radians(LON)<e+0.0005 and s-0.0005<math.radians(LAT)<n+0.0005
    if 'box' in bv:
        b=np.array(bv['box']); c=(M@np.r_[b[:3],1])[:3]; return np.linalg.norm(P-c) < np.linalg.norm(b[3:6])+np.linalg.norm(b[6:9])+np.linalg.norm(b[9:12])+80
    return True
leaves=[]
def walk(t,M,base):
    if 'transform' in t: M=M@np.array(t['transform']).reshape(4,4).T
    if not contains(t['boundingVolume'],M): return
    c=t.get('content',{}).get('uri') or t.get('content',{}).get('url')
    if c:
        if c.endswith('.json'):
            ts=json.loads(get(base+c)); walk(ts['root'],M,base+c.rsplit('/',1)[0]+'/' if '/' in c else base)
        elif not t.get('children'): leaves.append((base+c,M))
    for ch in t.get('children',[]): walk(ch,M,base)
ts=json.loads(get('tileset.json')); walk(ts['root'],np.eye(4),'')
print('leaves',len(leaves))
res=[]
for uri,M in leaves:
    b=get(uri); _,_,_,ftj,ftb,btj,btb=struct.unpack('<4sIIIIII',b[:28])
    ft=json.loads(b[28:28+ftj]); rtc=np.array(ft.get('RTC_CENTER',[0,0,0]))
    g0=28+ftj+ftb+btj+btb; jl=struct.unpack('<I',b[g0+12:g0+16])[0]; g=json.loads(b[g0+20:g0+20+jl]); bin0=g0+20+jl+8
    def nmat(nd):
        if 'matrix' in nd: return np.array(nd['matrix']).reshape(4,4).T
        Mx=np.eye(4)
        if 'translation' in nd: Mx[:3,3]=nd['translation']
        if 'rotation' in nd:
            qx,qy,qz,qw=nd['rotation']
            Mx[:3,:3]=np.array([[1-2*(qy*qy+qz*qz),2*(qx*qy-qz*qw),2*(qx*qz+qy*qw)],[2*(qx*qy+qz*qw),1-2*(qx*qx+qz*qz),2*(qy*qz-qx*qw)],[2*(qx*qz-qy*qw),2*(qy*qz+qx*qw),1-2*(qx*qx+qy*qy)]])
        return Mx
    meshes=[]
    def wn(i,Mp):
        nd=g['nodes'][i]; Mn=Mp@nmat(nd)
        if 'mesh' in nd: meshes.append((g['meshes'][nd['mesh']],Mn))
        for c in nd.get('children',[]): wn(c,Mn)
    for i in g['scenes'][g.get('scene',0)]['nodes']: wn(i,np.eye(4))
    for mm,Mn in meshes:
        for p in mm['primitives']:
            a=g['accessors'][p['attributes']['POSITION']]; v=g['bufferViews'][a['bufferView']]
            off=bin0+v.get('byteOffset',0)+a.get('byteOffset',0); st=v.get('byteStride',12)
            raw=np.frombuffer(b,np.uint8,count=st*(a['count']-1)+12,offset=off)
            pos=np.lib.stride_tricks.as_strided(raw,shape=(a['count'],12),strides=(st,1)).copy().view(np.float32).reshape(-1,3).astype(float)
            # glTF y-up -> z-up
            pos=(Mn@np.c_[pos,np.ones(len(pos))].T).T[:,:3]
            pos=np.c_[pos[:,0],-pos[:,2],pos[:,1]]+rtc
            w=(M@np.c_[pos,np.ones(len(pos))].T).T[:,:3]
            lon,lat,h=ecef2geo.transform(w[:,0],w[:,1],w[:,2])
            ab=g['accessors'][p['attributes']['_BATCHID']]; vb=g['bufferViews'][ab['bufferView']]
            offb=bin0+vb.get('byteOffset',0)+ab.get('byteOffset',0)
            bid=np.frombuffer(b,{5126:np.float32,5123:np.uint16,5125:np.uint32}[ab['componentType']],count=ab['count'],offset=offb).astype(float)
            res.append(np.c_[lon,lat,h,bid+hash(uri)%100000*10000])
R=np.vstack(res)
T=Transformer.from_crs(4326,3879,always_xy=True); e0,n0=T.transform(LON,LAT)
e,n=T.transform(R[:,0],R[:,1]); x=e-e0; y=n-n0
sel=(abs(x)<150)&(abs(y)<150)
print('verts',sel.sum())
for b_ in np.unique(R[sel,3]):
    mm=sel&(R[:,3]==b_)
    if mm.sum()<8: continue
    print(f'{x[mm].mean():7.1f} {y[mm].mean():7.1f}  base {R[mm,2].min():6.2f}  top {R[mm,2].max():6.2f}  n={mm.sum()}')
