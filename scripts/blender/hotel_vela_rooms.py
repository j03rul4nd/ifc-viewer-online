"""Selectable room interiors traced topologically from supplied hotel plans.

Set-out, fixture sizes and wall thicknesses remain estimates. No room numbers
or construction specifications are claimed to reproduce the operating hotel.
"""
import ifcopenshell.api
from hotel_vela_geometry import half_depth


def build_rooms(m, kit, levels, plate_at, stair_edge, partition_type, space_type):
    ifc = m.ifc
    timber = ifcopenshell.api.run('material.add_material', ifc, name='Indicative interior timber', category='wood')
    ceramic = ifcopenshell.api.run('material.add_material', ifc, name='Indicative sanitary ceramic', category='ceramic')
    door_type = kit.add_simple_type(ifc, 'IfcDoorType', 'DOO-Interior-Estimated', 'DOOR', timber)
    kit.edit(ifc, door_type, OperationType='SINGLE_SWING_LEFT')
    wc_type = kit.add_simple_type(ifc, 'IfcSanitaryTerminalType', 'SAN-WC-Estimated', 'WCSEAT', ceramic)
    basin_type = kit.add_simple_type(ifc, 'IfcSanitaryTerminalType', 'SAN-Basin-Estimated', 'WASHHANDBASIN', ceramic)
    bed_type = kit.add_simple_type(ifc, 'IfcFurnitureType', 'FUR-Bed-Estimated', 'BED', timber)

    def confidence(element, source):
        kit.add_pset(ifc, element, 'Pset_ModelConfidence', {
            'Confidence': 'APPROXIMATE', 'Basis': source,
            'Limitation': 'Drawing topology; horizontal scale, fit-out and dimensions estimated; not as-built'})

    def area(poly):
        return abs(sum(x*poly[(i+1)%len(poly)][1]-poly[(i+1)%len(poly)][0]*y
                       for i,(x,y) in enumerate(poly)))/2

    def space(name, level, poly, source):
        if sum(x*poly[(i+1)%len(poly)][1]-poly[(i+1)%len(poly)][0]*y
               for i,(x,y) in enumerate(poly)) < 0:
            poly = list(reversed(poly))
        obj = m.plate('IfcSpace', space_type, name, source, None,
                      (0.,0.,levels[level]), poly, 2.91)
        kit.aggregate(ifc, [obj], m.storeys[level])
        kit.edit(ifc, obj, CompositionType='ELEMENT', LongName=name)
        confidence(obj, source)
        kit.add_qto(ifc, obj, 'Qto_SpaceBaseQuantities', {'NetFloorArea': area(poly), 'Height': 2.91})
        return obj

    for level, bay in [('Level 02',4.95), ('Level 04',4.95), ('Level 12',4.95), ('Level 24',8.10)]:
        z = levels[level]
        source = 'User supplied floor plan ' + level + '; indicative reconstruction'
        divisions = [stair_edge(z)+6.5]
        # Absorb a narrow remainder into the last bay; a sliver cannot host
        # the entrance, bathroom and its door without crossing the party wall.
        while divisions[-1]+bay < 0.:
            divisions.append(divisions[-1]+bay)
        divisions.append(4.)
        space('Plan Central Corridor '+level, level,
              [(divisions[0],-29.575),(4.,-29.575),(4.,-26.425),(divisions[0],-26.425)],source)
        for side, cy, sign in [('South',-29.65,-1),('North',-26.35,1)]:
            def p(x,d):
                return (x,cy+sign*d)
            def wall(label, x, d, w, depth):
                origin = (x,cy+sign*d if sign>0 else cy+sign*d-depth,z)
                obj = m.box('IfcWall',partition_type,label,source,level,origin,(w,depth,2.91),code='wall')
                confidence(obj,source)
                return obj
            def door(host,label,x,d,width):
                y = cy+sign*d
                opening = kit.add_opening(ifc,m.body,host,label+' Opening',
                    kit.placement_matrix((x,y-.16,z)),[(0.,0.),(width,0.),(width,.32),(0.,.32)],2.15)
                obj = m.boxes('IfcDoor',door_type,label,source,level,[
                    ((x+.04,y-.022,z),(width-.08,.044,2.08)),
                    ((x,y-.065,z),(.04,.13,2.15)),
                    ((x+width-.04,y-.065,z),(.04,.13,2.15)),
                    ((x,y-.065,z+2.10),(width,.13,.05))],code='door')
                kit.edit(ifc,obj,OverallWidth=width,OverallHeight=2.15)
                kit.fill_opening(ifc,opening,obj)
                confidence(obj,source)
                return obj
            for j,(a,b) in enumerate(zip(divisions,divisions[1:])):
                label = f'{level} {side} {j+1:02d}'
                host=wall('Plan Corridor '+label,a,-.075,b-a,.15)
                door(host,'Plan Room Door '+label,a+.65,0.,1.)
                # Sample the curved inner facade instead of closing each room
                # with a rectangular box extending through the glazed skin.
                left,right=a+.075,b-.075
                outer=[p(left+(right-left)*k/12,
                         half_depth((left+(right-left)*k/12+45.)/63.)-1.65-.5)
                       for k in range(13)]
                bath_x=a+1.85
                bath_d=2.8
                bedroom=[p(left,.075),p(bath_x-.075,.075),p(bath_x-.075,bath_d+.075),
                         p(right,bath_d+.075),*reversed(outer)]
                bathroom=[p(bath_x+.075,.075),p(right,.075),p(right,bath_d-.075),p(bath_x+.075,bath_d-.075)]
                living=space('Plan Guest Room '+label,level,bedroom,source)
                bath=space('Plan Bathroom '+label,level,bathroom,source)
                group=ifcopenshell.api.run('root.create_entity',ifc,ifc_class='IfcZone',name='Guest Suite '+label)
                ifcopenshell.api.run('group.assign_group',ifc,products=[living,bath],group=group)
                confidence(group,source)
                wall('Plan Bathroom Side '+label,bath_x-.075,.075,.15,bath_d)
                host=wall('Plan Bathroom Front '+label,bath_x,bath_d-.075,b-bath_x,.15)
                door(host,'Plan Bathroom Door '+label,bath_x+.2,bath_d,.8)
                for kind,typ,x,d,size in [('WC',wc_type,b-.85,.45,(.55,.70,.43)),
                                         ('Basin',basin_type,bath_x+.20,1.85,(.65,.48,.85))]:
                    y=cy+sign*d if sign>0 else cy+sign*d-size[1]
                    obj=m.box('IfcSanitaryTerminal',typ,'Plan '+kind+' '+label,
                              'Symbolic sanitary fixture from drawing; simplified estimated envelope',level,
                              (x,y,z),size)
                    confidence(obj,source)
                depth=min(abs(y-cy) for _,y in outer)
                bed_y=cy+sign*(depth-2.3) if sign>0 else cy+sign*(depth-2.3)-2.0
                bed=m.box('IfcFurniture',bed_type,'Plan Bed '+label,
                          'Indicative bed envelope; no manufacturer or exact fit-out asserted',level,
                          ((a+b)/2-.9,bed_y,z),(1.8,2.,.55))
                confidence(bed,source)
            for j,x in enumerate(divisions):
                depth=half_depth((x+45.)/63.)-1.65-.50
                wall(f'Plan Party Wall {level} {side} {j+1}',x-.075,0.,.15,depth)
