"""OSM-derived plan alignment; not surveyed control or a vertical datum."""
import json, math, os
import bonsai_kit as kit

def apply(ifc, site, building, name):
    with open(os.path.join(os.path.dirname(__file__), 'sites', name+'.json')) as stream:
        data=json.load(stream)
    def dms(value):
        degrees=int(value); minutes=int((value-degrees)*60)
        seconds=(value-degrees-minutes/60)*3600
        return (degrees,minutes,int(seconds),round((seconds-int(seconds))*1e6))
    site.RefLongitude=dms(data['lonlat'][0]); site.RefLatitude=dms(data['lonlat'][1])
    a=math.radians(data['rotationDeg'])
    kit.georeference(ifc,data['crs'],'WGS84',*data['center'],0.,math.cos(a),math.sin(a),
        crs_description='WGS 84 / UTM zone 51N; OSM-derived plan alignment',
        vertical_datum='Unsurveyed local ground reference; zero height assumed')
    kit.add_pset(ifc,building,'ReferenceGeoreferencing',{
        'Source':data['source'],'SourceVersion':data['osmVersion'],
        'Attribution':data['license'],'RotationDegrees':float(data['rotationDeg']),
        'Accuracy':'Approximate OSM footprint alignment, not survey control. Ground elevation unverified.',
        'Anchor':'Tower footprint area centroid; engineering origin at tower axis'})
    return data
