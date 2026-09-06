"""Indicative interior and structural detail. Not measured construction design."""
import math

def build(g):
    add,box,tube,annulus,ring,loft=[g[k] for k in ['add','box','tube','annulus','ring','loft']]
    # Hollow columns now expose independent lift equipment and helical access stairs.
    for k,(cx,cy) in enumerate(g['axes']):
        for z in [0,18,78,98,132,156,180,204,228,253]:
            stop=min(z+18,267)
            steps=[]; rails=[]
            for i in range(int((stop-z)/.18)):
                a=i*math.pi/18; b=a+math.pi/18
                zz=z+.18*i
                lo=[(cx+r*math.cos(t),cy+r*math.sin(t),zz) for r,t in [(1.9,a),(3.45,a),(3.45,b),(1.9,b)]]
                steps.append(loft(lo,[(x,y,h+.12) for x,y,h in lo]))
                if i%6==0:rails.append(tube((cx+3.3*math.cos(a),cy+3.3*math.sin(a),zz),(cx+3.3*math.cos(a),cy+3.3*math.sin(a),zz+1.1),.035,N=6))
            add('IfcStairFlight',f'Tube {k+1} access stair segment {z} m — indicative',z,'Concrete',steps)
            add('IfcRailing',f'Tube {k+1} stair guard posts {z} m',z,'Steel',rails)
        for z in [18,78,90,98,132,156,180,204,228,259,263,267]:
            add('IfcDoor',f'Tube {k+1} lift landing doors {z} m',z,'Silver',[box(cx-1.2,cy-1.5,z+.3,1.15,.12,2.3),box(cx+.05,cy-1.5,z+.3,1.15,.12,2.3)])
    # Pearl ring girders and radial framing, independently selectable by floor.
    for z in [78,86,90,98,253,257,259,263,267,273,280,287]:
        center,r=(93,25) if z<120 else (272.5,22.5)
        radius=math.sqrt(r*r-(z-center)**2)-.8
        add('IfcBeam',f'{z} m pearl perimeter ring girder',z,'Steel',annulus(radius,radius-.25,z-.55,.45))
        add('IfcBeam',f'{z} m radial floor girders',z,'Steel',[tube((7*math.cos(a),7*math.sin(a),z-.3),(radius*math.cos(a),radius*math.sin(a),z-.3),.22,N=8) for a in [i*math.pi/12 for i in range(24)]])
        if z in [90,259,263,267]:
            add('IfcRailing',f'{z} m observation guard infill',z,'DarkGlass',annulus(radius-.1,radius-.16,z+.35,1.05))
            add('IfcMember',f'{z} m observation guard stanchions',z,'Silver',[tube((x,y,z+.3),(x,y,z+1.4),.04,N=6) for x,y,_ in ring(radius-.13,z,N=64)])
    # Five hotel pearls receive actual furniture, sanitary fixtures and doors.
    for z in [132,156,180,204,228]:
        for k in range(4):
            a=k*math.pi/2+math.pi/4;cx,cy=3.1*math.cos(a),3.1*math.sin(a)
            add('IfcFurnishingElement',f'Hotel {z} suite {k+1} bed and bedside table — indicative',z,'White',[box(cx-.7,cy-1,z+.4,1.4,2,.45),box(cx-.7,cy-1,z+.85,1.4,.2,.7),box(cx+.8,cy-.8,z+.3,.45,.45,.65)])
            add('IfcSanitaryTerminal',f'Hotel {z} suite {k+1} washbasin — indicative',z,'White',[box(cx-.35,cy+1.1,z+.3,.7,.45,.7)])
        add('IfcDoor',f'Hotel {z} access door — indicative',z,'Silver',[box(-.5,-5,z+.3,1,.12,2.1)])
    # Museum facade follows the mapped three-lobed footprint, in project coordinates.
    angle=math.radians(-g['site_data']['rotationDeg'])
    p=[(x*math.cos(angle)-y*math.sin(angle),x*math.sin(angle)+y*math.cos(angle)) for x,y in g['site_data']['footprint']]
    if p[0]==p[-1]:p=p[:-1]
    # OSM winding is clockwise. Reverse for outward faces.
    p=list(reversed(p))
    for z in [0,9]:
        add('IfcSlab',f'Mapped trilobular museum floor {z} m',z,'Concrete',[loft([(x,y,z) for x,y in p],[(x,y,z+.4) for x,y in p])])
    add('IfcRoof','Mapped trilobular museum roof — height indicative',9,'Silver',[loft([(x,y,11) for x,y in p],[(x,y,11.4) for x,y in p])])
    walls=[];mullions=[]
    for (x,y),(xx,yy) in zip(p,p[1:]+p[:1]):
        dx,dy=xx-x,yy-y; length=math.hypot(dx,dy)
        if length<.01:continue
        nx,ny=-dy/length*.12,dx/length*.12
        lo=[(x,y,.4),(xx,yy,.4),(xx+nx,yy+ny,.4),(x+nx,y+ny,.4)]
        walls.append(loft(lo,[(u,v,10.8) for u,v,_ in lo]))
        for j in range(max(1,math.ceil(length/2.5))):
            t=j/max(1,math.ceil(length/2.5));u=x+t*dx;v=y+t*dy
            mullions.append(tube((u,v,.4),(u,v,11),.06,N=6))
    add('IfcCurtainWall','Mapped museum perimeter glazing',0,'DarkGlass',walls)
    add('IfcMember','Museum facade mullions',0,'Silver',mullions)
    for k in range(3):
        a=math.radians(90+120*k);x,y=49*math.cos(a),49*math.sin(a)
        add('IfcDoor',f'Museum entrance {k+1} — indicative',0,'DarkGlass',[box(x-1.5,y-.15,.4,3,.3,3.2)])
        add('IfcFooting',f'Tripod foundation cap {k+1} — indicative',0,'Concrete',[box(45*math.cos(a)-5,45*math.sin(a)-5,-3,10,10,3)])
