"""User photo and low-floor drawing details; dimensions remain indicative."""
import math
import ifcopenshell.api
import ifcopenshell.util.shape_builder
from hotel_vela_geometry import stair_edge, half_depth, retreat, from_site


def low_floor_details(m, kit, partition_type, space_type, railing_type):
    """Indicative topology from Level 4, restaurant and +2.30 public plan."""
    ifc=m.ifc
    z=15.75  # Ground 0, Level 1 6, then 3.25 m pitch.
    for side,ya,yb,cy in (("South",-50.85,-44.20,-44.20),
                          ("North",-11.80,-5.15,-11.95)):
        for j in range(8):
            x=4.+j*4.95
            m.box("IfcWall",partition_type,f"Annex Room Bay Level 04 {side} {j+1}",
                  "Level 4 drawing: repeated room bays beside courtyard; approximate dimensions",
                  "Level 04",(x,ya,z),(.15,yb-ya,2.91),code="wall")
            for k,(start,width) in enumerate(((x,.7),(x+1.7,3.25))):
                m.box("IfcWall",partition_type,f"Annex Corridor Level 04 {side} {j+1}-{k+1}",
                      "Corridor wall with indicative door break from Level 4 plan",
                      "Level 04",(start,cy,z),(width,.15,2.91),code="wall")

    zones=[("Restaurant North Wing","Level 01",6.,[(4.,-14.5),(45.8,-14.5),(45.8,-5.2),(4.,-5.2)],2.91),
           ("Restaurant South Wing","Level 01",6.,[(4.,-50.8),(45.8,-50.8),(45.8,-41.5),(4.,-41.5)],2.91),
           ("Restaurant Rear Wing","Level 01",6.,[(34.2,-41.5),(45.8,-41.5),(45.8,-14.5),(34.2,-14.5)],2.91),
           ("Public Convention Zone +2.30","B02",-7.2,
            [from_site(p) for p in [(-55.,3.),(10.,3.),(10.,28.),(-55.,28.)]],2.66),
           ("Restaurant Terrace","Level 01",6.,
            [from_site(p) for p in [(-40.,9.),(10.,9.),(10.,24.),(-40.,24.)]],.10)]
    for name,level,base,profile,height in zones:
        space=m.plate("IfcSpace",space_type,name,
                      "Indicative gross zone from supplied public-floor plan; no certified fit-out",
                      None,(0.,0.,base),profile,height)
        kit.aggregate(ifc,[space],m.storeys[level])
        kit.edit(ifc,space,CompositionType="ELEMENT")
        kit.add_pset(ifc,space,"Pset_ModelConfidence",{
            "Confidence":"APPROXIMATE", "Basis":"User restaurant/terraces and +2.30 plan",
            "Limitation":"Zones only; detailed furniture, kitchens and toilets not reproduced"})
    # Rails border the courtyard, leaving the void genuinely open above podium.
    rails=[((21.,-17.55,6.),(13.,.06,1.05)),
           ((33.94,-38.5,6.),(.06,21.,1.05)),
           ((21.,-38.5,6.),(13.,.06,1.05))]
    m.boxes("IfcRailing",railing_type,"Restaurant Courtyard Guardrails",
            "Indicative glazed guard to restaurant courtyard edges","Level 01",rails,code="railing")


