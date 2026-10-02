// A synthetic IFC shaped like a Civil 3D export: UTM in the vertices of an
// IfcFacetedBrep, every placement at zero, no georeferencing. See
// far-coordinates-ifc.test.ts.

/** A 25 × 20 × 4 m box at (E, N, H), written the way Civil 3D writes it. */
export function civil3dBox(e: number, n: number, h: number, unit: '' | '.MILLI.' = ''): string {
  const k = unit ? 1000 : 1
  const xs = [e, e + 25], ys = [n, n + 20], zs = [h, h + 4]
  const pts: string[] = []
  let id = 100
  const pid: number[][][] = [[[0, 0], [0, 0]], [[0, 0], [0, 0]]]
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let l = 0; l < 2; l++) {
    pid[i][j][l] = id
    pts.push(`#${id++}=IFCCARTESIANPOINT((${(xs[i] * k).toFixed(4)},${(ys[j] * k).toFixed(4)},${(zs[l] * k).toFixed(4)}));`)
  }
  const P = (i: number, j: number, l: number): string => `#${pid[i][j][l]}`
  const quads = [
    [P(0, 0, 0), P(0, 1, 0), P(1, 1, 0), P(1, 0, 0)], [P(0, 0, 1), P(1, 0, 1), P(1, 1, 1), P(0, 1, 1)],
    [P(0, 0, 0), P(1, 0, 0), P(1, 0, 1), P(0, 0, 1)], [P(0, 1, 0), P(0, 1, 1), P(1, 1, 1), P(1, 1, 0)],
    [P(0, 0, 0), P(0, 0, 1), P(0, 1, 1), P(0, 1, 0)], [P(1, 0, 0), P(1, 1, 0), P(1, 1, 1), P(1, 0, 1)],
  ]
  const faces: string[] = []
  const faceIds: string[] = []
  for (const q of quads) {
    faces.push(`#${id}=IFCPOLYLOOP((${q.join(',')}));`)
    faces.push(`#${id + 1}=IFCFACEOUTERBOUND(#${id},.T.);`)
    faces.push(`#${id + 2}=IFCFACE((#${id + 1}));`)
    faceIds.push(`#${id + 2}`)
    id += 3
  }
  return `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView_V2.0]'),'2;1');
FILE_NAME('far.ifc','2026-10-02T00:00:00',(''),(''),'test','test','');
FILE_SCHEMA(('IFC2X3'));
ENDSEC;
DATA;
#1=IFCPROJECT('3ylFndGlsqjsWTIntR$t4A',$,'far',$,$,$,$,(#2),#7);
#2=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#6,$);
#3=IFCCARTESIANPOINT((0.,0.,0.));
#4=IFCDIRECTION((0.,0.,1.));
#5=IFCDIRECTION((1.,0.,0.));
#6=IFCAXIS2PLACEMENT3D(#3,#4,#5);
#7=IFCUNITASSIGNMENT((#8));
#8=IFCSIUNIT(*,.LENGTHUNIT.,${unit || '$'},.METRE.);
#26=IFCBUILDING('12$VoyjBSTQ4iTs$zn2cVy',$,'b',$,$,#28,$,$,.ELEMENT.,$,$,$);
#27=IFCRELAGGREGATES('0O1AmckVD4SRxHGNsFkCOy',$,$,$,#1,(#26));
#28=IFCLOCALPLACEMENT($,#6);
#73=IFCBUILDINGELEMENTPROXY('2qQ1rB7Tl$SG00000007RN',$,'box',$,$,#75,#78,$,$);
#74=IFCRELCONTAINEDINSPATIALSTRUCTURE('3Tcg2iltnBdPZ4IT$4W5b0',$,$,$,(#73),#26);
#75=IFCLOCALPLACEMENT(#28,#6);
#78=IFCPRODUCTDEFINITIONSHAPE($,$,(#79));
#79=IFCSHAPEREPRESENTATION(#2,'Body','Brep',(#80));
#80=IFCFACETEDBREP(#81);
#81=IFCCLOSEDSHELL((${faceIds.join(',')}));
${pts.join('\n')}
${faces.join('\n')}
ENDSEC;
END-ISO-10303-21;
`
}

