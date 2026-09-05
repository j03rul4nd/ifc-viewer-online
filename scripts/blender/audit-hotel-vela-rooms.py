"""Independent geometry checks for the authored room revision, using IFC solids.

blender --background --python-exit-code 1 --python this.py -- before.ifc after.ifc report.json
"""
import sys
import json
from collections import Counter
from pathlib import Path
import ifcopenshell
import ifcopenshell.geom
import ifcopenshell.util.element
import ifcopenshell.util.shape
from shapely.geometry import Polygon, MultiPoint


def main():
    args=sys.argv[sys.argv.index('--')+1:]
    old,new=map(ifcopenshell.open,args[:2])
    settings=ifcopenshell.geom.settings()
    rooms=[s for s in new.by_type('IfcSpace') if (s.Name or '').startswith(('Plan Guest Room','Plan Bathroom','Plan Central Corridor'))]
    polygons={}
    failures=[]
    for s in rooms:
        # Profiles are authored in the common drawing frame, before building rotation.
        solid=s.Representation.Representations[0].Items[0]
        curve=solid.SweptArea.OuterCurve
        xy=(list(curve.Points.CoordList) if curve.is_a('IfcIndexedPolyCurve') else
            [tuple(p.Coordinates)[:2] for p in curve.Points])
        poly=Polygon(xy)
        assert poly.is_valid and poly.area>1, s.Name
        shape=ifcopenshell.geom.create_shape(settings,s)
        assert len(shape.geometry.faces)>0,s.Name
        polygons[s.id()]=poly
        assert s.Decomposes and s.Decomposes[0].RelatingObject.is_a('IfcBuildingStorey')
    for i,a in enumerate(rooms):
        for b in rooms[i+1:]:
            if a.Decomposes[0].RelatingObject != b.Decomposes[0].RelatingObject:
                continue
            overlap=polygons[a.id()].intersection(polygons[b.id()]).area
            if overlap>1e-6:
                failures.append([a.Name,b.Name,overlap])
    assert not failures,failures
    doors=[d for d in new.by_type('IfcDoor') if (d.Name or '').startswith(('Plan Room Door','Plan Bathroom Door'))]
    for d in doors:
        assert len(d.FillsVoids)==1,d.Name
        opening=d.FillsVoids[0].RelatingOpeningElement
        assert len(opening.VoidsElements)==1,d.Name
        wall=opening.VoidsElements[0].RelatingBuildingElement
        assert wall.is_a('IfcWall'),d.Name
        # IfcOpenShell must actually resolve the boolean opening in the host.
        shape=ifcopenshell.geom.create_shape(settings,wall)
        assert len(shape.geometry.faces)>0,d.Name
        solid=wall.Representation.Representations[0].Items[0]
        curve=solid.SweptArea.OuterCurve
        xy=(list(curve.Points.CoordList) if curve.is_a('IfcIndexedPolyCurve') else
            [tuple(p.Coordinates)[:2] for p in curve.Points])
        gross=Polygon(xy).area*solid.Depth
        expected=gross-d.OverallWidth*.15*d.OverallHeight
        actual=ifcopenshell.util.shape.get_volume(shape.geometry)
        assert abs(actual-expected)<1e-5,(d.Name,actual,expected)
    settings.set(settings.USE_WORLD_COORDS,True)
    fixtures={}
    for fixture in new.by_type('IfcSanitaryTerminal'):
        shape=ifcopenshell.geom.create_shape(settings,fixture)
        coords=shape.geometry.verts
        fixtures[fixture.Name]=MultiPoint([(coords[i],coords[i+1]) for i in range(0,len(coords),3)]).convex_hull
    for name,poly in fixtures.items():
        if name.startswith('Plan WC '):
            other=fixtures[name.replace('Plan WC ','Plan Basin ',1)]
            assert poly.intersection(other).area<1e-6,name
    report={'before':dict(Counter(e.is_a() for e in old.by_type('IfcProduct'))),
            'after':dict(Counter(e.is_a() for e in new.by_type('IfcProduct'))),
            'room_spaces_checked':len(rooms),'interior_doors_with_hosted_openings':len(doors),
            'sanitary_fixtures_checked':len(fixtures),
            'space_overlaps':failures,
            'limits':'Checks reconstructed room solids and IFC relationships, not dimensional agreement with building or code compliance.'}
    Path(args[2]).write_text(json.dumps(report,indent=2),encoding='utf-8')
    print(json.dumps(report,indent=2))


if __name__=='__main__':
    main()