def photo_stairs(m, kit, levels, types):
    stair_type, flight_type, landing_type, railing_type, metal_type, panel_type = types
    ifc = m.ifc
    for (name,z), (_,top) in zip(levels, levels[1:]):
        rise = top-z
        x0, x1 = stair_edge(z), stair_edge(top)
        matrix = kit.placement_matrix((0.,0.,0.))
        obj = kit.placed_object(f"External Escape Stair - {name}", matrix)
        stair = kit.add_occurrence(ifc,obj,matrix,"IfcStair",stair_type,
                                  f"External Escape Stair - {name}",
                                  "Photo-informed recessed stair; dimensions and concealed return inferred",
                                  m.storeys[name])
        parts=[]
        landing=m.box("IfcSlab",landing_type,f"Escape Stair Landing - {name}",
                      "Front landing in curved-edge stair recess",None,
                      (x0-.30,-29.60,z-.18),(1.45,3.20,.18),code="stair")
        parts.append(landing)
        mid_x=(x0+x1)/2+3.65
        parts.append(m.box("IfcSlab",landing_type,f"Escape Stair Half Landing - {name}",
                           "Inferred return landing behind photographed stair",None,
                           (mid_x,-29.60,z+rise/2-.18),(1.1,3.2,.18),code="stair"))
        rail=m.boxes("IfcRailing",railing_type,f"Escape Stair Guardrail - {name}",
                     "Three-sided glazed guard around photographed front landing",None,[
                         ((x0-.30,-29.60,z),(.06,3.20,1.05)),
                         ((x0-.30,-29.60,z),(1.45,.06,1.05)),
                         ((x0-.30,-26.46,z),(1.45,.06,1.05))],code="railing")
        parts.append(rail)
        metal=[]
        for y in (-29.60,-28.,-26.46):
            metal.append(((x0-.34,y,z),(.05,.05,1.10)))
        metal.extend([((x0-.34,-29.60,z+1.05),(.06,3.20,.05)),
                      ((x0-.34,-29.60,z+1.05),(1.5,.05,.05)),
                      ((x0-.34,-26.45,z+1.05),(1.5,.05,.05))])
        parts.append(m.boxes("IfcMember",metal_type,f"Escape Stair Rail Frame - {name}",
                             "Metal posts and handrails visible in supplied close photographs",None,
                             metal,code="mullion"))
        # A U-return connects successive front landings. The rear flight is an
        # inference, explicitly identified instead of presenting an impossible ramp.
        for flight_i in range(2):
            start,end = ((x0+.85,mid_x+.25) if flight_i==0 else (mid_x+.25,x1+.85))
            y=-27.90 if flight_i==0 else -29.40
            n=max(2,math.ceil(rise/2/.18))
            dz=rise/2/n
            pitch=abs(end-start)/(n-1)
            boxes=[]
            for k in range(n):
                x=start+(end-start)*k/(n-1)
                boxes.append(((x-pitch/2,y,z+flight_i*rise/2+(k+1)*dz-.07),
                              (pitch+0.025,1.25,.07)))
            flight=m.boxes("IfcStairFlight",flight_type,
                           f"Escape Stair Flight {flight_i+1} - {name}",
                           "Discrete horizontal open treads; rear return and dimensions approximate",
                           None,boxes,code="stair")
            kit.edit(ifc,flight,NumberOfRisers=n,NumberOfTreads=n,
                     RiserHeight=dz,TreadLength=pitch)
            parts.append(flight)
        kit.aggregate(ifc,parts,stair)
        kit.add_pset(ifc,stair,"Pset_ModelConfidence",{
            "Basis":"User photos 1/5/6/7: slot, open treads, landings, glazed rails",
            "Unverified":"Concealed return, exact dimensions and compliance not established"})
        m.by_class.setdefault(("IfcStair","stair"),[]).append(stair)

        # Folded sheet-metal spandrel cheeks either side of the slot. Only this
        # short facade projects; the main glazed skin remains nearly flush.
        z1=min(z+1.10,top)
        xa,xb=stair_edge(z),stair_edge(z1)
        depth=half_depth(retreat(z))
        for side,ya,yb in (("South",-28-depth,-29.7),("North",-26.3,-28+depth)):
            vertices=[(xa,ya,z),(xa+.13,ya,z),(xb-.95+.13,ya,z1),(xb-.95,ya,z1),
                      (xa,yb,z),(xa+.13,yb,z),(xb-.95+.13,yb,z1),(xb-.95,yb,z1)]
            faces=[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
            obj=kit.placed_object(f"Folded Cheek {side} - {name}",matrix)
            panel=kit.add_occurrence(ifc,obj,matrix,"IfcPlate",panel_type,
                                     f"Folded Cheek {side} - {name}",
                                     "Photo-derived projecting metal cheek; set-out approximate",m.storeys[name])
            builder=ifcopenshell.util.shape_builder.ShapeBuilder(ifc)
            kit.attach(ifc,obj,panel,builder.get_representation(m.body,[builder.mesh(vertices,faces)]))
            m.by_class.setdefault(("IfcPlate","curtain"),[]).append(panel)
